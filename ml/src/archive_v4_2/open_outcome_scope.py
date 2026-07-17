#!/usr/bin/env python3
"""Open exactly one frozen V4.2 outcome scope before acquisition."""

from __future__ import annotations

import argparse
import json
import shutil
import uuid
from pathlib import Path


from outcome_protocol import DEFAULT_CONFIG, DEFAULT_MANIFEST, begin_scope, load_json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--scope", choices=("december", "archive"), required=True)
    parser.add_argument("--attempt-id")
    args = parser.parse_args()
    config_path = Path(args.config).resolve()
    manifest_path = Path(args.manifest).resolve()
    config = load_json(config_path)
    free_gb = shutil.disk_usage(config["compute"]["external_root"]).free / 1024**3
    required = float(
        config["outcome_protocol"]["minimum_free_gb_before_acquisition"]
    )
    if free_gb < required:
        raise RuntimeError(
            f"opening {args.scope} requires {required:.0f} GiB free; found {free_gb:.1f}"
        )
    months = (
        config["phase4"]["gate_months"]
        if args.scope == "december"
        else config["phase5"]["locked_months"]
    )
    attempt_id = args.attempt_id or f"{args.scope}-{uuid.uuid4().hex}"
    value = begin_scope(
        manifest_path, config_path, args.scope, months, attempt_id
    )
    print(
        json.dumps(
            {
                "scope": args.scope,
                "months": months,
                "attempt_id": attempt_id,
                "free_gb": free_gb,
                "protocol_state": value["protocol_state"],
            }
        )
    )


if __name__ == "__main__":
    main()
