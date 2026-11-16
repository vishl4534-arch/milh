"""CSV import for readings and soil tests: dry-run preview with per-row errors, all-or-nothing commit.

Rows get deterministic ids (uuid5 of farm + row content), so importing the same file twice stores
nothing new. Row numbers are spreadsheet line numbers (header = row 1).
"""

from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.db import utcnow
from milh.ingestion.service import Provenance, ingest, validate
from milh.ingestion.soil import block_texture, record_soil_test
from milh.ingestion.validation import IngestError
from milh.models import Block, Farm, Tank, WaterSource
from milh.schemas.readings import ReadingIn
from milh.schemas.soil import SoilTestIn

Kind = Literal["readings", "soil_tests"]
COLUMNS: dict[str, list[str]] = {
    "readings": ["measured_at", "metric", "value", "unit", "block", "source", "tank", "note"],
    "soil_tests": ["tested_on", "block", "ece", "ec_1to5", "ph", "moisture_vwc", "lab", "note"],
}
REQUIRED: dict[str, set[str]] = {
    "readings": {"measured_at", "metric", "value", "unit"},
    "soil_tests": {"tested_on", "block"},
}
MAX_ROWS = 10_000
_NS = uuid.UUID("6f6c8b8e-6d69-6c68-8000-000000000001")


@dataclass
class RowError:
    row: int
    column: str
    message: str


@dataclass
class ImportPreview:
    rows_ok: int = 0
    errors: list[RowError] = field(default_factory=list)
    committed: bool = False
    created: int = 0
    duplicates: int = 0


@dataclass
class _Parsed:
    readings: list[tuple[int, ReadingIn]] = field(default_factory=list)
    soil: list[tuple[int, SoilTestIn]] = field(default_factory=list)


def _row_id(farm_id: uuid.UUID, kind: str, row: dict[str, str]) -> uuid.UUID:
    key = "|".join([str(farm_id), kind, *(row.get(c, "").strip() for c in COLUMNS[kind])])
    return uuid.uuid5(_NS, key)


def _lookup(session: Session, farm_id: uuid.UUID) -> dict[str, dict[str, uuid.UUID]]:
    def names(model: Any) -> dict[str, uuid.UUID]:
        return {o.name.strip().lower(): o.id for o in session.scalars(select(model).where(model.farm_id == farm_id))}

    return {"block": names(Block), "source": names(WaterSource), "tank": names(Tank)}


_CODE_COLUMN = {"unknown_unit": "unit", "out_of_range": "value", "future_timestamp": "measured_at",
                "wrong_farm": "farm"}


def _ref_column(metric: str) -> str:
    if metric == "water_ec":
        return "source"
    if metric.startswith("tank_"):
        return "tank"
    return "block"


def _pydantic_errors(row: int, e: ValidationError) -> list[RowError]:
    out = []
    for err in e.errors(include_url=False):
        col = str(err["loc"][0]) if err["loc"] else "row"
        out.append(RowError(row, col, err["msg"]))
    return out


def parse_csv(
    session: Session, farm_id: uuid.UUID, kind: Kind, text: str, published: bool = False
) -> ImportPreview:
    preview, _ = _parse(session, farm_id, kind, text, published)
    return preview


