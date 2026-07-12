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
ARCHIVE_NAMESPACE = os.environ.get("PROPULSE_ARCHIVE_NAMESPACE", "archive_v3")
DATA = Path(os.environ.get("PROPULSE_ML_DATA_ROOT", ROOT / "ml/data"))
RAW = DATA / f"raw/{ARCHIVE_NAMESPACE}"
BRONZE = DATA / f"bronze/{ARCHIVE_NAMESPACE}"
PROCESSED = DATA / f"processed/{ARCHIVE_NAMESPACE}"
MANIFESTS = DATA / "manifests"
MODELS = Path(
    os.environ.get(
        "PROPULSE_ML_MODEL_ROOT", ROOT / f"ml/models/{ARCHIVE_NAMESPACE}"
    )
)
DEFAULT_RESULTS_NAMESPACE = (
    "propagation_v4" if ARCHIVE_NAMESPACE == "archive_v4" else ARCHIVE_NAMESPACE
)
RESULTS = Path(
    os.environ.get(
        "PROPULSE_ML_RESULTS_ROOT",
        ROOT / f"ml/results/{DEFAULT_RESULTS_NAMESPACE}",
    )
)

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


def configure_duckdb(connection: Any, config: dict[str, Any], stage: str) -> Path:
    compute = config.get("compute", {})
    threads = int(
        os.environ.get("PROPULSE_DUCKDB_THREADS", compute.get("duckdb_threads", 14))
    )
    memory_limit = os.environ.get(
        "PROPULSE_DUCKDB_MEMORY_LIMIT", compute.get("duckdb_memory_limit", "80GB")
    )
    configured_temp = os.environ.get(
        "PROPULSE_ML_TEMP_ROOT", compute.get("temp_root", "")
    )
    temp_root = Path(configured_temp) if configured_temp else Path("/tmp/propulse-ml")
    if not temp_root.parent.exists():
        temp_root = Path("/tmp/propulse-ml")
    temp = temp_root / ARCHIVE_NAMESPACE / stage
    temp.mkdir(parents=True, exist_ok=True)
    connection.execute("SET TimeZone='UTC'")
    connection.execute(f"SET threads={threads}")
    connection.execute(f"SET memory_limit='{memory_limit}'")
    connection.execute("SET preserve_insertion_order=false")
    connection.execute(f"SET temp_directory='{temp}'")
    return temp


def sha256(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    if path.is_dir():
        digest = hashlib.sha256()
        for child in sorted(value for value in path.rglob("*") if value.is_file()):
            digest.update(str(child.relative_to(path)).encode("utf-8"))
            digest.update(b"\0")
            digest.update(sha256(child, chunk_size).encode("ascii"))
            digest.update(b"\n")
        return digest.hexdigest()
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
