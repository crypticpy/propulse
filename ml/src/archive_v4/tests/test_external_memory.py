from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import xgboost as xgb


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from external_memory import MetricAccumulator, ParquetDataIter  # noqa: E402


class ExternalMemoryTests(unittest.TestCase):
    def test_data_iter_builds_cpu_external_matrix(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "sample.parquet"
            pq.write_table(
                pa.table({
                    "a": np.arange(100, dtype=np.float32),
                    "b": np.arange(100, dtype=np.float32) % 5,
                    "success_rate": (np.arange(100) % 2).astype(np.float32),
                    "training_weight": np.ones(100, dtype=np.float32),
                }),
                path,
            )
            iterator = ParquetDataIter(
                path,
                ["a", "b"],
                weight_column="training_weight",
                cache_prefix=str(root / "cache"),
                batch_size=20,
            )
            matrix = xgb.ExtMemQuantileDMatrix(iterator, max_bin=16)
            self.assertEqual(matrix.num_row(), 100)
            del matrix, iterator

    def test_streamed_metrics_match_direct_calculation(self) -> None:
        y = np.array([0.0, 1.0, 0.5])
        p = np.array([0.1, 0.8, 0.4])
        w = np.array([1.0, 2.0, 3.0])
        metrics = MetricAccumulator(bins=5)
        metrics.update(y[:2], p[:2], w[:2])
        metrics.update(y[2:], p[2:], w[2:])
        result = metrics.result()
        self.assertAlmostEqual(
            result["weighted_brier"], np.average((y - p) ** 2, weights=w)
        )
        self.assertAlmostEqual(result["weighted_prevalence"], np.average(y, weights=w))


if __name__ == "__main__":
    unittest.main()
