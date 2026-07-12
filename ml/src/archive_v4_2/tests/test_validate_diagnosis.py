from __future__ import annotations

import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from validate_diagnosis import validate  # noqa: E402


def fixture() -> dict:
    months = ["2024-02", "2024-04", "2024-05", "2024-08", "2024-10", "2024-11"]
    month_rows = [
        {
            "key": month,
            "rows": 1,
            "opportunities": 2.0,
            "b2_brier": 0.1,
            "m2_brier": 0.2,
        }
        for month in months
    ]
    return {
        "scope": "observed_2024_paired_diagnosis",
        "outcome_access": {
            "observed_months": months,
            "december_2024_read": False,
            "locked_2025_read": False,
        },
        "inputs": {
            month: {"rows": 1, "sha256_verified_this_run": True} for month in months
        },
        "overall": {
            "all_observed": {
                "opportunities": 12.0,
                "b2_brier": 0.1,
                "m2_brier": 0.2,
            }
        },
        "blend_selection": {"rounded_b2_weight": 0.5},
        "routers": {
            "band": {"choices": {"40m": "b2"}},
            "stable_band_distance": {"choices": {"40m|0-500 km": "m2"}},
        },
        "bootstrap": {
            "test": {"lower_95": -0.1, "median": 0.0, "upper_95": 0.1}
        },
        "slices": {
            "month": month_rows,
            "band": [{"key": "40m"}],
        },
        "compute": {"maximum_rss_gb": 12.0},
    }


class DiagnosisValidationTests(unittest.TestCase):
    def test_valid_fixture_passes_every_check(self) -> None:
        self.assertTrue(all(validate(fixture()).values()))

    def test_locked_outcome_fails(self) -> None:
        value = fixture()
        value["outcome_access"]["locked_2025_read"] = True
        self.assertFalse(validate(value)["locked_2025_closed"])

    def test_aggregate_mismatch_fails(self) -> None:
        value = fixture()
        value["overall"]["all_observed"]["m2_brier"] = 0.3
        self.assertFalse(validate(value)["m2_brier_reconciles"])


if __name__ == "__main__":
    unittest.main()
