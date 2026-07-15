from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from generate_gate_report import synthetic_result  # noqa: E402


class GateReportTests(unittest.TestCase):
    def test_synthetic_fixture_is_labeled_and_does_not_open_outcomes(self) -> None:
        config = json.loads(
            (ROOT / "ml/config/propagation_v4_2_phase2_scale.json").read_text()
        )
        config["phase4"]["bootstrap_repetitions"] = 100
        value = synthetic_result(config)
        self.assertTrue(value["synthetic"])
        self.assertFalse(value["december_2024_read"])
        self.assertFalse(value["locked_2025_read"])
        self.assertTrue(value["decision"]["passed"])


if __name__ == "__main__":
    unittest.main()
