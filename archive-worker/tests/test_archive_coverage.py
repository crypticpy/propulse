from __future__ import annotations

import tempfile
import unittest
import hashlib
import json
from contextlib import contextmanager
from unittest.mock import patch
from uuid import UUID
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from psycopg.rows import dict_row
import pyarrow as pa
import pyarrow.parquet as pq

from propagation_archive.coverage import PARQUET_COVERAGE_KEY, canonical_coverage
from propagation_archive.datasets import DATASETS
from propagation_archive.database import ArchiveDatabase
from propagation_archive.fixtures import FIXTURES
from propagation_archive.parquet import export_partition, verify_parquet
from propagation_archive.replica import verify_replica
from propagation_archive.restore import restore_manifest
from propagation_archive.storage import sha256_file
from propagation_archive.worker import archive_partition


START = datetime(2026, 7, 1, tzinfo=timezone.utc)
END = datetime(2026, 8, 1, tzinfo=timezone.utc)


def evidence(gaps: list[dict[str, str]] | None = None) -> dict[str, object]:
    return {
        "version": 1,
        "scope": "known-gaps-only",
        "range_start": "2026-07-01T00:00:00.000000Z",
        "range_end": "2026-08-01T00:00:00.000000Z",
        "gaps": gaps or [],
    }


class Cursor:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows
        self.read = False
        self.itersize = 0

    def __enter__(self) -> Cursor:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, _: str, parameters: tuple[object, ...]) -> None:
        del parameters

    def fetchmany(self, _: int) -> list[dict[str, object]]:
        if self.read:
            return []
        self.read = True
        return self.rows


class Connection:
    def cursor(self, *, name: str, row_factory: object) -> Cursor:
        del name
        self.assert_row_factory(row_factory)
        return Cursor([dict(FIXTURES["path_hourly_stats_v1"])])

    @staticmethod
    def assert_row_factory(value: object) -> None:
        if value is not dict_row:
            raise AssertionError("unexpected row factory")


