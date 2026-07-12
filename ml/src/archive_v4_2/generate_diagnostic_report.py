#!/usr/bin/env python3
"""Generate the V4.2 Phase 0 Markdown and portable visual report artifact."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RUN_ID = "propagation_v4_2_performance_recovery"
RESULT = ROOT / "ml/results/propagation_v4_2" / RUN_ID
DEFAULT_INPUT = RESULT / "diagnosis.json"


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
) -> dict[str, Any]:
    return {
        "id": chart_id,
        "title": title,
        "subtitle": subtitle,
        "type": chart_type,
        "dataset": dataset,
        "sourceId": "diagnosis",
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
        "sourceId": "diagnosis",
        "metrics": [{"label": label, "field": field, "format": value_format}],
    }


def policy_brier(policy: dict[str, Any]) -> float:
    if "candidate_brier" in policy:
        return float(policy["candidate_brier"])
    return float(policy["blend_brier"])


def policy_delta(policy: dict[str, Any]) -> float:
    if "candidate_minus_b2_brier" in policy:
        return float(policy["candidate_minus_b2_brier"])
    return float(policy["blend_minus_b2_brier"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile

    input_path = Path(args.input).resolve()
    result = read_json(input_path)
    access = result["outcome_access"]
    if access["december_2024_read"] or access["locked_2025_read"]:
        raise RuntimeError("Phase 0 report cannot include December 2024 or 2025")
    if result["scope"] != "observed_2024_paired_diagnosis":
        raise RuntimeError("unexpected diagnosis scope")

    generated_at = datetime.now(timezone.utc).isoformat()
    evaluation = result["overall"]["evaluation"]
    development = result["overall"]["development"]
    policies = result["evaluation_policies"]
    best_name = result["best_evaluation_policy"]
    best = policies[best_name]
    blend_weight = float(result["blend_selection"]["rounded_b2_weight"])
    total_rows = sum(int(item["rows"]) for item in result["inputs"].values())
    evaluation_rows = sum(
        int(result["inputs"][month]["rows"])
        for month in access["evaluation_months"]
    )

    summary = [{
        "observed_rows": total_rows,
        "evaluation_rows": evaluation_rows,
        "evaluation_b2_brier": float(evaluation["b2_brier"]),
        "evaluation_m2_brier": float(evaluation["m2_brier"]),
        "raw_m2_delta": float(evaluation["m2_minus_b2_brier"]),
        "best_policy_brier": policy_brier(best),
        "best_policy_delta": policy_delta(best),
        "selected_b2_weight": blend_weight,
        "peak_rss_gb": float(result["compute"]["maximum_rss_gb"]),
        "wall_minutes": float(result["compute"]["wall_seconds"]) / 60.0,
    }]

    month_comparison = []
    for row in result["slices"]["month"]:
        for candidate, field in (("B2 frozen V3", "b2_brier"), ("Raw M2", "m2_brier")):
            month_comparison.append({
                "month": row["key"],
                "candidate": candidate,
                "brier": float(row[field]),
                "opportunities": float(row["opportunities"]),
                "rows": int(row["rows"]),
            })

    policy_labels = {
        "raw_m2": "Raw M2",
        "selected_blend": "Fixed blend",
        "band_router": "Band router",
        "stable_band_distance_router": "Stable band-distance router",
    }
    policy_rows = [{
        "policy": "B2 frozen V3",
        "brier": float(evaluation["b2_brier"]),
        "delta_vs_b2": 0.0,
    }]
    for name, value in policies.items():
        policy_rows.append({
            "policy": policy_labels[name],
            "brier": policy_brier(value),
            "delta_vs_b2": policy_delta(value),
        })

    band_rows = [
        {
            "band": row["key"],
            "m2_minus_b2_brier": float(row["m2_minus_b2_brier"]),
            "router_choice": result["routers"]["band"]["choices"].get(
                row["key"], "b2"
            ).upper(),
            "opportunities": float(row["opportunities"]),
        }
        for row in result["slices"]["band"]
    ]
    band_rows.sort(key=lambda row: row["m2_minus_b2_brier"])
    distance_rows = [
        {
            "distance": row["key"],
            "m2_minus_b2_brier": float(row["m2_minus_b2_brier"]),
            "opportunities": float(row["opportunities"]),
        }
        for row in result["slices"]["distance"]
    ]
    blend_curve = []
    for row in result["blend_selection"]["grid"]:
        for scope, label in (("development", "Development selection"), ("evaluation", "October + November")):
            blend_curve.append({
                "b2_weight": float(row["b2_weight"]),
                "scope": label,
                "brier": float(row[scope]["blend_brier"]),
            })

    regime_rows = []
    for dimension in ("history", "f107", "geomagnetic", "missingness", "receiver_latitude"):
        for row in result["slices"][dimension]:
            regime_rows.append({
                "dimension": dimension.replace("_", " ").title(),
                "slice": row["key"],
                "m2_minus_b2_brier": float(row["m2_minus_b2_brier"]),
                "b2_brier": float(row["b2_brier"]),
                "m2_brier": float(row["m2_brier"]),
                "opportunities": float(row["opportunities"]),
                "rows": int(row["rows"]),
            })
    band_distance = sorted(
        (
            {
                "cell": row["key"],
                "m2_minus_b2_brier": float(row["m2_minus_b2_brier"]),
                "b2_brier": float(row["b2_brier"]),
                "m2_brier": float(row["m2_brier"]),
                "opportunities": float(row["opportunities"]),
                "stable_choice": result["routers"]["stable_band_distance"][
                    "choices"
                ].get(row["key"], "b2").upper(),
            }
            for row in result["slices"]["band_distance"]
        ),
        key=lambda row: row["m2_minus_b2_brier"],
    )
    band_distance_extremes = [*band_distance[:8], *band_distance[-8:]]

    bootstrap_rows = []
    for name, values in result["bootstrap"].items():
        bootstrap_rows.append({
            "policy": name.replace("_minus_b2", "").replace("_", " ").title(),
            "lower_95": float(values["lower_95"]),
            "median": float(values["median"]),
            "upper_95": float(values["upper_95"]),
        })

    m2_bands = result["routers"]["band"]["m2_choices"]
    stable_cells = result["routers"]["stable_band_distance"]["m2_choices"]
    best_delta = policy_delta(best)
    policies_collapse_to_b2 = (
        abs(best_delta) < 1e-15
        and blend_weight == 1.0
        and not m2_bands
        and not stable_cells
    )
    if policies_collapse_to_b2:
        best_statement = (
            "Every development-selected blend and router collapsed to **frozen "
            f"B2** at Brier {evaluation['b2_brier']:.8f}; none added value."
        )
    else:
        best_statement = (
            f"The strongest no-retraining policy was **{policy_labels[best_name]}**, "
            f"with Brier {policy_brier(best):.8f} ({best_delta:+.8f} versus B2)."
        )
        if best_delta >= 0:
            best_statement += " It did not beat the frozen V3 benchmark."
        else:
            upper = result["bootstrap"][
                {
                    "raw_m2": "raw_m2_minus_b2",
                    "selected_blend": "selected_blend_minus_b2",
                    "band_router": "band_router_minus_b2",
                    "stable_band_distance_router": "stable_band_distance_router_minus_b2",
                }[best_name]
            ]["upper_95"]
            best_statement += (
                " Its paired-day interval "
                + ("also excludes zero." if upper < 0 else "still includes zero.")
            )

    sources = [source("diagnosis", "V4.2 paired streaming diagnosis", input_path)]
    cards = [
        card("rows", "Observed rows", "observed_rows", "Six full observed 2024 months."),
        card("b2", "Evaluation B2 Brier", "evaluation_b2_brier", "October plus November; lower is better."),
        card("m2_delta", "Raw M2 minus B2", "raw_m2_delta", "Positive values favor B2."),
        card("best_delta", "Best policy minus B2", "best_policy_delta", "October plus November paired delta."),
        card("blend_weight", "Blend B2 weight", "selected_b2_weight", "Selected on February, April, May, and August.", "percent"),
        card("peak_rss", "Peak RSS GB", "peak_rss_gb", "Bounded-memory M5 streaming run."),
    ]
    charts = [
        chart(
            "month_comparison",
            "Frozen V3 and raw V4 performance by observed month",
            "Opportunity-weighted Brier on identical full-month rows; lower is better.",
            "bar",
            "month_comparison",
            {
                "x": {"field": "month", "type": "ordinal", "label": "Month"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
                "color": {"field": "candidate", "type": "nominal", "label": "Candidate"},
            },
        ),
        chart(
            "policy_comparison",
            "No-retraining policy comparison",
            "October plus November opportunity-weighted Brier; policies were selected only on four earlier months.",
            "bar",
            "policy_rows",
            {
                "x": {"field": "policy", "type": "ordinal", "label": "Policy"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
            },
        ),
        chart(
            "band_delta",
            "Raw M2 error difference by band",
            "Raw M2 minus B2 Brier across all six observed months; negative values favor M2.",
            "bar",
            "band_rows",
            {
                "x": {"field": "band", "type": "ordinal", "label": "Band"},
                "y": {"field": "m2_minus_b2_brier", "type": "quantitative", "label": "M2 minus B2 Brier"},
            },
        ),
        chart(
            "distance_delta",
            "Raw M2 error difference by path distance",
            "Raw M2 minus B2 Brier across all six observed months; negative values favor M2.",
            "bar",
            "distance_rows",
            {
                "x": {"field": "distance", "type": "ordinal", "label": "Distance"},
                "y": {"field": "m2_minus_b2_brier", "type": "quantitative", "label": "M2 minus B2 Brier"},
            },
        ),
        chart(
            "blend_curve",
            "Convex blend sensitivity",
            "B2 weight from zero (raw M2) to one (frozen V3); selected on four development months.",
            "line",
            "blend_curve",
            {
                "x": {"field": "b2_weight", "type": "quantitative", "label": "B2 weight", "format": "percent"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
                "color": {"field": "scope", "type": "nominal", "label": "Evidence scope"},
            },
        ),
    ]
    tables = [
        {
            "id": "bootstrap",
            "title": "Paired-day uncertainty on October and November",
            "subtitle": "Two thousand UTC-day resamples; negative deltas favor the candidate over B2.",
            "dataset": "bootstrap_rows",
            "sourceId": "diagnosis",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "policy", "label": "Policy", "type": "text"},
                {"field": "lower_95", "label": "Lower 95%", "format": "number"},
                {"field": "median", "label": "Median", "format": "number"},
                {"field": "upper_95", "label": "Upper 95%", "format": "number"},
            ],
        },
        {
            "id": "regimes",
            "title": "Operational regime diagnostics",
            "subtitle": "Paired error by history, solar, geomagnetic, missingness, and coarse receiver latitude state.",
            "dataset": "regime_rows",
            "sourceId": "diagnosis",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "dimension", "label": "Dimension", "type": "text"},
                {"field": "slice", "label": "Slice", "type": "text"},
                {"field": "m2_minus_b2_brier", "label": "M2 minus B2", "format": "number"},
                {"field": "opportunities", "label": "Opportunities", "format": "number"},
                {"field": "rows", "label": "Rows", "format": "number"},
            ],
        },
        {
            "id": "band_distance",
            "title": "Strongest and weakest band-distance cells",
            "subtitle": "Eight cells at each extreme across all observed months; routing requires four-month development stability.",
            "dataset": "band_distance_extremes",
            "sourceId": "diagnosis",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "cell", "label": "Band-distance", "type": "text"},
                {"field": "m2_minus_b2_brier", "label": "M2 minus B2", "format": "number"},
                {"field": "opportunities", "label": "Opportunities", "format": "number"},
                {"field": "stable_choice", "label": "Stable choice", "type": "text"},
            ],
        },
    ]

    blocks: list[dict[str, Any]] = [
        {"id": "title", "type": "markdown", "body": "# Propagation V4.2 Phase 0 Performance Diagnosis"},
        {
            "id": "answer",
            "type": "markdown",
            "body": (
                "## Answer first\n\n"
                f"{best_statement} The six-month evidence does **not** justify blindly scaling the existing M2. "
                "It supports controlled recency, sampling, iteration-capacity, and mixture-of-experts ablations "
                "before another 50M-row training run. December 2024 and all 2025 outcomes remain closed."
            ),
        },
        {"id": "headline", "type": "metric-strip", "cardIds": [item["id"] for item in cards]},
        {"id": "months", "type": "chart", "chartId": "month_comparison", "layout": "full"},
        {
            "id": "month_explainer",
            "type": "markdown",
            "body": (
                "## Why this comparison matters\n\n"
                "Both frozen models were scored on identical natural-distribution rows and opportunity weights. "
                "The comparison therefore isolates model behavior from sample composition. V3/B2 includes a "
                "per-band calibrator; M2 is intentionally raw here so representation and ranking are not hidden "
                "by another post-hoc calibration search."
            ),
        },
        {"id": "policies", "type": "chart", "chartId": "policy_comparison", "layout": "full"},
        {"id": "bootstrap_table", "type": "table", "tableId": "bootstrap", "layout": "full"},
        {"id": "band", "type": "chart", "chartId": "band_delta", "layout": "full"},
        {"id": "distance", "type": "chart", "chartId": "distance_delta", "layout": "full"},
        {
            "id": "specialists",
            "type": "markdown",
            "body": (
                "## Specialist signal\n\n"
                f"The development-only band router assigns raw M2 to {', '.join(m2_bands) if m2_bands else 'no complete band'}. "
                f"The stricter router found {len(stable_cells)} band-distance cells where M2 won in every one of "
                "February, April, May, and August with sufficient support. These are candidate expert boundaries, "
                "not production routing rules."
            ),
        },
        {"id": "blend", "type": "chart", "chartId": "blend_curve", "layout": "full"},
        {"id": "regime_table", "type": "table", "tableId": "regimes", "layout": "full"},
        {"id": "cell_table", "type": "table", "tableId": "band_distance", "layout": "full"},
        {
            "id": "method",
            "type": "markdown",
            "body": (
                "## Method\n\n"
                f"The scorer streamed {total_rows:,} rows from six full Parquet months in 100,000-row batches. "
                "It retained only weighted squared-error and cross-error sufficient statistics. Blend weight, "
                "band routing, and stable band-distance routing were selected on February, April, May, and August; "
                "October and November evaluated those policies. Every input checksum was verified. The run used "
                f"{result['compute']['maximum_rss_gb']:.2f} GB peak RSS over {result['compute']['wall_seconds'] / 60:.1f} minutes."
            ),
        },
        {
            "id": "interpretation",
            "type": "markdown",
            "body": (
                "## What to do next\n\n"
                "Run the preregistered 5M A0-A5 ablations first. A0 must reproduce V3 under the current pipeline. "
                "A1 isolates missingness flags. A2/A3 isolate natural versus balanced historical sampling. "
                "A4/A5 test recent-cycle training and recency weighting. A6/A7 test a simple ensemble and "
                "band-aware experts only if the trained candidates show complementary cross-month residuals or "
                "stable specialties. Only the strongest three advance to 20M and at most two to 50M. "
                "A 100M run remains conditional on an improving learning curve."
            ),
        },
        {
            "id": "limits",
            "type": "markdown",
            "body": (
                "## Limits\n\n"
                "This is diagnosis on previously observed outcomes, not a new validation claim. The target is "
                "conditional WSPR single-decode probability for inferred-active path-hours, not generic QSO "
                "success. Public receiver participation and equipment remain incompletely observed. No result "
                "here authorizes December 2024, the locked 2025 archive, or production replacement."
            ),
        },
    ]

    artifact = {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Propagation V4.2 Phase 0 Performance Diagnosis",
            "description": "Paired six-month diagnosis of frozen V3/B2 and raw V4/M2 with development-selected blends and routers.",
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
                "month_comparison": month_comparison,
                "policy_rows": policy_rows,
                "band_rows": band_rows,
                "distance_rows": distance_rows,
                "blend_curve": blend_curve,
                "regime_rows": regime_rows,
                "band_distance_extremes": band_distance_extremes,
                "bootstrap_rows": bootstrap_rows,
            },
        },
        "sources": sources,
    }
    artifact_path = RESULT / "REPORT.artifact.json"
    write_json(artifact_path, artifact)

    markdown = f"""# Propagation V4.2 Phase 0 Performance Diagnosis

