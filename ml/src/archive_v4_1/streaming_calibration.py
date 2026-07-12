"""Bounded-memory sufficient statistics for V4.1 isotonic calibration."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from sklearn.isotonic import IsotonicRegression

from calibration import (
    HierarchyModels,
    IdentityOutsideIsotonic,
    clipped,
    distance_groups,
)


DEFAULT_BINS = 262_144
GLOBAL_KEY = "all"


def probability_bin_indexes(
    raw: np.ndarray,
    bins: int = DEFAULT_BINS,
) -> np.ndarray:
    if bins < 2:
        raise ValueError("probability bin count must be at least two")
    values = clipped(raw)
    return np.minimum((values * bins).astype(np.int64), bins - 1)


@dataclass
class BinnedStatistics:
    bins: int = DEFAULT_BINS
    rows: np.ndarray = field(init=False)
    sum_weight: np.ndarray = field(init=False)
    sum_weight_probability: np.ndarray = field(init=False)
    sum_weight_target: np.ndarray = field(init=False)
    sum_weight_target_squared: np.ndarray = field(init=False)

    def __post_init__(self) -> None:
        if self.bins < 2:
            raise ValueError("probability bin count must be at least two")
        self.rows = np.zeros(self.bins, dtype=np.int64)
        self.sum_weight = np.zeros(self.bins, dtype=np.float64)
        self.sum_weight_probability = np.zeros(self.bins, dtype=np.float64)
        self.sum_weight_target = np.zeros(self.bins, dtype=np.float64)
        self.sum_weight_target_squared = np.zeros(self.bins, dtype=np.float64)

    def update(
        self,
        raw: np.ndarray,
        target: np.ndarray,
        weight: np.ndarray,
    ) -> None:
        probability = clipped(raw)
        y = np.asarray(target, dtype=np.float64)
        w = np.asarray(weight, dtype=np.float64)
        if not (len(probability) == len(y) == len(w)):
            raise ValueError("calibration statistic arrays must have equal length")
        if np.any(w <= 0) or np.any(~np.isfinite(w)):
            raise ValueError("calibration weights must be positive and finite")
        if np.any((y < 0) | (y > 1) | ~np.isfinite(y)):
            raise ValueError("calibration targets must be finite probabilities")
        indexes = probability_bin_indexes(probability, self.bins)
        if len(indexes) < self.bins // 2:
            populated, inverse, counts = np.unique(
                indexes,
                return_inverse=True,
                return_counts=True,
            )
            self.rows[populated] += counts
            self.sum_weight[populated] += np.bincount(inverse, weights=w)
            self.sum_weight_probability[populated] += np.bincount(
                inverse, weights=w * probability
            )
            self.sum_weight_target[populated] += np.bincount(
                inverse, weights=w * y
            )
            self.sum_weight_target_squared[populated] += np.bincount(
                inverse, weights=w * np.square(y)
            )
        else:
            self.rows += np.bincount(indexes, minlength=self.bins)
            self.sum_weight += np.bincount(indexes, weights=w, minlength=self.bins)
            self.sum_weight_probability += np.bincount(
                indexes, weights=w * probability, minlength=self.bins
            )
            self.sum_weight_target += np.bincount(
                indexes, weights=w * y, minlength=self.bins
            )
            self.sum_weight_target_squared += np.bincount(
                indexes, weights=w * np.square(y), minlength=self.bins
            )

    def merge(self, other: "BinnedStatistics") -> None:
        if self.bins != other.bins:
            raise ValueError("cannot merge different probability bin counts")
        self.rows += other.rows
        self.sum_weight += other.sum_weight
        self.sum_weight_probability += other.sum_weight_probability
        self.sum_weight_target += other.sum_weight_target
        self.sum_weight_target_squared += other.sum_weight_target_squared

    def copy(self) -> "BinnedStatistics":
        output = BinnedStatistics(self.bins)
        for name in (
            "rows",
            "sum_weight",
            "sum_weight_probability",
            "sum_weight_target",
            "sum_weight_target_squared",
        ):
            setattr(output, name, getattr(self, name).copy())
        return output

    def support(self) -> dict[str, float | int]:
        weight = float(self.sum_weight.sum())
        positive = float(self.sum_weight_target.sum())
        return {
            "rows": int(self.rows.sum()),
            "weighted_opportunities": weight,
            "positive_equivalent": positive,
            "negative_equivalent": weight - positive,
        }

    def fit_isotonic(self) -> IdentityOutsideIsotonic:
        populated = (self.rows > 0) & (self.sum_weight > 0)
        if int(populated.sum()) < 2:
            raise ValueError("isotonic calibration requires two populated bins")
        x = self.sum_weight_probability[populated] / self.sum_weight[populated]
        y = self.sum_weight_target[populated] / self.sum_weight[populated]
        weight = self.sum_weight[populated]
        if np.unique(x).size < 2:
            raise ValueError("isotonic calibration requires two distinct predictions")
        model = IsotonicRegression(
            out_of_bounds="clip",
            y_min=0.0,
            y_max=1.0,
        )
        model.fit(x, y, sample_weight=weight)
        return IdentityOutsideIsotonic(model, float(x.min()), float(x.max()))


@dataclass
class GroupedBinnedStatistics:
    bins: int = DEFAULT_BINS
    groups: dict[tuple[str, str], BinnedStatistics] = field(default_factory=dict)

    def get(self, level: str, key: str) -> BinnedStatistics:
        group_key = (str(level), str(key))
        if group_key not in self.groups:
            self.groups[group_key] = BinnedStatistics(self.bins)
        return self.groups[group_key]

    def update(
        self,
        raw: np.ndarray,
        target: np.ndarray,
        weight: np.ndarray,
        bands: np.ndarray,
        distance: np.ndarray,
    ) -> None:
        text_bands = np.asarray(bands).astype(str)
        groups = distance_groups(distance)
        self.get("global", GLOBAL_KEY).update(raw, target, weight)
        for band in np.unique(text_bands):
            band_mask = text_bands == band
            self.get("band", band).update(
                raw[band_mask], target[band_mask], weight[band_mask]
            )
            for group in np.unique(groups[band_mask]):
                mask = band_mask & (groups == group)
                self.get("band_distance", f"{band}|{group}").update(
                    raw[mask], target[mask], weight[mask]
                )

    def merge(self, other: "GroupedBinnedStatistics") -> None:
        if self.bins != other.bins:
            raise ValueError("cannot merge different grouped probability bins")
        for key, value in other.groups.items():
            self.get(*key).merge(value)

    @classmethod
    def pooled(
        cls,
        values: Iterable["GroupedBinnedStatistics"],
    ) -> "GroupedBinnedStatistics":
        items = list(values)
        if not items:
            raise ValueError("cannot pool empty statistics")
        output = cls(items[0].bins)
        for item in items:
            output.merge(item)
        return output


def fit_hierarchy_from_statistics(
    statistics: GroupedBinnedStatistics,
) -> HierarchyModels:
    global_stats = statistics.groups.get(("global", GLOBAL_KEY))
    if global_stats is None:
        raise ValueError("global calibration statistics are missing")
    global_model = global_stats.fit_isotonic()
    band_models = {}
    band_distance_models = {}
    for (level, key), values in sorted(statistics.groups.items()):
        if level == "band":
            try:
                band_models[key] = values.fit_isotonic()
            except ValueError:
                continue
        elif level == "band_distance":
            band, group = key.split("|", 1)
            try:
                band_distance_models[(band, group)] = values.fit_isotonic()
            except ValueError:
                continue
    return HierarchyModels(global_model, band_models, band_distance_models)


STATISTICS_SCHEMA = pa.schema(
    [
        ("month", pa.string()),
        ("level", pa.string()),
        ("key", pa.string()),
        ("probability_bin", pa.int32()),
        ("rows", pa.int64()),
        ("sum_weight", pa.float64()),
        ("sum_weight_probability", pa.float64()),
        ("sum_weight_target", pa.float64()),
        ("sum_weight_target_squared", pa.float64()),
    ]
)


def write_statistics(
    path: Path,
    month: str,
    statistics: GroupedBinnedStatistics,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp.parquet")
    temporary.unlink(missing_ok=True)
    writer = pq.ParquetWriter(temporary, STATISTICS_SCHEMA, compression="zstd")
    try:
        for (level, key), values in sorted(statistics.groups.items()):
            populated = np.flatnonzero(values.rows)
            if not len(populated):
                continue
            count = len(populated)
            writer.write_table(
                pa.table(
                    {
                        "month": pa.array([month] * count),
                        "level": pa.array([level] * count),
                        "key": pa.array([key] * count),
                        "probability_bin": pa.array(
                            populated.astype(np.int32, copy=False)
                        ),
                        "rows": pa.array(values.rows[populated]),
                        "sum_weight": pa.array(values.sum_weight[populated]),
                        "sum_weight_probability": pa.array(
                            values.sum_weight_probability[populated]
                        ),
                        "sum_weight_target": pa.array(
                            values.sum_weight_target[populated]
                        ),
                        "sum_weight_target_squared": pa.array(
                            values.sum_weight_target_squared[populated]
                        ),
                    },
                    schema=STATISTICS_SCHEMA,
                )
            )
    finally:
        writer.close()
    temporary.replace(path)


def load_statistics(
    path: Path,
    bins: int = DEFAULT_BINS,
) -> tuple[str, GroupedBinnedStatistics]:
    table = pq.read_table(path)
    months = set(table.column("month").to_pylist())
    if len(months) != 1:
        raise ValueError(f"statistics must contain one month: {months}")
    output = GroupedBinnedStatistics(bins)
    levels = np.asarray(table.column("level").to_pylist(), dtype=str)
    keys = np.asarray(table.column("key").to_pylist(), dtype=str)
    indexes = table.column("probability_bin").to_numpy().astype(np.int64)
    for level, key in sorted(set(zip(levels, keys))):
        selected = (levels == level) & (keys == key)
        destination = output.get(level, key)
        current = indexes[selected]
        for name in (
            "rows",
            "sum_weight",
            "sum_weight_probability",
            "sum_weight_target",
            "sum_weight_target_squared",
        ):
            getattr(destination, name)[current] = table.column(name).to_numpy()[selected]
    return next(iter(months)), output
