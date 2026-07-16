"""Versioned Propulse path and surface inference service."""

from __future__ import annotations

import json
import hashlib
import logging
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Protocol

import joblib
import numpy as np
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator


ROOT = Path(__file__).resolve().parents[2]
V4 = ROOT / "ml/src/archive_v4"
V41 = ROOT / "ml/src/archive_v4_1"
DEFAULT_PATH_HISTORY_STALE_AFTER_SECONDS = 7200
DEFAULT_XGBOOST_PREDICTION_THREADS = 1
SHADOW_TELEMETRY_SCHEMA_VERSION = "propagation-shadow-v1"
INFERENCE_MODES = {"disabled", "shadow", "active"}
TELEMETRY_BANDS = {
    "160m",
    "80m",
    "60m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
    "6m",
}
TELEMETRY_MODES = {
    "WSPR",
    "FT8",
    "FT4",
    "CW",
    "SSB",
    "RTTY",
    "PSK31",
    "JS8",
    "AM",
    "FM",
}
LOGGER = logging.getLogger("uvicorn.error")
LOGGER.setLevel(logging.INFO)
sys.path.insert(0, str(V4))
# V4.1 joblib bundles retain the historical ``calibration`` module name. Put
# the backward-compatible V4.1 implementation first before unpickling them.
sys.path.insert(0, str(V41))
from station_cast_adapter import apply_station_physics_adapter  # noqa: E402


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StationEnvelope(StrictModel):
    featureContract: str = Field(pattern="^station-chain-v1$")
    chainFingerprint: str
    band: str
    frequencyMHz: float = Field(gt=0)
    mode: str
    requestedPowerWatts: float = Field(ge=0)
    conductedPowerWatts: float = Field(ge=0)
    powerAtAntennaWatts: float = Field(ge=0)
    eirpWatts: float = Field(ge=0)
    erpWatts: float = Field(ge=0)
    totalPassiveLossDb: float = Field(ge=0)
    feedlineLossDb: float = Field(ge=0)
    inlineLossDb: float = Field(ge=0)
    amplifierGainDb: float = Field(ge=0)
    antennaGainTowardPathDbi: float
    targetBearingDeg: float | None
    takeoffAngleDeg: float | None
    receiverNoiseFloorDbm: float | None
    receiverEvidence: str
    receiverEvidenceIsRelative: bool
    localSystemNoiseFloorDbm: float | None
    modeBandwidthHz: float = Field(gt=0)
    modeSnrThresholdDb: float
    supported: bool
    warningCodes: list[str]
    assumptions: list[str]


class PathFeatures(StrictModel):
    target_grid4: str = Field(pattern="^[A-R]{2}[0-9]{2}$")
    values: dict[str, float | int | None]
    station: StationEnvelope | None = None


class PathRequest(StrictModel):
    origin_grid4: str = Field(pattern="^[A-R]{2}[0-9]{2}$")
    issue_time: datetime
    valid_time: datetime
    band: str
    mode: str = "WSPR"
    declared_power_watts: float = Field(gt=0)
    features: PathFeatures
    station: StationEnvelope | None = None
    data_freshness_seconds: dict[str, int] = Field(default_factory=dict)

    @field_validator("valid_time")
    @classmethod
    def valid_after_issue(cls, value: datetime, info: Any) -> datetime:
        issue = info.data.get("issue_time")
        if issue is not None and value < issue:
            raise ValueError("valid_time must be on or after issue_time")
        return value

    @field_validator("data_freshness_seconds")
    @classmethod
    def freshness_is_nonnegative(cls, value: dict[str, int]) -> dict[str, int]:
        if any(age < 0 for age in value.values()):
            raise ValueError("data freshness ages must be non-negative")
        return value


class SurfaceRequest(StrictModel):
    origin_grid4: str = Field(pattern="^[A-R]{2}[0-9]{2}$")
    issue_time: datetime
    valid_time: datetime
    band: str
    mode: str = "WSPR"
    declared_power_watts: float = Field(gt=0)
    cells: list[PathFeatures] = Field(min_length=1, max_length=4096)
    station: StationEnvelope | None = None
    data_freshness_seconds: dict[str, int] = Field(default_factory=dict)

    @field_validator("data_freshness_seconds")
    @classmethod
    def freshness_is_nonnegative(cls, value: dict[str, int]) -> dict[str, int]:
        if any(age < 0 for age in value.values()):
            raise ValueError("data freshness ages must be non-negative")
        return value


