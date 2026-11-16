"""Crop reference parameters and the FAO-56 single crop-coefficient curve.

Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). Crop evapotranspiration. FAO Irrigation
and Drainage Paper 56, Chapter 6 (Kc curve: constant initial, linear development, constant mid,
linear late season).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

Stage = Literal["initial", "development", "mid", "late", "ended", "perennial"]


@dataclass(frozen=True)
class CropParams:
    key: str
    names: dict[str, str]
    perennial: bool
    kc_ini: float
    kc_mid: float
    kc_end: float
    stage_days: tuple[int, int, int, int]  # initial, development, mid, late
    salt_a: float  # FAO-29 salinity threshold, ECe dS/m
    salt_b: float  # FAO-29 yield decrease per dS/m above threshold, %
    citation: str


def crop_from_mapping(row: dict[str, Any]) -> CropParams:
    days = tuple(int(d) for d in row["stage_days"])
    if len(days) != 4:
        raise ValueError("stage_days must have 4 entries")
    return CropParams(
        key=str(row["key"]),
        names=dict(row["names"]),
        perennial=bool(row["perennial"]),
        kc_ini=float(row["kc_ini"]),
        kc_mid=float(row["kc_mid"]),
        kc_end=float(row["kc_end"]),
        stage_days=(days[0], days[1], days[2], days[3]),
        salt_a=float(row["salt_a"]),
        salt_b=float(row["salt_b"]),
        citation=str(row["citation"]),
    )


def crop_from_row(row: Any) -> CropParams:
    """Build from an ORM `Crop` row (anything with the same attribute names)."""
    fields = (
        "key", "names", "perennial", "kc_ini", "kc_mid", "kc_end", "stage_days", "salt_a", "salt_b",
        "citation",
    )
    return crop_from_mapping({f: getattr(row, f) for f in fields})


def load_crop_library(path: Path) -> dict[str, CropParams]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {r["key"]: crop_from_mapping(r) for r in rows}


def kc_for_day(crop: CropParams, days_after_planting: int) -> tuple[float, Stage]:
    if crop.perennial:
        return crop.kc_mid, "perennial"
    ini, dev, mid, late = crop.stage_days
    d = max(0, days_after_planting)
    if d < ini:
        return crop.kc_ini, "initial"
    d -= ini
    if d < dev:
        return crop.kc_ini + (crop.kc_mid - crop.kc_ini) * d / dev, "development"
    d -= dev
    if d < mid:
        return crop.kc_mid, "mid"
    d -= mid
    if d < late:
        return crop.kc_mid + (crop.kc_end - crop.kc_mid) * d / late, "late"
    return crop.kc_end, "ended"
