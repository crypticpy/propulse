#!/usr/bin/env python3
"""Train V4.2 Phase 2 rolling folds with bounded XGBoost external memory."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
import platform
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import xgboost as xgb


ROOT = Path(__file__).resolve().parents[3]
V4 = ROOT / "ml/src/archive_v4"
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(V4))
sys.path.insert(0, str(MODULE))

from external_memory import ParquetDataIter  # noqa: E402
from phase2_core import (  # noqa: E402
    EXPECTED_CANDIDATES,
    EXPECTED_FOLDS,
    Phase2Error,
    validate_config,
)
from train_validation import (  # noqa: E402
    CALIBRATION_SELECTION_PROTOCOL,
    load_predictions,
    peak_rss_gb,
    select_calibrator,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V4_RESULTS = ROOT / "ml/results/propagation_v4/propagation_v4_multiyear_50m/development_results.json"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
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


def utc_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def verify_artifact(item: dict[str, Any], *, hash_file: bool = True) -> Path:
    path = ROOT / item["path"]
    if path.stat().st_size != int(item["bytes"]):
        raise Phase2Error(f"artifact size changed: {item['path']}")
    if hash_file and sha256(path) != item["sha256"]:
        raise Phase2Error(f"artifact hash changed: {item['path']}")
    return path


def ensure_model_root(config: dict[str, Any], scale: int) -> tuple[Path, Path]:
    model_root = Path(config["compute"]["external_root"]) / "models/archive_v4_2"
    external = model_root / config["run_id"] / f"{scale // 1_000_000}m"
    external.mkdir(parents=True, exist_ok=True)
    link = ROOT / "ml/models/archive_v4_2"
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.exists():
        if link.resolve() != model_root.resolve():
            raise Phase2Error(f"model path resolves outside external storage: {link}")
    else:
        link.symlink_to(model_root, target_is_directory=True)
    return external, link / config["run_id"] / external.name


def artifact(path: Path, repository_path: Path) -> dict[str, Any]:
    return {
        "path": repository_path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def v4_features() -> list[str]:
    result = load_json(V4_RESULTS)["candidates"]["M2_nowcast"]
    return [str(value) for value in result["features"]]


def train_fold(
    candidate: str,
    fold: str,
    config: dict[str, Any],
    manifest: dict[str, Any],
    scale: int,
    features: list[str],
    external_models: Path,
    repository_models: Path,
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    definition = config["candidates"][candidate]
    cohort_item = manifest["cohorts"][candidate][fold]
    early_item = manifest["early_stopping"][fold]
    cohort_path = verify_artifact(cohort_item)
    early_path = verify_artifact(early_item)
    started = time.monotonic()
    cache = Path(config["compute"]["temp_root"]) / "xgboost-cache" / f"{scale}"
    cache.mkdir(parents=True, exist_ok=True)
    train_iterator = ParquetDataIter(
        cohort_path,
        features,
        weight_column=str(definition["weight"]),
        cache_prefix=str(cache / f"{candidate}-{fold}-train"),
        batch_size=int(config["training"]["batch_rows"]),
    )
    early_iterator = ParquetDataIter(
        early_path,
        features,
        weight_column="opportunities",
        cache_prefix=str(cache / f"{candidate}-{fold}-early"),
        batch_size=int(config["training"]["batch_rows"]),
    )
    train_matrix = xgb.ExtMemQuantileDMatrix(train_iterator, max_bin=255)
    early_matrix = xgb.ExtMemQuantileDMatrix(
        early_iterator, max_bin=255, ref=train_matrix
    )
    parameters = dict(config["training"]["parameters"])
    parameters["seed"] = int(config["seed"])
    prior_rounds = int(previous["rounds_completed"]) if previous else 0
    total_rounds = int(config["training"]["num_boost_round"])
    if prior_rounds >= total_rounds:
        raise Phase2Error("continuation checkpoint already reached the configured ceiling")
    history: dict[str, dict[str, list[float]]] = {}
    checkpoint = None
    if previous:
        checkpoint = xgb.Booster()
        checkpoint.load_model(verify_artifact(previous["model"]))
    model = xgb.train(
        parameters,
        train_matrix,
        num_boost_round=total_rounds - prior_rounds,
        evals=[(early_matrix, "early_stopping")],
        early_stopping_rounds=int(config["training"]["early_stopping_rounds"]),
        evals_result=history,
        verbose_eval=100,
        xgb_model=checkpoint,
    )
    new_history = list(map(float, history["early_stopping"]["logloss"]))
    old_history = (
        list(map(float, previous["evaluation_history"]["early_stopping"]["logloss"]))
        if previous
        else []
    )
    combined_history = old_history + new_history
    best = int(np.argmin(np.asarray(combined_history, dtype=np.float64)))
    completed_rounds = int(model.num_boosted_rounds())
    segment_seconds = time.monotonic() - started
    segments = list(previous.get("training_segments", [])) if previous else []
    if previous and not segments:
        segments.append(
            {
                "start_round": 0,
                "rounds_completed": prior_rounds,
                "seconds": float(previous["seconds"]),
                "reason": "initial preregistered 1,200-round segment",
            }
        )
    segments.append(
        {
            "start_round": prior_rounds,
            "rounds_completed": len(new_history),
            "seconds": segment_seconds,
            "reason": (
                "capacity amendment continuation"
                if previous
                else "initial configured training segment"
            ),
        }
    )
    model_path = external_models / f"{candidate}_{fold}.json"
    model.save_model(model_path)
    output: dict[str, Any] = {
        "candidate": candidate,
        "fold": fold,
        "early_stopping_month": config["rolling_folds"][fold]["early_stopping_month"],
        "definition": definition,
        "features": features,
        "feature_count": len(features),
        "training_mode": "external_memory_quantile",
        "train_rows": int(train_matrix.num_row()),
        "early_stopping_rows": int(early_matrix.num_row()),
        "best_iteration": best,
        "best_score": float(combined_history[best]),
        "rounds_completed": completed_rounds,
        "evaluation_history": {"early_stopping": {"logloss": combined_history}},
        "continued_from_checkpoint": previous is not None,
        "training_segments": segments,
        "model": artifact(model_path, repository_models / model_path.name),
        "seconds": float(previous["seconds"] if previous else 0.0) + segment_seconds,
        "peak_rss_gb": max(
            float(previous["peak_rss_gb"] if previous else 0.0), peak_rss_gb()
        ),
    }
    if fold == config["final_fold"]:
        calibration_item = manifest["calibration"]
        calibration_path = verify_artifact(calibration_item)
        calibration = load_predictions(
            model,
            best,
            calibration_path,
            features,
            [str(config["calibration_month"])],
        )
        calibrator, comparison = select_calibrator(calibration)
        calibrator_path = external_models / f"{candidate}_{fold}.joblib"
        joblib.dump(calibrator, calibrator_path)
        output.update(
            {
                "calibration_method": calibrator.method,
                "calibration_selection_protocol": CALIBRATION_SELECTION_PROTOCOL.replace(
                    "April", "August"
                ),
                "calibrator_comparison": comparison,
                "calibrator": artifact(
                    calibrator_path, repository_models / calibrator_path.name
                ),
            }
        )
        del calibration, calibrator
    importance = model.get_score(importance_type="gain")
    output["feature_importance_gain"] = sorted(
        [
            {"feature": features[int(key[1:])], "gain": float(value)}
            for key, value in importance.items()
        ],
        key=lambda row: row["gain"],
        reverse=True,
    )
    del train_matrix, early_matrix, train_iterator, early_iterator, model, checkpoint
    gc.collect()
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--scale", type=int, required=True)
    parser.add_argument("--candidate", choices=EXPECTED_CANDIDATES)
    parser.add_argument("--fold", choices=EXPECTED_FOLDS)
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    validate_config(config)
    scale = int(args.scale)
    if scale not in [int(value) for value in config["sampling"]["scales"]]:
        raise Phase2Error(f"scale is not preregistered: {scale}")
    manifest_path = (
        ROOT
        / "ml/data/manifests"
        / f"propagation_v4_2_phase2_{scale // 1_000_000}m_cohorts.json"
    )
    manifest = load_json(manifest_path)
    if int(manifest["scale"]) != scale:
        raise Phase2Error("cohort manifest scale mismatch")
    if manifest["december_2024_read"] or manifest["locked_2025_read"]:
        raise Phase2Error("cohort manifest reports locked outcome access")
    features = v4_features()
    external_models, repository_models = ensure_model_root(config, scale)
    result_dir = ROOT / "ml/results/propagation_v4_2" / config["run_id"]
    result_dir.mkdir(parents=True, exist_ok=True)
    result_path = result_dir / f"training_{scale // 1_000_000}m_results.json"
    if result_path.exists():
        output = load_json(result_path)
    else:
        output = {
            "schema_version": 1,
            "generated_at": utc_now(),
            "run_id": config["run_id"],
            "scale": scale,
            "scope": "development_only",
            "december_2024_read": False,
            "locked_2025_read": False,
            "training_contract": config["training"],
            "cohort_manifest": manifest_path.relative_to(ROOT).as_posix(),
            "candidates": {},
            "environment": {
                "python": platform.python_version(),
                "xgboost": xgb.__version__,
                "platform": platform.platform(),
            },
        }
    output["training_contract"] = config["training"]
    requested_candidates = [args.candidate] if args.candidate else list(EXPECTED_CANDIDATES)
    requested_folds = [args.fold] if args.fold else list(EXPECTED_FOLDS)
    for candidate in requested_candidates:
        output["candidates"].setdefault(candidate, {})
        for fold in requested_folds:
            if fold in output["candidates"][candidate]:
                info = output["candidates"][candidate][fold]
                verify_artifact(info["model"])
                if fold == config["final_fold"]:
                    verify_artifact(info["calibrator"])
                rounds = int(info["rounds_completed"])
                best = int(info["best_iteration"])
                ceiling = int(config["training"]["num_boost_round"])
                patience = int(config["training"]["early_stopping_rounds"])
                should_continue = rounds < ceiling and best >= rounds - patience
                if not should_continue:
                    print(f"reuse {candidate} {fold}", flush=True)
                    continue
                print(f"continue {candidate} {fold} from {rounds}", flush=True)
                output["candidates"][candidate][fold] = train_fold(
                    candidate,
                    fold,
                    config,
                    manifest,
                    scale,
                    features,
                    external_models,
                    repository_models,
                    previous=info,
                )
                output["generated_at"] = utc_now()
                atomic_write(result_path, output)
                continue
            print(f"train {candidate} {fold}", flush=True)
            output["candidates"][candidate][fold] = train_fold(
                candidate,
                fold,
                config,
                manifest,
                scale,
                features,
                external_models,
                repository_models,
            )
            output["generated_at"] = utc_now()
            atomic_write(result_path, output)
    print(result_path)


if __name__ == "__main__":
    main()