class RuntimePrediction(StrictModel):
    probability: float
    confidence: float
    model_version: str
    profile: str
    ood_flags: list[str] = Field(default_factory=list)
    top_factors: list[str] = Field(default_factory=list)


class Predictor(Protocol):
    def predict(
        self, values: dict[str, float | int | None], band: str, stale_history: bool
    ) -> RuntimePrediction: ...

    def predict_many(
        self,
        rows: list[dict[str, float | int | None]],
        bands: list[str],
        stale_history: bool,
    ) -> list[RuntimePrediction]: ...

    def models(self) -> list[dict[str, Any]]: ...

    def health(self) -> dict[str, Any]: ...


def model_feature_value(value: float | int | None) -> float:
    return 0.0 if value is None else float(value)


def resolve_xgboost_prediction_threads(
    runtime_policy: dict[str, Any], override: str | None
) -> tuple[int, str]:
    source = "environment" if override is not None else "manifest"
    raw = (
        override
        if override is not None
        else runtime_policy.get(
            "xgboost_prediction_threads", DEFAULT_XGBOOST_PREDICTION_THREADS
        )
    )
    try:
        threads = int(raw)
    except (TypeError, ValueError) as error:
        raise RuntimeError("XGBoost prediction threads must be an integer") from error
    if threads < 1 or threads > 64:
        raise RuntimeError("XGBoost prediction threads must be between 1 and 64")
    return threads, source


def blend_probabilities(
    predictions: list[np.ndarray], weights: list[float]
) -> np.ndarray:
    if not predictions or len(predictions) != len(weights):
        raise ValueError("ensemble predictions and weights must have equal non-zero length")
    if any(value < 0 for value in weights) or not np.isclose(sum(weights), 1.0):
        raise ValueError("ensemble weights must be non-negative and sum to one")
    shape = predictions[0].shape
    if any(value.shape != shape for value in predictions):
        raise ValueError("ensemble component prediction shapes differ")
    output = np.zeros(shape, dtype=np.float64)
    for prediction, weight in zip(predictions, weights):
        output += float(weight) * prediction.astype(np.float64, copy=False)
    return output


