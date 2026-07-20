"""Command-line entrypoint for archive, restore, inventory, and report jobs."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from psycopg.conninfo import conninfo_to_dict

from .database import ArchiveDatabase
from .benchmark import benchmark_partition_candidate, benchmark_wspr_candidates
from .cost import PRICING_AS_OF, build_cost_forecast
from .datasets import DATASETS
from .fixtures import run_fixture_gate
from .restore import restore_manifest
from .reconcile import reconcile_inventory
from .replica import verify_replica
from .storage import SupabaseArchiveStorage
from .worker import (
    archive_partition,
    exporter_commit_from_environment,
    first_due_partition,
    write_receipt,
)


def _timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def _true_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true"}


def _database_url() -> str:
    return (os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL") or "").strip()


def _storage() -> SupabaseArchiveStorage:
    return SupabaseArchiveStorage(
        os.environ.get("SUPABASE_URL", "").strip(),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
    )


def _validation_database_url(explicit: str | None = None) -> str:
    validation_url = (
        explicit
        or os.environ.get("ARCHIVE_VALIDATION_DATABASE_URL")
        or ""
    ).strip()
    if not validation_url:
        raise RuntimeError("ARCHIVE_VALIDATION_DATABASE_URL is required")
    source = conninfo_to_dict(_database_url())
    target = conninfo_to_dict(validation_url)
    identity_fields = ("host", "hostaddr", "port", "dbname")
    if all(source.get(field) == target.get(field) for field in identity_fields):
        raise RuntimeError(
            "ARCHIVE_VALIDATION_DATABASE_URL must identify an isolated database"
        )
    return validation_url


def _receipt_hmac_key() -> str:
    key = (os.environ.get("ARCHIVE_RECEIPT_HMAC_KEY") or "").strip()
    if not key:
        raise RuntimeError("ARCHIVE_RECEIPT_HMAC_KEY is required for restore receipts")
    return key


def _require_export_switch() -> None:
    if not _true_env("ARCHIVE_EXPORT_ENABLED"):
        raise RuntimeError("ARCHIVE_EXPORT_ENABLED is false")


def _archive(args: argparse.Namespace) -> dict[str, object]:
    _require_export_switch()
    dataset = DATASETS[args.dataset]
    with ArchiveDatabase(_database_url()) as database, _storage() as storage:
        return archive_partition(
            database,
            storage,
            dataset,
            args.range_start,
            args.range_end,
            exporter_commit=exporter_commit_from_environment(args.exporter_commit),
            lifecycle_class=args.lifecycle_class,
            temp_root=args.temp_root,
            batch_rows=args.batch_rows,
            row_group_rows=args.row_group_rows,
        )


def _run_due(args: argparse.Namespace) -> dict[str, object]:
    _require_export_switch()
    commit = exporter_commit_from_environment(args.exporter_commit)
    receipts: list[dict[str, object]] = []
    with ArchiveDatabase(_database_url()) as database, _storage() as storage:
        enabled = database.enabled_dataset_names()
        unsupported = sorted(set(enabled) - set(DATASETS))
        if unsupported:
            raise RuntimeError(f"worker does not support enabled datasets: {unsupported}")
        while len(receipts) < args.max_partitions:
            progressed = False
            for name in enabled:
                partition = first_due_partition(
                    database,
                    DATASETS[name],
                    now=args.now,
                    settle_minutes=args.settle_minutes,
                )
                if partition is None:
                    continue
                receipts.append(archive_partition(
                    database,
                    storage,
                    DATASETS[name],
                    *partition,
                    exporter_commit=commit,
                    lifecycle_class="ordinary",
                    temp_root=args.temp_root,
                    batch_rows=args.batch_rows,
                    row_group_rows=args.row_group_rows,
                    now=args.now,
                    settle_minutes=args.settle_minutes,
                ))
                progressed = True
                if len(receipts) >= args.max_partitions:
                    break
            if not progressed:
                break
    return {
        "status": "complete",
        "partitions_processed": len(receipts),
        "receipts": receipts,
    }


def _restore(args: argparse.Namespace) -> dict[str, object]:
    validation_url = _validation_database_url(args.validation_database_url)
    receipt_hmac_key = _receipt_hmac_key()
    with ArchiveDatabase(_database_url()) as database, _storage() as storage:
        return restore_manifest(
            database,
            storage,
            args.manifest_id,
            validation_database_url=validation_url,
            validation_target_label=args.validation_target_label,
            receipt_hmac_key=receipt_hmac_key,
            batch_rows=args.batch_rows,
            temp_root=args.temp_root,
        )


def _restore_due(args: argparse.Namespace) -> dict[str, object]:
    validation_url = _validation_database_url(args.validation_database_url)
    receipt_hmac_key = _receipt_hmac_key()
    receipts: list[dict[str, object]] = []
    with ArchiveDatabase(_database_url()) as database, _storage() as storage:
        manifest_ids = database.restore_due_manifest_ids(
            now=args.now,
            cadence=timedelta(days=args.cadence_days),
            limit=args.max_manifests,
        )
        for manifest_id in manifest_ids:
            receipts.append(restore_manifest(
                database,
                storage,
                manifest_id,
                validation_database_url=validation_url,
                validation_target_label=args.validation_target_label,
                receipt_hmac_key=receipt_hmac_key,
                batch_rows=args.batch_rows,
                temp_root=args.temp_root,
            ))
    return {
        "status": "complete",
        "manifests_processed": len(receipts),
        "cadence_days": args.cadence_days,
        "receipts": receipts,
    }


def _report(args: argparse.Namespace) -> dict[str, object]:
    with ArchiveDatabase(_database_url()) as database:
        report_id = database.capture_storage_report(args.include_exact_rates)
        return {
            "status": "captured",
            "report_id": str(report_id),
            "include_exact_rates": args.include_exact_rates,
        }


def _inventory(_: argparse.Namespace) -> dict[str, object]:
    with ArchiveDatabase(_database_url()) as database:
        return database.retention_inventory()


def _reconcile(_: argparse.Namespace) -> dict[str, object]:
    with ArchiveDatabase(_database_url()) as database, _storage() as storage:
        result = reconcile_inventory(database, storage)
    return {"status": "passed" if result["passed"] else "failed", **result}


def _health(args: argparse.Namespace) -> dict[str, object]:
    with ArchiveDatabase(_database_url()) as database:
        health = database.archive_health(args.now)
    alerts = health.get("alerts", [])
    severities = {alert.get("severity") for alert in alerts if isinstance(alert, dict)}
    status = "critical" if "critical" in severities else (
        "warning" if "warning" in severities else "ok"
    )
    return {"status": status, **health}


def _benchmark_partition(args: argparse.Namespace) -> dict[str, object]:
    with ArchiveDatabase(_database_url()) as database:
        return benchmark_partition_candidate(
            database,
            dataset=args.dataset,
            range_start=args.range_start,
            range_end=args.range_end,
            max_rows=args.max_rows,
            repetitions=args.repetitions,
            representative=args.representative,
        )


def _benchmark_wspr(args: argparse.Namespace) -> dict[str, object]:
    with ArchiveDatabase(_database_url()) as database:
        return benchmark_wspr_candidates(
            database,
            range_start=args.range_start,
            range_end=args.range_end,
            max_rows=args.max_rows,
            repetitions=args.repetitions,
            temp_root=args.temp_root,
        )


def _cost_forecast(args: argparse.Namespace) -> dict[str, object]:
    provisioned = (
        round(args.provisioned_database_gib * 1024 ** 3)
        if args.provisioned_database_gib is not None else None
    )
    disk_limit = (
        round(args.database_disk_limit_gib * 1024 ** 3)
        if args.database_disk_limit_gib is not None else None
    )
    with ArchiveDatabase(_database_url()) as database:
        inputs = database.cost_inputs()
        alternative = None
        if args.alternative_storage_usd_per_gib_month is not None:
            alternative = {
                "storage_per_gib_month": args.alternative_storage_usd_per_gib_month,
                "requests_month": args.alternative_requests_usd_month,
                "egress_month": args.alternative_egress_usd_month,
                "replication_month": args.alternative_replication_usd_month,
                "operations_month": args.alternative_operations_usd_month,
            }
        forecast, assumptions = build_cost_forecast(
            inputs,
            scale_factor=args.scale_factor,
            provisioned_database_bytes=provisioned,
            database_disk_limit_bytes=disk_limit,
            alternative_archive_costs=alternative,
        )
        report_id = inputs["storage_report"]["id"]
        receipt_id = database.record_cost_forecast(
            storage_report_id=report_id,
            pricing_as_of=PRICING_AS_OF,
            scale_factor=args.scale_factor,
            forecast=forecast,
            assumptions=assumptions,
        )
    severities = {item["severity"] for item in forecast["alerts"]}
    status = "critical" if "critical" in severities else (
        "warning" if "warning" in severities or not forecast["complete"] else "ok"
    )
    return {
        "status": status,
        "receipt_id": str(receipt_id),
        "source_storage_report_id": str(report_id),
        "forecast": forecast,
        "assumptions": assumptions,
    }


def _set_lifecycle(args: argparse.Namespace) -> dict[str, object]:
    with ArchiveDatabase(_database_url()) as database:
        database.set_lifecycle_class(
            args.manifest_id,
            args.lifecycle_class,
            args.reason,
            args.reference,
        )
    return {
        "status": "updated",
        "manifest_id": str(args.manifest_id),
        "lifecycle_class": args.lifecycle_class,
        "reference": args.reference,
    }


def _verify_replica(args: argparse.Namespace) -> dict[str, object]:
    key = (os.environ.get("ARCHIVE_RECEIPT_HMAC_KEY") or "").strip()
    if not key:
        raise RuntimeError("ARCHIVE_RECEIPT_HMAC_KEY is required for replica receipts")
    with ArchiveDatabase(_database_url()) as database:
        return {
            "status": "passed",
            **verify_replica(
                database,
                args.manifest_id,
                args.replica_path,
                target_label=args.target_label,
                receipt_hmac_key=key,
            ),
        }


def _replica_health(args: argparse.Namespace) -> dict[str, object]:
    with ArchiveDatabase(_database_url()) as database:
        health = database.replica_health(args.now)
    status = "critical" if health.get("alerts") else "ok"
    return {"status": status, **health}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    archive = subparsers.add_parser("archive", help="archive one aligned partition")
    archive.add_argument("--dataset", choices=sorted(DATASETS), required=True)
    archive.add_argument("--range-start", type=_timestamp, required=True)
    archive.add_argument("--range-end", type=_timestamp, required=True)
    archive.add_argument(
        "--lifecycle-class",
        choices=("ordinary",),
        default="ordinary",
        help="archive as ordinary; apply locked holds only through the audited SQL transition",
    )
    archive.add_argument("--exporter-commit")
    archive.add_argument("--batch-rows", type=int, default=10_000)
    archive.add_argument("--row-group-rows", type=int, default=50_000)
    archive.add_argument("--temp-root", type=Path)
    archive.set_defaults(handler=_archive)

    due = subparsers.add_parser("run-due", help="archive the oldest due partitions")
    due.add_argument("--max-partitions", type=int, default=5)
    due.add_argument("--settle-minutes", type=int, default=20)
    due.add_argument("--now", type=_timestamp, default=datetime.now(timezone.utc))
    due.add_argument("--exporter-commit")
    due.add_argument("--batch-rows", type=int, default=10_000)
    due.add_argument("--row-group-rows", type=int, default=50_000)
    due.add_argument("--temp-root", type=Path)
    due.set_defaults(handler=_run_due)

    restore = subparsers.add_parser("restore", help="run an isolated restore drill")
    restore.add_argument("--manifest-id", type=UUID, required=True)
    restore.add_argument("--validation-database-url")
    restore.add_argument("--validation-target-label", required=True)
    restore.add_argument("--batch-rows", type=int, default=5_000)
    restore.add_argument("--temp-root", type=Path)
    restore.set_defaults(handler=_restore)

    restore_due = subparsers.add_parser(
        "restore-due",
        help="restore each dataset's latest manifest when its drill is due",
    )
    restore_due.add_argument("--validation-database-url")
    restore_due.add_argument(
        "--validation-target-label",
        default="scheduled-isolated-validation",
    )
    restore_due.add_argument("--cadence-days", type=int, default=30)
    restore_due.add_argument("--max-manifests", type=int, default=10)
    restore_due.add_argument("--now", type=_timestamp, default=datetime.now(timezone.utc))
    restore_due.add_argument("--batch-rows", type=int, default=5_000)
    restore_due.add_argument("--temp-root", type=Path)
    restore_due.set_defaults(handler=_restore_due)

    report = subparsers.add_parser("report", help="capture exact storage metrics")
    report.add_argument("--include-exact-rates", action="store_true")
    report.set_defaults(handler=_report)

    inventory = subparsers.add_parser("inventory", help="inventory retention controls and jobs")
    inventory.set_defaults(handler=_inventory)

    reconcile = subparsers.add_parser(
        "reconcile", help="compare manifest paths and sizes with private storage"
    )
    reconcile.set_defaults(handler=_reconcile)

    health = subparsers.add_parser("health", help="evaluate archive alert thresholds")
    health.add_argument("--now", type=_timestamp, default=datetime.now(timezone.utc))
    health.set_defaults(handler=_health)

    partition_benchmark = subparsers.add_parser(
        "benchmark-partition",
        help="benchmark a rollback-only native partition candidate",
    )
    partition_benchmark.add_argument("--dataset", choices=("spot", "wspr"), required=True)
    partition_benchmark.add_argument("--range-start", type=_timestamp, required=True)
    partition_benchmark.add_argument("--range-end", type=_timestamp, required=True)
    partition_benchmark.add_argument("--max-rows", type=int, default=500_000)
    partition_benchmark.add_argument("--repetitions", type=int, default=20)
    partition_benchmark.add_argument(
        "--representative",
        action="store_true",
        help=(
            "use rollback-only ordinary tables so PostgreSQL WAL is measured; "
            "the benchmark still generates WAL"
        ),
    )
    partition_benchmark.add_argument("--receipt", type=Path)
    partition_benchmark.set_defaults(handler=_benchmark_partition)

    wspr_benchmark = subparsers.add_parser(
        "benchmark-wspr",
        help="compare row, compact-array, and Parquet/cache WSPR candidates",
    )
    wspr_benchmark.add_argument("--range-start", type=_timestamp, required=True)
    wspr_benchmark.add_argument("--range-end", type=_timestamp, required=True)
    wspr_benchmark.add_argument("--max-rows", type=int, default=500_000)
    wspr_benchmark.add_argument("--repetitions", type=int, default=20)
    wspr_benchmark.add_argument("--temp-root", type=Path)
    wspr_benchmark.add_argument("--receipt", type=Path)
    wspr_benchmark.set_defaults(handler=_benchmark_wspr)

    cost = subparsers.add_parser(
        "cost-forecast",
        help="record current and scaled storage-cost projections",
    )
    cost.add_argument("--scale-factor", type=float, default=10.0)
    cost.add_argument("--provisioned-database-gib", type=float)
    cost.add_argument("--database-disk-limit-gib", type=float)
    cost.add_argument("--alternative-storage-usd-per-gib-month", type=float)
    cost.add_argument("--alternative-requests-usd-month", type=float, default=0.0)
    cost.add_argument("--alternative-egress-usd-month", type=float, default=0.0)
    cost.add_argument("--alternative-replication-usd-month", type=float, default=0.0)
    cost.add_argument("--alternative-operations-usd-month", type=float, default=0.0)
    cost.add_argument("--receipt", type=Path)
    cost.set_defaults(handler=_cost_forecast)

    lifecycle = subparsers.add_parser(
        "set-lifecycle",
        help="apply an audited evidence hold or release transition",
    )
    lifecycle.add_argument("--manifest-id", type=UUID, required=True)
    lifecycle.add_argument(
        "--lifecycle-class",
        choices=("ordinary", "research_locked", "publication_hold"),
        required=True,
    )
    lifecycle.add_argument("--reason", required=True)
    lifecycle.add_argument("--reference", required=True)
    lifecycle.add_argument("--receipt", type=Path)
    lifecycle.set_defaults(handler=_set_lifecycle)

    replica = subparsers.add_parser(
        "verify-replica",
        help="verify a locked archive's independent copy and sign a receipt",
    )
    replica.add_argument("--manifest-id", type=UUID, required=True)
    replica.add_argument("--replica-path", type=Path, required=True)
    replica.add_argument("--target-label", required=True)
    replica.add_argument("--receipt", type=Path)
    replica.set_defaults(handler=_verify_replica)

    replica_health = subparsers.add_parser(
        "replica-health",
        help="alert on locked evidence without a verified second copy",
    )
    replica_health.add_argument("--now", type=_timestamp, default=datetime.now(timezone.utc))
    replica_health.set_defaults(handler=_replica_health)

    fixture = subparsers.add_parser("self-test", help="run five local Parquet fixtures")
    fixture.add_argument("--temp-root", type=Path)
    fixture.set_defaults(handler=lambda args: {
        "status": "passed",
        "fixtures": run_fixture_gate(args.temp_root),
    })
    return parser


def main() -> None:
    args = build_parser().parse_args()
    result = args.handler(args)
    if getattr(args, "receipt", None):
        write_receipt(args.receipt, result)
    print(json.dumps(result, indent=2, default=str))
    if result.get("status") in {"failed", "critical"}:
        raise SystemExit(2)
