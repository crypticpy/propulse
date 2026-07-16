from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MIGRATION = (
    ROOT
    / "supabase/migrations/20260716002000_propagation_research_health_monitor.sql"
)
WORKFLOW = ROOT / ".github/workflows/research-health-monitor.yml"


class ResearchHealthMonitorMigrationTests(unittest.TestCase):
    def test_monitor_preserves_source_time_and_is_service_role_only(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("monitor_propagation_research_health", sql)
        self.assertIn("SECURITY DEFINER", sql)
        self.assertIn("SET search_path = ''", sql)
        self.assertIn("pg_advisory_xact_lock", sql)
        self.assertIn("previous_decision IS DISTINCT FROM 'alert'", sql)
        self.assertIn("ARRAY['health_record_recent']", sql)
        self.assertNotIn("SET reported_at =", sql)
        self.assertIn(
            ") FROM PUBLIC, anon, authenticated;",
            sql,
        )
        self.assertIn(") TO service_role;", sql)

    def test_external_workflow_is_private_and_inside_stale_boundary(self) -> None:
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn('cron: "17,47 * * * *"', workflow)
        self.assertIn("feat/archive-multimonth-v3", workflow)
        self.assertIn("PROPULSE_RESEARCH_HEALTH_MONITOR_SECRET", workflow)
        self.assertIn("Authorization: Bearer", workflow)
        self.assertIn("X-Vercel-Protection-Bypass", workflow)
        self.assertIn('(.heartbeatStale == false)', workflow)
        self.assertIn("--retry-max-time 90", workflow)
        self.assertIn("timeout-minutes: 3", workflow)


if __name__ == "__main__":
    unittest.main()
