"""Soil tests: one path for forms, CSV import and confirmed lab-report extraction."""

from __future__ import annotations

import uuid
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from milh.agronomy.units import ECE_FROM_EC1TO5_CITATION, ece_from_ec1to5
from milh.db import utcnow
from milh.ingestion.validation import IngestError
from milh.models import Block, Farm, SoilProfile, SoilTest
from milh.schemas.soil import SoilTestIn


def block_texture(session: Session, block: Block) -> str | None:
    if block.soil_texture:
        return block.soil_texture
    prof = session.get(SoilProfile, block.farm_id)
    return prof.texture_class if prof else None


def record_soil_test(
    session: Session,
    farm: Farm,
    body: SoilTestIn,
    source: str,
    user_id: uuid.UUID | None,
    confirmed_by: uuid.UUID | None = None,
) -> tuple[SoilTest, bool]:
    """Return (test, created). Idempotent on body.id. Raises IngestError on bad input."""
    if body.id is not None:
        existing = session.get(SoilTest, body.id)
        if existing is not None:
            return existing, False
    block = session.get(Block, body.block_id)
    if block is None or block.farm_id != farm.id:
        raise IngestError("bad_ref", "block is not part of this farm")
    if body.tested_on > utcnow().astimezone(ZoneInfo(farm.timezone)).date():
        raise IngestError("future_timestamp", "tested_on is in the future")
    note = body.note
    ece = body.ece
    if ece is None:
        texture = block_texture(session, block)
        if texture is None:
            raise IngestError("missing_texture", "EC 1:5 needs a soil texture (set it on the block) or give ECe")
        assert body.ec_1to5 is not None
        ece, factor = ece_from_ec1to5(body.ec_1to5, texture)
        conv = f"ECe = EC1:5 x {factor:g} ({texture}); {ECE_FROM_EC1TO5_CITATION}"
        note = f"{note} | {conv}" if note else conv
    test = SoilTest(
        id=body.id or uuid.uuid4(), block_id=block.id, tested_on=body.tested_on, ec_1to5=body.ec_1to5, ece=ece,
        moisture_vwc=body.moisture_vwc, ph=body.ph, lab=body.lab, note=note, source=source,
        submitted_by_user_id=user_id, confirmed_by_user_id=confirmed_by, attachment_path=body.attachment_path,
    )
    session.add(test)
    farm.needs_replan = True
    session.flush()
    return test, True
