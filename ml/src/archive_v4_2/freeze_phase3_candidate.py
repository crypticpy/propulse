#!/usr/bin/env python3
"""Freeze the complete V4.2 candidate and outcome protocol before December."""

from __future__ import annotations

import argparse
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
import numpy as np
import polars as pl
import pyarrow as pa
import xgboost as xgb


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE))

from outcome_protocol import (  # noqa: E402
    OutcomeProtocolError,
    artifact,
    atomic_write,
    freeze_artifact,
    initialize,
    load_json,
    mark_candidate_frozen,
    resolve_manifest,
)
from train_phase2_scale import validate_m5_runtime  # noqa: E402
from feature_contract import is_v2  # noqa: E402
import run_paths  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V3_RESULTS = ROOT / "ml/results/archive_v3/archive_v3_eight_month/hf_results.json"


SOURCE_FILES = {
    "v3_common": ROOT / "ml/src/archive_v3/common.py",
    "v3_download": ROOT / "ml/src/archive_v3/download_sources.py",
    "v3_space_weather": ROOT / "ml/src/archive_v3/build_space_weather.py",
    "v3_bronze": ROOT / "ml/src/archive_v3/build_bronze.py",
    "v3_source_manifest": ROOT / "ml/src/archive_v3/build_source_manifest.py",
    "v3_opportunities": ROOT / "ml/src/archive_v3/build_opportunities.py",
    "v3_features": ROOT / "ml/src/archive_v3/build_features.py",
    "v4_2_prepare_gate": MODULE / "prepare_locked_gate.py",
    "v4_2_audit_gate": MODULE / "audit_locked_dataset.py",
    "live_opportunity_transform": ROOT / "ml/src/propagation_live/opportunity_transform.py",
}


def git_commit() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def checked(path: Path, name: str) -> dict[str, Any]:
    value = load_json(path)
    if not value.get("passed"):
        raise OutcomeProtocolError(f"required freeze input did not pass: {name}")
    if value.get("december_2024_read") or value.get("locked_2025_read"):
        raise OutcomeProtocolError(f"freeze input reports locked access: {name}")
    return value


