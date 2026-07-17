"""Pure sufficient-statistic helpers for the V4.2 paired diagnosis."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

import numpy as np


STAT_FIELDS = (
    "opportunities",
    "b2_squared_error",
    "m2_squared_error",
    "cross_error",
    "rows",
    "positive_mass",
)
STAT_SIZE = len(STAT_FIELDS)


def empty_stats() -> np.ndarray:
    return np.zeros(STAT_SIZE, dtype=np.float64)


def pair_stats(
    target: np.ndarray,
    weight: np.ndarray,
    b2: np.ndarray,
    m2: np.ndarray,
    mask: np.ndarray | None = None,
) -> np.ndarray:
    if mask is None:
        mask = np.ones(len(target), dtype=bool)
    if not np.any(mask):
        return empty_stats()
    y = np.asarray(target[mask], dtype=np.float64)
    w = np.asarray(weight[mask], dtype=np.float64)
    b2_error = np.asarray(b2[mask], dtype=np.float64) - y
    m2_error = np.asarray(m2[mask], dtype=np.float64) - y
    return np.asarray(
        [
            w.sum(),
            np.dot(w, np.square(b2_error)),
            np.dot(w, np.square(m2_error)),
            np.dot(w, b2_error * m2_error),
            int(mask.sum()),
            np.dot(w, y),
        ],
        dtype=np.float64,
    )


def row_contributions(
    target: np.ndarray,
    weight: np.ndarray,
    b2: np.ndarray,
    m2: np.ndarray,
) -> tuple[np.ndarray, ...]:
    y = np.asarray(target, dtype=np.float64)
    w = np.asarray(weight, dtype=np.float64)
    b2_error = np.asarray(b2, dtype=np.float64) - y
    m2_error = np.asarray(m2, dtype=np.float64) - y
    return (
        w,
        w * np.square(b2_error),
        w * np.square(m2_error),
        w * b2_error * m2_error,
        np.ones(len(y), dtype=np.float64),
        w * y,
    )


def grouped_stats(
    labels: np.ndarray,
    contributions: tuple[np.ndarray, ...],
) -> dict[str, np.ndarray]:
    values, inverse = np.unique(np.asarray(labels).astype(str), return_inverse=True)
    size = len(values)
    columns = [
        np.bincount(inverse, weights=column, minlength=size)
        for column in contributions
    ]
    return {
        str(label): np.asarray([column[index] for column in columns], dtype=np.float64)
        for index, label in enumerate(values)
    }


def add_stats(target: np.ndarray, source: np.ndarray) -> None:
    target += source


def brier(stats: np.ndarray, candidate: str) -> float:
    if stats[0] <= 0:
        raise ValueError("Brier score requires positive opportunity mass")
    index = {"b2": 1, "m2": 2}[candidate]
    return float(stats[index] / stats[0])


def blend_squared_error(stats: np.ndarray, b2_weight: float) -> float:
    value = float(np.clip(b2_weight, 0.0, 1.0))
    m2_weight = 1.0 - value
    return float(
        value * value * stats[1]
        + m2_weight * m2_weight * stats[2]
        + 2.0 * value * m2_weight * stats[3]
    )


def optimal_b2_weight(stats: np.ndarray) -> float:
    denominator = stats[1] + stats[2] - 2.0 * stats[3]
    if denominator <= 1e-15:
        return 1.0 if stats[1] <= stats[2] else 0.0
    return float(np.clip((stats[2] - stats[3]) / denominator, 0.0, 1.0))


def rounded_weight(value: float, step: float) -> float:
    if step <= 0 or step > 1:
        raise ValueError("blend step must be in (0, 1]")
    return float(np.clip(round(value / step) * step, 0.0, 1.0))


def paired_result(stats: np.ndarray, b2_weight: float | None = None) -> dict[str, Any]:
    if stats[0] <= 0:
        raise ValueError("paired result requires positive opportunity mass")
    b2_value = brier(stats, "b2")
    m2_value = brier(stats, "m2")
    result: dict[str, Any] = {
        "opportunities": float(stats[0]),
        "rows": int(stats[4]),
        "positive_mass": float(stats[5]),
        "b2_brier": b2_value,
        "m2_brier": m2_value,
        "m2_minus_b2_brier": m2_value - b2_value,
        "m2_relative_brier_improvement": 1.0 - m2_value / b2_value,
    }
    if b2_weight is not None:
        blend_value = blend_squared_error(stats, b2_weight) / stats[0]
        result.update(
            {
                "b2_weight": float(b2_weight),
                "blend_brier": float(blend_value),
                "blend_minus_b2_brier": float(blend_value - b2_value),
                "blend_relative_brier_improvement": float(
                    1.0 - blend_value / b2_value
                ),
            }
        )
    return result


def select_band_router(
    development_by_band: Mapping[str, np.ndarray],
) -> dict[str, str]:
    return {
        band: "m2" if brier(stats, "m2") < brier(stats, "b2") else "b2"
        for band, stats in sorted(development_by_band.items())
    }


def select_stable_router(
    development_by_month_key: Mapping[tuple[str, str], np.ndarray],
    months: Iterable[str],
    minimum_opportunities: float,
    minimum_positive_mass: float,
) -> dict[str, str]:
    month_order = list(months)
    keys = sorted({key for _, key in development_by_month_key})
    choices: dict[str, str] = {}
    for key in keys:
        values = [development_by_month_key.get((month, key)) for month in month_order]
        supported = all(
            stats is not None
            and stats[0] >= minimum_opportunities
            and stats[5] >= minimum_positive_mass
            for stats in values
        )
        wins = supported and all(
            brier(stats, "m2") < brier(stats, "b2")
            for stats in values
            if stats is not None
        )
        choices[key] = "m2" if wins else "b2"
    return choices


def routed_stats(
    totals: Mapping[str, np.ndarray],
    choices: Mapping[str, str],
) -> np.ndarray:
    output = empty_stats()
    for key, stats in totals.items():
        choice = choices.get(key, "b2")
        output[0] += stats[0]
        output[1] += stats[1]
        output[2] += stats[2] if choice == "m2" else stats[1]
        output[3] += stats[3] if choice == "m2" else stats[1]
        output[4] += stats[4]
        output[5] += stats[5]
    return output


def bootstrap_policy_delta(
    daily: Iterable[np.ndarray],
    candidate_squared_error_index: int,
    seed: int,
    repetitions: int,
) -> dict[str, float]:
    matrix = np.asarray(list(daily), dtype=np.float64)
    if len(matrix) < 2:
        raise ValueError("paired bootstrap requires at least two UTC days")
    rng = np.random.default_rng(seed)
    values = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sampled = matrix[rng.integers(0, len(matrix), len(matrix))].sum(axis=0)
        values[index] = (
            sampled[candidate_squared_error_index] - sampled[1]
        ) / sampled[0]
    return {
        "lower_95": float(np.quantile(values, 0.025)),
        "median": float(np.quantile(values, 0.5)),
        "upper_95": float(np.quantile(values, 0.975)),
    }


def bootstrap_blend_delta(
    daily: Iterable[np.ndarray],
    b2_weight: float,
    seed: int,
    repetitions: int,
) -> dict[str, float]:
    matrix = np.asarray(list(daily), dtype=np.float64)
    if len(matrix) < 2:
        raise ValueError("paired bootstrap requires at least two UTC days")
    rng = np.random.default_rng(seed)
    values = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sampled = matrix[rng.integers(0, len(matrix), len(matrix))].sum(axis=0)
        values[index] = (
            blend_squared_error(sampled, b2_weight) - sampled[1]
        ) / sampled[0]
    return {
        "lower_95": float(np.quantile(values, 0.025)),
        "median": float(np.quantile(values, 0.5)),
        "upper_95": float(np.quantile(values, 0.975)),
    }
