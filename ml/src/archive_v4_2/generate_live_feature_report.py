#!/usr/bin/env python3
"""Build the V4.2 live-feature foundation evidence and visual report."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime


ROOT = Path(__file__).resolve().parents[3]
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
RESULT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
INPUTS = {
    "transform_parity": RESULT / "transform_parity.json",
    "foundation_validation": RESULT / "foundation_validation.json",
    "replay_validation": RESULT / "replay_validation.json",
    "migration_validation": RESULT / "migration_validation.json",
    "deployment_validation": RESULT / "deployment_validation.json",
    "research_health_migration_validation": RESULT
    / "research_health_migration_validation.json",
    "research_health_deployment_validation": RESULT
    / "research_health_deployment_validation.json",
    "research_health_endpoint_validation": RESULT
    / "research_health_endpoint_validation.json",
    "operational_weather_validation": RESULT / "operational_weather_validation.json",
    "orchestration_validation": RESULT / "orchestration_validation.json",
    "wspr_live_connector_validation": RESULT / "wspr_live_connector_validation.json",
    "wspr_live_hour_validation": RESULT / "wspr_live_hour_validation.json",
    "wspr_research_schedule_validation": RESULT
    / "wspr_research_schedule_validation.json",
    "wspr_research_shadow_progress": RESULT
    / "wspr_research_shadow_progress.json",
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def source(evidence_path: Path) -> dict[str, Any]:
    location = relative(evidence_path)
    return {
        "id": "live_feature_evidence",
        "label": "V4.2 live-feature foundation and replay evidence",
        "path": location,
        "query": {
            "engine": "duckdb",
            "language": "sql",
            "description": f"Load the checksum-linked evidence in {location}.",
            "sql": f"SELECT * FROM read_json_auto('{location}')",
            "tables_used": [location],
        },
    }


def chart(
    chart_id: str,
    title: str,
    subtitle: str,
    dataset: str,
    encodings: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": chart_id,
        "title": title,
        "subtitle": subtitle,
        "type": "bar",
        "dataset": dataset,
        "sourceId": "live_feature_evidence",
        "encodings": encodings,
        "valueFormat": "number",
        "layout": "full",
    }


def build_evidence(
    transform: dict[str, Any],
    foundation: dict[str, Any],
    replay: dict[str, Any],
    migration_validation: dict[str, Any],
    deployment_validation: dict[str, Any],
    research_health_migration_validation: dict[str, Any],
    research_health_deployment_validation: dict[str, Any],
    research_health_endpoint_validation: dict[str, Any],
    operational_weather_validation: dict[str, Any],
    orchestration_validation: dict[str, Any],
    wspr_live_connector_validation: dict[str, Any],
    wspr_live_hour_validation: dict[str, Any],
    wspr_research_schedule_validation: dict[str, Any],
    wspr_research_shadow_progress: dict[str, Any],
) -> dict[str, Any]:
    if transform.get("decision") != "pass":
        raise RuntimeError("transform parity did not pass")
    if foundation.get("decision") != "pass":
        raise RuntimeError("foundation validation did not pass")
    if replay.get("decision") != "pass":
        raise RuntimeError("multi-hour replay did not pass")
    if (
        migration_validation.get("decision") != "pass"
        or migration_validation.get("persistent_changes") is not False
    ):
        raise RuntimeError("target Postgres rollback validation did not pass")
    if (
        deployment_validation.get("decision") != "pass"
        or deployment_validation.get("migration_deployed") is not True
        or deployment_validation.get("persistent_test_rows") is not False
    ):
        raise RuntimeError("target Postgres deployment validation did not pass")
    if operational_weather_validation.get("decision") != "pass":
        raise RuntimeError("operational-weather deployment validation did not pass")
    if (
        research_health_migration_validation.get("decision") != "pass"
        or research_health_migration_validation.get("migration_deployed") is not False
        or research_health_migration_validation.get("persistent_changes") is not False
    ):
        raise RuntimeError("research-health rollback validation did not pass")
    if (
        research_health_deployment_validation.get("decision") != "pass"
        or research_health_deployment_validation.get("migration_deployed") is not True
        or research_health_deployment_validation.get("persistent_changes") is not False
    ):
        raise RuntimeError("research-health deployment validation did not pass")
    if research_health_endpoint_validation.get("decision") != "pass":
        raise RuntimeError("research-health endpoint validation did not pass")
    if orchestration_validation.get("decision") != "pass":
        raise RuntimeError("live orchestration validation did not pass")
    if wspr_live_connector_validation.get("decision") != "pass":
        raise RuntimeError("WSPR.live research connector validation did not pass")
    if wspr_live_hour_validation.get("decision") != "pass":
        raise RuntimeError("real WSPR.live target-hour validation did not pass")
    if wspr_research_schedule_validation.get("decision") != "pass":
        raise RuntimeError("active WSPR research schedule validation did not pass")
    if (
        wspr_research_shadow_progress.get("decision") not in {"collecting", "pass"}
        or wspr_research_shadow_progress.get("operational_status") != "healthy"
    ):
        raise RuntimeError("WSPR research shadow progress is not operationally healthy")
    if any(
        value.get("locked_outcomes_read")
        for value in (
            transform,
            foundation,
            replay,
            migration_validation,
            deployment_validation,
            research_health_migration_validation,
            research_health_deployment_validation,
            research_health_endpoint_validation,
            operational_weather_validation,
            orchestration_validation,
            wspr_live_connector_validation,
            wspr_live_hour_validation,
            wspr_research_schedule_validation,
            wspr_research_shadow_progress,
        )
    ):
        raise RuntimeError("live-feature work must not read locked outcomes")

    parity = foundation["transform_parity"]
    service = foundation["service"]
    event_replays = replay["event_time_replay"]
    receipt_replays = replay["receipt_time_replay"]
    lag_replays = replay["lag_lookup_replay"]
    replay_hours = sum(len(value["selected_hours"]) for value in event_replays)
    replay_spots = sum(int(value["input_spot_rows"]) for value in event_replays)
    replay_opportunities = sum(
        int(value["opportunity_cells"]["actual"]) for value in event_replays
    )
    replay_path_cells = sum(
        int(value["path_hour_cells"]["actual"]) for value in event_replays
    )
    replay_differences = sum(
        int(value[cell_type][direction])
        for value in event_replays
        for cell_type in ("opportunity_cells", "path_hour_cells")
        for direction in ("actual_minus_expected", "expected_minus_actual")
    )
    summary = [{
        "exact_differences": replay_differences,
        "opportunity_cells": int(parity["actual_rows"]),
        "lag_cells": int(parity["actual_lag_cells"]),
        "transform_wall_seconds": float(transform["compute"]["wall_seconds"]),
        "replay_hours": replay_hours,
        "replay_spots": replay_spots,
        "replay_opportunity_cells": replay_opportunities,
        "replay_path_cells": replay_path_cells,
        "receipt_scenarios": len(receipt_replays),
        "receipt_rows": sum(int(value["source_rows"]) for value in receipt_replays),
        "lag_lookup_cases": len(lag_replays),
        "lag_lookup_targets": sum(int(value["target_count"]) for value in lag_replays),
        "lag_availability_mismatches": sum(
            int(value["availability_mismatches"]) for value in lag_replays
        ),
        "lag_maximum_rate_difference": max(
            float(value["maximum_absolute_rate_difference"])
            for value in lag_replays
        ),
        "path_p95_ms": float(service["path_p95_ms"]),
        "surface_p95_ms": float(service["surface_p95_ms"]),
        "visible_cpus": int(foundation["compute"]["visible_cpus"]),
        "foundation_gates_passed": sum(
            bool(value) for value in foundation["gates"].values()
        ),
        "foundation_gates_total": len(foundation["gates"]),
        "replay_gates_passed": sum(bool(value) for value in replay["gates"].values()),
        "replay_gates_total": len(replay["gates"]),
        "migration_gates_passed": sum(
            bool(value) for value in migration_validation["gates"].values()
        ),
        "migration_gates_total": len(migration_validation["gates"]),
        "deployment_gates_passed": sum(
            bool(value) for value in deployment_validation["gates"].values()
        ),
        "deployment_gates_total": len(deployment_validation["gates"]),
        "research_health_rollback_gates_passed": sum(
            bool(value)
            for value in research_health_migration_validation["gates"].values()
        ),
        "research_health_rollback_gates_total": len(
            research_health_migration_validation["gates"]
        ),
        "research_health_deployment_gates_passed": sum(
            bool(value)
            for value in research_health_deployment_validation["gates"].values()
        ),
        "research_health_deployment_gates_total": len(
            research_health_deployment_validation["gates"]
        ),
        "research_health_endpoint_gates_passed": sum(
            bool(value)
            for value in research_health_endpoint_validation["gates"].values()
        ),
        "research_health_endpoint_gates_total": len(
            research_health_endpoint_validation["gates"]
        ),
        "weather_gates_passed": sum(
            bool(value)
            for value in operational_weather_validation["gates"].values()
        ),
        "weather_gates_total": len(operational_weather_validation["gates"]),
        "weather_feature_count": int(
            operational_weather_validation["weather"]["feature_count"]
        ),
        "weather_path_p95_ms": float(
            operational_weather_validation["performance"]["cached_path_p95_ms"]
        ),
        "orchestration_gates_passed": sum(
            bool(value) for value in orchestration_validation["gates"].values()
        ),
        "orchestration_gates_total": len(orchestration_validation["gates"]),
        "orchestration_threads": int(
            orchestration_validation["execution"]["maximum_compute_threads"]
        ),
        "connector_gates_passed": sum(
            bool(value)
            for value in wspr_live_connector_validation["gates"].values()
        ),
        "connector_gates_total": len(wspr_live_connector_validation["gates"]),
        "connector_rows": int(
            wspr_live_connector_validation["source_record_count"]
        ),
        "connector_requests": int(
            wspr_live_connector_validation["source_request_count"]
        ),
        "connector_peak_rss_mib": float(
            wspr_live_connector_validation["performance"]["peak_rss_mib"]
        ),
        "live_hour_gates_passed": sum(
            bool(value) for value in wspr_live_hour_validation["gates"].values()
        ),
        "live_hour_gates_total": len(wspr_live_hour_validation["gates"]),
        "live_hour_feature_cells": int(
            wspr_live_hour_validation["feature_cell_count"]
        ),
        "schedule_gates_passed": sum(
            bool(value)
            for value in wspr_research_schedule_validation["gates"].values()
        ),
        "schedule_gates_total": len(
            wspr_research_schedule_validation["gates"]
        ),
        "schedule_source_rows": int(
            wspr_research_schedule_validation["source_record_count"]
        ),
        "schedule_feature_cells": int(
            wspr_research_schedule_validation["feature_cell_count"]
        ),
        "schedule_continuous_hours": int(
            wspr_research_schedule_validation["health"][
                "continuous_completed_hours"
            ]
        ),
        "schedule_connector_seconds": float(
            wspr_research_schedule_validation["connector"]["elapsed_seconds"]
        ),
        "schedule_finalizer_seconds": float(
            wspr_research_schedule_validation["finalizer"]["wall_seconds"]
        ),
        "schedule_peak_rss_mib": float(
            wspr_research_schedule_validation["connector"]["peak_rss_mib"]
        ),
        "schedule_target_hour": wspr_research_schedule_validation["target_hour"],
        "shadow_completed_hours": int(
            wspr_research_shadow_progress["window"]["completed_hours"]
        ),
        "shadow_required_hours": int(
            wspr_research_shadow_progress["window"]["minimum_hours"]
        ),
        "shadow_completion_rate_percent": 100 * float(
            wspr_research_shadow_progress["window"]["completion_rate"]
        ),
        "shadow_missing_hours": int(
            wspr_research_shadow_progress["window"]["missing_hours"]
        ),
    }]
    parity_rows = []
    for month in event_replays:
        for label, key in (
            ("Opportunity cells", "opportunity_cells"),
            ("Path-hour lag cells", "path_hour_cells"),
        ):
            parity_rows.extend([
                {
                    "month_and_cell": f"{month['label']} {label}",
                    "implementation": "Historical builder",
                    "cells": int(month[key]["expected"]),
                },
                {
                    "month_and_cell": f"{month['label']} {label}",
                    "implementation": "Shared live transform",
                    "cells": int(month[key]["actual"]),
                },
            ])
    flow_rows = [
        {"stage": "Open-month input spots", "rows": replay_spots},
        {"stage": "Opportunity cells", "rows": replay_opportunities},
        {"stage": "Power-aggregated lag cells", "rows": replay_path_cells},
    ]
    receipt_rows = [
        {
            "month": value["label"],
            "version": version,
            "observations": int(value[field]["observation_count"]),
        }
        for value in receipt_replays
        for version, field in (
            ("First +5 minute snapshot", "first_version"),
            ("Corrected +15 minute snapshot", "corrected_version"),
        )
    ]
    latency_rows = [
        {
            "request": "Single path",
            "p95_ms": float(service["path_p95_ms"]),
            "limit_ms": 50,
        },
        {
            "request": f"{int(service['surface_cells'])}-cell surface",
            "p95_ms": float(service["surface_p95_ms"]),
            "limit_ms": 3000,
        },
    ]
    source_band_rows = [
        {"band": band, "observations": int(observations)}
        for band, observations in wspr_live_connector_validation[
            "records_by_band"
        ].items()
    ]
    schedule_band_rows = [
        {"band": band, "observations": int(observations)}
        for band, observations in wspr_research_schedule_validation[
            "records_by_band"
        ].items()
    ]
    schedule_stage_rows = [
        {
            "stage": "Source observations",
            "count": int(wspr_research_schedule_validation["source_record_count"]),
        },
        {
            "stage": "Path-hour feature cells",
            "count": int(wspr_research_schedule_validation["feature_cell_count"]),
        },
    ]
    shadow_progress_rows = [
        {
            "window": "30-day receipt shadow",
            "state": "Completed",
            "hours": int(
                wspr_research_shadow_progress["window"]["completed_hours"]
            ),
        },
        {
            "window": "30-day receipt shadow",
            "state": "Remaining",
            "hours": max(
                0,
                int(wspr_research_shadow_progress["window"]["minimum_hours"])
                - int(wspr_research_shadow_progress["window"]["completed_hours"]),
            ),
        },
    ]
    gate_rows = [{
        "scope": "Foundation",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in foundation["gates"].items()] + [{
        "scope": "Multi-hour replay",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in replay["gates"].items()]
    gate_rows.extend({
        "scope": "Target PostgreSQL rollback",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in migration_validation["gates"].items())
    gate_rows.extend({
        "scope": "Post-deployment target",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in deployment_validation["gates"].items())
    gate_rows.extend({
        "scope": "Private health rollback",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in research_health_migration_validation["gates"].items())
    gate_rows.extend({
        "scope": "Private health deployment",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in research_health_deployment_validation["gates"].items())
    gate_rows.extend({
        "scope": "Private health endpoint",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in research_health_endpoint_validation["gates"].items())
    gate_rows.extend({
        "scope": "Trusted operational weather",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in operational_weather_validation["gates"].items())
    gate_rows.extend({
        "scope": "Signed hourly orchestration",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in orchestration_validation["gates"].items())
    gate_rows.extend({
        "scope": "Research source connector",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in wspr_live_connector_validation["gates"].items())
    gate_rows.extend({
        "scope": "Real target source hour",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in wspr_live_hour_validation["gates"].items())
    gate_rows.extend({
        "scope": "Active research schedule",
        "gate": name.replace("_", " "),
        "status": "pass" if passed else "fail",
    } for name, passed in wspr_research_schedule_validation["gates"].items())
    gate_rows.extend({
        "scope": "30-day research shadow",
        "gate": name.replace("_", " "),
        "status": (
            "pending"
            if name == "minimum_30_day_window_complete" and not passed
            else "pass" if passed else "fail"
        ),
    } for name, passed in wspr_research_shadow_progress["gates"].items())
    blocker_rows = [
        {
            "remaining_work": work,
            "status": "required before live NowCast",
        }
        for work in (
            "written subscriber-facing source authorization or a self-operated source",
            "remote alert-destination failure/recovery delivery smoke",
            "30-day real receipt-time shadow coverage and calibration evidence",
            "opt-in beta outcome evidence and frozen prospective evaluation",
        )
    ]
    limit_rows = [
        {"evidence_limit": value}
        for value in replay["remaining_limits"]
        if value
        not in {
            "target Postgres migration is not deployed",
            "authorized provider connector is not enabled",
        }
    ]
    limit_rows.append({
        "evidence_limit": (
            f"{wspr_research_shadow_progress['window']['completed_hours']} contiguous scheduled hours exist, but only one scheduled target has the expanded 28-gate exact-count audit"
        )
    })
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "live_feature_foundation_replay_and_active_research_shadow",
        "decision": "foundation_and_research_schedule_pass_permission_and_long_window_pending",
        "source_authorized": False,
        "migration_deployed": True,
        "provider_connector_enabled": True,
        "provider_connector_mode": "internal_research_only",
        "provider_connector_validated": True,
        "locked_outcomes_read": False,
        "input_inventory": [
            {"id": name, "path": relative(path), "sha256": sha256(path)}
            for name, path in INPUTS.items()
        ],
        "bundle": foundation["bundle"],
        "migration": {
            **foundation["migration"],
            "validation_scope": migration_validation["scope"],
            "database_engine": migration_validation["database"]["engine"],
            "database_version": migration_validation["database"]["server_version"],
            "transaction_mode": migration_validation["transaction_mode"],
            "persistent_changes": migration_validation["persistent_changes"],
            "pending_prerequisite_migrations": migration_validation.get(
                "pending_prerequisite_migrations", []
            ),
            "deployment_scope": deployment_validation["scope"],
            "deployment_gates": deployment_validation["gates"],
            "deployed_migrations": deployment_validation["migrations"],
        },
        "research_health": {
            "rollback_scope": research_health_migration_validation["scope"],
            "rollback_gates": research_health_migration_validation["gates"],
            "deployment_scope": research_health_deployment_validation["scope"],
            "deployment_gates": research_health_deployment_validation["gates"],
            "endpoint_scope": research_health_endpoint_validation["scope"],
            "endpoint_gates": research_health_endpoint_validation["gates"],
            "endpoint": research_health_endpoint_validation["endpoint"],
            "store": research_health_endpoint_validation["store"],
            "progress": research_health_endpoint_validation["progress"],
            "migration_deployed": True,
            "remote_endpoint_configured": True,
            "remote_heartbeat_delivered": True,
            "alert_delivery_configured": False,
            "public_view_enabled": False,
            "aggregate_only": True,
        },
        "transform": {
            "version": transform["transform"]["transform_version"],
            "target_hour": transform["target_hour"],
            "source_hashes": transform["inputs"],
            "compute": transform["compute"],
        },
        "replay": {
            "scope": replay["scope"],
            "receipt_time_evidence": replay["receipt_time_evidence"],
            "compute": replay["compute"],
        },
        "operational_weather": {
            "provider": operational_weather_validation["provider"],
            "weather": operational_weather_validation["weather"],
            "performance": operational_weather_validation["performance"],
            "gates": operational_weather_validation["gates"],
        },
        "orchestration": {
            "synthetic": orchestration_validation["synthetic"],
            "execution": orchestration_validation["execution"],
            "gates": orchestration_validation["gates"],
        },
        "research_connector": {
            "provider": wspr_live_connector_validation["provider"],
            "research_only": wspr_live_connector_validation["research_only"],
            "target_hour": wspr_live_connector_validation["target_hour"],
            "source_checkpoint_sha256": wspr_live_connector_validation[
                "source_checkpoint_sha256"
            ],
            "performance": wspr_live_connector_validation["performance"],
            "gates": wspr_live_connector_validation["gates"],
        },
        "real_source_hour": {
            "provider": wspr_live_hour_validation["provider"],
            "research_only": wspr_live_hour_validation["research_only"],
            "target_hour": wspr_live_hour_validation["target_hour"],
            "source_checkpoint_sha256": wspr_live_hour_validation[
                "source_checkpoint_sha256"
            ],
            "completion_manifest_sha256": wspr_live_hour_validation[
                "completion_manifest_sha256"
            ],
            "source_record_count": wspr_live_hour_validation[
                "source_record_count"
            ],
            "feature_cell_count": wspr_live_hour_validation[
                "feature_cell_count"
            ],
            "watermark_versions": wspr_live_hour_validation[
                "watermark_versions"
            ],
            "gates": wspr_live_hour_validation["gates"],
        },
        "research_schedule": {
            "provider": wspr_research_schedule_validation["provider"],
            "research_only": wspr_research_schedule_validation["research_only"],
            "subscriber_facing_authorized": wspr_research_schedule_validation[
                "subscriber_facing_authorized"
            ],
            "target_hour": wspr_research_schedule_validation["target_hour"],
            "source_record_count": wspr_research_schedule_validation[
                "source_record_count"
            ],
            "feature_cell_count": wspr_research_schedule_validation[
                "feature_cell_count"
            ],
            "connector": wspr_research_schedule_validation["connector"],
            "finalizer": wspr_research_schedule_validation["finalizer"],
            "health": wspr_research_schedule_validation["health"],
            "schedule": wspr_research_schedule_validation["schedule"],
            "watchdog": wspr_research_schedule_validation["watchdog"],
            "gates": wspr_research_schedule_validation["gates"],
        },
        "research_shadow_progress": {
            "decision": wspr_research_shadow_progress["decision"],
            "operational_status": wspr_research_shadow_progress[
                "operational_status"
            ],
            "window": wspr_research_shadow_progress["window"],
            "totals": wspr_research_shadow_progress["totals"],
            "performance": wspr_research_shadow_progress["performance"],
            "gates": wspr_research_shadow_progress["gates"],
        },
        "datasets": {
            "summary": summary,
            "parity_rows": parity_rows,
            "flow_rows": flow_rows,
            "receipt_rows": receipt_rows,
            "latency_rows": latency_rows,
            "source_band_rows": source_band_rows,
            "schedule_band_rows": schedule_band_rows,
            "schedule_stage_rows": schedule_stage_rows,
            "shadow_progress_rows": shadow_progress_rows,
            "gate_rows": gate_rows,
            "blocker_rows": blocker_rows,
            "limit_rows": limit_rows,
        },
    }


def build_artifact(evidence_path: Path, evidence: dict[str, Any]) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    summary = evidence["datasets"]["summary"][0]
    cards = [
        {
            "id": card_id,
            "description": description,
            "dataset": "summary",
            "sourceId": "live_feature_evidence",
            "metrics": [{"label": label, "field": field, "format": "number"}],
        }
        for card_id, label, field, description in (
            (
                "exact_diff",
                "Parity differences",
                "exact_differences",
                "Directional row and lag-cell differences; zero is required.",
            ),
            (
                "replay_hours",
                "Replayed hours",
                "replay_hours",
                "One deterministic sample from every UTC hour-of-day in both months.",
            ),
            (
                "replay_spots",
                "Replay spots",
                "replay_spots",
                "Open October-November bronze rows across the 48 selected hours.",
            ),
            (
                "receipt_rows",
                "Receipt-case rows",
                "receipt_rows",
                "Real open-month rows with synthetic arrival schedules.",
            ),
            (
                "path_latency",
                "Path p95 ms",
                "path_p95_ms",
                "Real A6 bundle with unavailable server provider.",
            ),
            (
                "surface_latency",
                "288-cell p95 ms",
                "surface_p95_ms",
                "One-thread XGBoost serving contract.",
            ),
            (
                "scheduled_rows",
                "Expanded-audit rows",
                "schedule_source_rows",
                "Scheduled receipt with the expanded exact-count target audit.",
            ),
            (
                "shadow_hours",
                "Shadow hours",
                "shadow_completed_hours",
                "Signed, identity-free receipts toward the required 720 hours.",
            ),
            (
                "private_health_gates",
                "Private health gates",
                "research_health_deployment_gates_passed",
                "Deployed private schema, replay, privacy, and transition-outbox gates.",
            ),
            (
                "remote_health_gates",
                "Remote health gates",
                "research_health_endpoint_gates_passed",
                "Signed protected-preview heartbeat, exact private-store state, and disabled public reader.",
            ),
        )
    ]
    charts = [
        chart(
            "parity",
            "Both open months reproduce the historical builder exactly",
            "Twenty-four stratified UTC hours per month; paired counts are identical for both representations.",
            "parity_rows",
            {
                "x": {"field": "month_and_cell", "type": "ordinal", "label": "Month and representation"},
                "y": {"field": "cells", "type": "quantitative", "label": "Cells"},
                "color": {"field": "implementation", "type": "nominal", "label": "Implementation"},
            },
        ),
        chart(
            "flow",
            "The 48-hour replay stays bounded through each transform stage",
            "Counts combine October and November and describe different intermediate objects.",
            "flow_rows",
            {
                "x": {"field": "stage", "type": "ordinal", "label": "Pipeline stage"},
                "y": {"field": "rows", "type": "quantitative", "label": "Rows or cells"},
            },
        ),
        chart(
            "receipts",
            "Late arrivals create corrected versions without overwriting history",
            "Ten percent of each real-row fixture arrives after the first cutoff; the corrected version restores exact parity.",
            "receipt_rows",
            {
                "x": {"field": "month", "type": "ordinal", "label": "Open month"},
                "y": {"field": "observations", "type": "quantitative", "label": "Observations included"},
                "color": {"field": "version", "type": "nominal", "label": "Feature version"},
            },
        ),
        chart(
            "latency",
            "Fail-closed shadow requests remain well inside service limits",
            "Measured on the real A6 bundle; missing verified path history selects physics fallback.",
            "latency_rows",
            {
                "x": {"field": "request", "type": "ordinal", "label": "Request"},
                "y": {"field": "p95_ms", "type": "quantitative", "label": "p95 milliseconds"},
            },
        ),
        chart(
            "source_band_coverage",
            "One settled research hour covers every HF band",
            f"A single bounded WSPR.live request streamed {summary['connector_rows']:,} archive-compatible observations without a target write.",
            "source_band_rows",
            {
                "x": {"field": "band", "type": "ordinal", "label": "Band"},
                "y": {"field": "observations", "type": "quantitative", "label": "Observations"},
            },
        ),
        chart(
            "scheduled_band_coverage",
            "The latest scheduled hour is complete across all ten HF bands",
            f"Target {summary['schedule_target_hour']} has {summary['schedule_source_rows']:,} exact observations; no raw station identity enters this report.",
            "schedule_band_rows",
            {
                "x": {"field": "band", "type": "ordinal", "label": "Band"},
                "y": {"field": "observations", "type": "quantitative", "label": "Observations"},
            },
        ),
        chart(
            "scheduled_pipeline",
            "The active hourly pipeline remains bounded",
            f"The source stage completed in {summary['schedule_connector_seconds']:.1f} seconds and finalization in {summary['schedule_finalizer_seconds']:.1f} seconds.",
            "schedule_stage_rows",
            {
                "x": {"field": "stage", "type": "ordinal", "label": "Scheduled stage"},
                "y": {"field": "count", "type": "quantitative", "label": "Rows or cells"},
            },
        ),
        chart(
            "shadow_progress",
            "The preregistered 30-day evidence clock is explicit",
            f"{summary['shadow_completed_hours']} of {summary['shadow_required_hours']} required hourly receipts are complete; current scheduled completion is {summary['shadow_completion_rate_percent']:.1f}%.",
            "shadow_progress_rows",
            {
                "x": {"field": "state", "type": "ordinal", "label": "Window state"},
                "y": {"field": "hours", "type": "quantitative", "label": "Hours"},
                "color": {"field": "state", "type": "nominal", "label": "State"},
            },
        ),
    ]
    tables = [
        {
            "id": "gate_table",
            "title": "Foundation, deployment, and research-shadow gates",
            "subtitle": "Every completed operational gate passes; the preregistered 30-day duration gate is explicitly pending.",
            "dataset": "gate_rows",
            "sourceId": "live_feature_evidence",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "scope", "label": "Scope", "type": "text"},
                {"field": "gate", "label": "Gate", "type": "text"},
                {"field": "status", "label": "Status", "type": "text"},
            ],
        },
        {
            "id": "limit_table",
            "title": "Evidence boundaries",
            "subtitle": "Synthetic receipt schedules test causality and recovery but do not replace a real live capture.",
            "dataset": "limit_rows",
            "sourceId": "live_feature_evidence",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "evidence_limit", "label": "Limit", "type": "text"},
            ],
        },
        {
            "id": "blocker_table",
            "title": "Required work before live NowCast",
            "subtitle": "The internal hourly shadow is active; source permission, duration, beta outcomes, and prospective evidence remain open.",
            "dataset": "blocker_rows",
            "sourceId": "live_feature_evidence",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "remaining_work", "label": "Remaining work", "type": "text"},
                {"field": "status", "label": "Status", "type": "text"},
            ],
        },
    ]
    blocks = [
        {
            "id": "title",
            "type": "markdown",
            "body": "# Propulse NowCast V4.2: research shadow validation report",
        },
        {
            "id": "answer",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "## The internal research shadow is active; product authorization and long-window evidence remain open\n\n"
                f"Across **{summary['replay_hours']} stratified hours** and **{summary['replay_spots']:,} open-month spots**, "
                f"the shared DuckDB transform produced **{summary['replay_opportunity_cells']:,}** opportunity cells and "
                f"**{summary['replay_path_cells']:,}** path-hour cells with **zero directional differences** from the "
                "historical builder. Two approximately 10,000-row receipt scenarios also recovered exact corrected snapshots after "
                "duplicates, reordering, and late arrivals. The real 50M A6 bundle rejected forged browser path-history values, "
                f"kept identity-free telemetry, and served a path at **{summary['path_p95_ms']:.2f} ms p95** and a "
                f"288-cell surface at **{summary['surface_p95_ms']:.2f} ms p95**. The six-migration release chain passed "
                f"**{summary['migration_gates_passed']} of {summary['migration_gates_total']}** rollback-only gates "
                "on the target PostgreSQL 17.6 database with its original object state restored, then passed "
                f"**{summary['deployment_gates_passed']} of {summary['deployment_gates_total']}** post-deployment gates. "
                f"The separate private research-health boundary passed **{summary['research_health_rollback_gates_passed']} of "
                f"{summary['research_health_rollback_gates_total']}** rollback gates and **{summary['research_health_deployment_gates_passed']} of "
                f"{summary['research_health_deployment_gates_total']}** deployed-state gates, with browser roles revoked and transition smoke rows rolled back. "
                f"Its protected-preview endpoint then passed **{summary['research_health_endpoint_gates_passed']} of "
                f"{summary['research_health_endpoint_gates_total']}** end-to-end gates from the M5: the signed aggregate heartbeat was accepted, "
                "the private singleton matched exactly, the healthy state queued no alert, and the public reader remained disabled. "
                f"Trusted operational weather then passed **{summary['weather_gates_passed']} of {summary['weather_gates_total']}** "
                f"gates with **{summary['weather_feature_count']} causal fields** at **{summary['weather_path_p95_ms']:.2f} ms** cached path p95. "
                f"Signed hourly orchestration passed **{summary['orchestration_gates_passed']} of {summary['orchestration_gates_total']}** "
                f"gates while allocating all **{summary['orchestration_threads']} M5 CPU threads** without oversubscription. "
                f"A real research-only source dry-run then passed **{summary['connector_gates_passed']} of {summary['connector_gates_total']}** "
                f"gates, streaming **{summary['connector_rows']:,} observations** in **{summary['connector_requests']} request** "
                f"at **{summary['connector_peak_rss_mib']:.1f} MiB peak RSS**. "
                f"The corrected end-to-end target hour passed **{summary['live_hour_gates_passed']} of {summary['live_hour_gates_total']}** "
                f"gates with **{summary['live_hour_feature_cells']:,} path cells** after its truncated first version was invalidated. "
                f"The hourly research LaunchAgent is now active and its latest audited receipt passed **{summary['schedule_gates_passed']} of "
                f"{summary['schedule_gates_total']} independent gates**: **{summary['schedule_source_rows']:,} observations** became "
                f"**{summary['schedule_feature_cells']:,} path cells** with zero consecutive failures, **{summary['schedule_peak_rss_mib']:.1f} MiB** "
                "peak connector RSS, and all 18 M5 compute threads bounded. Subscriber-facing WSPR use still requires written "
                "confirmation or an independently permitted source. The signed progress rollup is operationally healthy at "
                f"**{summary['shadow_completed_hours']} of {summary['shadow_required_hours']} hours** with "
                f"**{summary['shadow_missing_hours']} gaps**; it remains `collecting`, not 30-day evidence."
            ),
        },
        {"id": "cards", "type": "metric-strip", "cardIds": [card["id"] for card in cards]},
        {"id": "findings", "type": "markdown", "body": "## Exact feature semantics hold across both open months"},
        {"id": "parity_chart", "type": "chart", "chartId": "parity", "layout": "full"},
        {
            "id": "parity_explainer",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "The live and archive paths now call the same versioned transform. It reconstructs deterministic "
                "receiver opportunities from transmitter slots, then sums successes and opportunities across power "
                "bins before creating path-hour lag rates. Exact equality includes counts, successes, opportunity "
                "mass, sampled rows, and both cell sets. The replay selects one hour from every UTC hour-of-day stratum "
                "across October and November 2024, spanning each month from beginning to end. It did not inspect "
                "December, 2025, or prospective outcomes."
            ),
        },
        {"id": "flow_chart", "type": "chart", "chartId": "flow", "layout": "full"},
        {"id": "receipt_heading", "type": "markdown", "body": "## Arrival-time recovery is causal and versioned"},
        {"id": "receipt_chart", "type": "chart", "chartId": "receipts", "layout": "full"},
        {
            "id": "receipt_explainer",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "Each receipt case uses about 10,000 real bronze observations from a selected open-month hour. The "
                "fixture reverses storage order, retries deterministic duplicates, and delays ten percent of rows "
                "past the first five-minute cutoff. The finalizer preserves the first snapshot, writes a distinct "
                "corrected snapshot at fifteen minutes, and commits each watermark only after its feature pages. "
                "Both corrected snapshots match historical path cells with zero observed numeric difference. A third "
                "quality-flagged version remains degraded, and observations beyond the 30-hour bound or implausibly "
                "future event times are rejected. Two separate 64-target lookups then validate exact H-1/H-2/H-3/H-24 "
                "availability and rates, causal timestamps, and identical batch versus single responses. Receipt "
                "timestamps are synthetic because the archive lacks them."
            ),
        },
        {"id": "architecture_heading", "type": "markdown", "body": "## Server authority prevents client-side freshness forgery"},
        {
            "id": "architecture",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "**Authorized connector -> HMAC/checkpoint completion manifest -> private rolling observations -> bounded hourly DuckDB finalizer -> "
                "versioned path-hour cells and atomic watermarks -> service-role-only batched lookup -> A6 service.**\n\n"
                "The browser may request a path or surface but cannot supply trusted lag values or mark them fresh. "
                "The API deletes client lag features, obtains a complete matching server snapshot, and activates "
                "NowCast only when provider, transform version, watermark, availability time, and quality flags all "
                "pass. It also deletes every browser weather value and reconstructs the supported weather vector "
                "from provenance-rich `solar_snapshots`. Missing, partial, future, stale, or degraded data fails closed."
            ),
        },
        {"id": "latency_chart", "type": "chart", "chartId": "latency", "layout": "full"},
        {"id": "source_heading", "type": "markdown", "body": "## The research connector matches the live source schema"},
        {"id": "source_chart", "type": "chart", "chartId": "source_band_coverage", "layout": "full"},
        {
            "id": "source_explainer",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "The disabled-by-default connector queried one exact settled UTC hour from "
                "[WSPR.live](https://wspr.live/), covering all ten HF bands in one HTTP request. It applied the "
                "same grid, callsign, power, and SNR filters as the archive builder, streamed canonical rows through "
                "the M5 Projects volume, checksum-linked the completed response, and removed the spool after validation. "
                "The first target finalization then exposed a PostgREST 1,000-row response cap. All ten affected watermarks "
                "were marked failed, pagination was repaired to continue until an empty page, and manifest v2 added signed "
                "per-band counts that block watermark publication on any mismatch. The corrected run matched all 287,694 "
                f"source rows and published {summary['live_hour_feature_cells']:,} aggregate cells. This establishes one exact "
                "end-to-end hour, not subscriber-facing permission, continuous completeness, or an availability guarantee."
            ),
        },
        {
            "id": "schedule_heading",
            "type": "markdown",
            "body": "## The research-only hourly schedule is active and independently audited",
        },
        {
            "id": "schedule_band_chart",
            "type": "chart",
            "chartId": "scheduled_band_coverage",
            "layout": "full",
        },
        {
            "id": "schedule_pipeline_chart",
            "type": "chart",
            "chartId": "scheduled_pipeline",
            "layout": "full",
        },
        {
            "id": "schedule_explainer",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                f"At minute 15 each hour, a research-gated M5 LaunchAgent processes contiguous settled hours and writes an "
                f"identity-free atomic receipt only after all ten bands pass. The latest audited target, **{summary['schedule_target_hour']}**, contained "
                f"**{summary['schedule_source_rows']:,} observations** and **{summary['schedule_feature_cells']:,} feature cells**. "
                f"An independent validator made 21 exact target-store queries and passed **{summary['schedule_gates_passed']} of "
                f"{summary['schedule_gates_total']} gates**, including manifest signature/hash linkage, per-band observation and "
                "feature counts, complete watermarks, spool cleanup, zero health failures, launchd restart scheduling, owner-only "
                "permissions, and absence of secrets from the plist. Small transient spools and receipts use the M5 internal disk "
                "because LaunchAgents cannot open removable volumes; large training artifacts remain on the fast Projects volume. "
                "A separate watchdog runs at minutes 0 and 30, enforces the preregistered 7,200-second stale boundary, checks continuity, "
                "job state, UTC alignment, and a 2 GiB runtime cap, and sends changed failure/recovery states to macOS Notification Center. "
                "Its aggregate HMAC publisher, private service-role table, retryable alert outbox, and double-gated System Health reader are "
                "implemented. The M5 now publishes signed aggregate heartbeats through the protected feature preview into the dedicated "
                "private store. The alert destination, public server flag, and frontend build flag remain unset, so no remote escalation or "
                "subscriber-visible health state is active."
            ),
        },
        {
            "id": "shadow_progress_chart",
            "type": "chart",
            "chartId": "shadow_progress",
            "layout": "full",
        },
        {
            "id": "shadow_progress_explainer",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                f"The rollup currently records **{summary['shadow_completed_hours']} of {summary['shadow_required_hours']} required hours** "
                f"at **{summary['shadow_completion_rate_percent']:.1f}% scheduled completion** with **{summary['shadow_missing_hours']} gaps**. "
                "Every receipt is schema-checked, hash-linked to its signed completion manifest, and rechecked for all-band counts, causal "
                "timestamps, one bounded source request, the exact 2-by-9 M5 profile, and completion within 7,200 seconds. The decision remains "
                "`collecting` until at least 720 expected hours exist; the 99% operational gate does not waive the duration requirement."
            ),
        },
        {"id": "gates", "type": "table", "tableId": "gate_table", "layout": "full"},
        {"id": "method_heading", "type": "markdown", "body": "## Method, data, and execution"},
        {
            "id": "method",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "The replay uses 24 deterministic hours from each open WSPRnet archive month "
                "([archive](https://www.wsprnet.org/archive/)), checksum-linked to bronze and historical-opportunity "
                "Parquet inputs. DuckDB 1.5's hash engine "
                "is pinned because deterministic receiver sampling depends on it. The foundation validation loads "
                "the real A6 serving manifest, sends malicious 0.999 lag values with zero client freshness, and "
                "requires physics fallback for both path and surface APIs. It also scans emitted telemetry for grid "
                "and station-envelope fields. All six migrations were first executed in timestamp order inside a rollback-only transaction "
                "on the target PostgreSQL database, where RLS, grants, retention, pruning, completeness constraints, "
                "and the four-lag RPC were exercised before the original object state was verified. The same hashed chain was then "
                "deployed through the normal migration ledger and rechecked in place with rollback-only smoke rows. One read-only, "
                "research-only WSPR.live hour was queried after the connector was double-gated, then ingested into the private rolling "
                "store and finalized under signed per-band counts; neither raw rows nor outputs were exposed to users. "
                "Launchd-driven scheduled hours then exercised the receipt-based restart boundary, internal transient runtime, "
                "exact target-store audit, and identity-free health records. "
                "A separate private migration then established a service-role-only aggregate health singleton and transition outbox. "
                "It was rollback-tested, deployed through the normal ledger, and rechecked with equal-timestamp replay, alert, recovery, "
                "invalid-counter, grant, RLS, search-path, and identity-column tests; all smoke rows were rolled back. "
                "The protected feature-preview endpoint was then validated from the M5 with an independent HMAC secret and Vercel automation "
                "bypass header. Its dedicated store state matched the signed aggregate exactly, the public coarse reader stayed disabled, "
                "and no station, path, equipment, source-row, or credential field entered the evidence. "
                "A real hardened NOAA capture separately verified the operational-weather path against A6."
            ),
        },
        {
            "id": "compute",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "## Apple Silicon execution\n\n"
                f"All evidence was generated on native ARM64 with **{summary['visible_cpus']} M5 CPU cores**. The "
                "48-hour transform and receipt replay used 18 DuckDB threads. Research training remains two spawned XGBoost fits "
                "with nine LLVM OpenMP threads and four Arrow I/O threads each; single-process building and batch "
                "scoring use 18 CPU threads and six Arrow I/O threads. XGBoost has no supported Metal tree-training "
                "backend, so the GPU and Neural Engine are not silently substituted. API workers stay at one "
                "XGBoost thread each to avoid oversubscription under concurrent traffic. The hourly runner uses "
                "two concurrent band finalizers with nine DuckDB threads each on this M5 and rejects any larger product."
            ),
        },
        {
            "id": "limits",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "## Limits and robustness\n\n"
                "This is an implementation-equivalence, synthetic receipt, and fail-closed service test, not a "
                "live-source quality study. Forty-eight open hours establish broader transform equivalence, and the "
                "receipt fixtures establish deterministic causal recovery, but neither proves provider completeness, "
                "real arrival distributions, outage recovery, or 30-day shadow calibration. The deployed schema "
                f"plus one corrected source hour and {summary['shadow_completed_hours']} scheduled receipts do not prove 30-day provider completeness, permission for "
                "subscriber-facing use, outage recovery under a real failure, or remote webhook delivery. The signed heartbeat path is active, "
                "but the product-health reader remains intentionally hidden until alert/recovery delivery and the source release gate pass. Trusted weather "
                "has single-capture target evidence but still needs continuous freshness and outage evidence. WSPR receiver availability "
                "continues to mix propagation with network behavior, and 6m remains a separate model."
            ),
        },
        {"id": "limit_table_block", "type": "table", "tableId": "limit_table", "layout": "full"},
        {"id": "blockers", "type": "table", "tableId": "blocker_table", "layout": "full"},
        {
            "id": "next",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "## Next steps\n\n"
                "1. Record written subscriber-facing authorization for WSPR.live or operate a source we control.\n"
                "2. Accumulate at least 30 days of identity-free receipts and continuously audit pagination, counts, freshness, retention, restart, and fallback behavior.\n"
                "3. Configure a real HTTPS alert destination, smoke alert/recovery delivery, then enable the server and frontend health-view flags before beta.\n"
                "4. Run opt-in beta outcome collection before allowing verified fresh history to "
                "select NowCast. Keep the frozen August-September 2026 prospective protocol untouched."
            ),
        },
    ]
    source_spec = source(evidence_path)
    return {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Propulse NowCast V4.2: research shadow validation report",
            "description": "Multi-hour transform parity, causal receipt replay, active research scheduling, server-authoritative path history, M5 performance, privacy gates, and release blockers.",
            "generatedAt": generated_at,
            "cards": cards,
            "charts": charts,
            "tables": tables,
            "sources": [source_spec],
            "blocks": blocks,
        },
        "snapshot": {
            "version": 1,
            "generatedAt": generated_at,
            "status": "ready",
            "datasets": evidence["datasets"],
        },
        "sources": [source_spec],
    }


def markdown_summary(evidence: dict[str, Any]) -> str:
    summary = evidence["datasets"]["summary"][0]
    return f"""# Propulse NowCast V4.2: research shadow validation report

