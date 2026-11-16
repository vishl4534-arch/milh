import json
from pathlib import Path

import httpx
import pytest
import respx

from milh.sources.soilgrids import SOILGRIDS_URL, SoilUnavailable, parse_soilgrids, refresh_soil_profile
from tests.factories import make_farm, make_user

FIXTURE = json.loads((Path(__file__).parents[1] / "fixtures" / "soilgrids_shape.json").read_text())


def test_parse_soilgrids_depth_weighted() -> None:
    p = parse_soilgrids(FIXTURE)
    assert p["clay_pct"] == pytest.approx(6.3333, abs=1e-3)
    assert p["sand_pct"] == pytest.approx(87.3333, abs=1e-3)
    assert p["silt_pct"] == pytest.approx(6.3333, abs=1e-3)
    assert p["ph"] == pytest.approx(8.0667, abs=1e-3)
    assert p["texture_class"] == "loamy sand"


def test_parse_missing_layer_raises() -> None:
    broken = {"properties": {"layers": [FIXTURE["properties"]["layers"][0]]}}
    with pytest.raises(SoilUnavailable):
        parse_soilgrids(broken)


@respx.mock
def test_refresh_upserts_profile(session) -> None:
    respx.get(SOILGRIDS_URL).mock(return_value=httpx.Response(200, json=FIXTURE))
    farm = make_farm(session, make_user(session))
    with httpx.Client() as http:
        first = refresh_soil_profile(session, farm, http)
        second = refresh_soil_profile(session, farm, http)
    assert first.farm_id == second.farm_id == farm.id
    assert second.texture_class == "loamy sand" and second.source == "api:soilgrids"


@respx.mock
def test_refresh_timeout_raises(session) -> None:
    respx.get(SOILGRIDS_URL).mock(side_effect=httpx.ConnectTimeout("down"))
    farm = make_farm(session, make_user(session))
    with httpx.Client() as http, pytest.raises(SoilUnavailable):
        refresh_soil_profile(session, farm, http)
