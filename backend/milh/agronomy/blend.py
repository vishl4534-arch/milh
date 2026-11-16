"""Choose the cheapest mix of water sources that keeps salt leaching within a cap.

Blended salinity uses linear mixing, ECw = sum(f_i * EC_i). Each source runs from its own tap, so
the mix is delivered as minutes per source (see split_minutes).
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

from milh.agronomy.water import gross_volume_l, leaching_requirement


@dataclass(frozen=True)
class SourceOption:
    source_id: str
    ec: float
    cost_per_m3: float


@dataclass(frozen=True)
class BlendResult:
    fractions: dict[str, float]  # sums to 1.0
    ecw: float
    lr: float  # LR used to size the volume (the cap when no mix is feasible)
    gross_l: float
    cost_aed: float
    cap_exceeded: bool
    lr_cheapest_alone: float | None  # LR if only the cheapest source were used


@dataclass(frozen=True)
class _Candidate:
    fractions: dict[str, float]
    ecw: float
    unit_cost: float
    lr: float | None


def _candidates(sources: list[SourceOption], step: float) -> list[_Candidate]:
    ids = [s.source_id for s in sources]
    if len(sources) == 1:
        s = sources[0]
        return [_Candidate({s.source_id: 1.0}, s.ec, s.cost_per_m3, None)]
    n = round(1 / step)
    out: list[_Candidate] = []
    for a, b in combinations(sources, 2):
        for i in range(n + 1):
            f = i / n
            fr = dict.fromkeys(ids, 0.0)
            fr[a.source_id] = 1.0 - f
            fr[b.source_id] = f
            ecw = (1.0 - f) * a.ec + f * b.ec
            unit = (1.0 - f) * a.cost_per_m3 + f * b.cost_per_m3
            out.append(_Candidate(fr, ecw, unit, None))
    return out


def choose_blend(
    sources: list[SourceOption],
    net_mm: float,
    area_m2: float,
    ece_threshold: float,
    efficiency: float = 0.9,
    lr_cap: float = 0.3,
    step: float = 0.05,
) -> BlendResult:
    if not sources:
        raise ValueError("at least one water source is required")

    cheapest = min(sources, key=lambda s: s.cost_per_m3)
    lr_cheapest = leaching_requirement(cheapest.ec, ece_threshold)

    feasible: list[tuple[float, float, float, _Candidate, float]] = []
    all_cands = _candidates(sources, step)
    for c in all_cands:
        lr = leaching_requirement(c.ecw, ece_threshold)
        if lr is None or lr > lr_cap:
            continue
        gross = gross_volume_l(net_mm, area_m2, lr, efficiency)
        cost = gross / 1000.0 * c.unit_cost
        feasible.append((cost, c.unit_cost, c.ecw, c, lr))

    if feasible:
        cost, _unit, _ecw, best, lr = min(feasible, key=lambda t: (t[0], t[1], t[2]))
        gross = gross_volume_l(net_mm, area_m2, lr, efficiency)
        return BlendResult(best.fractions, best.ecw, lr, gross, cost, False, lr_cheapest)

    best = min(all_cands, key=lambda c: (c.ecw, c.unit_cost))
    raw = leaching_requirement(best.ecw, ece_threshold)
    lr = min(raw if raw is not None else lr_cap, lr_cap)
    gross = gross_volume_l(net_mm, area_m2, lr, efficiency)
    return BlendResult(
        best.fractions, best.ecw, lr, gross, gross / 1000.0 * best.unit_cost, True, lr_cheapest
    )


def split_minutes(
    total_minutes: float, fractions: dict[str, float], order: list[str]
) -> list[tuple[str, int]]:
    """Minutes per source tap, in tap order. Sources with no share are omitted; any used source
    gets at least one minute."""
    if total_minutes <= 0:
        return []
    out: list[tuple[str, int]] = []
    for sid in order:
        f = fractions.get(sid, 0.0)
        if f <= 0:
            continue
        out.append((sid, max(1, round(total_minutes * f))))
    return out
