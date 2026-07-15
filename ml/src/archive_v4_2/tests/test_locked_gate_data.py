from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from audit_locked_dataset import parse_parts  # noqa: E402
from outcome_protocol import OutcomeProtocolError  # noqa: E402
from prepare_locked_gate import scoped_config  # noqa: E402


class LockedGateDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(
            (ROOT / "ml/config/propagation_v4_2_phase2_scale.json").read_text()
        )

    def test_scoped_config_has_test_only_split(self) -> None:
        value = scoped_config(self.config, "december", ["2024-12"])
        self.assertEqual(value["train"]["months"], [])
        self.assertEqual(value["validation"]["months"], [])
        self.assertEqual(value["test"]["months"], ["2024-12"])
        self.assertEqual(value["archive_namespace"], "archive_v4_2_december")
        self.assertEqual(value["compute"]["duckdb_threads"], 18)

    def test_audit_parts_require_exact_order(self) -> None:
        parsed = parse_parts(
            ["2025-01=ml/data/one.parquet", "2025-04=ml/data/two.parquet"],
            ["2025-01", "2025-04"],
        )
        self.assertEqual(list(parsed), ["2025-01", "2025-04"])
        with self.assertRaises(OutcomeProtocolError):
            parse_parts(
                ["2025-04=ml/data/two.parquet", "2025-01=ml/data/one.parquet"],
                ["2025-01", "2025-04"],
            )


if __name__ == "__main__":
    unittest.main()
