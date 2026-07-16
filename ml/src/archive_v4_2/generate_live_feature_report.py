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
        "label": "V4.2 live-feature foundation evidence",
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
    transform: dict[str, Any], foundation: dict[str, Any]
) -> dict[str, Any]:
    if transform.get("decision") != "pass":
        raise RuntimeError("transform parity did not pass")
    if foundation.get("decision") != "pass":
        raise RuntimeError("foundation validation did not pass")
    if transform.get("locked_outcomes_read") or foundation.get("locked_outcomes_read"):
        raise RuntimeError("live-feature work must not read locked outcomes")

    parity = foundation["transform_parity"]
    service = foundation["service"]
    summary = [{
        "exact_differences": (
            int(parity["actual_minus_expected_rows"])
            + int(parity["expected_minus_actual_rows"])
            + int(parity["actual_minus_expected_lag_cells"])
            + int(parity["expected_minus_actual_lag_cells"])
        ),
        "opportunity_cells": int(parity["actual_rows"]),
        "lag_cells": int(parity["actual_lag_cells"]),
        "transform_wall_seconds": float(transform["compute"]["wall_seconds"]),
        "path_p95_ms": float(service["path_p95_ms"]),
        "surface_p95_ms": float(service["surface_p95_ms"]),
        "visible_cpus": int(foundation["compute"]["visible_cpus"]),
        "foundation_gates_passed": sum(
            bool(value) for value in foundation["gates"].values()
        ),
        "foundation_gates_total": len(foundation["gates"]),
    }]
    parity_rows = [
        {
            "cell_type": "Opportunity path/power/hour",
            "implementation": implementation,
            "cells": int(parity[field]),
        }
        for implementation, field in (
            ("Historical builder", "expected_rows"),
            ("Shared live transform", "actual_rows"),
        )
    ] + [
        {
            "cell_type": "Path/hour after power aggregation",
            "implementation": implementation,
            "cells": int(parity[field]),
        }
        for implementation, field in (
            ("Historical builder", "expected_lag_cells"),
            ("Shared live transform", "actual_lag_cells"),
        )
    ]
    flow_rows = [
        {"stage": "Open-hour input spots", "rows": int(parity["input_spot_rows"])},
        {"stage": "Deterministic sampled rows", "rows": int(parity["actual_sampled_rows"])},
        {"stage": "Opportunity cells", "rows": int(parity["actual_rows"])},
        {"stage": "Power-aggregated lag cells", "rows": int(parity["actual_lag_cells"])},
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
    gate_rows = [
        {
            "gate": name.replace("_", " "),
            "status": "pass" if passed else "fail",
        }
        for name, passed in foundation["gates"].items()
    ]
    blocker_rows = [
        {"remaining_work": blocker, "status": "required before live NowCast"}
        for blocker in foundation["remaining_blockers"]
    ]
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "live_feature_foundation_pre_provider",
        "decision": "foundation_pass_provider_pending",
        "source_authorized": False,
        "migration_deployed": False,
        "provider_connector_enabled": False,
        "locked_outcomes_read": False,
        "input_inventory": [
            {"id": name, "path": relative(path), "sha256": sha256(path)}
            for name, path in INPUTS.items()
        ],
        "bundle": foundation["bundle"],
        "migration": foundation["migration"],
        "transform": {
            "version": transform["transform"]["transform_version"],
            "target_hour": transform["target_hour"],
            "source_hashes": transform["inputs"],
            "compute": transform["compute"],
        },
        "datasets": {
            "summary": summary,
            "parity_rows": parity_rows,
            "flow_rows": flow_rows,
            "latency_rows": latency_rows,
            "gate_rows": gate_rows,
            "blocker_rows": blocker_rows,
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
                "opportunity_cells",
                "Opportunity cells",
                "opportunity_cells",
                "Exact open-hour path/power/hour cells.",
            ),
            (
                "lag_cells",
                "Lag cells",
                "lag_cells",
                "Path/hour cells after aggregation across power bins.",
            ),
            (
                "transform_wall",
                "Transform seconds",
                "transform_wall_seconds",
                "One open archive hour on 18 M5 DuckDB threads.",
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
            "The shared live transform exactly reproduces the archive builder",
            "An open October 2024 hour; paired counts must be identical for both intermediate representations.",
            "parity_rows",
            {
                "x": {"field": "cell_type", "type": "ordinal", "label": "Cell representation"},
                "y": {"field": "cells", "type": "quantitative", "label": "Cells"},
                "color": {"field": "implementation", "type": "nominal", "label": "Implementation"},
            },
        ),
        chart(
            "flow",
            "One open hour stays bounded through each transform stage",
            "Counts describe different intermediate objects and are shown to make materialization scale explicit.",
            "flow_rows",
            {
                "x": {"field": "stage", "type": "ordinal", "label": "Pipeline stage"},
                "y": {"field": "rows", "type": "quantitative", "label": "Rows or cells"},
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
            "title": "Foundation validation gates",
            "subtitle": "The real bundle, service fallback, privacy, transform, and migration contract all pass.",
            "dataset": "gate_rows",
            "sourceId": "live_feature_evidence",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "gate", "label": "Gate", "type": "text"},
                {"field": "status", "label": "Status", "type": "text"},
            ],
        },
        {
            "id": "blocker_table",
            "title": "Required work before live NowCast",
            "subtitle": "A passing foundation does not authorize a provider or deploy the private store.",
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
            "body": "# Propulse NowCast V4.2: live-feature foundation report",
        },
        {
            "id": "answer",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "## The production-shaped foundation passes, but live WSPR is not enabled\n\n"
                f"The shared DuckDB transform produced **{summary['opportunity_cells']:,}** opportunity cells and "
                f"**{summary['lag_cells']:,}** power-aggregated lag cells with **zero directional differences** "
                "from the historical builder. The real 50M A6 bundle rejected forged browser path-history values, "
                f"kept identity-free telemetry, and served a path at **{summary['path_p95_ms']:.2f} ms p95** and a "
                f"288-cell surface at **{summary['surface_p95_ms']:.2f} ms p95**. This approves the foundation for "
                "authorized-source integration. It does not claim that the private migration is deployed or that a live provider is approved."
            ),
        },
        {"id": "cards", "type": "metric-strip", "cardIds": [card["id"] for card in cards]},
        {"id": "findings", "type": "markdown", "body": "## Exact feature semantics are the primary result"},
        {"id": "parity_chart", "type": "chart", "chartId": "parity", "layout": "full"},
        {
            "id": "parity_explainer",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "The live and archive paths now call the same versioned transform. It reconstructs deterministic "
                "receiver opportunities from transmitter slots, then sums successes and opportunities across power "
                "bins before creating path-hour lag rates. Exact equality includes counts, successes, opportunity "
                "mass, sampled rows, and both cell sets. The parity test used only an already-open October 2024 hour "
                "and did not inspect December, 2025, or prospective outcomes."
            ),
        },
        {"id": "flow_chart", "type": "chart", "chartId": "flow", "layout": "full"},
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
                "The parity fixture is one open WSPRnet archive hour ([archive](https://www.wsprnet.org/archive/)), "
                "checksum-linked to its bronze and historical-opportunity Parquet inputs. DuckDB 1.5's hash engine "
                "is pinned because deterministic receiver sampling depends on it. The foundation validation loads "
                "the real A6 serving manifest, sends malicious 0.999 lag values with zero client freshness, and "
                "requires physics fallback for both path and surface APIs. It also scans emitted telemetry for grid "
                "and station-envelope fields and checks the private migration's RLS, grants, retention, and four-lag "
                "watermark joins. No external live WSPR provider was queried."
            ),
        },
        {
            "id": "compute",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "## Apple Silicon execution\n\n"
                f"All evidence was generated on native ARM64 with **{summary['visible_cpus']} M5 CPU cores**. The "
                "open-hour transform used 18 DuckDB threads. Research training remains two spawned XGBoost fits "
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
                "This is an implementation-equivalence and fail-closed service test, not a live-source quality "
                "study. One open hour proves exact semantics for that fixture but not provider completeness, late "
                "arrival behavior, outage recovery, or 30-day shadow calibration. Static migration inspection is "
                "not a substitute for applying it to the target Postgres version. Operational weather inputs also "
                "need the same server-authoritative treatment before active forecasts. WSPR receiver availability "
                "continues to mix propagation with network behavior, and 6m remains a separate model."
            ),
        },
        {"id": "blockers", "type": "table", "tableId": "blocker_table", "layout": "full"},
        {
            "id": "next",
            "type": "markdown",
            "sourceId": "live_feature_evidence",
            "body": (
                "## Next steps\n\n"
                "1. Obtain written authorization for a live WSPR source or operate a source we control.\n"
                "2. Review and apply the private migration against the target Postgres environment.\n"
                "3. Implement the authorized connector without changing the shared transform.\n"
                "4. Replay multi-hour event-time and receipt-time fixtures, including duplicates, late arrivals, "
                "degraded hours, corrections, and pruning.\n"
                "5. Run at least 30 days of identity-free shadow traffic before allowing verified fresh history to "
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
            "title": "Propulse NowCast V4.2: live-feature foundation report",
            "description": "Exact transform parity, server-authoritative path history, M5 performance, privacy gates, and live-source blockers.",
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
    return f"""# Propulse NowCast V4.2: live-feature foundation report

Generated: {evidence['generated_at']}

## Answer first

The server-authoritative live-feature foundation passes its pre-provider gate.
The shared transform exactly reproduced `{summary['opportunity_cells']:,}`
opportunity cells and `{summary['lag_cells']:,}` power-aggregated lag cells from
an open archive hour, with zero directional differences. The real A6 bundle
blocked browser freshness forgery and measured `{summary['path_p95_ms']:.2f}` ms
path p95 and `{summary['surface_p95_ms']:.2f}` ms for a 288-cell surface.

Live WSPR remains disabled pending source authorization, migration deployment,
multi-hour replay, and 30 days of shadow evidence. See `REPORT.html` for charts,
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
    evidence = build_evidence(transform, foundation)
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
