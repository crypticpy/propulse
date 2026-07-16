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
    if any(
        value.get("locked_outcomes_read")
        for value in (
            transform,
            foundation,
            replay,
            migration_validation,
            deployment_validation,
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
    blocker_rows = [
        {
            "remaining_work": work,
            "status": "required before live NowCast",
        }
        for work in (
            "written source authorization or a self-operated source",
            "authorized provider connector",
            "trusted server-authoritative operational-weather response",
            "production hourly finalizer, pruning scheduler, and monitoring",
            "30-day real receipt-time shadow coverage and calibration evidence",
        )
    ]
    limit_rows = [
        {"evidence_limit": value}
        for value in replay["remaining_limits"]
        if value != "target Postgres migration is not deployed"
    ]
    limit_rows.append({
        "evidence_limit": (
            "the schema is deployed and smoke-verified, but no authorized live source or production scheduler is active"
        )
    })
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "live_feature_foundation_replay_and_schema_deployment_pre_provider",
        "decision": "foundation_replay_and_schema_pass_provider_pending",
        "source_authorized": False,
        "migration_deployed": True,
        "provider_connector_enabled": False,
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
        "datasets": {
            "summary": summary,
            "parity_rows": parity_rows,
            "flow_rows": flow_rows,
            "receipt_rows": receipt_rows,
            "latency_rows": latency_rows,
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
    ]
    tables = [
        {
            "id": "gate_table",
            "title": "Foundation, replay, and deployment gates",
            "subtitle": "The real bundle, fallback, privacy, transform, receipt scenarios, migration contract, and deployed schema all pass.",
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
            "subtitle": "The private store is deployed, but no live provider or scheduled ingest is authorized.",
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
            "body": "# Propulse NowCast V4.2: live-feature foundation and replay report",
        },
        {
            "id": "answer",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "## The production-shaped foundation and open-month replay pass, but live WSPR is not enabled\n\n"
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
                "The schema is deployed and ready for authorized-source integration; no live provider or scheduler is approved."
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
                "**Authorized connector -> private rolling observations -> bounded hourly DuckDB finalizer -> "
                "versioned path-hour cells and atomic watermarks -> service-role-only batched lookup -> A6 service.**\n\n"
                "The browser may request a path or surface but cannot supply trusted lag values or mark them fresh. "
                "The API deletes client lag features, obtains a complete matching server snapshot, and activates "
                "NowCast only when provider, transform version, watermark, availability time, and quality flags all "
                "pass. Missing, partial, future, stale, or degraded data fails closed to the physics profile."
            ),
        },
        {"id": "latency_chart", "type": "chart", "chartId": "latency", "layout": "full"},
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
                "deployed through the normal migration ledger and rechecked in place with rollback-only smoke rows. No external live "
                "WSPR provider was queried."
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
                "XGBoost thread each to avoid oversubscription under concurrent traffic."
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
                "does not prove the hourly finalizer, pruning scheduler, or monitoring loop. Operational weather inputs also "
                "need the same server-authoritative treatment before active forecasts. WSPR receiver availability "
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
                "1. Obtain written authorization for a live WSPR source or operate a source we control.\n"
                "2. Implement the authorized connector without changing the shared transform.\n"
                "3. Expose trusted server-authoritative operational weather and schedule the hourly finalizer and pruning job.\n"
                "4. Run at least 30 days of identity-free real receipt-time shadow traffic before allowing verified fresh history to "
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
            "title": "Propulse NowCast V4.2: live-feature foundation and replay report",
            "description": "Multi-hour transform parity, causal receipt replay, server-authoritative path history, M5 performance, privacy gates, and live-source blockers.",
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
    return f"""# Propulse NowCast V4.2: live-feature foundation and replay report

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

The six-migration schema is deployed and passed post-deployment verification.
Live WSPR remains disabled pending source authorization, an authorized
connector, the production scheduler, trusted operational weather, and 30 days
of real receipt-time shadow evidence. See `REPORT.html` for charts, methodology, privacy
and fallback contracts, limitations, and next steps.
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
    evidence = build_evidence(
        transform,
        foundation,
        replay,
        migration_validation,
        deployment_validation,
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
