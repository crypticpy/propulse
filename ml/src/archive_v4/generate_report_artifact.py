#!/usr/bin/env python3
"""Generate the canonical V4 technical report artifact and research package."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(V3))
from common import MANIFESTS, RESULTS, load_config, relative, sha256, utc_now, write_json  # noqa: E402


def read_json(path: Path, default: Any = None) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def compact(number: float | int) -> str:
    value = float(number)
    for unit, divisor in (("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if abs(value) >= divisor:
            return f"{value / divisor:.1f}{unit}"
    return f"{value:.0f}"


def source(source_id: str, label: str, path: str) -> dict[str, Any]:
    return {
        "id": source_id,
        "label": label,
        "path": path,
        "query": {
            "engine": "duckdb",
            "language": "sql",
            "description": f"Load the reviewed JSON artifact {path}; report shaping is implemented in generate_report_artifact.py.",
            "sql": f"SELECT * FROM read_json_auto('{path}')",
            "tables_used": [path],
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    run_id = config["run_id"]
    result_dir = RESULTS / run_id
    result_dir.mkdir(parents=True, exist_ok=True)
    figures_dir = result_dir / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)

    development_path = result_dir / "development_results.json"
    six_path = result_dir / "6m_development_results.json"
    p533_path = result_dir / "p533_validation_results.json"
    rolling_path = result_dir / "rolling_validation_results.json"
    outage_path = result_dir / "source_outage_validation_results.json"
    future_path = RESULTS / "futurecast_readiness.json"
    sample_path = MANIFESTS / f"{run_id}_hf_balanced_sample.json"
    hf_audit_path = MANIFESTS / f"{run_id}_hf_development_audit.json"
    six_audit_path = MANIFESTS / f"{run_id}_6m_development_audit.json"
    bronze_path = MANIFESTS / f"{run_id}_bronze.json"
    sources_path = MANIFESTS / f"{run_id}_sources.json"

    development = read_json(development_path, {})
    six = read_json(six_path, {})
    p533 = read_json(p533_path, {})
    rolling = read_json(rolling_path, {})
    outage = read_json(outage_path, {})
    future = read_json(future_path, {})
    sample = read_json(sample_path, {})
    hf_audit = read_json(hf_audit_path, {})
    six_audit = read_json(six_audit_path, {})
    bronze = read_json(bronze_path, {})

    candidates = development.get("candidates", {})
    m1 = candidates.get("M1_physics", {})
    m2 = candidates.get("M2_nowcast", {})
    b0 = development.get("baselines", {}).get("B0_climatology", {})
    b1 = development.get("baselines", {}).get("B1_p533_voacap", {})
    primary_cap = int(m2.get("train_cap", 0))
    development_complete = primary_cap == int(config["sampling"]["primary_train_rows"])

    generated_at = utc_now()
    source_rows = [
        source("development", "V4 development metrics", relative(development_path)),
        source("sample", "Balanced sample manifest", relative(sample_path)),
        source("hf_audit", "HF development audit", relative(hf_audit_path)),
        source("six", "Independent 6m development metrics", relative(six_path)),
        source("six_audit", "6m development audit", relative(six_audit_path)),
        source("p533", "Pinned ITU-R P.533 validation", relative(p533_path)),
        source("rolling", "Rolling-origin validation", relative(rolling_path)),
        source("outage", "Source-outage fallback validation", relative(outage_path)),
        source("future", "FutureCast issuance readiness", relative(future_path)),
        source("bronze", "Quarterly archive bronze manifest", relative(bronze_path)),
    ]

    summary = [{
        "natural_train_rows": sample.get("natural_train_rows", 0),
        "sample_rows": sample.get("sampled_train_rows", 0),
        "validation_rows": sample.get("validation_sample_rows", 0),
        "m2_brier": m2.get("gate_full", {}).get("weighted_brier"),
        "m2_skill": m2.get("brier_skill_vs_B0"),
        "m2_cap": primary_cap,
        "six_skill": six.get("overall_brier_skill"),
        "future_days": min(
            (
                row.get("unique_capture_days", 0)
                for row in future.get("sources", {}).values()
            ),
            default=0,
        ),
        "outage_passed": int(bool(outage.get("passed", False))),
    }]

    model_metrics = []
    if b0:
        model_metrics.append({
            "candidate": "B0 climatology",
            "brier": b0.get("weighted_brier"),
            "log_loss": b0.get("weighted_log_loss"),
            "ece": b0.get("expected_calibration_error"),
            "scope": "full October gate",
        })
    for label, value in (("M1 physics/weather", m1), ("M2 nowcast", m2)):
        if value:
            gate = value.get("gate_full", {})
            model_metrics.append({
                "candidate": label,
                "brier": gate.get("weighted_brier"),
                "log_loss": gate.get("weighted_log_loss"),
                "ece": gate.get("expected_calibration_error"),
                "scope": "full October gate",
            })

    paired_p533 = []
    if b1.get("status") == "paired_gate_sample":
        paired_p533 = [
            {
                "candidate": "Calibrated P.533",
                "brier": b1["p533"]["weighted_brier"],
                "rows": b1["rows"],
            },
            {
                "candidate": "M2 nowcast",
                "brier": b1["candidate"]["weighted_brier"],
                "rows": b1["rows"],
            },
        ]

    learning_curve = [
        {
            "train_rows": row["train_cap"],
            "brier": row["gate_full"]["weighted_brier"],
            "runtime_minutes": row["seconds"] / 60,
            "peak_rss_gb": row["peak_rss_gb"],
        }
        for row in development.get("learning_curve", [])
    ]

    reliability = []
    for row in m2.get("gate_full", {}).get("calibration_bins", []):
        midpoint = (row["lower"] + row["upper"]) / 2
        reliability.extend([
            {"predicted": midpoint, "series": "Observed", "probability": row["observed_rate"]},
            {"predicted": midpoint, "series": "Ideal", "probability": midpoint},
        ])

    mechanism_rows = []
    for mechanism, value in six.get("mechanisms", {}).items():
        mechanism_rows.append({
            "mechanism": mechanism.replace("_", " "),
            "brier_skill": value.get("brier_skill"),
            "status": value.get("status"),
            "train_rows": value.get("train_rows", 0),
        })

    rolling_rows = [
        {
            "gate": row["protocol"]["gate_months"][0],
            "brier_skill": row["brier_skill_vs_climatology"],
            "brier": row["gate_full"]["weighted_brier"],
        }
        for row in rolling.get("folds", [])
    ]
    outage_rows = outage.get("scenarios", [])

    year_totals: dict[str, dict[str, int]] = defaultdict(lambda: {"spots": 0, "six_meter_spots": 0})
    for row in bronze.get("months", []):
        year = row["month"][:4]
        year_totals[year]["spots"] += int(row.get("rows", 0))
        year_totals[year]["six_meter_spots"] += int(row.get("six_meter_rows", 0))
    archive_coverage = [
        {"year": year, **values} for year, values in sorted(year_totals.items())
    ]

    band_rows = []
    for band, value in m2.get("gate_full", {}).get("slices", {}).get("band", {}).items():
        band_rows.append({
            "band": band,
            "brier": value["weighted_brier"],
            "log_loss": value["weighted_log_loss"],
            "ece": value["expected_calibration_error"],
            "opportunities": value["weighted_opportunities"],
        })

    release_rows = [
        {"component": "NowCast Core", "status": "development" if development else "pending", "reason": "2025 locked and 2026 prospective tests remain unopened"},
        {"component": "FutureCast", "status": "withheld", "reason": "Requires 90 days of real issued forecasts and horizon validation"},
        {"component": "StationCast Stage A", "status": "shadow", "reason": "Deterministic adapter and privacy contract pass; product validation remains"},
        {"component": "6m Cast", "status": "experimental", "reason": "Heuristic mechanism labels and incomplete mechanism support"},
    ]

    cards = [
        metric_card("natural_rows", "Full multi-year HF development candidate pool.", "summary", "sample", "Natural training rows", "natural_train_rows"),
        metric_card("sample_rows", "Largest deterministic regime-balanced nested cohort.", "summary", "sample", "Primary sample rows", "sample_rows"),
        metric_card("m2_brier", "Opportunity-weighted October 2024 development-gate Brier score.", "summary", "development", "M2 Brier", "m2_brier"),
        metric_card("m2_skill", "Relative Brier skill against natural band-by-hour climatology.", "summary", "development", "M2 skill vs B0", "m2_skill", "percent"),
        metric_card("six_skill", "Covered-row skill against mechanism-specific climatology; experimental.", "summary", "six", "6m covered-row skill", "six_skill", "percent"),
        metric_card("future_days", "Minimum distinct issued-forecast capture days across required NOAA products.", "summary", "future", "Forecast archive days", "future_days"),
        metric_card("outage_passed", "Packaged model fallback contract on held-out development rows.", "summary", "outage", "Outage fallback passed", "outage_passed"),
    ]

    charts: list[dict[str, Any]] = []
    if model_metrics:
        charts.append(chart(
            "candidate_brier",
            "M2 reduces October 2024 error versus simpler development baselines",
            "Opportunity-weighted Brier score on the full October development gate; lower is better.",
            "bar",
            "model_metrics",
            "development",
            {
                "x": {"field": "candidate", "type": "ordinal", "label": "Candidate"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
            },
        ))
    if paired_p533:
        charts.append(chart(
            "paired_p533",
            "M2 outperforms calibrated P.533 on the same bounded circuits",
            f"Paired October sample, n={b1['rows']:,} path-hours; lower Brier is better.",
            "bar",
            "paired_p533",
            "p533",
            {
                "x": {"field": "candidate", "type": "ordinal", "label": "Candidate"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
            },
        ))
    if learning_curve:
        charts.append(chart(
            "learning_curve",
            "The learning curve determines whether scale beyond 50M is justified",
            "Nested deterministic cohorts evaluated on the same October 2024 gate; lower Brier is better.",
            "line",
            "learning_curve",
            "development",
            {
                "x": {"field": "train_rows", "type": "quantitative", "label": "Training rows"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
            },
        ))
    if reliability:
        charts.append(chart(
            "reliability",
            "M2 reliability is measured against the ideal calibration line",
            "Twenty opportunity-weighted probability bins on the full October 2024 development gate.",
            "line",
            "reliability",
            "development",
            {
                "x": {"field": "predicted", "type": "quantitative", "label": "Predicted probability", "format": "percent"},
                "y": {"field": "probability", "type": "quantitative", "label": "Observed probability", "format": "percent"},
                "color": {"field": "series", "type": "nominal", "label": "Series"},
            },
            value_format="percent",
        ))
    if rolling_rows:
        charts.append(chart(
            "rolling_skill",
            "Rolling-origin folds test whether M2 skill persists across years",
            "Five-million-row cap; each October follows training only on earlier years.",
            "bar",
            "rolling",
            "rolling",
            {
                "x": {"field": "gate", "type": "ordinal", "label": "Gate month"},
                "y": {"field": "brier_skill", "type": "quantitative", "label": "Brier skill", "format": "percent"},
            },
            value_format="percent",
        ))
    if outage_rows:
        charts.append(chart(
            "outage_confidence",
            "A path-history outage lowers confidence and selects the physics profile",
            f"Packaged-bundle replay on {outage.get('rows', 0):,} held-out development rows.",
            "bar",
            "outage_scenarios",
            "outage",
            {
                "x": {"field": "scenario", "type": "ordinal", "label": "Source state"},
                "y": {"field": "mean_confidence", "type": "quantitative", "label": "Mean confidence", "format": "percent"},
                "color": {"field": "profile", "type": "nominal", "label": "Served profile"},
            },
            value_format="percent",
        ))
    if mechanism_rows:
        trained_mechanisms = [row for row in mechanism_rows if row["brier_skill"] is not None]
        if trained_mechanisms:
            charts.append(chart(
                "six_mechanisms",
                "Covered 6m mechanisms show positive development skill",
                "Heuristic mechanism routes, October 2024; this is not event-catalog validation.",
                "bar",
                "six_mechanisms_trained",
                "six",
                {
                    "x": {"field": "mechanism", "type": "ordinal", "label": "Mechanism hypothesis"},
                    "y": {"field": "brier_skill", "type": "quantitative", "label": "Brier skill", "format": "percent"},
                },
                value_format="percent",
            ))
    if archive_coverage:
        charts.append(chart(
            "archive_coverage",
            "Quarterly archive coverage grows substantially across network eras",
            "Deduplicated WSPR bronze rows in Jan/Apr/Jul/Oct development months; 2025 is not transformed.",
            "bar",
            "archive_coverage",
            "bronze",
            {
                "x": {"field": "year", "type": "ordinal", "label": "Year"},
                "y": {"field": "spots", "type": "quantitative", "label": "Bronze WSPR rows"},
            },
        ))

    tables = [
        {
            "id": "band_metrics",
            "title": "M2 error and calibration by band",
            "subtitle": "Full October 2024 development gate; exact opportunity-weighted metrics.",
            "dataset": "band_metrics",
            "sourceId": "development",
            "defaultSort": {"field": "brier", "direction": "desc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "band", "label": "Band", "type": "text"},
                {"field": "brier", "label": "Brier", "format": "number"},
                {"field": "log_loss", "label": "Log loss", "format": "number"},
                {"field": "ece", "label": "ECE", "format": "number"},
                {"field": "opportunities", "label": "Opportunities", "format": "number"},
            ],
        },
        {
            "id": "release_status",
            "title": "Release decision by component",
            "dataset": "release_status",
            "sourceId": "development",
            "defaultSort": {"field": "component", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "component", "label": "Component", "type": "text"},
                {"field": "status", "label": "Status", "type": "text"},
                {"field": "reason", "label": "Evidence boundary", "type": "text"},
            ],
        },
    ]

    chart_blocks = [
        {"id": f"block_{item['id']}", "type": "chart", "chartId": item["id"], "layout": "full"}
        for item in charts
    ]
    blocks: list[dict[str, Any]] = [
        {"id": "title", "type": "markdown", "body": "# Propagation V4 Development Report"},
        {
            "id": "summary_text",
            "type": "markdown",
            "body": (
                "## The multi-year approach is promising, but no production replacement is approved\n\n"
                + (
                    f"The current primary M2 candidate uses **{compact(primary_cap)} rows** and reaches "
                    f"**{m2.get('gate_full', {}).get('weighted_brier', float('nan')):.5f} Brier** on the "
                    "October 2024 development gate. "
                    if m2 else "Core development training is still pending. "
                )
                + "The 2025 archive test and 2026 prospective test remain unopened. FutureCast is withheld, "
                "and 6m remains a separate experimental mechanism program."
            ),
        },
        {"id": "headline_metrics", "type": "metric-strip", "cardIds": [item["id"] for item in cards]},
        {
            "id": "definitions",
            "type": "markdown",
            "body": (
                "## What was measured\n\n"
                "The HF target is the opportunity-weighted probability of one WSPR decode when the transmitter "
                "and receiver were inferred active. A missing public spot is not treated as a failed QSO. "
                "Brier score is the primary proper scoring rule; lower is better. Brier skill is relative error "
                "reduction against natural band-by-UTC-hour climatology."
            ),
        },
    ]
    blocks.extend(chart_blocks[:4])
    blocks.extend([
        {
            "id": "methods",
            "type": "markdown",
            "body": (
                "## The experiment separates fitting, calibration, and evaluation\n\n"
                "Training uses quarterly anchors from 2018-2023. January and July 2024 control early stopping; "
                "April days 1-20 fit candidate calibrators, April days 21-end select the calibration family, and "
                "full April refits that family. October 2024 is evaluation-only. The 5M/20M/50M cohorts are exact "
                "nested hash samples balanced across year, season, band, power, distance, solar, geomagnetic, and "
                "recent-history regimes, then post-stratified to natural opportunity mass."
            ),
        },
    ])
    blocks.extend(chart_blocks[4:])
    if band_rows:
        blocks.append({"id": "band_table", "type": "table", "tableId": "band_metrics", "layout": "full"})
    blocks.extend([
        {
            "id": "personalization",
            "type": "markdown",
            "body": (
                "## StationCast uses the existing virtual shack without exposing it\n\n"
                "The active chain or preset resolves its linked saved operating location before the global active "
                "location. The browser derives a versioned envelope containing realizable power, losses, path-bearing "
                "antenna gain, receiver evidence, mode threshold, warnings, and a stable fingerprint. Raw equipment "
                "IDs and inventory records are rejected by the inference API. Stage A is a deterministic physics "
                "adapter; mode heads and learned station residuals require separate prospective labels."
            ),
        },
        {
            "id": "operations",
            "type": "markdown",
            "body": (
                "## Operational outages change the served model, not the truth label\n\n"
                "When recent path-history data exceed the freshness limit, the API serves the independent "
                "physics/weather profile, adds an explicit out-of-distribution warning, and lowers confidence. "
                "The client exposes source ages and never fills missing live evidence with future observations."
            ),
        },
        {
            "id": "limitations",
            "type": "markdown",
            "body": (
                "## The remaining evidence gaps are release blockers\n\n"
                "- Frozen V3 binaries must be transferred before the B2 comparison can be reproduced.\n"
                "- The locked 2025 archive is not opened until every preregistered development gate passes.\n"
                "- The prospective window runs from 2026-08-01 through 2026-09-30.\n"
                "- FutureCast needs at least 90 days of genuine issued forecasts; observations cannot backfill them.\n"
                "- 6m mechanism labels are hypotheses and need GIRO/NWP/event-catalog validation.\n"
                "- WSPR results do not establish FT8, CW, SSB, receive, or two-way QSO probability."
            ),
        },
        {"id": "release_table", "type": "table", "tableId": "release_status", "layout": "full"},
        {
            "id": "next_steps",
            "type": "markdown",
            "body": (
                "## Next steps are gated, not open-ended tuning\n\n"
                "Complete the 20M/50M curve, rolling-origin folds, source-outage checks, frozen V3 comparison, and "
                "product shadow integration. Open 2025 once if every gate passes. Preserve the selected bundle for "
                "the prospective window, then publish supported successes and failures without post-test tuning."
            ),
        },
        {
            "id": "questions",
            "type": "markdown",
            "body": (
                "## Further questions\n\n"
                "Does 50M materially improve the 5M/20M curve? Does M2 improve short paths without band regressions? "
                "Does StationCast improve calibration and operator decisions prospectively? Which 6m mechanisms retain "
                "skill against independent event catalogs and operational NWP?"
            ),
        },
    ])

    snapshot_status = "partial"
    access_issues = [
        {"id": "locked_archive", "dataset": "locked_2025", "message": "The preregistered 2025 archive test remains unopened."},
        {"id": "prospective", "dataset": "prospective_2026", "message": "The prospective evaluation cannot finish before 2026-09-30."},
        {"id": "frozen_v3", "dataset": "frozen_v3", "message": "Frozen V3 model binaries are not present on this machine."},
    ]
    artifact = {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Propagation V4 Development Report",
            "description": "Technical development report for the open Propulse multi-year nowcast, StationCast, FutureCast, and independent 6m program.",
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
            "status": snapshot_status,
            "datasets": {
                "summary": summary,
                "model_metrics": model_metrics,
                "paired_p533": paired_p533,
                "learning_curve": learning_curve,
                "reliability": reliability,
                "rolling": rolling_rows,
                "outage_scenarios": outage_rows,
                "six_mechanisms": mechanism_rows,
                "six_mechanisms_trained": [row for row in mechanism_rows if row["brier_skill"] is not None],
                "archive_coverage": archive_coverage,
                "band_metrics": band_rows,
                "release_status": release_rows,
            },
            "accessIssues": access_issues,
        },
        "sources": source_rows,
    }
    artifact_path = result_dir / "REPORT.artifact.json"
    write_json(artifact_path, artifact)

    m2_gate = m2.get("gate_full", {})
    markdown = f"""# Propagation V4 Development Report

