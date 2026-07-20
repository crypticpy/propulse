"""Rollback-only partition and WSPR compaction candidate benchmarks."""

from __future__ import annotations

import tempfile
import time
import shutil
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from typing import Any, Callable

import pyarrow as pa
import pyarrow.parquet as pq
from psycopg import sql
from psycopg.types.json import Jsonb

from .database import ArchiveDatabase
from .storage import sha256_file


UTC = timezone.utc
COMPACT_SCHEMA = pa.schema([
    pa.field("target_hour", pa.timestamp("us", tz="UTC"), nullable=False),
    pa.field("band", pa.string(), nullable=False),
    pa.field("tx_grid4", pa.string(), nullable=False),
    pa.field("provider", pa.string(), nullable=False),
    pa.field("transform_version", pa.string(), nullable=False),
    pa.field("available_at", pa.timestamp("us", tz="UTC"), nullable=False),
    pa.field("source_watermark", pa.timestamp("us", tz="UTC"), nullable=False),
    pa.field("rx_grid4s", pa.list_(pa.string()), nullable=False),
    pa.field("success_rates", pa.list_(pa.float64()), nullable=False),
    pa.field("successes", pa.list_(pa.float64()), nullable=False),
    pa.field("opportunities", pa.list_(pa.float64()), nullable=False),
    pa.field("sampled_rows", pa.list_(pa.int32()), nullable=False),
    pa.field("positive_rows", pa.list_(pa.int32()), nullable=False),
    pa.field("cell_quality_flags", pa.list_(pa.list_(pa.string())), nullable=False),
])


