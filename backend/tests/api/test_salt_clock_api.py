from datetime import UTC, datetime

from milh.ingestion.service import Provenance, ingest
from milh.schemas.readings import ReadingIn
from tests.factories import bearer, make_config, make_farm, make_user


def test_old_published_series_is_reported_as_history(client, session) -> None:
    owner = make_user(session)
    farm = make_farm(session, owner)
    well, *_ = make_config(session, farm)
    rows = [(1991, 2.509375), (1993, 3.459375), (2005, 10.3275), (2010, 15.36)]
    ingest(session, [ReadingIn(farm_id=farm.id, source_id=well.id, metric="water_ec", value=v, unit="dS/m",
                               measured_at=datetime(y, 7, 1, tzinfo=UTC), note="test copy of a cited series")
                     for y, v in rows], Provenance("csv_import", owner.id, None))
    session.commit()
    body = client.get(f"/api/v1/farms/{farm.id}/salt-clock?source_id={well.id}", headers=bearer(owner)).json()
    assert body["status"] == "ok"
    assert body["stale"] is True
    assert body["as_of"] == "2010-07-01"
    assert body["data_age_days"] > 365 * 15
