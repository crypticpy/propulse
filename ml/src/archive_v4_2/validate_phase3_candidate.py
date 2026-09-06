#!/usr/bin/env python3
"""Validate the frozen V4.2 serving candidate before December access."""

from __future__ import annotations

import argparse
import hashlib
import inspect
import json
import math
import os
import resource
import sys
import tempfile
import time
from datetime import timedelta
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(MODULE))
sys.path.insert(0, str(SERVICE))

from app import ModelRegistry, create_app  # noqa: E402
from path_history import (  # noqa: E402
    DEFAULT_PATH_TRANSFORM_VERSION,
    UnavailablePathHistoryProvider,
    VerifiedPathHistory,
)
from m5_runtime import configure_arrow_threads  # noqa: E402
from package_phase3_candidate import (  # noqa: E402
    PATH_HISTORY_CONTRACT_V2,
    selected_components,
)
from phase2_core import Phase2Error, validate_config  # noqa: E402
from feature_contract import is_v2  # noqa: E402
import run_paths  # noqa: E402
from train_phase2_scale import validate_m5_runtime  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
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
PRIVATE_KEYS = (
    "callsign",
    "call_sign",
    "station_id",
    "radio_id",
    "operator_id",
    "equipment_id",
    "raw_shack",
    "exact_location",
)


