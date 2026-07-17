from __future__ import annotations

import sys
import unittest
from pathlib import Path

import duckdb


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from build_phase2_cohorts import cohort_query  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
