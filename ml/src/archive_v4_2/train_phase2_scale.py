#!/usr/bin/env python3
"""Train V4.2 Phase 2 rolling folds with bounded XGBoost external memory."""

from __future__ import annotations

import argparse
import concurrent.futures
import copy
import gc
import hashlib
import json
import multiprocessing
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
    matrix_backend,
    scale_workset,
    validate_config,
)
from m5_runtime import (  # noqa: E402
    LINUX_GPU_PROFILE,
    M5_PROFILE,
    artifact_path,
    configure_arrow_threads,
    external_root as profile_external_root,
    maximum_rss_gb as profile_maximum_rss_gb,
    profile_settings,
    resolve_compute_profile,
    temp_root as profile_temp_root,
    validate_m5_runtime as validate_native_m5_runtime,
    validate_runtime as validate_native_runtime,
)
from train_validation import (  # noqa: E402
    CALIBRATION_SELECTION_PROTOCOL,
    load_predictions,
    peak_rss_gb,
    select_calibrator,
)
from feature_contract import (  # noqa: E402
    core_feature_contract,
    nowcast_features,
    physics_features_v2,
)
import run_paths  # noqa: E402


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


def verify_artifact(
    item: dict[str, Any],
    *,
    hash_file: bool = True,
    config: dict[str, Any] | None = None,
) -> Path:
    """Resolve a recorded artifact for the active profile and verify it.

    Without a config the path stays repository-relative, which is what every
    M5-only caller has always done.
    """
    path = artifact_path(str(item["path"]), config, repository_root=ROOT)
    if not path.is_file():
        raise Phase2Error(f"artifact is missing: {item['path']} -> {path}")
    if path.stat().st_size != int(item["bytes"]):
        raise Phase2Error(f"artifact size changed: {item['path']}")
    if hash_file and sha256(path) != item["sha256"]:
        raise Phase2Error(f"artifact hash changed: {item['path']}")
    return path


def ensure_model_root(config: dict[str, Any], scale: int) -> tuple[Path, Path]:
    model_root = profile_external_root(config) / "models/archive_v4_2"
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
    """The frozen 91-feature V1 nowcast order (archive-v4-features-v1)."""
    result = load_json(V4_RESULTS)["candidates"]["M2_nowcast"]
    return [str(value) for value in result["features"]]


def contract_features(config: dict[str, Any]) -> list[str]:
    """Nowcast feature order for the contract this config declares."""
    return nowcast_features(config, v4_features())


def contract_physics_features(config: dict[str, Any]) -> list[str]:
    """Physics feature order (nowcast order minus the path-history lags)."""
    if core_feature_contract(config) != "archive-v4-features-v2":
        raise Phase2Error(
            "physics retraining is only defined for archive-v4-features-v2"
        )
    return physics_features_v2(v4_features())


