#!/usr/bin/env python3
"""Replay the shared live WSPR pipeline across open development months."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import resource
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import duckdb


ROOT = Path(__file__).resolve().parents[3]
LIVE = ROOT / "ml/src/propagation_live"
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(LIVE))
sys.path.insert(0, str(SERVICE))

from opportunity_transform import (  # noqa: E402
    RECEIVER_SAMPLES_PER_TX_SLOT,
    TRANSFORM_VERSION,
    materialize_opportunity_cells,
    materialize_path_hour_cells,
    transform_metadata,
)
from wspr_finalizer import finalize_hour  # noqa: E402
from wspr_ingest import normalize_observation  # noqa: E402
from path_history import PATH_LAGS, VerifiedPathHistory  # noqa: E402
from m5_runtime import validate_m5_runtime  # noqa: E402


DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/replay_validation.json"
)
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
OPPORTUNITY_COLUMNS = (
    "target_hour",
    "band",
    "tx_grid4",
    "rx_grid4",
    "power_bin_dbm",
    "successes",
    "opportunities",
    "success_rate",
    "any_success",
    "sampled_rows",
    "positive_rows",
    "mean_positive_snr",
    "min_positive_snr",
    "max_positive_snr",
)
PATH_METRICS = (
    "successes",
    "opportunities",
    "success_rate",
    "sampled_rows",
    "positive_rows",
)


@dataclass(frozen=True)
class DatasetSpec:
    label: str
    bronze: Path
    opportunities: Path


def parse_dataset(value: str) -> DatasetSpec:
    parts = value.split("::")
    if len(parts) != 3 or not all(part.strip() for part in parts):
        raise argparse.ArgumentTypeError(
            "--dataset must be LABEL::BRONZE_PARQUET::OPPORTUNITY_PARQUET"
        )
    spec = DatasetSpec(parts[0].strip(), Path(parts[1]), Path(parts[2]))
    if not spec.bronze.is_file() or not spec.opportunities.is_file():
        raise argparse.ArgumentTypeError(f"dataset files are missing for {spec.label}")
    return spec


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def logical_path(path: Path) -> str:
    if "data" in path.parts:
        return Path(*path.parts[path.parts.index("data"):]).as_posix()
    return path.name


def sql_string(value: str | Path) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def peak_rss_gib() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    divisor = 1024**3 if sys.platform == "darwin" else 1024**2
    return float(value / divisor)


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def stratified_utc_hours(hours: Iterable[datetime]) -> list[datetime]:
    """Choose one deterministic hour from each UTC hour-of-day stratum."""
    groups: dict[int, list[datetime]] = {hour: [] for hour in range(24)}
    for value in sorted(set(hours)):
        utc = value.astimezone(timezone.utc)
        groups[utc.hour].append(utc)
    if any(not values for values in groups.values()):
        missing = [hour for hour, values in groups.items() if not values]
        raise RuntimeError(f"dataset lacks UTC hour-of-day strata: {missing}")
    selected = []
    for hour_of_day, values in groups.items():
        fraction = hour_of_day / 23 if hour_of_day else 0
        index = round(fraction * (len(values) - 1))
        selected.append(values[index])
    return sorted(selected)


def configured_connection(threads: int, memory_limit: str = "32GB") -> duckdb.DuckDBPyConnection:
    connection = duckdb.connect()
    connection.execute(f"SET threads={threads}")
    connection.execute("SET timezone='UTC'")
    connection.execute(f"SET memory_limit={sql_string(memory_limit)}")
    connection.execute("SET preserve_insertion_order=false")
    return connection


def available_hours(connection: duckdb.DuckDBPyConnection, spec: DatasetSpec) -> list[datetime]:
    return [
        row[0]
        for row in connection.execute(
            f"""
            WITH source_hours AS (
              SELECT DISTINCT target_hour
              FROM read_parquet({sql_string(spec.bronze)})
              WHERE band <> '6m'
            ), expected_hours AS (
              SELECT DISTINCT target_hour
              FROM read_parquet(
                {sql_string(spec.opportunities)}, hive_partitioning=false
              )
            )
            SELECT source_hours.target_hour
            FROM source_hours INNER JOIN expected_hours USING (target_hour)
            ORDER BY target_hour
            """
        ).fetchall()
    ]


def difference_count(
    connection: duckdb.DuckDBPyConnection,
    left: str,
    right: str,
) -> int:
    return int(
        connection.execute(
            f"""
            SELECT count(*) FROM (
              (SELECT * FROM {left})
              EXCEPT ALL
              (SELECT * FROM {right})
            )
            """
        ).fetchone()[0]
    )


def replay_event_time(
    spec: DatasetSpec,
    *,
    threads: int,
) -> tuple[dict[str, Any], list[datetime]]:
    started = time.perf_counter()
    connection = configured_connection(threads)
    hours = available_hours(connection, spec)
    selected = stratified_utc_hours(hours)
    connection.execute("CREATE TEMP TABLE selected_hours(target_hour TIMESTAMPTZ)")
    connection.executemany(
        "INSERT INTO selected_hours VALUES (?)",
        [(hour,) for hour in selected],
    )
    expected_projection = ", ".join(OPPORTUNITY_COLUMNS)
    connection.execute(
        f"""
        CREATE TEMP TABLE wspr_source AS
        SELECT source.*
        FROM read_parquet({sql_string(spec.bronze)}) AS source
        INNER JOIN selected_hours USING (target_hour);

        CREATE TEMP TABLE expected_opportunity_cells AS
        SELECT {expected_projection}
        FROM read_parquet(
          {sql_string(spec.opportunities)}, hive_partitioning=false
        ) AS expected
        INNER JOIN selected_hours USING (target_hour);
        """
    )
    input_rows = int(connection.execute("SELECT count(*) FROM wspr_source").fetchone()[0])
    materialize_opportunity_cells(
        connection,
        source_relation="wspr_source",
        task="hf",
        receiver_samples=RECEIVER_SAMPLES_PER_TX_SLOT,
    )
    materialize_path_hour_cells(connection)
    connection.execute(
        """
        CREATE TEMP TABLE expected_path_hour_cells AS
        SELECT target_hour, band, tx_grid4, rx_grid4,
               sum(successes)::DOUBLE AS successes,
               sum(opportunities)::DOUBLE AS opportunities,
               sum(successes) / sum(opportunities) AS success_rate,
               sum(sampled_rows)::INTEGER AS sampled_rows,
               sum(positive_rows)::INTEGER AS positive_rows
        FROM expected_opportunity_cells
        GROUP BY 1, 2, 3, 4
        """
    )
    opportunity_actual = int(
        connection.execute("SELECT count(*) FROM opportunity_cells").fetchone()[0]
    )
    opportunity_expected = int(
        connection.execute("SELECT count(*) FROM expected_opportunity_cells").fetchone()[0]
    )
    path_actual = int(
        connection.execute("SELECT count(*) FROM path_hour_cells").fetchone()[0]
    )
    path_expected = int(
        connection.execute("SELECT count(*) FROM expected_path_hour_cells").fetchone()[0]
    )
    opportunity_left = difference_count(
        connection, "opportunity_cells", "expected_opportunity_cells"
    )
    opportunity_right = difference_count(
        connection, "expected_opportunity_cells", "opportunity_cells"
    )
    path_left = difference_count(
        connection, "path_hour_cells", "expected_path_hour_cells"
    )
    path_right = difference_count(
        connection, "expected_path_hour_cells", "path_hour_cells"
    )
    band_rows = [
        {
            "band": row[0],
            "actual_rows": int(row[1]),
            "expected_rows": int(row[2]),
        }
        for row in connection.execute(
            """
            WITH actual AS (
              SELECT band, count(*) AS rows FROM opportunity_cells GROUP BY band
            ), expected AS (
              SELECT band, count(*) AS rows
              FROM expected_opportunity_cells GROUP BY band
            )
            SELECT coalesce(actual.band, expected.band),
                   coalesce(actual.rows, 0), coalesce(expected.rows, 0)
            FROM actual FULL OUTER JOIN expected USING (band)
            ORDER BY 1
            """
        ).fetchall()
    ]
    exact = (
        opportunity_actual == opportunity_expected
        and path_actual == path_expected
        and opportunity_left == 0
        and opportunity_right == 0
        and path_left == 0
        and path_right == 0
    )
    result = {
        "label": spec.label,
        "available_hours": len(hours),
        "selected_hours": [hour.isoformat() for hour in selected],
        "utc_hour_of_day_coverage": sorted({hour.hour for hour in selected}),
        "input_spot_rows": input_rows,
        "opportunity_cells": {
            "actual": opportunity_actual,
            "expected": opportunity_expected,
            "actual_minus_expected": opportunity_left,
            "expected_minus_actual": opportunity_right,
        },
        "path_hour_cells": {
            "actual": path_actual,
            "expected": path_expected,
            "actual_minus_expected": path_left,
            "expected_minus_actual": path_right,
        },
        "bands": band_rows,
        "exact": exact,
        "wall_seconds": time.perf_counter() - started,
    }
    connection.close()
    return result, selected


class ReplayStore:
    """Identity-bearing in-memory replay store; only aggregates leave the process."""

    def __init__(self) -> None:
        self.observations: dict[str, dict[str, Any]] = {}
        self.insert_attempts = 0
        self.feature_versions: dict[tuple[Any, ...], dict[str, Any]] = {}
        self.watermark_versions: dict[tuple[Any, ...], dict[str, Any]] = {}
        self.events: list[str] = []
        self.read_count = 0
        self.maximum_read_receipt: datetime | None = None

    def insert_observation_page(self, rows: list[dict[str, Any]]) -> None:
        self.insert_attempts += len(rows)
        for row in rows:
            self.observations.setdefault(row["observation_key_sha256"], dict(row))

    def observation_pages(
        self,
        *,
        target_hour: datetime,
        band: str,
        provider: str,
        available_at: datetime,
        page_size: int,
    ) -> Iterable[list[dict[str, Any]]]:
        eligible = [
            row
            for row in self.observations.values()
            if datetime.fromisoformat(row["target_hour"]) == target_hour
            and row["band"] == band
            and row["source"] == provider
            and datetime.fromisoformat(row["received_at"]) <= available_at
        ]
        eligible.sort(key=lambda row: row["observation_key_sha256"], reverse=True)
        self.read_count += len(eligible)
        if eligible:
            receipt = max(datetime.fromisoformat(row["received_at"]) for row in eligible)
            self.maximum_read_receipt = max(
                receipt,
                self.maximum_read_receipt or receipt,
            )
        for offset in range(0, len(eligible), page_size):
            yield eligible[offset:offset + page_size]

    def upsert_feature_page(self, rows: list[dict[str, Any]]) -> None:
        self.events.append("features")
        for row in rows:
            key = (
                row["target_hour"],
                row["band"],
                row["tx_grid4"],
                row["rx_grid4"],
                row["provider"],
                row["transform_version"],
                row["available_at"],
            )
            existing = self.feature_versions.setdefault(key, dict(row))
            if existing != row:
                raise RuntimeError("feature replay attempted a non-idempotent overwrite")

    def upsert_watermark(self, row: dict[str, Any]) -> None:
        self.events.append("watermark")
        key = (
            row["target_hour"],
            row["band"],
            row["provider"],
            row["transform_version"],
            row["available_at"],
        )
        existing = self.watermark_versions.setdefault(key, dict(row))
        if existing != row:
            raise RuntimeError("watermark replay attempted a non-idempotent overwrite")

    def features_at(self, available_at: datetime) -> list[dict[str, Any]]:
        value = available_at.isoformat()
        return [
            dict(row)
            for row in self.feature_versions.values()
            if row["available_at"] == value
        ]


class ReplayPathHistoryProvider:
    """Apply the migration's causal watermark selection to replay versions."""

    name = "synthetic-receipt-replay"
    transform_version = TRANSFORM_VERSION

    def __init__(self, store: ReplayStore) -> None:
        self.store = store

    def lookup(
        self,
        *,
        issue_time: datetime,
        band: str,
        origin_grid4: str,
        target_grid4s: list[str],
    ) -> dict[str, VerifiedPathHistory]:
        issue_hour = issue_time.replace(minute=0, second=0, microsecond=0)
        watermarks: dict[int, dict[str, Any]] = {}
        for lag in PATH_LAGS:
            target_hour = (issue_hour - timedelta(hours=lag)).isoformat()
            candidates = [
                row
                for row in self.store.watermark_versions.values()
                if row["target_hour"] == target_hour
                and row["band"] == band
                and row["provider"] == self.name
                and row["transform_version"] == self.transform_version
                and row["status"] == "complete"
                and not row["quality_flags"]
                and datetime.fromisoformat(row["available_at"]) <= issue_time
            ]
            if not candidates:
                return {}
            watermarks[lag] = max(candidates, key=lambda row: row["available_at"])
        snapshots = {}
        for target in target_grid4s:
            fields: dict[str, float | int] = {}
            quality_flags = []
            for lag, watermark in watermarks.items():
                matches = [
                    row
                    for row in self.store.feature_versions.values()
                    if row["target_hour"] == watermark["target_hour"]
                    and row["band"] == band
                    and row["tx_grid4"] == origin_grid4
                    and row["rx_grid4"] == target
                    and row["provider"] == self.name
                    and row["transform_version"] == self.transform_version
                    and row["available_at"] == watermark["available_at"]
                ]
                if len(matches) > 1:
                    raise RuntimeError("duplicate replay path feature")
                fields[f"path_success_prev{lag}"] = (
                    float(matches[0]["success_rate"]) if matches else 0.0
                )
                fields[f"path_prev{lag}_available"] = int(bool(matches))
                if matches:
                    quality_flags.extend(matches[0]["quality_flags"])
            snapshots[target] = VerifiedPathHistory(
                target_grid4=target,
                source_watermark=datetime.fromisoformat(
                    watermarks[1]["source_watermark"]
                ),
                available_at=max(
                    datetime.fromisoformat(row["available_at"])
                    for row in watermarks.values()
                ),
                provider=self.name,
                transform_version=self.transform_version,
                quality_flags=tuple(quality_flags),
                **fields,
            )
        return snapshots


