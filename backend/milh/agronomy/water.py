"""Crop water need and salt leaching.

- Crop ET: FAO-56 (Allen et al., 1998), ETc = ET0 x Kc.
- Leaching requirement: FAO-29 (Ayers & Westcot, 1985), LR = ECw / (5 ECe_t - ECw).
"""

from __future__ import annotations


def crop_et_mm(et0_mm: float, kc: float) -> float:
    return et0_mm * kc


def effective_rain_mm(rain_mm: float, threshold_mm: float = 5.0) -> float:
    """Light rain on hot sand evaporates before reaching roots; below the threshold it counts as 0."""
    return 0.0 if rain_mm < threshold_mm else rain_mm


def net_irrigation_mm(etc_mm: float, eff_rain_mm: float, extra_mm: float = 0.0) -> float:
    return max(0.0, etc_mm - eff_rain_mm) + extra_mm


def leaching_requirement(ecw: float, ece_threshold: float) -> float | None:
    """Fraction of applied water that must drain below roots. None when the water is too salty
    for any amount of leaching to keep the root zone under the crop threshold."""
    if ecw <= 0:
        return 0.0
    denom = 5.0 * ece_threshold - ecw
    if denom <= 0:
        return None
    return ecw / denom


MIN_LF = 0.05  # below this the steady-state relation is not meaningful; treat as "almost no leaching"


def leaching_fraction(applied_l: float, need_mm: float, area_m2: float, efficiency: float) -> float:
    """Share of the water that reaches the soil and drains below the roots, given what was applied.

    Infiltrated = applied x efficiency; the crop uses `need_mm`; the rest drains. Clamped to [MIN_LF, 0.95].
    """
    infiltrated_mm = applied_l * efficiency / area_m2 if area_m2 > 0 else 0.0
    if infiltrated_mm <= 0:
        return MIN_LF
    return max(MIN_LF, min(0.95, 1.0 - need_mm / infiltrated_mm))


def ece_from_lf(ecw: float, lf: float) -> float:
    """Root-zone salinity a leaching fraction produces: the FAO-29 LR equation solved for ECe,
    ECe = ECw (1 + LF) / (5 LF). At LF = 0.15 this gives ~1.5 x ECw, the FAO-29 rule of thumb."""
    lf = max(MIN_LF, lf)
    return ecw * (1.0 + lf) / (5.0 * lf)


def gross_volume_l(net_mm: float, area_m2: float, lr: float, efficiency: float) -> float:
    """1 mm over 1 m2 is 1 litre."""
    return net_mm * area_m2 / ((1.0 - lr) * efficiency)


def runtime_minutes(volume_l: float, flow_l_per_h: float) -> float:
    return volume_l / flow_l_per_h * 60.0
