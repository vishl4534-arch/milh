"""Salt clock: trend in well-water salinity -> when the current crop starts losing yield.

- Yield response: Maas & Hoffman (1977) as tabulated in FAO-29 (Ayers & Westcot, 1985), Table 4:
  Yield% = 100 - b (ECe - a).
- ECe ~= 1.5 x ECw: FAO-29 rule of thumb for a 15-20 % leaching fraction.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from milh.agronomy.crops import CropParams

ECE_PER_ECW = 1.5


def yield_pct(ece: float, a: float, b: float) -> float:
    return max(0.0, min(100.0, 100.0 - b * (ece - a)))


@dataclass(frozen=True)
class SaltClock:
    status: Literal["collecting", "ok"]
    n_readings: int
    span_days: int
    slope_per_day: float | None
    residual_sd: float | None  # spread of readings around the trend line (dS/m)
    current_ecw: float | None
    current_yield_pct: float | None
    date_loss_10: date | None  # None if the trend never gets there (flat or falling)
    date_loss_25: date | None
    suggested_crops: list[str]


def _fit(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / sxx
    intercept = my - slope * mx
    resid = [y - (intercept + slope * x) for x, y in zip(xs, ys, strict=True)]
    sd = (sum(r * r for r in resid) / (n - 2)) ** 0.5 if n > 2 else 0.0
    return slope, intercept, sd


def salt_clock(
    readings: list[tuple[date, float]],
    crop: CropParams,
    library: dict[str, CropParams],
    today: date,
    horizon_days: int = 730,
    min_readings: int = 4,
    min_span_days: int = 21,
) -> SaltClock:
    pts = sorted(readings)
    n = len(pts)
    span = (pts[-1][0] - pts[0][0]).days if pts else 0
    if n < min_readings or span < min_span_days:
        return SaltClock("collecting", n, span, None, None, None, None, None, None, [])

    d0 = pts[0][0]
    xs = [float((d - d0).days) for d, _ in pts]
    ys = [ec for _, ec in pts]
    slope, intercept, sd = _fit(xs, ys)

    t_today = float((today - d0).days)
    current = intercept + slope * t_today
    current_yield = yield_pct(ECE_PER_ECW * current, crop.salt_a, crop.salt_b)

    def crossing(loss: float) -> date | None:
        target = (crop.salt_a + loss / crop.salt_b) / ECE_PER_ECW
        if current >= target:
            return today
        if slope <= 0:
            return None
        return d0 + timedelta(days=round((target - intercept) / slope))

    horizon_ece = ECE_PER_ECW * (intercept + slope * (t_today + horizon_days))
    ranked = sorted(
        (
            (yield_pct(horizon_ece, c.salt_a, c.salt_b), key)
            for key, c in library.items()
            if key != crop.key
        ),
        reverse=True,
    )
    suggested = [key for y, key in ranked if y >= 90.0]
    return SaltClock(
        "ok", n, span, slope, sd, current, current_yield, crossing(10.0), crossing(25.0), suggested
    )
