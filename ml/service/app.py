"""Versioned Propulse path and surface inference service."""

from __future__ import annotations

import json
import hashlib
import hmac
import logging
import math
import os
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Protocol
from uuid import uuid4

import joblib
import numpy as np
import xgboost as xgb
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from beta_telemetry import (
    BetaTelemetrySink,
    UnavailableBetaTelemetrySink,
    emit_shadow_telemetry,
    model_beta_telemetry_sink_from_environment,
    station_envelope_stop_counts,
)
from path_history import (
    PATH_LAGS,
    PathHistoryProvider,
    VerifiedPathHistory,
    path_history_provider_from_environment,
)
from operational_weather import (
    DERIVED_WEATHER_FEATURES,
    RAW_WEATHER_FEATURES,
    OperationalWeatherProvider,
    VerifiedOperationalWeather,
    operational_weather_provider_from_environment,
)
from runtime_activation import RuntimeActivation, load_runtime_activation
from serving_manifest import (
    resolve_bundle_artifact,
    sha256_file,
    validate_serving_manifest,
)


ROOT = Path(__file__).resolve().parents[2]
V4 = ROOT / "ml/src/archive_v4"
V41 = ROOT / "ml/src/archive_v4_1"
DEFAULT_PATH_HISTORY_STALE_AFTER_SECONDS = 7200
DEFAULT_XGBOOST_PREDICTION_THREADS = 1
SHADOW_TELEMETRY_SCHEMA_VERSION = "propagation-shadow-v1"
RESEARCH_RECEIPT_SCHEMA_VERSION = "propagation-research-receipt-v2"
RESEARCH_SUBJECT_SCHEMA_VERSION = "propagation-research-subject-v1"
CAPABILITIES_SCHEMA_VERSION = "propagation-capabilities-v1"
RESEARCH_RECEIPT_TTL_SECONDS = 24 * 60 * 60
MISSING_FEATURE_EVENT_CAP = 64
MISSING_FEATURE_HEALTH_TOP_N = 20
RAW_RECEIPT_FORBIDDEN_KEYS = frozenset({
    "amplifiergaindb",
    "antennagaintowardpathdbi",
    "callsign",
    "conductedpowerwatts",
    "coordinates",
    "email",
    "eirpwatts",
    "erpwatts",
    "feedlinelossdb",
    "inlineequipment",
    "inlinelossdb",
    "inventory",
    "localsystemnoisefloordbm",
    "password",
    "poweratantennawatts",
    "radioid",
    "receivernoisefloordbm",
    "requestedpowerwatts",
    "station",
    "totalpassivelossdb",
    "user_id",
    "userid",
    "values",
})
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


class ResearchSubjectBinding(StrictModel):
    schema_version: str = Field(pattern="^propagation-research-subject-v1$")
    expires_at: datetime
    hmac_sha256: str = Field(pattern="^[0-9a-f]{64}$")

    @field_validator("expires_at")
    @classmethod
    def expiry_is_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("research subject expiry must include a UTC offset")
        return value


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
    research_subject_binding: ResearchSubjectBinding | None = None

    @field_validator("issue_time", "valid_time")
    @classmethod
    def timestamps_are_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamps must include a UTC offset")
        return value

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
    research_subject_binding: ResearchSubjectBinding | None = None

    @field_validator("issue_time", "valid_time")
    @classmethod
    def timestamps_are_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamps must include a UTC offset")
        return value

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