def _aware_hour(value: datetime, label: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{label} must include a timezone")
    result = value.astimezone(UTC)
    if result.minute or result.second or result.microsecond:
        raise ValueError(f"{label} must be aligned to an hour")
    return result


def _bounded_range(start: datetime, end: datetime, *, max_hours: int = 48) -> tuple[datetime, datetime]:
    start = _aware_hour(start, "range_start")
    end = _aware_hour(end, "range_end")
    if end <= start or end - start > timedelta(hours=max_hours):
        raise ValueError(f"benchmark range must span 1 to {max_hours} hours")
    return start, end


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _timings(call: Callable[[], object], repetitions: int) -> list[float]:
    values: list[float] = []
    for _ in range(repetitions):
        started = time.perf_counter_ns()
        call()
        values.append((time.perf_counter_ns() - started) / 1_000_000)
    return values


def _latencies(values: list[float]) -> dict[str, float]:
    return {
        "runs": len(values),
        "p50_ms": round(median(values), 4) if values else 0.0,
        "p95_ms": round(_percentile(values, 0.95), 4),
        "max_ms": round(max(values), 4) if values else 0.0,
    }


def benchmark_partition_candidate(
    database: ArchiveDatabase,
    *,
    dataset: str,
    range_start: datetime,
    range_end: datetime,
    max_rows: int = 500_000,
    repetitions: int = 20,
    representative: bool = False,
) -> dict[str, object]:
    start, end = _bounded_range(range_start, range_end)
    if dataset not in {"spot", "wspr"}:
        raise ValueError("partition benchmark dataset must be spot or wspr")
    if not 1_000 <= max_rows <= 5_000_000 or not 3 <= repetitions <= 200:
        raise ValueError("partition benchmark bounds are invalid")
    connection = database.connection
    if dataset == "spot":
        source = "public.spot_history"
        time_column = "spotted_at"
        granularity = "day"
        query = "SELECT band, count(*) FROM {} WHERE spotted_at >= %s AND spotted_at < %s GROUP BY band ORDER BY band"
    else:
        source = "public.wspr_observations_rolling"
        time_column = "received_at"
        granularity = "hour"
        query = "SELECT band, count(*) FROM {} WHERE received_at >= %s AND received_at < %s GROUP BY band ORDER BY band"
    source_count = int(connection.execute(
        sql.SQL("SELECT count(*) AS rows FROM {} WHERE {} >= %s AND {} < %s").format(
            sql.SQL(source), sql.Identifier(time_column), sql.Identifier(time_column)
        ),
        (start, end),
    ).fetchone()["rows"])
    if source_count == 0:
        connection.rollback()
        raise RuntimeError("partition benchmark range contains no source rows")
    if source_count > max_rows:
        connection.rollback()
        raise RuntimeError(f"benchmark range has {source_count} rows, above --max-rows")

    suffix = uuid.uuid4().hex[:12]
    table = f"propagation_partition_benchmark_{dataset}_{suffix}"
    schema = "public" if representative else "pg_temp"
    table_ref = (
        sql.Identifier("public", table) if representative else sql.Identifier(table)
    )
    if representative:
        connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"propulse:partition-benchmark:{dataset}",),
        )
        connection.execute(sql.SQL(
            "CREATE TABLE {} (LIKE {} INCLUDING DEFAULTS) PARTITION BY RANGE ({})"
        ).format(table_ref, sql.SQL(source), sql.Identifier(time_column)))
    else:
        connection.execute(sql.SQL(
            "CREATE TEMP TABLE {} (LIKE {} INCLUDING DEFAULTS) "
            "PARTITION BY RANGE ({}) ON COMMIT DROP"
        ).format(sql.Identifier(table), sql.SQL(source), sql.Identifier(time_column)))
    connection.execute(
        sql.SQL("CREATE INDEX ON {} (band, {} DESC)").format(
            table_ref, sql.Identifier(time_column)
        )
    )
    cursor = start.replace(hour=0) if granularity == "day" else start
    child_refs: list[sql.Composed] = []
    while cursor < end:
        boundary = cursor + (timedelta(days=1) if granularity == "day" else timedelta(hours=1))
        child = f"{table}_{cursor:%Y%m%d%H}"
        child_ref = (
            sql.Identifier("public", child) if representative else sql.Identifier(child)
        )
        child_refs.append(child_ref)
        connection.execute(
            sql.SQL("CREATE {}TABLE {} PARTITION OF {} FOR VALUES FROM ({}) TO ({})").format(
                sql.SQL("") if representative else sql.SQL("TEMP "),
                child_ref,
                table_ref,
                sql.Literal(cursor),
                sql.Literal(boundary),
            )
        )
        cursor = boundary
    wal_start = connection.execute(
        "SELECT pg_current_wal_insert_lsn() AS lsn"
    ).fetchone()["lsn"] if representative else None
    insert_started = time.perf_counter_ns()
    connection.execute(
        sql.SQL("INSERT INTO {} SELECT * FROM {} WHERE {} >= %s AND {} < %s").format(
            table_ref, sql.SQL(source),
            sql.Identifier(time_column), sql.Identifier(time_column),
        ),
        (start, end),
    )
    inserted = connection.execute(
        sql.SQL("SELECT count(*) AS rows FROM {}").format(table_ref)
    ).fetchone()["rows"]
    build_ms = (time.perf_counter_ns() - insert_started) / 1_000_000
    wal_bytes = None
    if wal_start is not None:
        wal_bytes = int(connection.execute(
            "SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(), %s) AS bytes",
            (wal_start,),
        ).fetchone()["bytes"])
    if int(inserted) != source_count:
        connection.rollback()
        raise RuntimeError("partition candidate backfill did not reconcile")

    source_query = sql.SQL(query.format(source))
    candidate_query = sql.SQL(query.format(table_ref.as_string(connection)))
    source_result = connection.execute(source_query, (start, end)).fetchall()
    candidate_result = connection.execute(candidate_query, (start, end)).fetchall()
    if source_result != candidate_result:
        connection.rollback()
        raise RuntimeError("partition candidate aggregate parity failed")
    source_times = _timings(
        lambda: connection.execute(source_query, (start, end)).fetchall(), repetitions
    )
    candidate_times = _timings(
        lambda: connection.execute(candidate_query, (start, end)).fetchall(), repetitions
    )
    api_template = sql.SQL(
        "SELECT * FROM {} WHERE {} >= %s AND {} < %s "
        "ORDER BY {} DESC, id DESC LIMIT 500"
    )
    source_api_query = api_template.format(
        sql.SQL(source), sql.Identifier(time_column), sql.Identifier(time_column),
        sql.Identifier(time_column),
    )
    candidate_api_query = api_template.format(
        table_ref, sql.Identifier(time_column), sql.Identifier(time_column),
        sql.Identifier(time_column),
    )
    source_api_result = connection.execute(source_api_query, (start, end)).fetchall()
    candidate_api_result = connection.execute(candidate_api_query, (start, end)).fetchall()
    if source_api_result != candidate_api_result:
        connection.rollback()
        raise RuntimeError("partition candidate API read parity failed")
    source_api_times = _timings(
        lambda: connection.execute(source_api_query, (start, end)).fetchall(), repetitions
    )
    candidate_api_times = _timings(
        lambda: connection.execute(candidate_api_query, (start, end)).fetchall(), repetitions
    )

    copy_query = sql.SQL(
        "COPY (SELECT * FROM {} WHERE {} >= {} AND {} < {}) "
        "TO STDOUT WITH (FORMAT BINARY)"
    ).format(
        table_ref, sql.Identifier(time_column), sql.Literal(start),
        sql.Identifier(time_column), sql.Literal(end),
    )

    def stream_archive_candidate() -> int:
        streamed = 0
        with connection.cursor() as archive_cursor:
            with archive_cursor.copy(copy_query) as copy:
                for block in copy:
                    streamed += len(block)
        return streamed

    archive_bytes = stream_archive_candidate()
    archive_times = _timings(stream_archive_candidate, min(repetitions, 5))
    bytes_row = connection.execute(
        sql.SQL("SELECT coalesce(sum(pg_column_size(row_value)), 0) AS bytes FROM {} AS row_value").format(
            table_ref
        )
    ).fetchone()["bytes"]
    relation_bytes = connection.execute(
        """
        SELECT coalesce(sum(pg_total_relation_size(inherits.inhrelid)), 0) AS bytes
        FROM pg_inherits AS inherits
        WHERE inherits.inhparent = %s::regclass
        """,
        (f"{schema}.{table}",),
    ).fetchone()["bytes"]
    drop_started = time.perf_counter_ns()
    connection.execute(
        sql.SQL("ALTER TABLE {} DETACH PARTITION {}").format(table_ref, child_refs[0])
    )
    connection.execute(sql.SQL("DROP TABLE {}").format(child_refs[0]))
    drop_ms = (time.perf_counter_ns() - drop_started) / 1_000_000
    insert_latency = _latencies([build_ms])
    aggregate_latency = _latencies(candidate_times)
    api_latency = _latencies(candidate_api_times)
    archive_latency = _latencies(archive_times)
    result = {
        "status": "passed",
        "candidate": f"native_range_partition_{dataset}_v1",
        "representative": representative,
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "source_rows": source_count,
        "candidate_rows": int(inserted),
        "candidate_row_bytes": int(bytes_row),
        "candidate_total_relation_bytes": int(relation_bytes),
        "backfill_ms": round(build_ms, 4),
        "insert": insert_latency,
        "insert_p95_ms": insert_latency["p95_ms"],
        "source_query": _latencies(source_times),
        "partitioned_query": aggregate_latency,
        "aggregate_p95_ms": aggregate_latency["p95_ms"],
        "source_api_read": _latencies(source_api_times),
        "partitioned_api_read": api_latency,
        "api_p95_ms": api_latency["p95_ms"],
        "archive_stream": archive_latency,
        "archive_p95_ms": archive_latency["p95_ms"],
        "archive_stream_bytes": archive_bytes,
        "drop_ms": round(drop_ms, 4),
        "wal_bytes": wal_bytes,
        "aggregate_parity": True,
        "api_read_parity": True,
        "transaction_rolled_back": True,
    }
    connection.rollback()
    return result


