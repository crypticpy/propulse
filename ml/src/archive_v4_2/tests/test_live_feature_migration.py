from __future__ import annotations

import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
ROOT = MODULE.parents[2]
sys.path.insert(0, str(MODULE))

from validate_live_feature_migration import (  # noqa: E402
    PENDING_PREREQUISITES,
    current_project_pooler_url,
)
from verify_live_feature_deployment import EXPECTED_VERSIONS  # noqa: E402


class LiveFeatureMigrationTests(unittest.TestCase):
    def test_pooler_username_is_derived_from_current_project(self) -> None:
        values = {
            "VITE_SUPABASE_URL": "https://abcdefghijklmnopqrst.supabase.co",
        }
        cached = (
            "postgresql://postgres.staleprojectref@"
            "aws-0-us-east-1.pooler.supabase.com:5432/postgres"
        )

        resolved = current_project_pooler_url(values, cached)

        self.assertEqual(
            resolved,
            "postgresql://postgres.abcdefghijklmnopqrst@"
            "aws-0-us-east-1.pooler.supabase.com:5432/postgres",
        )
        self.assertNotIn("staleprojectref", resolved)

    def test_non_supabase_pooler_is_rejected(self) -> None:
        with self.assertRaises(RuntimeError):
            current_project_pooler_url(
                {"VITE_SUPABASE_URL": "https://abcdefghijklmnopqrst.supabase.co"},
                "postgresql://postgres@example.com:5432/postgres",
            )

    def test_pending_prerequisites_are_ordered_and_precede_wspr_store(self) -> None:
        names = [path.name for path in PENDING_PREREQUISITES]
        self.assertEqual(names, sorted(names))
        self.assertTrue(all(name < "20260716000000_wspr_live_feature_store.sql" for name in names))

    def test_deployment_ledger_contract_has_six_ordered_versions(self) -> None:
        self.assertEqual(len(EXPECTED_VERSIONS), 6)
        self.assertEqual(EXPECTED_VERSIONS, tuple(sorted(EXPECTED_VERSIONS)))

    def test_finalize_pagination_index_matches_the_keyset_query(self) -> None:
        migration = (
            ROOT
            / "supabase/migrations/20260716011000_wspr_finalize_pagination.sql"
        ).read_text()

        self.assertIn(
            "(source, target_hour, band, id)",
            migration,
        )
        self.assertIn("INCLUDE (received_at)", migration)


if __name__ == "__main__":
    unittest.main()