class ModelRegistry:
    def __init__(self, manifest_path: Path) -> None:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.version = payload["model_version"]
        self.feature_contract = payload["feature_contract"]
        self.core_feature_contract = payload.get(
            "core_feature_contract", self.feature_contract
        )
        runtime_policy = payload.get("runtime_policy", {})
        self.path_history_stale_after_seconds = int(
            runtime_policy.get(
                "path_history_stale_after_seconds",
                DEFAULT_PATH_HISTORY_STALE_AFTER_SECONDS,
            )
        )
        if self.path_history_stale_after_seconds < 0:
            raise RuntimeError("path-history stale threshold must be non-negative")
        (
            self.xgboost_prediction_threads,
            self.xgboost_prediction_threads_source,
        ) = resolve_xgboost_prediction_threads(
            runtime_policy, os.environ.get("PROPULSE_XGBOOST_THREADS")
        )
        self.profiles: dict[str, dict[str, Any]] = {}
        for name, item in payload["profiles"].items():
            kind = str(item.get("kind", "single"))
            if kind not in {"single", "weighted_ensemble"}:
                raise RuntimeError(f"unsupported profile kind: {kind}")
            component_items = (
                list(item["components"])
                if kind == "weighted_ensemble"
                else [item]
            )
            components = [
                self._load_component(manifest_path, component)
                for component in component_items
            ]
            features = components[0]["features"]
            if any(component["features"] != features for component in components):
                raise RuntimeError(f"ensemble feature order differs: {name}")
            weights = (
                [float(component["weight"]) for component in component_items]
                if kind == "weighted_ensemble"
                else [1.0]
            )
            if any(value < 0 for value in weights) or not np.isclose(sum(weights), 1.0):
                raise RuntimeError(f"invalid ensemble weights: {name}")
            profile = {
                "kind": kind,
                "components": components,
                "weights": weights,
                "features": features,
                "top_factors": item.get("top_factors", [])[:5],
            }
            if kind == "single":
                profile.update(components[0])
            self.profiles[name] = profile

    def _load_component(
        self, manifest_path: Path, item: dict[str, Any]
    ) -> dict[str, Any]:
        model_path = (manifest_path.parent / item["model_path"]).resolve()
        calibrator_path = (manifest_path.parent / item["calibrator_path"]).resolve()
        for path, expected in (
            (model_path, item["model_sha256"]),
            (calibrator_path, item["calibrator_sha256"]),
        ):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != expected:
                raise RuntimeError(f"model artifact checksum mismatch: {path.name}")
        model = xgb.Booster()
        model.load_model(model_path)
        model.set_param({"nthread": self.xgboost_prediction_threads})
        return {
            "model": model,
            "calibrator": joblib.load(calibrator_path),
            "features": list(map(str, item["features"])),
            "best_iteration": int(item["best_iteration"]),
            "component": str(item.get("component", "single")),
        }

    def predict(
        self, values: dict[str, float | int | None], band: str, stale_history: bool
    ) -> RuntimePrediction:
        return self.predict_many([values], [band], stale_history)[0]

    def predict_many(
        self,
        rows: list[dict[str, float | int | None]],
        bands: list[str],
        stale_history: bool,
    ) -> list[RuntimePrediction]:
        if len(rows) != len(bands) or not rows:
            raise ValueError("rows and bands must have the same non-zero length")
        profile = "physics" if stale_history else "nowcast"
        item = self.profiles.get(profile) or self.profiles.get("physics")
        if item is None:
            raise RuntimeError("no compatible model profile is loaded")
        features = item["features"]
        missing = [
            [name for name in features if values.get(name) is None]
            for values in rows
        ]
        matrix = np.array(
            [
                [model_feature_value(values.get(name)) for name in features]
                for values in rows
            ],
            dtype=np.float32,
        )
        distance = np.array(
            [float(values.get("dist_km") or 0) for values in rows],
            dtype=np.float64,
        )
        component_predictions = []
        band_values = np.asarray(bands)
        for component in item["components"]:
            raw = component["model"].inplace_predict(
                matrix, iteration_range=(0, component["best_iteration"] + 1)
            )
            component_predictions.append(
                component["calibrator"].predict(raw, band_values, distance)
            )
        probabilities = blend_probabilities(component_predictions, item["weights"])
        output = []
        for probability, missing_features in zip(probabilities, missing):
            ood_flags = []
            if missing_features:
                ood_flags.append("missing_features")
            if stale_history:
                ood_flags.append("recent_network_stale_physics_fallback")
            confidence = max(
                0.2,
                1 - min(
                    len(missing_features) / max(len(features), 1), 0.7
                ),
            )
            if stale_history:
                confidence *= 0.75
            output.append(RuntimePrediction(
                probability=float(probability),
                confidence=confidence,
                model_version=self.version,
                profile=profile,
                ood_flags=ood_flags,
                top_factors=item["top_factors"],
            ))
        return output

    def models(self) -> list[dict[str, Any]]:
        return [{
            "model_version": self.version,
            "feature_contract": self.feature_contract,
            "core_feature_contract": self.core_feature_contract,
            "profiles": sorted(self.profiles),
            "profile_kinds": {
                name: item["kind"] for name, item in sorted(self.profiles.items())
            },
            "runtime_policy": {
                "path_history_stale_after_seconds": (
                    self.path_history_stale_after_seconds
                ),
                "xgboost_prediction_threads": self.xgboost_prediction_threads,
                "xgboost_prediction_threads_source": (
                    self.xgboost_prediction_threads_source
                ),
            },
        }]

    def health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "model_version": self.version,
            "profiles": sorted(self.profiles),
            "core_feature_contract": self.core_feature_contract,
            "xgboost_prediction_threads": self.xgboost_prediction_threads,
            "xgboost_prediction_threads_source": (
                self.xgboost_prediction_threads_source
            ),
        }


class UnavailableRegistry:
    path_history_stale_after_seconds = DEFAULT_PATH_HISTORY_STALE_AFTER_SECONDS
    core_feature_contract = "unknown"

    def predict(self, values: dict[str, float | int | None], band: str, stale_history: bool) -> RuntimePrediction:
        raise RuntimeError("no approved model bundle is loaded")

    def predict_many(self, rows, bands, stale_history):
        raise RuntimeError("no approved model bundle is loaded")

    def models(self) -> list[dict[str, Any]]:
        return []

    def health(self) -> dict[str, Any]:
        return {"status": "unavailable", "reason": "no approved model bundle is loaded"}


