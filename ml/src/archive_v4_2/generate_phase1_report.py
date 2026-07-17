#!/usr/bin/env python3
"""Generate the V4.2 Phase 1 Markdown and portable visual report."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RUN_ID = "propagation_v4_2_phase1_5m"
RESULT = ROOT / "ml/results/propagation_v4_2" / RUN_ID
DEFAULT_EVALUATION = RESULT / "evaluation_results.json"
DEFAULT_TRAINING = RESULT / "training_results.json"
DEFAULT_CONDITIONAL = RESULT / "conditional_results.json"
COHORTS = ROOT / "ml/data/manifests/propagation_v4_2_phase1_5m_cohorts.json"


LABELS = {
    "A0_v3_control": "A0 V3 control",
    "A1_v3_plus_availability": "A1 + availability flags",
    "A2_long_natural": "A2 long natural",
    "A3_long_balanced": "A3 long balanced",
    "A4_recent_cycle": "A4 recent cycle",
    "A5_recency_weighted": "A5 recency weighted",
    "A6_recent_recency_blend": "A6 A4/A5 blend",
    "A7_60m_specialist": "A7 A1-on-60m router",
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


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
    encodings: dict[str, Any],
    source_id: str = "evaluation",
) -> dict[str, Any]:
    return {
        "id": chart_id,
        "title": title,
        "subtitle": subtitle,
        "type": chart_type,
        "dataset": dataset,
        "sourceId": source_id,
        "encodings": encodings,
        "valueFormat": "number",
        "layout": "full",
    }


def card(
    card_id: str,
    label: str,
    field: str,
    description: str,
    value_format: str = "number",
) -> dict[str, Any]:
    return {
        "id": card_id,
        "description": description,
        "dataset": "summary",
        "sourceId": "combined",
        "metrics": [{"label": label, "field": field, "format": value_format}],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evaluation", default=str(DEFAULT_EVALUATION))
    parser.add_argument("--training", default=str(DEFAULT_TRAINING))
    parser.add_argument("--conditional", default=str(DEFAULT_CONDITIONAL))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    evaluation_path = Path(args.evaluation).resolve()
    training_path = Path(args.training).resolve()
    conditional_path = Path(args.conditional).resolve()
    evaluation = read_json(evaluation_path)
    training = read_json(training_path)
    conditional = read_json(conditional_path)
    cohorts = read_json(COHORTS)
    if evaluation["december_2024_read"] or evaluation["locked_2025_read"]:
        raise RuntimeError("Phase 1 report cannot include December 2024 or 2025")
    if evaluation["evaluation_months"] != ["2024-10", "2024-11"]:
        raise RuntimeError("unexpected Phase 1 evaluation months")
    if conditional["december_2024_read"] or conditional["locked_2025_read"]:
        raise RuntimeError("conditional report cannot include December 2024 or 2025")

    generated_at = datetime.now(timezone.utc).isoformat()
    selections = evaluation["selection"]["rows"]
    selection_by_name = {row["candidate"]: row for row in selections}
    ordered = sorted(selections, key=lambda row: float(row["evaluation_brier"]))
    best = ordered[0]
    control = selection_by_name["A0_v3_control"]
    advanced = evaluation["selection"]["advance_to_20m"]
    conditional_advanced = conditional["advance_conditional_policy"]
    if advanced:
        decision = (
            "Advance " + ", ".join(f"**{LABELS[name]}**" for name in advanced)
            + " to the 20M scale gate. Each beat A0 in both evaluation months "
            "and its paired-day 95% upper bound remained below zero."
        )
        finding_heading = (
            "## " + LABELS[advanced[0]] + " leads the 20M advancement set"
        )
    else:
        decision = (
            "No candidate passed the preregistered 20M advancement rule. Retain "
            "**A0 V3 control** and revise the data/model hypothesis before scaling."
        )
        finding_heading = "## No 5M ablation earned a scale-up"
        base_next_step = (
            "Do not spend a 20M or 50M run on the current candidate definitions. Diagnose the "
            "best candidate's residuals, revisit the exposure target and temporal sampling, then "
            "preregister a new low-cost ablation set before opening any closed outcome."
        )

    required_components: list[str] = []
    if "A6_recent_recency_blend" in conditional_advanced:
        blend = conditional["policy_selection"]["A6_recent_recency_blend"]
        required_components.extend((blend["left"], blend["right"]))
    if "A7_60m_specialist" in conditional_advanced:
        router = conditional["policy_selection"]["A7_60m_specialist"]
        required_components.extend((router["default"], router["specialist"]))
    scale_candidates = list(dict.fromkeys([*required_components, *advanced]))[:3]
    if conditional_advanced:
        policy_decision = (
            " The conditional policy gate also advances "
            + ", ".join(f"**{LABELS[name]}**" for name in conditional_advanced)
            + ". The component models to scale are "
            + ", ".join(f"**{LABELS[name]}**" for name in scale_candidates)
            + "."
        )
    else:
        policy_decision = " Neither conditional policy beat A4 under its frozen rule."
    controlled_decision = decision
    decision += policy_decision
    if scale_candidates:
        next_step = (
            "Scale only "
            + ", ".join(f"**{LABELS[name]}**" for name in scale_candidates)
            + " to exact nested 20M cohorts. Refit the same conditional policy families from the "
            "earlier fold, preserve the current scorer, and keep December closed until model, "
            "policy, calibration, and service artifacts are frozen."
        )
    else:
        next_step = base_next_step

    conditional_briers = {
        name: float(value["overall"]["weighted_brier"])
        for name, value in conditional["metrics"].items()
    }
    best_name, best_brier = min(
        [(best["candidate"], float(best["evaluation_brier"])), *conditional_briers.items()],
        key=lambda item: item[1],
    )
    best_delta_vs_a0 = best_brier - float(control["evaluation_brier"])

    summary = [{
        "evaluation_rows": int(evaluation["rows"]),
        "opportunities": float(
            evaluation["metrics"]["A0_v3_control:calibrated"]["overall"]["opportunities"]
        ),
        "a0_brier": float(control["evaluation_brier"]),
        "best_brier": best_brier,
        "best_delta_vs_a0": best_delta_vs_a0,
        "advanced_count": len(scale_candidates),
        "peak_rss_gb": max(
            float(evaluation["compute"]["peak_rss_gb"]),
            float(conditional["compute"]["peak_rss_gb"]),
        ),
        "wall_minutes": (
            float(evaluation["compute"]["wall_seconds"])
            + float(conditional["compute"]["wall_seconds"])
        ) / 60,
    }]

    overall_rows = [{
        "candidate": "Frozen V3/B2",
        "brier": float(
            evaluation["metrics"]["A0_v3_control:calibrated"]["overall"]["b2_brier"]
        ),
        "delta_vs_a0": float(
            evaluation["metrics"]["A0_v3_control:calibrated"]["overall"]["b2_brier"]
        ) - float(control["evaluation_brier"]),
        "status": "benchmark",
    }]
    candidate_rows = []
    monthly_rows = []
    calibration_rows = []
    training_rows = []
    bootstrap_rows = []
    for row in selections:
        name = row["candidate"]
        label = LABELS[name]
        overall_rows.append({
            "candidate": label,
            "brier": float(row["evaluation_brier"]),
            "delta_vs_a0": float(row["delta_vs_a0"]),
            "status": "advance" if name in advanced else "hold",
        })
        candidate_rows.append({
            "candidate": label,
            "brier": float(row["evaluation_brier"]),
            "delta_vs_a0": float(row["delta_vs_a0"]),
            "delta_vs_b2": float(row["delta_vs_b2"]),
            "october_delta_vs_a0": float(row["month_deltas_vs_a0"]["2024-10"]),
            "november_delta_vs_a0": float(row["month_deltas_vs_a0"]["2024-11"]),
            "bootstrap_upper": float(row["bootstrap_upper_vs_a0"]),
            "decision": "Advance" if name in advanced else "Hold",
        })
        for month, delta in row["month_deltas_vs_a0"].items():
            monthly_rows.append({
                "candidate": label,
                "month": month,
                "delta_vs_a0": float(delta),
            })
        raw_brier = float(
            evaluation["metrics"][f"{name}:raw"]["overall"]["candidate_brier"]
        )
        for kind in ("raw", "calibrated"):
            metric = evaluation["metrics"][f"{name}:{kind}"]["overall"]
            calibration_rows.append({
                "candidate": label,
                "prediction": kind.title(),
                "brier": float(metric["candidate_brier"]),
                "delta_vs_raw": float(metric["candidate_brier"]) - raw_brier,
            })
        trained = training["candidates"][name]
        training_rows.append({
            "candidate": label,
            "best_iteration": int(trained["best_iteration"]),
            "training_seconds": float(trained["seconds"]),
            "peak_rss_gb": float(trained["peak_rss_gb"]),
            "calibration": str(trained["calibration_method"]),
        })
        interval = evaluation["bootstrap_candidate_minus_a0"][name]
        bootstrap_rows.append({
            "candidate": label,
            "lower_95": float(interval["lower_95"]),
            "median": float(interval["median"]),
            "upper_95": float(interval["upper_95"]),
        })

    conditional_rows = []
    conditional_monthly_rows = []
    for name in ("A6_recent_recency_blend", "A7_60m_specialist"):
        metric = conditional["metrics"][name]["overall"]
        comparisons = conditional["comparisons"][name]
        overall_rows.append({
            "candidate": LABELS[name],
            "brier": float(metric["weighted_brier"]),
            "delta_vs_a0": float(comparisons["A0_v3_control"]["delta_brier"]),
            "status": "advance" if name in conditional_advanced else "hold",
        })
        a4 = comparisons["A4_recent_cycle"]
        conditional_rows.append({
            "policy": LABELS[name],
            "brier": float(metric["weighted_brier"]),
            "delta_vs_a4": float(a4["delta_brier"]),
            "delta_vs_a0": float(comparisons["A0_v3_control"]["delta_brier"]),
            "delta_vs_b2": float(comparisons["B2_frozen_v3"]["delta_brier"]),
            "october_delta_vs_a4": float(a4["month_deltas"]["2024-10"]),
            "november_delta_vs_a4": float(a4["month_deltas"]["2024-11"]),
            "bootstrap_upper_vs_a4": float(
                a4["paired_day_bootstrap"]["upper_95"]
            ),
            "decision": "Advance" if name in conditional_advanced else "Hold",
        })
        for month, delta in a4["month_deltas"].items():
            conditional_monthly_rows.append({
                "policy": LABELS[name],
                "month": month,
                "delta_vs_a4": float(delta),
            })

    blend_selection = conditional["policy_selection"]["A6_recent_recency_blend"]
    router_selection = conditional["policy_selection"]["A7_60m_specialist"]
    conditional_selection_rows = [
        {
            "policy": LABELS["A6_recent_recency_blend"],
            "august_rule": (
                f"{blend_selection['selected_left_weight']:.2f} A4 + "
                f"{1 - float(blend_selection['selected_left_weight']):.2f} A5"
            ),
            "selection_result": f"Brier {blend_selection['selected_brier']:.8f}",
        },
        {
            "policy": LABELS["A7_60m_specialist"],
            "august_rule": "A1 on "
            + (", ".join(router_selection["routed_bands"]) or "no band")
            + "; A4 otherwise",
            "selection_result": (
                "Support gate passed"
                if router_selection["routed_bands"]
                else "No specialist route selected"
            ),
        },
    ]

    focus_name = advanced[0] if advanced else best["candidate"]
    focus_variant = evaluation["metrics"][f"{focus_name}:calibrated"]
    control_variant = evaluation["metrics"]["A0_v3_control:calibrated"]
    control_bands = {
        row["key"]: row for row in control_variant["slices"]["band"]
    }
    band_rows = [
        {
            "band": row["key"],
            "delta_vs_a0": float(row["candidate_brier"])
            - float(control_bands[row["key"]]["candidate_brier"]),
            "opportunities": float(row["opportunities"]),
        }
        for row in focus_variant["slices"]["band"]
    ]
    control_distances = {
        row["key"]: row for row in control_variant["slices"]["distance"]
    }
    distance_rows = [
        {
            "distance": row["key"],
            "delta_vs_a0": float(row["candidate_brier"])
            - float(control_distances[row["key"]]["candidate_brier"]),
            "opportunities": float(row["opportunities"]),
        }
        for row in focus_variant["slices"]["distance"]
    ]

    feature_rows = []
    for row in training["candidates"][focus_name]["feature_importance_gain"][:12]:
        feature_rows.append({
            "feature": str(row["feature"]),
            "gain": float(row["gain"]),
            "candidate": LABELS[focus_name],
        })

    cohort_rows = []
    for name, info in cohorts["cohorts"].items():
        opportunities = sum(
            float(month["opportunities"])
            for month in info["distribution"].values()
        )
        cohort_rows.append({
            "cohort": name.replace("_", " ").title(),
            "rows": int(info["rows"]),
            "opportunities": opportunities,
            "bytes": int(info["bytes"]),
            "sha256": str(info["sha256"]),
        })

    sources = [
        {
            "id": "combined",
            "label": "Phase 1 controlled and conditional evaluations",
            "path": relative(evaluation_path),
            "query": {
                "engine": "duckdb",
                "language": "sql",
                "description": "Load both reviewed Phase 1 evaluation artifacts with schema union.",
                "sql": (
                    "SELECT * FROM read_json_auto(["
                    f"'{relative(evaluation_path)}','{relative(conditional_path)}'"
                    "], union_by_name=true)"
                ),
                "tables_used": [
                    relative(evaluation_path),
                    relative(conditional_path),
                ],
            },
        },
        source("evaluation", "Phase 1 held-out evaluation", evaluation_path),
        source("conditional", "Phase 1 conditional A6/A7 follow-up", conditional_path),
        source("training", "Phase 1 training checkpoint", training_path),
        source("cohorts", "Phase 1 deterministic cohort manifest", COHORTS),
    ]
    cards = [
        card("rows", "Evaluation rows", "evaluation_rows", "Full October and November 2024 rows."),
        card("a0", "A0 Brier", "a0_brier", "Calibrated V3-control reproduction."),
        card("best", "Best candidate Brier", "best_brier", "Lowest calibrated held-out Brier."),
        card("delta", "Best minus A0", "best_delta_vs_a0", "Negative values improve on A0."),
        card("advanced", "Advanced candidates", "advanced_count", "Passed both-month and uncertainty gates."),
        card("memory", "Scoring peak RSS GB", "peak_rss_gb", "M5 bounded-memory evaluation."),
    ]
    charts = [
        chart(
            "overall_brier",
            "Held-out calibrated error versus A0",
            "October plus November 2024 Brier delta; negative values improve on A0.",
            "bar",
            "overall_rows",
            {
                "x": {"field": "candidate", "type": "ordinal", "label": "Candidate"},
                "y": {"field": "delta_vs_a0", "type": "quantitative", "label": "Brier delta vs A0"},
            },
            "combined",
        ),
        chart(
            "monthly_delta",
            "Transfer versus A0 by month",
            "Negative values improve on the matched V3-control pipeline.",
            "bar",
            "monthly_rows",
            {
                "x": {"field": "candidate", "type": "ordinal", "label": "Candidate"},
                "y": {"field": "delta_vs_a0", "type": "quantitative", "label": "Brier delta"},
                "color": {"field": "month", "type": "nominal", "label": "Month"},
            },
        ),
        chart(
            "conditional_monthly_delta",
            "Conditional policy transfer versus A4",
            "August-selected A6/A7 policy minus A4 Brier by observed evaluation month.",
            "bar",
            "conditional_monthly_rows",
            {
                "x": {"field": "policy", "type": "ordinal", "label": "Policy"},
                "y": {"field": "delta_vs_a4", "type": "quantitative", "label": "Brier delta vs A4"},
                "color": {"field": "month", "type": "nominal", "label": "Month"},
            },
            "conditional",
        ),
        chart(
            "calibration",
            "Calibration effect on held-out Brier",
            "Calibrated minus raw candidate Brier; negative values improve probability accuracy.",
            "bar",
            "calibration_rows",
            {
                "x": {"field": "candidate", "type": "ordinal", "label": "Candidate"},
                "y": {"field": "delta_vs_raw", "type": "quantitative", "label": "Brier delta vs raw"},
                "color": {"field": "prediction", "type": "nominal", "label": "Prediction"},
            },
        ),
        chart(
            "iterations",
            "Early-stopped model capacity",
            "Same XGBoost parameters and 1,200-round ceiling for all candidates.",
            "bar",
            "training_rows",
            {
                "x": {"field": "candidate", "type": "ordinal", "label": "Candidate"},
                "y": {"field": "best_iteration", "type": "quantitative", "label": "Best iteration"},
            },
            "training",
        ),
        chart(
            "band_delta",
            f"{LABELS[focus_name]} transfer by band",
            "Candidate minus A0 calibrated Brier; negative values favor the candidate.",
            "bar",
            "band_rows",
            {
                "x": {"field": "band", "type": "ordinal", "label": "Band"},
                "y": {"field": "delta_vs_a0", "type": "quantitative", "label": "Brier delta"},
            },
        ),
        chart(
            "distance_delta",
            f"{LABELS[focus_name]} transfer by path distance",
            "Candidate minus A0 calibrated Brier; negative values favor the candidate.",
            "bar",
            "distance_rows",
            {
                "x": {"field": "distance", "type": "ordinal", "label": "Distance"},
                "y": {"field": "delta_vs_a0", "type": "quantitative", "label": "Brier delta"},
            },
        ),
        chart(
            "feature_gain",
            f"Leading features for {LABELS[focus_name]}",
            "XGBoost split gain is descriptive, not a causal feature attribution.",
            "bar",
            "feature_rows",
            {
                "x": {"field": "feature", "type": "ordinal", "label": "Feature"},
                "y": {"field": "gain", "type": "quantitative", "label": "Gain"},
            },
            "training",
        ),
    ]
    tables = [
        {
            "id": "candidate_table",
            "title": "Candidate decision table",
            "subtitle": "Advancement requires improvement in both months and paired-day upper 95% below zero.",
            "dataset": "candidate_rows",
            "sourceId": "evaluation",
            "defaultSort": {"field": "brier", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "candidate", "label": "Candidate", "type": "text"},
                {"field": "brier", "label": "Brier", "format": "number"},
                {"field": "delta_vs_a0", "label": "Delta vs A0", "format": "number"},
                {"field": "october_delta_vs_a0", "label": "October", "format": "number"},
                {"field": "november_delta_vs_a0", "label": "November", "format": "number"},
                {"field": "bootstrap_upper", "label": "Upper 95%", "format": "number"},
                {"field": "decision", "label": "Decision", "type": "text"},
            ],
        },
        {
            "id": "conditional_table",
            "title": "Conditional ensemble and specialist decisions",
            "subtitle": "Policies must beat A4 in both months with paired-day upper 95% below zero.",
            "dataset": "conditional_rows",
            "sourceId": "conditional",
            "defaultSort": {"field": "brier", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "policy", "label": "Policy", "type": "text"},
                {"field": "brier", "label": "Brier", "format": "number"},
                {"field": "delta_vs_a4", "label": "Delta vs A4", "format": "number"},
                {"field": "delta_vs_b2", "label": "Delta vs B2", "format": "number"},
                {"field": "october_delta_vs_a4", "label": "October", "format": "number"},
                {"field": "november_delta_vs_a4", "label": "November", "format": "number"},
                {"field": "bootstrap_upper_vs_a4", "label": "Upper 95%", "format": "number"},
                {"field": "decision", "label": "Decision", "type": "text"},
            ],
        },
        {
            "id": "conditional_selection_table",
            "title": "Frozen August policy parameters",
            "subtitle": "Temporary calibrators fit days 1-20; policy parameters selected days 21-end.",
            "dataset": "conditional_selection_rows",
            "sourceId": "conditional",
            "defaultSort": {"field": "policy", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "policy", "label": "Policy", "type": "text"},
                {"field": "august_rule", "label": "Frozen rule", "type": "text"},
                {"field": "selection_result", "label": "August evidence", "type": "text"},
            ],
        },
        {
            "id": "training_table",
            "title": "Training capacity and efficiency",
            "subtitle": "Per-candidate wall time and process peak RSS on the 128 GB M5 Max.",
            "dataset": "training_rows",
            "sourceId": "training",
            "defaultSort": {"field": "best_iteration", "direction": "desc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "candidate", "label": "Candidate", "type": "text"},
                {"field": "best_iteration", "label": "Best iteration", "format": "number"},
                {"field": "training_seconds", "label": "Seconds", "format": "number"},
                {"field": "peak_rss_gb", "label": "Peak RSS GiB", "format": "number"},
                {"field": "calibration", "label": "Calibration", "type": "text"},
            ],
        },
        {
            "id": "bootstrap_table",
            "title": "Paired UTC-day uncertainty",
            "subtitle": "Two thousand day-level resamples of candidate minus A0 Brier.",
            "dataset": "bootstrap_rows",
            "sourceId": "evaluation",
            "defaultSort": {"field": "upper_95", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "candidate", "label": "Candidate", "type": "text"},
                {"field": "lower_95", "label": "Lower 95%", "format": "number"},
                {"field": "median", "label": "Median", "format": "number"},
                {"field": "upper_95", "label": "Upper 95%", "format": "number"},
            ],
        },
        {
            "id": "cohort_table",
            "title": "Deterministic 5M training cohorts",
            "subtitle": "Checksummed natural-distribution cohorts stored outside Git.",
            "dataset": "cohort_rows",
            "sourceId": "cohorts",
            "defaultSort": {"field": "cohort", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "cohort", "label": "Cohort", "type": "text"},
                {"field": "rows", "label": "Rows", "format": "number"},
                {"field": "opportunities", "label": "Opportunities", "format": "number"},
                {"field": "bytes", "label": "Bytes", "format": "number"},
                {"field": "sha256", "label": "SHA-256", "type": "text"},
            ],
        },
    ]
    blocks = [
        {"id": "title", "type": "markdown", "body": "# Propagation V4.2 Phase 1: Controlled 5M Ablations"},
        {
            "id": "answer",
            "type": "markdown",
            "body": f"## Technical summary\n\n{decision}",
        },
        {"id": "headline", "type": "metric-strip", "cardIds": [item["id"] for item in cards]},
        {
            "id": "definitions",
            "type": "markdown",
            "body": (
                "## What was measured\n\n**Brier score** is the opportunity-weighted mean squared error "
                "of the predicted single-decode probability; lower is better. **A0** is the current-pipeline "
                "V3 control and is the Phase 1 advancement baseline. The population is inferred-active HF "
                "path-hours in full October and November 2024, grouped in UTC. A candidate advances only when "
                "its calibrated Brier is lower than A0 in each month and the upper bound of a 2,000-resample "
                "paired UTC-day 95% interval is below zero."
            ),
        },
        {
            "id": "primary_finding",
            "type": "markdown",
            "sourceId": "evaluation",
            "body": finding_heading + "\n\n" + controlled_decision,
        },
        {"id": "overall", "type": "chart", "chartId": "overall_brier", "layout": "full"},
        {"id": "decision_table", "type": "table", "tableId": "candidate_table", "layout": "full"},
        {
            "id": "temporal_heading",
            "type": "markdown",
            "body": (
                "## Improvement must survive both months\n\nAggregate improvement is insufficient: a candidate "
                "must transfer through both October and November, and the day-level uncertainty interval must "
                "exclude no difference. This guards against one month or a few high-volume days deciding scale-up."
            ),
        },
        {"id": "month", "type": "chart", "chartId": "monthly_delta", "layout": "full"},
        {"id": "bootstrap", "type": "table", "tableId": "bootstrap_table", "layout": "full"},
        {
            "id": "conditional_heading",
            "type": "markdown",
            "sourceId": "conditional",
            "body": (
                "## A6/A7 were selected on August, then frozen\n\nOctober/November diagnostics "
                "triggered these policy families but did not set their parameters. Temporary model-specific "
                "calibrators fit August days 1-20; days 21-end selected the 0.05-grid A4/A5 blend weight and "
                "tested the preregistered one-million-opportunity 60m route. The frozen policies were then "
                "rescored on full October and November with paired-day uncertainty."
            ),
        },
        {"id": "conditional_selection", "type": "table", "tableId": "conditional_selection_table", "layout": "full"},
        {"id": "conditional_month", "type": "chart", "chartId": "conditional_monthly_delta", "layout": "full"},
        {"id": "conditional_result", "type": "table", "tableId": "conditional_table", "layout": "full"},
        {
            "id": "calibration_heading",
            "type": "markdown",
            "body": (
                "## Calibration and effective capacity are separate failure modes\n\nRaw-versus-calibrated "
                "Brier shows whether post-hoc probability mapping repairs a model. Best iteration shows how much "
                "capacity the shared July early-stopping stream supported under identical tree parameters."
            ),
        },
        {"id": "calibration", "type": "chart", "chartId": "calibration", "layout": "full"},
        {"id": "iterations", "type": "chart", "chartId": "iterations", "layout": "full"},
        {"id": "training", "type": "table", "tableId": "training_table", "layout": "full"},
        {
            "id": "safety_heading",
            "type": "markdown",
            "body": (
                "## Aggregate gains must not hide propagation regressions\n\nBand and distance cuts compare "
                f"{LABELS[focus_name]} directly with calibrated A0 on identical opportunity mass. These are "
                "development diagnostics for the next scale decision, not production safety certification."
            ),
        },
        {"id": "band", "type": "chart", "chartId": "band_delta", "layout": "full"},
        {"id": "distance", "type": "chart", "chartId": "distance_delta", "layout": "full"},
        {
            "id": "model_heading",
            "type": "markdown",
            "body": (
                "## Model specification and controlled cohort design\n\nFeature gain describes how the "
                "focus model used its inputs; it is not causal attribution. Every natural cohort is an exact, "
                "deterministic top-hash 5M sample from a shared 50M master pool. A3 alone uses the pre-existing "
                "balanced V4 sample to isolate that sampling decision."
            ),
        },
        {"id": "features", "type": "chart", "chartId": "feature_gain", "layout": "full"},
        {"id": "cohorts", "type": "table", "tableId": "cohort_table", "layout": "full"},
        {
            "id": "method",
            "type": "markdown",
            "body": (
                "## Methodology and validation design\n\nAll six candidates used exactly 5,000,000 training rows, the same XGBoost "
                "parameters, a 1,200-round ceiling, July 2024 early stopping, and August 2024 time-aware "
                "calibrator selection. October and November were streamed once over identical natural rows. "
                "A0/A1 isolate feature flags; A2/A3 isolate natural versus balanced history; A4 tests recent-cycle "
                "coverage; A5 tests an 18-month recency half-life. Input hashes were verified during evaluation."
                " A6/A7 are explicitly conditional development policies: their family choice was informed by "
                "October/November diagnostics, while their numeric blend/router rules were selected on August."
            ),
        },
        {
            "id": "limits",
            "type": "markdown",
            "body": (
                "## Limitations, uncertainty, and robustness\n\nOctober and November were already observed before V4.2 and are development evidence, "
                "not a fresh validation claim. A0 is a controlled reproduction contract, not byte-identical to the "
                "older V3 curve. December 2024 and all 2025 outcomes remain closed. No Phase 1 result authorizes "
                "production replacement."
            ),
        },
        {
            "id": "next",
            "type": "markdown",
            "body": "## Recommended next step\n\n" + next_step,
        },
        {
            "id": "questions",
            "type": "markdown",
            "body": (
                "## Questions the next phase must answer\n\n- Does the 5M winner continue improving at 20M, "
                "or has its learning curve flattened?\n- Do A6/A7 remain beneficial after their component models are "
                "retrained at 20M?\n- Does scale close the frozen B2 gap without degrading calibration, "
                "memory, or product latency?\n- Can the fully frozen candidate pass untouched December before any "
                "2025 archive is opened?"
            ),
        },
    ]

    artifact = {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Propagation V4.2 Phase 1: Controlled 5M Ablations",
            "description": "Auditable model, data-window, sampling, recency, and calibration ablations on M5.",
            "generatedAt": generated_at,
            "cards": cards,
            "charts": charts,
            "tables": tables,
            "sources": sources,
            "blocks": blocks,
        },
        "snapshot": {
            "version": 1,
            "generatedAt": generated_at,
            "status": "ready",
            "datasets": {
                "summary": summary,
                "overall_rows": overall_rows,
                "candidate_rows": candidate_rows,
                "monthly_rows": monthly_rows,
                "calibration_rows": calibration_rows,
                "training_rows": training_rows,
                "bootstrap_rows": bootstrap_rows,
                "conditional_rows": conditional_rows,
                "conditional_monthly_rows": conditional_monthly_rows,
                "conditional_selection_rows": conditional_selection_rows,
                "band_rows": band_rows,
                "distance_rows": distance_rows,
                "feature_rows": feature_rows,
                "cohort_rows": cohort_rows,
            },
        },
        "sources": sources,
    }
    artifact_path = RESULT / "REPORT.artifact.json"
    write_json(artifact_path, artifact)

    markdown = f"""# Propagation V4.2 Phase 1: Controlled 5M Ablations