class ArchiveCoverageTests(unittest.TestCase):
    def test_path_archive_embeds_and_verifies_canonical_coverage(self) -> None:
        dataset = DATASETS["path_hourly_stats_v1"]
        snapshot = evidence([{
            "start_hour": "2026-06-30T23:00:00.000000Z",
            "end_hour": "2026-07-01T01:00:00.000000Z",
            "recorded_at": "2026-09-08T00:00:00.000001Z",
            "reason": "raw_expired",
        }])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "path.parquet.zst"
            stats = export_partition(
                Connection(), dataset, START, END, path,  # type: ignore[arg-type]
                batch_rows=1_000, row_group_rows=1_000,
                coverage_evidence=snapshot,
            )
            checks = verify_parquet(
                path, dataset, expected_rows=1,
                expected_sha256=stats.content_sha256,
                expected_min_time=START, expected_max_time=START,
                expected_source_counts={"20m": 1},
                expected_coverage_evidence=snapshot,
                expected_range_start=START, expected_range_end=END,
            )
            self.assertTrue(checks["coverage_metadata_verified"])
            self.assertEqual(checks["coverage_evidence"], snapshot)
            changed = evidence([])
            with self.assertRaisesRegex(RuntimeError, "differs from manifest"):
                verify_parquet(
                    path, dataset, expected_rows=1,
                    expected_sha256=stats.content_sha256,
                    expected_min_time=START, expected_max_time=START,
                    expected_source_counts={"20m": 1},
                    expected_coverage_evidence=changed,
                    expected_range_start=START, expected_range_end=END,
                )

    def test_unknown_contract_and_noncanonical_gaps_fail_closed(self) -> None:
        dataset = replace(
            DATASETS["path_hourly_stats_v1"], coverage_contract="future-v1"
        )
        with self.assertRaisesRegex(RuntimeError, "unsupported"):
            canonical_coverage(evidence(), dataset.coverage_contract or "", START, END)
        duplicate = evidence([
            {
                "start_hour": "2026-07-01T00:00:00.000000Z",
                "end_hour": "2026-07-01T01:00:00.000000Z",
                "recorded_at": "2026-09-08T00:00:00.000000Z",
                "reason": "raw_expired",
            },
            {
                "start_hour": "2026-07-01T00:00:00.000000Z",
                "end_hour": "2026-07-01T02:00:00.000000Z",
                "recorded_at": "2026-09-08T00:00:01.000000Z",
                "reason": "raw_expired",
            },
        ])
        with self.assertRaisesRegex(RuntimeError, "not canonical"):
            canonical_coverage(duplicate, "spot-known-gaps-v1", START, END)
        malformed = evidence()
        malformed["version"] = True
        with self.assertRaisesRegex(RuntimeError, "invalid shape"):
            canonical_coverage(malformed, "spot-known-gaps-v1", START, END)
        with self.assertRaisesRegex(RuntimeError, "partition range is invalid"):
            canonical_coverage(evidence(), "spot-known-gaps-v1", END, START)

    def test_database_registry_coverage_contract_must_match_worker(self) -> None:
        dataset = DATASETS["path_hourly_stats_v1"]

        class Result:
            @staticmethod
            def fetchone() -> dict[str, object]:
                return {
                    "global_enabled": True, "dataset_enabled": True,
                    "source_relation": dataset.source_relation,
                    "time_column": dataset.time_column,
                    "key_column": dataset.key_column,
                    "schema_version": dataset.schema_version,
                    "time_basis": dataset.time_basis,
                    "partition_granularity": dataset.granularity,
                    "coverage_contract": None,
                }

        class DbConnection:
            def execute(self, *_: object) -> Result:
                return Result()

            def rollback(self) -> None:
                return None

        database = ArchiveDatabase.__new__(ArchiveDatabase)
        database.connection = DbConnection()  # type: ignore[assignment]
        with self.assertRaisesRegex(RuntimeError, "contract differs"):
            database.assert_archive_enabled(dataset)

    def test_parquet_rejects_noncanonical_embedded_version(self) -> None:
        dataset = DATASETS["path_hourly_stats_v1"]
        malformed = {**evidence(), "version": True}
        schema = dataset.schema.with_metadata({
            PARQUET_COVERAGE_KEY: json.dumps(
                malformed, sort_keys=True, separators=(",", ":")
            ).encode(),
        })
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "malformed.parquet.zst"
            pq.write_table(
                pa.Table.from_pylist(
                    [dict(FIXTURES["path_hourly_stats_v1"])], schema=schema
                ),
                path,
                compression="zstd",
            )
            with self.assertRaisesRegex(RuntimeError, "invalid shape"):
                verify_parquet(
                    path, dataset, expected_rows=1,
                    expected_sha256=sha256_file(path),
                    expected_min_time=START, expected_max_time=START,
                    expected_source_counts={"20m": 1},
                    expected_coverage_evidence=evidence(),
                    expected_range_start=START, expected_range_end=END,
                )

    def test_replica_reconciles_and_passes_coverage_to_parquet_verifier(self) -> None:
        snapshot = evidence()
        payload = b"fixture archive"
        digest = hashlib.sha256(payload).hexdigest()
        manifest_id = UUID("00000000-0000-0000-0000-000000000001")

        class Database:
            def manifest(self, _: UUID) -> dict[str, object]:
                return {
                    "dataset": "path_hourly_stats_v1", "schema_version": 1,
                    "lifecycle_class": "research_locked", "range_start": START,
                    "range_end": END, "content_sha256": digest,
                    "object_bytes": len(payload), "row_count": 1,
                    "min_source_time": START, "max_source_time": START,
                    "source_counts": {"20m": 1}, "coverage_evidence": snapshot,
                }

            def reconcile_coverage(self, _: UUID) -> dict[str, object]:
                return snapshot

            def record_replica(self, **_: object) -> UUID:
                return manifest_id

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "replica.parquet.zst"
            path.write_bytes(payload)
            with patch(
                "propagation_archive.replica.verify_parquet",
                return_value={"coverage_metadata_verified": True,
                              "coverage_evidence": snapshot},
            ) as verifier:
                verify_replica(
                    Database(), manifest_id, path, target_label="fixture",
                    receipt_hmac_key="a" * 32,
                )  # type: ignore[arg-type]
        self.assertEqual(
            verifier.call_args.kwargs["expected_coverage_evidence"], snapshot
        )
        self.assertEqual(verifier.call_args.kwargs["expected_range_start"], START)
        self.assertEqual(verifier.call_args.kwargs["expected_range_end"], END)

    def test_worker_rejects_changed_snapshot_before_register_or_upload(self) -> None:
        dataset = DATASETS["path_hourly_stats_v1"]
        first = evidence()
        second = evidence([{
            "start_hour": "2026-07-01T00:00:00.000000Z",
            "end_hour": "2026-07-01T01:00:00.000000Z",
            "recorded_at": "2026-09-08T00:00:00.000000Z",
            "reason": "raw_expired",
        }])

        class Database:
            connection = Connection()
            snapshots = [first, second]
            registered = False

            def assert_archive_enabled(self, _: object) -> None: pass

            @contextmanager
            def partition_lock(self, *_: object):
                yield

            def existing_manifest(self, *_: object) -> None: return None
            def watermarks_cover(self, *_: object) -> bool: return True
            def source_summary(self, *_: object) -> dict[str, object]:
                return {"row_count": 1, "min_source_time": START,
                        "max_source_time": START, "source_counts": {"20m": 1}}
            def coverage_snapshot(self, *_: object) -> dict[str, object]:
                return self.snapshots.pop(0)
            def register_manifest(self, *_: object) -> None:
                self.registered = True

        class Storage:
            uploaded = False
            def upload(self, *_: object) -> None: self.uploaded = True

        database = Database()
        storage = Storage()
        with self.assertRaisesRegex(RuntimeError, "coverage evidence changed"):
            archive_partition(
                database, storage, dataset, START, END,  # type: ignore[arg-type]
                exporter_commit="a" * 40,
                now=datetime(2026, 9, 1, tzinfo=timezone.utc),
            )
        self.assertFalse(database.registered)
        self.assertFalse(storage.uploaded)

    def test_worker_sealed_manifest_reconciliation_failure_precedes_storage(self) -> None:
        dataset = DATASETS["path_hourly_stats_v1"]

        class Database:
            def assert_archive_enabled(self, _: object) -> None: pass
            @contextmanager
            def partition_lock(self, *_: object): yield
            def existing_manifest(self, *_: object) -> dict[str, object]:
                return {"id": UUID(int=1), "status": "sealed",
                        "object_path": "archive", "object_bytes": 1,
                        "content_sha256": "a" * 64, "row_count": 1}
            def reconcile_coverage(self, _: UUID) -> None:
                raise RuntimeError("legacy or stale archive coverage")

        class Storage:
            verified = False
            def verify(self, *_: object) -> bool:
                self.verified = True
                return True

        storage = Storage()
        with self.assertRaisesRegex(RuntimeError, "legacy or stale"):
            archive_partition(
                Database(), storage, dataset, START, END,  # type: ignore[arg-type]
                exporter_commit="a" * 40,
                now=datetime(2026, 9, 1, tzinfo=timezone.utc),
            )
        self.assertFalse(storage.verified)

    def test_restore_stale_coverage_precedes_storage_and_validation_database(self) -> None:
        manifest_id = UUID(int=1)

        class Database:
            def manifest(self, _: UUID) -> dict[str, object]:
                return {"status": "sealed", "dataset": "path_hourly_stats_v1",
                        "schema_version": 1, "coverage_evidence": evidence(),
                        "range_start": START, "range_end": END}
            def reconcile_coverage(self, _: UUID) -> None:
                raise RuntimeError("archive coverage evidence is stale")

        class Storage:
            downloaded = False
            def download(self, *_: object) -> None: self.downloaded = True

        storage = Storage()
        with patch("propagation_archive.restore.psycopg.connect") as connect:
            with self.assertRaisesRegex(RuntimeError, "coverage evidence is stale"):
                restore_manifest(
                    Database(), storage, manifest_id,  # type: ignore[arg-type]
                    validation_database_url="postgresql://validation",
                    validation_target_label="fixture",
                )
            connect.assert_not_called()
        self.assertFalse(storage.downloaded)

    def test_replica_stale_coverage_precedes_receipt(self) -> None:
        manifest_id = UUID(int=1)

        class Database:
            recorded = False
            def manifest(self, _: UUID) -> dict[str, object]:
                return {"dataset": "path_hourly_stats_v1", "schema_version": 1,
                        "lifecycle_class": "research_locked",
                        "coverage_evidence": evidence(), "range_start": START,
                        "range_end": END}
            def reconcile_coverage(self, _: UUID) -> None:
                raise RuntimeError("archive coverage evidence is stale")
            def record_replica(self, **_: object) -> None: self.recorded = True

        database = Database()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "replica"
            path.write_bytes(b"unused")
            with self.assertRaisesRegex(RuntimeError, "coverage evidence is stale"):
                verify_replica(
                    database, manifest_id, path, target_label="fixture",
                    receipt_hmac_key="a" * 32,
                )  # type: ignore[arg-type]
        self.assertFalse(database.recorded)


if __name__ == "__main__":
    unittest.main()
