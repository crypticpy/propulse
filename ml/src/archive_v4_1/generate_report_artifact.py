#!/usr/bin/env python3
"""Generate the V4.1 failed-gate technical report and audit package."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RUN_ID = "propagation_v4_1_calibration_recovery"
RESULT = ROOT / "ml/results/propagation_v4_1" / RUN_ID
PREREGISTRATION = ROOT / "ml/results/propagation_v4_1/preregistration"
SUCCESSFUL_GATE_SCORER_SHA256 = (
    "70d5acd2abe821f9c2b7bb590ae5abef8fb02f08965356acd936db08f4dc5b1a"
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def source(source_id: str, label: str, path: Path) -> dict[str, Any]:
    location = relative(path)
    return {
        "id": source_id,
        "label": label,
        "path": location,
        "query": {
            "engine": "duckdb",
            "language": "sql",
            "description": f"Load the reviewed JSON artifact {location} with DuckDB.",
            "sql": f"SELECT * FROM read_json_auto('{location}')",
            "tables_used": [location],
        },
    }


def chart(
    chart_id: str,
    title: str,
    subtitle: str,
    chart_type: str,
    dataset: str,
    source_id: str,
    encodings: dict[str, Any],
    *,
    value_format: str = "number",
) -> dict[str, Any]:
    return {
        "id": chart_id,
        "title": title,
        "subtitle": subtitle,
        "type": chart_type,
        "dataset": dataset,
        "sourceId": source_id,
        "encodings": encodings,
        "valueFormat": value_format,
        "layout": "full",
    }


def metric_card(
    card_id: str,
    description: str,
    dataset: str,
    source_id: str,
    label: str,
    field: str,
    value_format: str = "number",
) -> dict[str, Any]:
    return {
        "id": card_id,
        "description": description,
        "dataset": dataset,
        "sourceId": source_id,
        "metrics": [{"label": label, "field": field, "format": value_format}],
    }


def gate_detail(gate: dict[str, Any]) -> str:
    if "values" in gate:
        return "; ".join(
            f"{key}: {float(value):+.8f}" for key, value in gate["values"].items()
        )
    if "overall_m2_minus_b2" in gate:
        return (
            f"M2-B2: {float(gate['overall_m2_minus_b2']):+.8f}; "
            f"short-path relative improvement: "
            f"{float(gate['short_path_relative_improvement']):+.3%}"
        )
    value = gate.get("value")
    if isinstance(value, bool):
        return str(value).lower()
    if value is not None:
        return f"{float(value):+.8f}"
    if "ece_delta" in gate:
        return (
            f"ECE delta: {float(gate['ece_delta']):+.8f}; high-confidence gap "
            f"delta: {float(gate['high_confidence_max_gap_delta']):+.8f}"
        )
    return "See frozen result artifact"


def candidate_label(name: str) -> str:
    labels = {
        "B0_climatology": "B0 climatology",
        "M1_physics": "M1 physics/weather",
        "B2_frozen_v3": "B2 frozen V3",
        "M2_raw": "M2 raw",
        "C0_identity": "C0 identity",
        "C1_global_isotonic": "C1 global isotonic",
        "C2_per_band_isotonic": "C2 per-band isotonic",
        "C3_hierarchical_isotonic": "C3 hierarchical isotonic",
        "C4_guarded_hierarchical_isotonic": "C4 guarded hierarchical",
    }
    return labels.get(name, name)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile

    gate_path = RESULT / "november_gate_result.json"
    integrity_path = RESULT / "november_gate_integrity.json"
    selection_path = RESULT / "calibration_selection.json"
    validation_path = RESULT / "candidate_validation.json"
    manifest_path = PREREGISTRATION / "run_manifest.json"
    scorer_freeze_path = RESULT / "manifests/scorer_freeze.json"
    required = (
        gate_path,
        integrity_path,
        selection_path,
        validation_path,
        manifest_path,
        scorer_freeze_path,
    )
    missing = [relative(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError(missing)

    gate = read_json(gate_path)
    integrity = read_json(integrity_path)
    selection = read_json(selection_path)
    validation = read_json(validation_path)
    manifest = read_json(manifest_path)
    scorer_freeze = read_json(scorer_freeze_path)
    decision = gate["decision"]
    if decision["passed"] or manifest.get("development_gates_passed") is not False:
        raise RuntimeError("this report generator expects the frozen failed V4.1 decision")
    if manifest.get("locked_archive_test_opened"):
        raise RuntimeError("locked 2025 archive unexpectedly opened")

    generated_at = datetime.now(timezone.utc).isoformat()
    metrics = gate["metrics"]
    primary = "C4_guarded_hierarchical_isotonic"
    raw = "M2_raw"
    selected = metrics[primary]
    raw_metrics = metrics[raw]
    b2 = metrics["B2_frozen_v3"]
    opportunities = float(integrity["weighted_opportunities"])
    selected_counts = Counter(
        str(value)
        for value in selection["selection"]["leaf_candidate_choices"].values()
    )

    summary = [{
        "decision_passed": 0,
        "gates_passed": sum(bool(row["passed"]) for row in decision["gates"]),
        "gates_total": len(decision["gates"]),
        "rows": int(gate["rows"]),
        "weighted_opportunities": opportunities,
        "c4_brier": float(selected["weighted_brier"]),
        "c4_ece": float(selected["expected_calibration_error"]),
        "overall_skill_vs_b0_lower": float(
            decision["bootstrap"]["m2_vs_b0"]["skill_lower_95"]
        ),
        "c4_minus_raw": float(selected["weighted_brier"] - raw_metrics["weighted_brier"]),
        "m2_minus_b2": float(selected["weighted_brier"] - b2["weighted_brier"]),
    }]

    order = [
        "B0_climatology",
        "M1_physics",
        "B2_frozen_v3",
        "M2_raw",
        "C1_global_isotonic",
        "C2_per_band_isotonic",
        "C3_hierarchical_isotonic",
        primary,
    ]
    model_metrics = [
        {
            "candidate": candidate_label(name),
            "brier": float(metrics[name]["weighted_brier"]),
            "log_loss": float(metrics[name]["weighted_log_loss"]),
            "ece": float(metrics[name]["expected_calibration_error"]),
        }
        for name in order
    ]

    development_metrics = selection["candidate_metrics"]
    generalization = []
    for scope, values in (
        ("Calibration development", development_metrics),
        ("Untouched November gate", metrics),
    ):
        for name in ("C0_identity", primary):
            generalization.append({
                "scope": scope,
                "candidate": candidate_label(name),
                "brier": float(values[name]["weighted_brier"]),
            })

    short_path = []
    for label in ("0-500km", "500-1500km", "1500-3000km"):
        calibrated_value = float(selected["slices"]["audit_distance"][label]["weighted_brier"])
        raw_value = float(raw_metrics["slices"]["audit_distance"][label]["weighted_brier"])
        short_path.append({
            "distance": label,
            "calibrated_minus_raw_brier": calibrated_value - raw_value,
            "calibrated_brier": calibrated_value,
            "raw_brier": raw_value,
            "result": "pass" if calibrated_value <= raw_value else "fail",
        })

    reliability = []
    for name in (raw, primary):
        for item in metrics[name].get("calibration_bins", []):
            predicted = item.get("mean_prediction")
            observed = item.get("observed_rate")
            if predicted is None or observed is None:
                continue
            reliability.append({
                "predicted": float(predicted),
                "observed": float(observed),
                "series": candidate_label(name),
            })
    reliability.extend(
        {"predicted": value / 10, "observed": value / 10, "series": "Ideal"}
        for value in range(11)
    )

    gate_rows = [
        {
            "gate": row["id"],
            "status": "PASS" if row["passed"] else "FAIL",
            "observed": gate_detail(row),
            "threshold": (
                str(row["threshold"]) if "threshold" in row else "Boolean contract"
            ),
        }
        for row in decision["gates"]
    ]
    bootstrap_rows = [
        {
            "comparison": name,
            "delta_lower_95": float(value["delta_lower_95"]),
            "delta_median": float(value["delta_median"]),
            "delta_upper_95": float(value["delta_upper_95"]),
            "skill_lower_95": float(value["skill_lower_95"]),
            "skill_median": float(value["skill_median"]),
            "skill_upper_95": float(value["skill_upper_95"]),
        }
        for name, value in decision["bootstrap"].items()
    ]
    timeline = [
        {"period": "2018-01 to 2023-10 quarterly anchors", "role": "Frozen M2 training", "status": "Observed before V4.1"},
        {"period": "2024-01 and 2024-07", "role": "Frozen early stopping", "status": "Observed before V4.1"},
        {"period": "2024-02, 04, 05, 08", "role": "Calibration development", "status": "Selection only"},
        {"period": "2024-10", "role": "Published V4 gate and B2 engineering", "status": "Not used for V4.1 selection"},
        {"period": "2024-11", "role": "Untouched V4.1 gate", "status": "Opened once; failed 2 of 10 gates"},
        {"period": "2025-01, 04, 07, 10", "role": "Locked archive test", "status": "CLOSED after V4.1 failure"},
        {"period": "2026-08-01 to 2026-09-30", "role": "Prospective NowCast test", "status": "Future evidence"},
    ]
    compute = [
        {"stage": "Calibration materialization", "rows": 206843263, "seconds": 308.76, "peak_rss_gb": 15.76, "swaps": 0},
        {"stage": "Four-fold selection", "rows": 206843263, "seconds": float(selection["seconds"]), "peak_rss_gb": 7.99, "swaps": 0},
        {"stage": "Successful November score", "rows": int(gate["rows"]), "seconds": 431.22, "peak_rss_gb": 12.78, "swaps": 0},
    ]
    mapping_rows = [
        {"mapping": candidate_label(name), "leaves": count}
        for name, count in sorted(selected_counts.items())
    ]

    incident = {
        "schema_version": 1,
        "generated_at": generated_at,
        "attempt_id": gate["attempt_id"],
        "gate_opened_at": next(
            row["at"] for row in manifest["protocol_events"]
            if row["event"] == "november-gate_opened"
        ),
        "outcome_recorded_at": next(
            row["at"] for row in manifest["protocol_events"]
            if row["event"] == "outcome_artifact_recorded"
            and row["name"] == "november_gate_result"
        ),
        "outcome_metrics_exposed_before_atomic_result": False,
        "access_ledger_reset": False,
        "candidate_or_gate_changed": False,
        "events": [
            {
                "stage": "orchestration",
                "effect": "Stopped before download",
                "error": "Scoped transform re-authorized an already-open November gate.",
                "recovery": "Resumed the same attempt with the exact November-only scoped config.",
            },
            {
                "stage": "scorer projection",
                "effect": "Stopped before the first batch",
                "error": "dist_km appeared twice in the PyArrow projection.",
                "recovery": "Deduplicated projection columns without changing features or calculations.",
            },
            {
                "stage": "result provenance",
                "effect": "Two complete passes ended before atomic result writing",
                "error": "Manual recovery supplied paths outside the artifact writer's lexical repository contract.",
                "recovery": "Used the absolute repository symlink path expected by the frozen orchestrator.",
            },
        ],
        "frozen_scorer_sha256": next(
            row["sha256"] for row in scorer_freeze["sources"]
            if row["path"].endswith("score_november_gate.py")
        ),
        "executed_scorer_sha256": SUCCESSFUL_GATE_SCORER_SHA256,
        "scientific_invariants": {
            "attempt_id_unchanged": True,
            "november_month_unchanged": True,
            "candidate_checksums_unchanged": True,
            "models_and_calibrators_unchanged": True,
            "metrics_and_thresholds_unchanged": True,
            "bootstrap_seed_and_repetitions_unchanged": True,
            "locked_2025_read": False,
        },
        "final_result": {
            "passed": False,
            "failed_gates": decision["failed_gates"],
            "artifact_sha256": manifest["frozen_artifacts"]["november_gate_result"]["sha256"],
        },
    }
    incident_path = RESULT / "november_gate_incident.json"
    write_json(incident_path, incident)

    source_rows = [
        source("gate", "Atomic November gate result", gate_path),
        source("integrity", "November integrity audit", integrity_path),
        source("selection", "Frozen calibration selection", selection_path),
        source("validation", "Candidate package validation", validation_path),
        source("protocol", "Permanent access and decision ledger", manifest_path),
        source("incident", "One-shot recovery incident record", incident_path),
    ]
    cards = [
        metric_card("decision", "Preregistered V4.1 development decision; zero means failed.", "summary", "gate", "Decision passed", "decision_passed"),
        metric_card("gates", "Every gate was required; partial success is failure.", "summary", "gate", "Gates passed", "gates_passed"),
        metric_card("rows", "November 2024 path-hour feature rows.", "summary", "integrity", "Gate rows", "rows"),
        metric_card("opportunities", "Opportunity-weighted November evaluation mass.", "summary", "integrity", "Weighted opportunities", "weighted_opportunities"),
        metric_card("brier", "Selected C4 opportunity-weighted Brier; lower is better.", "summary", "gate", "C4 Brier", "c4_brier"),
        metric_card("skill", "Paired-day bootstrap lower bound versus climatology.", "summary", "gate", "Skill lower 95%", "overall_skill_vs_b0_lower", "percent"),
    ]
    charts = [
        chart(
            "model_brier",
            "Frozen V3 was the strongest November candidate",
            "November 2024 opportunity-weighted Brier score; lower is better. All candidates used identical 54.5M rows.",
            "bar",
            "model_metrics",
            "gate",
            {
                "x": {"field": "candidate", "type": "ordinal", "label": "Candidate"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
            },
        ),
        chart(
            "generalization",
            "The guarded calibrator improved raw M2 in development and November",
            "Opportunity-weighted Brier by evidence scope; lower is better. This overall gain did not satisfy every slice gate.",
            "bar",
            "generalization",
            "gate",
            {
                "x": {"field": "scope", "type": "ordinal", "label": "Evidence scope"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
                "color": {"field": "candidate", "type": "nominal", "label": "Candidate"},
            },
        ),
        chart(
            "short_path_delta",
            "Calibration still regressed the shortest path slice",
            "C4 minus raw M2 Brier on November 2024; values above zero are worse and fail exact non-regression.",
            "bar",
            "short_path",
            "gate",
            {
                "x": {"field": "distance", "type": "ordinal", "label": "Path distance"},
                "y": {"field": "calibrated_minus_raw_brier", "type": "quantitative", "label": "C4 minus raw Brier"},
            },
        ),
        chart(
            "reliability",
            "C4 improved aggregate calibration but remained intentionally close to raw M2",
            "November 2024 opportunity-weighted reliability bins; the diagonal is ideal calibration.",
            "line",
            "reliability",
            "gate",
            {
                "x": {"field": "predicted", "type": "quantitative", "label": "Predicted probability", "format": "percent"},
                "y": {"field": "observed", "type": "quantitative", "label": "Observed rate", "format": "percent"},
                "color": {"field": "series", "type": "nominal", "label": "Series"},
            },
            value_format="percent",
        ),
        chart(
            "mapping_coverage",
            "Guard rules left most band-distance leaves on raw M2",
            "Frozen development selection across 50 band-distance leaves.",
            "bar",
            "mapping_rows",
            "selection",
            {
                "x": {"field": "mapping", "type": "ordinal", "label": "Applied mapping"},
                "y": {"field": "leaves", "type": "quantitative", "label": "Band-distance leaves"},
            },
        ),
    ]
    tables = [
        {
            "id": "gates",
            "title": "All ten preregistered November gates",
            "subtitle": "Eight passed. G4 and G6 failed; no weighted voting or override was allowed.",
            "dataset": "gate_rows",
            "sourceId": "gate",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "gate", "label": "Gate", "type": "text"},
                {"field": "status", "label": "Status", "type": "text"},
                {"field": "observed", "label": "Observed", "type": "text"},
                {"field": "threshold", "label": "Threshold", "type": "text"},
            ],
        },
        {
            "id": "bootstrap",
            "title": "Two-thousand-repetition paired-day bootstrap",
            "subtitle": "Intervals resample November UTC days; negative Brier delta favors C4.",
            "dataset": "bootstrap_rows",
            "sourceId": "gate",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "comparison", "label": "Comparison", "type": "text"},
                {"field": "delta_lower_95", "label": "Delta lower 95%", "format": "number"},
                {"field": "delta_median", "label": "Delta median", "format": "number"},
                {"field": "delta_upper_95", "label": "Delta upper 95%", "format": "number"},
                {"field": "skill_lower_95", "label": "Skill lower 95%", "format": "percent"},
                {"field": "skill_upper_95", "label": "Skill upper 95%", "format": "percent"},
            ],
        },
        {
            "id": "timeline",
            "title": "Data roles remained separated",
            "subtitle": "The failed November decision keeps all four 2025 archive months closed.",
            "dataset": "timeline",
            "sourceId": "protocol",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "period", "label": "Period", "type": "text"},
                {"field": "role", "label": "Role", "type": "text"},
                {"field": "status", "label": "Access status", "type": "text"},
            ],
        },
        {
            "id": "compute",
            "title": "Streaming kept each stage within M5 memory",
            "subtitle": "Measured wall time and peak resident memory; all stages completed with zero swap.",
            "dataset": "compute",
            "sourceId": "selection",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "stage", "label": "Stage", "type": "text"},
                {"field": "rows", "label": "Rows", "format": "number"},
                {"field": "seconds", "label": "Seconds", "format": "number"},
                {"field": "peak_rss_gb", "label": "Peak RSS GB", "format": "number"},
                {"field": "swaps", "label": "Swaps", "format": "number"},
            ],
        },
    ]
    blocks: list[dict[str, Any]] = [
        {"id": "title", "type": "markdown", "body": "# Propagation V4.1 Calibration Recovery Report"},
        {
            "id": "summary_text",
            "type": "markdown",
            "body": (
                "## V4.1 failed two required gates; 2025 remains closed\n\n"
                "The frozen guarded calibrator improved raw M2 overall, beat climatology and M1 with strong "
                "paired-day confidence, and passed eight gates. It did **not** beat frozen V3/B2, and it made "
                "the 0-500 km slice slightly worse than raw M2. Under the preregistered all-gates rule, this is "
                "a failed development result, not a release candidate."
            ),
        },
        {"id": "headline", "type": "metric-strip", "cardIds": [item["id"] for item in cards]},
        {"id": "model_chart", "type": "chart", "chartId": "model_brier", "layout": "full"},
        {
            "id": "model_explainer",
            "type": "markdown",
            "body": (
                "## The core model is useful, but V3 remains the benchmark to beat\n\n"
                "C4 achieved 41.0%-42.0% bootstrapped Brier skill versus band-hour climatology and 17.9%-19.2% "
                "versus M1. Frozen V3/B2 was still better by about 0.00121 Brier overall. This suggests the "
                "newer core/history design has real signal, but its current transfer and calibration policy "
                "does not dominate the simpler frozen V3 system on an unseen month."
            ),
        },
        {"id": "generalization_chart", "type": "chart", "chartId": "generalization", "layout": "full"},
        {"id": "short_chart", "type": "chart", "chartId": "short_path_delta", "layout": "full"},
        {"id": "reliability_chart", "type": "chart", "chartId": "reliability", "layout": "full"},
        {"id": "mapping_chart", "type": "chart", "chartId": "mapping_coverage", "layout": "full"},
        {
            "id": "definitions",
            "type": "markdown",
            "body": (
                "## Scope, target, and metrics\n\n"
                "The target is the opportunity-weighted probability of one WSPR decode for an inferred-active "
                "transmitter and receiver path-hour. It is not generic QSO probability. Brier score is the primary "
                "proper scoring rule and lower is better. ECE describes aggregate calibration. Every model was "
                "scored on the same 54,544,159 November rows and 1.723 billion weighted opportunities."
            ),
        },
        {"id": "timeline_table", "type": "table", "tableId": "timeline", "layout": "full"},
        {
            "id": "methods",
            "type": "markdown",
            "body": (
                "## Experimental design\n\n"
                "The 50M-row M2 model, its features, seed, XGBoost iteration, and training data were retained. "
                "February, April, May, and August 2024 selected among identity, global, per-band, hierarchical, "
                "and guarded hierarchical isotonic policies using leave-one-month-out evidence. November was "
                "opened once only after the candidate, service bundle, B2 adapter, scorer, gates, and 2,000-day-"
                "bootstrap procedure were frozen."
            ),
        },
        {"id": "gate_table", "type": "table", "tableId": "gates", "layout": "full"},
        {"id": "bootstrap_table", "type": "table", "tableId": "bootstrap", "layout": "full"},
        {
            "id": "robustness",
            "type": "markdown",
            "body": (
                "## Robustness, reproducibility, and the one-shot recovery\n\n"
                "The November integrity audit passed all 11 checks. Offline and service probabilities matched "
                "exactly on 1,024 pre-gate rows; fallback, stale-history, schema, checksum, privacy, and locked-scope "
                "contracts passed. Three operational defects interrupted the same permanent attempt before atomic "
                "publication. No outcome metric was exposed before the final result, the access ledger was never "
                "reset, and no candidate, threshold, seed, metric, or bootstrap choice changed. The incident JSON "
                "records frozen and executed source hashes."
            ),
        },
        {"id": "compute_table", "type": "table", "tableId": "compute", "layout": "full"},
        {
            "id": "limitations",
            "type": "markdown",
            "body": (
                "## What this result does not establish\n\n"
                "- V4.1 is not approved for the locked archive, prospective release, or production replacement.\n"
                "- WSPR decode evidence does not directly estimate FT8, CW, SSB, receive-only, or two-way QSO probability.\n"
                "- Public receiver participation and equipment capability remain imperfectly observed.\n"
                "- Aggregate calibration improvement did not guarantee non-regression in every path slice.\n"
                "- StationCast personalization still requires opt-in prospective operator outcomes before learned residuals.\n"
                "- FutureCast needs genuine issued-forecast history and cannot be backfilled with observations."
            ),
        },
        {
            "id": "next_steps",
            "type": "markdown",
            "body": (
                "## Recommended next step: turn the failure into a stronger V4.2\n\n"
                "Publish V4.1 unchanged and keep 2025 closed for this experiment. The broader V4 plan remains the "
                "north star: build the strongest model that works reliably in Propulse. V4.2 should first explain "
                "why frozen V3 transfers better, compare raw M2 and B2 by band, distance, history availability, "
                "solar regime, and geography, and test whether a simpler raw-M2 or global-calibration policy is "
                "more stable. Retraining, feature changes, receiver-availability modeling, other algorithms, and "
                "more rows are valid options when diagnostics support them. Use December 2024 or another explicitly "
                "preregistered period as a fresh gate, then retain 2025 for final validation."
            ),
        },
        {
            "id": "questions",
            "type": "markdown",
            "body": (
                "## Further questions\n\n"
                "Which V3 feature or calibration behavior explains its November advantage? Is the 0-500 km miss "
                "localized to particular bands or activity regimes? Does direct modeling of receiver availability "
                "improve transfer without identity leakage? Which weather inputs can be available at inference "
                "time rather than only in definitive reanalysis?"
            ),
        },
    ]
    artifact = {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Propagation V4.1 Calibration Recovery Report",
            "description": "Technical report for the preregistered V4.1 failed November development gate.",
            "generatedAt": generated_at,
            "cards": cards,
            "charts": charts,
            "tables": tables,
            "sources": source_rows,
            "blocks": blocks,
        },
        "snapshot": {
            "version": 1,
            "generatedAt": generated_at,
            "status": "partial",
            "datasets": {
                "summary": summary,
                "model_metrics": model_metrics,
                "generalization": generalization,
                "short_path": short_path,
                "reliability": reliability,
                "gate_rows": gate_rows,
                "bootstrap_rows": bootstrap_rows,
                "timeline": timeline,
                "compute": compute,
                "mapping_rows": mapping_rows,
            },
            "accessIssues": [{
                "id": "locked_archive",
                "dataset": "locked_2025",
                "message": "The preregistered 2025 archive remains unopened because V4.1 failed two development gates.",
            }],
        },
        "sources": source_rows,
    }
    artifact_path = RESULT / "REPORT.artifact.json"
    write_json(artifact_path, artifact)

    markdown = f"""# Propagation V4.1 Calibration Recovery Report

