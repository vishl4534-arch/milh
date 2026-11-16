"""Owner/worker alerts. (Task 4 stub: creation only; Task 24 adds dedup, rendering, staleness.)"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from milh.models import Alert


def raise_alert(
    session: Session,
    farm_id: uuid.UUID,
    type: str,
    severity: str,
    slots: dict[str, Any],
    subject: str | None = None,
) -> Alert:
    alert = Alert(farm_id=farm_id, type=type, severity=severity, slots=slots, subject=subject, message={})
    session.add(alert)
    session.flush()
    return alert
