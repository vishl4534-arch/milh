from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException

from milh.config import get_settings
from milh.demo import read_accounts

router = APIRouter(prefix="/api/v1", tags=["demo"])


@router.get("/demo/accounts")
def demo_accounts() -> dict[str, Any]:
    """Ready-made demo sign-ins for the login pages. Only in DEMO_MODE, and only after `seed-demo`."""
    s = get_settings()
    accounts = read_accounts(s.demo_accounts_file) if s.demo_mode else None
    if accounts is None:
        raise HTTPException(404, "Demo accounts are not enabled")
    return asdict(accounts)
