"""Daily manifest/object inventory reconciliation; never deletes objects."""

from __future__ import annotations

from .database import ArchiveDatabase
from .storage import SupabaseArchiveStorage


def reconcile_inventory(
    database: ArchiveDatabase,
    storage: SupabaseArchiveStorage,
) -> dict[str, object]:
    manifests = database.manifest_inventory()
    objects = storage.list_objects()
    expected = {row["object_path"]: row for row in manifests}
    actual = {item.path: item for item in objects}
    missing = sorted(set(expected) - set(actual))
    orphan = sorted(set(actual) - set(expected))
    size_mismatches = [
        {
            "path": path,
            "manifest_bytes": int(expected[path]["object_bytes"]),
            "storage_bytes": actual[path].size,
        }
        for path in sorted(set(expected) & set(actual))
        if int(expected[path]["object_bytes"]) != actual[path].size
    ]
    details: dict[str, object] = {
        "schema_version": 1,
        "hash_verification_scope": "archive_and_restore_time",
        "inventory_scope": "path_and_size",
        "object_deletion_attempted": False,
    }
    reconciliation_id = database.record_reconciliation(
        manifest_count=len(manifests),
        storage_object_count=len(objects),
        missing_paths=missing,
        orphan_paths=orphan,
        size_mismatches=size_mismatches,
        details=details,
    )
    return {
        "reconciliation_id": str(reconciliation_id),
        "passed": not missing and not orphan and not size_mismatches,
        "manifest_count": len(manifests),
        "storage_object_count": len(objects),
        "missing_paths": missing,
        "orphan_paths": orphan,
        "size_mismatches": size_mismatches,
        **details,
    }
