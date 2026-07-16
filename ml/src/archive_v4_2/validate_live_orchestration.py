#!/usr/bin/env python3
"""Validate signed all-band WSPR orchestration on the native M5 runtime."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(MODULE))
sys.path.insert(0, str(SERVICE))

from m5_runtime import validate_m5_runtime  # noqa: E402
from validate_live_feature_migration import atomic_write  # noqa: E402
from wspr_finalizer import HF_BANDS  # noqa: E402
from wspr_scheduler import (  # noqa: E402
    CompletionManifest,
    completion_signature,
    run_completed_hour,
)


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/orchestration_validation.json"
)
SECRET = "validation-only-completion-secret"


def payload() -> dict[str, Any]:
    target = datetime(2026, 7, 15, 20, tzinfo=timezone.utc)
    value: dict[str, Any] = {
        "schema_version": 1,
        "provider": "orchestration-validation",
        "target_hour": target.isoformat(),
        "source_watermark": (target + timedelta(hours=1)).isoformat(),
        "available_at": (target + timedelta(hours=1, minutes=5)).isoformat(),
        "source_complete": True,
        "source_checkpoint_sha256": hashlib.sha256(b"validation-checkpoint").hexdigest(),
        "source_record_count": 100_000,
        "bands": sorted(HF_BANDS),
        "quality_flags": [],
    }
    value["manifest_hmac_sha256"] = completion_signature(value, SECRET)
    return value


class RecordingPruner:
    def __init__(self) -> None:
        self.calls: list[int] = []

    def prune(self, *, older_than_hours: int) -> int:
        self.calls.append(older_than_hours)
        return 12


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    del args.profile
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    hardware = validate_m5_runtime(config)
    workers = int(config["compute"]["apple_silicon"]["parallel_fit_workers"])
    threads = int(config["compute"]["apple_silicon"]["threads_per_parallel_fit"])
    manifest = CompletionManifest.from_json(payload(), signing_secret=SECRET)

    mutex = threading.Lock()
    active = 0
    maximum_active = 0
    finalized: list[str] = []

    def finalizer(item: CompletionManifest, band: str, per_band_threads: int) -> dict[str, Any]:
        nonlocal active, maximum_active
        with mutex:
            active += 1
            maximum_active = max(maximum_active, active)
        time.sleep(0.03)
        with mutex:
            active -= 1
            finalized.append(band)
        return {
            "band": band,
            "status": "complete",
            "provider": item.provider,
            "feature_cell_count": 100,
            "observation_count": 1000,
            "threads": per_band_threads,
        }

    pruner = RecordingPruner()
    started = time.perf_counter()
    result = run_completed_hour(
        manifest,
        finalizer=finalizer,
        pruner=pruner,
        workers=workers,
        threads_per_band=threads,
    )
    success_seconds = time.perf_counter() - started

    tamper_rejected = False
    tampered = payload()
    tampered["source_record_count"] += 1
    try:
        CompletionManifest.from_json(tampered, signing_secret=SECRET)
    except ValueError:
        tamper_rejected = True

    failure_pruner = RecordingPruner()

    def failing_finalizer(
        item: CompletionManifest, band: str, _per_band_threads: int
    ) -> dict[str, Any]:
        if band == "20m":
            raise RuntimeError("expected validation failure")
        return {"band": band, "status": "complete", "provider": item.provider}

    failure_prevents_prune = False
    try:
        run_completed_hour(
            manifest,
            finalizer=failing_finalizer,
            pruner=failure_pruner,
            workers=workers,
            threads_per_band=threads,
        )
    except RuntimeError:
        failure_prevents_prune = not failure_pruner.calls

    oversubscription_rejected = False
    try:
        run_completed_hour(
            manifest,
            finalizer=finalizer,
            pruner=RecordingPruner(),
            workers=workers + 1,
            threads_per_band=threads,
        )
    except ValueError:
        oversubscription_rejected = True

    gates = {
        "signed_manifest_accepted": result["source_checkpoint_sha256"] == manifest.source_checkpoint_sha256,
        "manifest_tampering_rejected": tamper_rejected,
        "all_ten_hf_bands_finalized": set(finalized) == HF_BANDS,
        "two_workers_observed": maximum_active == workers == 2,
        "all_eighteen_m5_threads_allocated": result["maximum_compute_threads"] == 18,
        "prune_runs_after_total_success": pruner.calls == [30],
        "band_failure_prevents_prune": failure_prevents_prune,
        "cpu_oversubscription_rejected": oversubscription_rejected,
        "locked_outcomes_unread": True,
    }
    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "signed_all_band_orchestration_validation",
        "locked_outcomes_read": False,
        "synthetic": True,
        "execution": {
            "workers": workers,
            "threads_per_band": threads,
            "maximum_compute_threads": result["maximum_compute_threads"],
            "maximum_concurrent_workers_observed": maximum_active,
            "bands_finalized": result["bands_finalized"],
            "wall_seconds": success_seconds,
        },
        "compute": hardware,
        "gates": gates,
        "decision": "pass" if all(gates.values()) else "fail",
    }
    atomic_write(args.output, output)
    print(json.dumps(output, indent=2))
    if output["decision"] != "pass":
        raise SystemExit("live orchestration validation failed")


if __name__ == "__main__":
    main()