Generated: {generated_at}

## Technical summary

This is development evidence, not a production release. The current M2 model
uses {compact(primary_cap)} training rows and has an October 2024
opportunity-weighted Brier score of `{m2_gate.get('weighted_brier', 'pending')}`.
The locked 2025 archive and 2026 prospective evaluation remain unopened.

## Key findings

| Candidate | Gate | Brier | Log loss | ECE |
|---|---|---:|---:|---:|
"""
    for row in model_metrics:
        markdown += f"| {row['candidate']} | {row['scope']} | {row['brier']:.6f} | {row['log_loss']:.6f} | {row['ece']:.6f} |\n"
    markdown += """

The HTML report contains the paired P.533 comparison, learning curve,
reliability diagram, rolling folds when available, archive coverage, band
slices, 6m mechanism results, and release matrix.

## Scope and definitions

The core estimand is a single WSPR decode conditional on inferred transmitter
and receiver activity. Opportunity weights reconstruct the sampled receiver
population. This is not generic QSO probability.

## Methodology

Training covers Jan/Apr/Jul/Oct 2018-2023. January and July 2024 control early
stopping. April days 1-20 fit calibrators, April days 21-end select the
calibration family, and full April refits it. October 2024 is evaluation-only.
The locked archive is 2025; the prospective window is 2026-08-01 through
2026-09-30.