def selected_receipt_case(
    connection: duckdb.DuckDBPyConnection,
    spec: DatasetSpec,
    selected: list[datetime],
) -> tuple[datetime, str, int]:
    connection.execute("CREATE TEMP TABLE receipt_hours(target_hour TIMESTAMPTZ)")
    connection.executemany(
        "INSERT INTO receipt_hours VALUES (?)",
        [(hour,) for hour in selected],
    )
    row = connection.execute(
        f"""
        SELECT target_hour, band, count(*) AS rows
        FROM read_parquet({sql_string(spec.bronze)})
        INNER JOIN receipt_hours USING (target_hour)
        WHERE band <> '6m'
        GROUP BY 1, 2
        ORDER BY
          CASE WHEN rows BETWEEN 5000 AND 15000 THEN 0 ELSE 1 END,
          abs(rows - 10000), target_hour, band
        LIMIT 1
        """
    ).fetchone()
    if row is None:
        raise RuntimeError(f"no receipt replay case available for {spec.label}")
    return row[0].astimezone(timezone.utc), str(row[1]), int(row[2])


def normalized_replay_rows(
    connection: duckdb.DuckDBPyConnection,
    spec: DatasetSpec,
    *,
    target_hour: datetime,
    band: str,
    provider: str,
) -> tuple[list[dict[str, Any]], int]:
    rows = connection.execute(
        f"""
        SELECT source_row_id, observed_at_utc, band, tx_call, tx_grid,
               rx_call, rx_grid, tx_power_dbm, snr_db
        FROM read_parquet({sql_string(spec.bronze)})
        WHERE target_hour = ? AND band = ?
        ORDER BY hash(source_row_id) DESC
        """,
        [target_hour, band],
    ).fetchall()
    hour_end = target_hour + timedelta(hours=1)
    normalized = []
    late_rows = 0
    for index, row in enumerate(rows):
        event_time = row[1].astimezone(timezone.utc)
        is_late = index % 10 == 0
        received_at = hour_end + timedelta(minutes=10) if is_late else event_time + timedelta(seconds=30)
        late_rows += int(is_late)
        normalized.append(normalize_observation(
            {
                "source_id": f"{spec.label}:{row[0]}",
                "event_time": event_time,
                "band": row[2],
                "tx_call": row[3],
                "tx_grid": row[4],
                "rx_call": row[5],
                "rx_grid": row[6],
                "tx_power_dbm": row[7],
                "snr_db": row[8],
            },
            provider=provider,
            received_at=received_at,
            ingest_version="synthetic-receipt-replay-v1",
        ))
    return normalized, late_rows


