"""Turn a BlockPlan's recorded inputs into one plain sentence per language."""

from __future__ import annotations

from milh.announcements.templates import render
from milh.planning.core import BlockPlan


def _num(x: float) -> str:
    return f"{x:g}"


def render_explanation(plan: BlockPlan, crop_name: str, source_names: dict[str, str], lang: str) -> str:
    e = plan.explanation
    if e.get("habit_fallback"):
        reason = render(f"reason_{e['reason']}", lang, {})
        return render("plan_explanation_habit_fallback", lang, {"minutes": plan.minutes, "reason": reason})
    if plan.skip_reason is not None:
        reason = render(f"reason_{plan.skip_reason}", lang, {"rain": _num(e["rain_eff"])})
        return render("plan_explanation_skip", lang, {"crop": crop_name, "reason": reason})
    parts = [
        render("mix_part", lang, {"pct": round(f * 100), "source": source_names.get(sid, sid)})
        for sid, f in plan.fractions.items() if f > 0
    ]
    mix = ", ".join(parts)
    alone = e.get("lr_cheapest_alone")
    if len(parts) > 1 and alone is not None and alone > e["lr"]:
        mix += "; " + render("mix_note", lang, {"lr_alone_pct": round(alone * 100)})
    return render("plan_explanation", lang, {
        "minutes": plan.minutes, "habit_minutes": e["habit_minutes"], "et0": _num(e["et0"]), "crop": crop_name,
        "stage": render(f"stage_{e['stage']}", lang, {}), "kc": _num(round(e["kc"], 2)),
        "ecw": _num(round(e["ecw"], 2)), "lr_pct": round(e["lr"] * 100), "mix": mix,
    })
