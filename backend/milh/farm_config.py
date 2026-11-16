"""Farm settings access, crop library seeding and loading a farm CONFIGURATION file.

A configuration file holds the farm layout (blocks, sources, tanks, costs). It never holds readings:
measured data enters only through ingestion.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from milh.models import Block, Crop, Farm, FarmMember, Tank, User, WaterSource
from milh.schemas.farms import FarmSettings


def get_farm_settings(farm: Farm) -> FarmSettings:
    return FarmSettings(**(farm.settings or {}))


def seed_crops(session: Session, path: Path) -> int:
    rows = json.loads(path.read_text(encoding="utf-8"))
    for r in rows:
        existing = session.get(Crop, r["key"])
        if existing is None:
            session.add(Crop(**r))
        else:
            for k, v in r.items():
                setattr(existing, k, v)
    session.flush()
    return len(rows)


def load_farm_config(session: Session, data: dict[str, Any], owner: User) -> Farm:
    settings = FarmSettings(**data.get("settings", {}))
    farm = Farm(owner_id=owner.id, name=data["name"], lat=data["lat"], lon=data["lon"],
                timezone=data.get("timezone", "Asia/Dubai"), settings=settings.model_dump(),
                example_label=data.get("_label"))
    session.add(farm)
    session.flush()
    session.add(FarmMember(farm_id=farm.id, user_id=owner.id))
    sources: dict[str, WaterSource] = {}
    for i, s in enumerate(data.get("sources", [])):
        ws = WaterSource(farm_id=farm.id, name=s["name"], kind=s["kind"], cost_per_m3=s["cost_per_m3"],
                         declared_ec=s.get("declared_ec"), declared_ec_note=s.get("declared_ec_note"),
                         tap_label=s.get("tap_label", {}), tap_color=s.get("tap_color", "#1d4ed8"),
                         position=s.get("position", i))
        session.add(ws)
        sources[s["key"]] = ws
    session.flush()
    for i, b in enumerate(data.get("blocks", [])):
        if session.get(Crop, b["crop_key"]) is None:
            raise ValueError(f"unknown crop {b['crop_key']!r}; seed the crop library first")
        session.add(Block(farm_id=farm.id, name=b["name"], area_m2=b["area_m2"], crop_key=b["crop_key"],
                          planting_date=date.fromisoformat(b["planting_date"]),
                          irrigation_type=b.get("irrigation_type", "drip"), flow_l_per_h=b["flow_l_per_h"],
                          efficiency=b.get("efficiency", 0.9), habit_minutes=b["habit_minutes"],
                          habit_source_id=sources[b["habit_source"]].id, soil_texture=b.get("soil_texture"),
                          position=b.get("position", i)))
    for t in data.get("tanks", []):
        src = sources.get(t["source"]) if t.get("source") else None
        session.add(Tank(farm_id=farm.id, name=t["name"], capacity_l=t["capacity_l"],
                         source_id=src.id if src else None))
    session.flush()
    return farm
