"""Adaptive soil-test interval: 7 days when anything looks risky, 14 days when stable (spec §7.3)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class SoilResult:
    tested_on: date
    ece: float
    ph: float | None


@dataclass(frozen=True)
class SoilRules:
    near_ratio: float = 0.8
    change_ratio: float = 0.15
    ph_min: float = 6.0
    ph_max: float = 8.5
    short_days: int = 7
    long_days: int = 14


def next_soil_test(
    history: list[SoilResult],
    ece_threshold: float,
    flush_since_last: bool,
    rules: SoilRules = SoilRules(),
) -> tuple[date, list[str]]:
    """`history` is in ascending date order and non-empty. Returns (due date, reasons)."""
    if not history:
        raise ValueError("history must contain at least one soil test")
    latest = history[-1]
    reasons: list[str] = []
    if len(history) <= 2:
        reasons.append("first_tests")
    if latest.ece >= rules.near_ratio * ece_threshold:
        reasons.append("near_threshold")
    if len(history) >= 2:
        prev = history[-2].ece
        if prev > 0 and abs(latest.ece - prev) / prev > rules.change_ratio:
            reasons.append("changed")
    if latest.ph is not None and not (rules.ph_min <= latest.ph <= rules.ph_max):
        reasons.append("ph_out_of_range")
    if flush_since_last:
        reasons.append("flush")
    if reasons:
        return latest.tested_on + timedelta(days=rules.short_days), reasons
    return latest.tested_on + timedelta(days=rules.long_days), ["stable"]