Generated: {generated_at}

## Technical summary

V4.1 **failed** its untouched November 2024 development gate. Eight of ten
preregistered gates passed. `G4_frozen_v3` failed because C4 Brier
(`{selected['weighted_brier']:.8f}`) was worse than frozen V3/B2
(`{b2['weighted_brier']:.8f}`) by `{selected['weighted_brier'] - b2['weighted_brier']:+.8f}`.
`G6_short_path_calibration` failed because C4 regressed raw M2 by
`{short_path[0]['calibrated_minus_raw_brier']:+.8f}` on 0-500 km paths.

The locked 2025 archive remains closed. This is a published negative result,
not permission to tune against November.

## Key findings

| Candidate | Brier | Log loss | ECE |
|---|---:|---:|---:|
"""
    for row in model_metrics:
        markdown += f"| {row['candidate']} | {row['brier']:.8f} | {row['log_loss']:.8f} | {row['ece']:.8f} |\n"
    markdown += "\n## All frozen gates\n\n| Gate | Status | Observed | Threshold |\n|---|---|---|---|\n"
    for row in gate_rows:
        markdown += f"| `{row['gate']}` | **{row['status']}** | {row['observed']} | {row['threshold']} |\n"
    markdown += f"""

## Scope and methodology

Every candidate was scored on the same `{gate['rows']:,}` November 2024 rows
and `{opportunities:,.2f}` weighted opportunities. The target is conditional
single-decode WSPR probability for inferred-active path-hours, not general QSO
probability. The frozen 50M M2 model was not retrained. February, April, May,
and August selected the guarded calibration policy; November was opened once
after candidates, gates, service packaging, and scoring code were frozen.

