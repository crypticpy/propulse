from __future__ import annotations

import unittest
import sys
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from validate_research_health_incident_delivery import (  # noqa: E402
    MARKER,
    evaluate_episode,
)


class ResearchHealthIncidentDeliveryTests(unittest.TestCase):
    def test_stale_and_recovery_episode_passes_exact_contract(self) -> None:
        issue = {
            "number": 10,
            "state": "closed",
            "html_url": "https://example.test/issues/10",
            "created_at": "2026-07-16T11:20:33Z",
            "closed_at": "2026-07-16T12:20:08Z",
            "body": (
                f"{MARKER}\n"
                "The independent GitHub-hosted monitor detected a NowCast "
                "research-health problem.\n\n"
                "- Reason: M5 heartbeat stale\n"
                "- M5 heartbeat age: 10227 seconds\n"
                "- Failed webhook deliveries this run: 0\n"
                "- Exhausted webhook deliveries: 0\n\n"
                "This issue contains aggregate operational state only. It "
                "excludes callsigns, grids, equipment, user data, secrets, "
                "and private endpoint addresses."
            ),
        }
        comments = [{
            "created_at": "2026-07-16T12:20:08Z",
            "user": {"login": "github-actions[bot]"},
            "body": (
                f"{MARKER}\nA genuine healthy heartbeat was observed again. "
                "Current heartbeat age: 25 seconds. Closing the monitor incident."
            ),
        }]
        stale = {
            "id": 1,
            "conclusion": "failure",
            "event": "workflow_dispatch",
            "html_url": "https://example.test/runs/1",
            "created_at": "2026-07-16T11:20:00Z",
            "updated_at": "2026-07-16T11:21:00Z",
        }
        recovery = {
            "id": 2,
            "conclusion": "success",
            "event": "workflow_dispatch",
            "head_sha": "a" * 40,
            "html_url": "https://example.test/runs/2",
            "created_at": "2026-07-16T12:20:00Z",
            "updated_at": "2026-07-16T12:20:10Z",
        }

        _, gates = evaluate_episode(
            issue=issue,
            comments=comments,
            issues=[issue],
            stale_run=stale,
            recovery_run=recovery,
        )

        self.assertTrue(all(gates.values()))


if __name__ == "__main__":
    unittest.main()
