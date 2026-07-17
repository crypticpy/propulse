#!/usr/bin/env python3
"""Validate the packaged stale-network fallback on held-out development rows."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow.dataset as ds


ROOT = Path(__file__).resolve().parents[3]
V3 = ROOT / "ml/src/archive_v3"
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(V3))
sys.path.insert(0, str(SERVICE))
from common import MODELS, PROCESSED, RESULTS, load_config, utc_now, write_json  # noqa: E402
from app import ModelRegistry  # noqa: E402


def probability_summary(values: list[float]) -> dict[str, float]:
    array = np.asarray(values, dtype=np.float64)
    return {
        "minimum": float(np.min(array)),
        "maximum": float(np.max(array)),
        "mean": float(np.mean(array)),
        "p05": float(np.quantile(array, 0.05)),
        "p50": float(np.quantile(array, 0.5)),
        "p95": float(np.quantile(array, 0.95)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--rows", type=int, default=5_000)
    args = parser.parse_args()
    if args.rows < 100 or args.rows > 100_000:
        raise ValueError("--rows must be between 100 and 100,000")
    config = load_config(args.config)
    run_id = config["run_id"]
    manifest_path = MODELS / run_id / "serving/serving_manifest.json"
    registry = ModelRegistry(manifest_path)
    profile_features = {
        name: item["features"] for name, item in registry.profiles.items()
    }
    required = sorted({name for values in profile_features.values() for name in values})
    validation_path = PROCESSED / f"samples/{run_id}/hf/validation.parquet"
    table = ds.dataset(validation_path, format="parquet").head(
        args.rows,
        columns=["band", *required],
    )
    rows = table.to_pylist()
    if len(rows) != args.rows:
        raise RuntimeError(f"requested {args.rows} rows but read {len(rows)}")
    bands = [str(row.pop("band")) for row in rows]
    fresh = registry.predict_many(rows, bands, stale_history=False)
    stale = registry.predict_many(rows, bands, stale_history=True)
    fresh_probability = [row.probability for row in fresh]
    stale_probability = [row.probability for row in stale]
    fresh_confidence = [row.confidence for row in fresh]
    stale_confidence = [row.confidence for row in stale]
    bounded = all(
        math.isfinite(value) and 0 <= value <= 1
        for value in [*fresh_probability, *stale_probability]
    )
    explicit = all(
        "recent_network_stale_physics_fallback" in row.ood_flags for row in stale
    )
    lower_confidence = all(
        stale_value < fresh_value
        for stale_value, fresh_value in zip(stale_confidence, fresh_confidence)
    )
    physics_profile = all(row.profile == "physics" for row in stale)
    nowcast_profile = all(row.profile == "nowcast" for row in fresh)
    gates = {
        "bounded_probabilities": bounded,
        "explicit_stale_warning": explicit,
        "lower_confidence_when_stale": lower_confidence,
        "stale_selects_physics_profile": physics_profile,
        "fresh_selects_nowcast_profile": nowcast_profile,
    }
    output: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": run_id,
        "scope": "development_shadow",
        "locked_archive_test_read": False,
        "bundle_manifest": str(manifest_path.relative_to(ROOT)),
        "validation_source": str(validation_path.relative_to(ROOT)),
        "rows": len(rows),
        "scenarios": [
            {
                "scenario": "fresh path history",
                "profile": "nowcast",
                "mean_confidence": float(np.mean(fresh_confidence)),
                **probability_summary(fresh_probability),
            },
            {
                "scenario": "path history outage",
                "profile": "physics",
                "mean_confidence": float(np.mean(stale_confidence)),
                **probability_summary(stale_probability),
            },
        ],
        "mean_absolute_probability_change": float(
            np.mean(np.abs(np.asarray(fresh_probability) - np.asarray(stale_probability)))
        ),
        "gates": gates,
        "passed": all(gates.values()),
    }
    result_path = RESULTS / run_id / "source_outage_validation_results.json"
    write_json(result_path, output)
    print(result_path)
    if not output["passed"]:
        raise RuntimeError("source-outage validation failed")


if __name__ == "__main__":
    main()
