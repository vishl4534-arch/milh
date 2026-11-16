import pytest

from milh.agronomy.units import ECE_FROM_EC1TO5, ece_from_ec1to5, usda_texture


def test_usda_texture_sand() -> None:
    assert usda_texture(92, 4, 4) == "sand"


def test_usda_texture_loam() -> None:
    assert usda_texture(40, 40, 20) == "loam"


def test_usda_texture_loamy_sand() -> None:
    assert usda_texture(82, 12, 6) == "loamy sand"


def test_usda_texture_clay() -> None:
    assert usda_texture(20, 25, 55) == "clay"


def test_ece_uses_texture_factor() -> None:
    ece, factor = ece_from_ec1to5(0.5, "sand")
    assert factor == ECE_FROM_EC1TO5["sand"]
    assert ece == pytest.approx(0.5 * ECE_FROM_EC1TO5["sand"])


def test_ece_unknown_texture() -> None:
    with pytest.raises(KeyError):
        ece_from_ec1to5(0.5, "moon dust")
