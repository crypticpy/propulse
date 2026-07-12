from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from diagnose_v3_v4 import DiagnosticError, validate_contract  # noqa: E402


class DiagnosticContractTests(unittest.TestCase):
    def setUp(self) -> None:
        root = Path(__file__).resolve().parents[4]
        self.config = json.loads(
            (root / "ml/config/propagation_v4_2.json").read_text(encoding="utf-8")
        )

    def test_exact_observed_months_are_allowed(self) -> None:
        self.assertEqual(
            validate_contract(self.config),
            ["2024-02", "2024-04", "2024-05", "2024-08", "2024-10", "2024-11"],
        )

    def test_december_is_rejected(self) -> None:
        broken = json.loads(json.dumps(self.config))
        broken["diagnosis"]["evaluation_months"][-1] = "2024-12"
        broken["diagnosis"]["inputs"]["2024-12"] = broken["diagnosis"][
            "inputs"
        ].pop("2024-11")
        with self.assertRaises(DiagnosticError):
            validate_contract(broken)

    def test_2025_path_is_rejected(self) -> None:
        broken = json.loads(json.dumps(self.config))
        broken["diagnosis"]["inputs"]["2024-11"]["path"] = (
            "ml/data/processed/2025-01/part.parquet"
        )
        with self.assertRaisesRegex(DiagnosticError, "forbidden outcome path"):
            validate_contract(broken)


if __name__ == "__main__":
    unittest.main()
