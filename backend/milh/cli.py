"""Admin command line: `python -m milh.cli <command>`.

Commands load reference data and configuration only. There is deliberately no command that creates
readings: measured data enters through the ingestion API, CSV import or sensors.
"""

from __future__ import annotations

import argparse
import getpass
import json
import sys
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from milh.auth import hash_secret, new_api_key
from milh.db import session_factory
from milh.farm_config import load_farm_config, seed_crops
from milh.models import Device, FarmMember, User

ROOT = Path(__file__).resolve().parents[2]


def _owner(session: Session, email: str) -> User:
    u = session.scalars(select(User).where(User.email == email.lower())).first()
    if u is None:
        sys.exit(f"No user with email {email}")
    return u


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="milh.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sc = sub.add_parser("seed-crops", help="load the FAO crop reference library")
    sc.add_argument("path", nargs="?", default=str(ROOT / "data" / "crops.json"))

    lf = sub.add_parser("load-farm", help="create a farm from a configuration JSON file")
    lf.add_argument("path")
    lf.add_argument("--owner-email", required=True)

    cu = sub.add_parser("create-user")
    cu.add_argument("--role", choices=["owner", "worker", "admin"], required=True)
    cu.add_argument("--name", required=True)
    cu.add_argument("--email")
    cu.add_argument("--password", help="omit to be prompted")
    cu.add_argument("--pin", help="kiosk PIN for workers")
    cu.add_argument("--language", default="en")
    cu.add_argument("--farm", help="farm id to join")

    cd = sub.add_parser("create-device")
    cd.add_argument("--farm", required=True)
    cd.add_argument("--kind", choices=["kiosk", "sensor", "gateway"], required=True)
    cd.add_argument("--name", required=True)

    a = ap.parse_args(argv)
    with session_factory()() as session:
        if a.cmd == "seed-crops":
            n = seed_crops(session, Path(a.path))
            session.commit()
            print(f"Seeded {n} crops")
        elif a.cmd == "load-farm":
            data = json.loads(Path(a.path).read_text(encoding="utf-8"))
            farm = load_farm_config(session, data, _owner(session, a.owner_email))
            session.commit()
            print(f"Created farm {farm.name} id={farm.id}")
        elif a.cmd == "create-user":
            password = a.password
            if a.role != "worker" and not password:
                password = getpass.getpass("Password: ")
            u = User(name=a.name, role=a.role, email=a.email.lower() if a.email else None,
                     language=a.language, password_hash=hash_secret(password) if password else None,
                     pin_hash=hash_secret(a.pin) if a.pin else None)
            session.add(u)
            session.flush()
            if a.farm:
                session.add(FarmMember(farm_id=uuid.UUID(a.farm), user_id=u.id))
            session.commit()
            print(f"Created {a.role} id={u.id}")
        elif a.cmd == "create-device":
            key, prefix = new_api_key()
            dev = Device(farm_id=uuid.UUID(a.farm), name=a.name, kind=a.kind,
                         api_key_hash=hash_secret(key), key_prefix=prefix)
            session.add(dev)
            session.commit()
            print(f"Device id={dev.id}\nAPI key (shown once): {key}")


if __name__ == "__main__":
    main()
