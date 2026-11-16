"""ISRIC SoilGrids v2.0: modelled soil texture and pH for the farm's coordinates (no salinity layer).

Docs: https://rest.isric.org/soilgrids/v2.0/docs  Citation: Poggio et al. (2021) SOIL 7, 217-240.
"""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy.orm import Session

from milh.agronomy.units import usda_texture
from milh.db import utcnow
from milh.models import Farm, SoilProfile

SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query"
DEPTHS = ("0-5cm", "5-15cm", "15-30cm")


class SoilUnavailable(Exception):
    pass


def _weighted(layer: dict[str, Any]) -> float:
    d_factor = float(layer["unit_measure"]["d_factor"])
    total = weight = 0.0
    for d in layer["depths"]:
        if d["label"] not in DEPTHS or d["values"].get("mean") is None:
            continue
        thickness = float(d["range"]["bottom_depth"] - d["range"]["top_depth"])
        total += float(d["values"]["mean"]) / d_factor * thickness
        weight += thickness
    if weight == 0:
        raise SoilUnavailable(f"no data for {layer.get('name')}")
    return total / weight


def parse_soilgrids(data: dict[str, Any]) -> dict[str, Any]:
    try:
        layers = {layer["name"]: layer for layer in data["properties"]["layers"]}
        clay, sand, silt = (_weighted(layers[n]) for n in ("clay", "sand", "silt"))
    except (KeyError, TypeError) as e:
        raise SoilUnavailable(f"unexpected SoilGrids response: {e}") from e
    ph = _weighted(layers["phh2o"]) if "phh2o" in layers else None
    return {"clay_pct": clay, "sand_pct": sand, "silt_pct": silt, "ph": ph,
            "texture_class": usda_texture(sand, silt, clay)}


def refresh_soil_profile(session: Session, farm: Farm, http: httpx.Client) -> SoilProfile:
    params: list[tuple[str, str | int | float | bool | None]] = [("lon", farm.lon), ("lat", farm.lat), ("value", "mean")]
    params += [("property", p) for p in ("clay", "sand", "silt", "phh2o")]
    params += [("depth", d) for d in DEPTHS]
    try:
        r = http.get(SOILGRIDS_URL, params=params, timeout=60)
        r.raise_for_status()
        parsed = parse_soilgrids(r.json())
    except (httpx.HTTPError, ValueError) as e:
        raise SoilUnavailable(str(e)) from e
    prof = session.get(SoilProfile, farm.id)
    if prof is None:
        prof = SoilProfile(farm_id=farm.id, **parsed)
        session.add(prof)
    else:
        for k, v in parsed.items():
            setattr(prof, k, v)
    prof.fetched_at = utcnow()
    prof.source = "api:soilgrids"
    session.flush()
    return prof