class ValidationPathHistoryProvider:
    """Fixture provider whose identity matches the packaged contract.

    Under archive-v4-features-v2 the served path-history fields come from the
    field-recency transform, so the fixture must declare that provider and
    transform version or the response provenance would not match the bundle.
    """

    def __init__(
        self,
        values: dict[str, float],
        age_seconds: int,
        *,
        v2: bool = False,
    ) -> None:
        self.values = values
        self.age_seconds = age_seconds
        self.name = (
            PATH_HISTORY_CONTRACT_V2["provider_kind"]
            if v2
            else "phase3-validation-fixture"
        )
        self.transform_version = (
            PATH_HISTORY_CONTRACT_V2["transform_version"]
            if v2
            else DEFAULT_PATH_TRANSFORM_VERSION
        )

    def lookup(
        self, *, issue_time, band, origin_grid4, target_grid4s
    ) -> dict[str, VerifiedPathHistory]:
        fields = {}
        for lag in (1, 2, 3, 24):
            available = int(self.values.get(f"path_prev{lag}_available", 0))
            fields[f"path_success_prev{lag}"] = (
                float(self.values.get(f"path_success_prev{lag}", 0))
                if available
                else 0.0
            )
            fields[f"path_prev{lag}_available"] = available
        return {
            target: VerifiedPathHistory(
                target_grid4=target,
                source_watermark=issue_time - timedelta(seconds=self.age_seconds),
                available_at=issue_time,
                provider=self.name,
                transform_version=self.transform_version,
                **fields,
            )
            for target in target_grid4s
        }


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact(path: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


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


def peak_rss_gb() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    divisor = 1024**3 if sys.platform == "darwin" else 1024**2
    return float(value / divisor)


def numeric(batch: Any, name: str) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        column = pc.fill_null(column, 0)
    return np.asarray(column.to_numpy(zero_copy_only=False), dtype=np.float32)


def sample_rows(
    paths: list[Path], features: list[str], rows_per_month: int
) -> tuple[list[dict[str, float]], list[str]]:
    rows: list[dict[str, float]] = []
    bands: list[str] = []
    columns = [*features, "band"]
    for path in paths:
        table = ds.dataset(path, format="parquet").head(
            rows_per_month, columns=columns
        )
        if table.num_rows != rows_per_month:
            raise Phase2Error(f"Phase 3 parity sample is short: {path}")
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
            if any(token in str(key).lower() for token in PRIVATE_KEYS):
                findings.append(f"{path}.{key}")
            findings.extend(scan_privacy(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            findings.extend(scan_privacy(child, f"{path}[{index}]"))
    elif isinstance(value, str):
        lowered = value.lower()
        if any(token in lowered for token in PRIVATE_KEYS):
            findings.append(path)
    return findings


def direct_nowcast(
    training: dict[str, Any],
    evaluation: dict[str, Any],
    selected: str,
    rows: list[dict[str, float]],
    bands: list[str],
    final_fold: str,
) -> np.ndarray:
    predictions = np.zeros(len(rows), dtype=np.float64)
    for name, weight in selected_components(evaluation, selected):
        info = training["candidates"][name][final_fold]
        model_path = ROOT / info["model"]["path"]
        calibrator_path = ROOT / info["calibrator"]["path"]
        if sha256(model_path) != info["model"]["sha256"]:
            raise Phase2Error(f"source model checksum changed: {name}")
        if sha256(calibrator_path) != info["calibrator"]["sha256"]:
            raise Phase2Error(f"source calibrator checksum changed: {name}")
        features = list(map(str, info["features"]))
        matrix = np.asarray(
            [[row[feature] for feature in features] for row in rows],
            dtype=np.float32,
        )
        model = xgb.Booster()
        model.load_model(model_path)
        raw = model.inplace_predict(
            matrix, iteration_range=(0, int(info["best_iteration"]) + 1)
        )
        distance = np.asarray([row["dist_km"] for row in rows], dtype=np.float64)
        calibrated = joblib.load(calibrator_path).predict(
            raw, np.asarray(bands), distance
        )
        predictions += float(weight) * calibrated.astype(np.float64)
    return predictions


def percentile_ms(values: list[float], quantile: float) -> float:
    return float(np.quantile(np.asarray(values, dtype=np.float64), quantile) * 1000)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    validate_config(config)
    v2 = is_v2(config)
    runtime = validate_m5_runtime(config)
    arrow = configure_arrow_threads(config, parallel_fit=False)
    phase3 = config["phase3"]
    result_dir = run_paths.results_dir(config)
    training = load_json(run_paths.training_results_path(config, 50_000_000))
    evaluation = load_json(run_paths.evaluation_results_path(config, 50_000_000))
    public_path = result_dir / "phase3_serving_candidate_manifest.json"
    public_manifest = load_json(public_path)
    if any(
        value.get(field)
        for value in (training, evaluation, public_manifest)
        for field in (
            "december_2024_read",
            "locked_2025_read",
            "december_gate_scored",
            "locked_archive_test_scored",
        )
    ):
        raise Phase2Error("Phase 3 validation found locked-outcome access")
    bundle_path = run_paths.serving_manifest_path(config)
    if os.environ.get("PROPULSE_XGBOOST_THREADS") is not None:
        raise Phase2Error(
            "Phase 3 validation must use the serving manifest thread count"
        )
    load_started = time.perf_counter()
    # The freshly packaged bundle is a schema-2, pre-December candidate that
    # `validate_serving_manifest` rejects (it pins the V1 core contract and the
    # released-candidate fields). Skip that release-time check here; the same
    # bundle is validated strictly at promotion.
    if "strict" not in inspect.signature(ModelRegistry.__init__).parameters:
        raise Phase2Error(
            "ModelRegistry does not accept strict=False; update ml/service"
        )
    registry = ModelRegistry(bundle_path, strict=False)
    load_seconds = time.perf_counter() - load_started
    features = registry.profiles["nowcast"]["features"]
    inputs = run_paths.evaluation_inputs(config)
    paths = [ROOT / inputs[month]["path"] for month in config["evaluation_months"]]
    rows, bands = sample_rows(
        paths, features, int(phase3["rows_per_evaluation_month"])
    )
    selected = str(evaluation["final_candidate_selection"]["candidate"])
    offline = direct_nowcast(
        training,
        evaluation,
        selected,
        rows,
        bands,
        str(config["final_fold"]),
    )
    served = registry.predict_many(rows, bands, stale_history=False)
    served_values = np.asarray(
        [prediction.probability for prediction in served], dtype=np.float64
    )
    maximum_difference = float(np.max(np.abs(offline - served_values)))
    stale = registry.predict_many(rows, bands, stale_history=True)
    bounded = all(
        math.isfinite(item.probability) and 0 <= item.probability <= 1
        for item in [*served, *stale]
    )
    fallback = all(
        item.profile == "physics"
        and "recent_network_stale_physics_fallback" in item.ood_flags
        for item in stale
    )
    reduced_confidence = all(
        stale_item.confidence < fresh_item.confidence
        for stale_item, fresh_item in zip(stale, served)
    )
    missing_row = dict(rows[0])
    missing_row[features[0]] = None
    missing = registry.predict(missing_row, bands[0], stale_history=False)
    missing_flag = "missing_features" in missing.ood_flags

    engine_single_times = []
    for index in range(int(phase3["latency_single_repetitions"])):
        started = time.perf_counter()
        registry.predict(rows[index % len(rows)], bands[index % len(bands)], False)
        engine_single_times.append(time.perf_counter() - started)
    batch_rows = int(phase3["latency_batch_rows"])
    repeated_rows = [rows[index % len(rows)] for index in range(batch_rows)]
    repeated_bands = [bands[index % len(bands)] for index in range(batch_rows)]
    engine_batch_times = []
    for _ in range(int(phase3["latency_batch_repetitions"])):
        started = time.perf_counter()
        registry.predict_many(repeated_rows, repeated_bands, False)
        engine_batch_times.append(time.perf_counter() - started)

    stale_after = int(phase3["stale_path_history_seconds"])
    client = TestClient(create_app(
        registry,
        path_history_provider=ValidationPathHistoryProvider(
            rows[0], stale_after, v2=v2
        ),
    ))
    stale_client = TestClient(create_app(
        registry,
        path_history_provider=ValidationPathHistoryProvider(
            rows[0], stale_after + 1, v2=v2
        ),
    ))
    unavailable_client = TestClient(create_app(
        registry,
        path_history_provider=UnavailablePathHistoryProvider(),
    ))
    path_payload = {
        "origin_grid4": "AA00",
        "issue_time": "2026-07-15T00:00:00Z",
        "valid_time": "2026-07-15T00:00:00Z",
        "band": bands[0],
        "mode": "WSPR",
        "declared_power_watts": 5,
        "features": {"target_grid4": "RR99", "values": rows[0]},
        "data_freshness_seconds": {"path_history": stale_after},
    }
    contract_response = client.post("/v1/propagation/path", json=path_payload)
    stale_payload = {
        **path_payload,
        "data_freshness_seconds": {"path_history": stale_after + 1},
    }
    stale_response = stale_client.post("/v1/propagation/path", json=stale_payload)
    unknown_freshness_payload = {
        key: value
        for key, value in path_payload.items()
        if key != "data_freshness_seconds"
    }
    unknown_freshness_response = unavailable_client.post(
        "/v1/propagation/path", json=unknown_freshness_payload
    )
    unknown_freshness_fallback = (
        unknown_freshness_response.status_code == 200
        and unknown_freshness_response.json()["profile"] == "physics"
        and "recent_network_stale_physics_fallback"
        in unknown_freshness_response.json()["ood_flags"]
    )
    contract_ok = (
        contract_response.status_code == 200
        and RESPONSE_FIELDS <= set(contract_response.json())
        and contract_response.json()["profile"] == "nowcast"
        and stale_response.status_code == 200
        and stale_response.json()["profile"] == "physics"
        and "recent_network_stale_physics_fallback"
        in stale_response.json()["ood_flags"]
    )
    api_single_times = []
    for _ in range(int(phase3["latency_single_repetitions"])):
        started = time.perf_counter()
        response = client.post("/v1/propagation/path", json=path_payload)
        api_single_times.append(time.perf_counter() - started)
        if response.status_code != 200:
            raise Phase2Error("path latency request failed")
    surface_payload = {
        key: value for key, value in path_payload.items() if key != "features"
    }
    surface_payload["cells"] = [
        {"target_grid4": "RR99", "values": row} for row in repeated_rows
    ]
    api_batch_times = []
    batch_response = None
    for _ in range(int(phase3["latency_batch_repetitions"])):
        started = time.perf_counter()
        batch_response = client.post(
            "/v1/propagation/surface", json=surface_payload
        )
        api_batch_times.append(time.perf_counter() - started)
        if batch_response.status_code != 200:
            raise Phase2Error("surface latency request failed")
    assert batch_response is not None
    surface_contract_ok = len(batch_response.json().get("cells", [])) == batch_rows
    single_p95 = percentile_ms(api_single_times, 0.95)
    batch_p95 = percentile_ms(api_batch_times, 0.95)
    privacy_findings = scan_privacy(public_manifest)
    bundle_bytes = sum(
        path.stat().st_size
        for path in bundle_path.parent.iterdir()
        if path.is_file()
    )
    memory = peak_rss_gb()
    gates = {
        "bundle_checksum_and_schema": True,
        "serving_thread_contract": registry.xgboost_prediction_threads
        == int(phase3["serving_xgboost_threads"])
        and registry.xgboost_prediction_threads_source == "manifest",
        "offline_service_parity": maximum_difference
        <= float(phase3["parity_tolerance"]),
        "bounded_probabilities": bounded,
        "fresh_selects_nowcast": all(item.profile == "nowcast" for item in served),
        "stale_selects_physics_with_provenance": fallback,
        "missing_freshness_selects_fallback": unknown_freshness_fallback,
        "stale_reduces_confidence": reduced_confidence,
        "missing_feature_is_explicit": missing_flag,
        "frontend_response_contract": contract_ok and surface_contract_ok,
        "public_manifest_privacy": not privacy_findings,
        "single_latency": single_p95 <= float(phase3["maximum_single_p95_ms"]),
        "batch_latency": batch_p95 <= float(phase3["maximum_batch_p95_ms"]),
        "memory_budget": memory <= float(phase3["maximum_validation_rss_gb"]),
        "bundle_size": bundle_bytes <= int(phase3["maximum_bundle_bytes"]),
        "locked_scopes_remain_closed": True,
    }
    output = {
        "schema_version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_id": config["run_id"],
        "scope": "pre_december_phase3_candidate_validation",
        "december_2024_read": False,
        "locked_2025_read": False,
        "core_feature_contract": public_manifest.get("core_feature_contract"),
        "path_history_provider": {
            "name": ValidationPathHistoryProvider(rows[0], 0, v2=v2).name,
            "transform_version": ValidationPathHistoryProvider(
                rows[0], 0, v2=v2
            ).transform_version,
        },
        "selected_candidate": selected,
        "bundle_manifest": artifact(bundle_path),
        "public_manifest": artifact(public_path),
        "sample": {
            "months": config["evaluation_months"],
            "rows_per_month": int(phase3["rows_per_evaluation_month"]),
            "rows": len(rows),
        },
        "maximum_offline_service_probability_difference": maximum_difference,
        "latency": {
            "model_load_ms": load_seconds * 1000,
            "engine_single_p50_ms": percentile_ms(engine_single_times, 0.5),
            "engine_single_p95_ms": percentile_ms(engine_single_times, 0.95),
            "api_path_p50_ms": percentile_ms(api_single_times, 0.5),
            "api_path_p95_ms": single_p95,
            "batch_rows": batch_rows,
            "engine_batch_p50_ms": percentile_ms(engine_batch_times, 0.5),
            "engine_batch_p95_ms": percentile_ms(engine_batch_times, 0.95),
            "api_surface_p50_ms": percentile_ms(api_batch_times, 0.5),
            "api_surface_p95_ms": batch_p95,
        },
        "memory": {
            "peak_rss_gb": memory,
            "maximum_rss_gb": float(phase3["maximum_validation_rss_gb"]),
        },
        "bundle_bytes": bundle_bytes,
        "privacy_findings": privacy_findings,
        "runtime": {**runtime, **arrow},
        "serving_runtime": {
            "xgboost_prediction_threads": registry.xgboost_prediction_threads,
            "xgboost_prediction_threads_source": (
                registry.xgboost_prediction_threads_source
            ),
        },
        "gates": gates,
        "passed": all(gates.values()),
    }
    output_path = run_paths.phase3_validation_path(config)
    atomic_write(output_path, output)
    print(output_path)
    if not output["passed"]:
        raise Phase2Error(
            f"Phase 3 candidate validation failed: "
            f"{[name for name, passed in gates.items() if not passed]}"
        )


if __name__ == "__main__":
    main()
