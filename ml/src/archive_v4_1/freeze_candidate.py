#!/usr/bin/env python3
"""Freeze the complete candidate, scorer, environment, and access boundary."""

from __future__ import annotations

import argparse
import importlib.metadata
import platform
import subprocess
from pathlib import Path
from typing import Any

from protocol import DEFAULT_CONFIG, DEFAULT_MANIFEST, ProtocolError, artifact, atomic_write_json, freeze_artifact, load_json, mark_candidate_frozen, utc_now


ROOT = Path(__file__).resolve().parents[3]
RESULT_ROOT = ROOT / "ml/results/propagation_v4_1"
V41 = ROOT / "ml/src/archive_v4_1"


def git_output(*arguments: str) -> str:
    return subprocess.check_output(
        ["git", *arguments], cwd=ROOT, text=True
    ).strip()


def node_version() -> str:
    return subprocess.check_output(["node", "--version"], text=True).strip()


def artifacts(paths: list[Path]) -> list[dict[str, Any]]:
    return [artifact(path) for path in paths]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config_path = Path(args.config)
    config = load_json(config_path)
    manifest = load_json(DEFAULT_MANIFEST)
    if manifest["protocol_state"] not in {"development_opened", "candidate_frozen"}:
        raise ProtocolError(f"invalid pre-freeze state: {manifest['protocol_state']}")
    if manifest["november_gate_opened"] or manifest["locked_archive_test_opened"]:
        raise ProtocolError("candidate freeze cannot follow locked outcome access")
    selection = load_json(
        ROOT / manifest["frozen_artifacts"]["calibration_selection"]["path"]
    )
    if selection["primary_candidate"] != config["calibration"]["primary_candidate"]:
        raise ProtocolError("selected candidate differs from preregistration")

    result = RESULT_ROOT / config["run_id"]
    serving_public = result / "serving_candidate_manifest.json"
    candidate_validation = result / "candidate_validation.json"
    report_validation = result / "synthetic_dry_run/report_validation.json"
    b0_path = result / "b0_climatology.json"
    for path in (serving_public, candidate_validation, report_validation, b0_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    if not load_json(candidate_validation).get("passed"):
        raise ProtocolError("candidate validation did not pass")
    if not load_json(report_validation).get("passed"):
        raise ProtocolError("synthetic report validation did not pass")

    environment_path = result / "manifests/candidate_environment.json"
    environment = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "candidate_freeze",
        "platform": platform.platform(),
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "node": node_version(),
        "packages": {
            name: importlib.metadata.version(name)
            for name in (
                "duckdb",
                "joblib",
                "numpy",
                "polars",
                "pyarrow",
                "scikit-learn",
                "xgboost",
            )
        },
        "git_commit": git_output("rev-parse", "HEAD"),
        "package_lock": artifact(ROOT / "package-lock.json"),
        "november_gate_read": False,
        "locked_archive_test_read": False,
    }
    atomic_write_json(environment_path, environment)

    split_path = result / "manifests/splits.json"
    atomic_write_json(
        split_path,
        {
            "schema_version": 1,
            "generated_at": utc_now(),
            "run_id": config["run_id"],
            "roles": config["data_roles"],
            "calibration_input_inventory": manifest["frozen_artifacts"]["calibration_input_inventory"],
            "observed_engineering_selection_permitted": False,
            "november_gate_opened": False,
            "locked_archive_test_opened": False,
        },
    )

    v4_results_path = ROOT / config["frozen_candidates"]["v4_results"]
    v4_results = load_json(v4_results_path)
    m1 = v4_results["candidates"]["M1_physics"]
    m2 = v4_results["candidates"]["M2_nowcast"]
    p533_results_path = (
        ROOT
        / "ml/results/propagation_v4"
        / config["parent_run_id"]
        / "p533_validation_results.json"
    )
    p533 = load_json(p533_results_path)
    p533_calibrator = ROOT / p533["calibration"]["path"]
    source_manifest = result / "manifests/sources.json"

    candidate_path = result / "manifests/candidate_freeze.json"
    candidate = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "pre_november_candidate_freeze",
        "code_commit": environment["git_commit"],
        "primary_candidate": selection["primary_candidate"],
        "selected_global": selection["selection"]["selected_global"],
        "selected_bands": selection["selection"]["selected_bands"],
        "selected_band_distances": selection["selection"]["selected_band_distances"],
        "november_gate_read": False,
        "locked_archive_test_read": False,
        "core_and_baselines": {
            "B0_climatology": artifact(b0_path),
            "B1_p533_evidence": artifact(p533_results_path),
            "B1_p533_calibrator": artifact(p533_calibrator),
            "B2_frozen_v3": manifest["frozen_artifacts"]["b2_freeze"],
            "M1_model": artifact(ROOT / m1["model_path"]),
            "M1_calibrator": artifact(ROOT / m1["calibrator_path"]),
            "M2_model": artifact(ROOT / m2["model_path"]),
            "M2_v4_1_calibrator": manifest["frozen_artifacts"]["selected_calibrator"],
        },
        "evidence": {
            "source_manifest": artifact(source_manifest),
            "split_manifest": artifact(split_path),
            "environment": artifact(environment_path),
            "selection": manifest["frozen_artifacts"]["calibration_selection"],
            "daily_oof": manifest["frozen_artifacts"]["calibration_oof_daily"],
            "serving_candidate": artifact(serving_public),
            "candidate_validation": artifact(candidate_validation),
            "synthetic_report_validation": artifact(report_validation),
        },
        "release_approved": False,
    }
    atomic_write_json(candidate_path, candidate)

    scorer_sources = [
        V41 / name
        for name in (
            "audit_gate.py",
            "b2_adapter.py",
            "calibration.py",
            "gate_scoring.py",
            "protocol.py",
            "run_pipeline.py",
            "score_november_gate.py",
            "scoped_config.py",
        )
    ]
    scorer_path = result / "manifests/scorer_freeze.json"
    atomic_write_json(
        scorer_path,
        {
            "schema_version": 1,
            "generated_at": utc_now(),
            "run_id": config["run_id"],
            "scope": "pre_november_scorer_freeze",
            "code_commit": environment["git_commit"],
            "candidate_ids": config["calibration"]["candidate_ids"],
            "bootstrap_repetitions": config["calibration"]["bootstrap_repetitions"],
            "seed": config["seed"],
            "gates": config["gates"],
            "config": artifact(config_path),
            "sources": artifacts(scorer_sources),
            "candidate_freeze": artifact(candidate_path),
            "candidate_validation": artifact(candidate_validation),
            "synthetic_report_validation": artifact(report_validation),
            "november_gate_read": False,
            "locked_archive_test_read": False,
        },
    )

    for name, path in (
        ("candidate_environment", environment_path),
        ("split_manifest", split_path),
        ("serving_candidate", serving_public),
        ("candidate_validation", candidate_validation),
        ("synthetic_report_validation", report_validation),
        ("b0_climatology", b0_path),
        ("candidate_freeze", candidate_path),
        ("scorer_freeze", scorer_path),
    ):
        freeze_artifact(DEFAULT_MANIFEST, name, path)
    mark_candidate_frozen(DEFAULT_MANIFEST)
    print(candidate_path)


if __name__ == "__main__":
    main()
