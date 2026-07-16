from __future__ import annotations

import hashlib
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from validate_m5_full_outage_recovery import (  # noqa: E402
    evaluate_outage_episode,
    parse_shutdown_history,
)
from validate_research_health_incident_delivery import MARKER  # noqa: E402
from prepare_m5_full_outage_drill import (  # noqa: E402
    ROOT,
    require_outside_repository,
)


UTC = timezone.utc
PRE_SESSION = "11111111-1111-1111-1111-111111111111"
POST_SESSION = "22222222-2222-2222-2222-222222222222"
STATE_SHA = "a" * 64


def fixture() -> dict:
    state = {
        "schema_version": 1,
        "scope": "controlled_full_m5_power_outage_private_state",
        "prepared_at": "2026-07-17T00:00:00+00:00",
        "challenge": "d" * 64,
        "pre_boot_session_uuid": PRE_SESSION,
        "pre_boot_time": "2026-07-16T00:00:00+00:00",
        "pre_health_generated_at": "2026-07-16T23:55:00+00:00",
        "pre_health_evidence_sha256": "b" * 64,
        "workflow_sha256": "c" * 64,
        "stale_seconds": 7200,
        "minimum_power_off_seconds": 9000,
    }
    preparation = {
        "scope": "controlled_full_m5_power_outage_preparation",
        "decision": "armed",
        "evidence": {
            "private_state_sha256": STATE_SHA,
            "challenge_sha256": hashlib.sha256(("d" * 64).encode()).hexdigest(),
            "pre_boot_session_sha256": hashlib.sha256(
                PRE_SESSION.encode()
            ).hexdigest(),
            "pre_health_evidence_sha256": "b" * 64,
            "workflow_sha256": "c" * 64,
            "private_state_path_recorded": False,
        },
        "schema_version": 1,
        "required_operator_action": (
            "shut_down_m5_and_restore_power_after_minimum_interval"
        ),
        "minimum_power_off_seconds": 9000,
        "monitor_stale_seconds": 7200,
        "gates": {"complete": True},
    }
    issue = {
        "number": 12,
        "state": "closed",
        "user": {"login": "github-actions[bot]"},
        "html_url": "https://example.test/issues/12",
        "created_at": "2026-07-17T02:20:30Z",
        "closed_at": "2026-07-17T02:47:20Z",
        "body": (
            f"{MARKER}\n"
            "The independent GitHub-hosted monitor detected a NowCast "
            "research-health problem.\n\n"
            "- Reason: M5 heartbeat stale\n"
            "- M5 heartbeat age: 8400 seconds\n"
            "- Failed webhook deliveries this run: 0\n"
            "- Exhausted webhook deliveries: 0\n\n"
            "This issue contains aggregate operational state only. It excludes "
            "callsigns, grids, equipment, user data, secrets, and private "
            "endpoint addresses."
        ),
    }
    comments = [{
        "created_at": "2026-07-17T02:47:15Z",
        "user": {"login": "github-actions[bot]"},
        "body": (
            f"{MARKER}\nA genuine healthy heartbeat was observed again. "
            "Current heartbeat age: 30 seconds. Closing the monitor incident."
        ),
    }]
    stale_run = {
        "id": 100,
        "conclusion": "failure",
        "event": "schedule",
        "name": "Research health monitor",
        "path": ".github/workflows/research-health-monitor.yml",
        "head_branch": "main",
        "run_attempt": 1,
        "created_at": "2026-07-17T02:20:00Z",
        "updated_at": "2026-07-17T02:21:00Z",
    }
    recovery_run = {
        "id": 101,
        "conclusion": "success",
        "event": "schedule",
        "name": "Research health monitor",
        "path": ".github/workflows/research-health-monitor.yml",
        "head_branch": "main",
        "run_attempt": 1,
        "created_at": "2026-07-17T02:47:00Z",
        "updated_at": "2026-07-17T02:48:00Z",
    }
    return {
        "state": state,
        "state_sha256": STATE_SHA,
        "preparation": preparation,
        "issue": issue,
        "comments": comments,
        "issues": [issue],
        "stale_run": stale_run,
        "recovery_run": recovery_run,
        "stale_workflow_sha256": "c" * 64,
        "recovery_workflow_sha256": "c" * 64,
        "current_boot_session": POST_SESSION,
        "current_boot_time": datetime(2026, 7, 17, 2, 36, tzinfo=UTC),
        "recorded_shutdown_at": datetime(2026, 7, 17, 0, 5, tzinfo=UTC),
        "recorded_reboot_at": datetime(2026, 7, 17, 2, 36, tzinfo=UTC),
        "post_health": {
            "scope": "private_research_health_endpoint_validation",
            "decision": "pass",
            "generated_at": "2026-07-17T02:40:00Z",
            "runtime": {"machine": "arm64"},
            "gates": {"complete": True},
        },
        "now": datetime(2026, 7, 17, 3, 0, tzinfo=UTC),
    }