Generated: {generated_at}

## Answer first

{decision}

The best point estimate was **{LABELS[best_name]}** at
`{best_brier:.8f}` Brier (`{best_delta_vs_a0:+.8f}` versus A0).

## Held-out evaluation

| Candidate | Brier | Delta vs A0 | October | November | Upper 95% | Decision |
|---|---:|---:|---:|---:|---:|---|
"""
    for row in candidate_rows:
        markdown += (
            f"| {row['candidate']} | {row['brier']:.8f} | {row['delta_vs_a0']:+.8f} | "
            f"{row['october_delta_vs_a0']:+.8f} | {row['november_delta_vs_a0']:+.8f} | "
            f"{row['bootstrap_upper']:+.8f} | {row['decision']} |\n"
        )
    markdown += """

## Conditional A6/A7 follow-up

| Policy | Brier | Delta vs A4 | Delta vs B2 | October | November | Upper 95% | Decision |
|---|---:|---:|---:|---:|---:|---:|---|
"""
    for row in conditional_rows:
        markdown += (
            f"| {row['policy']} | {row['brier']:.8f} | {row['delta_vs_a4']:+.8f} | "
            f"{row['delta_vs_b2']:+.8f} | {row['october_delta_vs_a4']:+.8f} | "
            f"{row['november_delta_vs_a4']:+.8f} | "
            f"{row['bootstrap_upper_vs_a4']:+.8f} | {row['decision']} |\n"
        )
    markdown += f"""

