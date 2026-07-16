from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from summarize_wspr_research_shadow import build_shadow_summary
from wspr_finalizer import HF_BANDS
from wspr_scheduler import completion_signature, write_json_atomic


SECRET = "test-signing-secret"
TARGET = datetime(2026, 7, 16, 3, tzinfo=timezone.utc)
NOW = datetime(2026, 7, 16, 4, 30, tzinfo=timezone.utc)


def fixture(root: Path, *, ended_delay_seconds: int = 1800) -> None:
    secret_path = root / "secrets/wspr_completion_secret"
    secret_path.parent.mkdir(parents=True)
    secret_path.write_text(SECRET, encoding="utf-8")
    os.chmod(secret_path, 0o600)
    records = {band: index for index, band in enumerate(sorted(HF_BANDS), 1)}
    manifest = {
        "schema_version": 2,
        "provider": "wspr.live-research-v1",
        "target_hour": TARGET.isoformat(),
        "source_watermark": (TARGET + timedelta(hours=1)).isoformat(),
        "available_at": (TARGET + timedelta(hours=1, minutes=10)).isoformat(),
        "source_complete": True,
        "source_checkpoint_sha256": "a" * 64,
        "source_record_count": sum(records.values()),
        "source_records_by_band": records,
        "bands": sorted(HF_BANDS),
        "quality_flags": [],
        "manifest_hmac_sha256": "",
    }
    manifest["manifest_hmac_sha256"] = completion_signature(manifest, SECRET)
    name = TARGET.strftime("%Y%m%dT%H0000Z.json")
    manifest_path = root / "live_wspr_manifests/completed" / name
    write_json_atomic(manifest_path, manifest)
    receipt = {
        "schema_version": 1,
        "generated_at": (TARGET + timedelta(hours=1, seconds=ended_delay_seconds)).isoformat(),
        "status": "complete",
        "research_only": True,
        "provider": manifest["provider"],
        "target_hour": TARGET.isoformat(),
        "source_watermark": manifest["source_watermark"],
        "available_at": manifest["available_at"],
        "started_at": (TARGET + timedelta(hours=1, minutes=9)).isoformat(),
        "ended_at": (TARGET + timedelta(hours=1, seconds=ended_delay_seconds)).isoformat(),
        "source_checkpoint_sha256": manifest["source_checkpoint_sha256"],
        "completion_manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "source_record_count": manifest["source_record_count"],
        "records_by_band": records,
        "feature_cell_count": 25,
        "pruned_observations": 0,
        "connector": {
            "elapsed_seconds": 20.0,
            "peak_rss_mib": 100.0,
            "source_request_count": 1,
        },
        "finalizer": {
            "wall_seconds": 100.0,
            "workers": 2,
            "threads_per_band": 9,
            "maximum_compute_threads": 18,
        },
        "gates": {
            "connector_complete": True,
            "connector_spool_removed": True,
            "connector_matches_manifest": True,
            "scheduler_complete": True,
            "scheduler_matches_manifest": True,
            "all_bands_finalized": True,
            "m5_threads_bounded": True,
            "timestamps_causal": True,
        },
    }
    write_json_atomic(root / "live_wspr_receipts" / name, receipt)


class WsprResearchShadowSummaryTests(unittest.TestCase):
    def test_valid_short_window_is_healthy_and_collecting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            summary = build_shadow_summary(root, now=NOW)
            self.assertEqual(summary["decision"], "collecting")
            self.assertEqual(summary["operational_status"], "healthy")
            self.assertEqual(summary["window"]["completed_hours"], 1)
            self.assertEqual(summary["window"]["completion_rate"], 1.0)
            self.assertFalse(summary["gates"]["minimum_30_day_window_complete"])

    def test_stale_completion_fails_operational_gate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root, ended_delay_seconds=7201)
            summary = build_shadow_summary(root, now=NOW)
            self.assertEqual(summary["decision"], "fail")
            self.assertFalse(
                summary["gates"]["completed_hours_within_7200_seconds"]
            )

    def test_manifest_tampering_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(root)
            manifest_path = next((root / "live_wspr_manifests/completed").glob("*.json"))
            payload = json.loads(manifest_path.read_text())
            payload["source_checkpoint_sha256"] = "b" * 64
            write_json_atomic(manifest_path, payload)
            summary = build_shadow_summary(root, now=NOW)
            self.assertEqual(summary["decision"], "fail")
            self.assertTrue(summary["integrity_errors"])


if __name__ == "__main__":
    unittest.main()