class RuntimePrediction(StrictModel):
    probability: float
    confidence: float
    model_version: str
    profile: str
    ood_flags: list[str] = Field(default_factory=list)
    top_factors: list[str] = Field(default_factory=list)
    missing_feature_names: list[str] = Field(default_factory=list)


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
        validate_serving_manifest(payload)
        self.version = payload["model_version"]
        self.release_stage = payload["release_stage"]
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
        if self.xgboost_prediction_threads != 1:
            raise RuntimeError(
                "retrospective internal serving requires one prediction thread"
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
        model_path = resolve_bundle_artifact(manifest_path, item["model_path"])
        calibrator_path = resolve_bundle_artifact(
            manifest_path,
            item["calibrator_path"],
        )
        for path, expected in (
            (model_path, item["model_sha256"]),
            (calibrator_path, item["calibrator_sha256"]),
        ):
            digest = sha256_file(path)
            if digest != expected:
                raise RuntimeError(f"model artifact checksum mismatch: {path.name}")
        model = xgb.Booster()
        model.load_model(model_path)
        model.set_param({"nthread": self.xgboost_prediction_threads})
        features = list(map(str, item["features"]))
        if model.num_features() != len(features):
            raise RuntimeError(
                f"model feature count differs: {item['component']}"
            )
        calibrator = joblib.load(calibrator_path)
        calibrator_class = (
            f"{type(calibrator).__module__}.{type(calibrator).__qualname__}"
        )
        if (
            calibrator_class != item["calibrator_class"]
            or not callable(getattr(calibrator, "predict", None))
        ):
            raise RuntimeError(
                f"non-native model/calibrator combination: {item['component']}"
            )
        return {
            "model": model,
            "calibrator": calibrator,
            "features": features,
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
                missing_feature_names=list(missing_features),
            ))
        return output

    def models(self) -> list[dict[str, Any]]:
        return [{
            "model_version": self.version,
            "release_stage": self.release_stage,
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
            "release_stage": self.release_stage,
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


def runtime_profile_names(runtime: Predictor) -> list[str]:
    profiles: set[str] = set()
    for model in runtime.models():
        raw_profiles = model.get("profiles", [])
        if isinstance(raw_profiles, list):
            profiles.update(
                value for value in raw_profiles if isinstance(value, str)
            )
    return sorted(profiles)


def build_runtime_capabilities(
    runtime: Predictor,
    inference_mode: str,
    activation: RuntimeActivation,
    beta_collection_enabled: bool,
) -> dict[str, Any]:
    profiles = runtime_profile_names(runtime)
    execution_enabled = inference_mode in {"shadow", "active"}
    core_available = execution_enabled and {
        "nowcast",
        "physics",
    }.issubset(profiles)

    def status(mode: str, internal_available: bool) -> dict[str, bool]:
        return {
            "internal_available": internal_available,
            "released_eligible": activation.allows(mode),
        }

    released_horizons = [
        horizon
        for horizon in activation.futurecast_horizons_hours
        if activation.allows_futurecast_horizon(horizon)
    ]
    return {
        "schema_version": CAPABILITIES_SCHEMA_VERSION,
        "inference_mode": inference_mode,
        "service_execution_enabled": execution_enabled,
        "model_loaded": bool(runtime.models()),
        "loaded_profiles": profiles,
        "runtime_activation_valid": not activation.errors,
        "runtime_activation_errors": list(activation.errors),
        "beta_collection_enabled": beta_collection_enabled,
        "modes": {
            "system_health_view": status("system_health_view", True),
            "beta_collection": status(
                "beta_collection",
                beta_collection_enabled,
            ),
            "core_nowcast": status("core_nowcast", core_available),
            "stationcast_deterministic": status(
                "stationcast_deterministic",
                core_available,
            ),
            "stationcast_learned": status(
                "stationcast_learned",
                False,
            ),
            "futurecast": {
                **status("futurecast", False),
                "released_horizons_hours": released_horizons,
            },
            "six_meter": status("six_meter", False),
        },
    }


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


def verified_path_history(
    provider: PathHistoryProvider,
    *,
    issue_time: datetime,
    band: str,
    origin_grid4: str,
    target_grid4s: list[str],
) -> dict[str, VerifiedPathHistory]:
    if provider.name == "unavailable":
        # No feature-store provider is configured. This is the expected
        # steady state when the trio env vars are unset (or explicitly
        # overridden off): skip the no-op lookup and do not warn per
        # request. A single startup log line already recorded this.
        return {}
    try:
        snapshots = provider.lookup(
            issue_time=issue_time,
            band=band,
            origin_grid4=origin_grid4,
            target_grid4s=target_grid4s,
        )
    except RuntimeError:
        LOGGER.warning("verified path-history provider lookup failed; using fallback")
        return {}
    expected_targets = set(target_grid4s)
    if set(snapshots) != expected_targets:
        return {}
    for target, snapshot in snapshots.items():
        if (
            snapshot.target_grid4 != target
            or snapshot.provider != provider.name
            or snapshot.transform_version != provider.transform_version
            or snapshot.available_at > issue_time
            or snapshot.source_watermark > issue_time
            or snapshot.source_watermark > snapshot.available_at
            or snapshot.quality_flags
        ):
            return {}
    return snapshots


def apply_verified_path_history(
    provider: PathHistoryProvider,
    *,
    issue_time: datetime,
    band: str,
    origin_grid4: str,
    cells: list[PathFeatures],
    client_freshness: dict[str, int],
) -> tuple[list[PathFeatures], dict[str, int]]:
    targets = [cell.target_grid4 for cell in cells]
    snapshots = verified_path_history(
        provider,
        issue_time=issue_time,
        band=band,
        origin_grid4=origin_grid4,
        target_grid4s=targets,
    )
    freshness = {
        key: value
        for key, value in client_freshness.items()
        if key != "path_history"
    }
    if snapshots:
        freshness["path_history"] = max(
            math.ceil((issue_time - snapshot.source_watermark).total_seconds())
            for snapshot in snapshots.values()
        )
    verified_cells = []
    for cell in cells:
        values = dict(cell.values)
        for lag in PATH_LAGS:
            values[f"path_success_prev{lag}"] = 0.0
            values[f"path_prev{lag}_available"] = 0
        snapshot = snapshots.get(cell.target_grid4)
        if snapshot is not None:
            values.update(snapshot.feature_values())
        verified_cells.append(cell.model_copy(update={"values": values}))
    return verified_cells, freshness


def verified_operational_weather(
    provider: OperationalWeatherProvider,
    *,
    issue_time: datetime,
) -> VerifiedOperationalWeather | None:
    try:
        snapshot = provider.lookup(issue_time=issue_time)
    except RuntimeError as error:
        cause = error.__cause__
        status_code = getattr(getattr(cause, "response", None), "status_code", None)
        LOGGER.warning(
            "verified operational-weather lookup failed; using missing values "
            "(provider=%s reason=lookup_failed error=%s status=%s)",
            provider.name,
            type(cause).__name__ if cause is not None else type(error).__name__,
            status_code,
        )
        return None
    if snapshot is None:
        return None
    if snapshot.provider != provider.name:
        LOGGER.warning(
            "verified operational-weather snapshot rejected; using missing values "
            "(provider=%s reason=provider_mismatch)",
            provider.name,
        )
        return None
    if snapshot.available_at > issue_time:
        LOGGER.warning(
            "verified operational-weather snapshot rejected; using missing values "
            "(provider=%s reason=future_available_at)",
            provider.name,
        )
        return None
    if (
        snapshot.source_watermark > issue_time
        or snapshot.source_watermark > snapshot.available_at
    ):
        LOGGER.warning(
            "verified operational-weather snapshot rejected; using missing values "
            "(provider=%s reason=watermark_ordering)",
            provider.name,
        )
        return None
    if snapshot.quality_flags:
        LOGGER.warning(
            "verified operational-weather snapshot rejected; using missing values "
            "(provider=%s reason=quality_flags flags=%s)",
            provider.name,
            ",".join(snapshot.quality_flags),
        )
        return None
    return snapshot


def apply_verified_operational_weather(
    provider: OperationalWeatherProvider,
    *,
    issue_time: datetime,
    cells: list[PathFeatures],
    client_freshness: dict[str, int],
) -> tuple[list[PathFeatures], dict[str, int]]:
    snapshot = verified_operational_weather(provider, issue_time=issue_time)
    freshness = {
        key: value
        for key, value in client_freshness.items()
        if key != "space_weather"
    }
    if snapshot is not None:
        freshness["space_weather"] = max(
            0,
            math.ceil((issue_time - snapshot.source_watermark).total_seconds()),
        )
    verified_cells = []
    for cell in cells:
        values = dict(cell.values)
        for name in RAW_WEATHER_FEATURES:
            values.pop(name, None)
            values[f"{name}_missing"] = 1
        for name in DERIVED_WEATHER_FEATURES:
            values.pop(name, None)
        if snapshot is not None:
            for name, value in snapshot.values.items():
                values[name] = value
                if name in RAW_WEATHER_FEATURES:
                    values[f"{name}_missing"] = 0
        verified_cells.append(cell.model_copy(update={"values": values}))
    return verified_cells, freshness


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


def missing_feature_summary(predictions: list[RuntimePrediction]) -> dict[str, Any]:
    first_row_missing = predictions[0].missing_feature_names if predictions else []
    histogram = Counter(
        name for prediction in predictions for name in prediction.missing_feature_names
    )
    return {
        "first_row_names": sorted(first_row_missing)[:MISSING_FEATURE_EVENT_CAP],
        "first_row_count": len(first_row_missing),
        "histogram": dict(sorted(histogram.items())[:MISSING_FEATURE_EVENT_CAP]),
    }


def shadow_telemetry_event(
    request: PathRequest | SurfaceRequest,
    responses: list[dict[str, Any]],
    *,
    inference_mode: str,
    request_kind: str,
    feature_contract: str,
    path_history_provider: str,
    path_history_transform_version: str,
    operational_weather_provider: str,
    stale_history: bool,
    latency_ms: float,
    predictions: list[RuntimePrediction] | None = None,
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
        "path_history_provider": path_history_provider,
        "path_history_transform_version": path_history_transform_version,
        "path_history_hit": not stale_history and path_history_provider != "unavailable",
        "physics_fallback": stale_history or path_history_provider == "unavailable",
        "operational_weather_provider": operational_weather_provider,
        "profile_counts": dict(sorted(profiles.items())),
        "source_freshness": {
            "path_history_seconds": path_history_age,
            "path_history_stale": stale_history,
            "space_weather_seconds": request.data_freshness_seconds.get(
                "space_weather"
            ),
        },
        "ood_flag_counts": dict(sorted(ood_flags.items())),
        "missing_features": missing_feature_summary(predictions or []),
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


def canonical_research_receipt_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def research_receipt_signature(signed_payload: str, secret: str) -> str:
    if len(secret) < 32:
        raise ValueError("research receipt signing secret must be at least 32 characters")
    return hmac.new(
        secret.encode(), signed_payload.encode(), hashlib.sha256
    ).hexdigest()


def station_capability_classes(
    station: StationEnvelope | None,
) -> dict[str, str | bool]:
    if station is None:
        return {
            "tx_eirp": "unknown",
            "passive_loss": "unknown",
            "directional_gain": "unknown",
            "receiver_evidence": "unknown",
            "supported": False,
        }

    eirp = station.eirpWatts
    tx_eirp = (
        "lt_1w" if eirp < 1
        else "1_5w" if eirp < 5
        else "5_25w" if eirp < 25
        else "25_100w" if eirp < 100
        else "100_500w" if eirp < 500
        else "ge_500w"
    )
    loss = station.totalPassiveLossDb
    passive_loss = (
        "lt_1db" if loss < 1
        else "1_3db" if loss < 3
        else "3_6db" if loss < 6
        else "ge_6db"
    )
    gain = station.antennaGainTowardPathDbi
    directional_gain = (
        "lt_0dbi" if gain < 0
        else "0_3dbi" if gain < 3
        else "3_6dbi" if gain < 6
        else "6_10dbi" if gain < 10
        else "ge_10dbi"
    )
    receiver_evidence = (
        "measured"
        if station.localSystemNoiseFloorDbm is not None
        else "relative"
        if station.receiverEvidenceIsRelative
        else "catalog"
        if station.receiverNoiseFloorDbm is not None
        else "unknown"
    )
    return {
        "tx_eirp": tx_eirp,
        "passive_loss": passive_loss,
        "directional_gain": directional_gain,
        "receiver_evidence": receiver_evidence,
        "supported": station.supported,
    }


def build_research_receipt(
    request: PathRequest,
    response: dict[str, Any],
    *,
    core_feature_contract: str,
    secret: str,
    issued_at: datetime | None = None,
    prediction_id: str | None = None,
) -> dict[str, Any]:
    now = issued_at or datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("research receipt issue time must include a UTC offset")
    payload = {
        "schema_version": RESEARCH_RECEIPT_SCHEMA_VERSION,
        "prediction_id": prediction_id or str(uuid4()),
        "receipt_issued_at": now.isoformat(),
        "receipt_expires_at": (
            now + timedelta(seconds=RESEARCH_RECEIPT_TTL_SECONDS)
        ).isoformat(),
        "model_version": str(response["model_version"]),
        "feature_contract": core_feature_contract,
        "station_feature_contract": str(response["feature_contract"]),
        "chain_fingerprint": (
            request.station.chainFingerprint if request.station is not None else "core"
        ),
        "origin_grid4": request.origin_grid4,
        "target_grid4": str(response["target_grid4"]),
        "issue_time": request.issue_time.isoformat(),
        "valid_time": request.valid_time.isoformat(),
        "band": request.band,
        "mode": request.mode,
        "declared_power_watts": request.declared_power_watts,
        "core_probability": float(response["core_probability"]),
        "personalized_probability": float(response["personalized_probability"]),
        "profile": str(response["profile"]),
        "station_capability": station_capability_classes(request.station),
        "confidence": float(response["confidence"]),
        "ood_flags": list(response["ood_flags"]),
        "freshness": dict(response["data_freshness"]),
        "assumptions": list(response["assumptions"]),
        "research_subject_binding": request.research_subject_binding.model_dump(
            mode="json"
        ),
    }
    signed_payload = canonical_research_receipt_payload(payload)
    return {
        "signed_payload": signed_payload,
        "hmac_sha256": research_receipt_signature(signed_payload, secret),
    }


def receipt_contains_raw_private_fields(value: Any) -> bool:
    if isinstance(value, dict):
        if any(str(key).lower() in RAW_RECEIPT_FORBIDDEN_KEYS for key in value):
            return True
        return any(receipt_contains_raw_private_fields(item) for item in value.values())
    if isinstance(value, list):
        return any(receipt_contains_raw_private_fields(item) for item in value)
    return False


def beta_stop_counts_for_prediction(
    request: PathRequest,
    response: dict[str, Any],
) -> dict[str, int]:
    station = request.station
    counts = station_envelope_stop_counts(
        station,
        request_band=request.band,
        request_mode=request.mode,
        request_declared_power_watts=request.declared_power_watts,
    )
    if (
        station is not None
        and not station.supported
        and float(response["personalized_probability"]) != 0
    ):
        counts["unsupported_support_events"] = 1
    return counts


def station_math_is_valid(request: PathRequest) -> bool:
    return "equipment_math_events" not in beta_stop_counts_for_prediction(
        request,
        {"personalized_probability": 0.0},
    )


def beta_stop_event_for_prediction(
    request: PathRequest,
    response: dict[str, Any],
) -> str | None:
    counts = beta_stop_counts_for_prediction(request, response)
    for name in ("equipment_math_events", "unsupported_support_events"):
        if counts.get(name):
            return name
    return None


def prediction_response(request: PathRequest, runtime: RuntimePrediction) -> dict[str, Any]:
    personalized = runtime.probability
    confidence = runtime.confidence
    assumptions = ["core_estimand_is_single_wspr_decode"]
    assumptions.append(
        "path_history_server_verified"
        if runtime.profile == "nowcast"
        else "path_history_stale_or_unavailable_physics_fallback"
    )
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
    path_history_provider: PathHistoryProvider | None = None,
    operational_weather_provider: OperationalWeatherProvider | None = None,
    research_receipt_secret: str | None = None,
    beta_telemetry_sink: BetaTelemetrySink | None = None,
    runtime_activation: RuntimeActivation | None = None,
    service_token: str | None = None,
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
    selected_runtime_activation = runtime_activation or load_runtime_activation()
    selected_research_receipt_secret = (
        research_receipt_secret
        if research_receipt_secret is not None
        else os.environ.get("PROPULSE_RESEARCH_RECEIPT_SECRET", "")
    )
    if selected_research_receipt_secret and len(selected_research_receipt_secret) < 32:
        raise RuntimeError(
            "PROPULSE_RESEARCH_RECEIPT_SECRET must be at least 32 characters"
        )
    beta_collection_activated = selected_runtime_activation.allows(
        "beta_collection"
    )
    research_receipts_enabled = bool(
        selected_inference_mode == "active" and beta_collection_activated
    )
    if research_receipts_enabled and not selected_research_receipt_secret:
        raise RuntimeError(
            "active beta collection requires PROPULSE_RESEARCH_RECEIPT_SECRET"
        )
    selected_beta_telemetry_sink = (
        beta_telemetry_sink
        if beta_telemetry_sink is not None
        else model_beta_telemetry_sink_from_environment()
        if research_receipts_enabled
        else UnavailableBetaTelemetrySink()
    )
    if research_receipts_enabled and not selected_beta_telemetry_sink.configured:
        raise RuntimeError(
            "active research receipts require beta stop-event telemetry"
        )
    selected_service_token = (
        service_token
        if service_token is not None
        else os.environ.get("PROPULSE_SERVICE_TOKEN", "")
    )
    if selected_service_token and len(selected_service_token) < 32:
        raise RuntimeError("PROPULSE_SERVICE_TOKEN must be at least 32 characters")
    service_auth_enabled = bool(selected_service_token)
    runtime_feature_contract = str(
        getattr(runtime, "core_feature_contract", "unknown")
    )
    history_provider = (
        path_history_provider
        if path_history_provider is not None
        else path_history_provider_from_environment()
    )
    weather_provider = (
        operational_weather_provider
        if operational_weather_provider is not None
        else operational_weather_provider_from_environment()
    )
    if history_provider.name == "unavailable":
        LOGGER.info(
            "path-history provider is unavailable at startup; "
            "serving the physics profile for every request"
        )
    emit_telemetry = telemetry_sink or log_shadow_telemetry
    missing_feature_counter: Counter[str] = Counter()
    # The profile a request is *expected* to serve, given provider
    # configuration at startup. A configured provider can still fail per
    # request or return stale rows, so this is not the whole story -
    # served_profile_counter (below) tracks what predict_many actually
    # returned, since startup.
    serving_profile = "physics" if history_provider.name == "unavailable" else "nowcast"
    served_profile_counter: Counter[str] = Counter()
    app = FastAPI(title="Propulse Propagation API", version="1.0.0")

    @app.middleware("http")
    async def require_service_auth(request: Request, call_next):
        protected = (
            request.url.path.startswith("/v1/propagation/")
            and request.url.path != "/v1/propagation/health"
            and request.method != "OPTIONS"
        )
        if protected and service_auth_enabled:
            authorization = request.headers.get("authorization", "")
            scheme, _, credential = authorization.partition(" ")
            authorized = (
                scheme.lower() == "bearer"
                and bool(credential)
                and hmac.compare_digest(credential, selected_service_token)
            )
            if not authorized:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "service authorization required"},
                )
        return await call_next(request)

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
            "activated_runtime_modes": sorted(
                selected_runtime_activation.approved_modes
            ),
            "telemetry_schema_version": SHADOW_TELEMETRY_SCHEMA_VERSION,
            "research_receipt_schema_version": RESEARCH_RECEIPT_SCHEMA_VERSION,
            "research_receipts_enabled": research_receipts_enabled,
            "beta_collection_activated": beta_collection_activated,
            "service_auth_enabled": service_auth_enabled,
            "beta_stop_event_telemetry_configured": (
                selected_beta_telemetry_sink.configured
            ),
            "path_history_provider": history_provider.name,
            "path_history_transform_version": history_provider.transform_version,
            "operational_weather_provider": weather_provider.name,
            "serving_profile": serving_profile,
            "served_profile_counts": dict(served_profile_counter),
            "missing_feature_counts": [
                {"feature": name, "count": count}
                for name, count in missing_feature_counter.most_common(
                    MISSING_FEATURE_HEALTH_TOP_N
                )
            ],
        }

    @app.get("/v1/propagation/capabilities")
    def capabilities() -> dict[str, Any]:
        return build_runtime_capabilities(
            runtime,
            selected_inference_mode,
            selected_runtime_activation,
            research_receipts_enabled,
        )

    @app.get("/v1/propagation/models")
    def models() -> dict[str, Any]:
        return {"models": runtime.models()}

    @app.post("/v1/propagation/path")
    def path(request: PathRequest) -> dict[str, Any]:
        if selected_inference_mode == "disabled":
            raise HTTPException(status_code=503, detail="inference is disabled")
        started = time.perf_counter()
        features, freshness = apply_verified_path_history(
            history_provider,
            issue_time=request.issue_time,
            band=request.band,
            origin_grid4=request.origin_grid4,
            cells=[request.features],
            client_freshness=request.data_freshness_seconds,
        )
        features, freshness = apply_verified_operational_weather(
            weather_provider,
            issue_time=request.issue_time,
            cells=features,
            client_freshness=freshness,
        )
        verified_request = request.model_copy(update={
            "features": features[0],
            "data_freshness_seconds": freshness,
        })
        stale = path_history_is_stale(runtime, freshness)
        try:
            prediction = runtime.predict(features[0].values, request.band, stale)
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        missing_feature_counter.update(prediction.missing_feature_names)
        served_profile_counter.update([prediction.profile])
        response = prediction_response(verified_request, prediction)
        if research_receipts_enabled:
            stop_counts = beta_stop_counts_for_prediction(
                verified_request,
                response,
            )
            if stop_counts:
                try:
                    selected_beta_telemetry_sink.record(stop_counts)
                except Exception as error:
                    raise HTTPException(
                        status_code=503,
                        detail="beta stop-event telemetry unavailable",
                    ) from error
                raise HTTPException(
                    status_code=503,
                    detail="beta safety invariant failed",
                )
        if research_receipts_enabled and verified_request.research_subject_binding:
            receipt = build_research_receipt(
                verified_request,
                response,
                core_feature_contract=runtime_feature_contract,
                secret=selected_research_receipt_secret,
            )
            decoded_receipt = json.loads(receipt["signed_payload"])
            if receipt_contains_raw_private_fields(decoded_receipt):
                try:
                    selected_beta_telemetry_sink.record({"privacy_events": 1})
                except Exception as error:
                    raise HTTPException(
                        status_code=503,
                        detail="beta stop-event telemetry unavailable",
                    ) from error
                raise HTTPException(
                    status_code=503,
                    detail="beta safety invariant failed",
                )
            response["research_receipt"] = receipt
        if selected_inference_mode != "disabled":
            try:
                emit_shadow_telemetry(
                    shadow_telemetry_event(
                        verified_request,
                        [response],
                        inference_mode=selected_inference_mode,
                        request_kind="path",
                        feature_contract=runtime_feature_contract,
                        path_history_provider=history_provider.name,
                        path_history_transform_version=history_provider.transform_version,
                        operational_weather_provider=weather_provider.name,
                        stale_history=stale,
                        latency_ms=(time.perf_counter() - started) * 1000,
                        predictions=[prediction],
                    ),
                    sink=emit_telemetry,
                    beta_recorder=selected_beta_telemetry_sink,
                    beta_collection_enabled=research_receipts_enabled,
                )
            except Exception as error:
                LOGGER.exception("propagation telemetry sink failed")
                if research_receipts_enabled:
                    raise HTTPException(
                        status_code=503,
                        detail="beta stop-event telemetry unavailable",
                    ) from error
        return response

    @app.post("/v1/propagation/surface")
    def surface(request: SurfaceRequest) -> dict[str, Any]:
        if selected_inference_mode == "disabled":
            raise HTTPException(status_code=503, detail="inference is disabled")
        started = time.perf_counter()
        cells, freshness = apply_verified_path_history(
            history_provider,
            issue_time=request.issue_time,
            band=request.band,
            origin_grid4=request.origin_grid4,
            cells=request.cells,
            client_freshness=request.data_freshness_seconds,
        )
        cells, freshness = apply_verified_operational_weather(
            weather_provider,
            issue_time=request.issue_time,
            cells=cells,
            client_freshness=freshness,
        )
        verified_request = request.model_copy(update={
            "cells": cells,
            "data_freshness_seconds": freshness,
        })
        stale = path_history_is_stale(runtime, freshness)
        predictions = []
        try:
            if hasattr(runtime, "predict_many"):
                runtime_predictions = runtime.predict_many(
                    [cell.values for cell in cells],
                    [request.band] * len(cells),
                    stale,
                )
            else:
                runtime_predictions = [
                    runtime.predict(cell.values, request.band, stale)
                    for cell in cells
                ]
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        for runtime_prediction in runtime_predictions:
            missing_feature_counter.update(runtime_prediction.missing_feature_names)
            served_profile_counter.update([runtime_prediction.profile])
        for cell, prediction in zip(cells, runtime_predictions):
            path_request = PathRequest(
                origin_grid4=request.origin_grid4,
                issue_time=request.issue_time,
                valid_time=request.valid_time,
                band=request.band,
                mode=request.mode,
                declared_power_watts=request.declared_power_watts,
                features=cell,
                station=cell.station or request.station,
                data_freshness_seconds=freshness,
            )
            response = prediction_response(path_request, prediction)
            if research_receipts_enabled:
                stop_counts = beta_stop_counts_for_prediction(
                    path_request,
                    response,
                )
                if stop_counts:
                    try:
                        selected_beta_telemetry_sink.record(stop_counts)
                    except Exception as error:
                        raise HTTPException(
                            status_code=503,
                            detail="beta stop-event telemetry unavailable",
                        ) from error
                    raise HTTPException(
                        status_code=503,
                        detail="beta safety invariant failed",
                    )
            predictions.append(response)
        if selected_inference_mode != "disabled":
            try:
                emit_shadow_telemetry(
                    shadow_telemetry_event(
                        verified_request,
                        predictions,
                        inference_mode=selected_inference_mode,
                        request_kind="surface",
                        feature_contract=runtime_feature_contract,
                        path_history_provider=history_provider.name,
                        path_history_transform_version=history_provider.transform_version,
                        operational_weather_provider=weather_provider.name,
                        stale_history=stale,
                        latency_ms=(time.perf_counter() - started) * 1000,
                        predictions=runtime_predictions,
                    ),
                    sink=emit_telemetry,
                    beta_recorder=selected_beta_telemetry_sink,
                    beta_collection_enabled=research_receipts_enabled,
                )
            except Exception as error:
                LOGGER.exception("propagation telemetry sink failed")
                if research_receipts_enabled:
                    raise HTTPException(
                        status_code=503,
                        detail="beta stop-event telemetry unavailable",
                    ) from error
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
