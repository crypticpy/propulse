from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MIGRATION = (
    ROOT
    / "supabase/migrations/20260716012000_research_health_hardening.sql"
)


class ResearchHealthHardeningMigrationTests(unittest.TestCase):
    def test_constraints_and_leased_claim_contract_are_present(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")

        self.assertIn("propagation_research_alert_names_valid", sql)
        self.assertIn("BETWEEN 0 AND 100000", sql)
        self.assertIn("BETWEEN 0 AND 604800", sql)
        self.assertIn("FOR UPDATE SKIP LOCKED", sql)
        self.assertIn("claim_propagation_research_alerts", sql)
        self.assertIn("complete_propagation_research_alert_attempt", sql)
        self.assertIn("lease_token = p_lease_token", sql)
        self.assertNotIn("ON CONFLICT (event_id) DO NOTHING", sql)

    def test_claim_and_completion_functions_are_service_role_only(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")

        for function in (
            "claim_propagation_research_alerts",
            "complete_propagation_research_alert_attempt",
        ):
            self.assertIn(f"REVOKE ALL ON FUNCTION public.{function}", sql)
        self.assertGreaterEqual(sql.count("FROM PUBLIC, anon, authenticated"), 5)
        self.assertGreaterEqual(sql.count("TO service_role"), 5)


if __name__ == "__main__":
    unittest.main()
