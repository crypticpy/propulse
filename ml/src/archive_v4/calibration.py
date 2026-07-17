"""Stable, joblib-loadable hierarchical calibration bundle for V4 models."""

from __future__ import annotations

import numpy as np
from sklearn.isotonic import IsotonicRegression


class CalibratorBundle:
    def __init__(
        self,
        global_model: IsotonicRegression,
        band_models: dict[str, IsotonicRegression] | None = None,
        band_distance_models: dict[tuple[str, str], IsotonicRegression] | None = None,
    ) -> None:
        self.global_model = global_model
        self.band_models = band_models or {}
        self.band_distance_models = band_distance_models or {}

    @property
    def method(self) -> str:
        if self.band_distance_models:
            return "band_distance_isotonic_with_fallback"
        return "per_band_isotonic" if self.band_models else "global_isotonic"

    @staticmethod
    def distance_groups(distance: np.ndarray) -> np.ndarray:
        return np.select(
            [distance < 1000, distance < 3000, distance < 6000, distance < 10000],
            ["0-1000km", "1000-3000km", "3000-6000km", "6000-10000km"],
            default="10000km+",
        )

    def predict(
        self,
        raw: np.ndarray,
        bands: np.ndarray,
        distance: np.ndarray | None = None,
    ) -> np.ndarray:
        output = self.global_model.predict(raw)
        text_bands = bands.astype(str)
        for band in np.unique(text_bands):
            mask = text_bands == band
            model = self.band_models.get(band)
            if model is not None:
                output[mask] = model.predict(raw[mask])
        if self.band_distance_models and distance is not None:
            groups = self.distance_groups(distance.astype(np.float64))
            for band, group in set(zip(text_bands, groups)):
                model = self.band_distance_models.get((band, group))
                if model is None:
                    continue
                mask = (text_bands == band) & (groups == group)
                output[mask] = model.predict(raw[mask])
        return output
