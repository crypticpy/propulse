from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import duckdb


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from build_phase2_cohorts import cohort_query, verify_feature_contract  # noqa: E402
from phase2_core import Phase2Error  # noqa: E402


class Phase2CohortTests(unittest.TestCase):
    def test_recency_normalization_uses_scalar_aggregate_without_null_rows(self) -> None:
        selected = """
          SELECT * FROM (VALUES
            (TIMESTAMPTZ '2024-01-01 00:00:00+00', 10.0, 0.1, 3::UBIGINT),
            (TIMESTAMPTZ '2024-02-01 00:00:00+00', 20.0, 0.2, 1::UBIGINT),
            (TIMESTAMPTZ '2024-03-01 00:00:00+00', 30.0, 0.3, 2::UBIGINT)
          ) AS source(target_hour, opportunities, success_rate, v4_2_sample_key)
        """
        query = cohort_query(
            selected,
            recency_reference="2024-07-01T00:00:00Z",
            half_life_months=18.0,
        )

        rows = duckdb.connect().execute(query).fetchall()

        self.assertEqual([row[3] for row in rows], [1, 2, 3])
        self.assertTrue(all(value is not None for row in rows for value in row))
        self.assertAlmostEqual(sum(row[-1] for row in rows), 60.0)
        self.assertNotIn("OVER ()", query)
        self.assertIn("CROSS JOIN normalization", query)


class VerifyFeatureContractTests(unittest.TestCase):
    def test_no_marker_is_silently_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            verify_feature_contract(
                Path(directory), {"run_id": "r", "core_feature_contract": "archive-v4-features-v2"}
            )

    def test_matching_v2_marker_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "_CONTRACT").write_text("archive-v4-features-v2\n", encoding="ascii")
            verify_feature_contract(
                root, {"run_id": "r", "core_feature_contract": "archive-v4-features-v2"}
            )

    def test_v1_marker_under_a_v2_config_raises(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "_CONTRACT").write_text("archive-v4-features-v1\n", encoding="ascii")
            with self.assertRaises(Phase2Error) as raised:
                verify_feature_contract(
                    root, {"run_id": "r", "core_feature_contract": "archive-v4-features-v2"}
                )
            self.assertIn("archive-v4-features-v1", str(raised.exception))
            self.assertIn("archive-v4-features-v2", str(raised.exception))

    def test_v2_marker_under_a_v1_config_raises(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "_CONTRACT").write_text("archive-v4-features-v2\n", encoding="ascii")
            with self.assertRaises(Phase2Error):
                verify_feature_contract(root, {"run_id": "r"})


if __name__ == "__main__":
    unittest.main()
