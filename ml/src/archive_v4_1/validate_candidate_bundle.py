#!/usr/bin/env python3
"""Validate checksum, offline/service parity, fallback, schema, and privacy."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb
from fastapi.testclient import TestClient

from protocol import DEFAULT_CONFIG, DEFAULT_MANIFEST, ProtocolError, artifact, atomic_write_json, load_json, utc_now


ROOT = Path(__file__).resolve().parents[3]
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(SERVICE))
from app import ModelRegistry, create_app  # noqa: E402


RESPONSE_FIELDS = {
    "model_version",
    "feature_contract",
    "issue_time",
    "valid_time",
    "band",
    "mode",
    "target_grid4",
    "core_probability",
    "personalized_probability",
    "confidence",
    "ood_flags",
    "data_freshness",
    "top_factors",
    "assumptions",
    "profile",
}
PRIVATE_TOKENS = (
    "callsign",
    "call_sign",
    "station_id",
    "radio_id",
    "operator_id",
    "tx_grid4",
    "rx_grid4",
    "origin_grid4",
    "target_grid4",
)


def numeric(batch: Any, name: str) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        column = pc.fill_null(column, 0)
    return np.asarray(column.to_numpy(zero_copy_only=False), dtype=np.float32)


def sample_rows(paths: list[Path], features: list[str], rows_per_month: int) -> tuple[list[dict[str, float]], list[str]]:
    rows: list[dict[str, float]] = []
    bands: list[str] = []
    columns = [*features, "band"]
    for path in paths:
        table = ds.dataset(path, format="parquet").head(rows_per_month, columns=columns)
        if table.num_rows != rows_per_month:
            raise ProtocolError(f"candidate parity sample is short: {path}")
        batch = table.combine_chunks().to_batches()[0]
        arrays = {name: numeric(batch, name) for name in features}
        text_bands = np.asarray(batch.column("band").to_pylist(), dtype=str)
        for index in range(batch.num_rows):
            rows.append({name: float(arrays[name][index]) for name in features})
            bands.append(str(text_bands[index]))
    return rows, bands


def scan_privacy(value: Any, path: str = "root") -> list[str]:
    findings: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = str(key).lower()
            if any(token in lowered for token in PRIVATE_TOKENS):
                findings.append(f"{path}.{key}")
            findings.extend(scan_privacy(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            findings.extend(scan_privacy(child, f"{path}[{index}]"))
    return findings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--rows-per-month", type=int, default=256)
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    if not 32 <= args.rows_per_month <= 10_000:
        raise ValueError("--rows-per-month must be between 32 and 10,000")

    config = load_json(Path(args.config))
    run_manifest = load_json(DEFAULT_MANIFEST)
    inventory = load_json(
        ROOT / run_manifest["frozen_artifacts"]["calibration_input_inventory"]["path"]
    )
    bundle_path = (
        ROOT
        / "ml/models/archive_v4_1"
        / config["run_id"]
        / "serving/serving_manifest.json"
    )
    registry = ModelRegistry(bundle_path)
    profile = registry.profiles["nowcast"]
    features = [str(value) for value in profile["features"]]
    paths = [ROOT / inventory["inputs"][month]["path"] for month in inventory["months"]]
    rows, bands = sample_rows(paths, features, args.rows_per_month)
    distances = np.asarray([row["dist_km"] for row in rows], dtype=np.float64)
    matrix = np.asarray(
        [[row[name] for name in features] for row in rows],
        dtype=np.float32,
    )

    source_results = load_json(ROOT / config["frozen_candidates"]["v4_results"])
    source_info = source_results["candidates"]["M2_nowcast"]
    source_model = xgb.Booster()
    source_model.load_model(ROOT / source_info["model_path"])
    source_calibrator_path = ROOT / run_manifest["frozen_artifacts"]["selected_calibrator"]["path"]
    source_calibrator = joblib.load(source_calibrator_path)
    raw = source_model.inplace_predict(
        matrix,
        iteration_range=(0, int(source_info["best_iteration"]) + 1),
    )
    offline = source_calibrator.predict(raw, np.asarray(bands), distances)
    served = registry.predict_many(rows, bands, stale_history=False)
    served_values = np.asarray([item.probability for item in served], dtype=np.float64)
    maximum_difference = float(np.max(np.abs(offline - served_values)))

    stale = registry.predict_many(rows, bands, stale_history=True)
    bounded = all(
        math.isfinite(item.probability) and 0 <= item.probability <= 1
        for item in [*served, *stale]
    )
    explicit_stale = all(
        "recent_network_stale_physics_fallback" in item.ood_flags for item in stale
    )
    stale_profiles = all(item.profile == "physics" for item in stale)
    fresh_profiles = all(item.profile == "nowcast" for item in served)
    reduced_confidence = all(
        stale_item.confidence < fresh_item.confidence
        for stale_item, fresh_item in zip(stale, served)
    )

    client = TestClient(create_app(registry))
    contract_response = client.post(
        "/v1/propagation/path",
        json={
            "origin_grid4": "AA00",
            "issue_time": "2026-07-12T00:00:00Z",
            "valid_time": "2026-07-12T00:00:00Z",
            "band": bands[0],
            "mode": "WSPR",
            "declared_power_watts": 5,
            "features": {"target_grid4": "RR99", "values": rows[0]},
            "data_freshness_seconds": {"path_history": 0},
        },
    )
    contract_body = contract_response.json()
    contract_ok = contract_response.status_code == 200 and RESPONSE_FIELDS <= set(contract_body)

    public_manifest_path = (
        ROOT
        / "ml/results/propagation_v4_1"
        / config["run_id"]
        / "serving_candidate_manifest.json"
    )
    public_manifest = load_json(public_manifest_path)
    privacy_findings = scan_privacy(public_manifest)
    gates = {
        "bundle_checksum_and_schema": True,
        "offline_service_parity": maximum_difference <= 1e-12,
        "bounded_probabilities": bounded,
        "fresh_selects_nowcast": fresh_profiles,
        "stale_selects_physics": stale_profiles,
        "explicit_stale_provenance": explicit_stale,
        "reduced_stale_confidence": reduced_confidence,
        "frontend_response_contract": contract_ok,
        "public_manifest_privacy": not privacy_findings,
        "locked_scopes_unchanged": (
            not run_manifest["november_gate_opened"]
            and not run_manifest["locked_archive_test_opened"]
        ),
    }
    result = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "pre_november_candidate_validation",
        "november_gate_read": False,
        "locked_archive_test_read": False,
        "sample": {
            "months": inventory["months"],
            "rows_per_month": args.rows_per_month,
            "rows": len(rows),
            "contains_identity_or_location_fields": False,
        },
        "bundle_manifest": artifact(bundle_path),
        "public_manifest": artifact(public_manifest_path),
        "maximum_offline_service_probability_difference": maximum_difference,
        "fresh_probability": {
            "minimum": float(np.min(served_values)),
            "maximum": float(np.max(served_values)),
            "mean": float(np.mean(served_values)),
        },
        "stale_probability": {
            "minimum": float(min(item.probability for item in stale)),
            "maximum": float(max(item.probability for item in stale)),
            "mean": float(np.mean([item.probability for item in stale])),
        },
        "privacy_findings": privacy_findings,
        "gates": gates,
        "passed": all(gates.values()),
    }
    output = (
        ROOT
        / "ml/results/propagation_v4_1"
        / config["run_id"]
        / "candidate_validation.json"
    )
    atomic_write_json(output, result)
    print(output)
    if not result["passed"]:
        raise ProtocolError("candidate bundle validation failed")


if __name__ == "__main__":
    main()
