import pytest

from milh.agronomy.water import (
    crop_et_mm,
    effective_rain_mm,
    gross_volume_l,
    leaching_requirement,
    net_irrigation_mm,
    runtime_minutes,
)


def test_crop_et() -> None:
    assert crop_et_mm(6.1, 1.15) == pytest.approx(7.015)


def test_small_rain_ignored() -> None:
    assert effective_rain_mm(3.0) == 0.0


def test_big_rain_counts() -> None:
    assert effective_rain_mm(8.0) == 8.0


def test_net_never_negative() -> None:
    assert net_irrigation_mm(7.015, 8.0) == 0.0


def test_net_adds_extra() -> None:
    assert net_irrigation_mm(7.0, 0.0, extra_mm=20.0) == pytest.approx(27.0)


def test_lr_fao29() -> None:
    assert leaching_requirement(3.6, 2.5) == pytest.approx(0.40449, abs=1e-4)


def test_lr_impossible() -> None:
    assert leaching_requirement(12.5, 2.5) is None


def test_lr_zero_salt() -> None:
    assert leaching_requirement(0.0, 2.5) == 0.0


def test_gross_volume() -> None:
    assert gross_volume_l(7.015, 1000, 0.28866, 0.9) == pytest.approx(10957.3, rel=1e-3)


def test_runtime() -> None:
    assert runtime_minutes(10957.3, 15000) == pytest.approx(43.83, abs=0.01)