## Limitations

- Frozen V3 binaries are not available on this machine.
- FutureCast lacks enough genuine issued-forecast history.
- 6m mechanism assignments are heuristic and incompletely supported.
- Product shadow, prospective, and opt-in beta evidence remain incomplete.
- Raw third-party archives and private shack records are not redistributed.

## Recommended next steps

Finish the 20M/50M curve and rolling/source-outage gates, transfer frozen V3,
then open 2025 once if every preregistered gate passes. Keep failed components
experimental or disabled.
"""
    (result_dir / "REPORT.md").write_text(markdown, encoding="utf-8")

    model_card = f"""# Model Card: Propagation V4 NowCast Core

## Status

Development-only. Release approved: **no**. Primary trained cap in this report:
`{primary_cap}` rows. The 2025 locked and 2026 prospective tests are pending.

## Intended use

Estimate conditional single-decode WSPR path support for amateur-radio research
and shadow product evaluation. StationCast Stage A may adjust the open core with
a locally derived, privacy-safe station envelope.

## Not intended for

- safety-of-life or emergency-service guarantees;
- generic FT8/CW/SSB or two-way QSO probability;
- regulatory power or station-compliance decisions;
- identity, callsign, or exact-location inference.

## Training and evaluation

- Train candidates: quarterly anchors in 2018-2023.
- Development protocol: Jan/Jul 2024 early stop, split April calibration,
  October 2024 gate.
