from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MIGRATION = (
    ROOT
    / "supabase/migrations/20260716001000_propagation_research_health.sql"
)
RUNNER = ROOT / "ml/service/run_m5_research_health_migration.sh"


class ResearchHealthMigrationTests(unittest.TestCase):
    def test_private_health_and_retryable_outbox_contract(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")
        for table in (
            "public.propagation_research_health",
            "public.propagation_research_alert_outbox",
        ):
            self.assertIn(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY", sql)
            self.assertIn(f"REVOKE ALL ON {table}", sql)
        self.assertIn("record_propagation_research_health", sql)
        self.assertIn("SECURITY DEFINER", sql)
        self.assertIn("pg_advisory_xact_lock", sql)
        self.assertIn("p_reported_at <= previous_reported_at", sql)
        self.assertIn("WHERE delivered_at IS NULL", sql)
        self.assertNotIn("GRANT SELECT ON public.propagation_research_health TO anon", sql)
        self.assertNotIn(
            "GRANT SELECT ON public.propagation_research_health TO authenticated",
            sql,
        )

    def test_runner_defaults_to_dry_run_and_requires_apply_acknowledgement(self) -> None:
        runner = RUNNER.read_text(encoding="utf-8")
        self.assertIn('MODE="${1:---dry-run}"', runner)
        self.assertIn("--acknowledge-private-migration", runner)
        self.assertIn('export PGPASSWORD="${SUPABASE_DB_PASSWORD}"', runner)
        self.assertIn("unset SUPABASE_DB_PASSWORD", runner)
        self.assertNotIn("--password", runner)


if __name__ == "__main__":
    unittest.main()