def training_parameters(config: dict[str, Any], profile: str) -> dict[str, Any]:
    """Fit parameters for a profile.

    Every learning parameter is shared, so the only difference between the M5
    and the CUDA box is where the trees are fit: the linux_gpu profile adds
    ``device`` and pins ``tree_method``/``nthread`` from its own contract.
    """
    parameters = dict(config["training"]["parameters"])
    parameters["seed"] = int(config["seed"])
    if profile == LINUX_GPU_PROFILE:
        hardware = profile_settings(config, profile)
        parameters["device"] = str(hardware["device"])
        parameters["tree_method"] = str(hardware["tree_method"])
        parameters["nthread"] = int(hardware["threads_per_parallel_fit"])
    return parameters


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
    model_stem: str | None = None,
    profile: str = M5_PROFILE,
    runtime: dict[str, Any] | None = None,
) -> dict[str, Any]:
    execution = profile_settings(config, profile)
    parameters = training_parameters(config, profile)
    training_threads = int(parameters["nthread"])
    arrow = configure_arrow_threads(
        config,
        parallel_fit=training_threads == int(execution["threads_per_parallel_fit"]),
        profile=profile,
    )
    definition = config["candidates"][candidate]
    cohort_item = manifest["cohorts"][candidate][fold]
    early_item = manifest["early_stopping"][fold]
    cohort_path = verify_artifact(cohort_item, config=config)
    early_path = verify_artifact(early_item, config=config)
    backend = matrix_backend(config, scale, profile)
    external_memory = backend == "external_memory_quantile"
    started = time.monotonic()
    cache = profile_temp_root(config) / "xgboost-cache" / f"{scale}"
    cache.mkdir(parents=True, exist_ok=True)
    train_iterator = ParquetDataIter(
        cohort_path,
        features,
        weight_column=str(definition["weight"]),
        cache_prefix=(
            str(cache / f"{candidate}-{fold}-train") if external_memory else None
        ),
        batch_size=int(config["training"]["batch_rows"]),
    )
    early_iterator = ParquetDataIter(
        early_path,
        features,
        weight_column="opportunities",
        cache_prefix=(
            str(cache / f"{candidate}-{fold}-early") if external_memory else None
        ),
        batch_size=int(config["training"]["batch_rows"]),
    )
    matrix_type = (
        xgb.ExtMemQuantileDMatrix if external_memory else xgb.QuantileDMatrix
    )
    train_matrix = matrix_type(train_iterator, max_bin=255)
    early_matrix = matrix_type(early_iterator, max_bin=255, ref=train_matrix)
    prior_rounds = int(previous["rounds_completed"]) if previous else 0
    total_rounds = int(config["training"]["num_boost_round"])
    if prior_rounds >= total_rounds:
        raise Phase2Error("continuation checkpoint already reached the configured ceiling")
    history: dict[str, dict[str, list[float]]] = {}
    checkpoint = None
    if previous:
        checkpoint = xgb.Booster()
        checkpoint.load_model(verify_artifact(previous["model"], config=config))
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
    stem = model_stem or f"{candidate}_{fold}"
    model_path = external_models / f"{stem}.json"
    model.save_model(model_path)
    train_rows = int(train_matrix.num_row())
    early_rows = int(early_matrix.num_row())
    importance = model.get_score(importance_type="gain")
    feature_importance = sorted(
        [
            {"feature": features[int(key[1:])], "gain": float(value)}
            for key, value in importance.items()
        ],
        key=lambda row: row["gain"],
        reverse=True,
    )
    del train_matrix, early_matrix, train_iterator, early_iterator, checkpoint
    gc.collect()
    output: dict[str, Any] = {
        "candidate": candidate,
        "fold": fold,
        "early_stopping_month": config["rolling_folds"][fold]["early_stopping_month"],
        "definition": definition,
        "features": features,
        "feature_count": len(features),
        "training_mode": backend,
        "training_profile": profile,
        "training_backend": str(execution["backend"]),
        "execution": {
            "machine": platform.machine(),
            "profile": profile,
            "xgboost_threads": training_threads,
            "device": str(parameters.get("device", "cpu")),
            "tree_method": str(parameters["tree_method"]),
            **arrow,
            "xgboost_openmp": bool(xgb.build_info().get("USE_OPENMP")),
            "xgboost_cuda": bool(xgb.build_info().get("USE_CUDA")),
            "runtime": runtime,
        },
        "train_rows": train_rows,
        "early_stopping_rows": early_rows,
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
        "feature_importance_gain": feature_importance,
    }
    if fold == config["final_fold"]:
        calibration_item = manifest["calibration"]
        calibration_path = verify_artifact(calibration_item, config=config)
        calibration = load_predictions(
            model,
            best,
            calibration_path,
            features,
            [str(config["calibration_month"])],
        )
        calibrator, comparison = select_calibrator(calibration)
        calibrator_path = external_models / f"{stem}.joblib"
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
    output["peak_rss_gb"] = max(output["peak_rss_gb"], peak_rss_gb())
    del model
    gc.collect()
    return output


