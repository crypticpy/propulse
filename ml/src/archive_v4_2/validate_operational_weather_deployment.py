#!/usr/bin/env python3
"""Validate server-authoritative operational weather against the deployed target."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(MODULE))
sys.path.insert(0, str(SERVICE))

from app import (  # noqa: E402
    ModelRegistry,
    PathFeatures,
    apply_verified_operational_weather,
    create_app,
)
from m5_runtime import validate_m5_runtime  # noqa: E402
from operational_weather import (  # noqa: E402
    PostgrestOperationalWeatherProvider,
)
from path_history import UnavailablePathHistoryProvider  # noqa: E402
from validate_live_feature_migration import atomic_write, read_env  # noqa: E402


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_ENV = ROOT / ".env.local"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/operational_weather_validation.json"
)
CRITICAL_FEATURES = {
    "kp",
    "f107",
    "bz_gsm",
    "wind_speed",
    "density_cm3",
    "temperature_k",
    "dst",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def percentile(values: list[float], quantile: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, math.ceil(len(ordered) * quantile) - 1)
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--repetitions", type=int, default=20)
    args = parser.parse_args()
    if not args.bundle.is_file():
        raise FileNotFoundError(args.bundle)
    if args.repetitions < 5:
        raise ValueError("at least five cached request repetitions are required")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    hardware = validate_m5_runtime(config)
    env = read_env(args.env_file)
    base_url = env.get("VITE_SUPABASE_URL", "")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not service_key:
        raise RuntimeError("untracked target weather-store settings are unavailable")

    started = time.perf_counter()
    provider = PostgrestOperationalWeatherProvider(
        base_url=base_url,
        service_key=service_key,
    )
    issue_time = datetime.now(timezone.utc)
    snapshot = provider.lookup(issue_time=issue_time)
    if snapshot is None:
        raise RuntimeError("target weather store has no verified operational snapshot")

    forged = PathFeatures(
        target_grid4="IO91",
        values={"band_mhz": 14.1, "dist_km": 8000, "kp": 9.0, "kp_missing": 0},
    )
    cells, freshness = apply_verified_operational_weather(
        provider,
        issue_time=issue_time,
        cells=[forged],
        client_freshness={"space_weather": 0},
    )
    registry = ModelRegistry(args.bundle)
    client = TestClient(create_app(
        registry,
        inference_mode="shadow",
        path_history_provider=UnavailablePathHistoryProvider(),
        operational_weather_provider=provider,
        telemetry_sink=lambda _event: None,
    ))
    request = {
        "origin_grid4": "EM10",
        "issue_time": issue_time.isoformat(),
        "valid_time": issue_time.isoformat(),
        "band": "20m",
        "mode": "WSPR",
        "declared_power_watts": 5,
        "features": {
            "target_grid4": "IO91",
            "values": forged.values,
        },
        "data_freshness_seconds": {
            "path_history": 0,
            "space_weather": 0,
        },
    }
    warm = client.post("/v1/propagation/path", json=request)
    timings = []
    response = warm
    for _ in range(args.repetitions):
        request_started = time.perf_counter()
        response = client.post("/v1/propagation/path", json=request)
        timings.append((time.perf_counter() - request_started) * 1000)
    health = client.get("/v1/propagation/health").json()

    watermark_age = math.ceil((issue_time - snapshot.source_watermark).total_seconds())
    availability_age = math.floor((issue_time - snapshot.available_at).total_seconds())
    verified_values = cells[0].values
    response_body = response.json()
    gates = {
        "target_snapshot_verified": snapshot is not None,
        "critical_operational_fields_present": CRITICAL_FEATURES.issubset(snapshot.values),
        "source_watermark_causal": snapshot.source_watermark <= snapshot.available_at <= issue_time,
        "source_watermark_within_two_hours": 0 <= watermark_age <= 7200,
        "receipt_within_fifteen_minutes": 0 <= availability_age <= 900,
        "browser_weather_value_replaced": (
            verified_values.get("kp") == snapshot.values.get("kp")
            and verified_values.get("kp") != 9.0
            and verified_values.get("kp_missing") == 0
        ),
        "browser_weather_freshness_replaced": freshness.get("space_weather") == watermark_age,
        "real_a6_bundle_loaded": health.get("status") == "ok",
        "trusted_weather_provider_reported": (
            health.get("operational_weather_provider") == provider.name
        ),
        "real_bundle_request_succeeds": response.status_code == 200,
        "missing_wspr_still_selects_physics": response_body.get("profile") == "physics",
        "response_uses_server_weather_freshness": (
            response_body.get("data_freshness", {}).get("space_weather") == watermark_age
        ),
        "cached_path_p95_below_100ms": percentile(timings, 0.95) <= 100,
        "locked_outcomes_unread": True,
    }
    result: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "target_operational_weather_and_real_bundle_validation",
        "locked_outcomes_read": False,
        "provider": provider.name,
        "bundle": {
            "model_version": health.get("model_version"),
            "manifest_sha256": sha256(args.bundle),
        },
        "weather": {
            "feature_count": len(snapshot.values),
            "features": sorted(snapshot.values),
            "watermark_age_seconds": watermark_age,
            "availability_age_seconds": availability_age,
            "quality_flags": list(snapshot.quality_flags),
        },
        "performance": {
            "repetitions": args.repetitions,
            "cached_path_p95_ms": percentile(timings, 0.95),
        },
        "compute": hardware,
        "connection_identifier_recorded": False,
        "gates": gates,
        "decision": "pass" if all(gates.values()) else "fail",
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2))
    if result["decision"] != "pass":
        raise SystemExit("operational-weather deployment validation failed")


if __name__ == "__main__":
    main()