## What worked

- C4 improved raw M2 overall by `{selected['weighted_brier'] - raw_metrics['weighted_brier']:+.8f}` Brier.
- The paired-day 95% interval for C4 skill versus climatology was
  `{decision['bootstrap']['m2_vs_b0']['skill_lower_95']:.2%}` to
  `{decision['bootstrap']['m2_vs_b0']['skill_upper_95']:.2%}`.
- C4 improved the 500-1,500 km and 1,500-3,000 km slices.
- Integrity, band safety, reliability, fallback, and serving parity passed.

## What failed

- Frozen V3/B2 remained better overall and on the short-path criterion.
- C4 made 0-500 km Brier `{short_path[0]['calibrated_minus_raw_brier']:+.8f}` worse than raw M2.
- Because the decision required all ten gates, the 2025 archive cannot open.

## Recovery incident

The permanent attempt `{gate['attempt_id']}` was never reset. Orchestration,
duplicate projection, and path-provenance defects interrupted the same attempt,
but no metric was exposed before the atomic result. The repair did not change
data, models, calibrators, candidates, thresholds, metrics, seed, or bootstrap
repetitions. See `november_gate_incident.json` for hashes and event details.

## Recommended next steps

Publish this result unchanged, then build a performance-driven V4.2 under the
broader V4 product plan. Diagnose V3 versus M2 by band, distance, history
availability, solar regime, and coarse geography. Retraining, feature changes,
receiver-availability modeling, other algorithms, and more rows are valid when
the diagnostics support them. Preregister the successor with a fresh untouched
gate; do not score 2025 for V4.1.

