from fastapi.testclient import TestClient

from milh.main import app


def test_health_ok() -> None:
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
