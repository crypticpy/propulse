"""Isolated restore drill with schema, count, bounds, and aggregate checks."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any
from uuid import UUID

import psycopg
import pyarrow.parquet as pq
from psycopg import sql
from psycopg.rows import dict_row

from .crypto import receipt_hmac_key_bytes
from .database import ArchiveDatabase
from .datasets import DATASETS, Dataset
from .parquet import verify_parquet
from .storage import SupabaseArchiveStorage


LABEL_RE = re.compile(r"^[a-zA-Z0-9_.:-]{1,200}$")


def _insert_statement(dataset: Dataset, schema_name: str) -> sql.Composed:
    casts = dict(dataset.restore_casts)
    values: list[sql.Composable] = []
    for field in dataset.schema:
        placeholder: sql.Composable = sql.Placeholder()
        if field.name in casts:
            placeholder = sql.SQL("CAST({} AS {})").format(
                placeholder, sql.SQL(casts[field.name])
            )
        values.append(placeholder)
    return sql.SQL("INSERT INTO {}.restored_rows ({}) VALUES ({})").format(
        sql.Identifier(schema_name),
        sql.SQL(", ").join(sql.Identifier(field.name) for field in dataset.schema),
        sql.SQL(", ").join(values),
    )


def _target_summary(
    connection: psycopg.Connection[Any], dataset: Dataset, schema_name: str
) -> dict[str, Any]:
    relation = sql.SQL("{}.restored_rows").format(sql.Identifier(schema_name))
    row = connection.execute(
        sql.SQL(
            "SELECT count(*) AS row_count, min({time}) AS min_source_time, "
            "max({time}) AS max_source_time FROM {relation}"
        ).format(time=sql.Identifier(dataset.time_column), relation=relation)
    ).fetchone()
    source_counts: dict[str, int] = {}
    if dataset.source_count_column:
        rows = connection.execute(
            sql.SQL(
                "SELECT {source}::text AS source, count(*) AS rows "
                "FROM {relation} GROUP BY {source} ORDER BY {source}"
            ).format(
                source=sql.Identifier(dataset.source_count_column),
                relation=relation,
            )
        ).fetchall()
        source_counts = {item["source"]: int(item["rows"]) for item in rows}
    return {
        "row_count": int(row["row_count"]),
        "min_source_time": row["min_source_time"],
        "max_source_time": row["max_source_time"],
        "source_counts": source_counts,
    }


def _signature(details: dict[str, object], secret: str | None) -> str | None:
    if secret is None:
        return None
    payload = json.dumps(details, sort_keys=True, separators=(",", ":")).encode()
    return hmac.new(receipt_hmac_key_bytes(secret), payload, hashlib.sha256).hexdigest()


def restore_manifest(
    source_database: ArchiveDatabase,
    storage: SupabaseArchiveStorage,
    manifest_id: UUID,
    *,
    validation_database_url: str,
    validation_target_label: str,
    receipt_hmac_key: str | None = None,
    batch_rows: int = 5_000,
    temp_root: Path | None = None,
) -> dict[str, object]:
    if not LABEL_RE.fullmatch(validation_target_label):
        raise ValueError("validation target label contains unsupported characters")
    if not 100 <= batch_rows <= 50_000:
        raise ValueError("restore batch_rows must be between 100 and 50,000")
    manifest = source_database.manifest(manifest_id)
    if manifest["status"] not in {"sealed", "restored"}:
        raise RuntimeError("restore drill requires a sealed manifest")
    dataset = DATASETS.get(manifest["dataset"])
    if dataset is None or dataset.schema_version != manifest["schema_version"]:
        raise RuntimeError("restore reader does not support the manifest schema")

    with tempfile.TemporaryDirectory(dir=temp_root) as directory:
        archive_path = Path(directory) / "restore.parquet.zst"
        downloaded_bytes, downloaded_sha256 = storage.download(
            manifest["object_path"], archive_path
        )
        if (
            downloaded_bytes != int(manifest["object_bytes"])
            or downloaded_sha256 != manifest["content_sha256"]
        ):
            raise RuntimeError("restore download differs from manifest")
        parquet_result = verify_parquet(
            archive_path,
            dataset,
            expected_rows=int(manifest["row_count"]),
            expected_sha256=manifest["content_sha256"],
            expected_min_time=manifest["min_source_time"],
            expected_max_time=manifest["max_source_time"],
            expected_source_counts=dict(manifest["source_counts"]),
        )

        schema_name = f"propagation_restore_{manifest_id.hex[:16]}"
        target = psycopg.connect(
            validation_database_url,
            autocommit=False,
            connect_timeout=15,
            application_name="propulse-propagation-archive-restore-drill",
            row_factory=dict_row,
        )
        restored_rows = 0
        try:
            target.execute(
                sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema_name))
            )
            target.execute(
                sql.SQL("REVOKE ALL ON SCHEMA {} FROM PUBLIC").format(
                    sql.Identifier(schema_name)
                )
            )
            target.execute(
                sql.SQL(
                    "CREATE UNLOGGED TABLE {}.restored_rows "
                    "(LIKE {} INCLUDING DEFAULTS)"
                ).format(
                    sql.Identifier(schema_name),
                    sql.SQL(dataset.source_relation),
                )
            )
            statement = _insert_statement(dataset, schema_name)
            parquet = pq.ParquetFile(archive_path)
            with target.cursor() as cursor:
                for batch in parquet.iter_batches(batch_size=batch_rows):
                    rows = [
                        tuple(row[field.name] for field in dataset.schema)
                        for row in batch.to_pylist()
                    ]
                    if rows:
                        cursor.executemany(statement, rows)
                        restored_rows += len(rows)
            summary = _target_summary(target, dataset, schema_name)
            expected_summary = {
                "row_count": int(manifest["row_count"]),
                "min_source_time": manifest["min_source_time"],
                "max_source_time": manifest["max_source_time"],
                "source_counts": dict(manifest["source_counts"]),
            }
            if summary != expected_summary or restored_rows != expected_summary["row_count"]:
                raise RuntimeError("isolated restore does not reconcile with manifest")
            target.rollback()
        except Exception:
            target.rollback()
            raise
        finally:
            target.close()

    details: dict[str, object] = {
        "schema_version": 1,
        "manifest_id": str(manifest_id),
        "dataset": dataset.name,
        "validation_target": validation_target_label,
        "validation_schema_ephemeral": True,
        "restored_rows": restored_rows,
        "content_sha256": manifest["content_sha256"],
        "checks": {
            **parquet_result,
            "schema_verified": True,
            "counts_verified": True,
            "aggregates_verified": True,
            "read_verified": True,
        },
    }
    signature = _signature(details, receipt_hmac_key)
    receipt_id = source_database.record_restore(
        manifest_id,
        validation_target=validation_target_label,
        restored_rows=restored_rows,
        restored_sha256=manifest["content_sha256"],
        details=details,
        signature=signature,
    )
    return {**details, "receipt_id": str(receipt_id), "signature": signature}
