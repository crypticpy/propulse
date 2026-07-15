from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from generate_phase2_report import (  # noqa: E402
    ensure_open_scope,
    selection_by_name,
    training_rows,
    variant,
)


class Phase2ReportTests(unittest.TestCase):
    def test_candidate_variant_matches_scoring_schema(self) -> None:
        self.assertEqual(variant("A4_recent_cycle"), "A4_recent_cycle:calibrated")
        self.assertEqual(variant("A6_recent_recency_blend"), "A6_recent_recency_blend")

    def test_closed_scope_is_rejected(self) -> None:
        ensure_open_scope(
            {"december_2024_read": False, "locked_2025_read": False}, "open"
        )
        with self.assertRaises(RuntimeError):
            ensure_open_scope(
                {"december_2024_read": True, "locked_2025_read": False},
                "closed",
            )

    def test_selection_lookup_is_stable(self) -> None:
        value = {"selection": {"rows": [{"candidate": "A4", "score": 1}]}}
        self.assertEqual(selection_by_name(value)["A4"]["score"], 1)

    def test_training_rows_use_frozen_thread_fallback_for_legacy_fold(self) -> None:
        training = {
            "candidates": {
                "A4_recent_cycle": {
                    "F1_2024_02": {
                        "early_stopping_month": "2024-02",
                        "best_iteration": 100,
                        "best_score": 0.2,
                        "seconds": 3600,
                        "peak_rss_gb": 10,
                        "training_mode": "external_memory_quantile",
                    },
                    "F3_2024_07": {
                        "early_stopping_month": "2024-07",
                        "best_iteration": 200,
                        "best_score": 0.1,
                        "seconds": 1800,
                        "peak_rss_gb": 20,
                        "training_mode": "streamed_in_memory_quantile",
                        "execution": {"xgboost_threads": 9},
                    },
                }
            }
        }

        rows = training_rows(20_000_000, training, 14)

        self.assertEqual([row["xgboost_threads"] for row in rows], [14, 9])
        self.assertEqual(
            [row["thread_evidence"] for row in rows],
            ["frozen default training contract", "per-fold execution telemetry"],
        )


if __name__ == "__main__":
    unittest.main()