def train_fold_task(task: dict[str, Any]) -> tuple[str, str, dict[str, Any]]:
    """Spawn-safe wrapper used by the bounded multi-fit scheduler."""
    candidate = str(task["candidate"])
    fold = str(task["fold"])
    print(f"worker train {candidate} {fold}", flush=True)
    result = train_fold(
        candidate,
        fold,
        task["config"],
        task["manifest"],
        int(task["scale"]),
        task["features"],
        Path(task["external_models"]),
        Path(task["repository_models"]),
        previous=task["previous"],
        model_stem=task.get("model_stem"),
        profile=str(task.get("profile", M5_PROFILE)),
        runtime=task.get("runtime"),
    )
    return candidate, fold, result


def fold_needs_training(
    info: dict[str, Any], config: dict[str, Any]
) -> bool:
    rounds = int(info["rounds_completed"])
    best = int(info["best_iteration"])
    ceiling = int(config["training"]["num_boost_round"])
    patience = int(config["training"]["early_stopping_rounds"])
    return rounds < ceiling and best >= rounds - patience


def parallel_config(
    config: dict[str, Any], workers: int, profile: str = M5_PROFILE
) -> dict[str, Any]:
    updated = copy.deepcopy(config)
    hardware = profile_settings(updated, profile)
    expected = int(hardware["parallel_fit_workers"])
    if workers != expected:
        raise Phase2Error(
            f"parallel run must use the preregistered {expected} workers, got {workers}"
        )
    updated["training"]["parameters"]["nthread"] = int(
        hardware["threads_per_parallel_fit"]
    )
    return updated


def validate_m5_runtime(config: dict[str, Any]) -> dict[str, Any]:
    return validate_native_m5_runtime(config, xgboost_module=xgb)