def feature_map(rows: Iterable[dict[str, Any]]) -> dict[tuple[str, str], dict[str, float]]:
    result = {}
    for row in rows:
        key = (str(row["tx_grid4"]), str(row["rx_grid4"]))
        if key in result:
            raise RuntimeError("duplicate path feature in replay comparison")
        result[key] = {metric: float(row[metric]) for metric in PATH_METRICS}
    return result


def expected_path_features(
    connection: duckdb.DuckDBPyConnection,
    spec: DatasetSpec,
    *,
    target_hour: datetime,
    band: str,
) -> dict[tuple[str, str], dict[str, float]]:
    rows = connection.execute(
        f"""
        SELECT tx_grid4, rx_grid4,
               sum(successes)::DOUBLE AS successes,
               sum(opportunities)::DOUBLE AS opportunities,
               sum(successes) / sum(opportunities) AS success_rate,
               sum(sampled_rows)::INTEGER AS sampled_rows,
               sum(positive_rows)::INTEGER AS positive_rows
        FROM read_parquet(
          {sql_string(spec.opportunities)}, hive_partitioning=false
        )
        WHERE target_hour = ? AND band = ?
        GROUP BY 1, 2
        """,
        [target_hour, band],
    ).fetchall()
    return {
        (str(row[0]), str(row[1])): {
            metric: float(row[index + 2])
            for index, metric in enumerate(PATH_METRICS)
        }
        for row in rows
    }


