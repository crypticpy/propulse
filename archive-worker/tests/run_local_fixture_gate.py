#!/usr/bin/env python3
"""Run required and WSPR-migration restore gates against local Supabase."""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from propagation_archive.database import ArchiveDatabase
from propagation_archive.datasets import DATASETS
from propagation_archive.reconcile import reconcile_inventory
from propagation_archive.restore import restore_manifest
from propagation_archive.storage import StorageObject, sha256_file
from propagation_archive.worker import archive_partition


UTC = timezone.utc
AT = datetime(2025, 1, 1, tzinfo=UTC)
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DATASET_RANGES = {
    "spot_history_v1": (AT, AT + timedelta(days=1)),
    "wspr_observations_v1": (AT, AT + timedelta(hours=1)),
    "solar_snapshots_v1": (AT, datetime(2025, 2, 1, tzinfo=UTC)),
    "path_hourly_stats_v1": (AT, datetime(2025, 2, 1, tzinfo=UTC)),
    "forecast_payloads_v1": (AT, datetime(2025, 2, 1, tzinfo=UTC)),
    "wspr_path_features_v1": (AT, AT + timedelta(hours=1)),
    "wspr_path_features_compact_v1": (AT, AT + timedelta(hours=1)),
}


class FilesystemArchiveStorage:
    """Non-production storage double preserving immutable object semantics."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, object_path: str) -> Path:
        if object_path.startswith("/") or ".." in Path(object_path).parts:
            raise RuntimeError("unsafe fixture object path")
        return self.root / object_path

    def upload(self, source: Path, object_path: str) -> None:
        target = self._path(object_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            if sha256_file(target) != sha256_file(source):
                raise RuntimeError("fixture attempted to overwrite an immutable object")
            return
        shutil.copyfile(source, target)
        target.chmod(0o600)

    def verify(self, object_path: str, expected_bytes: int, expected_sha256: str) -> bool:
        target = self._path(object_path)
        if not target.exists():
            return False
        if target.stat().st_size != expected_bytes or sha256_file(target) != expected_sha256:
            raise RuntimeError("fixture object differs from its manifest")
        return True

    def download(self, object_path: str, target: Path) -> tuple[int, str]:
        source = self._path(object_path)
        shutil.copyfile(source, target)
        target.chmod(0o600)
        return target.stat().st_size, sha256_file(target)

    def list_objects(self) -> list[StorageObject]:
        return [
            StorageObject(path.relative_to(self.root).as_posix(), path.stat().st_size)
            for path in sorted(self.root.rglob("*.parquet.zst"))
        ]


def _assert_disposable_local(database_url: str, confirmed: bool) -> None:
    parsed = urlparse(database_url)
    if not confirmed or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError(
            "the fixture gate requires --confirm-disposable-local-database and a loopback URL"
        )


def _seed(database_url: str) -> None:
    with psycopg.connect(database_url, autocommit=False) as connection:
        existing = connection.execute(
            "SELECT count(*) FROM public.propagation_archive_manifests"
        ).fetchone()[0]
        if existing:
            raise RuntimeError("fixture gate requires a freshly reset local database")

        connection.execute(
            """
            INSERT INTO public.spot_history (
              source, spotted_at, ingested_at, available_at,
              tx_callsign, tx_grid, tx_lat, tx_lon,
              rx_callsign, rx_grid, rx_lat, rx_lon,
              frequency_khz, band, mode, snr, continent
            ) VALUES (
              'pskreporter', %s, %s, %s,
              'FIXTURE1', 'FN20', 40, -75,
              'FIXTURE2', 'EM10', 30, -97,
              14074, '20m', 'FT8', -10, 'NA'
            )
            """,
            (AT, AT, AT),
        )
        connection.execute(
            """
            INSERT INTO public.wspr_observations_rolling (
              source, source_id, observation_key_sha256, event_time,
              received_at, slot_epoch, target_hour, band, tx_call, tx_grid4,
              rx_call, rx_grid4, power_bin_dbm, snr_db, ingest_version
            ) VALUES (
              'wsprnet', 'archive-fixture-1', %s, %s,
              %s, 1, %s, '20m', 'FIXTURE1', 'FN20',
              'FIXTURE2', 'EM10', 30, -12, 'archive-fixture-v1'
            )
            """,
            ("c" * 64, AT, AT, AT),
        )
        connection.execute(
            """
            INSERT INTO public.wspr_feature_watermarks (
              target_hour, band, provider, transform_version, status,
              source_watermark, available_at, observation_count,
              feature_cell_count, quality_flags
            ) VALUES (
              %s, '20m', 'wsprnet', 'archive-fixture-v1', 'complete',
              %s, %s, 1, 1, '{}'
            )
            """,
            (AT, AT + timedelta(hours=1), AT + timedelta(hours=1)),
        )
        connection.execute(
            """
            INSERT INTO public.wspr_path_hourly_features (
              target_hour, band, tx_grid4, rx_grid4, successes,
              opportunities, success_rate, sampled_rows, positive_rows,
              available_at, source_watermark, provider,
              transform_version, quality_flags
            ) VALUES (
              %s, '20m', 'FN20', 'EM10', 1, 10, 0.1, 2, 1,
              %s, %s, 'wsprnet', 'archive-fixture-v1', '{}'
            )
            """,
            (AT, AT + timedelta(hours=1), AT + timedelta(hours=1)),
        )
        connection.execute(
            "SELECT public.ensure_wspr_compact_partitions(%s, %s)",
            (AT, AT + timedelta(hours=1)),
        )
        connection.execute(
            """
            INSERT INTO public.wspr_path_hourly_compact_v1 (
              target_hour, band, tx_grid4, provider, transform_version,
              available_at, source_watermark, rx_grid4s, success_rates,
              successes, opportunities, sampled_rows, positive_rows,
              cell_quality_flags
            ) VALUES (
              %s, '20m', 'FN20', 'wsprnet', 'archive-fixture-v1',
              %s, %s, ARRAY['EM10'], ARRAY[0.1]::double precision[],
              ARRAY[1.0]::double precision[],
              ARRAY[10.0]::double precision[], ARRAY[2], ARRAY[1], %s
            )
            """,
            (
                AT,
                AT + timedelta(hours=1),
                AT + timedelta(hours=1),
                Jsonb([[]]),
            ),
        )
        connection.execute(
            """
            INSERT INTO public.path_hourly_stats (
              hour_utc, band, mode_class, tx_field, rx_field,
              spot_count, unique_tx, unique_rx, avg_snr, median_snr,
              backfilled_count
            ) VALUES (%s, '20m', 'digital', 'FN', 'EM', 2, 1, 1, -10, -10, 0)
            """,
            (AT,),
        )
        connection.execute(
            """
            INSERT INTO public.solar_snapshots (
              captured_at, kp_index, sfi, bz_gsm, by_gsm, bt,
              solar_wind_speed, sunspot_number, xray_flux,
              proton_flux_10mev, dst_index, solar_wind_density, bx_gsm,
              solar_wind_temperature, source_observed_at, source_status
            ) VALUES (
              %s, 2, 120, -1, 0.5, 5, 400, 80, 0.0000001,
              0.1, -5, 4, 1, 100000, %s, %s
            )
            """,
            (AT, Jsonb({}), Jsonb({})),
        )
        connection.execute(
            """
            INSERT INTO public.space_weather_forecast_payloads (
              payload_sha256, source, product, issued_at, ingested_at,
              parser_version, source_url, raw_payload, created_at
            ) VALUES (
              %s, 'noaa', '45-day', %s, %s, 'archive-fixture-v1',
              'https://example.invalid/archive-fixture', %s, %s
            )
            """,
            ("d" * 64, AT, AT, Jsonb({"fixture": True}), AT),
        )
        connection.execute(
            """
            INSERT INTO public.collector_aggregation_watermarks (
              aggregation, hour_utc, rows_written, available_at, updated_at
            ) VALUES
              ('band_hourly', %s, 1, %s, %s),
              ('path_hourly', %s, 1, %s, %s)
            ON CONFLICT (aggregation) DO UPDATE SET
              hour_utc = excluded.hour_utc,
              rows_written = excluded.rows_written,
              available_at = excluded.available_at,
              updated_at = excluded.updated_at
            """,
            (
                datetime(2025, 1, 31, 23, tzinfo=UTC), AT, AT,
                datetime(2025, 1, 31, 23, tzinfo=UTC), AT, AT,
            ),
        )
        connection.execute(
            "SELECT public.set_propagation_archive_controls(true, false, %s)",
            ("Disposable local Phase 1 fixture gate",),
        )
        for dataset_name in DATASET_RANGES:
            connection.execute(
                "SELECT public.set_propagation_archive_dataset_controls(%s, true, false, %s)",
                (dataset_name, "Disposable local Phase 1 fixture gate"),
            )
        connection.commit()


def run_gate(database_url: str) -> dict[str, object]:
    _seed(database_url)
    archives: list[dict[str, object]] = []
    restores: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory() as directory:
        storage = FilesystemArchiveStorage(Path(directory))
        with ArchiveDatabase(database_url) as database:
            for name, (range_start, range_end) in DATASET_RANGES.items():
                archive = archive_partition(
                    database,
                    storage,  # type: ignore[arg-type]
                    DATASETS[name],
                    range_start,
                    range_end,
                    exporter_commit="a" * 40,
                    now=datetime(2026, 7, 19, tzinfo=UTC),
                )
                archives.append(archive)
                restores.append(restore_manifest(
                    database,
                    storage,  # type: ignore[arg-type]
                    UUID(archive["manifest_id"]),
                    validation_database_url=database_url,
                    validation_target_label="disposable-local-fixture",
                    receipt_hmac_key="local-fixture-signing-key-" + "x" * 32,
                ))
            reconciliation = reconcile_inventory(
                database,
                storage,  # type: ignore[arg-type]
            )
            row = database.connection.execute(
                """
                SELECT count(*) AS passed
                FROM public.propagation_archive_datasets
                WHERE dataset = ANY(%s::text[]) AND restore_gate_passed_at IS NOT NULL
                """,
                (list(DATASET_RANGES),),
            ).fetchone()
            database.connection.rollback()
    if not reconciliation["passed"] or row["passed"] != len(DATASET_RANGES):
        raise RuntimeError("Phase 1 fixture reconciliation did not pass")
    return {
        "status": "passed",
        "datasets": list(DATASET_RANGES),
        "archives": archives,
        "restores": restores,
        "reconciliation": reconciliation,
        "restore_gates_passed": row["passed"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=DEFAULT_DATABASE_URL)
    parser.add_argument("--confirm-disposable-local-database", action="store_true")
    args = parser.parse_args()
    _assert_disposable_local(args.database_url, args.confirm_disposable_local_database)
    print(json.dumps(run_gate(args.database_url), indent=2, default=str))


if __name__ == "__main__":
    main()