def _parse(
    session: Session, farm_id: uuid.UUID, kind: Kind, text: str, published: bool
) -> tuple[ImportPreview, _Parsed]:
    preview, parsed = ImportPreview(), _Parsed()
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    header = [h.strip() for h in (reader.fieldnames or [])]
    missing = REQUIRED[kind] - set(header)
    if missing:
        preview.errors.append(RowError(1, "header", f"missing column(s): {', '.join(sorted(missing))}"))
        return preview, parsed
    reader.fieldnames = header
    refs = _lookup(session, farm_id)
    farm = session.get(Farm, farm_id)
    assert farm is not None
    now = utcnow()
    for i, raw in enumerate(reader, start=2):
        if i - 1 > MAX_ROWS:
            preview.errors.append(RowError(i, "row", f"more than {MAX_ROWS} rows; split the file"))
            break
        row = {k: (v or "").strip() for k, v in raw.items() if k}
        if not any(row.values()):
            continue
        errs: list[RowError] = []
        if published and not row.get("note"):
            errs.append(RowError(i, "note", "published data needs a citation in the note column"))
        ids: dict[str, uuid.UUID | None] = {}
        for col in ("block", "source", "tank"):
            name = row.get(col, "")
            if not name:
                ids[col] = None
            elif name.lower() in refs[col]:
                ids[col] = refs[col][name.lower()]
            else:
                errs.append(RowError(i, col, f"no {col} named {name!r} on this farm"))
        if errs:
            preview.errors.extend(errs)
            continue
        rid = _row_id(farm_id, kind, row)
        if kind == "readings":
            try:
                r = ReadingIn(reading_id=rid, farm_id=farm_id, block_id=ids["block"], source_id=ids["source"],
                              tank_id=ids["tank"], metric=row["metric"], value=row["value"], unit=row["unit"],
                              measured_at=row["measured_at"], note=row.get("note") or None)
                validate(session, r, Provenance("csv_import", None, None), now)
            except ValidationError as e:
                preview.errors.extend(_pydantic_errors(i, e))
                continue
            except IngestError as e:
                col = _CODE_COLUMN.get(e.code) or _ref_column(row["metric"])
                preview.errors.append(RowError(i, col, e.message))
                continue
            parsed.readings.append((i, r))
        else:
            try:
                s = SoilTestIn(id=rid, block_id=ids["block"], tested_on=row["tested_on"],
                               ece=row.get("ece") or None, ec_1to5=row.get("ec_1to5") or None,
                               ph=row.get("ph") or None, moisture_vwc=row.get("moisture_vwc") or None,
                               lab=row.get("lab") or None, note=row.get("note") or None)
            except ValidationError as e:
                preview.errors.extend(_pydantic_errors(i, e))
                continue
            block = session.get(Block, s.block_id)
            assert block is not None
            if s.tested_on > now.astimezone(ZoneInfo(farm.timezone)).date():
                preview.errors.append(RowError(i, "tested_on", "date is in the future"))
                continue
            if s.ece is None and block_texture(session, block) is None:
                preview.errors.append(RowError(i, "ec_1to5", "EC 1:5 needs the block's soil texture, or give ece"))
                continue
            parsed.soil.append((i, s))
        preview.rows_ok += 1
    return preview, parsed


def import_csv(
    session: Session, farm_id: uuid.UUID, kind: Kind, text: str, user_id: uuid.UUID | None,
    published: bool = False, dry_run: bool = True,
) -> ImportPreview:
    preview, parsed = _parse(session, farm_id, kind, text, published)
    if dry_run or preview.errors:
        return preview
    if kind == "readings":
        results = ingest(session, [r for _, r in parsed.readings], Provenance("csv_import", user_id, None))
        preview.created = sum(1 for r in results if r.status == "created")
        preview.duplicates = sum(1 for r in results if r.status == "duplicate")
    else:
        farm = session.get(Farm, farm_id)
        assert farm is not None
        for _, s in parsed.soil:
            _t, created = record_soil_test(session, farm, s, "csv_import", user_id)
            preview.created += int(created)
            preview.duplicates += int(not created)
    preview.committed = True
    return preview


def template(kind: Kind) -> str:
    example: dict[str, list[str]] = {
        "readings": [date.today().isoformat() + "T07:00:00+04:00", "water_ec", "3.6", "dS/m", "", "Well", "",
                     "Author/Org (Year). Title. Table X. URL"],
        "soil_tests": [date.today().isoformat(), "Block 1", "2.1", "", "7.9", "", "Lab name",
                       "Author/Org (Year). Title. Table X. URL"],
    }
    return ",".join(COLUMNS[kind]) + "\n" + ",".join(example[kind]) + "\n"
