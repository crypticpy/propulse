from __future__ import annotations

import json
import stat
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from check_m5_prospective_capture_health import (
    aggregation_snapshot,
    atomic_write,
    contiguous_healthy_hours,
    fresh_source_cycle,
    pipeline_continuity,
    source_snapshot,
    solar_snapshot,
)
from install_m5_prospective_collector_launchd import (
    HEALTH_LABEL,
    LABEL,
    collector_payload,
    health_payload,
)


NOW = datetime(2026, 7, 16, 12, 45, tzinfo=timezone.utc)


class ProspectiveCollectorTests(unittest.TestCase):
    def test_launchd_payloads_are_secret_free_and_m5_scheduled(self) -> None:
        home = Path("/Users/test")
        env_file = home / "propulse/.env.local"
        collector = collector_payload(
            env_file=env_file,
            stdout_path=home / "collector.out",
            stderr_path=home / "collector.err",
        )
        health = health_payload(
            artifact_root=home / "Library/Application Support/PropulseML",
            env_file=env_file,
            stdout_path=home / "health.out",
            stderr_path=home / "health.err",
        )
        self.assertEqual(collector["Label"], LABEL)
        self.assertTrue(collector["KeepAlive"])
        self.assertTrue(collector["RunAtLoad"])
        self.assertEqual(collector["Umask"], 0o077)
        self.assertEqual(health["Label"], HEALTH_LABEL)
        self.assertEqual(
            health["StartCalendarInterval"],
            [{"Minute": 2}, {"Minute": 17}, {"Minute": 32}, {"Minute": 47}],
        )
        serialized = json.dumps([collector, health])
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", serialized)
        self.assertNotIn("apikey", serialized)

    def test_current_sources_and_watermark_last_aggregates_pass(self) -> None:
        statuses = []
        latest = {}
        for source in ("pskreporter", "rbn", "dxcluster"):
            statuses.append({
                "source": source,
                "status": "ok",
                "last_attempt_at": (NOW - timedelta(minutes=2)).isoformat(),
                "last_success_at": (NOW - timedelta(minutes=2)).isoformat(),
                "rows_last_run": 100,
                "duration_ms": 50,
                "error_message": None,
            })
            latest[source] = {
                "spotted_at": (NOW - timedelta(minutes=3)).isoformat(),
                "ingested_at": (NOW - timedelta(minutes=2)).isoformat(),
                "available_at": (NOW - timedelta(minutes=2)).isoformat(),
            }
        _, source_gates = source_snapshot(NOW, statuses, latest)
        statuses.append({
            "source": "solar",
            "status": "ok",
            "last_attempt_at": (NOW - timedelta(minutes=2)).isoformat(),
            "last_success_at": (NOW - timedelta(minutes=2)).isoformat(),
            "rows_last_run": 1,
            "duration_ms": 100,
            "error_message": None,
        })
        solar = {
            "captured_at": (NOW - timedelta(minutes=2)).isoformat(),
            "source_observed_at": {
                "kp": (NOW - timedelta(minutes=2)).isoformat(),
                "magnetic_field": (NOW - timedelta(minutes=2)).isoformat(),
                "solar_wind": (NOW - timedelta(minutes=2)).isoformat(),
                "proton_flux_10mev": (NOW - timedelta(minutes=2)).isoformat(),
                "dst": (NOW - timedelta(minutes=30)).isoformat(),
            },
        }
        _, solar_current = solar_snapshot(NOW, statuses, solar)
        watermarks = [
            {
                "aggregation": name,
                "hour_utc": (NOW - timedelta(hours=2, minutes=45)).isoformat(),
                "rows_written": 10,
                "available_at": (NOW - timedelta(hours=1, minutes=20)).isoformat(),
            }
            for name in ("band_hourly", "path_hourly")
        ]
        _, aggregation_gates = aggregation_snapshot(NOW, watermarks)
        self.assertTrue(all(source_gates.values()))
        self.assertTrue(solar_current)
        self.assertTrue(all(aggregation_gates.values()))

        watermarks[0]["rows_written"] = 0
        _, aggregation_gates = aggregation_snapshot(NOW, watermarks)
        self.assertFalse(aggregation_gates["band_hourly_current"])

        solar["source_observed_at"]["proton_flux_10mev"] = (
            NOW - timedelta(minutes=16)
        ).isoformat()
        solar_state, solar_current = solar_snapshot(NOW, statuses, solar)
        self.assertFalse(solar_state["source_current"]["proton_flux_10mev"])
        self.assertTrue(solar_current)

        solar["source_observed_at"]["kp"] = (
            NOW - timedelta(minutes=16)
        ).isoformat()
        solar_state, solar_current = solar_snapshot(NOW, statuses, solar)
        self.assertFalse(solar_state["source_current"]["kp"])
        self.assertFalse(solar_current)

    def test_health_waits_for_a_fresh_collector_cycle_without_relaxing_sources(self) -> None:
        statuses = [
            {
                "source": source,
                "last_success_at": (NOW - timedelta(seconds=90)).isoformat(),
            }
            for source in ("pskreporter", "rbn", "dxcluster", "solar")
        ]
        self.assertTrue(fresh_source_cycle(NOW, statuses))

        statuses[0]["last_success_at"] = (
            NOW - timedelta(seconds=121)
        ).isoformat()
        self.assertFalse(fresh_source_cycle(NOW, statuses))

        statuses[0]["last_success_at"] = (
            NOW + timedelta(seconds=1)
        ).isoformat()
        self.assertFalse(fresh_source_cycle(NOW, statuses))

    def test_continuity_requires_unbroken_24_hour_tail(self) -> None:
        receipts = [
            {
                "schema_version": 1,
                "generated_at": (NOW - timedelta(hours=24, minutes=15) + timedelta(minutes=15 * index)).isoformat(),
                "instant_healthy": True,
            }
            for index in range(98)
        ]
        hours, count, no_gap = contiguous_healthy_hours(receipts, NOW, True)
        self.assertGreaterEqual(hours, 24)
        self.assertGreaterEqual(count, 97)
        self.assertTrue(no_gap)

        receipts = receipts[:-5]
        hours, _, no_gap = contiguous_healthy_hours(receipts, NOW, True)
        self.assertEqual(hours, 0)
        self.assertFalse(no_gap)

    def test_pipeline_continuity_measures_weather_availability_separately(self) -> None:
        receipts = []
        for index in range(8):
            gates = {
                "native_arm64": True,
                "collector_launchd_running": True,
                "target_queries_succeeded": True,
                "pskreporter_current": True,
                "rbn_current": True,
                "dxcluster_current": True,
                "solar_weather_current": index not in {4, 5},
                "band_hourly_current": True,
                "path_hourly_current": True,
                "no_open_outages": True,
                "identity_free_receipt": True,
                "prospective_outcomes_unread": True,
            }
            receipts.append({
                "schema_version": 1,
                "generated_at": (
                    NOW - timedelta(minutes=15 * (8 - index))
                ).isoformat(),
                "gates": gates,
            })

        result = pipeline_continuity(
            receipts,
            NOW,
            current_pipeline_healthy=True,
            current_weather_healthy=True,
        )

        self.assertEqual(result["healthy_receipts"], 9)
        self.assertEqual(result["weather_current_receipts"], 7)
        self.assertAlmostEqual(result["weather_availability"], 7 / 9)
        self.assertEqual(result["maximum_consecutive_weather_stale_samples"], 2)
        self.assertTrue(result["tail_has_no_gap"])

        receipts[-1]["gates"]["path_hourly_current"] = False
        broken = pipeline_continuity(
            receipts,
            NOW,
            current_pipeline_healthy=True,
            current_weather_healthy=True,
        )
        self.assertEqual(broken["healthy_receipts"], 1)

    def test_receipts_are_owner_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "readiness.json"
            atomic_write(path, {"identity_free": True})
            mode = stat.S_IMODE(path.stat().st_mode)
        self.assertEqual(mode, 0o600)


if __name__ == "__main__":
    unittest.main()
