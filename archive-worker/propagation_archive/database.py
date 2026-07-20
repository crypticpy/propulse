"""Database contract for manifests, reconciliation, locks, and restore receipts."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterator
from uuid import UUID

import psycopg
from psycopg import sql
from psycopg.pq import TransactionStatus
from psycopg.rows import dict_row

from .datasets import Dataset
from .parquet import ArchiveStats


def _qualified(name: str) -> sql.Composed:
    schema, relation = name.split(".", 1)
    return sql.SQL("{}.{}").format(sql.Identifier(schema), sql.Identifier(relation))


class ArchiveDatabase:
    def __init__(self, database_url: str) -> None:
        if not database_url:
            raise RuntimeError("DATABASE_URL is required")
        self.connection = psycopg.connect(
            database_url,
            autocommit=False,
            connect_timeout=15,
            application_name="propulse-propagation-archive-worker",
            row_factory=dict_row,
        )

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "ArchiveDatabase":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    @contextmanager
    def partition_lock(
        self, dataset: Dataset, range_start: datetime, range_end: datetime
    ) -> Iterator[None]:
        key = f"archive:{dataset.name}:{range_start.isoformat()}:{range_end.isoformat()}"
        row = self.connection.execute(
            "SELECT pg_try_advisory_lock(hashtextextended(%s, 0)) AS locked",
            (key,),
        ).fetchone()
        self.connection.commit()
        if not row or not row["locked"]:
            raise RuntimeError("archive partition is already locked by another worker")
        try:
            yield
        finally:
            try:
                if self.connection.info.transaction_status == TransactionStatus.INERROR:
                    self.connection.rollback()
                self.connection.execute(
                    "SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (key,)
                )
                self.connection.commit()
            except Exception:
                self.connection.rollback()
                raise

    def assert_archive_enabled(self, dataset: Dataset) -> None:
        row = self.connection.execute(
            """
            SELECT controls.archive_enabled AS global_enabled,
                   datasets.archive_enabled AS dataset_enabled,
                   datasets.source_relation,
                   datasets.time_column,
                   datasets.key_column,
                   datasets.schema_version,
                   datasets.time_basis,
                   datasets.partition_granularity
            FROM public.propagation_archive_controls AS controls
            JOIN public.propagation_archive_datasets AS datasets ON controls.singleton
            WHERE datasets.dataset = %s
            """,
            (dataset.name,),
        ).fetchone()
        self.connection.rollback()
        if not row:
            raise RuntimeError(f"archive dataset is not registered: {dataset.name}")
        expected = (
            dataset.source_relation,
            dataset.time_column,
            dataset.key_column,
            dataset.schema_version,
            dataset.time_basis,
            dataset.granularity,
        )
        actual = tuple(
            row[key]
            for key in (
                "source_relation", "time_column", "key_column",
                "schema_version", "time_basis", "partition_granularity",
            )
        )
        if actual != expected:
            raise RuntimeError("database dataset contract differs from worker code")
        if not row["global_enabled"] or not row["dataset_enabled"]:
            raise RuntimeError("archive export is disabled by database controls")

    def enabled_dataset_names(self) -> list[str]:
        rows = self.connection.execute(
            """
            SELECT datasets.dataset
            FROM public.propagation_archive_datasets AS datasets
            JOIN public.propagation_archive_controls AS controls ON controls.singleton
            WHERE controls.archive_enabled AND datasets.archive_enabled
            ORDER BY datasets.dataset
            """
        ).fetchall()
        self.connection.rollback()
        return [row["dataset"] for row in rows]

    def existing_manifest(
        self, dataset: Dataset, range_start: datetime, range_end: datetime
    ) -> dict[str, Any] | None:
        row = self.connection.execute(
            """
            SELECT * FROM public.propagation_archive_manifests
            WHERE dataset = %s AND schema_version = %s
              AND range_start = %s AND range_end = %s
            """,
            (dataset.name, dataset.schema_version, range_start, range_end),
        ).fetchone()
        self.connection.rollback()
        return dict(row) if row else None

    def source_summary(
        self, dataset: Dataset, range_start: datetime, range_end: datetime
    ) -> dict[str, Any]:
        query = sql.SQL(
            "SELECT count(*) AS row_count, min({time}) AS min_source_time, "
            "max({time}) AS max_source_time FROM {relation} "
            "WHERE {time} >= %s AND {time} < %s"
        ).format(
            time=sql.Identifier(dataset.time_column),
            relation=_qualified(dataset.source_relation),
        )
        row = self.connection.execute(query, (range_start, range_end)).fetchone()
        source_counts: dict[str, int] = {}
        if dataset.source_count_column:
            count_query = sql.SQL(
                "SELECT {source}::text AS source, count(*) AS rows "
                "FROM {relation} WHERE {time} >= %s AND {time} < %s "
                "GROUP BY {source} ORDER BY {source}"
            ).format(
                source=sql.Identifier(dataset.source_count_column),
                relation=_qualified(dataset.source_relation),
                time=sql.Identifier(dataset.time_column),
            )
            source_counts = {
                item["source"]: int(item["rows"])
                for item in self.connection.execute(
                    count_query, (range_start, range_end)
                ).fetchall()
            }
        self.connection.rollback()
        return {
            "row_count": int(row["row_count"]),
            "min_source_time": row["min_source_time"],
            "max_source_time": row["max_source_time"],
            "source_counts": source_counts,
        }

    def watermarks_cover(
        self, dataset: Dataset, range_start: datetime, range_end: datetime
    ) -> bool:
        if dataset.watermark_sql is None:
            return True
        if dataset.name in {"spot_history_v1", "path_hourly_stats_v1"}:
            parameters = (range_end,)
        else:
            parameters = (range_start, range_end, range_start, range_end)
        row = self.connection.execute(dataset.watermark_sql, parameters).fetchone()
        self.connection.rollback()
        return bool(next(iter(row.values()))) if row else False

    def register_manifest(
        self,
        dataset: Dataset,
        range_start: datetime,
        range_end: datetime,
        object_path: str,
        stats: ArchiveStats,
        exporter_commit: str,
        lifecycle_class: str,
    ) -> UUID:
        row = self.connection.execute(
            """
            SELECT public.register_propagation_archive_manifest(
              p_dataset => %s,
              p_schema_version => %s,
              p_range_start => %s,
              p_range_end => %s,
              p_object_path => %s,
              p_row_count => %s,
              p_min_source_time => %s,
              p_max_source_time => %s,
              p_source_counts => %s::jsonb,
              p_content_sha256 => %s,
              p_uncompressed_bytes => %s,
              p_object_bytes => %s,
              p_exporter_commit => %s,
              p_quality_flags => '{}'::text[],
              p_lifecycle_class => %s
            ) AS id
            """,
            (
                dataset.name, dataset.schema_version, range_start, range_end,
                object_path, stats.row_count, stats.min_source_time,
                stats.max_source_time, psycopg.types.json.Jsonb(stats.source_counts),
                stats.content_sha256, stats.uncompressed_bytes,
                stats.object_bytes, exporter_commit, lifecycle_class,
            ),
        ).fetchone()
        self.connection.commit()
        return row["id"]

    def verify_manifest(self, manifest_id: UUID, verification: dict[str, object]) -> None:
        self.connection.execute(
            "SELECT public.verify_propagation_archive_manifest(%s, %s::jsonb)",
            (manifest_id, psycopg.types.json.Jsonb(verification)),
        )
        self.connection.commit()

    def seal_manifest(self, manifest_id: UUID) -> None:
        self.connection.execute(
            "SELECT public.seal_propagation_archive_manifest(%s)", (manifest_id,)
        )
        self.connection.commit()

    def fail_manifest(self, manifest_id: UUID, reason: str) -> None:
        try:
            self.connection.execute(
                "SELECT public.fail_propagation_archive_manifest(%s, %s)",
                (manifest_id, reason[:2000]),
            )
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def manifest(self, manifest_id: UUID) -> dict[str, Any]:
        row = self.connection.execute(
            "SELECT * FROM public.propagation_archive_manifests WHERE id = %s",
            (manifest_id,),
        ).fetchone()
        self.connection.rollback()
        if not row:
            raise RuntimeError("archive manifest not found")
        return dict(row)

    def restore_due_manifest_ids(
        self,
        *,
        now: datetime,
        cadence: timedelta,
        limit: int,
    ) -> list[UUID]:
        if cadence < timedelta(days=1) or cadence > timedelta(days=365):
            raise ValueError("restore cadence must be between 1 and 365 days")
        if limit < 1 or limit > 100:
            raise ValueError("restore due limit must be between 1 and 100")
        rows = self.connection.execute(
            """
            WITH latest AS (
              SELECT DISTINCT ON (manifest.dataset)
                manifest.id, manifest.dataset, manifest.sealed_at
              FROM public.propagation_archive_manifests AS manifest
              WHERE manifest.status IN ('sealed', 'restored')
                AND manifest.sealed_at IS NOT NULL
                AND cardinality(manifest.quality_flags) = 0
              ORDER BY manifest.dataset, manifest.sealed_at DESC
            )
            SELECT latest.id
            FROM latest
            WHERE NOT EXISTS (
              SELECT 1
              FROM public.propagation_archive_restore_receipts AS receipt
              WHERE receipt.manifest_id = latest.id
                AND receipt.passed
                AND receipt.restored_at >= greatest(
                  latest.sealed_at, %s - %s::interval
                )
            )
            ORDER BY latest.dataset
            LIMIT %s
            """,
            (now, cadence, limit),
        ).fetchall()
        self.connection.rollback()
        return [row["id"] for row in rows]

    def record_restore(
        self,
        manifest_id: UUID,
        *,
        validation_target: str,
        restored_rows: int,
        restored_sha256: str,
        details: dict[str, object],
        signature: str | None,
    ) -> UUID:
        row = self.connection.execute(
            """
            SELECT public.record_propagation_archive_restore(
              %s, %s, %s, %s, true, true, true, true, %s::jsonb, %s
            ) AS id
            """,
            (
                manifest_id, validation_target, restored_rows, restored_sha256,
                psycopg.types.json.Jsonb(details), signature,
            ),
        ).fetchone()
        self.connection.commit()
        return row["id"]

    def capture_storage_report(self, include_exact_rates: bool) -> UUID:
        row = self.connection.execute(
            "SELECT public.capture_propagation_storage_report(%s) AS id",
            (include_exact_rates,),
        ).fetchone()
        self.connection.commit()
        return row["id"]

    def retention_inventory(self) -> dict[str, object]:
        row = self.connection.execute(
            "SELECT public.get_propagation_retention_inventory() AS inventory"
        ).fetchone()
        self.connection.rollback()
        return row["inventory"]

    def archive_health(self, now: datetime) -> dict[str, object]:
        row = self.connection.execute(
            "SELECT public.get_propagation_archive_health(%s) AS health",
            (now,),
        ).fetchone()
        self.connection.rollback()
        return row["health"]

    def manifest_inventory(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT id, dataset, object_path, object_bytes, content_sha256, status
            FROM public.propagation_archive_manifests
            UNION ALL
            SELECT null::uuid AS id,
                   'forecast_payload_bytes_v1' AS dataset,
                   source_object_path AS object_path,
                   source_object_bytes AS object_bytes,
                   source_object_sha256 AS content_sha256,
                   'verified' AS status
            FROM public.space_weather_forecast_payloads
            WHERE source_object_path IS NOT NULL
            ORDER BY object_path
            """
        ).fetchall()
        self.connection.rollback()
        return [dict(row) for row in rows]

    def record_reconciliation(
        self,
        *,
        manifest_count: int,
        storage_object_count: int,
        missing_paths: list[str],
        orphan_paths: list[str],
        size_mismatches: list[dict[str, object]],
        details: dict[str, object],
    ) -> UUID:
        row = self.connection.execute(
            """
            SELECT public.record_propagation_archive_reconciliation(
              %s, %s, %s::text[], %s::text[], %s::jsonb, %s::jsonb
            ) AS id
            """,
            (
                manifest_count, storage_object_count, missing_paths, orphan_paths,
                psycopg.types.json.Jsonb(size_mismatches),
                psycopg.types.json.Jsonb(details),
            ),
        ).fetchone()
        self.connection.commit()
        return row["id"]

    def cost_inputs(self) -> dict[str, Any]:
        report = self.connection.execute(
            """
            SELECT * FROM public.propagation_storage_reports
            WHERE include_exact_rates
            ORDER BY captured_at DESC LIMIT 1
            """
        ).fetchone()
        if not report:
            self.connection.rollback()
            raise RuntimeError("capture an exact-rate storage report before forecasting cost")
        datasets = self.connection.execute(
            """
            SELECT dataset, extract(epoch FROM hot_retention) AS hot_seconds
            FROM public.propagation_archive_datasets ORDER BY dataset
            """
        ).fetchall()
        manifests = self.connection.execute(
            """
            SELECT dataset, lifecycle_class,
                   sum(object_bytes)::bigint AS total_object_bytes,
                   sum(object_bytes) FILTER (
                     WHERE sealed_at >= now() - interval '30 days'
                   )::bigint AS object_bytes_last_30_days,
                   sum(row_count) FILTER (
                     WHERE sealed_at >= now() - interval '30 days'
                   )::bigint AS rows_last_30_days
            FROM public.propagation_archive_manifests
            WHERE status IN ('sealed', 'restored')
            GROUP BY dataset, lifecycle_class
            ORDER BY dataset, lifecycle_class
            """
        ).fetchall()
        self.connection.rollback()
        return {
            "storage_report": dict(report),
            "datasets": [dict(row) for row in datasets],
            "manifests": [dict(row) for row in manifests],
        }

    def record_cost_forecast(
        self,
        *,
        storage_report_id: UUID,
        pricing_as_of: date,
        scale_factor: float,
        forecast: dict[str, object],
        assumptions: dict[str, object],
    ) -> UUID:
        row = self.connection.execute(
            """
            SELECT public.record_propagation_cost_forecast(
              %s, %s, %s::numeric, %s::jsonb, %s::jsonb
            ) AS id
            """,
            (
                storage_report_id, pricing_as_of, scale_factor,
                psycopg.types.json.Jsonb(forecast),
                psycopg.types.json.Jsonb(assumptions),
            ),
        ).fetchone()
        self.connection.commit()
        return row["id"]

    def set_lifecycle_class(
        self,
        manifest_id: UUID,
        lifecycle_class: str,
        reason: str,
        reference: str,
    ) -> None:
        self.connection.execute(
            "SELECT public.set_propagation_archive_lifecycle_class(%s, %s, %s, %s)",
            (manifest_id, lifecycle_class, reason, reference),
        )
        self.connection.commit()

    def record_replica(
        self,
        *,
        manifest_id: UUID,
        target_label: str,
        replica_locator_sha256: str,
        content_sha256: str,
        object_bytes: int,
        signature: str,
        details: dict[str, object],
    ) -> UUID:
        row = self.connection.execute(
            """
            SELECT public.record_propagation_archive_replica(
              %s, %s, %s, %s, %s, true, %s, %s::jsonb
            ) AS id
            """,
            (
                manifest_id, target_label, replica_locator_sha256,
                content_sha256, object_bytes, signature,
                psycopg.types.json.Jsonb(details),
            ),
        ).fetchone()
        self.connection.commit()
        return row["id"]

    def replica_health(self, now: datetime) -> dict[str, object]:
        row = self.connection.execute(
            "SELECT public.get_propagation_archive_replica_health(%s) AS health",
            (now,),
        ).fetchone()
        self.connection.rollback()
        return row["health"]

    def oldest_source_time(self, dataset: Dataset) -> datetime | None:
        query = sql.SQL("SELECT min({time}) AS oldest FROM {relation}").format(
            time=sql.Identifier(dataset.time_column),
            relation=_qualified(dataset.source_relation),
        )
        row = self.connection.execute(query).fetchone()
        self.connection.rollback()
        return row["oldest"]

    def manifest_exists(
        self, dataset: Dataset, range_start: datetime, range_end: datetime
    ) -> bool:
        row = self.connection.execute(
            """
            SELECT EXISTS (
              SELECT 1 FROM public.propagation_archive_manifests
              WHERE dataset = %s AND schema_version = %s
                AND range_start = %s AND range_end = %s
                AND status IN ('uploading', 'verified', 'sealed', 'restored')
            ) AS present
            """,
            (dataset.name, dataset.schema_version, range_start, range_end),
        ).fetchone()
        self.connection.rollback()
        return bool(row["present"])


def floor_partition(value: datetime, granularity: str) -> datetime:
    value = value.astimezone(timezone.utc)
    if granularity == "hour":
        return value.replace(minute=0, second=0, microsecond=0)
    if granularity == "day":
        return value.replace(hour=0, minute=0, second=0, microsecond=0)
    if granularity == "month":
        return value.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    raise ValueError(f"unsupported partition granularity: {granularity}")


def next_partition(value: datetime, granularity: str) -> datetime:
    if granularity == "hour":
        return value + timedelta(hours=1)
    if granularity == "day":
        return value + timedelta(days=1)
    if granularity == "month":
        year = value.year + (1 if value.month == 12 else 0)
        month = 1 if value.month == 12 else value.month + 1
        return value.replace(year=year, month=month, day=1)
    raise ValueError(f"unsupported partition granularity: {granularity}")


def closed_boundary(now: datetime, granularity: str, settle_minutes: int = 20) -> datetime:
    now = now.astimezone(timezone.utc)
    boundary = floor_partition(now, granularity)
    if granularity == "hour" and now < boundary + timedelta(minutes=settle_minutes):
        return boundary - timedelta(hours=1)
    return boundary
