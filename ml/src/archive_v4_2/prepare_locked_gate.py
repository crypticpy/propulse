#!/usr/bin/env python3
"""Acquire and prepare a one-shot V4.2 gate dataset on the M5."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
V3 = ROOT / "ml/src/archive_v3"
sys.path.insert(0, str(MODULE))

from outcome_protocol import (  # noqa: E402
    DEFAULT_MANIFEST,
    OutcomeProtocolError,
    atomic_write,
    load_json,
    resume_scope,
    sha256,
)
from train_phase2_scale import validate_m5_runtime  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
SOURCE_FREEZE = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "source_pipeline_freeze.json"
)


def scoped_config(
    config: dict[str, Any], scope: str, months: list[str]
) -> dict[str, Any]:
    namespace = f"archive_v4_2_{scope}"
    return {
        "run_id": f"{config['run_id']}_{scope}_gate",
        "archive_namespace": namespace,
        "execution_scope": f"locked_{scope}",
        "seed": int(config["seed"]),
        "months": months,
        "train": {"months": []},
        "validation": {"months": []},
        "test": {"months": months},
        "negative_receivers_per_tx_slot": 4,
        "space_weather_run_id": f"{config['run_id']}_{scope}_gate",
        "gates": {"max_exposure_weight_error_fraction": 0.03},
        "compute": {
            "duckdb_threads": int(
                config["compute"]["apple_silicon"]["duckdb_threads"]
            ),
            "duckdb_memory_limit": "80GB",
            "temp_root": config["compute"]["temp_root"],
        },
    }


def environment(config: dict[str, Any], namespace: str) -> dict[str, str]:
    value = dict(os.environ)
    value.update(
        {
            "PROPULSE_ARCHIVE_NAMESPACE": namespace,
            "PROPULSE_ML_DATA_ROOT": str(
                Path(config["compute"]["external_root"]) / "data"
            ),
            "PROPULSE_DUCKDB_THREADS": str(
                config["compute"]["apple_silicon"]["duckdb_threads"]
            ),
            "PROPULSE_DUCKDB_MEMORY_LIMIT": "80GB",
            "PROPULSE_ML_TEMP_ROOT": str(config["compute"]["temp_root"]),
        }
    )
    return value


def run(command: list[str], env: dict[str, str]) -> None:
    print("+ " + " ".join(command), flush=True)
    subprocess.run(command, cwd=ROOT, env=env, check=True)


def verify_source_freeze(path: Path = SOURCE_FREEZE) -> None:
    value = load_json(path)
    for name, item in value["sources"].items():
        source = ROOT / item["path"]
        if (
            not source.is_file()
            or source.stat().st_size != int(item["bytes"])
            or sha256(source) != str(item["sha256"])
        ):
            raise OutcomeProtocolError(f"frozen gate source changed: {name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--scope", choices=("december", "archive"), required=True)
    parser.add_argument("--attempt-id", required=True)
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config_path = Path(args.config).resolve()
    manifest_path = Path(args.manifest).resolve()
    config = load_json(config_path)
    validate_m5_runtime(config)
    manifest = load_json(manifest_path)
    resume_scope(manifest, args.scope, args.attempt_id)
    verify_source_freeze()
    months = list(
        map(
            str,
            config["phase4"]["gate_months"]
            if args.scope == "december"
            else config["phase5"]["locked_months"],
        )
    )
    external_root = Path(config["compute"]["external_root"])
    free_gb = shutil.disk_usage(external_root).free / 1024**3
    required_free = float(
        config["outcome_protocol"]["minimum_free_gb_before_acquisition"]
    )
    if free_gb < required_free:
        raise OutcomeProtocolError(
            f"gate acquisition requires {required_free:.0f} GiB free; found {free_gb:.1f}"
        )
    scoped = scoped_config(config, args.scope, months)
    namespace = str(scoped["archive_namespace"])
    data_config = (
        ROOT
        / "ml/data/manifests"
        / f"{config['run_id']}_{args.scope}_data_config.json"
    )
    atomic_write(data_config, scoped)
    env = environment(config, namespace)
    python = sys.executable
    stages = [
        [python, str(V3 / "download_sources.py"), "--config", str(data_config)],
        [python, str(V3 / "build_space_weather.py"), "--config", str(data_config)],
        [python, str(V3 / "build_bronze.py"), "--config", str(data_config)],
        [
            python,
            str(V3 / "build_source_manifest.py"),
            "--config",
            str(data_config),
        ],
        [
            python,
            str(V3 / "build_opportunities.py"),
            "--config",
            str(data_config),
            "--task",
            "hf",
        ],
        [
            python,
            str(V3 / "build_features.py"),
            "--config",
            str(data_config),
            "--task",
            "hf",
        ],
    ]
    for command in stages:
        run(command, env)
    # Keep manifest paths repository-relative through the ml/data symlink.
    data_root = ROOT / "ml/data"
    processed = data_root / "processed" / namespace
    dataset = processed / f"dataset_{scoped['run_id']}_hf.parquet"
    parts = [dataset / f"part-{index:03d}.parquet" for index in range(len(months))]
    if any(not path.is_file() for path in parts):
        raise FileNotFoundError([path for path in parts if not path.is_file()])
    opportunity_manifest = (
        data_root / "manifests" / f"{scoped['run_id']}_hf_opportunities.json"
    )
    source_manifest = data_root / "manifests" / f"{scoped['run_id']}_sources.json"
    result_dir = ROOT / "ml/results/propagation_v4_2" / config["run_id"]
    audit_path = result_dir / f"{args.scope}_integrity_audit.json"
    audit_command = [
        python,
        str(MODULE / "audit_locked_dataset.py"),
        "--config",
        str(config_path),
        "--manifest",
        str(manifest_path),
        "--scope",
        args.scope,
        "--attempt-id",
        args.attempt_id,
        "--opportunity-manifest",
        str(opportunity_manifest),
        "--source-manifest",
        str(source_manifest),
        "--output",
        str(audit_path),
        "--profile",
        "m5",
    ]
    for month, path in zip(months, parts):
        audit_command.extend(["--dataset", f"{month}={path}"])
    run(audit_command, env)
    output = {
        "schema_version": 1,
        "scope": args.scope,
        "attempt_id": args.attempt_id,
        "months": months,
        "free_gb_before_acquisition": free_gb,
        "data_config": data_config.relative_to(ROOT).as_posix(),
        "namespace": namespace,
        "datasets": {
            month: path.relative_to(ROOT).as_posix()
            for month, path in zip(months, parts)
        },
        "integrity_audit": audit_path.relative_to(ROOT).as_posix(),
        "opportunity_manifest": opportunity_manifest.relative_to(ROOT).as_posix(),
        "source_manifest": source_manifest.relative_to(ROOT).as_posix(),
        "passed": True,
    }
    output_path = result_dir / f"{args.scope}_data_preparation.json"
    atomic_write(output_path, output)
    print(output_path)


if __name__ == "__main__":
    main()
