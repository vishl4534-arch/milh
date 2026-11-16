"""Soil texture classes and EC(1:5) -> ECe conversion.

ECe conversion multipliers: Slavich, P.G. & Petterson, G.H. (1993). Estimating the electrical
conductivity of saturated paste extracts from 1:5 soil:water suspensions and texture.
Australian Journal of Soil Research 31(1), 73-81. Values as reproduced in NSW DPI salinity
guidance (texture group -> multiplier). VERIFY against the paper before relying on them.
"""

from __future__ import annotations

ECE_FROM_EC1TO5_CITATION = (
    "Slavich & Petterson (1993) Aust. J. Soil Res. 31:73-81 — texture multipliers for EC1:5 to ECe"
)

# USDA texture class -> multiplier (grouped as in Slavich & Petterson's texture groups).
ECE_FROM_EC1TO5: dict[str, float] = {
    "sand": 23.0,
    "loamy sand": 23.0,
    "sandy loam": 14.0,
    "loam": 9.5,
    "silt loam": 9.5,
    "silt": 9.5,
    "sandy clay loam": 9.5,
    "clay loam": 8.6,
    "silty clay loam": 8.6,
    "sandy clay": 8.6,
    "silty clay": 8.6,
    "clay": 7.5,
}


def usda_texture(sand: float, silt: float, clay: float) -> str:
    """USDA soil texture triangle (percent sand, silt, clay)."""
    if silt + 1.5 * clay < 15:
        return "sand"
    if silt + 2 * clay < 30:
        return "loamy sand"
    if (7 <= clay < 20 and sand > 52) or (clay < 7 and silt < 50):
        return "sandy loam"
    if 7 <= clay < 27 and 28 <= silt < 50 and sand <= 52:
        return "loam"
    if (silt >= 50 and 12 <= clay < 27) or (50 <= silt < 80 and clay < 12):
        return "silt loam"
    if silt >= 80 and clay < 12:
        return "silt"
    if 20 <= clay < 35 and silt < 28 and sand > 45:
        return "sandy clay loam"
    if 27 <= clay < 40 and 20 < sand <= 45:
        return "clay loam"
    if 27 <= clay < 40 and sand <= 20:
        return "silty clay loam"
    if clay >= 35 and sand > 45:
        return "sandy clay"
    if clay >= 40 and silt >= 40:
        return "silty clay"
    return "clay"


def ece_from_ec1to5(ec: float, texture: str) -> tuple[float, float]:
    """Return (ECe, multiplier used). Raises KeyError for an unknown texture class."""
    factor = ECE_FROM_EC1TO5[texture]
    return ec * factor, factor
