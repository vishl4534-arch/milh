"""Next soil-test due date for a block, from its stored test history (spec §7.3)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.agronomy.soil_schedule import SoilResult, SoilRules, next_soil_test
from milh.models import Block, Crop, IrrigationPlan, SoilTest
from milh.schemas.farms import FarmSettings


def soil_rules(s: FarmSettings) -> SoilRules:
    return SoilRules(near_ratio=s.soil_near_ratio, change_ratio=s.soil_change_ratio, ph_min=s.soil_ph_min,
                     ph_max=s.soil_ph_max, short_days=s.soil_short_days, long_days=s.soil_long_days)


def soil_due_for_block(session: Session, block: Block, s: FarmSettings) -> tuple[date, list[str]] | None:
    """None when the block has never been tested (the UI shows 'No test yet')."""
    tests = list(session.scalars(
        select(SoilTest).where(SoilTest.block_id == block.id).order_by(SoilTest.tested_on, SoilTest.created_at)
    ))
    if not tests:
        return None
    crop = session.get(Crop, block.crop_key)
    assert crop is not None
    last = tests[-1].tested_on
    flushed = session.scalars(
        select(IrrigationPlan.id).where(IrrigationPlan.block_id == block.id, IrrigationPlan.flush.is_(True),
                                        IrrigationPlan.day > last)
    ).first() is not None
    history = [SoilResult(t.tested_on, t.ece, t.ph) for t in tests]
    return next_soil_test(history, crop.salt_a, flushed, soil_rules(s))
