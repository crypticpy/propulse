#!/usr/bin/env python3
"""Generate the portable Phase 6 model and release-readiness report artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
PHASE2 = ROOT / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
LIVE = PHASE2 / "live_feature_pipeline"
DEFAULT_OUTPUT = LIVE / "phase6_report"
INPUTS = {
    "model": PHASE2 / "final_report/FINAL_REPORT_EVIDENCE.json",
    "release": LIVE / "phase6_release_readiness.json",
    "beta_rollback": LIVE / "propagation_beta_protocol_migration_validation.json",
    "beta_deployment": LIVE / "propagation_beta_protocol_deployment_validation.json",
    "wspr": LIVE / "wspr_research_shadow_progress.json",
    "coverage": LIVE / "wspr_shadow_coverage_drift.json",
    "capture": LIVE / "prospective_capture_readiness.json",
    "beta_config": ROOT / "ml/config/propagation_v4_2_beta_protocol.json",
    "beta_dry_run": LIVE / "synthetic_stationcast_beta_dry_run.json",
    "futurecast": ROOT / "ml/results/propagation_v4/futurecast_readiness.json",
    "six_meter": (
        ROOT
        / "ml/results/propagation_v4/propagation_v4_multiyear_50m"
        / "6m_release_decision.json"
    ),
}


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"report input is not an object: {path}")
    return value


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def canonical_source(evidence_path: Path) -> dict[str, Any]:
    location = relative(evidence_path)
    return {
        "id": "phase6_evidence",
        "label": "V4.2 Phase 6 model and release-readiness evidence",
        "path": location,
        "query": {
            "engine": "duckdb",
            "language": "sql",
            "description": f"Load the reviewed, checksum-linked evidence in {location}.",
            "sql": f"SELECT * FROM read_json_auto('{location}')",
            "tables_used": [location],
            "filters": [
                "Prospective outcomes remain unread",
                "No raw operator, WSPR source-row, or station inventory data",
                "Current mode decisions are fail-closed",
            ],
            "metric_definitions": {
                "relative_improvement": "(B2 Brier - A6 Brier) / B2 Brier on the named untouched scope.",
                "gate_completion": "Passed Boolean release gates divided by preregistered gates in the named track.",
                "collection_progress": "Observed continuous hours or legal issuance days divided by the frozen minimum.",
            },
        },
    }


def chart(
    chart_id: str,
    title: str,
    subtitle: str,
    dataset: str,
    category_field: str,
    category_label: str,
    value_field: str,
    value_label: str,
    *,
    value_format: str = "number",
) -> dict[str, Any]:
    return {
        "id": chart_id,
        "title": title,
        "subtitle": subtitle,
        "type": "bar",
        "dataset": dataset,
        "sourceId": "phase6_evidence",
        "encodings": {
            "x": {
                "field": category_field,
                "type": "ordinal",
                "label": category_label,
            },
            "y": {
                "field": value_field,
                "type": "quantitative",
                "label": value_label,
            },
        },
        "valueFormat": value_format,
        "layout": "full",
    }


def card(
    card_id: str,
    description: str,
    field: str,
    label: str,
    *,
    value_format: str = "number",
) -> dict[str, Any]:
    return {
        "id": card_id,
        "description": description,
        "dataset": "summary",
        "sourceId": "phase6_evidence",
        "metrics": [{"label": label, "field": field, "format": value_format}],
    }


def validate_inputs(values: dict[str, dict[str, Any]]) -> None:
    model = values["model"]
    release = values["release"]
    rollback = values["beta_rollback"]
    deployment = values["beta_deployment"]
    if model.get("prospective_read") is not False:
        raise RuntimeError("final model evidence opened prospective outcomes")
    if release.get("valid_fail_closed_decision") is not True:
        raise RuntimeError("Phase 6 decision is not a valid fail-closed decision")
    if release.get("locked_prospective_outcomes_read") is not False:
        raise RuntimeError("Phase 6 decision opened prospective outcomes")
    if rollback.get("decision") != "pass" or rollback.get("migration_deployed") is not False:
        raise RuntimeError("beta protocol rollback proof did not pass")
    if deployment.get("decision") != "pass" or deployment.get("migration_deployed") is not True:
        raise RuntimeError("beta protocol deployment proof did not pass")
    if rollback.get("locked_outcomes_read") is not False:
        raise RuntimeError("beta rollback proof read locked outcomes")
    if deployment.get("locked_outcomes_read") is not False:
        raise RuntimeError("beta deployment proof read locked outcomes")
    if values["capture"].get("prospective_window", {}).get("outcomes_read") is not False:
        raise RuntimeError("capture readiness opened prospective outcomes")
    if values["wspr"].get("locked_outcomes_read") is not False:
        raise RuntimeError("WSPR progress opened locked outcomes")
    coverage = values["coverage"]
    coverage_provenance = coverage.get("window", {}).get("provenance")
    if (
        coverage.get("decision") not in {"collecting", "pass"}
        or coverage.get("operational_status") != "healthy"
        or coverage.get("privacy", {}).get("locked_outcomes_read") is not False
        or coverage.get("privacy", {}).get("station_identity_written") is not False
        or coverage.get("privacy", {}).get("grid4_written") is not False
        or not isinstance(coverage_provenance, dict)
        or coverage_provenance.get("source_scope")
        != "wspr_research_shadow_progress"
        or coverage_provenance.get("progress_sha256") != sha256(INPUTS["wspr"])
        or coverage.get("gates", {}).get(
            "window_bound_to_signed_scheduled_receipts"
        )
        is not True
    ):
        raise RuntimeError("WSPR aggregate coverage evidence is invalid")
    beta = values["beta_dry_run"]
    if (
        beta.get("scope") != "synthetic_stationcast_beta_dry_run"
        or beta.get("decision") != "synthetic_pass"
        or beta.get("synthetic_gate_passed") is not True
        or beta.get("release_approved") is not False
    ):
        raise RuntimeError("StationCast scorer dry run did not preserve the synthetic boundary")
    if beta.get("inputs", {}).get("config_sha256") != sha256(INPUTS["beta_config"]):
        raise RuntimeError("StationCast scorer dry run used a different frozen config")
    runtime = beta.get("runtime", {})
    if (
        runtime.get("machine") != "arm64"
        or runtime.get("physical_cores_visible") != runtime.get("polars_threads")
    ):
        raise RuntimeError("StationCast scorer did not use all visible M5 cores")
    if any(beta.get("privacy", {}).values()):
        raise RuntimeError("StationCast scorer dry run exposed private data")


def build_evidence(values: dict[str, dict[str, Any]]) -> dict[str, Any]:
    validate_inputs(values)
    model = values["model"]
    release = values["release"]
    rollback = values["beta_rollback"]
    deployment = values["beta_deployment"]
    wspr = values["wspr"]
    coverage = values["coverage"]
    capture = values["capture"]
    futurecast = values["futurecast"]
    six_meter = values["six_meter"]
    beta_dry_run = values["beta_dry_run"]
    model_summary = model["datasets"]["summary"][0]
    locked_scope = model["datasets"]["locked_scope"]
    gates = release["gates"]

    groups = {
        "Frozen model": (
            "archive_candidate_frozen_and_passed",
            "phase3_serving_candidate_validated",
            "phase3_native_m5_openmp_evidence",
        ),
        "Live data": (
            "prospective_capture_has_24_continuous_hours",
            "wspr_shadow_has_720_hours_at_99_percent",
            "wspr_aggregate_coverage_and_drift_passed",
            "subscriber_recent_path_source_authorized",
        ),
        "Operations": (
            "research_health_boundaries_deployed",
            "stale_and_recovery_incident_exercised",
            "literal_full_m5_outage_exercised",
        ),
        "Personalized beta": (
            "participation_boundary_deployed",
            "beta_protocol_boundary_deployed",
            "beta_telemetry_boundary_deployed",
            "beta_stop_event_producers_validated",
            "beta_protocol_preregistered",
            "stationcast_beta_passed",
        ),
        "Locked prospective": (
            "prospective_window_closed",
            "nowcast_prospective_evaluation_passed",
        ),
        "Future modes": (
            "learned_stationcast_release_evidence_passed",
            "futurecast_90_day_horizon_evidence_passed",
            "six_meter_mechanism_release_evidence_passed",
        ),
    }
    gate_group_rows = []
    for track, names in groups.items():
        passed_count = sum(gates.get(name) is True for name in names)
        gate_group_rows.append({
            "track": track,
            "passed": passed_count,
            "required": len(names),
            "completion": passed_count / len(names),
        })

    wspr_hours = float(wspr["window"]["completed_hours"])
    wspr_required = float(wspr["window"]["minimum_hours"])
    coverage_hours = float(coverage["window"]["completed_hours"])
    coverage_required = float(coverage["window"]["required_hours"])
    capture_hours = float(capture["continuity"]["hours"])
    capture_required = float(capture["continuity"]["minimum_hours"])
    future_days = min(
        int(info.get("longest_consecutive_common_days", 0))
        for info in futurecast["horizons"].values()
    )
    future_required = int(futurecast["minimum_distinct_capture_days"])
    collection_progress_rows = [
        {
            "evidence_track": "First-party capture",
            "observed": capture_hours,
            "required": capture_required,
            "unit": "continuous hours",
            "completion": min(capture_hours / capture_required, 1.0),
        },
        {
            "evidence_track": "WSPR shadow",
            "observed": wspr_hours,
            "required": wspr_required,
            "unit": "completed hours",
            "completion": min(wspr_hours / wspr_required, 1.0),
        },
        {
            "evidence_track": "Aggregate coverage",
            "observed": coverage_hours,
            "required": coverage_required,
            "unit": "complete all-band hours",
            "completion": min(coverage_hours / coverage_required, 1.0),
        },
        {
            "evidence_track": "FutureCast issuance",
            "observed": future_days,
            "required": future_required,
            "unit": "consecutive legal days",
            "completion": min(future_days / future_required, 1.0),
        },
    ]

    required_by_mode = {
        "core_nowcast": 12,
        "stationcast_deterministic": 15,
        "stationcast_learned": 1,
        "futurecast": 1,
        "six_meter": 1,
        "system_health_view": 10,
    }
    mode_rows = []
    for mode, decision in release["mode_decisions"].items():
        required = required_by_mode[mode]
        remaining = len(decision["blockers"])
        mode_rows.append({
            "mode": mode.replace("_", " "),
            "status": decision["status"],
            "passed": required - remaining,
            "required": required,
            "completion": (required - remaining) / required,
            "remaining": remaining,
        })

    gate_rows = [
        {
            "gate": name.replace("_", " "),
            "status": "pass" if passed_gate else "pending",
            "passed": passed_gate,
        }
        for name, passed_gate in gates.items()
    ]
    beta_metric_rows = [
        {
            "model": "Frozen core",
            "brier": float(beta_dry_run["metrics"]["core"]["brier"]),
            "ece": float(beta_dry_run["metrics"]["core"]["ece"]),
            "synthetic": True,
        },
        {
            "model": "Deterministic StationCast",
            "brier": float(beta_dry_run["metrics"]["stationcast"]["brier"]),
            "ece": float(beta_dry_run["metrics"]["stationcast"]["ece"]),
            "synthetic": True,
        },
    ]
    beta_gate_rows = [
        {
            "gate": name.replace("_", " "),
            "status": "exercised" if passed else "failed",
            "passed": passed,
            "evidence": "synthetic only",
        }
        for name, passed in beta_dry_run["gates"].items()
    ]
    next_steps = [
        {
            "order": 1,
            "action": "Sustain nonempty first-party capture for 24 continuous hours",
            "why": "Proves the capture, settle, aggregate, and watchdog path before beta use.",
            "current": f"{capture_hours:.2f}/{capture_required:.0f} hours",
        },
        {
            "order": 2,
            "action": "Accumulate 720 permitted receipt-time WSPR shadow hours",
            "why": "Measures real completeness, gaps, freshness, latency, and fallback behavior.",
            "current": f"{int(wspr_hours)}/{int(wspr_required)} hours",
        },
        {
            "order": 3,
            "action": "Obtain written subscriber-source authorization or operate an independent source",
            "why": "Research-only WSPR access cannot authorize product-serving recent-path features.",
            "current": "missing signed authorization artifact",
        },
        {
            "order": 4,
            "action": "Run the coordinated literal M5 power-loss recovery proof",
            "why": "Must prove off-device detection and genuine restart without sacrificing the active duration clocks.",
            "current": "not yet run",
        },
        {
            "order": 5,
            "action": "Validate every aggregate stop-event producer end to end",
            "why": "An unused counter is not an observed zero; model-service and scheduled-monitor events must reach the signed receipt.",
            "current": "participation API categories wired; model and aggregate-monitor categories pending",
        },
        {
            "order": 6,
            "action": "Run opt-in alpha and preregistered StationCast beta",
            "why": "Only paired operator outcomes can support a personalization claim.",
            "current": "collection disabled; infrastructure deployed",
        },
        {
            "order": 7,
            "action": "Open the frozen 2026-08-01 through 2026-09-30 window once",
            "why": "The final NowCast release decision requires untouched prospective evidence.",
            "current": "future and unread",
        },
    ]
    blockers = sorted({
        blocker
        for decision in release["mode_decisions"].values()
        for blocker in decision["blockers"]
    })
    evidence_passed = sum(gates.values())
    evidence_total = len(gates)
    summary = [{
        "selected_candidate": model_summary["selected_candidate"],
        "archive_improvement": float(model_summary["archive_improvement"]),
        "locked_rows": int(model_summary["locked_rows"]),
        "archive_months_won": int(model_summary["archive_months_won"]),
        "archive_months_total": int(model_summary["archive_months_total"]),
        "release_gates_passed": evidence_passed,
        "release_gates_total": evidence_total,
        "beta_rollback_gates": sum(rollback["gates"].values()),
        "beta_rollback_total": len(rollback["gates"]),
        "beta_deployment_gates": sum(deployment["gates"].values()),
        "beta_deployment_total": len(deployment["gates"]),
        "wspr_hours": int(wspr_hours),
        "wspr_required_hours": int(wspr_required),
        "coverage_hours": int(coverage_hours),
        "coverage_required_hours": int(coverage_required),
        "coverage_utc_hours": len(coverage["coverage"]["observed_utc_hours"]),
        "coverage_distance_buckets": len(coverage["coverage"]["by_distance"]),
        "coverage_drift_sample_sufficient": bool(
            coverage["drift"]["sample_sufficient"]
        ),
        "capture_hours": capture_hours,
        "capture_required_hours": capture_required,
        "futurecast_days": future_days,
        "futurecast_required_days": future_required,
        "releaseable_modes": len(release["public_release"]["releaseable_modes"]),
        "mode_count": 5,
        "release_decision": release["decision"],
        "six_meter_decision": six_meter["decision"],
        "beta_dry_run_rows": int(beta_dry_run["primary_rows"]),
        "beta_dry_run_participants": int(beta_dry_run["participants"]),
        "beta_dry_run_gates": sum(beta_dry_run["gates"].values()),
        "beta_dry_run_gate_total": len(beta_dry_run["gates"]),
        "beta_dry_run_relative_brier_improvement": float(
            beta_dry_run["metrics"]["relative_brier_improvement"]
        ),
        "beta_dry_run_release_approved": beta_dry_run["release_approved"],
    }]
    inventory = {
        name: {
            "path": relative(path),
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
        }
        for name, path in INPUTS.items()
    }
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "phase6_technical_model_and_release_readiness",
        "decision": release["decision"],
        "locked_prospective_outcomes_read": False,
        "input_inventory": inventory,
        "datasets": {
            "summary": summary,
            "locked_scope_rows": locked_scope,
            "gate_group_rows": gate_group_rows,
            "collection_progress_rows": collection_progress_rows,
            "mode_rows": mode_rows,
            "gate_rows": gate_rows,
            "beta_metric_rows": beta_metric_rows,
            "beta_gate_rows": beta_gate_rows,
            "next_steps": next_steps,
            "blocker_rows": [
                {"blocker": blocker.replace("_", " "), "status": "required"}
                for blocker in blockers
            ],
        },
        "release_readiness": release,
        "beta_boundary": {
            "rollback": rollback,
            "deployment": deployment,
            "synthetic_scorer_dry_run": beta_dry_run,
        },
    }


def build_artifact(evidence_path: Path, evidence: dict[str, Any]) -> dict[str, Any]:
    summary = evidence["datasets"]["summary"][0]
    source = canonical_source(evidence_path)
    cards = [
        card(
            "archive_improvement",
            "Weighted Brier improvement versus frozen V3/B2 across the untouched 2025 archive.",
            "archive_improvement",
            "Locked 2025 improvement",
            value_format="percent",
        ),
        card(
            "locked_rows",
            "Untouched December 2024 plus four locked 2025 archive months.",
            "locked_rows",
            "Locked rows scored",
        ),
        card(
            "release_gates",
            "Passed mode-specific gates; pending evidence remains fail-closed.",
            "release_gates_passed",
            "Release gates passed",
        ),
        card(
            "beta_database",
            "Deployed PostgreSQL beta-protocol gates, including the exact ledger check.",
            "beta_deployment_gates",
            "Beta DB gates passed",
        ),
        card(
            "beta_scorer",
            "Frozen StationCast gates exercised with synthetic data; this can never authorize release.",
            "beta_dry_run_gates",
            "Synthetic scorer gates",
        ),
        card(
            "wspr_hours",
            "Completed, signed, all-band receipt-time shadow hours toward the 720-hour minimum.",
            "wspr_hours",
            "WSPR hours",
        ),
        card(
            "futurecast_days",
            "Minimum consecutive common legal issuance days across +3/+6/+12/+24 hours.",
            "futurecast_days",
            "FutureCast days",
        ),
    ]
    charts = [
        chart(
            "locked_improvement",
            "A6 relative Brier improvement on untouched scopes",
            "Weighted opportunity Brier versus frozen V3/B2; positive is better. December and all four 2025 months were opened only after candidate freeze.",
            "locked_scope_rows",
            "scope",
            "Untouched scope",
            "relative_improvement",
            "Relative Brier improvement",
            value_format="percent",
        ),
        chart(
            "gate_tracks",
            "Release-gate completion by evidence track",
            "Passed preregistered gates divided by required gates; incomplete tracks do not borrow evidence from completed tracks.",
            "gate_group_rows",
            "track",
            "Evidence track",
            "completion",
            "Gate completion",
            value_format="percent",
        ),
        chart(
            "synthetic_beta_brier",
            "Frozen StationCast scorer dry run",
            "Brier loss on a reproducible synthetic cohort; lower is better. This validates scorer behavior only and is not model evidence.",
            "beta_metric_rows",
            "model",
            "Model input",
            "brier",
            "Synthetic Brier loss",
        ),
        chart(
            "collection_progress",
            "Elapsed collection progress toward frozen minimums",
            "Continuous hours or legal issuance days divided by the preregistered minimum; these clocks are not model-accuracy scores.",
            "collection_progress_rows",
            "evidence_track",
            "Evidence track",
            "completion",
            "Minimum completed",
            value_format="percent",
        ),
        chart(
            "mode_readiness",
            "Required evidence complete by mode",
            "Passed mode-specific release gates divided by required gates. Unsupported future modes may remain withheld without weakening supported-mode claims.",
            "mode_rows",
            "mode",
            "Mode",
            "completion",
            "Required evidence complete",
            value_format="percent",
        ),
    ]
    tables = [
        {
            "id": "mode_table",
            "title": "Current mode decisions",
            "subtitle": "Release remains mode-specific; no product flag is enabled by this report.",
            "dataset": "mode_rows",
            "sourceId": "phase6_evidence",
            "density": "dense",
            "layout": "full",
            "defaultSort": {"field": "completion", "direction": "desc"},
            "columns": [
                {"field": "mode", "label": "Mode", "type": "text"},
                {"field": "status", "label": "Decision", "type": "text"},
                {
                    "field": "completion",
                    "label": "Complete",
                    "type": "number",
                    "format": "percent",
                },
                {"field": "remaining", "label": "Remaining", "type": "number"},
            ],
        },
        {
            "id": "beta_gate_table",
            "title": "Frozen StationCast scorer gates",
            "subtitle": "Exercised with synthetic inputs only; every row remains non-releasing until the real opt-in beta is complete.",
            "dataset": "beta_gate_rows",
            "sourceId": "phase6_evidence",
            "density": "dense",
            "layout": "full",
            "defaultSort": {"field": "gate", "direction": "asc"},
            "columns": [
                {"field": "gate", "label": "Gate", "type": "text"},
                {"field": "status", "label": "Dry-run result", "type": "text"},
                {"field": "evidence", "label": "Evidence", "type": "text"},
            ],
        },
        {
            "id": "next_steps_table",
            "title": "Ordered work before a supported release",
            "subtitle": "Time and permission gates are evidence requirements, not engineering tasks that can be marked complete early.",
            "dataset": "next_steps",
            "sourceId": "phase6_evidence",
            "density": "comfortable",
            "layout": "full",
            "defaultSort": {"field": "order", "direction": "asc"},
            "columns": [
                {"field": "order", "label": "Order", "type": "number"},
                {"field": "action", "label": "Action", "type": "text"},
                {"field": "current", "label": "Current evidence", "type": "text"},
            ],
        },
        {
            "id": "gate_table",
            "title": "All Phase 6 release gates",
            "subtitle": "A pending gate is a blocker for only the modes whose preregistration names it.",
            "dataset": "gate_rows",
            "sourceId": "phase6_evidence",
            "density": "dense",
            "layout": "full",
            "defaultSort": {"field": "status", "direction": "asc"},
            "columns": [
                {"field": "gate", "label": "Gate", "type": "text"},
                {"field": "status", "label": "Status", "type": "text"},
            ],
        },
    ]
    blocks = [
        {
            "id": "title",
            "type": "markdown",
            "body": "# Propulse NowCast V4.2: model and Phase 6 readiness report",
        },
        {
            "id": "technical_summary",
            "type": "markdown",
            "sourceId": "phase6_evidence",
            "body": (
                "## The core is strong retrospectively; the product release is correctly withheld\n\n"
                f"Frozen A6 improved weighted Brier by **{summary['archive_improvement']:.3%}** versus frozen V3/B2 across "
                f"**{summary['locked_rows']:,} untouched rows**, winning all **{summary['archive_months_won']} of "
                f"{summary['archive_months_total']}** locked 2025 months. The model artifact, native M5/OpenMP serving path, "
                "health boundary, consent boundary, and privacy-bounded beta database are validated. That is enough to call "
                "A6 a credible retrospective NowCast core, but not enough to claim subscriber-facing live or personalized performance. "
                f"Only **{summary['release_gates_passed']} of {summary['release_gates_total']}** Phase 6 gates currently pass, so "
                "core and deterministic StationCast remain shadow-only; learned StationCast, FutureCast, and 6m remain withheld. "
                "The August-September prospective outcomes are still unread."
            ),
        },
        {
            "id": "metrics",
            "type": "metric-strip",
            "cardIds": [card_item["id"] for card_item in cards],
        },
        {
            "id": "performance_heading",
            "type": "markdown",
            "body": "## A6 improves every locked month, but this establishes the core only",
        },
        {"id": "performance_chart", "type": "chart", "chartId": "locked_improvement", "layout": "full"},
        {
            "id": "performance_explainer",
            "type": "markdown",
            "sourceId": "phase6_evidence",
            "body": (
                "A6 is a frozen 70% recent-cycle A4 and 30% recency-weighted A5 probability blend. The comparison baseline is the "
                "strongest frozen V3/B2 model, not a weak climatology. Positive improvement in December and every 2025 month is the "
                "main reason the core is promising: the result is broad across time and was obtained after the candidate and scorer "
                "were frozen. It does not measure live source availability, operator equipment benefit, +3 to +24 hour forecasts, or 6m mechanisms."
            ),
        },
        {
            "id": "readiness_heading",
            "type": "markdown",
            "body": "## Completed engineering cannot substitute for missing real-world evidence",
        },
        {"id": "gate_chart", "type": "chart", "chartId": "gate_tracks", "layout": "full"},
        {
            "id": "gate_explainer",
            "type": "markdown",
            "sourceId": "phase6_evidence",
            "body": (
                f"The beta migration passed **{summary['beta_rollback_gates']} of {summary['beta_rollback_total']} rollback gates** "
                f"and **{summary['beta_deployment_gates']} of {summary['beta_deployment_total']} deployed-state gates** on PostgreSQL 17.6. "
                "Signed receipt v2 records only fixed capability classes and the server-selected profile. The four equipment classes are "
                "persisted only under separate derived-equipment consent; removing that purpose scrubs them atomically. Removing outcome "
                "consent or withdrawing deletes retained predictions, attempts, and outcomes. A daily service-role job enforces the 24-month maximum. "
                "Those controls make a beta safe to start later; they do not manufacture beta evidence now."
            ),
        },
        {
            "id": "beta_dry_run_heading",
            "type": "markdown",
            "body": "## The beta scorer is frozen and tested, not passed with operators",
        },
        {"id": "beta_dry_run_chart", "type": "chart", "chartId": "synthetic_beta_brier", "layout": "full"},
        {
            "id": "beta_dry_run_explainer",
            "type": "markdown",
            "sourceId": "phase6_evidence",
            "body": (
                f"The actual Polars scorer processed a reproducible **{summary['beta_dry_run_rows']:,}-row, "
                f"{summary['beta_dry_run_participants']}-participant, 30-day synthetic cohort** on native ARM64 using every visible core. "
                f"It exercised **{summary['beta_dry_run_gates']} of {summary['beta_dry_run_gate_total']} gates**, including the 10% participant cap, "
                "operator-cluster bootstrap, calibration guardrails, Tier-A sensitivity, and reportable-stratum regression checks. The synthetic "
                f"Brier improvement was **{summary['beta_dry_run_relative_brier_improvement']:.2%}**, but the receipt hard-codes "
                "`release_approved: false`. The number is fixture behavior, not an estimate of real StationCast performance."
            ),
        },
        {"id": "beta_gate_table_block", "type": "table", "tableId": "beta_gate_table", "layout": "full"},
        {
            "id": "collection_heading",
            "type": "markdown",
            "body": "## The remaining clocks have only begun",
        },
        {"id": "collection_chart", "type": "chart", "chartId": "collection_progress", "layout": "full"},
        {
            "id": "collection_explainer",
            "type": "markdown",
            "sourceId": "phase6_evidence",
            "body": (
                f"First-party prospective capture is at **{summary['capture_hours']:.2f}/{summary['capture_required_hours']:.0f} continuous hours**; "
                f"the permitted WSPR research shadow is at **{summary['wspr_hours']}/{summary['wspr_required_hours']} signed hours**; "
                f"the independent aggregate coverage audit spans **{summary['coverage_hours']}/{summary['coverage_required_hours']} all-band hours**, "
                f"**{summary['coverage_utc_hours']}/24 UTC strata**, and **{summary['coverage_distance_buckets']} distance buckets**; and FutureCast has "
                f"**{summary['futurecast_days']}/{summary['futurecast_required_days']} consecutive legal issuance days**. WSPR research access remains "
                "research-only until a separate signed subscriber authorization artifact exists. Early/late source drift stays pending until two "
                "non-overlapping seven-day windows exist. The literal full-M5 outage proof is deliberately "
                "not simulated from a missing publisher: it must be a coordinated power-loss and genuine recovery event."
            ),
        },
        {
            "id": "mode_heading",
            "type": "markdown",
            "body": "## Release decisions stay separate by model and claim",
        },
        {"id": "mode_chart", "type": "chart", "chartId": "mode_readiness", "layout": "full"},
        {"id": "mode_table_block", "type": "table", "tableId": "mode_table", "layout": "full"},
        {
            "id": "mode_explainer",
            "type": "markdown",
            "sourceId": "phase6_evidence",
            "body": (
                "Core NowCast needs untouched prospective evidence in addition to live-source and outage proof. Deterministic StationCast needs its "
                "paired opt-in beta. Learned StationCast needs a new preregistered split and model version. FutureCast needs 90 genuine issued-forecast "
                "days plus horizon skill; observed weather cannot be backfilled as forecasts. The experimental 6m mechanisms remain withheld despite "
                "strong development skill because mechanism labels, GIRO/NWP validation, locked event/quiet evidence, and prospective tests are absent. "
                "Keeping unsupported modes withheld does not weaken a later claim limited to modes that actually pass."
            ),
        },
        {
            "id": "definitions_heading",
            "type": "markdown",
            "body": "## Scope, definitions, and experimental design",
        },
        {
            "id": "definitions",
            "type": "markdown",
            "sourceId": "phase6_evidence",
            "body": (
                "**Core NowCast** predicts the probability of one WSPR decode for an identity-free origin-grid4, target-grid4, band, issue time, "
                "current causal weather, and verified H-1/H-2/H-3/H-24 path history. **Physics fallback** is selected whenever that recent history is "
                "missing, stale, partial, mismatched, future-dated, or quality-flagged. **Deterministic StationCast** adjusts the same frozen core with "
                "the user's server-validated station envelope; the beta estimand is the paired weighted Brier delta versus the core. **Release candidate** "
                "means evidence permits a separate activation decision; this report never changes a product flag. The primary beta endpoint is supported "
                "WSPR reception. Contact and non-WSPR outcomes are secondary and cannot rescue a failed primary gate."
            ),
        },
        {
            "id": "limitations_heading",
            "type": "markdown",
            "body": "## What the current evidence does not establish",
        },
        {
            "id": "limitations",
            "type": "markdown",
            "sourceId": "phase6_evidence",
            "body": (
                "The locked archive is observational WSPR data and includes the receiver network; it does not prove causal equipment effects or "
                "generalize automatically to every mode. Operators self-select time, path, equipment, and reporting, so even a successful StationCast "
                "beta supports predictive utility rather than a causal equipment claim. The live WSPR candidate is not subscriber-authorized. A stale "
                "heartbeat incident proved the off-M5 control path but was not a physical outage. The 2026-08-01 through 2026-09-30 window has not begun, "
                "and its outcomes remain unread. Several aggregate stop counters still need validated model-service or scheduled-monitor producers; "
                "an unused counter cannot be interpreted as an observed zero. Current percentages in the collection chart are elapsed evidence, not accuracy."
            ),
        },
        {
            "id": "next_heading",
            "type": "markdown",
            "body": "## The next work is ordered by evidence dependency",
        },
        {"id": "next_table", "type": "table", "tableId": "next_steps_table", "layout": "full"},
        {
            "id": "further_questions",
            "type": "markdown",
            "body": (
                "## Further questions to answer with future evidence\n\n"
                "Which bands, broad regions, station-capability classes, and evidence tiers preserve the aggregate StationCast direction? "
                "How much of live performance changes under verified NowCast history versus physics fallback? Does a learned StationCast residual "
                "add stable value after deterministic physics without exploiting operator or receiver selection? Which FutureCast horizons retain "
                "skill over persistence and climatology after 90 legal issuance days? Can independently labeled 6m mechanisms pass both event and quiet-day gates?"
            ),
        },
        {"id": "all_gates", "type": "table", "tableId": "gate_table", "layout": "full"},
    ]
    return {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Propulse NowCast V4.2: model and Phase 6 readiness report",
            "description": "Technical model result, release evidence, blockers, and ordered next steps.",
            "generatedAt": evidence["generated_at"],
            "blocks": blocks,
            "cards": cards,
            "charts": charts,
            "tables": tables,
            "sources": [source],
        },
        "snapshot": {
            "version": 1,
            "status": "ready",
            "generatedAt": evidence["generated_at"],
            "datasets": evidence["datasets"],
        },
        "sources": [source],
    }


def markdown_summary(evidence: dict[str, Any]) -> str:
    summary = evidence["datasets"]["summary"][0]
    return f"""# Propulse NowCast V4.2: model and Phase 6 readiness report

