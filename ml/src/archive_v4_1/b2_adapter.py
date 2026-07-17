"""Frozen V3/B2 compatibility adapter for V4 feature batches."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import joblib
import numpy as np
import xgboost as xgb


def clipped(values: np.ndarray) -> np.ndarray:
    """Bound frozen V3 predictions without relying on a path-ambiguous module."""
    return np.clip(np.asarray(values, dtype=np.float64), 1e-7, 1 - 1e-7)


def feature_matrix(
    columns: Mapping[str, np.ndarray],
    features: list[str],
) -> np.ndarray:
    missing = [name for name in features if name not in columns]
    if missing:
        raise ValueError(f"V3/B2 input is missing frozen features: {missing}")
    lengths = {len(np.asarray(columns[name])) for name in features}
    if len(lengths) != 1:
        raise ValueError("V3/B2 input columns have inconsistent lengths")
    return np.column_stack(
        [np.asarray(columns[name], dtype=np.float32) for name in features]
    )


def apply_v3_calibrator(
    calibrator: Any,
    raw: np.ndarray,
    bands: np.ndarray,
) -> np.ndarray:
    raw_values = clipped(raw)
    if isinstance(calibrator, dict):
        if "__global__" not in calibrator:
            raise ValueError("frozen V3 calibrator has no __global__ fallback")
        text_bands = np.asarray(bands).astype(str)
        output = clipped(calibrator["__global__"].predict(raw_values))
        for band in np.unique(text_bands):
            mask = text_bands == band
            model = calibrator.get(str(band), calibrator["__global__"])
            output[mask] = clipped(model.predict(raw_values[mask]))
        return output
    if not hasattr(calibrator, "predict"):
        raise TypeError("unsupported frozen V3 calibrator")
    return clipped(calibrator.predict(raw_values))


@dataclass
class FrozenV3Profile:
    name: str
    features: list[str]
    best_iteration: int
    model: xgb.Booster
    calibrator: Any

    def predict(
        self,
        columns: Mapping[str, np.ndarray],
        bands: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray]:
        matrix = feature_matrix(columns, self.features)
        raw = self.model.inplace_predict(
            matrix,
            iteration_range=(0, self.best_iteration + 1),
        )
        return raw, apply_v3_calibrator(self.calibrator, raw, bands)


def load_profile(
    name: str,
    info: Mapping[str, Any],
    root: Path,
) -> FrozenV3Profile:
    model_path = root / str(info["model_path"])
    calibrator_path = model_path.with_suffix(".isotonic.joblib")
    model = xgb.Booster()
    model.load_model(model_path)
    features = [str(value) for value in info["features"]]
    if model.feature_names is not None and model.feature_names != features:
        raise ValueError(f"frozen V3 {name} feature order does not match results")
    calibrator = joblib.load(calibrator_path)
    return FrozenV3Profile(
        name=name,
        features=features,
        best_iteration=int(info["best_iteration"]),
        model=model,
        calibrator=calibrator,
    )