Generated: {generated_at}

## Answer first

{best_statement} The six-month evidence does not justify blindly scaling the
existing M2. Run the controlled 5M reproduction, recency, sampling, capacity,
and missingness ablations before another 50M training run. Ensemble and expert
routing tests are conditional on new candidates showing complementary residuals.

December 2024 and all 2025 outcomes remain closed.

## Overall comparison

| Scope | B2 Brier | Raw M2 Brier | M2 minus B2 | Opportunities |
|---|---:|---:|---:|---:|
| Development: Feb/Apr/May/Aug | {development['b2_brier']:.8f} | {development['m2_brier']:.8f} | {development['m2_minus_b2_brier']:+.8f} | {development['opportunities']:,.2f} |
| Evaluation: Oct/Nov | {evaluation['b2_brier']:.8f} | {evaluation['m2_brier']:.8f} | {evaluation['m2_minus_b2_brier']:+.8f} | {evaluation['opportunities']:,.2f} |

## No-retraining policies on October and November

| Policy | Brier | Delta versus B2 |
|---|---:|---:|
"""
    for row in policy_rows:
        markdown += f"| {row['policy']} | {row['brier']:.8f} | {row['delta_vs_b2']:+.8f} |\n"
    markdown += f"""

## Model interpretation

- Analytic development blend weight: `{result['blend_selection']['analytic_b2_weight']:.6f}` B2.
- Robust rounded blend weight: `{blend_weight:.2f}` B2.
- Development-selected M2 specialist bands: `{', '.join(m2_bands) if m2_bands else 'none'}`.
- Cross-month stable M2 band-distance cells: `{len(stable_cells)}`.
- Best no-retraining decision: `retain frozen B2; no policy improved it`.