## Technical summary

Frozen A6 improved weighted Brier by **{summary['archive_improvement']:.3%}**
versus frozen V3/B2 across **{summary['locked_rows']:,} untouched rows** and
won all four locked 2025 months. The current release decision is
**{summary['release_decision']}**: {summary['release_gates_passed']} of
{summary['release_gates_total']} mode-specific gates pass, no product mode is
releaseable, and prospective outcomes remain unread.

## Current clocks

- First-party capture: {summary['capture_hours']:.2f}/{summary['capture_required_hours']:.0f} continuous hours.
- Permitted WSPR shadow: {summary['wspr_hours']}/{summary['wspr_required_hours']} completed hours.
- FutureCast issuance history: {summary['futurecast_days']}/{summary['futurecast_required_days']} consecutive legal days.

## StationCast scorer dry run

The frozen scorer exercised {summary['beta_dry_run_gates']} of
{summary['beta_dry_run_gate_total']} preregistered gates on a reproducible
{summary['beta_dry_run_rows']:,}-row synthetic cohort using all visible M5
cores. Its receipt explicitly sets `release_approved` to `false`; this validates
the scorer and privacy boundary, not real operator performance.

## Decision

Core NowCast and deterministic StationCast remain shadow-only. Learned
StationCast, FutureCast, and 6m remain withheld. The interactive HTML report is
the primary artifact; this Markdown file is its compact semantic companion.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    args.output_dir = args.output_dir.expanduser().resolve()
    try:
        args.output_dir.relative_to(ROOT)
    except ValueError as error:
        raise RuntimeError("Phase 6 report output must remain inside the repository") from error
    validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    values = {name: read_json(path) for name, path in INPUTS.items()}
    evidence = build_evidence(values)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    evidence_path = args.output_dir / "PHASE6_REPORT_EVIDENCE.json"
    atomic_write(evidence_path, evidence)
    artifact = build_artifact(evidence_path, evidence)
    atomic_write(args.output_dir / "REPORT.artifact.json", artifact)
    (args.output_dir / "REPORT.md").write_text(
        markdown_summary(evidence),
        encoding="utf-8",
    )
    print(args.output_dir / "REPORT.artifact.json")


if __name__ == "__main__":
    main()
