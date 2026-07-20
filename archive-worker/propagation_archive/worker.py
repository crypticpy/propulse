"""Archive-before-delete orchestration with idempotent restart points."""

from __future__ import annotations

import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from .database import ArchiveDatabase, closed_boundary, floor_partition, next_partition
from .datasets import DATASETS, Dataset
from .parquet import ArchiveStats, export_partition, verify_parquet
from .storage import BUCKET, SupabaseArchiveStorage


COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")


def validate_partition(
    dataset: Dataset, range_start: datetime, range_end: datetime
) -> tuple[datetime, datetime]:
    if range_start.tzinfo is None or range_end.tzinfo is None:
        raise ValueError("archive partition timestamps must include a timezone")
    start = range_start.astimezone(timezone.utc)
    end = range_end.astimezone(timezone.utc)
    if start != floor_partition(start, dataset.granularity):
        raise ValueError("archive range_start is not aligned to its partition")
    if end != next_partition(start, dataset.granularity):
        raise ValueError("archive range must contain exactly one partition")
    return start, end


def object_path(dataset: Dataset, range_start: datetime, content_sha256: str) -> str:
    levels = [
        dataset.name,
        f"schema={dataset.schema_version}",
        f"year={range_start:%Y}",
        f"month={range_start:%m}",
    ]
    if dataset.granularity in {"day", "hour"}:
        levels.append(f"day={range_start:%d}")
    if dataset.granularity == "hour":
        levels.append(f"hour={range_start:%H}")
    levels.append(f"part-{content_sha256}.parquet.zst")
    return "/".join(levels)


def _stats_from_manifest(manifest: dict[str, Any], path: Path) -> ArchiveStats:
    return ArchiveStats(
        path=path,
        row_count=int(manifest["row_count"]),
        min_source_time=manifest["min_source_time"],
        max_source_time=manifest["max_source_time"],
        source_counts=dict(manifest["source_counts"]),
        content_sha256=manifest["content_sha256"],
        uncompressed_bytes=int(manifest["uncompressed_bytes"]),
        object_bytes=int(manifest["object_bytes"]),
        batches=0,
    )


def _summaries_match(stats: ArchiveStats, summary: dict[str, Any]) -> bool:
    return (
        stats.row_count == summary["row_count"]
        and stats.min_source_time == summary["min_source_time"]
        and stats.max_source_time == summary["max_source_time"]
        and stats.source_counts == summary["source_counts"]
    )


