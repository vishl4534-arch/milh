"""Demo accounts for judges and testers.

`python -m milh.cli seed-demo --farm <id>` creates (or refreshes) a fixed set of owner-side and worker
accounts plus one farm-tablet key, and writes their sign-in details to DEMO_ACCOUNTS_FILE on the server.
With DEMO_MODE=true the sign-in pages read that file through GET /api/v1/demo/accounts and offer each
account as a one-click fill. The file is git-ignored; without DEMO_MODE the endpoint does not exist.
"""

from __future__ import annotations

import json
import secrets
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.auth import hash_secret, new_api_key
from milh.models import Device, Farm, FarmMember, User


@dataclass
class OwnerAccount:
    name: str
    title: str
    role: str
    email: str
    password: str
    note: str = ""


@dataclass
class WorkerAccount:
    name: str
    title: str
    language: str
    pin: str
    device_key: str
    note: str = ""


@dataclass
class DemoAccounts:
    farm: str
    owners: list[OwnerAccount] = field(default_factory=list)
    workers: list[WorkerAccount] = field(default_factory=list)


OWNERS = [
    ("Aisha Al-Balushi", "Farm owner", "owner", "owner@milh.test", "Owns the Al-Batinah farm: full access"),
    ("Platform admin", "Milh operator", "admin", "admin@milh.test", "Sees every farm, full access"),
]
WORKERS = [
    ("Imran Khan", "Field worker · اردو", "ur", "1234", "Hears the plan in Urdu"),
    ("Ravi Kumar", "Field worker · English", "en", "2580", "Hears the plan in English"),
]
TABLET_NAME = "Demo farm tablet"


def _password() -> str:
    return "milh-" + secrets.token_urlsafe(6)


def seed_demo(session: Session, farm_id: uuid.UUID) -> DemoAccounts:
    farm = session.get(Farm, farm_id)
    if farm is None:
        raise ValueError("unknown farm")
    out = DemoAccounts(farm=farm.name)

    for name, title, role, email, note in OWNERS:
        pw = _password()
        u = session.scalars(select(User).where(User.email == email)).first()
        if u is None:
            u = User(name=name, role=role, email=email, language="en")
            session.add(u)
            session.flush()
        u.name, u.role, u.password_hash = name, role, hash_secret(pw)
        if role == "owner":
            farm.owner_id = u.id
        if session.get(FarmMember, (farm.id, u.id)) is None:
            session.add(FarmMember(farm_id=farm.id, user_id=u.id))
        out.owners.append(OwnerAccount(name, title, role, email, pw, note))

    # Workers sign in on the tablet by PIN, so PINs must be unique per farm: retire any other worker
    # PIN that collides with a demo PIN by moving those workers out of the demo farm's tablet sign-in.
    demo_names = {w[0] for w in WORKERS}
    farm_workers = list(session.scalars(
        select(User).join(FarmMember, FarmMember.user_id == User.id)
        .where(FarmMember.farm_id == farm.id, User.role == "worker")))
    for w in farm_workers:
        if w.name not in demo_names:
            w.pin_hash = None
    for name, _title, lang, pin, _note in WORKERS:
        u = next((w for w in farm_workers if w.name == name), None)
        if u is None:
            u = User(name=name, role="worker", language=lang)
            session.add(u)
            session.flush()
            session.add(FarmMember(farm_id=farm.id, user_id=u.id))
        u.language, u.pin_hash = lang, hash_secret(pin)

    for old in session.scalars(select(Device).where(Device.farm_id == farm.id, Device.name == TABLET_NAME)):
        session.delete(old)
    key, prefix = new_api_key()
    session.add(Device(farm_id=farm.id, name=TABLET_NAME, kind="kiosk", api_key_hash=hash_secret(key),
                       key_prefix=prefix))
    out.workers = [WorkerAccount(name, title, lang, pin, key, note) for name, title, lang, pin, note in WORKERS]
    session.flush()
    return out


def write_accounts(accounts: DemoAccounts, path: Path) -> None:
    path.write_text(json.dumps(asdict(accounts), ensure_ascii=False, indent=2), encoding="utf-8")


def read_accounts(path: Path) -> DemoAccounts | None:
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return DemoAccounts(farm=data.get("farm", ""),
                        owners=[OwnerAccount(**o) for o in data.get("owners", [])],
                        workers=[WorkerAccount(**w) for w in data.get("workers", [])])
