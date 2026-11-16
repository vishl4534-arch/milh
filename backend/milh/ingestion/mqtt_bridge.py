"""MQTT -> ingestion bridge: `python -m milh.ingestion.mqtt_bridge`.

Topic:   milh/{farm_id}/{device_id}/{metric}
Payload: {"key": "<device API key>", "value": 61, "unit": "%", "measured_at": "<ISO with offset>",
          "reading_id"?: uuid, "source_id"?: uuid, "tank_id"?: uuid, "block_id"?: uuid, "note"?: str}
Every message goes through the same validation and provenance as the REST API.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any
from urllib.parse import urlparse

from pydantic import ValidationError
from sqlalchemy.orm import Session

from milh.auth import verify_secret
from milh.db import session_factory, utcnow
from milh.ingestion.service import IngestResult, Provenance, ingest
from milh.models import Device
from milh.schemas.readings import ReadingIn

log = logging.getLogger("milh.mqtt")
TOPIC = "milh/+/+/+"


def _reject(code: str, message: str) -> IngestResult:
    return IngestResult(None, "rejected", code, message)


def handle_message(session: Session, topic: str, payload: bytes) -> IngestResult:
    parts = topic.split("/")
    if len(parts) != 4 or parts[0] != "milh":
        return _reject("bad_topic", "topic must be milh/{farm_id}/{device_id}/{metric}")
    try:
        farm_id, device_id = uuid.UUID(parts[1]), uuid.UUID(parts[2])
    except ValueError:
        return _reject("bad_topic", "farm_id and device_id must be UUIDs")
    try:
        data: dict[str, Any] = json.loads(payload)
        if not isinstance(data, dict):
            raise ValueError("payload must be a JSON object")
    except (ValueError, UnicodeDecodeError) as e:
        return _reject("bad_payload", str(e))
    dev = session.get(Device, device_id)
    if dev is None or not verify_secret(str(data.get("key", "")), dev.api_key_hash):
        return _reject("bad_key", "unknown device or wrong key")
    dev.last_seen_at = utcnow()
    try:
        reading = ReadingIn(
            reading_id=data.get("reading_id"), farm_id=farm_id, metric=parts[3], value=data.get("value"),
            unit=data.get("unit", ""), measured_at=data.get("measured_at"), device_id=device_id,
            source_id=data.get("source_id"), tank_id=data.get("tank_id"), block_id=data.get("block_id"),
            note=data.get("note"),
        )
    except ValidationError as e:
        return _reject("bad_payload", e.errors(include_url=False)[0]["msg"])
    result = ingest(session, [reading], Provenance(f"device:{dev.id}", None, dev.id, device_farm_id=dev.farm_id))[0]
    session.commit()
    return result


def main() -> None:  # pragma: no cover - needs a broker
    import paho.mqtt.client as mqtt

    from milh.config import get_settings

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    url = urlparse(get_settings().mqtt_url)
    factory = session_factory()

    def on_message(_c: Any, _u: Any, msg: Any) -> None:
        with factory() as session:
            try:
                r = handle_message(session, msg.topic, msg.payload)
            except Exception:
                log.exception("failed to handle %s", msg.topic)
                session.rollback()
                return
            log.info("%s -> %s %s", msg.topic, r.status, r.error or "")

    from paho.mqtt.enums import CallbackAPIVersion

    client = mqtt.Client(CallbackAPIVersion.VERSION2)
    client.on_connect = lambda c, *_: c.subscribe(TOPIC, qos=1)
    client.on_message = on_message
    client.connect(url.hostname or "localhost", url.port or 1883)
    log.info("MQTT bridge listening on %s", TOPIC)
    client.loop_forever()


if __name__ == "__main__":
    main()