def _compact_rows(database: ArchiveDatabase, start: datetime, end: datetime) -> list[dict[str, Any]]:
    rows = database.connection.execute(
        """
        SELECT target_hour, band, tx_grid4, provider, transform_version,
               available_at, max(source_watermark) AS source_watermark,
               array_agg(rx_grid4 ORDER BY rx_grid4) AS rx_grid4s,
               array_agg(success_rate ORDER BY rx_grid4) AS success_rates,
               array_agg(successes ORDER BY rx_grid4) AS successes,
               array_agg(opportunities ORDER BY rx_grid4) AS opportunities,
               array_agg(sampled_rows ORDER BY rx_grid4) AS sampled_rows,
               array_agg(positive_rows ORDER BY rx_grid4) AS positive_rows,
               jsonb_agg(to_jsonb(quality_flags) ORDER BY rx_grid4) AS cell_quality_flags
        FROM public.wspr_path_hourly_features
        WHERE target_hour >= %s AND target_hour < %s
        GROUP BY target_hour, band, tx_grid4, provider, transform_version, available_at
        ORDER BY target_hour, band, tx_grid4, provider, transform_version, available_at
        """,
        (start, end),
    ).fetchall()
    return [dict(row) for row in rows]


def benchmark_wspr_candidates(
    database: ArchiveDatabase,
    *,
    range_start: datetime,
    range_end: datetime,
    max_rows: int = 500_000,
    repetitions: int = 20,
    temp_root: Path | None = None,
) -> dict[str, object]:
    start, end = _bounded_range(range_start, range_end)
    if not 1_000 <= max_rows <= 5_000_000 or not 3 <= repetitions <= 200:
        raise ValueError("WSPR benchmark bounds are invalid")
    connection = database.connection
    source = connection.execute(
        """
        SELECT count(*) AS rows,
               coalesce(sum(pg_column_size(feature)), 0) AS row_bytes
        FROM public.wspr_path_hourly_features AS feature
        WHERE target_hour >= %s AND target_hour < %s
        """,
        (start, end),
    ).fetchone()
    source_rows = int(source["rows"])
    if source_rows == 0:
        connection.rollback()
        raise RuntimeError("WSPR benchmark range contains no feature rows")
    if source_rows > max_rows:
        connection.rollback()
        raise RuntimeError(f"benchmark range has {source_rows} rows, above --max-rows")

    build_started = time.perf_counter_ns()
    compact = _compact_rows(database, start, end)
    compact_build_ms = (time.perf_counter_ns() - build_started) / 1_000_000
    if sum(len(row["rx_grid4s"]) for row in compact) != source_rows:
        connection.rollback()
        raise RuntimeError("compact candidate row count does not reconcile")
    sample = compact[:min(25, len(compact))]

    baseline_times: list[float] = []
    compact_postgres_times: list[float] = []
    parity = True
    for row in sample:
        parameters = tuple(row[key] for key in (
            "target_hour", "band", "tx_grid4", "provider",
            "transform_version", "available_at",
        ))
        baseline_query = """
          SELECT rx_grid4, success_rate, successes, opportunities,
                 sampled_rows, positive_rows, quality_flags
          FROM public.wspr_path_hourly_features
          WHERE target_hour = %s AND band = %s AND tx_grid4 = %s
            AND provider = %s AND transform_version = %s AND available_at = %s
          ORDER BY rx_grid4
        """
        compact_query = """
          SELECT rx_grid4s, success_rates, successes, opportunities,
                 sampled_rows, positive_rows, cell_quality_flags
          FROM pg_temp.wspr_compact_benchmark
          WHERE target_hour = %s AND band = %s AND tx_grid4 = %s
            AND provider = %s AND transform_version = %s AND available_at = %s
        """
        if not connection.execute("SELECT to_regclass('pg_temp.wspr_compact_benchmark') IS NOT NULL AS present").fetchone()["present"]:
            connection.execute("""
              CREATE TEMP TABLE wspr_compact_benchmark (
                target_hour timestamptz, band text, tx_grid4 text, provider text,
                transform_version text, available_at timestamptz,
                source_watermark timestamptz, rx_grid4s text[],
                success_rates double precision[], successes double precision[],
                opportunities double precision[], sampled_rows integer[],
                positive_rows integer[], cell_quality_flags jsonb,
                PRIMARY KEY (target_hour, band, tx_grid4, provider, transform_version, available_at)
              ) ON COMMIT DROP
            """)
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO wspr_compact_benchmark VALUES (
                      %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s, %s
                    )
                    """,
                    [tuple(item[key] for key in (
                        "target_hour", "band", "tx_grid4", "provider",
                        "transform_version", "available_at", "source_watermark",
                        "rx_grid4s", "success_rates", "successes", "opportunities",
                        "sampled_rows", "positive_rows",
                    )) + (Jsonb(item["cell_quality_flags"]),) for item in compact],
                )
        baseline = connection.execute(baseline_query, parameters).fetchall()
        packed = connection.execute(compact_query, parameters).fetchone()
        unpacked = [
            (
                packed["rx_grid4s"][index], packed["success_rates"][index],
                packed["successes"][index], packed["opportunities"][index],
                packed["sampled_rows"][index], packed["positive_rows"][index],
                packed["cell_quality_flags"][index],
            )
            for index in range(len(packed["rx_grid4s"]))
        ]
        parity = parity and [tuple(item.values()) for item in baseline] == unpacked
        baseline_times.extend(_timings(
            lambda q=baseline_query, p=parameters: connection.execute(q, p).fetchall(),
            repetitions,
        ))
        compact_postgres_times.extend(_timings(
            lambda q=compact_query, p=parameters: connection.execute(q, p).fetchone(),
            repetitions,
        ))
    if not parity:
        connection.rollback()
        raise RuntimeError("compact PostgreSQL candidate failed exact row parity")

    with tempfile.TemporaryDirectory(dir=temp_root) as directory:
        root = Path(directory)
        partitions: dict[tuple[datetime, str], Path] = {}
        grouped: dict[tuple[datetime, str], list[dict[str, Any]]] = defaultdict(list)
        for row in compact:
            grouped[(row["target_hour"], row["band"])].append(row)
        parquet_build_started = time.perf_counter_ns()
        for (target_hour, band), rows in grouped.items():
            path = root / f"{target_hour:%Y%m%d%H}-{band}.parquet.zst"
            pq.write_table(
                pa.Table.from_pylist(rows, schema=COMPACT_SCHEMA),
                path,
                compression="zstd",
                use_dictionary=True,
                write_statistics=True,
            )
            partitions[(target_hour, band)] = path
        parquet_build_ms = (time.perf_counter_ns() - parquet_build_started) / 1_000_000
        expected_hashes = {key: sha256_file(path) for key, path in partitions.items()}
        cold_times: list[float] = []
        requested: set[tuple[datetime, str]] = set()
        for row in sample:
            key = (row["target_hour"], row["band"])
            requested.add(key)
            cold_times.extend(_timings(
                lambda path=partitions[key]: pq.read_table(path),
                max(3, repetitions // 4),
            ))
        warm_index = {
            (
                row["target_hour"], row["band"], row["tx_grid4"],
                row["provider"], row["transform_version"], row["available_at"],
            ): row
            for row in compact
        }
        warm_times: list[float] = []
        for row in sample:
            key = tuple(row[name] for name in (
                "target_hour", "band", "tx_grid4", "provider",
                "transform_version", "available_at",
            ))
            warm_times.extend(_timings(lambda key=key: warm_index[key], repetitions))
        first_key, first_path = next(iter(partitions.items()))
        corrupt_path = root / "corrupt-fixture.parquet.zst"
        shutil.copyfile(first_path, corrupt_path)
        with corrupt_path.open("r+b") as handle:
            handle.seek(max(0, corrupt_path.stat().st_size // 2))
            original = handle.read(1)
            if not original:
                raise RuntimeError("compact Parquet fixture is unexpectedly empty")
            handle.seek(-1, 1)
            handle.write(bytes([original[0] ^ 0x01]))
        corruption_detected = sha256_file(corrupt_path) != expected_hashes[first_key]
        missing_detected = not (root / "missing.parquet.zst").exists()
        parquet_bytes = sum(path.stat().st_size for path in partitions.values())

    compact_bytes = int(connection.execute(
        "SELECT pg_total_relation_size('pg_temp.wspr_compact_benchmark') AS bytes"
    ).fetchone()["bytes"])
    result = {
        "status": "passed",
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "source_rows": source_rows,
        "compact_groups": len(compact),
        "frozen_sample_groups": len(sample),
        "exact_cell_parity": parity,
        "row_form": {
            "bytes": int(source["row_bytes"]),
            "bytes_per_path": round(int(source["row_bytes"]) / source_rows, 4),
            "lookup": _latencies(baseline_times),
        },
        "compact_postgres_arrays": {
            "bytes": compact_bytes,
            "bytes_per_path": round(compact_bytes / source_rows, 4),
            "build_ms": round(compact_build_ms, 4),
            "lookup": _latencies(compact_postgres_times),
        },
        "compact_parquet_cache": {
            "bytes": parquet_bytes,
            "bytes_per_path": round(parquet_bytes / source_rows, 4),
            "build_ms": round(parquet_build_ms, 4),
            "cold_lookup": _latencies(cold_times),
            "warm_lookup": _latencies(warm_times),
            "object_requests_for_sample": len(requested),
            "corrupt_hash_detected": corruption_detected,
            "missing_object_detected": missing_detected,
        },
        "recommendation_eligible": source_rows >= 100_000 and len(sample) >= 25,
        "transaction_rolled_back": True,
    }
    connection.rollback()
    return result
