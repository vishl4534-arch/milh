from sqlalchemy import func, select

from milh.ingestion.csv_import import parse_csv
from milh.models import Reading, SoilTest
from tests.factories import bearer, make_config, make_farm, make_user

HEADER = "measured_at,metric,value,unit,block,source,tank,note\n"
GOOD = "2026-11-10T07:00:00+04:00,water_ec,3.4,dS/m,,Well,,EAD (2020) Table 3\n"
GOOD2 = "2026-11-12T07:00:00+04:00,water_ec,3500,µS/cm,,well,,EAD (2020) Table 3\n"
BAD_UNIT = "2026-11-12T07:00:00+04:00,water_ec,3.5,ppm,,Well,,x\n"


def _setup(session):  # type: ignore[no-untyped-def]
    owner = make_user(session)
    farm = make_farm(session, owner)
    make_config(session, farm)
    session.commit()
    return owner, farm


def test_dry_run_reports_row_errors(session) -> None:
    _owner, farm = _setup(session)
    # line 1 = header, so the bad unit on the third line is reported as row 3 (as a spreadsheet shows it)
    prev = parse_csv(session, farm.id, "readings", HEADER + GOOD + BAD_UNIT)
    assert prev.rows_ok == 1
    assert prev.errors[0].row == 3 and prev.errors[0].column == "unit"
    assert session.scalar(select(func.count()).select_from(Reading)) == 0


def test_commit_all_or_nothing(client, session) -> None:
    owner, farm = _setup(session)
    r = client.post(f"/api/v1/farms/{farm.id}/imports?kind=readings&dry_run=false",
                    files={"file": ("r.csv", HEADER + GOOD + BAD_UNIT, "text/csv")}, headers=bearer(owner))
    assert r.status_code == 422
    assert session.scalar(select(func.count()).select_from(Reading)) == 0


def test_commit_and_reimport_is_idempotent(client, session) -> None:
    owner, farm = _setup(session)
    files = {"file": ("r.csv", HEADER + GOOD + GOOD2, "text/csv")}
    first = client.post(f"/api/v1/farms/{farm.id}/imports?kind=readings&dry_run=false", files=files,
                        headers=bearer(owner)).json()
    again = client.post(f"/api/v1/farms/{farm.id}/imports?kind=readings&dry_run=false", files=files,
                        headers=bearer(owner)).json()
    assert first["created"] == 2 and again["created"] == 0 and again["duplicates"] == 2
    assert session.scalar(select(func.count()).select_from(Reading)) == 2


def test_import_provenance_csv_import(client, session) -> None:
    owner, farm = _setup(session)
    client.post(f"/api/v1/farms/{farm.id}/imports?kind=readings&dry_run=false",
                files={"file": ("r.csv", HEADER + GOOD, "text/csv")}, headers=bearer(owner))
    got = session.scalars(select(Reading)).one()
    assert got.source == "csv_import" and got.note == "EAD (2020) Table 3"


def test_published_requires_citation(session) -> None:
    _owner, farm = _setup(session)
    prev = parse_csv(session, farm.id, "readings", HEADER + GOOD.replace("EAD (2020) Table 3", ""), published=True)
    assert prev.errors[0].column == "note" and "citation" in prev.errors[0].message


def test_unknown_block_name_error(session) -> None:
    _owner, farm = _setup(session)
    row = "2026-11-10T07:00:00+04:00,soil_moisture_vwc,12,%,Block 99,,,x\n"
    prev = parse_csv(session, farm.id, "readings", HEADER + row)
    assert prev.errors[0].column == "block"


def test_missing_column_reported(session) -> None:
    _owner, farm = _setup(session)
    prev = parse_csv(session, farm.id, "readings", "measured_at,metric,value\n2026-11-10T07:00:00+04:00,water_ec,3\n")
    assert prev.errors[0].row == 1 and "unit" in prev.errors[0].message


def test_soil_tests_csv(client, session) -> None:
    owner, farm = _setup(session)
    csv = "tested_on,block,ece,ec_1to5,ph,moisture_vwc,lab,note\n2026-11-01,Block 3,2.1,,7.9,,Lab X,Cited survey p.4\n"
    r = client.post(f"/api/v1/farms/{farm.id}/imports?kind=soil_tests&dry_run=false&published=true",
                    files={"file": ("s.csv", csv, "text/csv")}, headers=bearer(owner))
    assert r.status_code == 200, r.text
    t = session.scalars(select(SoilTest)).one()
    assert t.ece == 2.1 and t.source == "csv_import" and t.note == "Cited survey p.4"
