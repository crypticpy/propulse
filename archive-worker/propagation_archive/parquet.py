"""Bounded-memory Parquet/Zstandard export and verification."""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
import pyarrow as pa
import pyarrow.parquet as pq
from psycopg.rows import dict_row

from .datasets import Dataset
from .coverage import PARQUET_COVERAGE_KEY, canonical_coverage, coverage_bytes, coverage_from_metadata
from .storage import sha256_file


@dataclass(frozen=True)
class ArchiveStats:
    path: Path
    row_count: int
    min_source_time: datetime | None
    max_source_time: datetime | None
    source_counts: dict[str, int]
    content_sha256: str
    uncompressed_bytes: int
    object_bytes: int
    batches: int


def _query(dataset: Dataset) -> str:
    return f"""
SELECT {dataset.select_sql}
FROM {dataset.source_relation}
WHERE {dataset.time_column} >= %s
  AND {dataset.time_column} < %s
ORDER BY {dataset.time_column}, {dataset.key_column}
"""


def export_partition(
    connection: psycopg.Connection[Any],
    dataset: Dataset,
    range_start: datetime,
    range_end: datetime,
    output: Path,
    *,
    batch_rows: int = 10_000,
    row_group_rows: int = 50_000,
    coverage_evidence: object | None = None,
) -> ArchiveStats:
    if not 1_000 <= batch_rows <= 100_000:
        raise ValueError("batch_rows must be between 1,000 and 100,000")
    if not 1_000 <= row_group_rows <= 1_000_000:
        raise ValueError("row_group_rows must be between 1,000 and 1,000,000")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + f".partial-{os.getpid()}")
    temporary.unlink(missing_ok=True)
    writer: pq.ParquetWriter | None = None
    row_count = 0
    batches = 0
    uncompressed_bytes = 0
    min_source_time: datetime | None = None
    max_source_time: datetime | None = None
    source_counts: dict[str, int] = {}
    cursor_name = "archive_" + hashlib.sha256(
        f"{dataset.name}:{range_start.isoformat()}".encode()
    ).hexdigest()[:20]

    try:
        write_schema = dataset.schema
        if dataset.coverage_contract:
            if coverage_evidence is None:
                raise RuntimeError("coverage evidence is required for this dataset")
            canonical = canonical_coverage(
                coverage_evidence, dataset.coverage_contract, range_start, range_end
            )
            metadata = dict(write_schema.metadata or {})
            metadata[PARQUET_COVERAGE_KEY] = coverage_bytes(canonical)
            write_schema = write_schema.with_metadata(metadata)
        elif coverage_evidence is not None:
            raise RuntimeError("coverage evidence supplied for a dataset without a contract")
        writer = pq.ParquetWriter(
            temporary,
            write_schema,
            compression="zstd",
            use_dictionary=True,
            write_statistics=True,
        )
        with connection.cursor(name=cursor_name, row_factory=dict_row) as cursor:
            cursor.itersize = batch_rows
            cursor.execute(_query(dataset), (range_start, range_end))
            while rows := cursor.fetchmany(batch_rows):
                records = list(rows)
                table = pa.Table.from_pylist(records, schema=dataset.schema)
                writer.write_table(table, row_group_size=row_group_rows)
                batches += 1
                row_count += table.num_rows
                uncompressed_bytes += table.nbytes
                for row in records:
                    source_time = row[dataset.time_column]
                    if source_time.tzinfo is None:
                        source_time = source_time.replace(tzinfo=timezone.utc)
                    source_time = source_time.astimezone(timezone.utc)
                    if min_source_time is None or source_time < min_source_time:
                        min_source_time = source_time
                    if max_source_time is None or source_time > max_source_time:
                        max_source_time = source_time
                    if dataset.source_count_column:
                        key = str(row[dataset.source_count_column])
                        source_counts[key] = source_counts.get(key, 0) + 1
        writer.close()
        writer = None
        temporary.chmod(0o600)
        temporary.replace(output)
        output.chmod(0o600)
    except Exception:
        if writer is not None:
            writer.close()
        temporary.unlink(missing_ok=True)
        raise

    return ArchiveStats(
        path=output,
        row_count=row_count,
        min_source_time=min_source_time,
        max_source_time=max_source_time,
        source_counts=dict(sorted(source_counts.items())),
        content_sha256=sha256_file(output),
        uncompressed_bytes=uncompressed_bytes,
        object_bytes=output.stat().st_size,
        batches=batches,
    )


