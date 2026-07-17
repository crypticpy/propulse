#!/usr/bin/env python3
"""Train the controlled 5M V4.2 Phase 1 ablations on the M5."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
import platform
import sys
import time
from pathlib import Path
from typing import Any

import joblib
import pyarrow.dataset as ds
import xgboost as xgb


ROOT = Path(__file__).resolve().parents[3]
V4 = ROOT / "ml/src/archive_v4"
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(V4))
sys.path.insert(0, str(MODULE))

from phase1_core import EXPECTED_CANDIDATES, Phase1Error, validate_config  # noqa: E402

from train_validation import (  # noqa: E402
    CALIBRATION_SELECTION_PROTOCOL,
    in_memory_quantile_matrix,
    load_predictions,
    peak_rss_gb,
    select_calibrator,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase1_5m.json"
COHORT_MANIFEST = ROOT / "ml/data/manifests/propagation_v4_2_phase1_5m_cohorts.json"
V3_RESULTS = ROOT / "ml/results/archive_v3/archive_v3_eight_month/hf_results.json"
V4_RESULTS = ROOT / "ml/results/propagation_v4/propagation_v4_multiyear_50m/development_results.json"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def ensure_model_root(config: dict[str, Any]) -> tuple[Path, Path]:
    model_root = Path(config["compute"]["external_root"]) / "models/archive_v4_2"
    external = model_root / config["run_id"]
    external.mkdir(parents=True, exist_ok=True)
    link = ROOT / "ml/models/archive_v4_2"
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.exists():
        if link.resolve() != model_root.resolve():
            raise Phase1Error(f"model path resolves outside external storage: {link}")
    else:
        link.symlink_to(model_root, target_is_directory=True)
    return external, link / config["run_id"]


def candidate_inputs(
    candidate: dict[str, Any],
    cohorts: dict[str, Any],
) -> tuple[Path | list[Path], ds.Expression | None]:
    name = candidate["cohort"]
    if name == "existing_balanced":
        root = ROOT / cohorts["existing_balanced"]["path"]
        paths = sorted(root.rglob("*.parquet"))
        if not paths:
            raise FileNotFoundError(root)
        return paths, ds.field("in_sample_5000000") == True  # noqa: E712
    return ROOT / cohorts["cohorts"][name]["path"], None


def feature_contracts() -> tuple[list[str], list[str]]:
    v3 = load_json(V3_RESULTS)["profiles"]["nowcast"]
    v4 = load_json(V4_RESULTS)["candidates"]["M2_nowcast"]
    v3_features = [str(value) for value in v3["features"]]
    v4_features = [str(value) for value in v4["features"]]
    if not set(v3_features).issubset(v4_features):
        raise Phase1Error("V3 feature contract is not a subset of V4")
    return v3_features, v4_features


def artifact(path: Path, repository_path: Path) -> dict[str, Any]:
    return {
        "path": repository_path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def train_candidate(
    name: str,
    definition: dict[str, Any],
    config: dict[str, Any],
    cohorts: dict[str, Any],
    v3_features: list[str],
    v4_features: list[str],
    external_models: Path,
    repository_models: Path,
) -> dict[str, Any]:
    features = v3_features if definition["features"] == "v3" else v4_features
    paths, sample_filter = candidate_inputs(definition, cohorts)
    early_path = ROOT / cohorts["early_stopping"]["path"]
    calibration_path = ROOT / cohorts["calibration"]["path"]
    started = time.monotonic()
    train_matrix = in_memory_quantile_matrix(
        paths,
        features,
        weight_column=str(definition["weight"]),
        filter_expression=sample_filter,
    )
    early_matrix = in_memory_quantile_matrix(
        early_path,
        features,
        weight_column="opportunities",
        filter_expression=None,
        ref=train_matrix,
    )
    parameters = dict(config["training"]["parameters"])
    parameters["seed"] = int(config["seed"])
    model = xgb.train(
        parameters,
        train_matrix,
        num_boost_round=int(config["training"]["num_boost_round"]),
        evals=[(early_matrix, "early_stopping")],
        early_stopping_rounds=int(config["training"]["early_stopping_rounds"]),
        verbose_eval=100,
    )
    best = int(model.best_iteration)
    calibration = load_predictions(
        model,
        best,
        calibration_path,
        features,
        list(config["data_roles"]["calibration"]),
    )
    calibrator, calibration_comparison = select_calibrator(calibration)
    model_path = external_models / f"{name}.json"
    calibrator_path = external_models / f"{name}.joblib"
    model.save_model(model_path)
    joblib.dump(calibrator, calibrator_path)
    importance = model.get_score(importance_type="gain")
    output = {
        "candidate": name,
        "definition": definition,
        "features": features,
        "feature_count": len(features),
        "train_rows": int(train_matrix.num_row()),
        "early_stopping_rows": int(early_matrix.num_row()),
        "best_iteration": best,
        "calibration_method": calibrator.method,
        "calibration_selection_protocol": CALIBRATION_SELECTION_PROTOCOL.replace(
            "April", "August"
        ),
        "calibrator_comparison": calibration_comparison,
        "feature_importance_gain": sorted(
            [
                {"feature": features[int(key[1:])], "gain": float(value)}
                for key, value in importance.items()
            ],
            key=lambda row: row["gain"],
            reverse=True,
        ),
        "model": artifact(model_path, repository_models / model_path.name),
        "calibrator": artifact(
            calibrator_path, repository_models / calibrator_path.name
        ),
        "seconds": time.monotonic() - started,
        "peak_rss_gb": peak_rss_gb(),
    }
    del train_matrix, early_matrix, calibration, calibrator, model
    gc.collect()
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--candidate", choices=EXPECTED_CANDIDATES)
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    validate_config(config)
    cohorts = load_json(COHORT_MANIFEST)
    if cohorts.get("december_2024_read") or cohorts.get("locked_2025_read"):
        raise Phase1Error("cohort manifest reports locked outcome access")
    v3_features, v4_features = feature_contracts()
    external_models, repository_models = ensure_model_root(config)
    result_dir = ROOT / "ml/results/propagation_v4_2" / config["run_id"]
    result_dir.mkdir(parents=True, exist_ok=True)
    result_path = result_dir / "training_results.json"
    if result_path.exists():
        output = load_json(result_path)
    else:
        output = {
            "schema_version": 1,
            "generated_at": utc_now(),
            "run_id": config["run_id"],
            "scope": "development_only",
            "december_2024_read": False,
            "locked_2025_read": False,
            "training_contract": config["training"],
            "cohort_manifest": COHORT_MANIFEST.relative_to(ROOT).as_posix(),
            "candidates": {},
            "environment": {
                "python": platform.python_version(),
                "xgboost": xgb.__version__,
                "platform": platform.platform(),
            },
        }
    requested = [args.candidate] if args.candidate else list(EXPECTED_CANDIDATES)
    for name in requested:
        if name in output["candidates"]:
            model = ROOT / output["candidates"][name]["model"]["path"]
            calibrator = ROOT / output["candidates"][name]["calibrator"]["path"]
            if model.exists() and calibrator.exists():
                print(f"reuse {name}", flush=True)
                continue
            raise Phase1Error(f"checkpoint artifacts are missing for {name}")
        print(f"train {name}", flush=True)
        output["candidates"][name] = train_candidate(
            name,
            config["candidates"][name],
            config,
            cohorts,
            v3_features,
            v4_features,
            external_models,
            repository_models,
        )
        output["generated_at"] = utc_now()
        temporary = result_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, result_path)
    print(result_path)


if __name__ == "__main__":
    main()
