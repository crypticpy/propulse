"""Cross-month guarded hierarchical calibration for V4.1."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import numpy as np
from sklearn.isotonic import IsotonicRegression


CANDIDATE_IDS = (
    "C0_identity",
    "C1_global_isotonic",
    "C2_per_band_isotonic",
    "C3_hierarchical_isotonic",
    "C4_guarded_hierarchical_isotonic",
)


def clipped(values: np.ndarray) -> np.ndarray:
    return np.clip(np.asarray(values, dtype=np.float64), 1e-7, 1 - 1e-7)


def distance_groups(distance: np.ndarray) -> np.ndarray:
    values = np.asarray(distance, dtype=np.float64)
    return np.select(
        [values < 1000, values < 3000, values < 6000, values < 10000],
        ["0-1000km", "1000-3000km", "3000-6000km", "6000-10000km"],
        default="10000km+",
    )


class IdentityCalibrator:
    """Joblib-stable calibrator with the serving bundle predict contract."""

    method = "identity"

    def predict(
        self,
        raw: np.ndarray,
        bands: np.ndarray | None = None,
        distance: np.ndarray | None = None,
    ) -> np.ndarray:
        del bands, distance
        return clipped(raw)


class IdentityOutsideIsotonic:
    """Apply isotonic interpolation only inside observed prediction support."""

    method = "isotonic_with_identity_outside_support"

    def __init__(
        self,
        model: IsotonicRegression,
        lower_bound: float,
        upper_bound: float,
    ) -> None:
        if not lower_bound < upper_bound:
            raise ValueError("isotonic support requires increasing bounds")
        self.model = model
        self.lower_bound = float(lower_bound)
        self.upper_bound = float(upper_bound)

    def predict(self, raw: np.ndarray) -> np.ndarray:
        values = clipped(raw)
        output = values.copy()
        supported = (values >= self.lower_bound) & (values <= self.upper_bound)
        if np.any(supported):
            output[supported] = clipped(self.model.predict(values[supported]))
        return output


class CalibratorBundle:
    """Backward-compatible class name required by frozen V4 joblib bundles."""

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

    def predict(
        self,
        raw: np.ndarray,
        bands: np.ndarray,
        distance: np.ndarray | None = None,
    ) -> np.ndarray:
        raw_values = np.asarray(raw, dtype=np.float64)
        output = self.global_model.predict(raw_values)
        text_bands = np.asarray(bands).astype(str)
        for band in np.unique(text_bands):
            mask = text_bands == band
            model = self.band_models.get(band)
            if model is not None:
                output[mask] = model.predict(raw_values[mask])
        if self.band_distance_models and distance is not None:
            groups = distance_groups(distance)
            for band, group in set(zip(text_bands, groups)):
                model = self.band_distance_models.get((band, group))
                if model is None:
                    continue
                mask = (text_bands == band) & (groups == group)
                output[mask] = model.predict(raw_values[mask])
        return clipped(output)


@dataclass(frozen=True)
class CalibrationData:
    month: str
    raw: np.ndarray
    target: np.ndarray
    weight: np.ndarray
    band: np.ndarray
    distance: np.ndarray
    day: np.ndarray

    def __post_init__(self) -> None:
        lengths = {
            len(self.raw),
            len(self.target),
            len(self.weight),
            len(self.band),
            len(self.distance),
            len(self.day),
        }
        if len(lengths) != 1 or not lengths or next(iter(lengths)) == 0:
            raise ValueError(f"invalid calibration arrays for {self.month}")
        if np.any(np.asarray(self.weight) <= 0):
            raise ValueError(f"non-positive calibration weight for {self.month}")


@dataclass
class HierarchyModels:
    global_model: Any
    band_models: dict[str, Any]
    band_distance_models: dict[tuple[str, str], Any]


class GuardedCalibratorBundle:
    """Fitted hierarchy plus immutable leaf-to-fallback decisions."""

    method = "guarded_band_distance_isotonic_with_identity_fallback"

    def __init__(
        self,
        models: HierarchyModels,
        *,
        use_global: bool,
        selected_bands: Iterable[str],
        selected_band_distances: Iterable[tuple[str, str]],
    ) -> None:
        self.global_model = models.global_model
        self.band_models = models.band_models
        self.band_distance_models = models.band_distance_models
        self.use_global = bool(use_global)
        self.selected_bands = frozenset(str(value) for value in selected_bands)
        self.selected_band_distances = frozenset(
            (str(band), str(group)) for band, group in selected_band_distances
        )

    def predict(
        self,
        raw: np.ndarray,
        bands: np.ndarray,
        distance: np.ndarray | None = None,
    ) -> np.ndarray:
        raw_values = clipped(raw)
        output = (
            clipped(self.global_model.predict(raw_values))
            if self.use_global
            else raw_values.copy()
        )
        text_bands = np.asarray(bands).astype(str)
        for band in self.selected_bands:
            model = self.band_models.get(band)
            if model is None:
                continue
            mask = text_bands == band
            if np.any(mask):
                output[mask] = clipped(model.predict(raw_values[mask]))
        if distance is None:
            return output
        groups = distance_groups(distance)
        for band, group in self.selected_band_distances:
            model = self.band_distance_models.get((band, group))
            if model is None:
                continue
            mask = (text_bands == band) & (groups == group)
            if np.any(mask):
                output[mask] = clipped(model.predict(raw_values[mask]))
        return output


def _fit_isotonic(data: CalibrationData, mask: np.ndarray | None = None) -> IsotonicRegression:
    selected = np.ones(len(data.raw), dtype=bool) if mask is None else mask
    if np.unique(np.asarray(data.raw)[selected]).size < 2:
        raise ValueError("isotonic calibration requires two distinct predictions")
    model = IsotonicRegression(out_of_bounds="clip")
    model.fit(
        np.asarray(data.raw, dtype=np.float64)[selected],
        np.asarray(data.target, dtype=np.float64)[selected],
        sample_weight=np.asarray(data.weight, dtype=np.float64)[selected],
    )
    return model


def concatenate(values: Iterable[CalibrationData], month: str = "pooled") -> CalibrationData:
    items = list(values)
    if not items:
        raise ValueError("cannot concatenate empty calibration data")
    return CalibrationData(
        month=month,
        raw=np.concatenate([np.asarray(item.raw) for item in items]),
        target=np.concatenate([np.asarray(item.target) for item in items]),
        weight=np.concatenate([np.asarray(item.weight) for item in items]),
        band=np.concatenate([np.asarray(item.band).astype(str) for item in items]),
        distance=np.concatenate([np.asarray(item.distance) for item in items]),
        day=np.concatenate([np.asarray(item.day).astype(str) for item in items]),
    )


def fit_hierarchy(data: CalibrationData) -> HierarchyModels:
    global_model = _fit_isotonic(data)
    text_bands = np.asarray(data.band).astype(str)
    groups = distance_groups(data.distance)
    band_models: dict[str, IsotonicRegression] = {}
    band_distance_models: dict[tuple[str, str], IsotonicRegression] = {}
    for band in np.unique(text_bands):
        mask = text_bands == band
        try:
            band_models[band] = _fit_isotonic(data, mask)
        except ValueError:
            continue
        for group in np.unique(groups[mask]):
            leaf_mask = mask & (groups == group)
            try:
                band_distance_models[(band, group)] = _fit_isotonic(data, leaf_mask)
            except ValueError:
                continue
    return HierarchyModels(global_model, band_models, band_distance_models)


def predict_family(
    models: HierarchyModels,
    data: CalibrationData,
    family: str,
) -> np.ndarray:
    return predict_family_arrays(
        models,
        data.raw,
        data.band,
        data.distance,
        family,
    )


def predict_family_arrays(
    models: HierarchyModels,
    raw_values: np.ndarray,
    bands: np.ndarray,
    distance: np.ndarray,
    family: str,
) -> np.ndarray:
    """Predict a fixed C0-C3 family without constructing pooled row objects."""

    if family not in CANDIDATE_IDS[:4]:
        raise ValueError(f"unsupported fixed family: {family}")
    raw = clipped(raw_values)
    if family == "C0_identity":
        return raw
    output = clipped(models.global_model.predict(raw))
    if family == "C1_global_isotonic":
        return output
    text_bands = np.asarray(bands).astype(str)
    for band in np.unique(text_bands):
        model = models.band_models.get(band)
        mask = text_bands == band
        if model is not None:
            output[mask] = clipped(model.predict(raw[mask]))
    if family == "C2_per_band_isotonic":
        return output
    groups = distance_groups(distance)
    for key, model in models.band_distance_models.items():
        band, group = key
        mask = (text_bands == band) & (groups == group)
        if np.any(mask):
            output[mask] = clipped(model.predict(raw[mask]))
    return output


def weighted_brier(
    target: np.ndarray,
    prediction: np.ndarray,
    weight: np.ndarray,
) -> float:
    y = np.asarray(target, dtype=np.float64)
    p = clipped(prediction)
    w = np.asarray(weight, dtype=np.float64)
    return float(np.dot(w, np.square(p - y)) / w.sum())


def support(data: CalibrationData, mask: np.ndarray) -> dict[str, Any]:
    target = np.asarray(data.target, dtype=np.float64)[mask]
    weight = np.asarray(data.weight, dtype=np.float64)[mask]
    months = np.asarray(data.month if data.month != "pooled" else "", dtype=str)
    del months
    return {
        "rows": int(mask.sum()),
        "positive_equivalent": float(np.dot(weight, target)),
        "negative_equivalent": float(np.dot(weight, 1 - target)),
    }


def day_bootstrap_upper(
    data: CalibrationData,
    candidate: np.ndarray,
    fallback: np.ndarray,
    mask: np.ndarray,
    *,
    seed: int,
    repetitions: int,
) -> float:
    days = np.asarray(data.day).astype(str)[mask]
    target = np.asarray(data.target, dtype=np.float64)[mask]
    weight = np.asarray(data.weight, dtype=np.float64)[mask]
    candidate_error = np.square(clipped(candidate)[mask] - target)
    fallback_error = np.square(clipped(fallback)[mask] - target)
    unique_days, inverse = np.unique(days, return_inverse=True)
    day_weight = np.bincount(inverse, weights=weight)
    day_delta = np.bincount(
        inverse,
        weights=weight * (candidate_error - fallback_error),
    )
    rng = np.random.default_rng(seed)
    statistics = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sampled = rng.integers(0, len(unique_days), len(unique_days))
        statistics[index] = day_delta[sampled].sum() / day_weight[sampled].sum()
    return float(np.quantile(statistics, 0.975))


def _cross_month_predictions(
    monthly: list[CalibrationData],
) -> tuple[CalibrationData, dict[str, np.ndarray], np.ndarray]:
    if len(monthly) < 4:
        raise ValueError("V4.1 requires four calibration-development months")
    pooled_parts: list[CalibrationData] = []
    prediction_parts = {candidate: [] for candidate in CANDIDATE_IDS[:4]}
    month_labels: list[np.ndarray] = []
    for held_out in monthly:
        train = concatenate(item for item in monthly if item.month != held_out.month)
        models = fit_hierarchy(train)
        pooled_parts.append(held_out)
        month_labels.append(np.repeat(held_out.month, len(held_out.raw)))
        for candidate in CANDIDATE_IDS[:4]:
            prediction_parts[candidate].append(
                predict_family(models, held_out, candidate)
            )
    return (
        concatenate(pooled_parts),
        {
            candidate: np.concatenate(parts)
            for candidate, parts in prediction_parts.items()
        },
        np.concatenate(month_labels),
    )


def _selection_evidence(
    data: CalibrationData,
    month_labels: np.ndarray,
    candidate: np.ndarray,
    fallback: np.ndarray,
    raw: np.ndarray,
    mask: np.ndarray,
    *,
    seed: int,
    repetitions: int,
    minimum_rows: int,
    minimum_positive_equivalent: float,
    minimum_negative_equivalent: float,
    minimum_months: int,
) -> dict[str, Any]:
    stats = support(data, mask)
    represented = sorted(set(month_labels[mask].astype(str)))
    candidate_brier = weighted_brier(data.target[mask], candidate[mask], data.weight[mask])
    fallback_brier = weighted_brier(data.target[mask], fallback[mask], data.weight[mask])
    raw_brier = weighted_brier(data.target[mask], raw[mask], data.weight[mask])
    monthly_gain: dict[str, float] = {}
    for month in represented:
        current = mask & (month_labels == month)
        monthly_gain[month] = weighted_brier(
            data.target[current], raw[current], data.weight[current]
        ) - weighted_brier(
            data.target[current], candidate[current], data.weight[current]
        )
    bootstrap_upper = day_bootstrap_upper(
        data,
        candidate,
        fallback,
        mask,
        seed=seed,
        repetitions=repetitions,
    )
    supported = (
        stats["rows"] >= minimum_rows
        and stats["positive_equivalent"] >= minimum_positive_equivalent
        and stats["negative_equivalent"] >= minimum_negative_equivalent
        and len(represented) >= minimum_months
    )
    selected = (
        supported
        and candidate_brier < fallback_brier
        and all(value >= 0 for value in monthly_gain.values())
        and bootstrap_upper <= 0
    )
    return {
        **stats,
        "months": represented,
        "candidate_brier": candidate_brier,
        "fallback_brier": fallback_brier,
        "raw_brier": raw_brier,
        "candidate_minus_fallback_brier": candidate_brier - fallback_brier,
        "monthly_calibration_gain": monthly_gain,
        "bootstrap_upper_95": bootstrap_upper,
        "supported": supported,
        "selected": selected,
    }


def select_guarded_hierarchy(
    monthly: list[CalibrationData],
    *,
    seed: int,
    repetitions: int = 2000,
    minimum_rows: int = 10000,
    minimum_positive_equivalent: float = 1000.0,
    minimum_negative_equivalent: float = 1000.0,
    minimum_months: int = 3,
) -> tuple[GuardedCalibratorBundle, dict[str, Any]]:
    data, predictions, month_labels = _cross_month_predictions(monthly)
    raw = predictions["C0_identity"]
    all_rows = np.ones(len(data.raw), dtype=bool)
    kwargs = {
        "seed": seed,
        "repetitions": repetitions,
        "minimum_rows": minimum_rows,
        "minimum_positive_equivalent": minimum_positive_equivalent,
        "minimum_negative_equivalent": minimum_negative_equivalent,
        "minimum_months": minimum_months,
    }
    global_evidence = _selection_evidence(
        data,
        month_labels,
        predictions["C1_global_isotonic"],
        raw,
        raw,
        all_rows,
        **kwargs,
    )
    use_global = bool(global_evidence["selected"])
    guarded = predictions["C1_global_isotonic"].copy() if use_global else raw.copy()

    text_bands = np.asarray(data.band).astype(str)
    band_evidence: dict[str, Any] = {}
    selected_bands: list[str] = []
    for band in sorted(set(text_bands)):
        mask = text_bands == band
        evidence = _selection_evidence(
            data,
            month_labels,
            predictions["C2_per_band_isotonic"],
            guarded,
            raw,
            mask,
            **kwargs,
        )
        band_evidence[band] = evidence
        if evidence["selected"]:
            guarded[mask] = predictions["C2_per_band_isotonic"][mask]
            selected_bands.append(band)

    groups = distance_groups(data.distance)
    leaf_evidence: dict[str, Any] = {}
    selected_leaves: list[tuple[str, str]] = []
    for band in sorted(set(text_bands)):
        for group in sorted(set(groups[text_bands == band])):
            mask = (text_bands == band) & (groups == group)
            evidence = _selection_evidence(
                data,
                month_labels,
                predictions["C3_hierarchical_isotonic"],
                guarded,
                raw,
                mask,
                **kwargs,
            )
            key = f"{band}|{group}"
            leaf_evidence[key] = evidence
            if evidence["selected"]:
                guarded[mask] = predictions["C3_hierarchical_isotonic"][mask]
                selected_leaves.append((band, group))

    candidate_metrics = {
        candidate: {
            "weighted_brier": weighted_brier(
                data.target,
                prediction,
                data.weight,
            )
        }
        for candidate, prediction in predictions.items()
    }
    candidate_metrics["C4_guarded_hierarchical_isotonic"] = {
        "weighted_brier": weighted_brier(data.target, guarded, data.weight)
    }
    full_models = fit_hierarchy(concatenate(monthly))
    bundle = GuardedCalibratorBundle(
        full_models,
        use_global=use_global,
        selected_bands=selected_bands,
        selected_band_distances=selected_leaves,
    )
    evidence = {
        "schema_version": 1,
        "method": bundle.method,
        "months": [item.month for item in monthly],
        "primary_candidate": "C4_guarded_hierarchical_isotonic",
        "candidate_metrics": candidate_metrics,
        "global": global_evidence,
        "bands": band_evidence,
        "band_distances": leaf_evidence,
        "selected": {
            "global": use_global,
            "bands": selected_bands,
            "band_distances": [list(value) for value in selected_leaves],
        },
    }
    return bundle, evidence
