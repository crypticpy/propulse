"""Transparent storage-cost forecast from reports and sealed manifests."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any


GIB = 1024 ** 3
PRICING_AS_OF = date(2026, 7, 19)
DATABASE_ALLOWANCE_GIB = 8.0
OBJECT_ALLOWANCE_GIB = 100.0
DATABASE_OVERAGE_PER_GIB_MONTH = 0.125
OBJECT_OVERAGE_PER_GIB_MONTH = 0.0213


def _number(value: object | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _overage_cost(byte_count: float, allowance_gib: float, price: float) -> float:
    return round(max(byte_count / GIB - allowance_gib, 0.0) * price, 4)


def build_cost_forecast(
    inputs: dict[str, Any],
    *,
    scale_factor: float = 10.0,
    provisioned_database_bytes: int | None = None,
    database_disk_limit_bytes: int | None = None,
    alternative_archive_costs: dict[str, float] | None = None,
) -> tuple[dict[str, object], dict[str, object]]:
    if scale_factor < 1 or scale_factor > 100:
        raise ValueError("scale_factor must be between 1 and 100")
    if provisioned_database_bytes is not None and provisioned_database_bytes < 0:
        raise ValueError("provisioned database bytes cannot be negative")
    if database_disk_limit_bytes is not None and database_disk_limit_bytes <= 0:
        raise ValueError("database disk limit bytes must be positive")

    report = inputs["storage_report"]
    relations = report["relations"]
    hot_days = {
        row["dataset"]: _number(row["hot_seconds"]) / 86_400
        for row in inputs["datasets"]
    }
    relation_total = 0.0
    projected_relation_bytes = 0.0
    missing_rate_datasets: list[str] = []
    relation_details: dict[str, object] = {}
    for dataset, retention_days in hot_days.items():
        relation = relations.get(dataset) or {}
        total_bytes = _number(relation.get("total_bytes"))
        estimated_rows = _number(relation.get("estimated_rows"))
        exact_seven_days = relation.get("exact_rows_last_7_days")
        relation_total += total_bytes
        if exact_seven_days is None or estimated_rows <= 0:
            missing_rate_datasets.append(dataset)
            relation_details[dataset] = {
                "complete": False,
                "reason": "exact seven-day rows or bytes-per-row unavailable",
            }
            continue
        daily_rows = _number(exact_seven_days) / 7
        bytes_per_row = total_bytes / estimated_rows
        projected = daily_rows * retention_days * bytes_per_row * scale_factor
        projected_relation_bytes += projected
        relation_details[dataset] = {
            "complete": True,
            "hot_days": round(retention_days, 5),
            "rows_per_day": round(daily_rows, 2),
            "bytes_per_row": round(bytes_per_row, 2),
            "scaled_hot_bytes": round(projected),
        }

    measured_database_bytes = int(report["database_bytes"])
    static_database_bytes = max(measured_database_bytes - relation_total, 0.0)
    scaled_database_bytes: int | None = None
    if not missing_rate_datasets:
        scaled_database_bytes = round(static_database_bytes + projected_relation_bytes)

    current_object_bytes = sum(
        int(row["total_object_bytes"] or 0) for row in inputs["manifests"]
    )
    ordinary_daily_bytes = sum(
        int(row["object_bytes_last_30_days"] or 0) / 30
        for row in inputs["manifests"]
        if row["lifecycle_class"] == "ordinary"
    )
    held_object_bytes = sum(
        int(row["total_object_bytes"] or 0)
        for row in inputs["manifests"]
        if row["lifecycle_class"] in {"research_locked", "publication_hold"}
    )
    scaled_ordinary_90_day_bytes = round(
        ordinary_daily_bytes * 90 * scale_factor
    )
    scaled_object_bytes = scaled_ordinary_90_day_bytes + held_object_bytes

    database_billing_bytes = (
        provisioned_database_bytes
        if provisioned_database_bytes is not None
        else measured_database_bytes
    )
    alerts: list[dict[str, object]] = []
    if database_disk_limit_bytes is not None:
        usage = database_billing_bytes / database_disk_limit_bytes
        if usage >= 0.85:
            alerts.append({"severity": "critical", "signal": "database_disk", "ratio": round(usage, 4)})
        elif usage >= 0.70:
            alerts.append({"severity": "warning", "signal": "database_disk", "ratio": round(usage, 4)})
    object_usage = current_object_bytes / (OBJECT_ALLOWANCE_GIB * GIB)
    if object_usage >= 0.85:
        alerts.append({"severity": "critical", "signal": "object_allowance", "ratio": round(object_usage, 4)})
    elif object_usage >= 0.70:
        alerts.append({"severity": "warning", "signal": "object_allowance", "ratio": round(object_usage, 4)})

    alternative_comparison: dict[str, object] | None = None
    if alternative_archive_costs is not None:
        storage_price = float(alternative_archive_costs.get("storage_per_gib_month", -1))
        fixed_values = [float(alternative_archive_costs.get(key, 0)) for key in (
            "requests_month", "egress_month", "replication_month", "operations_month",
        )]
        fixed_current = sum(fixed_values)
        if storage_price < 0 or any(value < 0 for value in fixed_values):
            raise ValueError("alternative archive cost inputs cannot be negative")
        alternative_comparison = {
            "input": alternative_archive_costs,
            "current_estimated_usd_month": round(
                current_object_bytes / GIB * storage_price + fixed_current, 4
            ),
            "scaled_estimated_usd_month": round(
                scaled_object_bytes / GIB * storage_price
                + fixed_current * scale_factor,
                4,
            ),
            "supabase_current_estimated_overage_usd_month": _overage_cost(
                current_object_bytes,
                OBJECT_ALLOWANCE_GIB,
                OBJECT_OVERAGE_PER_GIB_MONTH,
            ),
            "supabase_scaled_estimated_overage_usd_month": _overage_cost(
                scaled_object_bytes,
                OBJECT_ALLOWANCE_GIB,
                OBJECT_OVERAGE_PER_GIB_MONTH,
            ),
        }

    forecast: dict[str, object] = {
        "current": {
            "database_measured_bytes": measured_database_bytes,
            "database_billing_basis_bytes": database_billing_bytes,
            "database_billing_basis": (
                "provisioned_dashboard_input"
                if provisioned_database_bytes is not None
                else "pg_database_size_proxy"
            ),
            "object_bytes": current_object_bytes,
            "estimated_database_overage_usd_month": _overage_cost(
                database_billing_bytes,
                DATABASE_ALLOWANCE_GIB,
                DATABASE_OVERAGE_PER_GIB_MONTH,
            ),
            "estimated_object_overage_usd_month": _overage_cost(
                current_object_bytes,
                OBJECT_ALLOWANCE_GIB,
                OBJECT_OVERAGE_PER_GIB_MONTH,
            ),
        },
        "scaled": {
            "scale_factor": scale_factor,
            "database_bytes": scaled_database_bytes,
            "ordinary_object_90_day_bytes": scaled_ordinary_90_day_bytes,
            "held_object_bytes_current_floor": held_object_bytes,
            "object_bytes": scaled_object_bytes,
            "estimated_database_overage_usd_month": (
                _overage_cost(
                    scaled_database_bytes,
                    DATABASE_ALLOWANCE_GIB,
                    DATABASE_OVERAGE_PER_GIB_MONTH,
                )
                if scaled_database_bytes is not None else None
            ),
            "estimated_object_overage_usd_month": _overage_cost(
                scaled_object_bytes,
                OBJECT_ALLOWANCE_GIB,
                OBJECT_OVERAGE_PER_GIB_MONTH,
            ),
        },
        "relation_projection": relation_details,
        "alerts": alerts,
        "alternative_archive_comparison": alternative_comparison,
        "complete": not missing_rate_datasets and provisioned_database_bytes is not None,
        "missing_rate_datasets": missing_rate_datasets,
    }
    assumptions: dict[str, object] = {
        "pricing_as_of": PRICING_AS_OF.isoformat(),
        "database_allowance_gib": DATABASE_ALLOWANCE_GIB,
        "object_allowance_gib": OBJECT_ALLOWANCE_GIB,
        "database_overage_usd_per_gib_month": DATABASE_OVERAGE_PER_GIB_MONTH,
        "object_overage_usd_per_gib_month": OBJECT_OVERAGE_PER_GIB_MONTH,
        "ordinary_object_retention_days": 90,
        "locked_and_publication_bytes": "current floor only; release timing is protocol controlled",
        "database_projection": "static database bytes plus exact-rate hot relations at configured retention",
        "provisioned_disk_input_required_for_billing_accuracy": True,
        "alternative_archive_inputs": (
            "operator-supplied actual request, egress, replication, and operations costs"
            if alternative_archive_costs is not None else None
        ),
    }
    return forecast, assumptions
