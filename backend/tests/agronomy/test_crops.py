import json
from pathlib import Path

import pytest

from milh.agronomy.crops import kc_for_day, load_crop_library
from tests.agronomy.fixtures import DATE_PALM, TOMATO


@pytest.mark.parametrize(
    "day,kc,stage",
    [
        (0, 0.6, "initial"),
        (29, 0.6, "initial"),
        (50, 0.875, "development"),
        (80, 1.15, "mid"),
        (130, 0.975, "late"),
        (145, 0.8, "ended"),
        (400, 0.8, "ended"),
    ],
)
def test_kc_for_day_tomato(day: int, kc: float, stage: str) -> None:
    got, st = kc_for_day(TOMATO, day)
    assert got == pytest.approx(kc)
    assert st == stage


def test_kc_perennial() -> None:
    assert kc_for_day(DATE_PALM, 9999) == (0.95, "perennial")


def test_load_crop_library(tmp_path: Path) -> None:
    p = tmp_path / "crops.json"
    p.write_text(
        json.dumps(
            [
                {
                    "key": "tomato", "names": {"en": "Tomato"}, "perennial": False, "kc_ini": 0.6,
                    "kc_mid": 1.15, "kc_end": 0.8, "stage_days": [30, 40, 45, 30], "salt_a": 2.5,
                    "salt_b": 9.9, "citation": "x",
                }
            ]
        ),
        encoding="utf-8",
    )
    lib = load_crop_library(p)
    assert lib["tomato"] == TOMATO.__class__(**{**TOMATO.__dict__, "citation": "x"})
