from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MIGRATION = (
    ROOT
    / "supabase/migrations/20260716003000_propagation_research_participation.sql"
)


class ResearchParticipationMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = re.sub(r"\s+", " ", MIGRATION.read_text(encoding="utf-8").lower())

    def test_adds_explicit_retention_acknowledgement(self) -> None:
        self.assertIn("retention_acknowledged_at timestamptz", self.sql)
        self.assertIn("ml_research_consents_allowed_uses_check", self.sql)
        for allowed_use in (
            "anonymous_quality_metrics",
            "derived_equipment_training",
            "attempt_outcome_training",
            "research_follow_up",
        ):
            self.assertIn(allowed_use, self.sql)

    def test_one_signed_prediction_can_start_only_one_attempt_per_user(self) -> None:
        self.assertIn(
            "unique index if not exists propagation_attempts_prediction_once_idx",
            self.sql,
        )
        self.assertIn("(user_id, prediction_id)", self.sql)
        self.assertIn("where prediction_id is not null", self.sql)

    def test_browser_writes_are_revoked_and_service_role_remains_authoritative(self) -> None:
        for table in (
            "public.propagation_attempts",
            "public.propagation_outcomes",
            "public.ml_research_consents",
        ):
            self.assertRegex(
                self.sql,
                rf"revoke [^;]+ on {re.escape(table)} from anon, authenticated;",
            )
            self.assertRegex(
                self.sql,
                rf"grant [^;]+ on {re.escape(table)} to service_role;",
            )
        self.assertNotIn("propagation_attempts_own_all for all", self.sql)
        self.assertNotIn("propagation_outcomes_own_all for all", self.sql)
        self.assertNotIn("ml_research_consents_own_all for all", self.sql)

    def test_users_retain_read_and_deletion_visibility_without_write_authority(self) -> None:
        for policy in (
            "propagation_attempts_own_read",
            "propagation_attempts_own_delete",
            "propagation_outcomes_own_read",
            "propagation_outcomes_own_delete",
            "ml_research_consents_own_read",
        ):
            self.assertIn(policy, self.sql)
        self.assertGreaterEqual(self.sql.count("(select auth.uid()) = user_id"), 5)


if __name__ == "__main__":
    unittest.main()
