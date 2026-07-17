#!/usr/bin/env python3
"""Evaluate the pinned P.533 baseline on a frozen development sample."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path
from typing import Any

import duckdb
import joblib
import numpy as np
import polars as pl
from sklearn.isotonic import IsotonicRegression


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
sys.path.insert(0, str(V3))
from common import MODELS, PROCESSED, RESULTS, load_config, relative, sha256, utc_now, write_json  # noqa: E402

from external_memory import MetricAccumulator  # noqa: E402
from p533_adapter import Circuit, P533Runner  # noqa: E402


_PROCESS_RUNNER: P533Runner | None = None


def initialize_process_runner(source: str) -> None:
    global _PROCESS_RUNNER
    _PROCESS_RUNNER = P533Runner(Path(source))


def run_circuit_in_process(key: tuple[Any, ...]) -> dict[str, Any]:
    if _PROCESS_RUNNER is None:
        raise RuntimeError("P.533 worker was not initialized")
    return run_circuit(_PROCESS_RUNNER, key)


def score(target: np.ndarray, prediction: np.ndarray, weight: np.ndarray) -> dict[str, Any]:
    accumulator = MetricAccumulator()
    accumulator.update(target, prediction, weight)
    return accumulator.result()


def row_key(row: dict[str, Any]) -> tuple[Any, ...]:
    timestamp = row["target_hour"]
    return (
        round(row["tx_lat"], 4),
        round(row["tx_lon"], 4),
        round(row["rx_lat"], 4),
        round(row["rx_lon"], 4),
        timestamp.year,
        timestamp.month,
        timestamp.hour,
        max(1, min(311, int(row.get("sunspot_number") or 1))),
        round(row["band_mhz"], 3),
        round(max(1.0, 10 ** ((row["power_bin_dbm"] - 30) / 10)), 6),
    )


def run_circuit(runner: P533Runner, key: tuple[Any, ...]) -> dict[str, Any]:
    (
        tx_lat,
        tx_lon,
        rx_lat,
        rx_lon,
        year,
        month,
        hour,
        sunspot,
        frequency,
        power_watts,
    ) = key
    output = runner.run(
        Circuit(
            tx_lat=tx_lat,
            tx_lon=tx_lon,
            rx_lat=rx_lat,
            rx_lon=rx_lon,
            year=year,
            month=month,
            utc_hours=(hour,),
            sunspot_number=sunspot,
            frequencies_mhz=(frequency,),
            tx_power_watts=power_watts,
            bandwidth_hz=6,
            required_snr_db=-28,
        )
    )
    if len(output) != 1:
        raise RuntimeError(f"expected one P.533 row, received {len(output)}")
    return output[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--source", type=Path, default=Path("ml/data/vendor/itu-r-hf-v14.3"))
    parser.add_argument("--rows-per-month", type=int, default=10_000)
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 1))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    config = load_config(args.config)
    if config.get("execution_scope") != "development":
        raise RuntimeError("P.533 validation requires development scope")
    source = args.source if args.source.is_absolute() else Path.cwd() / args.source
    runner = P533Runner(source)
    validation_path = PROCESSED / f"samples/{config['run_id']}/hf/validation.parquet"
    if not validation_path.exists():
        raise FileNotFoundError(validation_path)
    cache_path = PROCESSED / f"p533/{config['run_id']}_validation.parquet"
    result_path = RESULTS / config["run_id"] / "p533_validation_results.json"
    calibrator_path = MODELS / config["run_id"] / "B1_p533.isotonic.joblib"
    if cache_path.exists() and result_path.exists() and not args.force:
        print(result_path)
        return
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.parent.mkdir(parents=True, exist_ok=True)
    calibrator_path.parent.mkdir(parents=True, exist_ok=True)
    months = (
        config["validation_protocol"]["calibration_months"]
        + config["validation_protocol"]["gate_months"]
    )
    con = duckdb.connect()
    selected = con.execute(
        f"""
        WITH ranked AS (
          SELECT *, strftime(target_hour, '%Y-%m') AS sample_month,
                 row_number() OVER (
                   PARTITION BY strftime(target_hour, '%Y-%m')
                   ORDER BY hash(target_hour, band, tx_grid4, rx_grid4,
                                 power_bin_dbm, {int(config['seed'])})
                 ) AS sample_rank
          FROM read_parquet('{validation_path}')
          WHERE strftime(target_hour, '%Y-%m') IN
            ({','.join(repr(month) for month in months)})
        )
        SELECT * EXCLUDE (sample_rank)
        FROM ranked WHERE sample_rank <= {args.rows_per_month}
        ORDER BY sample_month, sample_rank
        """
    ).pl()
    rows = selected.to_dicts()
    keys = [row_key(row) for row in rows]
    unique_keys = list(dict.fromkeys(keys))
    started = time.time()
    outputs: dict[tuple[Any, ...], dict[str, Any]] = {}
    failures: list[dict[str, Any]] = []
    with concurrent.futures.ProcessPoolExecutor(
        max_workers=args.workers,
        initializer=initialize_process_runner,
        initargs=(str(source),),
    ) as pool:
        futures = {pool.submit(run_circuit_in_process, key): key for key in unique_keys}
        for completed, future in enumerate(concurrent.futures.as_completed(futures), 1):
            key = futures[future]
            try:
                outputs[key] = future.result()
            except Exception as error:  # noqa: BLE001
                failures.append({"key_hash": hashlib.sha256(repr(key).encode()).hexdigest(), "error": str(error)})
            if completed % 1000 == 0:
                print(f"P.533 {completed:,}/{len(unique_keys):,}", flush=True)
    if failures:
        raise RuntimeError(f"{len(failures)} P.533 circuits failed; first={failures[0]}")
    joined = []
    for row, key in zip(rows, keys):
        model = outputs[key]
        reported_power_watts = 10 ** ((row["power_bin_dbm"] - 30) / 10)
        model_power_watts = max(1.0, reported_power_watts)
        power_offset_db = 10 * math.log10(reported_power_watts / model_power_watts)
        joined.append(
            {
                **row,
                **{f"p533_{name}": value for name, value in model.items()},
                "reported_power_watts": reported_power_watts,
                "p533_model_power_watts": model_power_watts,
                "power_offset_db": power_offset_db,
                "adjusted_snr_db": model["snr_db"] + power_offset_db,
            }
        )
    frame = pl.DataFrame(joined)
    frame.write_parquet(cache_path, compression="zstd", statistics=True)
    calibration_months = set(config["validation_protocol"]["calibration_months"])
    gate_months = set(config["validation_protocol"]["gate_months"])
    calibration_mask = np.array([month in calibration_months for month in frame["sample_month"]])
    gate_mask = np.array([month in gate_months for month in frame["sample_month"]])
    target = frame["success_rate"].to_numpy().astype(np.float64)
    weight = frame["opportunities"].to_numpy().astype(np.float64)
    adjusted_snr = frame["adjusted_snr_db"].to_numpy().astype(np.float64)
    raw_reliability = frame["p533_overall_circuit_reliability"].to_numpy().astype(np.float64)
    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
    calibrator.fit(
        adjusted_snr[calibration_mask],
        target[calibration_mask],
        sample_weight=weight[calibration_mask],
    )
    mapped = calibrator.predict(adjusted_snr)
    joblib.dump(calibrator, calibrator_path)
    result = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "development_only",
        "locked_archive_test_read": False,
        "sample_contract": {
            "rows_per_month": args.rows_per_month,
            "months": months,
            "seed": config["seed"],
            "rows": frame.height,
            "unique_circuits": len(unique_keys),
        },
        "raw_p533_gate": score(
            target[gate_mask], raw_reliability[gate_mask], weight[gate_mask]
        ),
        "mapped_p533_gate": score(target[gate_mask], mapped[gate_mask], weight[gate_mask]),
        "calibration": {
            "method": "validation-only isotonic over power-adjusted P.533 SNR",
            "months": sorted(calibration_months),
            "path": relative(calibrator_path),
            "sha256": sha256(calibrator_path),
        },
        "cache": {
            "path": relative(cache_path),
            "bytes": cache_path.stat().st_size,
            "sha256": sha256(cache_path),
        },
        "runtime_seconds": time.time() - started,
        "workers": args.workers,
        "limitations": [
            "Metrics use the preregistered bounded validation sample, not every opportunity.",
            "P.533 monthly circuit reliability is calibration evidence, not a WSPR label.",
            "Sub-1 W cases use a 1 W model run plus an explicit SNR power offset.",
        ],
    }
    write_json(result_path, result)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