def path_history_is_stale(
    runtime: Predictor, data_freshness_seconds: dict[str, int]
) -> bool:
    threshold = int(
        getattr(
            runtime,
            "path_history_stale_after_seconds",
            DEFAULT_PATH_HISTORY_STALE_AFTER_SECONDS,
        )
    )
    age = data_freshness_seconds.get("path_history")
    return age is None or age > threshold


def resolve_inference_mode(configured: str | None) -> str:
    mode = (configured or "disabled").strip().lower()
    if mode == "off":
        mode = "disabled"
    if mode not in INFERENCE_MODES:
        raise RuntimeError(
            "PROPULSE_INFERENCE_MODE must be disabled, shadow, or active"
        )
    return mode


def probability_summary(values: list[float]) -> dict[str, float]:
    array = np.asarray(values, dtype=np.float64)
    return {
        "minimum": float(array.min()),
        "mean": float(array.mean()),
        "maximum": float(array.max()),
    }


def allowlisted_telemetry_dimension(value: str, allowed: set[str]) -> str:
    canonical = {item.lower(): item for item in allowed}
    return canonical.get(value.strip().lower(), "other")


def shadow_telemetry_event(
    request: PathRequest | SurfaceRequest,
    responses: list[dict[str, Any]],
    *,
    inference_mode: str,
    request_kind: str,
    feature_contract: str,
    stale_history: bool,
    latency_ms: float,
) -> dict[str, Any]:
    profiles = Counter(str(item["profile"]) for item in responses)
    ood_flags = Counter(
        str(flag) for item in responses for flag in item["ood_flags"]
    )
    path_history_age = request.data_freshness_seconds.get("path_history")
    return {
        "schema_version": SHADOW_TELEMETRY_SCHEMA_VERSION,
        "event_type": "propagation_inference_completed",
        "inference_mode": inference_mode,
        "request_kind": request_kind,
        "receipt_time": datetime.now(timezone.utc).isoformat(),
        "issue_time": request.issue_time.isoformat(),
        "valid_time": request.valid_time.isoformat(),
        "band": allowlisted_telemetry_dimension(request.band, TELEMETRY_BANDS),
        "mode": allowlisted_telemetry_dimension(request.mode, TELEMETRY_MODES),
        "cell_count": len(responses),
        "model_version": str(responses[0]["model_version"]),
        "feature_contract": feature_contract,
        "station_feature_contract": str(responses[0]["feature_contract"]),
        "profile_counts": dict(sorted(profiles.items())),
        "source_freshness": {
            "path_history_seconds": path_history_age,
            "path_history_stale": stale_history,
            "space_weather_seconds": request.data_freshness_seconds.get(
                "space_weather"
            ),
        },
        "ood_flag_counts": dict(sorted(ood_flags.items())),
        "core_probability_summary": probability_summary(
            [float(item["core_probability"]) for item in responses]
        ),
        "personalized_probability_summary": probability_summary(
            [float(item["personalized_probability"]) for item in responses]
        ),
        "confidence_summary": probability_summary(
            [float(item["confidence"]) for item in responses]
        ),
        "latency_ms": float(latency_ms),
    }


def log_shadow_telemetry(event: dict[str, Any]) -> None:
    LOGGER.info("propagation_inference %s", json.dumps(event, sort_keys=True))


def prediction_response(request: PathRequest, runtime: RuntimePrediction) -> dict[str, Any]:
    personalized = runtime.probability
    confidence = runtime.confidence
    assumptions = ["core_estimand_is_single_wspr_decode"]
    if request.station is not None:
        adjustment = apply_station_physics_adapter(
            runtime.probability,
            runtime.confidence,
            request.declared_power_watts,
            request.station.model_dump(),
        )
        personalized = adjustment["personalizedProbability"]
        confidence = adjustment["confidence"]
        assumptions.extend(adjustment["assumptions"])
    return {
        "model_version": runtime.model_version,
        "feature_contract": "station-chain-v1",
        "issue_time": request.issue_time,
        "valid_time": request.valid_time,
        "band": request.band,
        "mode": request.mode,
        "target_grid4": request.features.target_grid4,
        "core_probability": runtime.probability,
        "personalized_probability": personalized,
        "confidence": confidence,
        "ood_flags": runtime.ood_flags,
        "data_freshness": request.data_freshness_seconds,
        "top_factors": runtime.top_factors,
        "assumptions": assumptions,
        "profile": runtime.profile,
    }


