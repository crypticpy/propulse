"""Discovery and immutable inventory helpers for V4.1 development inputs."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq

from protocol import ROOT, sha256


@dataclass(frozen=True)
class CalibrationInput:
    month: str
    path: Path
    rows: int
    minimum_time: datetime
    maximum_time: datetime
    schema_sha256: str


def schema_sha256(path: Path) -> str:
    schema = pq.ParquetFile(path).schema_arrow
    return hashlib.sha256(schema.serialize().to_pybytes()).hexdigest()


def parquet_summary(path: Path) -> CalibrationInput:
    parquet = pq.ParquetFile(path)
    column_index = parquet.schema_arrow.get_field_index("target_hour")
    if column_index < 0:
        raise ValueError(f"target_hour is missing from {path}")
    statistics = [
        parquet.metadata.row_group(index).column(column_index).statistics
        for index in range(parquet.metadata.num_row_groups)
    ]
    if not statistics or any(value is None or not value.has_min_max for value in statistics):
        raise ValueError(f"target_hour statistics are missing from {path}")
    minimum = min(value.min for value in statistics)
    maximum = max(value.max for value in statistics)
    month = minimum.strftime("%Y-%m")
    if maximum.strftime("%Y-%m") != month:
        raise ValueError(f"input crosses month boundary: {path}")
    return CalibrationInput(
        month=month,
        path=path,
        rows=int(parquet.metadata.num_rows),
        minimum_time=minimum,
        maximum_time=maximum,
        schema_sha256=schema_sha256(path),
    )


def discover_inputs(config: dict[str, Any]) -> dict[str, CalibrationInput]:
    configured_root = Path(config["compute"]["data_root"])
    data_root = ROOT / "ml/data"
    if data_root.resolve() != configured_root.resolve():
        raise RuntimeError("repository data link does not match the approved M5 root")
    v4 = (
        data_root
        / "processed/archive_v4"
        / f"dataset_{config['parent_run_id']}_hf.parquet"
    )
    v41 = (
        data_root
        / "processed/archive_v4_1"
        / f"dataset_{config['run_id']}_hf.parquet"
    )
    for directory in (v4, v41):
        if not directory.is_dir() or not (directory / "_SUCCESS").exists():
            raise FileNotFoundError(f"complete feature dataset is required: {directory}")
    required = list(config["data_roles"]["calibration_development"])
    allowed_new = set(config["data_roles"]["new_calibration_sources"])
    discovered: dict[str, CalibrationInput] = {}
    for path in sorted(v4.glob("part-*.parquet")):
        value = parquet_summary(path)
        if value.month == "2024-04":
            discovered[value.month] = value
    for path in sorted(v41.glob("part-*.parquet")):
        value = parquet_summary(path)
        if value.month not in allowed_new:
            raise ValueError(f"V4.1 development dataset contains {value.month}")
        if value.month in discovered:
            raise ValueError(f"duplicate calibration month: {value.month}")
        discovered[value.month] = value
    if list(sorted(discovered)) != sorted(required):
        raise ValueError(
            f"calibration inputs must be exactly {required}; found {sorted(discovered)}"
        )
    schemas = {value.schema_sha256 for value in discovered.values()}
    if len(schemas) != 1:
        raise ValueError("calibration input schemas differ")
    return {month: discovered[month] for month in required}


def feature_order_sha256(features: list[str]) -> str:
    encoded = json.dumps(features, separators=(",", ":"), ensure_ascii=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def inventory_entry(value: CalibrationInput) -> dict[str, Any]:
    return {
        "path": value.path.relative_to(ROOT).as_posix(),
        "bytes": value.path.stat().st_size,
        "sha256": sha256(value.path),
        "rows": value.rows,
        "minimum_time": value.minimum_time.isoformat(),
        "maximum_time": value.maximum_time.isoformat(),
        "schema_sha256": value.schema_sha256,
    }
