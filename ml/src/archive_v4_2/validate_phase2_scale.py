#!/usr/bin/env python3
"""Independently validate V4.2 Phase 2 cohort, training, and scoring evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE))

from phase2_core import (  # noqa: E402
    EXPECTED_CANDIDATES,
    EXPECTED_FOLDS,
    Phase2Error,
    validate_config,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def check_artifact(item: dict[str, Any]) -> tuple[bool, str]:
    path = ROOT / item["path"]
    if not path.is_file():
        return False, f"missing {item['path']}"
    if path.stat().st_size != int(item["bytes"]):
        return False, f"size mismatch {item['path']}"
    if sha256(path) != item["sha256"]:
        return False, f"hash mismatch {item['path']}"
    return True, item["path"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--scale", type=int, required=True)
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    validate_config(config)
    scale = int(args.scale)
    result_dir = ROOT / "ml/results/propagation_v4_2" / config["run_id"]
    manifest_path = (
        ROOT
        / "ml/data/manifests"
        / f"propagation_v4_2_phase2_{scale // 1_000_000}m_cohorts.json"
    )
    training_path = result_dir / f"training_{scale // 1_000_000}m_results.json"
    evaluation_path = result_dir / f"evaluation_{scale // 1_000_000}m_results.json"
    manifest = load_json(manifest_path)
    training = load_json(training_path)
    evaluation = load_json(evaluation_path)
    checks: list[dict[str, Any]] = []

    def add(name: str, passed: bool, detail: Any) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    add("manifest scale", int(manifest["scale"]) == scale, manifest["scale"])
    add("training scale", int(training["scale"]) == scale, training["scale"])
    add("evaluation scale", int(evaluation["scale"]) == scale, evaluation["scale"])
    add(
        "locked outcomes remain closed",
        not any(
            bool(value.get(field))
            for value in (manifest, training, evaluation)
            for field in ("december_2024_read", "locked_2025_read")
        ),
        "December 2024 and 2025 flags are false",
    )
    add(
        "candidate inventory",
        tuple(manifest["cohorts"]) == EXPECTED_CANDIDATES
        and tuple(training["candidates"]) == EXPECTED_CANDIDATES,
        list(training["candidates"]),
    )
    cohort_artifacts = []
    nested = []
    cohort_rows = []
    for candidate in EXPECTED_CANDIDATES:
        for fold in EXPECTED_FOLDS:
            item = manifest["cohorts"][candidate][fold]
            cohort_rows.append(int(item["rows"]) == scale)
            cohort_artifacts.append(check_artifact(item)[0])
            if fold == config["final_fold"]:
                nested.append(bool(item["phase1_nestedness"]["exact_phase1_key_subset"]))
    add("exact cohort rows", all(cohort_rows), f"{len(cohort_rows)} candidate-fold entries")
    add("cohort hashes", all(cohort_artifacts), f"{sum(cohort_artifacts)}/{len(cohort_artifacts)}")
    add("Phase 1 nestedness", all(nested), nested)
    sample_artifacts = [
        check_artifact(manifest["early_stopping"][fold])[0] for fold in EXPECTED_FOLDS
    ] + [check_artifact(manifest["calibration"])[0]]
    add("fold sample hashes", all(sample_artifacts), f"{sum(sample_artifacts)}/{len(sample_artifacts)}")

    training_complete = True
    training_modes = []
    training_rows = []
    model_artifacts = []
    iterations = []
    feature_contracts = []
    reference_features: list[str] | None = None
    for candidate in EXPECTED_CANDIDATES:
        folds = training["candidates"].get(candidate, {})
        training_complete &= tuple(folds) == EXPECTED_FOLDS
        for fold in EXPECTED_FOLDS:
            item = folds[fold]
            training_modes.append(item["training_mode"] == "external_memory_quantile")
            training_rows.append(int(item["train_rows"]) == scale)
            model_artifacts.append(check_artifact(item["model"])[0])
            best = int(item["best_iteration"])
            iterations.append(0 <= best < int(config["training"]["num_boost_round"]))
            features = list(map(str, item["features"]))
            if reference_features is None:
                reference_features = features
            feature_contracts.append(features == reference_features)
            if fold == config["final_fold"]:
                model_artifacts.append(check_artifact(item["calibrator"])[0])
    add("rolling folds complete", training_complete, list(EXPECTED_FOLDS))
    add("external-memory mode", all(training_modes), training_modes)
    add("training row counts", all(training_rows), training_rows)
    add("model and calibrator hashes", all(model_artifacts), f"{sum(model_artifacts)}/{len(model_artifacts)}")
    add("best iterations in bounds", all(iterations), iterations)
    add("feature order parity", all(feature_contracts), len(reference_features or []))

    expected_rows = sum(int(value["rows"]) for value in evaluation["evaluation_inputs"].values())
    add("evaluation row count", int(evaluation["rows"]) == expected_rows, expected_rows)
    input_hashes = [
        bool(value["sha256_verified_this_run"])
        and check_artifact(value)[0]
        for value in evaluation["evaluation_inputs"].values()
    ]
    add("evaluation input hashes", all(input_hashes), input_hashes)
    add(
        "evaluation months",
        list(evaluation["evaluation_months"]) == list(config["evaluation_months"]),
        evaluation["evaluation_months"],
    )
    expected_variants = {
        "B2_frozen_v3",
        "A6_recent_recency_blend",
        *{f"{name}:raw" for name in EXPECTED_CANDIDATES},
        *{f"{name}:calibrated" for name in EXPECTED_CANDIDATES},
    }
    add("metric variant inventory", set(evaluation["metrics"]) == expected_variants, sorted(evaluation["metrics"]))
    finite_metrics = []
    opportunity_values = []
    for value in evaluation["metrics"].values():
        overall = value["overall"]
        finite_metrics.extend(
            math.isfinite(float(overall[name]))
            for name in (
                "weighted_brier",
                "weighted_log_loss",
                "weighted_mae",
                "expected_calibration_error",
            )
        )
        opportunity_values.append(float(overall["opportunities"]))
    add("finite primary metrics", all(finite_metrics), len(finite_metrics))
    add(
        "common evaluation opportunity mass",
        max(opportunity_values) - min(opportunity_values) <= 1e-5,
        opportunity_values,
    )
    selection_names = {
        str(value["candidate"]) for value in evaluation["selection"]["rows"]
    }
    add(
        "selection inventory",
        selection_names == {*EXPECTED_CANDIDATES, "A6_recent_recency_blend"},
        sorted(selection_names),
    )
    selected = list(evaluation["selection"]["advance_to_50m"])
    add(
        "50M component cap",
        len(selected) <= int(config["advancement"]["maximum_50m_components"])
        and set(selected) <= set(EXPECTED_CANDIDATES),
        selected,
    )
    grid = evaluation["a6_policy_selection"]["grid"]
    selected_weight = float(evaluation["a6_policy_selection"]["selected_left_weight"])
    add(
        "A6 grid selection",
        any(math.isclose(selected_weight, float(row["left_weight"])) for row in grid)
        and math.isclose(
            float(evaluation["a6_policy_selection"]["selected_brier"]),
            min(float(row["weighted_brier"]) for row in grid),
        ),
        selected_weight,
    )
    add(
        "memory budget",
        bool(evaluation["compute"]["memory_limit_respected"])
        and float(evaluation["compute"]["peak_rss_gb"])
        <= float(config["compute"]["maximum_rss_gb"]),
        evaluation["compute"],
    )
    passed = all(value["passed"] for value in checks)
    output = {
        "schema_version": 1,
        "run_id": config["run_id"],
        "scale": scale,
        "passed": passed,
        "checks": checks,
    }
    output_path = result_dir / f"validation_{scale // 1_000_000}m.json"
    atomic_write(output_path, output)
    if not passed:
        failures = [value["name"] for value in checks if not value["passed"]]
        raise Phase2Error(f"Phase 2 validation failed: {failures}")
    print(f"Phase 2 {scale // 1_000_000}M validation: OK ({len(checks)} checks)")


if __name__ == "__main__":
    main()
