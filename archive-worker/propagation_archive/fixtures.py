"""Five identity-safe archive/read fixtures required by the Phase 1 gate."""

from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from .datasets import DATASETS
from .parquet import verify_parquet
from .storage import sha256_file


AT = datetime(2026, 7, 1, 0, 0, tzinfo=timezone.utc)

FIXTURES: dict[str, dict[str, object]] = {
    "spot_history_v1": {
        "id": 1, "source": "pskreporter", "spotted_at": AT,
        "ingested_at": AT, "available_at": AT, "tx_callsign": "FIXTURE1",
        "tx_grid": "FN20", "tx_lat": 40.0, "tx_lon": -75.0,
        "rx_callsign": "FIXTURE2", "rx_grid": "EM10", "rx_lat": 30.0,
        "rx_lon": -97.0, "frequency_khz": 14074.0, "band": "20m",
        "mode": "FT8", "snr": -10, "wpm": None, "comment": None,
        "dxcc": None, "continent": "NA",
    },
    "wspr_observations_v1": {
        "id": 1, "source": "wsprnet", "source_id": "fixture-1",
        "observation_key_sha256": "a" * 64, "event_time": AT,
        "received_at": AT, "slot_epoch": 1, "target_hour": AT,
        "band": "20m", "tx_call": "FIXTURE1", "tx_grid4": "FN20",
        "rx_call": "FIXTURE2", "rx_grid4": "EM10", "power_bin_dbm": 30,
        "snr_db": -12.0, "mode": "WSPR", "ingest_version": "fixture-v1",
        "created_at": AT,
    },
    "path_hourly_stats_v1": {
        "id": 1, "hour_utc": AT, "band": "20m", "mode_class": "digital",
        "tx_field": "FN", "rx_field": "EM", "spot_count": 2,
        "unique_tx": 1, "unique_rx": 1, "avg_snr": -10.0,
        "median_snr": -10.0, "backfilled_count": 0,
    },
    "solar_snapshots_v1": {
        "id": 1, "captured_at": AT, "kp_index": 2.0, "sfi": 120.0,
        "bz_gsm": -1.0, "by_gsm": 0.5, "bt": 5.0,
        "solar_wind_speed": 400.0, "sunspot_number": 80.0,
        "xray_flux": 1e-7, "proton_flux_10mev": 0.1, "dst_index": -5.0,
        "solar_wind_density": 4.0, "bx_gsm": 1.0,
        "solar_wind_temperature": 100000.0,
        "source_observed_at": "{}", "source_status": "{}",
    },
    "forecast_payloads_v1": {
        "payload_sha256": "b" * 64, "source": "noaa", "product": "45-day",
        "issued_at": AT, "ingested_at": AT, "parser_version": "fixture-v1",
        "source_url": "https://example.invalid/fixture",
        "raw_payload": "{\"fixture\":true}",
        "source_object_bucket": None, "source_object_path": None,
        "source_object_sha256": None, "source_object_bytes": None,
        "source_object_verified_at": None, "created_at": AT,
    },
}


def run_fixture_gate(root: Path | None = None) -> list[dict[str, object]]:
    receipts: list[dict[str, object]] = []
    manager = tempfile.TemporaryDirectory(dir=root)
    try:
        directory = Path(manager.name)
        for dataset_name, row in FIXTURES.items():
            dataset = DATASETS[dataset_name]
            path = directory / f"{dataset_name}.parquet.zst"
            table = pa.Table.from_pylist([row], schema=dataset.schema)
            pq.write_table(
                table,
                path,
                compression="zstd",
                use_dictionary=True,
                write_statistics=True,
            )
            digest = sha256_file(path)
            source_counts = (
                {str(row[dataset.source_count_column]): 1}
                if dataset.source_count_column else {}
            )
            result = verify_parquet(
                path,
                dataset,
                expected_rows=1,
                expected_sha256=digest,
                expected_min_time=AT,
                expected_max_time=AT,
                expected_source_counts=source_counts,
            )
            receipts.append({
                "dataset": dataset_name,
                "schema_version": dataset.schema_version,
                "rows": 1,
                "sha256": digest,
                "object_bytes": path.stat().st_size,
                "checks": result,
            })
    finally:
        manager.cleanup()
    return receipts
