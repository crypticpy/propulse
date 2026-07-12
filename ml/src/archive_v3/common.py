"""Shared configuration, paths, hashing, and manifest helpers for Archive V3."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "ml/data"
RAW = DATA / "raw/archive_v3"
BRONZE = DATA / "bronze/archive_v3"
PROCESSED = DATA / "processed/archive_v3"
MANIFESTS = DATA / "manifests"
MODELS = ROOT / "ml/models/archive_v3"
RESULTS = ROOT / "ml/results/archive_v3"

WSPR_COLUMNS = {
    "spot_id": "BIGINT",
    "observed_epoch": "BIGINT",
    "rx_call_raw": "VARCHAR",
    "rx_grid_raw": "VARCHAR",
    "snr_db": "DOUBLE",
    "frequency_mhz": "DOUBLE",
    "tx_call_raw": "VARCHAR",
    "tx_grid_raw": "VARCHAR",
    "tx_power_dbm": "DOUBLE",
    "drift_hz_per_min": "DOUBLE",
    "source_distance_km": "DOUBLE",
    "source_azimuth_deg": "DOUBLE",
    "source_band": "INTEGER",
    "decoder_version": "VARCHAR",
    "source_code": "INTEGER",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_config(path: str | Path) -> dict[str, Any]:
    config_path = Path(path)
    if not config_path.is_absolute():
        config_path = ROOT / config_path
    value = json.loads(config_path.read_text(encoding="utf-8"))
    value["config_path"] = str(config_path.relative_to(ROOT))
    return value


def ensure_directories() -> None:
    for path in (RAW, BRONZE, PROCESSED, MANIFESTS, MODELS, RESULTS):
        path.mkdir(parents=True, exist_ok=True)


def sha256(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, default=str) + "\n", encoding="utf-8")


def relative(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def run_output(command: list[str]) -> str | None:
    try:
        return subprocess.check_output(command, text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def machine_inventory() -> dict[str, Any]:
    return {
        "captured_at": utc_now(),
        "platform": platform.platform(),
        "architecture": platform.machine(),
        "python": platform.python_version(),
        "logical_cpus": os.cpu_count(),
        "chip": run_output(["sysctl", "-n", "machdep.cpu.brand_string"]),
        "memory_bytes": run_output(["sysctl", "-n", "hw.memsize"]),
        "git_commit": run_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"]),
    }


def band_sql(frequency_expression: str = "frequency_mhz") -> str:
    f = frequency_expression
    return f"""
    CASE
      WHEN {f} BETWEEN 1.80 AND 2.00 THEN '160m'
      WHEN {f} BETWEEN 3.45 AND 4.10 THEN '80m'
      WHEN {f} BETWEEN 5.20 AND 5.50 THEN '60m'
      WHEN {f} BETWEEN 6.90 AND 7.35 THEN '40m'
      WHEN {f} BETWEEN 10.05 AND 10.20 THEN '30m'
      WHEN {f} BETWEEN 13.90 AND 14.40 THEN '20m'
      WHEN {f} BETWEEN 18.00 AND 18.25 THEN '17m'
      WHEN {f} BETWEEN 20.90 AND 21.50 THEN '15m'
      WHEN {f} BETWEEN 24.80 AND 25.05 THEN '12m'
      WHEN {f} BETWEEN 27.90 AND 30.00 THEN '10m'
      WHEN {f} BETWEEN 49.80 AND 54.10 THEN '6m'
      ELSE NULL
    END
    """


def month_parts(month: str) -> tuple[str, str]:
    year, number = month.split("-", maxsplit=1)
    return year, number


def wspr_raw_path(month: str) -> Path:
    year, number = month_parts(month)
    return RAW / f"wspr/year={year}/month={number}/wsprspots-{month}.csv.gz"


def wspr_bronze_path(month: str) -> Path:
    year, number = month_parts(month)
    return BRONZE / f"wspr/year={year}/month={number}/spots.parquet"


def opportunity_path(month: str, task: str) -> Path:
    year, number = month_parts(month)
    return PROCESSED / f"opportunities/task={task}/year={year}/month={number}/part.parquet"
