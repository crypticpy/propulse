#!/usr/bin/env python3
"""Build the identity-free operational rollup for the WSPR research shadow."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from wspr_finalizer import HF_BANDS
from wspr_live_connector import aware_utc, latest_settled_hour
from wspr_scheduler import CompletionManifest, write_json_atomic


DEFAULT_RUNTIME_ROOT = Path.home() / "Library/Application Support/PropulseML"
DEFAULT_MINIMUM_HOURS = 30 * 24
DEFAULT_STALE_SECONDS = 7200
EXPECTED_RECEIPT_KEYS = {
    "schema_version",
    "generated_at",
    "status",
    "research_only",
    "provider",
    "target_hour",
    "source_watermark",
    "available_at",
    "started_at",
    "ended_at",
    "source_checkpoint_sha256",
    "completion_manifest_sha256",
    "source_record_count",
    "records_by_band",
    "feature_cell_count",
    "pruned_observations",
    "connector",
    "finalizer",
    "gates",
}
EXPECTED_RECEIPT_GATES = {
    "connector_complete",
    "connector_spool_removed",
    "connector_matches_manifest",
    "scheduler_complete",
    "scheduler_matches_manifest",
    "all_bands_finalized",
    "m5_threads_bounded",
    "timestamps_causal",
}


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"{path.name} is not a JSON object")
    return value


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def percentile(values: list[float], quantile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * quantile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def build_shadow_summary(
    runtime_root: Path,
    *,
    now: datetime,
    minimum_hours: int = DEFAULT_MINIMUM_HOURS,
    stale_seconds: int = DEFAULT_STALE_SECONDS,
) -> dict[str, Any]:
    current = aware_utc(now, "now")
    if minimum_hours < 24:
        raise ValueError("minimum shadow window must be at least 24 hours")
    if stale_seconds != DEFAULT_STALE_SECONDS:
        raise ValueError("shadow stale boundary is preregistered at 7,200 seconds")
    receipt_dir = runtime_root / "live_wspr_receipts"
    manifest_dir = runtime_root / "live_wspr_manifests/completed"
    secret_path = runtime_root / "secrets/wspr_completion_secret"
    details = secret_path.stat()
    secret_owner_only = (
        not secret_path.is_symlink()
        and details.st_uid == os.getuid()
        and details.st_mode & 0o077 == 0
    )
    signing_secret = secret_path.read_text(encoding="utf-8").strip()
    if not signing_secret:
        raise RuntimeError("completion-signing secret is empty")
    latest = latest_settled_hour(current, timedelta(minutes=10))
    candidates: list[datetime] = []
    valid: list[tuple[datetime, dict[str, Any]]] = []
    errors: Counter[str] = Counter()
    for receipt_path in sorted(receipt_dir.glob("*.json")):
        try:
            receipt = read_json(receipt_path)
            target = aware_utc(str(receipt["target_hour"]), "receipt target hour")
            candidates.append(target)
            if set(receipt) != EXPECTED_RECEIPT_KEYS:
                raise ValueError("receipt_schema")
            if receipt.get("status") != "complete" or receipt.get("research_only") is not True:
                raise ValueError("receipt_status")
            if receipt_path.name != target.strftime("%Y%m%dT%H0000Z.json"):
                raise ValueError("receipt_filename")
            if (
                set(receipt.get("gates", {})) != EXPECTED_RECEIPT_GATES
                or not all(receipt.get("gates", {}).values())
            ):
                raise ValueError("receipt_gates")
            manifest_path = manifest_dir / receipt_path.name
            manifest_payload = read_json(manifest_path)
            manifest = CompletionManifest.from_json(
                manifest_payload, signing_secret=signing_secret
            )
            if receipt.get("completion_manifest_sha256") != sha256(manifest_path):
                raise ValueError("manifest_hash")
            if (
                manifest.target_hour != target
                or receipt.get("provider") != manifest.provider
                or receipt.get("source_checkpoint_sha256")
                != manifest.source_checkpoint_sha256
                or receipt.get("records_by_band") != manifest.source_records_by_band
                or int(receipt.get("source_record_count", -1))
                != manifest.source_record_count
                or sum(manifest.source_records_by_band.values())
                != manifest.source_record_count
            ):
                raise ValueError("manifest_receipt_mismatch")
            if set(receipt["records_by_band"]) != HF_BANDS:
                raise ValueError("band_coverage")
            valid.append((target, receipt))
        except (KeyError, OSError, TypeError, ValueError, RuntimeError, json.JSONDecodeError) as error:
            label = (
                str(error)
                if isinstance(error, ValueError)
                and str(error) in {
                    "receipt_schema",
                    "receipt_status",
                    "receipt_filename",
                    "receipt_gates",
                    "manifest_hash",
                    "manifest_receipt_mismatch",
                    "band_coverage",
                }
                else type(error).__name__
            )
            errors[label] += 1
    candidate_targets = sorted(set(candidates))
    valid_by_target = {target: receipt for target, receipt in valid}
    start = candidate_targets[0] if candidate_targets else None
    expected_targets: list[datetime] = []
    if start is not None and start <= latest:
        count = int((latest - start).total_seconds() // 3600) + 1
        expected_targets = [start + timedelta(hours=index) for index in range(count)]
    missing = [target for target in expected_targets if target not in valid_by_target]
    expected_hours = len(expected_targets)
    completed_hours = expected_hours - len(missing)
    completion_rate = completed_hours / expected_hours if expected_hours else 0.0
    continuous_hours = 0
    for target in reversed(expected_targets):
        if target not in valid_by_target:
            break
        continuous_hours += 1
    latencies: list[float] = []
    connector_seconds: list[float] = []
    finalizer_seconds: list[float] = []
    peak_rss: list[float] = []
    source_rows = 0
    feature_cells = 0
    band_totals = {band: 0 for band in sorted(HF_BANDS)}
    causal = True
    multicore = True
    one_request = True
    for target, receipt in valid:
        started = aware_utc(str(receipt["started_at"]), "receipt started_at")
        available = aware_utc(str(receipt["available_at"]), "receipt available_at")
        ended = aware_utc(str(receipt["ended_at"]), "receipt ended_at")
        causal = causal and (
            started <= available <= ended <= current
            and target + timedelta(hours=1) <= available
        )
        latencies.append((ended - (target + timedelta(hours=1))).total_seconds())
        connector_seconds.append(float(receipt["connector"]["elapsed_seconds"]))
        finalizer_seconds.append(float(receipt["finalizer"]["wall_seconds"]))
        peak_rss.append(float(receipt["connector"]["peak_rss_mib"]))
        source_rows += int(receipt["source_record_count"])
        feature_cells += int(receipt["feature_cell_count"])
        for band, count in receipt["records_by_band"].items():
            band_totals[band] += int(count)
        multicore = multicore and (
            int(receipt["finalizer"]["workers"]) == 2
            and int(receipt["finalizer"]["threads_per_band"]) == 9
            and int(receipt["finalizer"]["maximum_compute_threads"]) == 18
        )
        one_request = one_request and (
            int(receipt["connector"]["source_request_count"]) == 1
        )
    gates = {
        "secret_file_owner_only": secret_owner_only,
        "all_receipts_and_manifests_valid": (
            not errors and len(valid) == len(candidate_targets)
        ),
        "all_ten_bands_present_each_hour": all(
            set(receipt["records_by_band"]) == HF_BANDS for _, receipt in valid
        ) and bool(valid),
        "receipt_timestamps_causal": causal and bool(valid),
        "m5_multicore_profile_exact": multicore and bool(valid),
        "one_source_request_per_hour": one_request and bool(valid),
        "no_future_target_receipts": all(target <= latest for target in candidate_targets),
        "completed_hours_within_7200_seconds": (
            bool(latencies) and max(latencies) <= stale_seconds
        ),
        "scheduled_completion_rate_at_least_99_percent": completion_rate >= 0.99,
        "minimum_30_day_window_complete": expected_hours >= minimum_hours,
        "locked_outcomes_unread": True,
    }
    operational_gate_names = set(gates) - {"minimum_30_day_window_complete"}
    operational_healthy = all(gates[name] for name in operational_gate_names)
    decision = (
        "pass"
        if operational_healthy and gates["minimum_30_day_window_complete"]
        else "collecting"
        if operational_healthy
        else "fail"
    )
    return {
        "schema_version": 1,
        "generated_at": current.isoformat(),
        "scope": "wspr_research_shadow_progress",
        "decision": decision,
        "operational_status": "healthy" if operational_healthy else "alert",
        "research_only": True,
        "subscriber_facing_authorized": False,
        "locked_outcomes_read": False,
        "window": {
            "start_target_hour": start.isoformat() if start else None,
            "latest_settled_target_hour": latest.isoformat(),
            "last_completed_target_hour": (
                max(valid_by_target).isoformat() if valid_by_target else None
            ),
            "minimum_hours": minimum_hours,
            "expected_hours": expected_hours,
            "completed_hours": completed_hours,
            "missing_hours": len(missing),
            "completion_rate": completion_rate,
            "continuous_completed_hours": continuous_hours,
        },
        "totals": {
            "source_records": source_rows,
            "feature_cells": feature_cells,
            "records_by_band": band_totals,
        },
        "performance": {
            "completion_latency_p95_seconds": percentile(latencies, 0.95),
            "completion_latency_max_seconds": max(latencies) if latencies else None,
            "connector_wall_p95_seconds": percentile(connector_seconds, 0.95),
            "finalizer_wall_p95_seconds": percentile(finalizer_seconds, 0.95),
            "connector_peak_rss_max_mib": max(peak_rss) if peak_rss else None,
        },
        "integrity_errors": dict(sorted(errors.items())),
        "missing_target_hours_sample": [value.isoformat() for value in missing[:24]],
        "gates": gates,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-root", type=Path, default=DEFAULT_RUNTIME_ROOT)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--minimum-hours", type=int, default=DEFAULT_MINIMUM_HOURS)
    args = parser.parse_args()
    args.runtime_root = args.runtime_root.expanduser().resolve()
    output = args.output or args.runtime_root / "live_wspr_shadow_progress.json"
    summary = build_shadow_summary(
        args.runtime_root,
        now=datetime.now(timezone.utc),
        minimum_hours=args.minimum_hours,
    )
    write_json_atomic(output, summary)
    print(json.dumps(summary, indent=2))
    if summary["decision"] == "fail":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