Generated: {evidence['generated_at']}

## Answer first

The server-authoritative live-feature foundation and open-month replay pass.
Across `{summary['replay_hours']}` stratified October-November hours and
`{summary['replay_spots']:,}` input spots, the shared transform exactly
reproduced `{summary['replay_opportunity_cells']:,}` opportunity cells and
`{summary['replay_path_cells']:,}` power-aggregated path-hour cells. Both
synthetic receipt scenarios recovered exact corrected snapshots after
duplicates, reordering, and late arrivals. The real A6 bundle blocked browser
freshness forgery and measured `{summary['path_p95_ms']:.2f}` ms path p95 and
`{summary['surface_p95_ms']:.2f}` ms for a 288-cell surface.

The six-migration schema is deployed, and trusted operational weather passed
`{summary['weather_gates_passed']}/{summary['weather_gates_total']}` real-bundle gates.
Signed hourly orchestration passed `{summary['orchestration_gates_passed']}/{summary['orchestration_gates_total']}`
gates with `{summary['orchestration_threads']}` bounded M5 threads.
The research-only connector passed `{summary['connector_gates_passed']}/{summary['connector_gates_total']}`
gates with `{summary['connector_rows']:,}` real observations in one bounded request
at `{summary['connector_peak_rss_mib']:.1f}` MiB peak RSS. The corrected end-to-end target
hour passed `{summary['live_hour_gates_passed']}/{summary['live_hour_gates_total']}`
gates and published `{summary['live_hour_feature_cells']:,}` aggregate path cells;
the truncated first watermark version is explicitly failed. The hourly research
LaunchAgent is now active: its latest audited receipt passed
`{summary['schedule_gates_passed']}/{summary['schedule_gates_total']}` independent
gates, converting `{summary['schedule_source_rows']:,}` observations into
`{summary['schedule_feature_cells']:,}` path cells with 18 bounded M5 threads.
The signed progress rollup is operationally healthy at
`{summary['shadow_completed_hours']}/{summary['shadow_required_hours']}` hours,
`{summary['shadow_completion_rate_percent']:.1f}%` scheduled completion, and
`{summary['shadow_missing_hours']}` gaps; its decision remains `collecting`.
Subscriber-facing use still requires source confirmation. Remote alert
configuration/delivery smoke and 30 days of real receipt-time shadow evidence
also remain open. The signed protected-preview heartbeat passed
`{summary['research_health_endpoint_gates_passed']}/{summary['research_health_endpoint_gates_total']}`
end-to-end gates; the double-gated public reader remains disabled.
See `REPORT.html` for charts,
methodology, privacy and fallback contracts, limitations, and next steps.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--output-dir", type=Path, default=RESULT)
    args = parser.parse_args()
    del args.profile
    output_dir = args.output_dir.resolve()
    try:
        output_dir.relative_to(ROOT)
    except ValueError as error:
        raise RuntimeError("report output must remain under the repository") from error
    validate_m5_runtime(read_json(CONFIG))
    transform = read_json(INPUTS["transform_parity"])
    foundation = read_json(INPUTS["foundation_validation"])
    replay = read_json(INPUTS["replay_validation"])
    migration_validation = read_json(INPUTS["migration_validation"])
    deployment_validation = read_json(INPUTS["deployment_validation"])
    research_health_migration_validation = read_json(
        INPUTS["research_health_migration_validation"]
    )
    research_health_deployment_validation = read_json(
        INPUTS["research_health_deployment_validation"]
    )
    research_health_endpoint_validation = read_json(
        INPUTS["research_health_endpoint_validation"]
    )
    operational_weather_validation = read_json(
        INPUTS["operational_weather_validation"]
    )
    orchestration_validation = read_json(INPUTS["orchestration_validation"])
    wspr_live_connector_validation = read_json(
        INPUTS["wspr_live_connector_validation"]
    )
    wspr_live_hour_validation = read_json(INPUTS["wspr_live_hour_validation"])
    wspr_research_schedule_validation = read_json(
        INPUTS["wspr_research_schedule_validation"]
    )
    wspr_research_shadow_progress = read_json(
        INPUTS["wspr_research_shadow_progress"]
    )
    evidence = build_evidence(
        transform,
        foundation,
        replay,
        migration_validation,
        deployment_validation,
        research_health_migration_validation,
        research_health_deployment_validation,
        research_health_endpoint_validation,
        operational_weather_validation,
        orchestration_validation,
        wspr_live_connector_validation,
        wspr_live_hour_validation,
        wspr_research_schedule_validation,
        wspr_research_shadow_progress,
    )
    evidence_path = output_dir / "FOUNDATION_REPORT_EVIDENCE.json"
    evidence_path.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    artifact = build_artifact(evidence_path, evidence)
    (output_dir / "REPORT.artifact.json").write_text(
        json.dumps(artifact, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "REPORT.md").write_text(markdown_summary(evidence), encoding="utf-8")
    print(output_dir / "REPORT.artifact.json")


if __name__ == "__main__":
    main()