def verify_parquet(
    path: Path,
    dataset: Dataset,
    *,
    expected_rows: int,
    expected_sha256: str,
    expected_min_time: datetime | None,
    expected_max_time: datetime | None,
    expected_source_counts: dict[str, int],
    expected_coverage_evidence: object | None = None,
    expected_range_start: datetime | None = None,
    expected_range_end: datetime | None = None,
) -> dict[str, object]:
    if sha256_file(path) != expected_sha256:
        raise RuntimeError("Parquet SHA-256 differs from manifest")
    parquet = pq.ParquetFile(path)
    if not parquet.schema_arrow.equals(dataset.schema, check_metadata=False):
        raise RuntimeError("Parquet schema differs from the versioned dataset schema")
    embedded = coverage_from_metadata(parquet.schema_arrow.metadata)
    if dataset.coverage_contract:
        if expected_coverage_evidence is None:
            raise RuntimeError("coverage evidence is required for this dataset")
        if expected_range_start is None or expected_range_end is None:
            raise RuntimeError("coverage partition bounds are required")
        expected = canonical_coverage(
            expected_coverage_evidence, dataset.coverage_contract,
            expected_range_start, expected_range_end,
        )
        embedded_canonical = canonical_coverage(
            embedded, dataset.coverage_contract,
            expected_range_start, expected_range_end,
        )
        raw_metadata = (parquet.schema_arrow.metadata or {}).get(
            PARQUET_COVERAGE_KEY
        )
        if (
            embedded_canonical != expected
            or raw_metadata != coverage_bytes(expected)
        ):
            raise RuntimeError("Parquet coverage evidence differs from manifest")
    elif embedded is not None or expected_coverage_evidence is not None:
        raise RuntimeError("unexpected Parquet coverage evidence")
    if parquet.metadata.num_rows != expected_rows:
        raise RuntimeError("Parquet row count differs from manifest")

    rows = 0
    min_time: datetime | None = None
    max_time: datetime | None = None
    source_counts: dict[str, int] = {}
    columns = [dataset.time_column]
    if dataset.source_count_column:
        columns.append(dataset.source_count_column)
    for batch in parquet.iter_batches(batch_size=65_536, columns=columns):
        values = batch.to_pylist()
        rows += len(values)
        for row in values:
            value = row[dataset.time_column]
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            value = value.astimezone(timezone.utc)
            min_time = value if min_time is None or value < min_time else min_time
            max_time = value if max_time is None or value > max_time else max_time
            if dataset.source_count_column:
                key = str(row[dataset.source_count_column])
                source_counts[key] = source_counts.get(key, 0) + 1
    if rows != expected_rows:
        raise RuntimeError("Parquet batch read count differs from manifest")
    if min_time != expected_min_time or max_time != expected_max_time:
        raise RuntimeError("Parquet source-time bounds differ from manifest")
    if dict(sorted(source_counts.items())) != dict(sorted(expected_source_counts.items())):
        raise RuntimeError("Parquet aggregate counts differ from manifest")
    return {
        "parquet_read_verified": True,
        "row_count_verified": True,
        "source_bounds_verified": True,
        "aggregate_reconciliation_verified": True,
        "coverage_metadata_verified": dataset.coverage_contract is not None,
        "coverage_evidence": embedded,
        "row_groups": parquet.num_row_groups,
    }
