from __future__ import annotations

import tempfile
import unittest
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import httpx

from propagation_archive.datasets import DATASETS
from propagation_archive.benchmark import _bounded_range, _percentile
from propagation_archive.cost import GIB, build_cost_forecast
from propagation_archive.cli import _validation_database_url
from propagation_archive.fixtures import AT, FIXTURES, run_fixture_gate
from propagation_archive.parquet import export_partition, verify_parquet
from propagation_archive.reconcile import reconcile_inventory
from propagation_archive.storage import (
    StorageObject,
    SupabaseArchiveStorage,
    direct_storage_origin,
)
from propagation_archive.worker import archive_partition, object_path, validate_partition


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260719000000_propagation_archive_foundation.sql"
FORECAST_MIGRATION = ROOT / "supabase/migrations/20260719001000_propagation_forecast_lifecycle.sql"
COST_MIGRATION = ROOT / "supabase/migrations/20260719002000_propagation_cost_operations.sql"
PRUNE = ROOT / "collector/src/aggregator/prune.ts"


class FakeCursor:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.offset = 0
        self.itersize = 0
        self.parameters: tuple[object, ...] | None = None

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, _: str, parameters: tuple[object, ...]) -> None:
        self.parameters = parameters

    def fetchmany(self, size: int) -> list[dict[str, object]]:
        result = self.rows[self.offset:self.offset + size]
        self.offset += len(result)
        return result


class FakeConnection:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.cursor_name: str | None = None

    def cursor(self, *, name: str, row_factory: object) -> FakeCursor:
        del row_factory
        self.cursor_name = name
        return FakeCursor(self.rows)