def validate_profile_runtime(config: dict[str, Any], profile: str) -> dict[str, Any]:
    return validate_native_runtime(config, profile, xgboost_module=xgb)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=(M5_PROFILE, LINUX_GPU_PROFILE), required=True)
    parser.add_argument(
        "--data-root-override",
        default=None,
        help=(
            "linux_gpu only: external storage root on the training box when it "
            "differs from the configured linux_gpu external_root."
        ),
    )
    parser.add_argument("--scale", type=int, required=True)
    parser.add_argument("--candidate", choices=EXPECTED_CANDIDATES)
    parser.add_argument("--fold", choices=EXPECTED_FOLDS)
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()
    profile = str(args.profile)
    config = load_json(Path(args.config))
    validate_config(config)
    config = resolve_compute_profile(
        config, profile, data_root_override=args.data_root_override
    )
    runtime = validate_profile_runtime(config, profile)
    scale = int(args.scale)
    if scale not in [int(value) for value in config["sampling"]["scales"]]:
        raise Phase2Error(f"scale is not preregistered: {scale}")
    manifest_path = run_paths.cohort_manifest_path(config, scale)
    manifest = load_json(manifest_path)
    if int(manifest["scale"]) != scale:
        raise Phase2Error("cohort manifest scale mismatch")
    if manifest["december_2024_read"] or manifest["locked_2025_read"]:
        raise Phase2Error("cohort manifest reports locked outcome access")
    phase2_20m_evaluation = (
        load_json(run_paths.evaluation_20m_path(config))
        if scale == 50_000_000
        else None
    )
    candidate_inventory, fold_inventory = scale_workset(
        config, scale, phase2_20m_evaluation
    )
    if tuple(manifest["cohorts"]) != candidate_inventory:
        raise Phase2Error("cohort manifest does not match the scale selection")
    if any(tuple(value) != fold_inventory for value in manifest["cohorts"].values()):
        raise Phase2Error("cohort manifest fold inventory does not match the scale")
    contract = core_feature_contract(config)
    features = contract_features(config)
    external_models, repository_models = ensure_model_root(config, scale)
    result_dir = run_paths.results_dir(config)
    result_dir.mkdir(parents=True, exist_ok=True)
    result_path = run_paths.training_results_path(config, scale)
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
            "core_feature_contract": contract,
            "training_contract": config["training"],
            "cohort_manifest": manifest_path.relative_to(ROOT).as_posix(),
            "candidates": {},
            "environment": {
                "python": platform.python_version(),
                "xgboost": xgb.__version__,
                "platform": platform.platform(),
            },
        }
    output["hardware_runtime"] = runtime
    output["core_feature_contract"] = contract
    output["training_contract"] = config["training"]
    output["training_profile"] = profile
    output["compute_profile"] = config["compute"]["active_profile"]
    if profile == LINUX_GPU_PROFILE:
        # backend_benchmark_decision.json is an M5 CPU-backend artifact; the
        # CUDA profile fits both scales in device memory and never runs it.
        output["backend_benchmark"] = str(
            profile_settings(config, profile)["backend_benchmark"]
        )
    if args.candidate and args.candidate not in candidate_inventory:
        raise Phase2Error(f"candidate did not advance to this scale: {args.candidate}")
    if args.fold and args.fold not in fold_inventory:
        raise Phase2Error(f"fold is not trained at this scale: {args.fold}")
    requested_candidates = [args.candidate] if args.candidate else list(candidate_inventory)
    requested_folds = [args.fold] if args.fold else list(fold_inventory)
    tasks: list[dict[str, Any]] = []
    for candidate in requested_candidates:
        output["candidates"].setdefault(candidate, {})
        for fold in requested_folds:
            previous = None
            if fold in output["candidates"][candidate]:
                info = output["candidates"][candidate][fold]
                verify_artifact(info["model"], config=config)
                if fold == config["final_fold"]:
                    verify_artifact(info["calibrator"], config=config)
                if not fold_needs_training(info, config):
                    print(f"reuse {candidate} {fold}", flush=True)
                    continue
                previous = info
                print(
                    f"queue continuation {candidate} {fold} "
                    f"from {int(info['rounds_completed'])}",
                    flush=True,
                )
            else:
                print(f"queue {candidate} {fold}", flush=True)
            tasks.append(
                {
                    "candidate": candidate,
                    "fold": fold,
                    "config": config,
                    "manifest": manifest,
                    "scale": scale,
                    "features": features,
                    "external_models": str(external_models),
                    "repository_models": str(repository_models),
                    "previous": previous,
                    "profile": profile,
                    "runtime": runtime,
                }
            )

    workers = int(args.workers)
    if workers < 1:
        raise Phase2Error("workers must be positive")
    if workers > 1 and len(tasks) > 1:
        worker_config = parallel_config(config, workers, profile)
        for task in tasks:
            task["config"] = worker_config
        output["execution_scheduler"] = {
            "workers": workers,
            "threads_per_fit": int(
                worker_config["training"]["parameters"]["nthread"]
            ),
            "total_requested_xgboost_threads": workers
            * int(worker_config["training"]["parameters"]["nthread"]),
            "method": "spawn_process_pool",
        }
        output["training_contract"] = worker_config["training"]
        completed_peaks: list[float] = []
        context = multiprocessing.get_context("spawn")
        with concurrent.futures.ProcessPoolExecutor(
            max_workers=workers, mp_context=context
        ) as executor:
            futures = [executor.submit(train_fold_task, task) for task in tasks]
            for future in concurrent.futures.as_completed(futures):
                candidate, fold, result = future.result()
                output["candidates"].setdefault(candidate, {})[fold] = result
                completed_peaks.append(float(result["peak_rss_gb"]))
                conservative_peak = sum(sorted(completed_peaks, reverse=True)[:workers])
                output["execution_scheduler"][
                    "conservative_peak_rss_upper_bound_gb"
                ] = conservative_peak
                output["generated_at"] = utc_now()
                atomic_write(result_path, output)
                if conservative_peak > profile_maximum_rss_gb(config):
                    raise Phase2Error(
                        "parallel fit RSS upper bound exceeded the configured ceiling"
                    )
                print(f"checkpoint {candidate} {fold}", flush=True)
    else:
        for task in tasks:
            candidate, fold, result = train_fold_task(task)
            output["candidates"].setdefault(candidate, {})[fold] = result
            output["generated_at"] = utc_now()
            atomic_write(result_path, output)
    print(result_path)


if __name__ == "__main__":
    main()