def archive_partition(
    database: ArchiveDatabase,
    storage: SupabaseArchiveStorage,
    dataset: Dataset,
    range_start: datetime,
    range_end: datetime,
    *,
    exporter_commit: str,
    lifecycle_class: str = "ordinary",
    temp_root: Path | None = None,
    batch_rows: int = 10_000,
    row_group_rows: int = 50_000,
    now: datetime | None = None,
    settle_minutes: int = 20,
) -> dict[str, object]:
    start, end = validate_partition(dataset, range_start, range_end)
    archive_now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if end > closed_boundary(archive_now, dataset.granularity, settle_minutes):
        raise RuntimeError("archive partition has not reached its closed boundary")
    if lifecycle_class != "ordinary":
        raise ValueError(
            "new archives start ordinary; use the audited database transition for holds"
        )
    if not COMMIT_RE.fullmatch(exporter_commit):
        raise ValueError("exporter commit must be a full lowercase Git SHA")
    database.assert_archive_enabled(dataset)

    with database.partition_lock(dataset, start, end):
        existing = database.existing_manifest(dataset, start, end)
        if existing and existing["status"] in {"sealed", "restored"}:
            if not storage.verify(
                existing["object_path"],
                int(existing["object_bytes"]),
                existing["content_sha256"],
            ):
                raise RuntimeError("sealed manifest object is missing")
            return {
                "manifest_id": str(existing["id"]),
                "dataset": dataset.name,
                "range_start": start.isoformat(),
                "range_end": end.isoformat(),
                "status": "already_sealed",
                "row_count": int(existing["row_count"]),
                "content_sha256": existing["content_sha256"],
            }

        if not database.watermarks_cover(dataset, start, end):
            raise RuntimeError("aggregation or feature watermarks do not cover partition")
        source_before = database.source_summary(dataset, start, end)
        manifest_id: UUID | None = None
        with tempfile.TemporaryDirectory(dir=temp_root) as directory:
            archive_path = Path(directory) / "partition.parquet.zst"
            try:
                stats = export_partition(
                    database.connection,
                    dataset,
                    start,
                    end,
                    archive_path,
                    batch_rows=batch_rows,
                    row_group_rows=row_group_rows,
                )
                local_verification = verify_parquet(
                    archive_path,
                    dataset,
                    expected_rows=stats.row_count,
                    expected_sha256=stats.content_sha256,
                    expected_min_time=stats.min_source_time,
                    expected_max_time=stats.max_source_time,
                    expected_source_counts=stats.source_counts,
                )
                source_after = database.source_summary(dataset, start, end)
                if not _summaries_match(stats, source_before) or not _summaries_match(
                    stats, source_after
                ):
                    raise RuntimeError("source partition changed or failed reconciliation")
                if not database.watermarks_cover(dataset, start, end):
                    raise RuntimeError("watermark coverage changed during export")

                remote_path = object_path(dataset, start, stats.content_sha256)
                manifest_id = database.register_manifest(
                    dataset,
                    start,
                    end,
                    remote_path,
                    stats,
                    exporter_commit,
                    lifecycle_class,
                )
                storage.upload(archive_path, remote_path)
                if not storage.verify(
                    remote_path, stats.object_bytes, stats.content_sha256
                ):
                    raise RuntimeError("uploaded archive could not be verified")

                downloaded = Path(directory) / "remote-read-test.parquet.zst"
                remote_bytes, remote_sha256 = storage.download(remote_path, downloaded)
                if remote_bytes != stats.object_bytes or remote_sha256 != stats.content_sha256:
                    raise RuntimeError("downloaded archive differs from exported bytes")
                remote_verification = verify_parquet(
                    downloaded,
                    dataset,
                    expected_rows=stats.row_count,
                    expected_sha256=stats.content_sha256,
                    expected_min_time=stats.min_source_time,
                    expected_max_time=stats.max_source_time,
                    expected_source_counts=stats.source_counts,
                )
                verification = {
                    **local_verification,
                    **remote_verification,
                    "remote_size_verified": True,
                    "remote_sha256_verified": True,
                    "watermark_coverage_verified": True,
                }
                database.verify_manifest(manifest_id, verification)
                database.seal_manifest(manifest_id)
            except Exception as error:
                if manifest_id is not None:
                    database.fail_manifest(manifest_id, str(error))
                raise

        return {
            "manifest_id": str(manifest_id),
            "dataset": dataset.name,
            "range_start": start.isoformat(),
            "range_end": end.isoformat(),
            "status": "sealed",
            "row_count": stats.row_count,
            "object_bucket": BUCKET,
            "object_path": remote_path,
            "content_sha256": stats.content_sha256,
            "object_bytes": stats.object_bytes,
            "uncompressed_bytes": stats.uncompressed_bytes,
            "source_counts": stats.source_counts,
        }


def first_due_partition(
    database: ArchiveDatabase,
    dataset: Dataset,
    *,
    now: datetime,
    settle_minutes: int = 20,
) -> tuple[datetime, datetime] | None:
    oldest = database.oldest_source_time(dataset)
    if oldest is None:
        return None
    cursor = floor_partition(oldest, dataset.granularity)
    boundary = closed_boundary(now, dataset.granularity, settle_minutes)
    while next_partition(cursor, dataset.granularity) <= boundary:
        end = next_partition(cursor, dataset.granularity)
        if not database.manifest_exists(dataset, cursor, end):
            return cursor, end
        cursor = end
    return None


def exporter_commit_from_environment(explicit: str | None = None) -> str:
    value = explicit or os.environ.get("RAILWAY_GIT_COMMIT_SHA") or os.environ.get("GIT_COMMIT")
    if not value or not COMMIT_RE.fullmatch(value):
        raise RuntimeError("a full lowercase exporter Git commit is required")
    return value


def write_receipt(path: Path, receipt: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".partial-{os.getpid()}")
    temporary.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)
    path.chmod(0o600)
