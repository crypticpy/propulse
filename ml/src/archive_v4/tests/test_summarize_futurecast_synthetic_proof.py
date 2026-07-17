from __future__ import annotations

import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from summarize_futurecast_synthetic_proof import compact_metric  # noqa: E402
from summarize_futurecast_synthetic_proof import optional_finite_float  # noqa: E402
from summarize_futurecast_synthetic_proof import strict_boolean_gates  # noqa: E402


class SummarizeFutureCastSyntheticProofTests(unittest.TestCase):
    def test_compact_metric_excludes_bins_and_preserves_release_metrics(self) -> None:
        metric = compact_metric(
            {
                "weighted_opportunities": 1_000_000,
                "weighted_prevalence": 0.2,
                "weighted_brier": 0.04,
                "weighted_log_loss": 0.3,
                "expected_calibration_error": 0.01,
                "calibration_bins": [{"bin": 1}],
            }
        )
        self.assertEqual(len(metric), 5)
        self.assertNotIn("calibration_bins", metric)
        self.assertEqual(metric["weighted_brier"], 0.04)

    def test_optional_finite_float_preserves_missing_supported_band(self) -> None:
        self.assertIsNone(optional_finite_float(None))
        self.assertEqual(optional_finite_float("0.125"), 0.125)
        with self.assertRaisesRegex(RuntimeError, "non-finite"):
            optional_finite_float(float("nan"))

    def test_strict_boolean_gates_rejects_truthy_non_booleans(self) -> None:
        self.assertEqual(
            strict_boolean_gates({"a": True, "b": False}),
            {"a": True, "b": False},
        )
        with self.assertRaisesRegex(RuntimeError, "strict booleans"):
            strict_boolean_gates({"a": 1})
        with self.assertRaisesRegex(RuntimeError, "strict booleans"):
            strict_boolean_gates({})


if __name__ == "__main__":
    unittest.main()
