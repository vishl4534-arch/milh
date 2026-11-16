"""Shared fixtures.

Tests run on SQLite by default (a fresh in-memory DB per test). Set TEST_DATABASE_URL to run on
Postgres (CI does); then each test runs inside a transaction that is rolled back.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

# Tests never use real services or the developer's keys in backend/.env: environment variables win over
# the .env file, so blanking them here keeps every test offline, free and repeatable.
for _key in ("GEMINI_API_KEY", "GROQ_API_KEY", "ELEVENLABS_API_KEY"):
    os.environ[_key] = ""
os.environ["ELEVENLABS_VOICE_IDS"] = "{}"
os.environ["JWT_SECRET"] = "test-only-secret-0123456789-0123456789-abcdef"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.engine import Engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from milh.db import get_session  # noqa: E402
from milh.models import Base  # noqa: E402

PG_URL = os.environ.get("TEST_DATABASE_URL")


def _sqlite_engine() -> Engine:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _rec):  # type: ignore[no-untyped-def]
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    return engine


@pytest.fixture(scope="session")
def pg_engine() -> Iterator[Engine | None]:
    if not PG_URL:
        yield None
        return
    engine = create_engine(PG_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session(pg_engine: Engine | None) -> Iterator[Session]:
    if pg_engine is None:
        engine = _sqlite_engine()
        with Session(engine, expire_on_commit=False) as s:
            yield s
        engine.dispose()
        return
    conn = pg_engine.connect()
    trans = conn.begin()
    s = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    yield s
    s.close()
    trans.rollback()
    conn.close()


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    from milh.main import app

    def _override() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
