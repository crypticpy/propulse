from __future__ import annotations

import sys
import unittest
from pathlib import Path

import duckdb


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

import run_paths  # noqa: E402
from validate_live_transform_parity import (  # noqa: E402
    field_recency_parity,
    percent_rank_column,
)


def small_fixture_connection() -> duckdb.DuckDBPyConnection:
    """A tiny opportunity-cells-shaped fixture, independent of real bronze data."""
    connection = duckdb.connect()
    connection.execute(
        """
        CREATE TABLE cells (
          target_hour TIMESTAMPTZ, band VARCHAR,
          tx_grid4 VARCHAR, rx_grid4 VARCHAR, power_bin_dbm DOUBLE,
          positive_rows INTEGER, sampled_rows INTEGER
        )
        """
    )
    hour = "2024-10-01T01:00:00Z"
    rows = [
        # IO field hears three tx fields -> exposure 3 for each heard pair.
        (hour, "20m", "EM10", "IO91", 37, 2, 5),
        (hour, "20m", "FN31", "IO91", 37, 1, 4),
        (hour, "20m", "JN18", "IO91", 37, 1, 1),
        # JN field hears one tx field -> exposure 1, recency_rate 1.0.
        (hour, "20m", "EM10", "JN18", 37, 1, 2),
        # A different band in the same hour ranks independently.
        (hour, "40m", "EM10", "IO91", 37, 1, 1),
    ]
    connection.executemany("INSERT INTO cells VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
    return connection


class PercentRankColumnTests(unittest.TestCase):
    def test_empty_and_singleton_partitions_score_zero(self) -> None:
        self.assertEqual(percent_rank_column([]), [])
        self.assertEqual(percent_rank_column([5.0]), [0.0])

    def test_ties_share_the_lower_rank(self) -> None:
        self.assertEqual(
            percent_rank_column([1.0, 1.0, 2.0, 3.0]),
            [0.0, 0.0, 2 / 3, 1.0],
        )

    def test_matches_hand_worked_example(self) -> None:
        # Same partition as test_live_opportunity_transform.py's 20m/hour
        # field-recency fixture: three pairs tied at 1/3, two pairs tied at
        # 1.0 -> percent_rank is 0.0 and (5-1-1)/(5-1) = 0.75 respectively.
        values = [1 / 3, 1 / 3, 1 / 3, 1.0, 1.0]
        self.assertEqual(
            percent_rank_column(values),
            [0.0, 0.0, 0.0, 0.75, 0.75],
        )


class FieldRecencyParityTests(unittest.TestCase):
    def test_duckdb_recency_quantile_matches_python_recomputation(self) -> None:
        connection = small_fixture_connection()
        result = field_recency_parity(connection, source_relation="cells")

        self.assertTrue(result["exact"])
        self.assertEqual(result["mismatched_recency_quantiles"], 0)
        self.assertGreater(result["rows"], 0)

    def test_mismatch_counting_flags_a_wrong_quantile(self) -> None:
        # Exercise the comparison logic directly: a wrong quantile against a
        # correct Python recomputation must be counted as a mismatch, not
        # silently accepted.
        recomputed = percent_rank_column([1 / 3, 1 / 3, 1 / 3, 1.0, 1.0])
        stored = [0.0, 0.0, 0.0, 0.5, 0.75]  # wrong: index 3 should be 0.75
        mismatches = sum(
            1
            for actual, expected in zip(recomputed, stored)
            if abs(actual - expected) > 1e-9
        )
        self.assertEqual(mismatches, 1)


class TransformParityPathTests(unittest.TestCase):
    def test_run_paths_transform_parity_path_is_used_as_the_default_output(
        self,
    ) -> None:
        config = {"run_id": "propagation_v4_2_phase2_scale"}
        self.assertEqual(
            run_paths.transform_parity_path(config),
            run_paths.results_dir(config)
            / "live_feature_pipeline/transform_parity.json",
        )


if __name__ == "__main__":
    unittest.main()
