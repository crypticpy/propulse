#!/usr/bin/env python3
"""Materialize frozen M2 probabilities and sufficient statistics by month."""

from __future__ import annotations

import argparse
import gc
import json
import os
import platform
import resource
import shutil
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.parquet as pq
import xgboost as xgb

from calibration import distance_groups
from calibration_inputs import feature_order_sha256
from protocol import ROOT, atomic_write_json, load_json, sha256, utc_now
from streaming_calibration import GroupedBinnedStatistics, write_statistics


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_1.json"
DEFAULT_INVENTORY = (
    ROOT
    / "ml/results/propagation_v4_1/preregistration/calibration_input_inventory.json"
)

OUTPUT_SCHEMA = pa.schema(
    [
        ("target_hour", pa.timestamp("us", tz="UTC")),
        ("band", pa.string()),
        ("dist_km", pa.float64()),
        ("serving_distance_group", pa.string()),
        ("audit_distance_group", pa.string()),
        ("raw_probability", pa.float32()),
        ("success_rate", pa.float32()),
        ("opportunities", pa.float64()),
    ]
)


def peak_rss_gb() -> float:
    return float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**3)


def logical(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def numeric(
    batch: pa.RecordBatch,
    name: str,
    dtype: np.dtype,
    *,
    fill_null: bool = False,
) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        if not fill_null:
            raise ValueError(f"required column contains nulls: {name}")
        column = pc.fill_null(column, 0)
    return column.to_numpy(zero_copy_only=False).astype(dtype, copy=False)


def audit_distance_groups(distance: np.ndarray) -> np.ndarray:
    values = np.asarray(distance, dtype=np.float64)
    return np.select(
        [
            values < 500,
            values < 1500,
            values < 3000,
            values < 6000,
            values < 10000,
        ],
        [
            "0-500km",
            "500-1500km",
            "1500-3000km",
            "3000-6000km",
            "6000-10000km",
        ],
        default="10000-25000km",
    )


def verify_inventory_entry(entry: dict[str, Any]) -> Path:
    path = ROOT / entry["path"]
    if not path.is_file() or path.stat().st_size != int(entry["bytes"]):
        raise RuntimeError(f"calibration input size changed: {path}")
    if sha256(path) != entry["sha256"]:
        raise RuntimeError(f"calibration input checksum changed: {path}")
    return path


def month_complete(directory: Path) -> dict[str, Any] | None:
    marker = directory / "_SUCCESS"
    manifest_path = directory / "manifest.json"
    if not marker.exists() or not manifest_path.exists():
        return None
    manifest = load_json(manifest_path)
    for name in ("predictions", "sufficient_statistics"):
        item = manifest[name]
        path = ROOT / item["path"]
        if not path.is_file() or path.stat().st_size != item["bytes"]:
            return None
        if sha256(path) != item["sha256"]:
            return None
    return manifest


def materialize_month(
    month: str,
    entry: dict[str, Any],
    output_root: Path,
    model: xgb.Booster,
    best_iteration: int,
    features: list[str],
    bins: int,
    batch_size: int,
    *,
    force: bool,
) -> dict[str, Any]:
    directory = output_root / f"month={month}"
    if force and directory.exists():
        shutil.rmtree(directory)
    existing = month_complete(directory)
    if existing is not None:
        print(f"reuse calibration predictions {month}", flush=True)
        return existing

    source = verify_inventory_entry(entry)
    directory.mkdir(parents=True, exist_ok=True)
    prediction_path = directory / "part-000.parquet"
    prediction_temporary = directory / ".part-000.tmp.parquet"
    statistics_path = directory / "sufficient-statistics.parquet"
    prediction_temporary.unlink(missing_ok=True)
    (directory / "_SUCCESS").unlink(missing_ok=True)
    columns = list(dict.fromkeys([
        *features,
        "target_hour",
        "band",
        "dist_km",
        "success_rate",
        "opportunities",
    ]))
    scanner = ds.dataset(source, format="parquet").scanner(
        columns=columns,
        batch_size=batch_size,
        use_threads=True,
    )
    writer = pq.ParquetWriter(
        prediction_temporary,
        OUTPUT_SCHEMA,
        compression="zstd",
        use_dictionary=["band", "serving_distance_group", "audit_distance_group"],
    )
    statistics = GroupedBinnedStatistics(bins)
    rows = 0
    weighted_opportunities = 0.0
    weighted_successes = 0.0
    raw_minimum = 1.0
    raw_maximum = 0.0
    started = time.time()
    try:
        for batch_index, batch in enumerate(scanner.to_batches(), start=1):
            matrix = np.column_stack(
                [
                    numeric(batch, name, np.float32, fill_null=True)
                    for name in features
                ]
            )
            target = numeric(batch, "success_rate", np.float64)
            weight = numeric(batch, "opportunities", np.float64)
            distance = numeric(batch, "dist_km", np.float64)
            bands = batch.column("band").to_numpy(zero_copy_only=False).astype(str)
            raw = model.inplace_predict(
                matrix,
                iteration_range=(0, best_iteration + 1),
            ).astype(np.float32, copy=False)
            if np.any(~np.isfinite(raw)) or np.any((raw < 0) | (raw > 1)):
                raise RuntimeError(f"invalid raw probabilities in {month}")
            serving = distance_groups(distance)
            audit = audit_distance_groups(distance)
            target_hour = batch.column("target_hour")
            if target_hour.type != OUTPUT_SCHEMA.field("target_hour").type:
                target_hour = target_hour.cast(OUTPUT_SCHEMA.field("target_hour").type)
            writer.write_table(
                pa.table(
                    {
                        "target_hour": target_hour,
                        "band": pa.array(bands),
                        "dist_km": pa.array(distance),
                        "serving_distance_group": pa.array(serving),
                        "audit_distance_group": pa.array(audit),
                        "raw_probability": pa.array(raw),
                        "success_rate": pa.array(target.astype(np.float32)),
                        "opportunities": pa.array(weight),
                    },
                    schema=OUTPUT_SCHEMA,
                ),
                row_group_size=batch_size,
            )
            statistics.update(raw, target, weight, bands, distance)
            rows += len(raw)
            weighted_opportunities += float(weight.sum())
            weighted_successes += float(np.dot(weight, target))
            raw_minimum = min(raw_minimum, float(raw.min()))
            raw_maximum = max(raw_maximum, float(raw.max()))
            if batch_index % 20 == 0:
                print(
                    f"{month}: batches={batch_index:,} rows={rows:,} "
                    f"rss={peak_rss_gb():.2f}GB",
                    flush=True,
                )
            del matrix, target, weight, distance, bands, raw
    finally:
        writer.close()
    if rows != int(entry["rows"]):
        raise RuntimeError(f"row handoff failed for {month}: {rows} != {entry['rows']}")
    parquet_rows = pq.ParquetFile(prediction_temporary).metadata.num_rows
    if parquet_rows != rows:
        raise RuntimeError(f"prediction Parquet audit failed for {month}")
    prediction_temporary.replace(prediction_path)
    write_statistics(statistics_path, month, statistics)
    support = statistics.groups[("global", "all")].support()
    if support["rows"] != rows:
        raise RuntimeError(f"sufficient-statistic row audit failed for {month}")
    if not np.isclose(
        support["weighted_opportunities"],
        weighted_opportunities,
        rtol=1e-12,
        atol=1e-6,
    ):
        raise RuntimeError(f"sufficient-statistic weight audit failed for {month}")
    payload = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "month": month,
        "input": entry,
        "predictions": {
            "path": logical(prediction_path),
            "bytes": prediction_path.stat().st_size,
            "sha256": sha256(prediction_path),
        },
        "sufficient_statistics": {
            "path": logical(statistics_path),
            "bytes": statistics_path.stat().st_size,
            "sha256": sha256(statistics_path),
            "groups": len(statistics.groups),
            "probability_bins": bins,
        },
        "rows": rows,
        "weighted_opportunities": weighted_opportunities,
        "weighted_successes": weighted_successes,
        "prevalence": weighted_successes / weighted_opportunities,
        "raw_probability_minimum": raw_minimum,
        "raw_probability_maximum": raw_maximum,
        "seconds": time.time() - started,
        "peak_rss_gb": peak_rss_gb(),
        "november_gate_read": False,
        "locked_archive_test_read": False,
    }
    atomic_write_json(directory / "manifest.json", payload)
    (directory / "_SUCCESS").write_text("complete\n", encoding="ascii")
    gc.collect()
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--inventory", default=str(DEFAULT_INVENTORY))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    del args.profile

    config = load_json(Path(args.config))
    protocol = load_json(
        ROOT / "ml/results/propagation_v4_1/preregistration/run_manifest.json"
    )
    if protocol["november_gate_opened"] or protocol["locked_archive_test_opened"]:
        raise RuntimeError("development predictions must precede locked outcome access")
    inventory = load_json(Path(args.inventory))
    required_months = list(config["data_roles"]["calibration_development"])
    if inventory["months"] != required_months:
        raise RuntimeError("calibration inventory month order changed")
    development = load_json(ROOT / config["frozen_candidates"]["v4_results"])
    candidate = development["candidates"]["M2_nowcast"]
    features = [str(value) for value in candidate["features"]]
    if feature_order_sha256(features) != inventory["feature_order_sha256"]:
        raise RuntimeError("frozen M2 feature order changed")
    model_path = ROOT / candidate["model_path"]
    if sha256(model_path) != inventory["model"]["sha256"]:
        raise RuntimeError("frozen M2 model changed after input inventory")
    model = xgb.Booster()
    model.load_model(model_path)
    if model.feature_names is not None and model.feature_names != features:
        raise RuntimeError("M2 model feature order does not match evidence")
    repository_data = ROOT / "ml/data"
    if repository_data.resolve() != Path(config["compute"]["data_root"]).resolve():
        raise RuntimeError("repository data link does not match the approved M5 root")
    output_root = (
        repository_data
        / "processed/archive_v4_1/calibration_predictions"
        / config["run_id"]
    )
    output_root.mkdir(parents=True, exist_ok=True)
    months = {}
    for month in required_months:
        months[month] = materialize_month(
            month,
            inventory["inputs"][month],
            output_root,
            model,
            int(candidate["best_iteration"]),
            features,
            int(config["calibration"]["sufficient_statistic_bins"]),
            int(config["calibration"]["stream_batch_rows"]),
            force=args.force,
        )
    payload = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "calibration-development-predictions",
        "months": months,
        "model": inventory["model"],
        "best_iteration": int(candidate["best_iteration"]),
        "feature_count": len(features),
        "feature_order_sha256": feature_order_sha256(features),
        "probability_bins": int(config["calibration"]["sufficient_statistic_bins"]),
        "batch_rows": int(config["calibration"]["stream_batch_rows"]),
        "environment": {
            "platform": platform.platform(),
            "python": sys.version.split()[0],
            "pyarrow": pa.__version__,
            "xgboost": xgb.__version__,
        },
        "november_gate_read": False,
        "locked_archive_test_read": False,
    }
    atomic_write_json(output_root / "manifest.json", payload)
    (output_root / "_SUCCESS").write_text("complete\n", encoding="ascii")
    print(output_root / "manifest.json")


if __name__ == "__main__":
    main()