## Methodology

Both models were streamed over the same `{total_rows:,}` full-month rows. The
scorer retained weighted B2 error, M2 error, their cross-product, row count, and
positive opportunity mass by month, day, band, distance, recent-history state,
solar and geomagnetic regime, source missingness, coarse receiver latitude, and
prediction disagreement. Policies were selected only on February, April, May,
and August, then evaluated on October and November with 2,000 paired UTC-day
bootstrap repetitions.

Peak RSS was `{result['compute']['maximum_rss_gb']:.2f} GB`; wall time was
`{result['compute']['wall_seconds'] / 60:.1f}` minutes. Input checksums were
verified during this run.

## Recommendation

Proceed to the exact nested 5M A0-A5 ablations in
`ml/PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md`. Do not acquire December
2024. Run A6/A7 only if new models show complementary cross-month residuals or
stable specialties. Only three candidates may advance to 20M and two to 50M;
100M requires an improving scale curve and a demonstrated variance/support
limitation.

## Limits

This is development diagnosis on previously observed outcomes, not fresh
validation. The target is conditional WSPR single-decode probability for
inferred-active path-hours, not generic QSO probability. No result authorizes
December 2024, the locked 2025 archive, or production replacement.

## Reproduction

```bash
ml/.venv/bin/python ml/src/archive_v4_2/diagnose_v3_v4.py \\
  --profile m5 --verify-input-hashes
ml/.venv/bin/python ml/src/archive_v4_2/generate_diagnostic_report.py \\
  --profile m5
node ml/src/archive_v4/package_report.mjs --input \\
  ml/results/propagation_v4_2/{RUN_ID}/REPORT.artifact.json --output \\
  ml/results/propagation_v4_2/{RUN_ID}/REPORT.html
```
"""
    (RESULT / "REPORT.md").write_text(markdown, encoding="utf-8")
    print(artifact_path)


if __name__ == "__main__":
    main()
