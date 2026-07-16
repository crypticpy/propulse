#!/usr/bin/env python3
"""Sign an aggregate StationCast API telemetry receipt on the M5."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from generate_stationcast_beta_operations_receipt import (
    CONFIG,
    M5_CONFIG,
    owner_secret,
    parse_utc,
    telemetry_signature,
    validate_api_telemetry,
)
from m5_runtime import validate_m5_runtime
from score_stationcast_beta import validate_beta_config
from validate_live_feature_migration import atomic_write


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--secret", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    validate_m5_runtime(json.loads(M5_CONFIG.read_text(encoding="utf-8")))
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    validate_beta_config(config)
    telemetry = json.loads(args.input.read_text(encoding="utf-8"))
    if telemetry.get("participant_data_present") is not False:
        raise RuntimeError("telemetry receipt is not aggregate-only")
    secret = owner_secret(args.secret)
    telemetry["signature"] = telemetry_signature(telemetry, secret)
    window = telemetry.get("window", {})
    errors = validate_api_telemetry(
        telemetry,
        config,
        window_start=parse_utc(str(window.get("start", ""))),
        window_end=parse_utc(str(window.get("end", ""))),
        secret=secret,
    )
    if errors:
        raise RuntimeError(f"invalid beta API telemetry: {', '.join(errors)}")
    atomic_write(args.output, telemetry)
    os.chmod(args.output, 0o600)
    print(args.output)


if __name__ == "__main__":
    main()
