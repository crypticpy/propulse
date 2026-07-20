"""Verify an independently copied locked archive and record a signed receipt."""

from __future__ import annotations

import hashlib
import hmac
import json
from pathlib import Path
from uuid import UUID

from .database import ArchiveDatabase
from .datasets import DATASETS
from .parquet import verify_parquet
from .storage import sha256_file


def verify_replica(
    database: ArchiveDatabase,
    manifest_id: UUID,
    replica_path: Path,
    *,
    target_label: str,
    receipt_hmac_key: str,
) -> dict[str, object]:
    if len(receipt_hmac_key.encode()) < 32:
        raise RuntimeError("ARCHIVE_RECEIPT_HMAC_KEY must contain at least 32 bytes")
    path = replica_path.resolve(strict=True)
    if not path.is_file():
        raise RuntimeError("replica path is not a regular file")
    manifest = database.manifest(manifest_id)
    if manifest["lifecycle_class"] not in {"research_locked", "publication_hold"}:
        raise RuntimeError("replica receipts are only valid for locked evidence")
    dataset = DATASETS.get(manifest["dataset"])
    if dataset is None or dataset.schema_version != manifest["schema_version"]:
        raise RuntimeError("replica reader does not support the manifest schema")
    digest = sha256_file(path)
    byte_count = path.stat().st_size
    if digest != manifest["content_sha256"] or byte_count != manifest["object_bytes"]:
        raise RuntimeError("replica bytes differ from the manifest")
    checks = verify_parquet(
        path,
        dataset,
        expected_rows=int(manifest["row_count"]),
        expected_sha256=manifest["content_sha256"],
        expected_min_time=manifest["min_source_time"],
        expected_max_time=manifest["max_source_time"],
        expected_source_counts=dict(manifest["source_counts"]),
    )
    details: dict[str, object] = {
        "schema_version": 1,
        "manifest_id": str(manifest_id),
        "dataset": dataset.name,
        "target_label": target_label,
        "content_sha256": digest,
        "object_bytes": byte_count,
        "checks": checks,
        "replica_path_persisted": False,
    }
    payload = json.dumps(details, sort_keys=True, separators=(",", ":")).encode()
    signature = hmac.new(receipt_hmac_key.encode(), payload, hashlib.sha256).hexdigest()
    locator_hash = hashlib.sha256(str(path).encode()).hexdigest()
    receipt_id = database.record_replica(
        manifest_id=manifest_id,
        target_label=target_label,
        replica_locator_sha256=locator_hash,
        content_sha256=digest,
        object_bytes=byte_count,
        signature=signature,
        details=details,
    )
    return {
        **details,
        "receipt_id": str(receipt_id),
        "replica_locator_sha256": locator_hash,
        "signature": signature,
    }
