"""Hand-written crop parameters for tests only (never loaded into a running app)."""

from milh.agronomy.crops import CropParams

TOMATO = CropParams("tomato", {"en": "Tomato"}, False, 0.6, 1.15, 0.8, (30, 40, 45, 30), 2.5, 9.9, "test")
DATE_PALM = CropParams("date_palm", {"en": "Date palm"}, True, 0.95, 0.95, 0.95, (0, 0, 0, 0), 4.0, 3.6, "test")
BARLEY = CropParams("barley", {"en": "Barley"}, False, 0.3, 1.15, 0.25, (15, 25, 50, 30), 8.0, 5.0, "test")
