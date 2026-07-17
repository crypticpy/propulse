from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from phase2_core import (  # noqa: E402
    Phase2Error,
    decide_100m,
    matrix_backend,
    scale_workset,
    select_training_backend,
    select_50m_components,
    select_final_candidate,
    training_months,
    validate_config,
)


CONFIG_PATH = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


class Phase2CoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

    def test_preregistered_config_is_valid(self) -> None:
        validate_config(self.config)

    def test_rolling_training_months_precede_validation(self) -> None:
        for candidate in self.config["candidates"]:
            for fold, definition in self.config["rolling_folds"].items():
                months = training_months(self.config, candidate, fold)
                self.assertTrue(months)
                self.assertTrue(
                    all(month < definition["early_stopping_month"] for month in months)
                )

    def test_a2_is_stable_across_folds(self) -> None:
        values = {
            tuple(training_months(self.config, "A2_long_natural", fold))
            for fold in self.config["rolling_folds"]
        }
        self.assertEqual(len(values), 1)

    def test_locked_month_is_rejected(self) -> None:
        changed = json.loads(json.dumps(self.config))
        changed["rolling_folds"]["F3_2024_07"]["available_2024_training_months"].append(
            "2024-12"
        )
        with self.assertRaises(Phase2Error):
            validate_config(changed)

    @staticmethod
    def row(name: str, *, b2: float, five: float, upper_b2: float, upper_five: float):
        return {
            "candidate": name,
            "evaluation_brier": 0.04 + b2,
            "delta_vs_b2": b2,
            "month_deltas_vs_b2": {"2024-10": b2, "2024-11": b2},
            "bootstrap_upper_vs_b2": upper_b2,
            "delta_vs_5m": five,
            "month_deltas_vs_5m": {"2024-10": five, "2024-11": five},
            "bootstrap_upper_vs_5m": upper_five,
            "relative_gap_to_b2": max(0.0, b2 / 0.04),
        }

    def test_robust_candidates_advance_by_brier(self) -> None:
        rows = [
            self.row("A2_long_natural", b2=-0.0001, five=-0.0002, upper_b2=-1e-5, upper_five=-1e-5),
            self.row("A4_recent_cycle", b2=-0.0003, five=-0.0001, upper_b2=-1e-5, upper_five=-1e-5),
            self.row("A5_recency_weighted", b2=0.0001, five=-0.0002, upper_b2=1e-4, upper_five=-1e-5),
        ]
        self.assertEqual(
            select_50m_components(
                rows, a6_row=None, maximum=2, maximum_relative_gap=0.0025
            ),
            ["A4_recent_cycle", "A2_long_natural"],
        )

    def test_robust_a6_requires_both_components(self) -> None:
        rows = [
            self.row(name, b2=0.0001, five=-0.0001, upper_b2=1e-4, upper_five=-1e-5)
            for name in (
                "A2_long_natural",
                "A4_recent_cycle",
                "A5_recency_weighted",
            )
        ]
        a6 = self.row("A6_recent_recency_blend", b2=-0.0001, five=-0.0001, upper_b2=-1e-5, upper_five=-1e-5)
        self.assertEqual(
            select_50m_components(
                rows, a6_row=a6, maximum=2, maximum_relative_gap=0.0025
            ),
            ["A4_recent_cycle", "A5_recency_weighted"],
        )

    def test_100m_requires_every_gate(self) -> None:
        row = {
            "relative_improvement_20m_to_50m": 0.011,
            "residual_supports_variance_or_rare_regime": True,
            "beats_b2_consistently": True,
            "compute_fits": True,
            "inference_compatible": True,
            "december_2024_read": False,
        }
        self.assertEqual(decide_100m(row, 0.01), (True, []))
        row["beats_b2_consistently"] = False
        approved, reasons = decide_100m(row, 0.01)
        self.assertFalse(approved)
        self.assertIn("50M candidate does not beat B2 consistently", reasons)

    def test_20m_workset_contains_all_candidates_and_folds(self) -> None:
        candidates, folds = scale_workset(self.config, 20_000_000)
        self.assertEqual(len(candidates), 3)
        self.assertEqual(len(folds), 3)
        self.assertEqual(
            matrix_backend(self.config, 20_000_000), "external_memory_quantile"
        )

    def test_50m_backend_must_be_frozen(self) -> None:
        self.assertEqual(
            matrix_backend(self.config, 50_000_000),
            "streamed_in_memory_quantile",
        )
        changed = json.loads(json.dumps(self.config))
        changed["compute"]["apple_silicon"]["backend_benchmark"][
            "fifty_million_backend"
        ] = "pending_benchmark"
        with self.assertRaises(Phase2Error):
            matrix_backend(changed, 50_000_000)

    def test_50m_workset_uses_only_frozen_selection_and_final_fold(self) -> None:
        evaluation = {
            "scale": 20_000_000,
            "december_2024_read": False,
            "locked_2025_read": False,
            "selection": {
                "advance_to_50m": ["A4_recent_cycle", "A5_recency_weighted"]
            },
        }
        candidates, folds = scale_workset(self.config, 50_000_000, evaluation)
        self.assertEqual(candidates, ("A4_recent_cycle", "A5_recency_weighted"))
        self.assertEqual(folds, (self.config["final_fold"],))

    def test_50m_workset_rejects_missing_or_oversized_selection(self) -> None:
        with self.assertRaises(Phase2Error):
            scale_workset(self.config, 50_000_000, None)
        evaluation = {
            "scale": 20_000_000,
            "selection": {"advance_to_50m": list(self.config["candidates"])},
        }
        with self.assertRaises(Phase2Error):
            scale_workset(self.config, 50_000_000, evaluation)

    def test_streamed_backend_requires_every_gate(self) -> None:
        common = {
            "candidate": "A4_recent_cycle",
            "fold": "F3_2024_07",
            "scale": 20_000_000,
            "inputs": {"cohort": "a", "validation": "b"},
            "parameters": {"eta": 0.04},
            "boost_rounds": 50,
            "final_validation_logloss": 0.2,
            "december_2024_read": False,
            "locked_2025_read": False,
        }
        external = {
            **common,
            "backend": "external_memory_quantile",
            "total_seconds": 30,
            "peak_rss_gb": 10,
        }
        in_memory = {
            **common,
            "backend": "streamed_in_memory_quantile",
            "total_seconds": 10,
            "peak_rss_gb": 10,
        }
        policy = self.config["compute"]["apple_silicon"]["backend_benchmark"]
        decision = select_training_backend(external, in_memory, policy, 2)
        self.assertEqual(decision["selected_backend"], "streamed_in_memory_quantile")
        in_memory["peak_rss_gb"] = 20
        decision = select_training_backend(external, in_memory, policy, 2)
        self.assertEqual(decision["selected_backend"], "external_memory_quantile")

    def test_final_selection_prefers_robust_b2_win(self) -> None:
        robust = self.row(
            "A4_recent_cycle",
            b2=-0.0001,
            five=-0.0002,
            upper_b2=-1e-5,
            upper_five=-1e-5,
        )
        robust.update(
            {
                "delta_vs_20m": -0.0002,
                "month_deltas_vs_20m": {"2024-10": -0.0002, "2024-11": -0.0002},
                "bootstrap_upper_vs_20m": -1e-5,
            }
        )
        learning = self.row(
            "A5_recency_weighted",
            b2=0.00001,
            five=-0.0003,
            upper_b2=1e-5,
            upper_five=-1e-5,
        )
        learning.update(
            {
                "delta_vs_20m": -0.0003,
                "month_deltas_vs_20m": {"2024-10": -0.0003, "2024-11": -0.0003},
                "bootstrap_upper_vs_20m": -1e-5,
            }
        )
        selected = select_final_candidate([learning, robust], 0.0025)
        self.assertEqual(selected["candidate"], "A4_recent_cycle")
        self.assertEqual(selected["basis"], "robust_b2_win")

    def test_final_selection_stops_without_eligible_candidate(self) -> None:
        row = self.row(
            "A2_long_natural",
            b2=0.001,
            five=0.001,
            upper_b2=0.001,
            upper_five=0.001,
        )
        row.update(
            {
                "delta_vs_20m": 0.001,
                "month_deltas_vs_20m": {"2024-10": 0.001, "2024-11": 0.001},
                "bootstrap_upper_vs_20m": 0.001,
            }
        )
        self.assertIsNone(select_final_candidate([row], 0.0025))


if __name__ == "__main__":
    unittest.main()
