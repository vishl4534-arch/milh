from datetime import date
from types import SimpleNamespace

import pytest
from sqlalchemy import select

import milh.ai.gemini as gemini_mod
from milh.ai.gemini import GeminiService, LabReportExtract, LabSample
from milh.models import Reading, SoilTest
from tests.factories import bearer, make_config, make_farm, make_user

EXTRACT = LabReportExtract(tested_on=date(2026, 11, 10), lab="Central Lab",
                           samples=[LabSample(label="Plot B", ece=3.1, ec_1to5=None, ph=8.0, moisture_vwc=None)],
                           water=[])


class FakeGem:
    def extract_lab_report(self, data: bytes, mime_type: str) -> LabReportExtract | None:
        assert data and mime_type == "image/png"
        return EXTRACT


def _setup(session):  # type: ignore[no-untyped-def]
    owner = make_user(session)
    farm = make_farm(session, owner)
    _w, _d, block, _t = make_config(session, farm)
    session.commit()
    return owner, farm, block


def test_extract_preview_saves_no_readings(client, session, monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(gemini_mod, "get_gemini", lambda: FakeGem())
    owner, farm, _block = _setup(session)
    r = client.post(f"/api/v1/farms/{farm.id}/lab-report", files={"file": ("lab.png", b"\x89PNG...", "image/png")},
                    headers=bearer(owner))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["extract"]["samples"][0]["ece"] == 3.1
    assert body["attachment_path"].startswith("uploads/")
    assert session.scalars(select(SoilTest)).all() == [] and session.scalars(select(Reading)).all() == []


def test_confirm_sets_gemini_provenance(client, session) -> None:
    owner, farm, block = _setup(session)
    r = client.post(f"/api/v1/farms/{farm.id}/soil-tests?via=lab_report", json={
        "block_id": str(block.id), "tested_on": "2026-11-10", "ece": 3.1, "ph": 8.0, "lab": "Central Lab",
        "attachment_path": "uploads/x.png"}, headers=bearer(owner))
    assert r.status_code == 201, r.text
    t = session.scalars(select(SoilTest)).one()
    assert t.source == "gemini_extract" and t.confirmed_by_user_id == owner.id and t.attachment_path == "uploads/x.png"


def test_no_gemini_key_503(client, session, monkeypatch) -> None:
    monkeypatch.setattr(gemini_mod, "get_gemini", lambda: None)
    owner, farm, _block = _setup(session)
    r = client.post(f"/api/v1/farms/{farm.id}/lab-report", files={"file": ("lab.png", b"x", "image/png")},
                    headers=bearer(owner))
    assert r.status_code == 503


def test_rejects_other_file_types(client, session, monkeypatch) -> None:
    monkeypatch.setattr(gemini_mod, "get_gemini", lambda: FakeGem())
    owner, farm, _block = _setup(session)
    r = client.post(f"/api/v1/farms/{farm.id}/lab-report", files={"file": ("x.exe", b"MZ", "application/x-msdownload")},
                    headers=bearer(owner))
    assert r.status_code == 415


def test_extract_parses_structured_response() -> None:
    reply = SimpleNamespace(parsed=EXTRACT, text=None)
    models = SimpleNamespace(generate_content=lambda **kw: reply)
    svc = GeminiService(None, "m", client=SimpleNamespace(models=models))
    assert svc.extract_lab_report(b"img", "image/png") == EXTRACT


@pytest.mark.parametrize("fail", [True])
def test_extract_failure_returns_none(fail: bool) -> None:
    def boom(**kw):  # type: ignore[no-untyped-def]
        raise RuntimeError("quota")

    svc = GeminiService(None, "m", client=SimpleNamespace(models=SimpleNamespace(generate_content=boom)))
    assert svc.extract_lab_report(b"img", "image/png") is None
