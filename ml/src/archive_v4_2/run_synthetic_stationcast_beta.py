#!/usr/bin/env python3
"""Exercise the frozen StationCast scorer with a clearly synthetic cohort."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import polars as pl

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT


DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/synthetic_stationcast_beta_dry_run.json"
)
SCORER = ROOT / "ml/src/archive_v4_2/score_stationcast_beta.py"
BETA_CONFIG = ROOT / "ml/config/propagation_v4_2_beta_protocol.json"
M5_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


def synthetic_frame() -> pl.DataFrame:
    start = datetime(2026, 6, 1, tzinfo=timezone.utc)
    bands = ("80m", "40m", "20m", "15m", "10m")
    fields = ("EM", "FN", "IO", "JN")
    tx_classes = ("5_25w", "25_100w", "100_500w")
    rows = []
    for participant in range(50):
        for index in range(40):
            high_probability = index % 2 == 0
            cycle = (index // 2) % 5
            observed = cycle != 0 if high_probability else cycle == 0
            rows.append({
                "participant_key": f"synthetic-{participant:02d}",
                "observed_at": start + timedelta(
                    days=index % 30,
                    hours=index % 24,
                    minutes=participant,
                ),
                "band": bands[(index + participant) % len(bands)],
                "mode": "WSPR",
                "task": "receive",
                "evidence_tier": "A" if (index // 2) % 2 == 0 else "B",
                "origin_field": fields[participant % len(fields)],
                "station_tx_class": tx_classes[participant % len(tx_classes)],
                "station_loss_class": "1_3db",
                "station_antenna_class": "3_6dbi",
                "station_rx_class": "catalog",
                "profile": "nowcast",
                "station_supported": True,
                "ood_count": 0,
                "observed": int(observed),
                "core_probability": 0.7 if high_probability else 0.3,
                "stationcast_probability": 0.8 if high_probability else 0.2,
            })
    return pl.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    config = json.loads(BETA_CONFIG.read_text(encoding="utf-8"))
    runtime = validate_m5_runtime(json.loads(M5_CONFIG.read_text(encoding="utf-8")))
    config_digest = hashlib.sha256(BETA_CONFIG.read_bytes()).hexdigest()

    with tempfile.TemporaryDirectory(prefix="propulse-beta-dry-run-") as directory:
        root = Path(directory)
        data = root / "synthetic.parquet"
        operations = root / "operations.json"
        synthetic_frame().write_parquet(data, compression="zstd")
        operations.write_text(json.dumps({
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scope": "synthetic_stationcast_beta_operations",
            "protocol_version": config["protocol_version"],
            "policy_version": config["policy_version"],
            "decision": "pass",
            "synthetic": True,
            "window": {
                "start": "2026-06-01T00:00:00+00:00",
                "end": "2026-07-01T00:00:00+00:00",
            },
            "audit": {
                "database": {
                    "predictions": 2_000,
                    "attempts": 2_000,
                    "binary_outcomes": 2_000,
                    "not_attempted": 0,
                    "unknown": 0,
                    "open_attempts": 0,
                    "fallback_predictions": 0,
                    "unsupported_predictions": 0,
                    "ood_predictions": 0,
                    "withdrawals": 0,
                    "withdrawn_rows_remaining": 0,
                    "expired_rows_remaining": 0,
                },
                "api": {
                    "requests": 4_000,
                    "errors": 0,
                    "integrity_errors": 0,
                    "privacy_events": 0,
                    "consent_errors": 0,
                    "subject_binding_errors": 0,
                    "stale_profile_events": 0,
                    "equipment_math_events": 0,
                    "unsupported_support_events": 0,
                    "high_confidence_overprediction_events": 0,
                    "geographic_regression_events": 0,
                },
            },
            "active_stop_conditions": [],
            "inputs": {
                "api_telemetry_sha256": hashlib.sha256(
                    b"synthetic-stationcast-beta-api-telemetry"
                ).hexdigest(),
                "api_telemetry_path_recorded": False,
                "config_sha256": config_digest,
            },
            "runtime": {
                "machine": platform.machine(),
                "physical_cores_visible": runtime["physical_cores_visible"],
            },
            "privacy": {
                "participant_identifiers_written": False,
                "exact_grid4_written": False,
                "raw_station_inventory_written": False,
            },
        }), encoding="utf-8")
        subprocess.run([
            sys.executable,
            str(SCORER),
            "--profile", args.profile,
            "--input", str(data),
            "--config", str(BETA_CONFIG),
            "--operations-receipt", str(operations),
            "--output", str(args.output),
            "--synthetic-dry-run",
        ], check=True)


if __name__ == "__main__":
    main()
