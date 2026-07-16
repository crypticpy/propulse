from __future__ import annotations

import json
import tempfile
import unittest
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from check_m5_wspr_research_health import (
    build_remote_health_payload,
    directory_bytes,
    evaluate_health,
    load_remote_health_config,
    remote_request_headers,
)


NOW = datetime(2026, 7, 16, 5, 30, tzinfo=timezone.utc)


def healthy_record() -> dict[str, object]:
    return {
        "generated_at": (NOW - timedelta(minutes=10)).isoformat(),
        "status": "healthy",
        "consecutive_failures": 0,
        "last_completed_target_hour": "2026-07-16T04:00:00+00:00",
        "continuous_completed_hours": 2,
    }


def coverage_receipt(*, generated_at: datetime = NOW) -> dict[str, object]:
    return {
        "generated_at": generated_at.isoformat(),
        "scope": "wspr_shadow_aggregate_coverage_and_source_drift",
        "decision": "collecting",
        "operational_status": "healthy",
        "research_only": True,
        "window": {
            "end": "2026-07-16T04:00:00+00:00",
            "expected_hours": 30,
        },
        "execution": {"query_chunk_hours": 24},
        "privacy": {
            "raw_observation_table_read": False,
            "station_identity_written": False,
            "grid4_written": False,
            "equipment_written": False,
            "locked_outcomes_read": False,
        },
        "gates": {
            "window_bound_to_signed_scheduled_receipts": True,
            "database_queries_bounded_to_24_hours": True,
        },
    }


class WsprResearchHealthTests(unittest.TestCase):
    def test_healthy_hour_passes_every_gate(self) -> None:
        gates, observations = evaluate_health(
            healthy_record(),
            now=NOW,
            runtime_bytes=100,
            worker_loaded=True,
            worker_running=False,
            worker_clean_exit=True,
            shadow_summary={
                "operational_status": "healthy",
                "window": {
                    "expected_hours": 1,
                    "completed_hours": 1,
                    "completion_rate": 1.0,
                    "missing_hours": 0,
                },
            },
        )
        self.assertTrue(all(gates.values()))
        self.assertEqual(observations["dynamic_freshness_seconds"], 1800)

    def test_stale_failed_or_missing_job_alerts(self) -> None:
        value = healthy_record()
        value["status"] = "failed"
        value["consecutive_failures"] = 2
        value["generated_at"] = (NOW - timedelta(hours=3)).isoformat()
        value["last_completed_target_hour"] = "2026-07-16T02:00:00+00:00"
        gates, _ = evaluate_health(
            value,
            now=NOW,
            runtime_bytes=3 * 1024**3,
            worker_loaded=False,
            worker_running=False,
            worker_clean_exit=False,
            shadow_summary={
                "operational_status": "alert",
                "window": {
                    "expected_hours": 3,
                    "completed_hours": 1,
                    "completion_rate": 1 / 3,
                    "missing_hours": 2,
                },
            },
        )
        for name in (
            "health_status_healthy",
            "zero_consecutive_failures",
            "health_record_recent",
            "latest_settled_hour_complete",
            "source_freshness_within_limit",
            "runtime_storage_bounded",
            "worker_job_loaded",
            "worker_job_clean_or_running",
            "shadow_rollup_operational_healthy",
        ):
            self.assertFalse(gates[name])

    def test_due_coverage_audit_must_be_current_bounded_and_private(self) -> None:
        summary = {
            "operational_status": "healthy",
            "window": {
                "expected_hours": 30,
                "completed_hours": 30,
                "completion_rate": 1.0,
                "missing_hours": 0,
                "last_completed_target_hour": "2026-07-16T04:00:00+00:00",
            },
        }
        gates, observations = evaluate_health(
            healthy_record(),
            now=NOW,
            runtime_bytes=100,
            worker_loaded=True,
            worker_running=False,
            worker_clean_exit=True,
            shadow_summary=summary,
            coverage_receipt=coverage_receipt(),
        )
        self.assertTrue(all(gates.values()))
        self.assertTrue(observations["coverage_audit_due"])

        stale = coverage_receipt(
            generated_at=NOW - timedelta(hours=15),
        )
        stale["gates"]["database_queries_bounded_to_24_hours"] = False
        gates, _ = evaluate_health(
            healthy_record(),
            now=NOW,
            runtime_bytes=100,
            worker_loaded=True,
            worker_running=False,
            worker_clean_exit=True,
            shadow_summary=summary,
            coverage_receipt=stale,
        )
        self.assertFalse(gates["coverage_audit_current_and_healthy"])

    def test_runtime_size_ignores_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "receipt.json").write_text(json.dumps({"ok": True}))
            (root / "link").symlink_to(root / "receipt.json")
            self.assertEqual(directory_bytes(root), (root / "receipt.json").stat().st_size)

    def test_remote_config_is_owner_only_and_payload_is_identity_free(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.local"
            path.write_text(
                "PROPULSE_RESEARCH_HEALTH_ENDPOINT=https://example.test/health\n"
                "PROPULSE_RESEARCH_HEALTH_INGEST_SECRET=" + "x" * 32 + "\n"
                "PROPULSE_RESEARCH_HEALTH_BYPASS_SECRET=" + "b" * 32 + "\n"
            )
            os.chmod(path, 0o600)
            config = load_remote_health_config(path)
            self.assertIsNotNone(config)
            self.assertEqual(config.endpoint, "https://example.test/health")
            self.assertEqual(config.bypass_secret, "b" * 32)
            headers = remote_request_headers(
                config,
                timestamp="1784181600",
                signature="a" * 64,
            )
            self.assertEqual(headers["X-Vercel-Protection-Bypass"], "b" * 32)
        value = build_remote_health_payload(
            generated_at=NOW.isoformat(),
            decision="healthy",
            alerts=[],
            observations={
                "last_completed_target_hour": "2026-07-16T04:00:00+00:00",
                "continuous_completed_hours": 2,
                "shadow_completed_hours": 2,
                "shadow_required_hours": 720,
                "shadow_missing_hours": 0,
                "dynamic_freshness_seconds": 1800,
            },
        )
        self.assertEqual(value["completedHours"], 2)
        self.assertEqual(len(value["eventId"]), 64)
        forbidden = {"call", "callsign", "grid", "path", "station", "equipment"}
        self.assertTrue(forbidden.isdisjoint(value))


if __name__ == "__main__":
    unittest.main()