def create_app(
    registry: Predictor | None = None,
    inference_mode: str | None = None,
    telemetry_sink: Callable[[dict[str, Any]], None] | None = None,
) -> FastAPI:
    runtime = registry
    if runtime is None:
        manifest = os.environ.get("PROPULSE_MODEL_BUNDLE")
        runtime = ModelRegistry(Path(manifest)) if manifest else UnavailableRegistry()
    selected_inference_mode = resolve_inference_mode(
        inference_mode
        if inference_mode is not None
        else os.environ.get("PROPULSE_INFERENCE_MODE")
    )
    runtime_feature_contract = str(
        getattr(runtime, "core_feature_contract", "unknown")
    )
    emit_telemetry = telemetry_sink or log_shadow_telemetry
    app = FastAPI(title="Propulse Propagation API", version="1.0.0")
    allowed_origins = [
        value.strip()
        for value in os.environ.get(
            "PROPULSE_ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if value.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.get("/v1/propagation/health")
    def health() -> dict[str, Any]:
        return {
            **runtime.health(),
            "checked_at": datetime.now(timezone.utc),
            "inference_mode": selected_inference_mode,
            "telemetry_schema_version": SHADOW_TELEMETRY_SCHEMA_VERSION,
        }

    @app.get("/v1/propagation/models")
    def models() -> dict[str, Any]:
        return {"models": runtime.models()}

    @app.post("/v1/propagation/path")
    def path(request: PathRequest) -> dict[str, Any]:
        started = time.perf_counter()
        stale = path_history_is_stale(runtime, request.data_freshness_seconds)
        try:
            prediction = runtime.predict(request.features.values, request.band, stale)
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        response = prediction_response(request, prediction)
        if selected_inference_mode != "disabled":
            try:
                emit_telemetry(shadow_telemetry_event(
                    request,
                    [response],
                    inference_mode=selected_inference_mode,
                    request_kind="path",
                    feature_contract=runtime_feature_contract,
                    stale_history=stale,
                    latency_ms=(time.perf_counter() - started) * 1000,
                ))
            except Exception:
                LOGGER.exception("propagation telemetry sink failed")
        return response

    @app.post("/v1/propagation/surface")
    def surface(request: SurfaceRequest) -> dict[str, Any]:
        started = time.perf_counter()
        stale = path_history_is_stale(runtime, request.data_freshness_seconds)
        predictions = []
        try:
            if hasattr(runtime, "predict_many"):
                runtime_predictions = runtime.predict_many(
                    [cell.values for cell in request.cells],
                    [request.band] * len(request.cells),
                    stale,
                )
            else:
                runtime_predictions = [
                    runtime.predict(cell.values, request.band, stale)
                    for cell in request.cells
                ]
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        for cell, prediction in zip(request.cells, runtime_predictions):
            path_request = PathRequest(
                origin_grid4=request.origin_grid4,
                issue_time=request.issue_time,
                valid_time=request.valid_time,
                band=request.band,
                mode=request.mode,
                declared_power_watts=request.declared_power_watts,
                features=cell,
                station=cell.station or request.station,
                data_freshness_seconds=request.data_freshness_seconds,
            )
            predictions.append(prediction_response(path_request, prediction))
        if selected_inference_mode != "disabled":
            try:
                emit_telemetry(shadow_telemetry_event(
                    request,
                    predictions,
                    inference_mode=selected_inference_mode,
                    request_kind="surface",
                    feature_contract=runtime_feature_contract,
                    stale_history=stale,
                    latency_ms=(time.perf_counter() - started) * 1000,
                ))
            except Exception:
                LOGGER.exception("propagation telemetry sink failed")
        return {
            "origin_grid4": request.origin_grid4,
            "issue_time": request.issue_time,
            "valid_time": request.valid_time,
            "band": request.band,
            "mode": request.mode,
            "cells": predictions,
        }

    return app


app = create_app()
