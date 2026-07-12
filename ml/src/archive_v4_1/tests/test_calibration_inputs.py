from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq


V41 = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(V41))

from calibration_inputs import feature_order_sha256, parquet_summary  # noqa: E402
from materialize_calibration_predictions import (  # noqa: E402
    audit_distance_groups,
    materialize_month,
)
from protocol import sha256  # noqa: E402


class DummyModel:
    def inplace_predict(
        self,
        matrix: np.ndarray,
        *,
        iteration_range: tuple[int, int],
    ) -> np.ndarray:
        self.iteration_range = iteration_range
        return np.clip(matrix[:, 0], 0, 1).astype(np.float32)


class CalibrationInputTests(unittest.TestCase):
    def test_parquet_summary_uses_metadata_without_outcome_aggregation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "part-000.parquet"
            pq.write_table(
                pa.table(
                    {
                        "target_hour": pa.array(
                            [
                                datetime(2024, 4, 1, tzinfo=timezone.utc),
                                datetime(2024, 4, 30, 23, tzinfo=timezone.utc),
                            ]
                        ),
                        "success_rate": [0.0, 1.0],
                    }
                ),
                path,
            )
            summary = parquet_summary(path)

        self.assertEqual(summary.month, "2024-04")
        self.assertEqual(summary.rows, 2)
        self.assertTrue(summary.schema_sha256)

    def test_parquet_summary_rejects_cross_month_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "part-000.parquet"
            pq.write_table(
                pa.table(
                    {
                        "target_hour": pa.array(
                            [
                                datetime(2024, 4, 30, 23, tzinfo=timezone.utc),
                                datetime(2024, 5, 1, tzinfo=timezone.utc),
                            ]
                        )
                    }
                ),
                path,
            )
            with self.assertRaisesRegex(ValueError, "crosses month boundary"):
                parquet_summary(path)

    def test_audit_distance_groups_match_frozen_boundaries(self) -> None:
        groups = audit_distance_groups(
            np.array(
                [
                    0,
                    499.9,
                    500,
                    1499.9,
                    1500,
                    2999.9,
                    3000,
                    5999.9,
                    6000,
                    9999.9,
                    10000,
                ]
            )
        )
        np.testing.assert_array_equal(
            groups,
            [
                "0-500km",
                "0-500km",
                "500-1500km",
                "500-1500km",
                "1500-3000km",
                "1500-3000km",
                "3000-6000km",
                "3000-6000km",
                "6000-10000km",
                "6000-10000km",
                "10000-25000km",
            ],
        )

    def test_feature_order_hash_is_order_sensitive(self) -> None:
        self.assertNotEqual(
            feature_order_sha256(["a", "b"]),
            feature_order_sha256(["b", "a"]),
        )

    def test_materialize_month_writes_success_only_after_audit(self) -> None:
        root = V41.parents[2]
        with tempfile.TemporaryDirectory(prefix=".v41-test-", dir=root) as directory:
            temporary = Path(directory)
            source = temporary / "input.parquet"
            pq.write_table(
                pa.table(
                    {
                        "target_hour": pa.array(
                            [
                                datetime(2024, 2, 1, tzinfo=timezone.utc),
                                datetime(2024, 2, 2, tzinfo=timezone.utc),
                            ]
                        ),
                        "band": ["20m", "40m"],
                        "dist_km": [250.0, 2_500.0],
                        "success_rate": [0.0, 0.5],
                        "opportunities": [2.0, 4.0],
                        "feature": [0.2, 0.8],
                    }
                ),
                source,
            )
            entry = {
                "path": source.relative_to(root).as_posix(),
                "bytes": source.stat().st_size,
                "sha256": sha256(source),
                "rows": 2,
            }
            output = temporary / "output"
            manifest = materialize_month(
                "2024-02",
                entry,
                output,
                DummyModel(),
                0,
                ["feature"],
                128,
                100,
                force=False,
            )

            self.assertEqual(manifest["rows"], 2)
            self.assertEqual(manifest["weighted_opportunities"], 6.0)
            self.assertTrue((output / "month=2024-02" / "_SUCCESS").exists())
            self.assertFalse((output / "month=2024-02" / ".part-000.tmp.parquet").exists())


if __name__ == "__main__":
    unittest.main()
