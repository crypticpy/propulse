from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from audit_locked_dataset import dataset_stats, parse_parts, required_features  # noqa: E402
from feature_contract import WSPR_PATH_FEATURES  # noqa: E402
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

    def test_audit_query_binds_parquet_path_and_month(self) -> None:
        target = datetime(2024, 12, 1, 0, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "gate.parquet"
            pq.write_table(
                pa.table(
                    {
                        "target_hour": [target],
                        "split": ["test"],
                        "opportunities": [1.0],
                        "success_rate": [0.5],
                        "weather_available_at": [target],
                    }
                ),
                path,
            )
            stats = dataset_stats(duckdb.connect(), path, "2024-12")
        self.assertEqual(stats[:6], (1, 0, 0, 0, 0, 0))

    def test_required_features_v1_config_excludes_wspr_path_features(self) -> None:
        features = required_features(self.config)
        for name in WSPR_PATH_FEATURES:
            self.assertNotIn(name, features)

    def test_required_features_v2_config_includes_wspr_path_features(self) -> None:
        v2_config = json.loads(
            (ROOT / "ml/config/propagation_v4_2_phase2_scale_v2.json").read_text()
        )
        features = required_features(v2_config)
        for name in WSPR_PATH_FEATURES:
            self.assertIn(name, features)
        # No duplicates even though the frozen order already has similarly
        # named nowcast-only path features.
        self.assertEqual(len(features), len(set(features)))


if __name__ == "__main__":
    unittest.main()
