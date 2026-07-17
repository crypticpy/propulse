#!/usr/bin/env python3
"""Validate the V4.2 live-feature foundation without a live provider."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import resource
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[3]
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(SERVICE))

from app import ModelRegistry, create_app  # noqa: E402
from path_history import UnavailablePathHistoryProvider  # noqa: E402


DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/foundation_validation.json"
)
TRANSFORM_EVIDENCE = DEFAULT_OUTPUT.parent / "transform_parity.json"
MIGRATION = (
    ROOT / "supabase/migrations/20260716000000_wspr_live_feature_store.sql"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def percentile(values: list[float], quantile: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, int((len(ordered) - 1) * quantile + 0.999999))
    return ordered[index]


def target_grids(count: int) -> list[str]:
    values = []
    for first in "ABCDEFGHIJKLMNOPQR":
        for second in "ABCDEFGHIJKLMNOPQR":
            for first_digit in "0123456789":
                for second_digit in "0123456789":
                    grid = f"{first}{second}{first_digit}{second_digit}"
                    if grid != "EM10":
                        values.append(grid)
                    if len(values) == count:
                        return values
    raise RuntimeError("could not construct requested grid fixture")


def peak_rss_gib() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    divisor = 1024**3 if sys.platform == "darwin" else 1024**2
    return float(value / divisor)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--path-repetitions", type=int, default=20)
    parser.add_argument("--surface-repetitions", type=int, default=5)
    parser.add_argument("--surface-cells", type=int, default=288)
    args = parser.parse_args()
    if not args.bundle.is_file():
        raise FileNotFoundError(args.bundle)
    if not TRANSFORM_EVIDENCE.is_file() or not MIGRATION.is_file():
        raise FileNotFoundError("transform evidence and migration are required")
    if args.path_repetitions < 5 or args.surface_repetitions < 3:
        raise ValueError("latency repetitions are below the validation minimum")
    if args.surface_cells < 1 or args.surface_cells > 4096:
        raise ValueError("surface cells must be between 1 and 4096")

    started = time.perf_counter()
    transform = json.loads(TRANSFORM_EVIDENCE.read_text(encoding="utf-8"))
    migration_sql = MIGRATION.read_text(encoding="utf-8")
    registry = ModelRegistry(args.bundle)
    events: list[dict[str, Any]] = []
    client = TestClient(create_app(
        registry,
        inference_mode="shadow",
        telemetry_sink=events.append,
        path_history_provider=UnavailablePathHistoryProvider(),
    ))
    issue_time = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    forged_values = {
        "band_mhz": 14.1,
        "dist_km": 8000,
        "path_success_prev1": 0.999,
        "path_success_prev2": 0.999,
        "path_success_prev3": 0.999,
        "path_success_prev24": 0.999,
        "path_prev1_available": 1,
        "path_prev2_available": 1,
        "path_prev3_available": 1,
        "path_prev24_available": 1,
    }
    path_payload = {
        "origin_grid4": "EM10",
        "issue_time": issue_time.isoformat(),
        "valid_time": issue_time.isoformat(),
        "band": "20m",
        "mode": "WSPR",
        "declared_power_watts": 5,
        "features": {"target_grid4": "IO91", "values": forged_values},
        "data_freshness_seconds": {"path_history": 0, "space_weather": 60},
    }
    warm = client.post("/v1/propagation/path", json=path_payload)
    path_times = []
    path_response = warm
    for _ in range(args.path_repetitions):
        request_started = time.perf_counter()
        path_response = client.post("/v1/propagation/path", json=path_payload)
        path_times.append((time.perf_counter() - request_started) * 1000)

    surface_payload = {
        key: value for key, value in path_payload.items() if key != "features"
    }
    grids = target_grids(args.surface_cells)
    surface_payload["cells"] = [
        {"target_grid4": grid, "values": forged_values} for grid in grids
    ]
    surface_times = []
    surface_response = None
    for _ in range(args.surface_repetitions):
        request_started = time.perf_counter()
        surface_response = client.post(
            "/v1/propagation/surface", json=surface_payload
        )
        surface_times.append((time.perf_counter() - request_started) * 1000)
    assert surface_response is not None
    health = client.get("/v1/propagation/health").json()

    serialized_events = json.dumps(events, sort_keys=True)
    private_tokens = [
        "EM10",
        "IO91",
        *grids,
        "origin_grid4",
        "target_grid4",
        "chainFingerprint",
        "requestedPowerWatts",
    ]
    privacy_findings = [
        token for token in private_tokens if token in serialized_events
    ]
    path_body = path_response.json()
    surface_body = surface_response.json()
    migration_gates = {
        "rolling_observation_rls": (
            "ALTER TABLE public.wspr_observations_rolling ENABLE ROW LEVEL SECURITY"
            in migration_sql
        ),
        "sparse_feature_export_revoked": (
            "REVOKE ALL ON public.wspr_path_hourly_features FROM PUBLIC, anon, authenticated"
            in migration_sql
        ),
        "lookup_service_role_only": (
            "GRANT EXECUTE ON FUNCTION public.lookup_wspr_path_lags"
            in migration_sql
            and ") TO service_role;" in migration_sql
        ),
        "four_atomic_watermarks": all(
            f"CROSS JOIN watermark{lag}" in migration_sql
            for lag in (1, 2, 3, 24)
        ),
        "minimum_rolling_retention": "interval '27 hours'" in migration_sql,
    }
    gates = {
        "open_hour_transform_exact": (
            transform.get("decision") == "pass"
            and transform.get("parity", {}).get("exact") is True
            and transform.get("locked_outcomes_read") is False
        ),
        "real_bundle_loaded": health.get("status") == "ok",
        "client_freshness_forgery_blocked": (
            path_response.status_code == 200
            and path_body.get("profile") == "physics"
            and "path_history" not in path_body.get("data_freshness", {})
        ),
        "surface_forgery_blocked": (
            surface_response.status_code == 200
            and len(surface_body.get("cells", [])) == args.surface_cells
            and all(
                cell.get("profile") == "physics"
                for cell in surface_body.get("cells", [])
            )
        ),
        "server_provider_unavailable_by_default": (
            health.get("path_history_provider") == "unavailable"
        ),
        "serving_thread_contract": (
            health.get("xgboost_prediction_threads") == 1
            and health.get("xgboost_prediction_threads_source") == "manifest"
        ),
        "telemetry_identity_free": not privacy_findings,
        "path_latency": percentile(path_times, 0.95) <= 50,
        "surface_latency": percentile(surface_times, 0.95) <= 3000,
        **migration_gates,
    }
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "live_feature_foundation_pre_provider",
        "locked_outcomes_read": False,
        "source_authorized": False,
        "migration_deployed": False,
        "provider_connector_enabled": False,
        "migration": {
            "path": MIGRATION.relative_to(ROOT).as_posix(),
            "sha256": sha256(MIGRATION),
        },
        "bundle": {
            "model_version": health.get("model_version"),
            "core_feature_contract": health.get("core_feature_contract"),
            "manifest_sha256": sha256(args.bundle),
            "xgboost_prediction_threads": health.get(
                "xgboost_prediction_threads"
            ),
        },
        "transform_parity": transform["parity"],
        "service": {
            "path_repetitions": args.path_repetitions,
            "path_p95_ms": percentile(path_times, 0.95),
            "surface_repetitions": args.surface_repetitions,
            "surface_cells": args.surface_cells,
            "surface_p95_ms": percentile(surface_times, 0.95),
            "profile": path_body.get("profile"),
            "path_history_provider": health.get("path_history_provider"),
            "telemetry_events": len(events),
            "privacy_findings": privacy_findings,
        },
        "migration_contract": migration_gates,
        "compute": {
            "machine": os.uname().machine,
            "visible_cpus": os.cpu_count(),
            "peak_rss_gib": peak_rss_gib(),
            "wall_seconds": time.perf_counter() - started,
        },
        "gates": gates,
        "decision": "pass" if all(gates.values()) else "fail",
        "remaining_blockers": [
            "written source authorization or self-operated source",
            "migration deployment and syntax validation against target Postgres",
            "authorized provider connector",
            "multi-hour event-time and receipt-time replay",
            "30-day live shadow coverage and calibration evidence",
        ],
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2))
    if result["decision"] != "pass":
        raise SystemExit("live feature foundation validation failed")


if __name__ == "__main__":
    main()