August selected A6 at `{blend_selection['selected_left_weight']:.2f}` A4 and
`{1 - float(blend_selection['selected_left_weight']):.2f}` A5. A7 routed
`{', '.join(router_selection['routed_bands']) if router_selection['routed_bands'] else 'no band'}`
to A1 and used A4 elsewhere.

## A0 reproduction

- Original V3 5M October Brier: `{evaluation['a0_reproduction']['original_v3_5m_october_brier']:.8f}`.
- Phase 1 A0 October Brier: `{evaluation['a0_reproduction']['phase1_a0_october_brier']:.8f}`.
- Absolute difference: `{evaluation['a0_reproduction']['absolute_delta']:+.8f}`.
- Contract difference: {evaluation['a0_reproduction']['contract_difference']}

## Methodology

All six candidates used exactly 5,000,000 training rows and identical XGBoost
hyperparameters. July 2024 supplied 5,000,000 early-stopping rows. August 2024
supplied 5,000,000 calibration rows using the existing time-aware selection
protocol. The scorer read full October and November once in 100,000-row Arrow
batches, retained aggregate sufficient statistics, and performed 2,000 paired
UTC-day bootstrap resamples against calibrated A0.

A6/A7 were triggered by October/November residual diagnostics, so they are
conditional development policies rather than independent evaluation claims.
Their numeric parameters were selected with temporary calibrators fit on August
days 1-20 and policy selection on days 21-end. The frozen policies were then
rescored over October and November with a second checksum-verified stream.

