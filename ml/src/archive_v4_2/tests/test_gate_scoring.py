from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from gate_scoring import (  # noqa: E402
    decide_archive,
    decide_december,
    paired_day_bootstrap,
)


def row(key: str, brier: float, opportunities: float = 2_000_000) -> dict:
    return {
        "key": key,
        "opportunities": opportunities,
        "weighted_brier": brier,
        "rows": 20_000,
    }


def model_metric(brier: float, months: list[str]) -> dict:
    days = [row(f"{months[0]}-{day:02d}", brier) for day in range(1, 9)]
    month_rows = [row(month, brier, 16_000_000) for month in months]
    return {
        "overall": {
            "weighted_brier": brier,
            "expected_calibration_error": 0.01,
            "bins": [
                {
                    "lower": 0.5,
                    "mean_prediction": 0.6,
                    "observed_rate": 0.59,
                }
            ],
        },
        "slices": {
            "day": days,
            "month": month_rows,
            "week": [row("week-1", brier, 16_000_000)],
            "band": [row("20m", brier, 16_000_000)],
            "distance": [
                row("0-500 km", brier, 4_000_000),
                row("500-1500 km", brier, 4_000_000),
                row("1500-3000 km", brier, 4_000_000),
            ],
        },
    }


def phase3() -> dict:
    names = (
        "bundle_checksum_and_schema",
        "offline_service_parity",
        "bounded_probabilities",
        "fresh_selects_nowcast",
        "stale_selects_physics_with_provenance",
        "stale_reduces_confidence",
        "missing_feature_is_explicit",
        "frontend_response_contract",
        "public_manifest_privacy",
        "single_latency",
        "batch_latency",
        "memory_budget",
        "bundle_size",
        "locked_scopes_remain_closed",
    )
    return {"gates": {name: True for name in names}, "passed": True}


class GateScoringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(
            (ROOT / "ml/config/propagation_v4_2_phase2_scale.json").read_text()
        )
        cls.config["phase4"]["bootstrap_repetitions"] = 200
        cls.config["phase5"]["bootstrap_repetitions"] = 200

    def test_paired_bootstrap_rejects_inventory_mismatch(self) -> None:
        with self.assertRaises(ValueError):
            paired_day_bootstrap(
                [row("a", 0.04), row("b", 0.04)],
                [row("a", 0.05), row("c", 0.05)],
                seed=1,
                repetitions=10,
            )

    def test_december_passes_clear_synthetic_win(self) -> None:
        decision = decide_december(
            {
                "candidate": model_metric(0.04, ["2024-12"]),
                "B2_frozen_v3": model_metric(0.05, ["2024-12"]),
            },
            phase3(),
            {"passed": True},
            self.config,
            locked_2025_read=False,
        )
        self.assertTrue(decision["passed"], decision["failed_gates"])

    def test_december_fails_if_archive_was_read(self) -> None:
        decision = decide_december(
            {
                "candidate": model_metric(0.04, ["2024-12"]),
                "B2_frozen_v3": model_metric(0.05, ["2024-12"]),
            },
            phase3(),
            {"passed": True},
            self.config,
            locked_2025_read=True,
        )
        self.assertIn("G1_integrity_and_scope", decision["failed_gates"])

    def test_archive_requires_three_month_wins(self) -> None:
        months = self.config["phase5"]["locked_months"]
        candidate = model_metric(0.04, months)
        baseline = model_metric(0.05, months)
        decision = decide_archive(
            {"candidate": candidate, "B2_frozen_v3": baseline},
            phase3(),
            {"passed": True},
            self.config,
            prospective_read=False,
        )
        self.assertTrue(decision["passed"], decision["failed_gates"])


if __name__ == "__main__":
    unittest.main()