- Primary metric: opportunity-weighted Brier score.
- Baselines: band-hour climatology, pinned ITU-R P.533, and frozen V3 when its
  binaries are transferred.

## Limitations

Network participation, receiver sensitivity, local noise, labels, and path
exposure are imperfect. Predictions must expose freshness, model version,
confidence, assumptions, and OOD flags. Missing live history selects the physics
fallback rather than fabricating evidence.
"""
    (result_dir / "model_card.md").write_text(model_card, encoding="utf-8")

    data_card = f"""# Data Card: Propagation V4 Multi-Year Archive

## Scope

- Natural HF training rows: `{sample.get('natural_train_rows', 0)}`.
- Natural HF training opportunities: `{sample.get('natural_train_opportunities', 0)}`.
- Nested samples: `{json.dumps(sample.get('nested_sample_rows', {}), sort_keys=True)}`.
- Validation sample rows: `{sample.get('validation_sample_rows', 0)}`.
- Development audits: HF `{hf_audit.get('summary', {})}`, 6m `{six_audit.get('summary', {})}`.

## Sources

WSPRnet archive labels/exposure evidence, NASA SPDF OMNI2 and GFZ historical
indices, operationally timestamped NOAA/GFZ features, and a pinned ITU-R P.533
baseline. See `ml/config/propagation_v4_sources.json` and the committed source
manifest for URLs, hashes, terms, and time semantics.