class ArchiveFoundationTests(unittest.TestCase):
    def test_restore_cli_rejects_the_source_database_as_validation_target(self) -> None:
        source = "postgresql://worker:secret@db.internal:5432/propulse"
        with patch.dict(os.environ, {
            "DATABASE_URL": source,
            "ARCHIVE_VALIDATION_DATABASE_URL": source,
        }):
            with self.assertRaisesRegex(RuntimeError, "isolated database"):
                _validation_database_url()
        with patch.dict(os.environ, {
            "DATABASE_URL": source,
            "ARCHIVE_VALIDATION_DATABASE_URL": (
                "postgresql://worker:secret@validation.internal:5432/propulse_restore"
            ),
        }):
            self.assertIn("validation.internal", _validation_database_url())

    def test_railway_archive_jobs_have_independent_one_shot_schedules(self) -> None:
        expected = {
            "railway.json": ("run-due", "15 * * * *"),
            "railway.reconcile.json": ("reconcile", "10 3 * * *"),
            "railway.restore.json": ("restore-due", "0 4 * * 0"),
            "railway.health.json": ("health", "*/15 * * * *"),
            "railway.report.json": ("report --include-exact-rates", "30 4 * * 1"),
        }
        for filename, (command, schedule) in expected.items():
            config = json.loads((ROOT / "archive-worker" / filename).read_text())
            self.assertIn(command, config["deploy"]["startCommand"])
            self.assertEqual(config["deploy"]["cronSchedule"], schedule)
            self.assertEqual(config["deploy"]["restartPolicyType"], "NEVER")

    def test_benchmark_ranges_and_percentiles_are_bounded(self) -> None:
        start = datetime(2026, 7, 1, tzinfo=timezone.utc)
        self.assertEqual(_bounded_range(start, start + timedelta(hours=48)), (start, start + timedelta(hours=48)))
        self.assertEqual(_percentile([1.0, 2.0, 3.0], 0.5), 2.0)
        with self.assertRaises(ValueError):
            _bounded_range(start, start + timedelta(hours=49))

    def test_cost_forecast_is_source_backed_and_explicit_when_complete(self) -> None:
        inputs = {
            "storage_report": {
                "id": "report-1",
                "database_bytes": 10 * GIB,
                "relations": {
                    "spot_history_v1": {
                        "total_bytes": 4 * GIB,
                        "estimated_rows": 4_000_000,
                        "exact_rows_last_7_days": 7_000_000,
                    },
                },
            },
            "datasets": [{"dataset": "spot_history_v1", "hot_seconds": 172_800}],
            "manifests": [{
                "dataset": "spot_history_v1",
                "lifecycle_class": "ordinary",
                "total_object_bytes": GIB,
                "object_bytes_last_30_days": GIB,
                "rows_last_30_days": 1_000_000,
            }],
        }
        forecast, assumptions = build_cost_forecast(
            inputs,
            scale_factor=10,
            provisioned_database_bytes=12 * GIB,
            database_disk_limit_bytes=16 * GIB,
        )
        self.assertTrue(forecast["complete"])
        self.assertIsNotNone(forecast["scaled"]["database_bytes"])
        self.assertEqual(assumptions["ordinary_object_retention_days"], 90)

    def test_five_parquet_zstd_fixtures_round_trip(self) -> None:
        receipts = run_fixture_gate()
        self.assertEqual(len(receipts), 5)
        self.assertEqual(
            {receipt["dataset"] for receipt in receipts}, set(FIXTURES)
        )
        for receipt in receipts:
            self.assertTrue(receipt["checks"]["parquet_read_verified"])
            self.assertEqual(receipt["rows"], 1)

    def test_compact_wspr_archive_schema_round_trips_nested_arrays(self) -> None:
        dataset = DATASETS["wspr_path_features_compact_v1"]
        row = {
            "id": "00000000-0000-0000-0000-000000000001",
            "target_hour": AT,
            "band": "20m",
            "tx_grid4": "FN20",
            "provider": "fixture",
            "transform_version": "fixture-v1",
            "available_at": AT + timedelta(hours=1),
            "source_watermark": AT + timedelta(hours=1),
            "rx_grid4s": ["EM10", "IO91"],
            "success_rates": [0.1, 0.2],
            "successes": [1.0, 2.0],
            "opportunities": [10.0, 10.0],
            "sampled_rows": [2, 3],
            "positive_rows": [1, 1],
            "cell_quality_flags": "[[], [\"coverage_low\"]]",
            "created_at": AT,
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "compact.parquet.zst"
            stats = export_partition(
                FakeConnection([row]),  # type: ignore[arg-type]
                dataset,
                AT,
                AT + timedelta(hours=1),
                path,
                batch_rows=1_000,
                row_group_rows=1_000,
            )
            checks = verify_parquet(
                path,
                dataset,
                expected_rows=1,
                expected_sha256=stats.content_sha256,
                expected_min_time=AT,
                expected_max_time=AT,
                expected_source_counts={"fixture": 1},
            )
        self.assertTrue(checks["parquet_read_verified"])

    def test_archive_registry_excludes_consent_controlled_participant_rows(self) -> None:
        relations = {dataset.source_relation for dataset in DATASETS.values()}
        self.assertTrue({
            "public.propagation_predictions",
            "public.propagation_attempts",
            "public.propagation_outcomes",
            "public.ml_research_consents",
        }.isdisjoint(relations))

    def test_streaming_export_uses_bounded_batches_and_explicit_schema(self) -> None:
        dataset = DATASETS["spot_history_v1"]
        rows = []
        for index in range(2_501):
            row = dict(FIXTURES[dataset.name])
            row["id"] = index + 1
            rows.append(row)
        connection = FakeConnection(rows)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "spots.parquet.zst"
            stats = export_partition(
                connection, dataset, AT, AT + timedelta(days=1), path,
                batch_rows=1_000, row_group_rows=1_000,
            )
            self.assertEqual(stats.row_count, 2_501)
            self.assertEqual(stats.batches, 3)
            self.assertGreater(stats.uncompressed_bytes, 0)
            self.assertTrue(connection.cursor_name.startswith("archive_"))
            result = verify_parquet(
                path, dataset, expected_rows=stats.row_count,
                expected_sha256=stats.content_sha256,
                expected_min_time=AT, expected_max_time=AT,
                expected_source_counts={"pskreporter": 2_501},
            )
            self.assertTrue(result["aggregate_reconciliation_verified"])

    def test_partitions_and_paths_are_aligned_and_identity_free(self) -> None:
        dataset = DATASETS["wspr_observations_v1"]
        start = datetime(2026, 7, 1, 3, tzinfo=timezone.utc)
        self.assertEqual(
            validate_partition(dataset, start, start + timedelta(hours=1)),
            (start, start + timedelta(hours=1)),
        )
        path = object_path(dataset, start, "a" * 64)
        self.assertEqual(
            path,
            "wspr_observations_v1/schema=1/year=2026/month=07/day=01/"
            "hour=03/part-" + "a" * 64 + ".parquet.zst",
        )
        self.assertNotIn("@", path)
        with self.assertRaises(ValueError):
            validate_partition(dataset, start, start + timedelta(hours=2))

    def test_open_partition_fails_before_database_or_storage_access(self) -> None:
        dataset = DATASETS["wspr_observations_v1"]
        start = datetime(2026, 7, 19, 18, tzinfo=timezone.utc)
        with self.assertRaisesRegex(RuntimeError, "closed boundary"):
            archive_partition(
                None,  # type: ignore[arg-type]
                None,  # type: ignore[arg-type]
                dataset,
                start,
                start + timedelta(hours=1),
                exporter_commit="a" * 40,
                now=start + timedelta(hours=1, minutes=10),
            )

    def test_storage_origin_accepts_only_supabase_https_projects(self) -> None:
        self.assertEqual(
            direct_storage_origin("https://abcdefghijklmnopqrst.supabase.co"),
            "https://abcdefghijklmnopqrst.storage.supabase.co",
        )
        with self.assertRaises(RuntimeError):
            direct_storage_origin("http://localhost:54321")

    def test_storage_inventory_walks_folders_without_exposing_a_public_url(self) -> None:
        requests: list[dict[str, object]] = []

        def handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content)
            requests.append(payload)
            if payload["prefix"] == "":
                return httpx.Response(200, json=[{"name": "spot_history_v1", "metadata": None}])
            return httpx.Response(200, json=[{"name": "part-a.parquet.zst", "metadata": {"size": 12}}])

        client = httpx.Client(transport=httpx.MockTransport(handler))
        storage = SupabaseArchiveStorage(
            "https://abcdefghijklmnopqrst.supabase.co", "s" * 40, client=client
        )
        self.assertEqual(
            storage.list_objects(),
            [StorageObject("spot_history_v1/part-a.parquet.zst", 12)],
        )
        self.assertEqual([item["prefix"] for item in requests], ["", "spot_history_v1"])
        client.close()

    def test_tus_upload_retries_transient_chunk_failures_with_backoff(self) -> None:
        patch_attempts = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal patch_attempts
            if request.method == "POST":
                return httpx.Response(201, headers={"location": "https://uploads.example/tus/1"})
            if request.method == "HEAD":
                return httpx.Response(200, headers={"Upload-Offset": "0"})
            if request.method == "PATCH":
                patch_attempts += 1
                if patch_attempts == 1:
                    return httpx.Response(503, text="retry")
                return httpx.Response(
                    204,
                    headers={"Upload-Offset": str(len(b"archive-bytes"))},
                )
            raise AssertionError(f"unexpected request: {request.method} {request.url}")

        client = httpx.Client(transport=httpx.MockTransport(handler))
        storage = SupabaseArchiveStorage(
            "https://abcdefghijklmnopqrst.supabase.co", "s" * 40, client=client
        )
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "archive.parquet.zst"
            source.write_bytes(b"archive-bytes")
            with (
                patch.object(storage, "ensure_private_bucket"),
                patch.object(storage, "verify", side_effect=(False, True)),
                patch("propagation_archive.storage.time.sleep") as sleep,
            ):
                storage.upload(source, "dataset/archive.parquet.zst")
        self.assertEqual(patch_attempts, 2)
        sleep.assert_called_once_with(3)
        client.close()

    def test_reconciliation_reports_missing_orphaned_and_mismatched_objects(self) -> None:
        class Database:
            recorded: dict[str, object] | None = None

            def manifest_inventory(self) -> list[dict[str, object]]:
                return [
                    {"object_path": "a", "object_bytes": 10},
                    {"object_path": "b", "object_bytes": 20},
                    {"object_path": "d", "object_bytes": 40},
                ]

            def record_reconciliation(self, **values: object) -> str:
                self.recorded = values
                return "receipt-1"

        class Storage:
            def list_objects(self) -> list[StorageObject]:
                return [StorageObject("a", 10), StorageObject("c", 30), StorageObject("d", 41)]

        database = Database()
        result = reconcile_inventory(database, Storage())
        self.assertFalse(result["passed"])
        self.assertEqual(result["missing_paths"], ["b"])
        self.assertEqual(result["orphan_paths"], ["c"])
        self.assertEqual(result["size_mismatches"][0]["path"], "d")
        self.assertFalse(result["object_deletion_attempted"])

    def test_migration_is_private_bounded_and_fail_closed(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("'propagation-archives'", sql)
        self.assertIn("public = false", sql)
        self.assertGreaterEqual(sql.count("default false"), 4)
        self.assertIn("unique (dataset, schema_version, range_start, range_end)", sql)
        self.assertIn("manifest.status not in ('sealed', 'restored')", sql)
        self.assertIn("dataset.restore_gate_passed_at is null", sql)
        self.assertIn("limit $3", sql)
        self.assertIn("for update skip locked", sql)
        self.assertIn("remote_sha256_verified", sql)
        self.assertIn("parquet_read_verified", sql)
        self.assertIn("source rows no longer reconcile with sealed manifest", sql)
        self.assertIn("all five phase 1 dataset restore gates must pass", sql)
        self.assertIn("a fresh passing object inventory reconciliation", sql)
        self.assertIn("archive schema version is not registered", sql)
        self.assertIn("archive range is not one aligned registered partition", sql)
        self.assertIn("remaining_eligible_estimate", sql)
        self.assertIn("duration_ms", sql)
        for table in (
            "propagation_archive_manifests",
            "propagation_archive_lifecycle_audit",
            "propagation_archive_restore_receipts",
            "propagation_storage_reports",
            "propagation_archive_reconciliations",
        ):
            self.assertIn(f"alter table public.{table} enable row level security", sql)
            self.assertIn(f"revoke all on public.{table} from public, anon, authenticated", sql)

    def test_forecast_payload_compaction_is_separately_fail_closed(self) -> None:
        sql = FORECAST_MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("forecast_payload_compaction_enabled boolean not null default false", sql)
        self.assertIn("object_deletion_enabled boolean not null default false", sql)
        self.assertIn("check (not object_deletion_enabled)", sql)
        self.assertIn("archive_forecast_compaction_enabled is false", sql)
        self.assertIn("raw_payload = null", sql)
        self.assertIn("raw_bytes_retained_in_private_object", sql)
        self.assertIn("revoke select on public.space_weather_forecast_payloads", sql)
        self.assertIn("alter table public.propagation_archive_lifecycle_controls enable row level security", sql)
        self.assertIn("create table if not exists public.propagation_archive_replica_receipts", sql)
        self.assertIn("signature text not null", sql)
        self.assertIn("locked evidence requires an audited hold reference", sql)
        self.assertIn("check (not object_deletion_enabled)", sql)

    def test_cost_forecasts_are_private_durable_receipts(self) -> None:
        sql = COST_MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("create table if not exists public.propagation_cost_forecasts", sql)
        self.assertIn("source_storage_report_id uuid not null", sql)
        self.assertIn("alter table public.propagation_cost_forecasts enable row level security", sql)
        self.assertIn("revoke all on public.propagation_cost_forecasts from public, anon, authenticated", sql)

    def test_collector_has_no_direct_historical_delete(self) -> None:
        source = PRUNE.read_text(encoding="utf-8")
        self.assertIn("!config.archive.pruningEnabled", source)
        self.assertIn("!config.archive.forecastCompactionEnabled", source)
        self.assertIn("run_propagation_retention_maintenance", source)
        for table in ("spot_history", "solar_snapshots", "collector_health", "satellite_tle"):
            self.assertNotIn(f'.from("{table}")', source)


if __name__ == "__main__":
    unittest.main()
