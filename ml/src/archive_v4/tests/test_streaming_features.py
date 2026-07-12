from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import polars as pl


V3 = Path(__file__).resolve().parents[2] / "archive_v3"
sys.path.insert(0, str(V3))

from build_features import add_polars_features  # noqa: E402


class StreamingFeatureTests(unittest.TestCase):
    def test_writes_one_resumable_partition_per_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = []
            for index in range(2):
                source = root / f"source-{index}.parquet"
                pl.DataFrame(
                    {
                        "target_hour": [datetime(2024, index + 1, 1, tzinfo=timezone.utc)],
                        "opportunities": [2.0],
                        "split": ["train"],
                        "tx_lat": [30.0],
                        "tx_lon": [-97.0],
                        "rx_lat": [51.5],
                        "rx_lon": [-0.1],
                        "mid_lat": [42.0],
                        "mid_lon": [-48.0],
                        "band": ["20m"],
                    }
                ).write_parquet(source)
                sources.append(source)
            destination = root / "dataset.parquet"

            add_polars_features(sources, destination, "hf")
            first_mtimes = {
                path.name: path.stat().st_mtime_ns
                for path in destination.glob("*.parquet")
            }
            add_polars_features(sources, destination, "hf")

            self.assertTrue((destination / "_SUCCESS").exists())
            self.assertEqual(len(first_mtimes), 2)
            self.assertEqual(
                pl.scan_parquet(destination / "*.parquet").select(pl.len()).collect().item(),
                2,
            )
            self.assertEqual(
                first_mtimes,
                {
                    path.name: path.stat().st_mtime_ns
                    for path in destination.glob("*.parquet")
                },
            )


if __name__ == "__main__":
    unittest.main()