## Sampling

Rows are deterministically ranked within frozen year/season/band/power/distance/
solar/geomagnetic/history strata. Nested quotas create exact 5M/20M/50M
cohorts. Training weights post-stratify sampled opportunity mass back to natural
stratum opportunity mass.

## Distribution and privacy

Raw third-party rows, callsigns, exact station identities, private locations,
and user shack inventories are excluded from the public research package.
Publish downloaders, checksums, schemas, aggregate documentation, and permitted
model artifacts only.
"""
    (result_dir / "data_card.md").write_text(data_card, encoding="utf-8")

    article = f"""# A Multi-Year, Equipment-Aware Propagation Nowcast for Amateur Radio

## Abstract

Propulse V4 studies calibrated amateur-radio propagation nowcasting across
quarterly WSPR archives from 2018 through 2024 while preserving a locked 2025
archive and a prospective 2026 window. The approach combines an exposure-aware
single-decode estimand, deterministic regime-balanced nested samples, boosted
trees, an official [ITU-R P.533](https://www.itu.int/rec/R-REC-P.533) baseline,
and a privacy-safe deterministic station adapter derived from the operator's
existing virtual shack. This document reports development evidence only.

## Development result

The current M2 candidate uses {compact(primary_cap)} rows and reaches Brier
`{m2_gate.get('weighted_brier', 'pending')}` on the October 2024 development
gate, with skill `{m2.get('brier_skill_vs_B0', 'pending')}` versus natural
band-hour climatology. These numbers do not include the locked 2025 or
prospective 2026 tests and must not be described as final generalization.

## Method

The archive infers receiver opportunities only when a transmitter and receiver
were observed active. It does not label every missing spot as a failure. The
training sample is balanced across declared physical and network regimes, then
post-stratified. XGBoost remains the primary engine. Calibration-family choice
uses a held-out portion of April 2024; October 2024 is evaluation-only.

StationCast does not send raw equipment records to the model endpoint. A shared
TypeScript/Python contract derives realizable conducted power, passive loss,
path-bearing antenna gain, receiver evidence, mode threshold, warnings, and a
stable fingerprint. The initial adjustment is deterministic; learned mode and
station residuals require consented prospective evidence.

## What remains unknown

The frozen V3 comparison, locked 2025 result, live operational parity, user
decision utility, and 2026 prospective performance are incomplete. FutureCast
is withheld because a leakage-free historical issuance archive was not found;
NOAA forecasts are being archived forward. The 6m track remains independent and
experimental because its mechanism labels are hypotheses rather than observed
ground truth.

## Open research commitment

The code, configs, feature definitions, tests, aggregate metrics, model/data
cards, and permitted artifacts will be open. Raw restricted archives and private
operator data will not be redistributed. The public result will include failed
gates and disabled horizons, not only positive findings.
"""
    research_path = ROOT / "ml/research/PERSONALIZED-PROPAGATION-V4-RESEARCH.md"
    research_path.parent.mkdir(parents=True, exist_ok=True)
    research_path.write_text(article, encoding="utf-8")

    git_commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, check=False,
        capture_output=True, text=True,
    ).stdout.strip()
    input_paths = [
        path for path in (
            development_path, six_path, p533_path, rolling_path, outage_path, future_path,
            sample_path, hf_audit_path, six_audit_path, bronze_path, sources_path,
        ) if path.exists()
    ]
    run_manifest = {
        "schema_version": 1,
        "generated_at": generated_at,
        "run_id": run_id,
        "git_commit": git_commit,
        "execution_scope": "development",
        "locked_archive_test_read": False,
        "prospective_test_complete": False,
        "development_complete": development_complete,
        "release_approved": False,
        "inputs": [
            {"path": relative(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in input_paths
        ],
        "report_artifact": relative(artifact_path),
        "required_followup": [
            "Run all rolling-origin and source-outage gates.",
            "Transfer and score frozen V3 before opening 2025.",
            "Complete the 2025 archive test once without tuning.",
            "Complete the 2026-08-01 through 2026-09-30 prospective test.",
        ],
    }
    write_json(result_dir / "run_manifest.json", run_manifest)
    (figures_dir / "README.md").write_text(
        "# Figures\n\nCharts are rendered and embedded from `REPORT.artifact.json` by the canonical "
        "portable report builder. Standalone exports must be extracted from that same "
        "validated artifact so the HTML and public figures cannot diverge.\n",
        encoding="utf-8",
    )
    print(artifact_path)


if __name__ == "__main__":
    main()