def training_profile_fields(
    training_profile: str, config: dict[str, Any]
) -> dict[str, Any]:
    """Environment fields recording which host trained the frozen candidate.

    V1 (m5) freezes keep exactly the pre-existing keys; a linux_gpu freeze adds
    the CUDA hardware contract alongside them.
    """
    fields: dict[str, Any] = {"training_profile": training_profile}
    if training_profile == "linux_gpu":
        fields["linux_gpu_contract"] = config["compute"]["linux_gpu"]
    return fields


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--manifest")
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config_path = Path(args.config).resolve()
    config = load_json(config_path)
    manifest_path = resolve_manifest(args.manifest, config)
    result = run_paths.results_dir(config)
    runtime = validate_m5_runtime(config)
    v3_results = load_json(V3_RESULTS)
    b2_info = v3_results["profiles"]["nowcast"]
    b2_model_path = ROOT / str(b2_info["model_path"])
    b2_calibrator_path = b2_model_path.with_suffix(".isotonic.joblib")
    training_path = run_paths.training_results_path(config, 50_000_000)
    evaluation_path = run_paths.evaluation_results_path(config, 50_000_000)
    validation_path = run_paths.validation_results_path(config, 50_000_000)
    phase2_report_path = result / "REPORT.artifact.json"
    phase2_html_path = result / "REPORT.html"
    serving_path = run_paths.serving_manifest_path(config)
    phase3_path = run_paths.phase3_validation_path(config)
    synthetic_path = run_paths.synthetic_gate_dir(config) / "report_validation.json"
    evaluation = load_json(evaluation_path)
    if evaluation.get("final_candidate_selection") is None:
        raise OutcomeProtocolError("no 50M candidate is eligible to freeze")
    checked(validation_path, "50M validation")
    checked(phase3_path, "Phase 3 validation")
    synthetic = checked(synthetic_path, "synthetic report validation")
    if not synthetic.get("synthetic"):
        raise OutcomeProtocolError("dry-run report is not labeled synthetic")
    required_files = (
        training_path,
        phase2_report_path,
        phase2_html_path,
        serving_path,
        run_paths.prediction_thread_benchmark_path(config),
        V3_RESULTS,
        b2_model_path,
        b2_calibrator_path,
    )
    missing = [path for path in required_files if not path.is_file()]
    if missing:
        raise FileNotFoundError(missing)
    training_results = load_json(training_path)
    training_profile = str(training_results.get("training_profile", "m5"))
    source_freeze_path = run_paths.source_freeze_path(config)
    source_freeze = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "frozen_gate_data_pipeline",
        "december_2024_read": False,
        "locked_2025_read": False,
        "sources": {name: artifact(path) for name, path in SOURCE_FILES.items()},
    }
    atomic_write(source_freeze_path, source_freeze)
    environment_path = result / "candidate_environment.json"
    environment = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "frozen_phase3_candidate_environment",
        "december_2024_read": False,
        "locked_2025_read": False,
        "runtime": runtime,
        "platform": platform.platform(),
        "packages": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pyarrow": pa.__version__,
            "polars": pl.__version__,
            "duckdb": duckdb.__version__,
            "xgboost": xgb.__version__,
        },
        "git_commit_observed_on_m5": git_commit(),
        "note": (
            "Exact frozen source and artifact hashes are authoritative because "
            "the M5 worktree receives selected files by rsync."
        ),
        "apple_silicon_contract": config["compute"]["apple_silicon"],
        "source_pipeline_freeze": artifact(source_freeze_path),
        **training_profile_fields(training_profile, config),
    }
    atomic_write(environment_path, environment)
    initialize(manifest_path, config_path)
    frozen = {
        "config": config_path,
        "phase2_training_50m": training_path,
        "phase2_evaluation_50m": evaluation_path,
        "phase2_validation_50m": validation_path,
        "phase2_report_artifact": phase2_report_path,
        "phase2_report_html": phase2_html_path,
        "serving_candidate": serving_path,
        "phase3_validation": phase3_path,
        "phase3_packager": MODULE / "package_phase3_candidate.py",
        "phase3_validator": MODULE / "validate_phase3_candidate.py",
        "service_runtime": ROOT / "ml/service/app.py",
        "station_cast_adapter": ROOT / "ml/src/archive_v4/station_cast_adapter.py",
        "gate_scorer": MODULE / "score_locked_gate.py",
        "phase2_scoring_helpers": MODULE / "score_phase2_scale.py",
        "gate_scoring_core": MODULE / "gate_scoring.py",
        "outcome_protocol": MODULE / "outcome_protocol.py",
        "m5_runtime": MODULE / "m5_runtime.py",
        "training_runtime": MODULE / "train_phase2_scale.py",
        "b2_adapter": ROOT / "ml/src/archive_v4_1/b2_adapter.py",
        "v4_1_calibration": ROOT / "ml/src/archive_v4_1/calibration.py",
        "v3_b2_results": V3_RESULTS,
        "v3_b2_model": b2_model_path,
        "v3_b2_calibrator": b2_calibrator_path,
        "prediction_thread_benchmark": run_paths.prediction_thread_benchmark_path(
            config
        ),
        "gate_report_generator": MODULE / "generate_gate_report.py",
        "gate_report_dry_run_validation": synthetic_path,
        "candidate_environment": environment_path,
        "source_pipeline": source_freeze_path,
    }
    if is_v2(config):
        # The V2 contract adds modules the gate chain depends on. They are
        # frozen only for V2 so the V1 protocol manifest stays untouched.
        frozen.update(
            {
                "feature_contract": MODULE / "feature_contract.py",
                "run_paths": MODULE / "run_paths.py",
                "physics_trainer": MODULE / "train_phase3_physics.py",
            }
        )
    for name, path in frozen.items():
        freeze_artifact(manifest_path, name, path)
    manifest = mark_candidate_frozen(manifest_path)
    print(json.dumps({"manifest": str(manifest_path), "state": manifest["protocol_state"]}))


if __name__ == "__main__":
    main()
