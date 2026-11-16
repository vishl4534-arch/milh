"""Test-only builders for users, farms and configuration. Never imported by the app."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy.orm import Session

from milh.auth import hash_secret, issue_token
from milh.models import Block, Crop, Farm, FarmMember, Tank, User, WaterSource

TOMATO_ROW = dict(
    key="tomato", names={"en": "Tomato", "ur": "ٹماٹر"}, perennial=False, kc_ini=0.6, kc_mid=1.15,
    kc_end=0.8, stage_days=[30, 40, 45, 30], salt_a=2.5, salt_b=9.9, citation="test",
)


def make_user(
    session: Session,
    role: str = "owner",
    email: str | None = None,
    password: str | None = "pw-123456",
    pin: str | None = None,
    language: str = "en",
) -> User:
    u = User(
        name=f"{role}-{uuid.uuid4().hex[:6]}",
        role=role,
        email=email or f"{uuid.uuid4().hex[:8]}@example.test",
        language=language,
        password_hash=hash_secret(password) if password else None,
        pin_hash=hash_secret(pin) if pin else None,
    )
    session.add(u)
    session.flush()
    return u


def make_farm(session: Session, owner: User, **kw: object) -> Farm:
    f = Farm(owner_id=owner.id, name=str(kw.pop("name", "Test farm")), lat=24.2075, lon=55.7447,
             timezone="Asia/Dubai", settings={}, **kw)  # type: ignore[arg-type]
    session.add(f)
    session.flush()
    session.add(FarmMember(farm_id=f.id, user_id=owner.id))
    session.flush()
    return f


def add_member(session: Session, farm: Farm, user: User) -> None:
    session.add(FarmMember(farm_id=farm.id, user_id=user.id))
    session.flush()


def ensure_tomato(session: Session) -> Crop:
    c = session.get(Crop, "tomato")
    if c is None:
        c = Crop(**TOMATO_ROW)
        session.add(c)
        session.flush()
    return c


def make_config(session: Session, farm: Farm, planted_days_ago: int = 80, today: date | None = None):  # type: ignore[no-untyped-def]
    """Well + desal + one tomato block (1000 m2, 15000 L/h, habit 60 min on well) + one tank."""
    ensure_tomato(session)
    today = today or date(2026, 11, 16)
    well = WaterSource(farm_id=farm.id, name="Well", kind="well", cost_per_m3=0.5,
                       tap_label={"en": "blue tap", "ur": "نیلا نل"}, tap_color="#1d4ed8", position=0)
    desal = WaterSource(farm_id=farm.id, name="Desal", kind="desal", cost_per_m3=5.0,
                        tap_label={"en": "green tap", "ur": "سبز نل"}, tap_color="#15803d", position=1)
    session.add_all([well, desal])
    session.flush()
    block = Block(farm_id=farm.id, name="Block 3", area_m2=1000, crop_key="tomato",
                  planting_date=today - timedelta(days=planted_days_ago), flow_l_per_h=15000,
                  efficiency=0.9, habit_minutes=60, habit_source_id=well.id)
    tank = Tank(farm_id=farm.id, name="Main tank", capacity_l=50000, source_id=well.id)
    session.add_all([block, tank])
    session.flush()
    return well, desal, block, tank


def bearer(user: User, farm_id: uuid.UUID | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_token(user, farm_id, timedelta(hours=1))}"}
