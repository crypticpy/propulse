from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from outcome_protocol import OutcomeProtocolError  # noqa: E402
from score_locked_gate import parse_datasets, week_labels  # noqa: E402


class LockedGateScoringTests(unittest.TestCase):
    def test_dataset_inventory_is_exact_and_ordered(self) -> None:
        values = ["2024-12=ml/data/example.parquet"]
        parsed = parse_datasets(values, ["2024-12"])
        self.assertEqual(list(parsed), ["2024-12"])
        with self.assertRaises(OutcomeProtocolError):
            parse_datasets(values, ["2025-01"])

    def test_week_labels_use_iso_calendar(self) -> None:
        values = week_labels(
            np.asarray(["2024-12-30", "2025-01-01", "2025-01-06"])
        )
        self.assertEqual(values.tolist(), ["2025-W01", "2025-W01", "2025-W02"])


if __name__ == "__main__":
    unittest.main()
