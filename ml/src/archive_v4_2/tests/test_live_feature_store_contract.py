from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MIGRATION = (
    ROOT
    / "supabase/migrations/20260716000000_wspr_live_feature_store.sql"
)


class LiveFeatureStoreContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text(encoding="utf-8")

    def test_private_tables_have_rls_and_no_public_policy(self):
        for table in (
            "wspr_observations_rolling",
            "wspr_path_hourly_features",
            "wspr_feature_watermarks",
        ):
            self.assertIn(
                f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY",
                self.sql,
            )
            self.assertRegex(
                self.sql,
                rf"REVOKE ALL ON public\.{table} FROM PUBLIC, anon, authenticated",
            )
            self.assertNotRegex(
                self.sql,
                rf"CREATE POLICY[^;]+ON public\.{table}",
            )

    def test_lookup_is_batched_causal_and_service_role_only(self):
        self.assertIn("lookup_wspr_path_lags", self.sql)
        self.assertIn("p_target_grids text[]", self.sql)
        self.assertIn("BETWEEN 1 AND 4096", self.sql)
        for lag in (1, 2, 3, 24):
            unit = "hour" if lag == 1 else "hours"
            self.assertIn(f"interval '{lag} {unit}'", self.sql)
        for lag in (1, 2, 3, 24):
            self.assertIn(
                f"feature.available_at = watermark{lag}.available_at",
                self.sql,
            )
        self.assertIn("watermark.available_at <= p_issue_time", self.sql)
        self.assertIn("watermark.status = 'complete'", self.sql)
        for lag in (1, 2, 3, 24):
            self.assertIn(f"CROSS JOIN watermark{lag}", self.sql)
        self.assertRegex(
            self.sql,
            re.compile(
                r"REVOKE EXECUTE ON FUNCTION public\.lookup_wspr_path_lags\([\s\S]+?\) FROM PUBLIC, anon, authenticated;"
            ),
        )
        self.assertRegex(
            self.sql,
            re.compile(
                r"GRANT EXECUTE ON FUNCTION public\.lookup_wspr_path_lags\([\s\S]+?\) TO service_role;"
            ),
        )

    def test_retention_and_transform_provenance_are_explicit(self):
        self.assertIn("interval '27 hours'", self.sql)
        self.assertIn("transform_version text NOT NULL", self.sql)
        self.assertIn("source_watermark timestamptz NOT NULL", self.sql)
        self.assertIn(
            "status <> 'complete' OR source_watermark = target_hour + interval '1 hour'",
            self.sql,
        )
        self.assertIn("received_at timestamptz NOT NULL", self.sql)
        self.assertIn("observation_key_sha256", self.sql)
        self.assertIn("length(source_id) <= 256", self.sql)
        self.assertIn("length(ingest_version) BETWEEN 1 AND 128", self.sql)


if __name__ == "__main__":
    unittest.main()
