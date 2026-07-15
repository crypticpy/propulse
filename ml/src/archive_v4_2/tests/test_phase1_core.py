from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from phase1_core import (  # noqa: E402
    Phase1Error,
    recency_multiplier,
    sampling_threshold,
    select_advancement,
    validate_config,
)


class Phase1CoreTests(unittest.TestCase):
    def setUp(self) -> None:
        root = Path(__file__).resolve().parents[4]
        self.config = json.loads(
            (root / "ml/config/propagation_v4_2_phase1_5m.json").read_text()
        )

    def test_config_keeps_locked_outcomes_closed(self) -> None:
        validate_config(self.config)
        broken = json.loads(json.dumps(self.config))
        broken["data_roles"]["evaluation"].append("2024-12")
        with self.assertRaises(Phase1Error):
            validate_config(broken)

    def test_sampling_threshold_has_requested_margin(self) -> None:
        threshold = sampling_threshold(1_000_000, 50_000, 0.002)
        fraction = threshold / (2**64 - 1)
        self.assertAlmostEqual(fraction, 0.0501, places=8)

    def test_recency_weight_halves_at_half_life(self) -> None:
        reference = datetime(2024, 7, 1, tzinfo=timezone.utc)
        old = datetime(2023, 1, 1, tzinfo=timezone.utc)
        self.assertAlmostEqual(recency_multiplier(reference, reference, 18), 1.0)
        self.assertAlmostEqual(recency_multiplier(old, reference, 18), 0.5, places=2)

    def test_advancement_requires_both_months_to_beat_control(self) -> None:
        rows = [
            {
                "candidate": "A0_v3_control",
                "evaluation_brier": 0.05,
                "month_deltas_vs_a0": {"2024-10": 0, "2024-11": 0},
            },
            {
                "candidate": "A4_recent_cycle",
                "evaluation_brier": 0.04,
                "month_deltas_vs_a0": {"2024-10": -0.01, "2024-11": -0.01},
                "bootstrap_upper_vs_a0": -0.001,
            },
            {
                "candidate": "A5_recency_weighted",
                "evaluation_brier": 0.039,
                "month_deltas_vs_a0": {"2024-10": -0.02, "2024-11": 0.001},
                "bootstrap_upper_vs_a0": -0.001,
            },
        ]
        self.assertEqual(select_advancement(rows), ["A4_recent_cycle"])

    def test_advancement_rejects_a_month_tie(self) -> None:
        rows = [
            {
                "candidate": "A0_v3_control",
                "evaluation_brier": 0.05,
                "month_deltas_vs_a0": {"2024-10": 0, "2024-11": 0},
            },
            {
                "candidate": "A4_recent_cycle",
                "evaluation_brier": 0.04,
                "month_deltas_vs_a0": {"2024-10": -0.01, "2024-11": 0},
                "bootstrap_upper_vs_a0": -0.001,
            },
        ]
        self.assertEqual(select_advancement(rows), [])


if __name__ == "__main__":
    unittest.main()
