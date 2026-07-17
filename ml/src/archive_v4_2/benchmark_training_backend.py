#!/usr/bin/env python3
"""Benchmark bounded XGBoost matrix backends without evaluation-outcome access."""

from __future__ import annotations

import argparse
import gc
import json
import platform
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import xgboost as xgb


ROOT = Path(__file__).resolve().parents[3]
V4 = ROOT / "ml/src/archive_v4"
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(V4))
sys.path.insert(0, str(MODULE))

from external_memory import ParquetDataIter  # noqa: E402
from m5_runtime import configure_arrow_threads  # noqa: E402
from phase2_core import Phase2Error, validate_config  # noqa: E402
from train_phase2_scale import (  # noqa: E402
    load_json,
    peak_rss_gb,
    validate_m5_runtime,
    v4_features,
    verify_artifact,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False
    ) as handle:
        json.dump(value, handle, indent=2)
        handle.write("\n")
        temporary = Path(handle.name)
    temporary.replace(path)


def build_matrix(
    backend: str,
    iterator: ParquetDataIter,
    *,
    reference: xgb.QuantileDMatrix | xgb.ExtMemQuantileDMatrix | None = None,
) -> xgb.QuantileDMatrix | xgb.ExtMemQuantileDMatrix:
    matrix_type = (
        xgb.ExtMemQuantileDMatrix
        if backend == "external_memory_quantile"
        else xgb.QuantileDMatrix
    )
    return matrix_type(iterator, max_bin=255, ref=reference)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument(
        "--backend",
        choices=("external_memory_quantile", "streamed_in_memory_quantile"),
        required=True,
    )
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    validate_config(config)
    runtime = validate_m5_runtime(config)
    arrow = configure_arrow_threads(config, parallel_fit=False)
    benchmark = config["compute"]["apple_silicon"]["backend_benchmark"]
    scale = int(benchmark["scale"])
    candidate = str(benchmark["candidate"])
    fold = str(benchmark["fold"])
    manifest_path = (
        ROOT
        / "ml/data/manifests"
        / f"propagation_v4_2_phase2_{scale // 1_000_000}m_cohorts.json"
    )
    manifest = load_json(manifest_path)
    if manifest["december_2024_read"] or manifest["locked_2025_read"]:
        raise Phase2Error("backend benchmark cannot access locked outcomes")
    cohort_item = manifest["cohorts"][candidate][fold]
    early_item = manifest["early_stopping"][fold]
    cohort_path = verify_artifact(cohort_item)
    early_path = verify_artifact(early_item)
    features = v4_features()
    batch_rows = int(config["training"]["batch_rows"])
    cache_root = (
        Path(config["compute"]["temp_root"])
        / "backend-benchmark"
        / args.backend
    )
    cache_root.mkdir(parents=True, exist_ok=True)
    use_external = args.backend == "external_memory_quantile"
    train_iterator = ParquetDataIter(
        cohort_path,
        features,
        weight_column=str(config["candidates"][candidate]["weight"]),
        cache_prefix=str(cache_root / "train") if use_external else None,
        batch_size=batch_rows,
    )
    early_iterator = ParquetDataIter(
        early_path,
        features,
        weight_column="opportunities",
        cache_prefix=str(cache_root / "early") if use_external else None,
        batch_size=batch_rows,
    )
    construct_started = time.monotonic()
    train_matrix = build_matrix(args.backend, train_iterator)
    early_matrix = build_matrix(args.backend, early_iterator, reference=train_matrix)
    construct_seconds = time.monotonic() - construct_started
    parameters = dict(config["training"]["parameters"])
    parameters["seed"] = int(config["seed"])
    history: dict[str, dict[str, list[float]]] = {}
    train_started = time.monotonic()
    model = xgb.train(
        parameters,
        train_matrix,
        num_boost_round=int(benchmark["fixed_boost_rounds"]),
        evals=[(early_matrix, "benchmark_validation")],
        evals_result=history,
        verbose_eval=10,
    )
    train_seconds = time.monotonic() - train_started
    scores = list(map(float, history["benchmark_validation"]["logloss"]))
    output = {
        "schema_version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "scope": "training_and_early_stopping_only",
        "backend": args.backend,
        "candidate": candidate,
        "fold": fold,
        "scale": scale,
        "december_2024_read": False,
        "locked_2025_read": False,
        "train_rows": int(train_matrix.num_row()),
        "validation_rows": int(early_matrix.num_row()),
        "features": len(features),
        "batch_rows": batch_rows,
        "boost_rounds": int(model.num_boosted_rounds()),
        "construct_seconds": construct_seconds,
        "train_seconds": train_seconds,
        "total_seconds": construct_seconds + train_seconds,
        "final_validation_logloss": scores[-1],
        "minimum_validation_logloss": min(scores),
        "peak_rss_gb": peak_rss_gb(),
        "parameters": parameters,
        "runtime": {
            **runtime,
            **arrow,
            "platform": platform.platform(),
            "xgboost_build": xgb.build_info(),
        },
        "inputs": {
            "manifest": manifest_path.relative_to(ROOT).as_posix(),
            "cohort_sha256": cohort_item["sha256"],
            "early_stopping_sha256": early_item["sha256"],
        },
    }
    del model, train_matrix, early_matrix, train_iterator, early_iterator
    gc.collect()
    result_dir = ROOT / "ml/results/propagation_v4_2" / config["run_id"]
    output_path = result_dir / f"backend_benchmark_{args.backend}.json"
    write_json(output_path, output)
    print(output_path)


if __name__ == "__main__":
    main()
