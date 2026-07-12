"""Versioned Propulse path and surface inference service."""

from __future__ import annotations

import json
import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

import joblib
import numpy as np
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator


ROOT = Path(__file__).resolve().parents[2]
V4 = ROOT / "ml/src/archive_v4"
V41 = ROOT / "ml/src/archive_v4_1"
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


class ModelRegistry:
    def __init__(self, manifest_path: Path) -> None:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.version = payload["model_version"]
        self.feature_contract = payload["feature_contract"]
        self.profiles: dict[str, dict[str, Any]] = {}
        for name, item in payload["profiles"].items():
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
            self.profiles[name] = {
                "model": model,
                "calibrator": joblib.load(calibrator_path),
                "features": item["features"],
                "best_iteration": int(item["best_iteration"]),
                "top_factors": item.get("top_factors", [])[:5],
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
        missing = [
            [name for name in item["features"] if values.get(name) is None]
            for values in rows
        ]
        matrix = np.array(
            [
                [model_feature_value(values.get(name)) for name in item["features"]]
                for values in rows
            ],
            dtype=np.float32,
        )
        raw = item["model"].inplace_predict(
            matrix, iteration_range=(0, item["best_iteration"] + 1)
        )
        distance = np.array(
            [float(values.get("dist_km") or 0) for values in rows],
            dtype=np.float64,
        )
        probabilities = item["calibrator"].predict(raw, np.array(bands), distance)
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
                    len(missing_features) / max(len(item["features"]), 1), 0.7
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
            "profiles": sorted(self.profiles),
        }]

    def health(self) -> dict[str, Any]:
        return {"status": "ok", "model_version": self.version, "profiles": sorted(self.profiles)}


class UnavailableRegistry:
    def predict(self, values: dict[str, float | int | None], band: str, stale_history: bool) -> RuntimePrediction:
        raise RuntimeError("no approved model bundle is loaded")

    def predict_many(self, rows, bands, stale_history):
        raise RuntimeError("no approved model bundle is loaded")

    def models(self) -> list[dict[str, Any]]:
        return []

    def health(self) -> dict[str, Any]:
        return {"status": "unavailable", "reason": "no approved model bundle is loaded"}


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


def create_app(registry: Predictor | None = None) -> FastAPI:
    runtime = registry
    if runtime is None:
        manifest = os.environ.get("PROPULSE_MODEL_BUNDLE")
        runtime = ModelRegistry(Path(manifest)) if manifest else UnavailableRegistry()
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
        return {**runtime.health(), "checked_at": datetime.now(timezone.utc)}

    @app.get("/v1/propagation/models")
    def models() -> dict[str, Any]:
        return {"models": runtime.models()}

    @app.post("/v1/propagation/path")
    def path(request: PathRequest) -> dict[str, Any]:
        stale = request.data_freshness_seconds.get("path_history", 0) > 7200
        try:
            prediction = runtime.predict(request.features.values, request.band, stale)
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        return prediction_response(request, prediction)

    @app.post("/v1/propagation/surface")
    def surface(request: SurfaceRequest) -> dict[str, Any]:
        stale = request.data_freshness_seconds.get("path_history", 0) > 7200
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