Evaluation covered `{evaluation['rows']:,}` rows in
`{evaluation['compute']['wall_seconds'] / 60:.1f}` minutes with
`{evaluation['compute']['peak_rss_gb']:.2f}` GiB peak RSS. Every evaluation input
checksum was verified. December 2024 and all 2025 outcomes remained closed.
Conditional scoring took `{conditional['compute']['wall_seconds'] / 60:.1f}`
minutes with `{conditional['compute']['peak_rss_gb']:.2f}` GiB peak RSS.

## Interpretation

A0/A1 isolate the 27 V4 availability and missingness indicators. A2/A3 isolate
natural versus balanced historical sampling. A4 tests a recent-cycle window.
A5 retains long history with an 18-month exponential half-life. Raw-versus-
calibrated results in the visual report separate probability calibration from
the underlying representation and ranking behavior.

## Limits

October and November were already observed before V4.2, so these results guide
development but are not fresh validation. A0 is a controlled reproduction, not
a byte-identical replay of the original V3 learning-curve run. No result here
authorizes production replacement or access to December 2024 or 2025 outcomes.

## Reproduction

```bash
ml/.venv/bin/python ml/src/archive_v4_2/score_phase1_ablations.py \\
  --profile m5 --verify-input-hashes
ml/.venv/bin/python ml/src/archive_v4_2/validate_phase1.py --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/score_phase1_conditional.py \\
  --profile m5 --verify-input-hashes
ml/.venv/bin/python ml/src/archive_v4_2/validate_phase1_conditional.py --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/generate_phase1_report.py --profile m5
node ml/src/archive_v4/package_report.mjs --input \\
  ml/results/propagation_v4_2/{RUN_ID}/REPORT.artifact.json --output \\
  ml/results/propagation_v4_2/{RUN_ID}/REPORT.html
```
"""
    (RESULT / "REPORT.md").write_text(markdown, encoding="utf-8")
    print(artifact_path)


if __name__ == "__main__":
    main()