class M5FullOutageRecoveryTests(unittest.TestCase):
    def test_private_boot_state_cannot_be_placed_in_repository(self) -> None:
        with self.assertRaises(RuntimeError):
            require_outside_repository(ROOT / "private.json", "boot state")

    def test_literal_scheduled_outage_and_recovery_pass(self) -> None:
        result = evaluate_outage_episode(**fixture())

        self.assertEqual(result["decision"], "pass")
        self.assertTrue(all(result["gates"].values()))
        self.assertNotIn(PRE_SESSION, json.dumps(result))
        self.assertNotIn(POST_SESSION, json.dumps(result))

    def test_manual_run_or_same_boot_session_cannot_pass(self) -> None:
        values = fixture()
        values["stale_run"]["event"] = "workflow_dispatch"
        self.assertEqual(evaluate_outage_episode(**values)["decision"], "fail")

        values = fixture()
        values["current_boot_session"] = PRE_SESSION
        self.assertEqual(evaluate_outage_episode(**values)["decision"], "fail")

    def test_incident_must_be_created_while_m5_is_off(self) -> None:
        values = fixture()
        values["issue"]["created_at"] = "2026-07-17T03:20:30Z"
        values["issues"][0]["created_at"] = "2026-07-17T03:20:30Z"
        self.assertEqual(evaluate_outage_episode(**values)["decision"], "fail")

    def test_private_state_and_preparation_must_be_exactly_bound(self) -> None:
        values = fixture()
        values["state"]["minimum_power_off_seconds"] = "9000"
        with self.assertRaises(ValueError):
            evaluate_outage_episode(**values)

        values = fixture()
        values["preparation"]["evidence"]["workflow_sha256"] = "f" * 64
        self.assertEqual(evaluate_outage_episode(**values)["decision"], "fail")

    def test_workflow_drift_and_short_interval_cannot_pass(self) -> None:
        values = fixture()
        values["recovery_workflow_sha256"] = "f" * 64
        self.assertEqual(evaluate_outage_episode(**values)["decision"], "fail")

        values = fixture()
        values["current_boot_time"] = datetime(2026, 7, 17, 2, 35, tzinfo=UTC)
        values["recorded_reboot_at"] = values["current_boot_time"]
        self.assertEqual(evaluate_outage_episode(**values)["decision"], "fail")

    def test_shutdown_must_follow_preparation_within_five_minutes(self) -> None:
        values = fixture()
        values["state"]["prepared_at"] = "2026-07-16T23:00:00+00:00"
        values["state"]["pre_health_generated_at"] = (
            "2026-07-16T22:55:00+00:00"
        )
        values["state"]["pre_boot_time"] = "2026-07-16T22:00:00+00:00"

        result = evaluate_outage_episode(**values)

        self.assertEqual(result["decision"], "fail")
        self.assertFalse(
            result["gates"]["fresh_health_published_before_shutdown"]
        )

    def test_shutdown_history_parser_selects_current_pair(self) -> None:
        shutdown, reboot = parse_shutdown_history(
            "\n".join((
                "reboot time Tue Jul 17 2026 02:35",
                "shutdown time Tue Jul 17 2026 00:05",
                "reboot time Mon Jul 16 2026 08:00",
            )),
            local_timezone=UTC,
        )
        self.assertEqual(shutdown, datetime(2026, 7, 17, 0, 5, tzinfo=UTC))
        self.assertEqual(reboot, datetime(2026, 7, 17, 2, 35, tzinfo=UTC))


if __name__ == "__main__":
    unittest.main()
