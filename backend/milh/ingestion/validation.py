"""Per-metric unit conversion and plausibility ranges, shared by every injection channel."""

from __future__ import annotations

from dataclasses import dataclass

from milh.schemas.readings import Metric, ReadingIn


class IngestError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class MetricRule:
    unit: str
    min: float
    max: float
    conversions: dict[str, float]  # lower-cased unit -> multiply by this to get `unit`


_EC = {"ds/m": 1.0, "ms/cm": 1.0, "µs/cm": 0.001, "us/cm": 0.001, "μs/cm": 0.001}
_VOL = {"l": 1.0, "m3": 1000.0, "m³": 1000.0}

METRIC_RULES: dict[Metric, MetricRule] = {
    "water_ec": MetricRule("dS/m", 0, 60, _EC),
    "tank_level_pct": MetricRule("%", 0, 100, {"%": 1.0}),
    "tank_volume_l": MetricRule("L", 0, 10_000_000, _VOL),
    "well_depth_m": MetricRule("m", 0, 500, {"m": 1.0}),
    "soil_ec_1to5": MetricRule("dS/m", 0, 50, _EC),
    "soil_ece": MetricRule("dS/m", 0, 100, _EC),
    "soil_moisture_vwc": MetricRule("%", 0, 100, {"%": 1.0}),
    "soil_ph": MetricRule("pH", 0, 14, {"ph": 1.0}),
    "flow_l": MetricRule("L", 0, 10_000_000, _VOL),
    "irrigation_minutes": MetricRule("min", 0, 1440, {"min": 1.0}),
}


def normalise(r: ReadingIn) -> tuple[float, str]:
    rule = METRIC_RULES[r.metric]
    factor = rule.conversions.get(r.unit.strip().lower())
    if factor is None:
        allowed = ", ".join(sorted(rule.conversions))
        raise IngestError("unknown_unit", f"unit {r.unit!r} not accepted for {r.metric}; use one of {allowed}")
    value = r.value * factor
    if not (rule.min <= value <= rule.max):
        raise IngestError("out_of_range", f"{r.metric} {value:g} {rule.unit} outside {rule.min:g}-{rule.max:g}")
    return value, rule.unit
