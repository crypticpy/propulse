"""Validate and persist one identity-free WSPR research run receipt."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from wspr_scheduler import CompletionManifest, aware_utc, write_json_atomic


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"{path.name} is not a JSON object")
    return value


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def receipt_name(target_hour: datetime) -> str:
    return target_hour.strftime("%Y%m%dT%H0000Z.json")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--connector-result", type=Path, required=True)
    parser.add_argument("--scheduler-result", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--receipt-dir", type=Path, required=True)
    parser.add_argument("--completed-manifest-dir", type=Path, required=True)
    parser.add_argument("--started-at", required=True)
    parser.add_argument("--cleanup-dir", type=Path)
    args = parser.parse_args()
    connector = read_json(args.connector_result)
    scheduler = read_json(args.scheduler_result)
    manifest_payload = read_json(args.manifest)
    manifest = CompletionManifest.from_json(
        manifest_payload,
        signing_secret=os.environ.get("PROPULSE_WSPR_COMPLETION_SECRET", ""),
    )
    started_at = aware_utc(args.started_at, "started_at")
    ended_at = datetime.now(timezone.utc)
    manifest_hash = sha256(args.manifest)
    gates = {
        "connector_complete": connector.get("status") == "ingested-manifest-ready",
        "connector_spool_removed": connector.get("spool_removed") is True,
        "connector_matches_manifest": (
            connector.get("source_checkpoint_sha256")
            == manifest.source_checkpoint_sha256
            and int(connector.get("source_record_count", -1))
            == manifest.source_record_count
            and connector.get("records_by_band") == manifest.source_records_by_band
        ),
        "scheduler_complete": scheduler.get("status") == "complete",
        "scheduler_matches_manifest": (
            scheduler.get("source_checkpoint_sha256")
            == manifest.source_checkpoint_sha256
            and int(scheduler.get("source_record_count", -1))
            == manifest.source_record_count
            and scheduler.get("observations_by_band")
            == manifest.source_records_by_band
            and scheduler.get("completion_manifest_sha256") == manifest_hash
        ),
        "all_bands_finalized": int(scheduler.get("bands_finalized", -1)) == 10,
        "m5_threads_bounded": (
            int(scheduler.get("workers", -1)) == 2
            and int(scheduler.get("threads_per_band", -1)) == 9
            and int(scheduler.get("maximum_compute_threads", -1)) == 18
        ),
        "timestamps_causal": started_at <= manifest.available_at <= ended_at,
    }
    if not all(gates.values()):
        raise RuntimeError("WSPR run receipt gates did not pass")
    receipt = {
        "schema_version": 1,
        "generated_at": ended_at.isoformat(),
        "status": "complete",
        "research_only": True,
        "provider": manifest.provider,
        "target_hour": manifest.target_hour.isoformat(),
        "source_watermark": manifest.source_watermark.isoformat(),
        "available_at": manifest.available_at.isoformat(),
        "started_at": started_at.isoformat(),
        "ended_at": ended_at.isoformat(),
        "source_checkpoint_sha256": manifest.source_checkpoint_sha256,
        "completion_manifest_sha256": manifest_hash,
        "source_record_count": manifest.source_record_count,
        "records_by_band": manifest.source_records_by_band,
        "feature_cell_count": int(scheduler["feature_cells"]),
        "pruned_observations": int(scheduler["pruned_observations"]),
        "connector": {
            "elapsed_seconds": float(connector["elapsed_seconds"]),
            "peak_rss_mib": float(connector["peak_rss_mib"]),
            "source_request_count": int(connector["source_request_count"]),
        },
        "finalizer": {
            "wall_seconds": float(scheduler["wall_seconds"]),
            "workers": int(scheduler["workers"]),
            "threads_per_band": int(scheduler["threads_per_band"]),
            "maximum_compute_threads": int(scheduler["maximum_compute_threads"]),
        },
        "gates": gates,
    }
    name = receipt_name(manifest.target_hour)
    if args.cleanup_dir is not None:
        for path in (
            args.connector_result,
            args.scheduler_result,
        ):
            path.unlink(missing_ok=True)
        args.cleanup_dir.rmdir()
    write_json_atomic(args.completed_manifest_dir / name, manifest_payload)
    # The receipt is the commit marker and is therefore written last.
    write_json_atomic(args.receipt_dir / name, receipt)
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