## Reproduction

```bash
ml/.venv/bin/python ml/src/archive_v4_1/generate_report_artifact.py --profile m5
node ml/src/archive_v4/package_report.mjs --input \\
  ml/results/propagation_v4_1/{RUN_ID}/REPORT.artifact.json --output \\
  ml/results/propagation_v4_1/{RUN_ID}/REPORT.html
```
"""
    (RESULT / "REPORT.md").write_text(markdown, encoding="utf-8")

    incident_markdown = f"""# V4.1 November Gate Recovery Incident

Attempt: `{gate['attempt_id']}`<br>
Gate opened: `{incident['gate_opened_at']}`<br>
Outcome recorded: `{incident['outcome_recorded_at']}`

The permanent access ledger was not reset, no 2025 outcome was read, and no
November metric was exposed before the atomic result. The final decision is a
failure on `G4_frozen_v3` and `G6_short_path_calibration`.

| Stage | Effect | Defect | Recovery |
|---|---|---|---|
"""
    for row in incident["events"]:
        incident_markdown += f"| {row['stage']} | {row['effect']} | {row['error']} | {row['recovery']} |\n"
    incident_markdown += f"""

Frozen scorer SHA-256: `{incident['frozen_scorer_sha256']}`<br>
Executed scorer SHA-256: `{incident['executed_scorer_sha256']}`<br>
Atomic result SHA-256: `{incident['final_result']['artifact_sha256']}`
"""
    (RESULT / "NOVEMBER-GATE-INCIDENT.md").write_text(
        incident_markdown, encoding="utf-8"
    )
    print(artifact_path)


if __name__ == "__main__":
    main()
