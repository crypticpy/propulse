"""PyArrow-to-XGBoost external-memory adapters and streamed metrics."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterator

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb


def month_filter(months: list[str]) -> ds.Expression | None:
    expression = None
    for month in months:
        year, number = (int(value) for value in month.split("-"))
        start = datetime(year, number, 1, tzinfo=timezone.utc)
        if number == 12:
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(year, number + 1, 1, tzinfo=timezone.utc)
        current = (ds.field("target_hour") >= pa.scalar(start)) & (
            ds.field("target_hour") < pa.scalar(end)
        )
        expression = current if expression is None else expression | current
    return expression


def combine_filters(*filters: ds.Expression | None) -> ds.Expression | None:
    output = None
    for value in filters:
        if value is not None:
            output = value if output is None else output & value
    return output


def _float_column(batch: pa.RecordBatch, name: str) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        column = pc.fill_null(column, 0)
    return column.to_numpy(zero_copy_only=False).astype(np.float32, copy=False)


def iter_numpy_batches(
    paths: str | Path | list[str | Path],
    features: list[str],
    *,
    weight_column: str,
    filter_expression: ds.Expression | None = None,
    metadata: list[str] | None = None,
    batch_size: int = 250_000,
) -> Iterator[tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, np.ndarray]]]:
    source = [str(path) for path in paths] if isinstance(paths, list) else str(paths)
    columns = list(dict.fromkeys(
        [*features, "success_rate", weight_column, *(metadata or [])]
    ))
    scanner = ds.dataset(source, format="parquet", partitioning="hive").scanner(
        columns=columns,
        filter=filter_expression,
        batch_size=batch_size,
        use_threads=True,
    )
    for batch in scanner.to_batches():
        if batch.num_rows == 0:
            continue
        matrix = np.column_stack([_float_column(batch, name) for name in features])
        target = _float_column(batch, "success_rate")
        weight = _float_column(batch, weight_column)
        meta = {
            name: batch.column(name).to_numpy(zero_copy_only=False)
            for name in (metadata or [])
        }
        yield matrix, target, weight, meta


class ParquetDataIter(xgb.DataIter):
    """Restartable XGBoost iterator over Parquet record batches."""

    def __init__(
        self,
        paths: str | Path | list[str | Path],
        features: list[str],
        *,
        weight_column: str,
        cache_prefix: str | None,
        filter_expression: ds.Expression | None = None,
        batch_size: int = 250_000,
    ) -> None:
        self.paths = paths
        self.features = features
        self.weight_column = weight_column
        self.filter_expression = filter_expression
        self.batch_size = batch_size
        self._iterator: Iterator | None = None
        super().__init__(cache_prefix=cache_prefix, on_host=True, release_data=True)
        self.reset()

    def reset(self) -> None:
        self._iterator = iter_numpy_batches(
            self.paths,
            self.features,
            weight_column=self.weight_column,
            filter_expression=self.filter_expression,
            batch_size=self.batch_size,
        )

    def next(self, input_data: Callable[..., None]) -> bool:
        assert self._iterator is not None
        try:
            matrix, target, weight, _ = next(self._iterator)
        except StopIteration:
            return False
        input_data(data=matrix, label=target, weight=weight)
        return True


class MetricAccumulator:
    def __init__(self, bins: int = 20) -> None:
        self.bins = bins
        self.weight = 0.0
        self.target = 0.0
        self.prediction = 0.0
        self.squared_error = 0.0
        self.absolute_error = 0.0
        self.log_loss = 0.0
        self.rows = 0
        self.bin_weight = np.zeros(bins, dtype=np.float64)
        self.bin_target = np.zeros(bins, dtype=np.float64)
        self.bin_prediction = np.zeros(bins, dtype=np.float64)

    def update(self, target: np.ndarray, prediction: np.ndarray, weight: np.ndarray) -> None:
        y = target.astype(np.float64, copy=False)
        p = np.clip(prediction.astype(np.float64, copy=False), 1e-7, 1 - 1e-7)
        w = weight.astype(np.float64, copy=False)
        self.rows += len(y)
        self.weight += float(w.sum())
        self.target += float(np.dot(w, y))
        self.prediction += float(np.dot(w, p))
        self.squared_error += float(np.dot(w, (y - p) ** 2))
        self.absolute_error += float(np.dot(w, np.abs(y - p)))
        self.log_loss += float(np.dot(w, -(y * np.log(p) + (1 - y) * np.log(1 - p))))
        indexes = np.minimum((p * self.bins).astype(np.int64), self.bins - 1)
        self.bin_weight += np.bincount(indexes, weights=w, minlength=self.bins)
        self.bin_target += np.bincount(indexes, weights=w * y, minlength=self.bins)
        self.bin_prediction += np.bincount(indexes, weights=w * p, minlength=self.bins)

    def result(self) -> dict[str, Any]:
        if not self.weight:
            raise RuntimeError("cannot score an empty stream")
        calibration = []
        ece = 0.0
        mce = 0.0
        for index in range(self.bins):
            weight = self.bin_weight[index]
            if not weight:
                continue
            observed = self.bin_target[index] / weight
            predicted = self.bin_prediction[index] / weight
            error = abs(observed - predicted)
            ece += weight / self.weight * error
            mce = max(mce, error)
            calibration.append({
                "bin": index,
                "lower": index / self.bins,
                "upper": (index + 1) / self.bins,
                "weight": weight,
                "mean_prediction": predicted,
                "observed_rate": observed,
            })
        return {
            "rows": self.rows,
            "weighted_opportunities": self.weight,
            "weighted_prevalence": self.target / self.weight,
            "mean_prediction": self.prediction / self.weight,
            "weighted_brier": self.squared_error / self.weight,
            "weighted_log_loss": self.log_loss / self.weight,
            "weighted_mae": self.absolute_error / self.weight,
            "expected_calibration_error": ece,
            "maximum_calibration_error": mce,
            "calibration_bins": calibration,
        }


def score_stream(
    model: xgb.Booster,
    best_iteration: int,
    paths: str | Path | list[str | Path],
    features: list[str],
    *,
    weight_column: str,
    calibrate: Callable[[np.ndarray, np.ndarray, np.ndarray], np.ndarray],
    filter_expression: ds.Expression | None = None,
) -> dict[str, Any]:
    accumulator = MetricAccumulator()
    band_accumulators: dict[str, MetricAccumulator] = {}
    distance_accumulators = {
        "0-1000km": MetricAccumulator(),
        "1000-3000km": MetricAccumulator(),
        "3000-6000km": MetricAccumulator(),
        "6000-10000km": MetricAccumulator(),
        "10000km+": MetricAccumulator(),
    }
    for matrix, target, weight, metadata in iter_numpy_batches(
        paths,
        features,
        weight_column=weight_column,
        filter_expression=filter_expression,
        metadata=["band", "dist_km"],
    ):
        raw = model.inplace_predict(
            matrix, iteration_range=(0, best_iteration + 1)
        )
        prediction = calibrate(raw, metadata["band"], metadata["dist_km"])
        accumulator.update(target, prediction, weight)
        text_bands = metadata["band"].astype(str)
        for band in np.unique(text_bands):
            mask = text_bands == band
            band_accumulators.setdefault(band, MetricAccumulator()).update(
                target[mask], prediction[mask], weight[mask]
            )
        distance = metadata["dist_km"].astype(np.float64)
        for label, lower, upper in (
            ("0-1000km", 0, 1000),
            ("1000-3000km", 1000, 3000),
            ("3000-6000km", 3000, 6000),
            ("6000-10000km", 6000, 10000),
            ("10000km+", 10000, np.inf),
        ):
            mask = (distance >= lower) & (distance < upper)
            if mask.any():
                distance_accumulators[label].update(
                    target[mask], prediction[mask], weight[mask]
                )
    output = accumulator.result()
    output["slices"] = {
        "band": {
            band: value.result() for band, value in sorted(band_accumulators.items())
        },
        "distance": {
            label: value.result()
            for label, value in distance_accumulators.items()
            if value.rows
        },
    }
    return output