def compare_features(
    actual: dict[tuple[str, str], dict[str, float]],
    expected: dict[tuple[str, str], dict[str, float]],
) -> dict[str, Any]:
    actual_keys = set(actual)
    expected_keys = set(expected)
    maxima = {metric: 0.0 for metric in PATH_METRICS}
    for key in actual_keys & expected_keys:
        for metric in PATH_METRICS:
            maxima[metric] = max(
                maxima[metric],
                abs(actual[key][metric] - expected[key][metric]),
            )
    exact_keys = actual_keys == expected_keys
    within_tolerance = (
        exact_keys
        and maxima["success_rate"] <= 1e-12
        and maxima["successes"] <= 1e-9
        and maxima["opportunities"] <= 1e-9
        and maxima["sampled_rows"] == 0
        and maxima["positive_rows"] == 0
    )
    return {
        "actual_cells": len(actual),
        "expected_cells": len(expected),
        "actual_only_cells": len(actual_keys - expected_keys),
        "expected_only_cells": len(expected_keys - actual_keys),
        "maximum_absolute_difference": maxima,
        "within_tolerance": within_tolerance,
    }


def replay_receipt_time(
    spec: DatasetSpec,
    selected: list[datetime],
    *,
    threads: int,
) -> dict[str, Any]:
    started = time.perf_counter()
    provider = "synthetic-receipt-replay"
    connection = configured_connection(threads, "16GB")
    target_hour, band, source_rows = selected_receipt_case(connection, spec, selected)
    normalized, late_rows = normalized_replay_rows(
        connection,
        spec,
        target_hour=target_hour,
        band=band,
        provider=provider,
    )
    if len(normalized) != source_rows or late_rows == 0:
        raise RuntimeError("receipt replay normalization inventory mismatch")
    store = ReplayStore()
    page_size = 1000
    for offset in range(0, len(normalized), page_size):
        page = normalized[offset:offset + page_size]
        store.insert_observation_page(page)
        duplicates = page[::97]
        if duplicates:
            store.insert_observation_page(duplicates)
    hour_end = target_hour + timedelta(hours=1)
    first_cutoff = hour_end + timedelta(minutes=5)
    corrected_cutoff = hour_end + timedelta(minutes=15)
    degraded_cutoff = hour_end + timedelta(minutes=20)
    first_event_offset = len(store.events)
    first_watermark = finalize_hour(
        store,
        target_hour=target_hour,
        available_at=first_cutoff,
        source_watermark=hour_end,
        band=band,
        provider=provider,
        source_complete=True,
        page_size=5000,
        threads=threads,
    )
    first_events = store.events[first_event_offset:]
    first_features = store.features_at(first_cutoff)
    first_digest = hashlib.sha256(
        json.dumps(first_features, sort_keys=True, default=str).encode()
    ).hexdigest()
    corrected_event_offset = len(store.events)
    corrected_watermark = finalize_hour(
        store,
        target_hour=target_hour,
        available_at=corrected_cutoff,
        source_watermark=hour_end,
        band=band,
        provider=provider,
        source_complete=True,
        page_size=5000,
        threads=threads,
    )
    corrected_events = store.events[corrected_event_offset:]
    corrected_features = store.features_at(corrected_cutoff)
    expected = expected_path_features(
        connection,
        spec,
        target_hour=target_hour,
        band=band,
    )
    parity = compare_features(feature_map(corrected_features), expected)
    immutable_first = first_digest == hashlib.sha256(
        json.dumps(store.features_at(first_cutoff), sort_keys=True, default=str).encode()
    ).hexdigest()
    degraded_event_offset = len(store.events)
    degraded_watermark = finalize_hour(
        store,
        target_hour=target_hour,
        available_at=degraded_cutoff,
        source_watermark=hour_end,
        band=band,
        provider=provider,
        source_complete=True,
        quality_flags=("synthetic_quality_flag",),
        page_size=5000,
        threads=threads,
    )
    degraded_events = store.events[degraded_event_offset:]
    too_late_rejected = False
    future_rejected = False
    sample = normalized[0]
    raw_sample = {
        "source_id": "bounded-lateness-probe",
        "event_time": sample["event_time"],
        "band": sample["band"],
        "tx_call": sample["tx_call"],
        "tx_grid": sample["tx_grid4"],
        "rx_call": sample["rx_call"],
        "rx_grid": sample["rx_grid4"],
        "tx_power_dbm": sample["power_bin_dbm"],
        "snr_db": sample["snr_db"],
    }
    event_time = datetime.fromisoformat(sample["event_time"])
    try:
        normalize_observation(
            raw_sample,
            provider=provider,
            received_at=event_time + timedelta(hours=31),
            ingest_version="synthetic-receipt-replay-v1",
        )
    except ValueError:
        too_late_rejected = True
    future_sample = dict(raw_sample)
    future_sample["source_id"] = "future-event-probe"
    future_sample["event_time"] = event_time + timedelta(minutes=6)
    try:
        normalize_observation(
            future_sample,
            provider=provider,
            received_at=event_time,
            ingest_version="synthetic-receipt-replay-v1",
        )
    except ValueError:
        future_rejected = True
    result = {
        "label": spec.label,
        "target_hour": target_hour.isoformat(),
        "band": band,
        "source_rows": source_rows,
        "late_rows": late_rows,
        "insert_attempts": store.insert_attempts,
        "unique_observations": len(store.observations),
        "duplicate_attempts_ignored": store.insert_attempts - len(store.observations),
        "first_version": {
            "available_at": first_cutoff.isoformat(),
            "observation_count": int(first_watermark["observation_count"]),
            "feature_cells": int(first_watermark["feature_cell_count"]),
            "watermark_last": bool(first_events) and first_events[-1] == "watermark",
        },
        "corrected_version": {
            "available_at": corrected_cutoff.isoformat(),
            "observation_count": int(corrected_watermark["observation_count"]),
            "feature_cells": int(corrected_watermark["feature_cell_count"]),
            "watermark_last": bool(corrected_events) and corrected_events[-1] == "watermark",
            "historical_parity": parity,
        },
        "degraded_version": {
            "available_at": degraded_cutoff.isoformat(),
            "status": degraded_watermark["status"],
            "quality_flags": degraded_watermark["quality_flags"],
            "watermark_last": bool(degraded_events) and degraded_events[-1] == "watermark",
        },
        "correction_created_new_version": corrected_cutoff != first_cutoff,
        "first_version_immutable": immutable_first,
        "too_late_rejected": too_late_rejected,
        "future_event_rejected": future_rejected,
        "maximum_read_receipt_not_future": (
            store.maximum_read_receipt is not None
            and store.maximum_read_receipt <= degraded_cutoff
        ),
        "wall_seconds": time.perf_counter() - started,
    }
    connection.close()
    return result


def selected_lag_case(
    connection: duckdb.DuckDBPyConnection,
    spec: DatasetSpec,
) -> tuple[datetime, str, dict[int, int]]:
    connection.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE lag_hour_counts AS
        SELECT target_hour, band, count(*) AS rows
        FROM read_parquet({sql_string(spec.bronze)})
        WHERE band <> '6m'
        GROUP BY 1, 2
        """
    )
    row = connection.execute(
        """
        SELECT h1.target_hour + interval '1 hour' AS issue_hour,
               h1.band,
               h1.rows, h2.rows, h3.rows, h24.rows
        FROM lag_hour_counts h1
        JOIN lag_hour_counts h2
          ON h2.target_hour = h1.target_hour - interval '1 hour'
         AND h2.band = h1.band
        JOIN lag_hour_counts h3
          ON h3.target_hour = h1.target_hour - interval '2 hours'
         AND h3.band = h1.band
        JOIN lag_hour_counts h24
          ON h24.target_hour = h1.target_hour - interval '23 hours'
         AND h24.band = h1.band
        ORDER BY
          CASE WHEN least(h1.rows, h2.rows, h3.rows, h24.rows) >= 3000
                 AND greatest(h1.rows, h2.rows, h3.rows, h24.rows) <= 15000
               THEN 0 ELSE 1 END,
          abs(h1.rows + h2.rows + h3.rows + h24.rows - 36000),
          issue_hour, h1.band
        LIMIT 1
        """
    ).fetchone()
    if row is None:
        raise RuntimeError(f"no four-lag replay case available for {spec.label}")
    return (
        row[0].astimezone(timezone.utc) + timedelta(minutes=15),
        str(row[1]),
        {lag: int(row[index + 2]) for index, lag in enumerate(PATH_LAGS)},
    )


def evenly_spaced(values: list[str], count: int) -> list[str]:
    if len(values) <= count:
        return values
    return [
        values[round(index * (len(values) - 1) / (count - 1))]
        for index in range(count)
    ]


def replay_lag_lookup(
    spec: DatasetSpec,
    *,
    threads: int,
) -> dict[str, Any]:
    started = time.perf_counter()
    connection = configured_connection(threads, "24GB")
    issue_time, band, source_rows_by_lag = selected_lag_case(connection, spec)
    issue_hour = issue_time.replace(minute=0, second=0, microsecond=0)
    provider = ReplayPathHistoryProvider.name
    store = ReplayStore()
    late_rows_by_lag = {}
    watermark_last = True
    for lag in PATH_LAGS:
        target_hour = issue_hour - timedelta(hours=lag)
        normalized, late_rows = normalized_replay_rows(
            connection,
            spec,
            target_hour=target_hour,
            band=band,
            provider=provider,
        )
        if len(normalized) != source_rows_by_lag[lag]:
            raise RuntimeError("four-lag source inventory mismatch")
        late_rows_by_lag[lag] = late_rows
        for offset in range(0, len(normalized), 1000):
            store.insert_observation_page(normalized[offset:offset + 1000])
        event_offset = len(store.events)
        finalize_hour(
            store,
            target_hour=target_hour,
            available_at=target_hour + timedelta(hours=1, minutes=15),
            source_watermark=target_hour + timedelta(hours=1),
            band=band,
            provider=provider,
            source_complete=True,
            page_size=5000,
            threads=threads,
        )
        events = store.events[event_offset:]
        watermark_last = watermark_last and bool(events) and events[-1] == "watermark"

    expected_by_lag = {
        lag: expected_path_features(
            connection,
            spec,
            target_hour=issue_hour - timedelta(hours=lag),
            band=band,
        )
        for lag in PATH_LAGS
    }
    origin_targets: dict[str, set[str]] = {}
    for values in expected_by_lag.values():
        for origin, target in values:
            origin_targets.setdefault(origin, set()).add(target)
    if not origin_targets:
        raise RuntimeError("four-lag replay produced no expected path cells")
    origin = min(
        origin_targets,
        key=lambda value: (-len(origin_targets[value]), value),
    )
    targets = evenly_spaced(sorted(origin_targets[origin]), 64)
    path_provider = ReplayPathHistoryProvider(store)
    batch = path_provider.lookup(
        issue_time=issue_time,
        band=band,
        origin_grid4=origin,
        target_grid4s=targets,
    )
    single = {
        target: path_provider.lookup(
            issue_time=issue_time,
            band=band,
            origin_grid4=origin,
            target_grid4s=[target],
        ).get(target)
        for target in targets
    }
    batch_single_identical = batch == single and len(batch) == len(targets)
    availability_mismatches = 0
    maximum_rate_difference = 0.0
    availability_counts = {lag: 0 for lag in PATH_LAGS}
    for target in targets:
        snapshot = batch.get(target)
        if snapshot is None:
            availability_mismatches += len(PATH_LAGS)
            continue
        for lag in PATH_LAGS:
            expected = expected_by_lag[lag].get((origin, target))
            expected_available = int(expected is not None)
            actual_available = int(getattr(snapshot, f"path_prev{lag}_available"))
            actual_rate = float(getattr(snapshot, f"path_success_prev{lag}"))
            expected_rate = float(expected["success_rate"]) if expected else 0.0
            availability_mismatches += int(actual_available != expected_available)
            availability_counts[lag] += actual_available
            maximum_rate_difference = max(
                maximum_rate_difference,
                abs(actual_rate - expected_rate),
            )
    causal_timestamps = all(
        snapshot.available_at <= issue_time
        and snapshot.source_watermark <= issue_time
        and not snapshot.quality_flags
        for snapshot in batch.values()
    )
    result = {
        "label": spec.label,
        "issue_time": issue_time.isoformat(),
        "band": band,
        "lag_hours": list(PATH_LAGS),
        "source_rows_by_lag": {
            str(lag): source_rows_by_lag[lag] for lag in PATH_LAGS
        },
        "late_rows_by_lag": {
            str(lag): late_rows_by_lag[lag] for lag in PATH_LAGS
        },
        "target_count": len(targets),
        "availability_counts": {
            str(lag): availability_counts[lag] for lag in PATH_LAGS
        },
        "availability_mismatches": availability_mismatches,
        "maximum_absolute_rate_difference": maximum_rate_difference,
        "batch_single_identical": batch_single_identical,
        "causal_timestamps": causal_timestamps,
        "watermark_committed_last": watermark_last,
        "wall_seconds": time.perf_counter() - started,
    }
    connection.close()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--dataset", action="append", type=parse_dataset, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--threads", type=int, default=18)
    args = parser.parse_args()
    del args.profile
    config = read_json(CONFIG)
    hardware_runtime = validate_m5_runtime(config)
    configured_threads = int(config["compute"]["apple_silicon"]["duckdb_threads"])
    if args.threads != configured_threads:
        raise ValueError(
            f"replay must use the configured {configured_threads} DuckDB threads"
        )
    if len(args.dataset) < 2:
        raise ValueError("replay requires at least two open development months")
    labels = [spec.label for spec in args.dataset]
    if len(labels) != len(set(labels)):
        raise ValueError("dataset labels must be unique")
    if args.threads < 1 or args.threads > (os.cpu_count() or 1):
        raise ValueError("--threads must fit the visible CPU count")

    started = time.perf_counter()
    event_results = []
    selected_by_label = {}
    receipt_results = []
    lag_lookup_results = []
    inputs = []
    for spec in args.dataset:
        event_result, selected = replay_event_time(spec, threads=args.threads)
        event_results.append(event_result)
        selected_by_label[spec.label] = selected
        inputs.append({
            "label": spec.label,
            "bronze": {
                "path": logical_path(spec.bronze),
                "bytes": spec.bronze.stat().st_size,
                "sha256": sha256(spec.bronze),
            },
            "opportunities": {
                "path": logical_path(spec.opportunities),
                "bytes": spec.opportunities.stat().st_size,
                "sha256": sha256(spec.opportunities),
            },
        })
    for spec in args.dataset:
        receipt_results.append(replay_receipt_time(
            spec,
            selected_by_label[spec.label],
            threads=args.threads,
        ))
    for spec in args.dataset:
        lag_lookup_results.append(replay_lag_lookup(
            spec,
            threads=args.threads,
        ))

    gates = {
        "two_open_months_replayed": len(event_results) >= 2,
        "twenty_four_utc_strata_per_month": all(
            result["utc_hour_of_day_coverage"] == list(range(24))
            and len(result["selected_hours"]) == 24
            for result in event_results
        ),
        "event_time_transform_exact": all(result["exact"] for result in event_results),
        "receipt_time_final_parity": all(
            result["corrected_version"]["historical_parity"]["within_tolerance"]
            for result in receipt_results
        ),
        "duplicates_idempotent": all(
            result["duplicate_attempts_ignored"] > 0
            and result["unique_observations"] == result["source_rows"]
            for result in receipt_results
        ),
        "late_correction_versioned": all(
            result["late_rows"] > 0
            and result["first_version"]["observation_count"] < result["corrected_version"]["observation_count"]
            and result["correction_created_new_version"]
            and result["first_version_immutable"]
            for result in receipt_results
        ),
        "watermark_committed_last": all(
            result[version]["watermark_last"]
            for result in receipt_results
            for version in ("first_version", "corrected_version", "degraded_version")
        ),
        "degraded_hour_flagged": all(
            result["degraded_version"]["status"] == "degraded"
            and result["degraded_version"]["quality_flags"]
            for result in receipt_results
        ),
        "bounded_lateness_and_future_rejected": all(
            result["too_late_rejected"]
            and result["future_event_rejected"]
            and result["maximum_read_receipt_not_future"]
            for result in receipt_results
        ),
        "four_lag_availability_exact": all(
            result["lag_hours"] == list(PATH_LAGS)
            and result["availability_mismatches"] == 0
            for result in lag_lookup_results
        ),
        "four_lag_values_exact": all(
            result["maximum_absolute_rate_difference"] <= 1e-12
            for result in lag_lookup_results
        ),
        "batch_single_lookup_identical": all(
            result["batch_single_identical"]
            for result in lag_lookup_results
        ),
        "lookup_timestamps_causal": all(
            result["causal_timestamps"]
            and result["watermark_committed_last"]
            for result in lag_lookup_results
        ),
        "m5_parallel_contract": platform.machine() == "arm64" and args.threads == 18,
        "locked_outcomes_unread": True,
    }
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "open_development_multi_hour_event_and_synthetic_receipt_replay",
        "locked_outcomes_read": False,
        "receipt_time_evidence": "synthetic_from_open_archive_event_times",
        "inputs": inputs,
        "transform": transform_metadata(RECEIVER_SAMPLES_PER_TX_SLOT),
        "event_time_replay": event_results,
        "receipt_time_replay": receipt_results,
        "lag_lookup_replay": lag_lookup_results,
        "compute": {
            "machine": platform.machine(),
            "visible_cpus": os.cpu_count(),
            "duckdb_threads": args.threads,
            "peak_rss_gib": peak_rss_gib(),
            "wall_seconds": time.perf_counter() - started,
            "hardware_runtime": hardware_runtime,
        },
        "gates": gates,
        "decision": "pass" if all(gates.values()) else "fail",
        "remaining_limits": [
            "archive receipt timestamps are unavailable, so receipt delays are synthetic",
            "target Postgres migration is not deployed",
            "authorized provider connector is not enabled",
            "30-day real receipt-time shadow coverage is still required",
        ],
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2))
    if result["decision"] != "pass":
        raise SystemExit("live feature replay failed")


if __name__ == "__main__":
    main()
