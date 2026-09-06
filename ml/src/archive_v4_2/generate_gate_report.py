#!/usr/bin/env python3
"""Generate the canonical V4.2 December or archive gate report."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
if str(MODULE) not in sys.path:
    sys.path.insert(0, str(MODULE))

import run_paths  # noqa: E402

DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def source(path: Path, synthetic: bool) -> dict[str, Any]:
    location = relative(path)
    return {
        "id": "gate_result",
        "label": (
            "Synthetic V4.2 gate rendering fixture"
            if synthetic
            else "Frozen V4.2 outcome gate result"
        ),
        "path": location,
        "query": {
            "engine": "duckdb",
            "language": "sql",
            "description": f"Load the reviewed JSON artifact {location}.",
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
        "sourceId": "gate_result",
        "encodings": encodings,
        "valueFormat": "number",
        "layout": "full",
    }


def keyed(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(row["key"]): row for row in rows}


def fixture_metric(brier: float, months: list[str]) -> dict[str, Any]:
    days = []
    for month in months:
        days.extend(
            {
                "key": f"{month}-{day:02d}",
                "weighted_brier": brier + ((day % 5) - 2) * 0.00005,
                "opportunities": 2_000_000.0,
                "rows": 20_000,
            }
            for day in range(1, 29)
        )
    weeks = [
        {
            "key": f"week-{index + 1}",
            "weighted_brier": brier + (index - 2) * 0.00003,
            "opportunities": 12_000_000.0,
            "rows": 120_000,
        }
        for index in range(5)
    ]
    bands = [
        {
            "key": band,
            "weighted_brier": brier + index * 0.00004,
            "opportunities": 5_000_000.0,
            "rows": 50_000,
        }
        for index, band in enumerate(
            ("160m", "80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m", "10m")
        )
    ]
    distances = [
        {
            "key": label,
            "weighted_brier": brier + index * 0.00003,
            "opportunities": 6_000_000.0,
            "rows": 60_000,
        }
        for index, label in enumerate(
            (
                "0-500 km",
                "500-1500 km",
                "1500-3000 km",
                "3000-6000 km",
                "6000-10000 km",
                "10000-25000 km",
            )
        )
    ]
    bins = [
        {
            "bin": index,
            "lower": index / 10,
            "upper": (index + 1) / 10,
            "mean_prediction": (index + 0.5) / 10,
            "observed_rate": min(0.99, (index + 0.5) / 10 + 0.002),
            "opportunities": 1_000_000.0,
        }
        for index in range(10)
    ]
    return {
        "overall": {
            "weighted_brier": brier,
            "opportunities": 56_000_000.0 * len(months),
            "rows": 560_000 * len(months),
            "expected_calibration_error": 0.002,
            "maximum_calibration_error": 0.002,
            "bins": bins,
        },
        "slices": {
            "month": [
                {
                    "key": month,
                    "weighted_brier": brier,
                    "opportunities": 56_000_000.0,
                    "rows": 560_000,
                }
                for month in months
            ],
            "day": days,
            "week": weeks,
            "band": bands,
            "distance": distances,
        },
    }


def synthetic_result(config: dict[str, Any]) -> dict[str, Any]:
    from gate_scoring import decide_december

    candidate = fixture_metric(0.044, ["2024-12"])
    baseline = fixture_metric(0.046, ["2024-12"])
    phase3_names = (
        "bundle_checksum_and_schema",
        "serving_thread_contract",
        "offline_service_parity",
        "bounded_probabilities",
        "fresh_selects_nowcast",
        "stale_selects_physics_with_provenance",
        "missing_freshness_selects_fallback",
        "stale_reduces_confidence",
        "missing_feature_is_explicit",
        "frontend_response_contract",
        "public_manifest_privacy",
        "single_latency",
        "batch_latency",
        "memory_budget",
        "bundle_size",
        "locked_scopes_remain_closed",
    )
    phase3 = {"passed": True, "gates": {name: True for name in phase3_names}}
    metrics = {"candidate": candidate, "B2_frozen_v3": baseline}
    decision = decide_december(
        metrics,
        phase3,
        {"passed": True},
        config,
        locked_2025_read=False,
    )
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_id": config["run_id"],
        "scope": "synthetic_december_dry_run",
        "synthetic": True,
        "months": ["2024-12"],
        "december_2024_read": False,
        "locked_2025_read": False,
        "prospective_read": False,
        "rows": 560_000,
        "metrics": metrics,
        "decision": decision,
        "compute": {
            "machine": "synthetic-fixture",
            "wall_seconds": 12.5,
            "peak_rss_gb": 1.25,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--result")
    parser.add_argument("--synthetic", action="store_true")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    if bool(args.result) == bool(args.synthetic):
        raise RuntimeError("select exactly one of --result or --synthetic")
    output_dir = Path(args.output_dir).resolve()
    try:
        output_dir.relative_to(ROOT)
    except ValueError as error:
        raise RuntimeError("gate report output must remain under the repository") from error
    output_dir.mkdir(parents=True, exist_ok=True)
    config = read_json(Path(args.config).resolve())
    if args.synthetic:
        result = synthetic_result(config)
        result_path = output_dir / "synthetic_gate_result.json"
        write_json(result_path, result)
    else:
        result_path = Path(args.result).resolve()
        result = read_json(result_path)
        if result.get("synthetic"):
            raise RuntimeError("real gate mode received a synthetic result")
    synthetic = bool(result.get("synthetic"))
    if not synthetic and not result.get("december_2024_read"):
        raise RuntimeError("real gate report requires recorded December access")
    candidate = result["metrics"]["candidate"]
    baseline = result["metrics"]["B2_frozen_v3"]
    candidate_brier = float(candidate["overall"]["weighted_brier"])
    baseline_brier = float(baseline["overall"]["weighted_brier"])
    improvement = 1 - candidate_brier / baseline_brier
    passed = bool(result["decision"]["passed"])
    scope_label = (
        "Synthetic December dry run"
        if synthetic
        else ("December 2024 gate" if result["scope"] == "december" else "Locked 2025 archive")
    )
    decision_text = (
        "The synthetic fixture passes every rendering gate. This validates only the reporting path; it is not model evidence."
        if synthetic
        else (
            "The frozen candidate passed every gate and may advance under the preregistered protocol."
            if passed
            else "The frozen candidate failed at least one gate and must stop without tuning on these outcomes."
        )
    )
    overall_rows = [
        {"model": "Frozen V4.2 candidate", "brier": candidate_brier},
        {"model": "Frozen V3/B2", "brier": baseline_brier},
    ]
    candidate_days = keyed(candidate["slices"]["day"])
    baseline_days = keyed(baseline["slices"]["day"])
    day_rows = [
        {
            "day": key,
            "delta_vs_b2": float(value["weighted_brier"])
            - float(baseline_days[key]["weighted_brier"]),
        }
        for key, value in candidate_days.items()
    ]
    candidate_bands = keyed(candidate["slices"]["band"])
    baseline_bands = keyed(baseline["slices"]["band"])
    band_rows = [
        {
            "band": key,
            "relative_brier_regression": float(value["weighted_brier"])
            / float(baseline_bands[key]["weighted_brier"])
            - 1,
        }
        for key, value in candidate_bands.items()
    ]
    candidate_distance = keyed(candidate["slices"]["distance"])
    baseline_distance = keyed(baseline["slices"]["distance"])
    distance_rows = [
        {
            "distance": key,
            "delta_vs_b2": float(value["weighted_brier"])
            - float(baseline_distance[key]["weighted_brier"]),
        }
        for key, value in candidate_distance.items()
    ]
    reliability_rows = []
    for name, metric in (
        ("Frozen V4.2 candidate", candidate),
        ("Frozen V3/B2", baseline),
    ):
        reliability_rows.extend(
            {
                "series": name,
                "mean_prediction": float(row["mean_prediction"]),
                "observed_rate": float(row["observed_rate"]),
            }
            for row in metric["overall"]["bins"]
        )
    reliability_rows.extend(
        [
            {
                "series": "Perfect calibration",
                "mean_prediction": value,
                "observed_rate": value,
            }
            for value in (0.0, 1.0)
        ]
    )
    gate_rows = [
        {
            "gate": str(row["id"]),
            "passed": "pass" if row["passed"] else "fail",
            "evidence": json.dumps(
                {key: value for key, value in row.items() if key not in {"id", "passed"}},
                sort_keys=True,
            )[:500],
        }
        for row in result["decision"]["gates"]
    ]
    summary = [
        {
            "candidate_brier": candidate_brier,
            "b2_brier": baseline_brier,
            "relative_improvement": improvement,
            "gates_passed": sum(row["passed"] for row in result["decision"]["gates"]),
            "gates_total": len(result["decision"]["gates"]),
            "rows": int(result["rows"]),
            "peak_rss_gb": float(result["compute"]["peak_rss_gb"]),
        }
    ]
    generated_at = datetime.now(timezone.utc).isoformat()
    sources = [source(result_path, synthetic)]
    cards = [
        {
            "id": name,
            "description": description,
            "dataset": "summary",
            "sourceId": "gate_result",
            "metrics": [{"label": label, "field": field, "format": "number"}],
        }
        for name, label, field, description in (
            ("candidate", "Candidate Brier", "candidate_brier", "Opportunity-weighted probability error."),
            ("baseline", "B2 Brier", "b2_brier", "Frozen operational benchmark."),
            ("improvement", "Relative improvement", "relative_improvement", "Positive values improve on B2."),
            ("gates", "Gates passed", "gates_passed", "Every gate is mandatory."),
            ("rows", "Rows", "rows", "Identical rows for candidate and B2."),
            ("memory", "Peak RSS GiB", "peak_rss_gb", "Bounded M5 scoring process."),
        )
    ]
    charts = [
        chart(
            "overall_brier",
            "Gate weighted Brier",
            "Frozen candidate and B2 on identical outcome rows; lower is better.",
            "bar",
            "overall_rows",
            {
                "x": {"field": "model", "type": "ordinal", "label": "Model"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
            },
        ),
        chart(
            "daily_delta",
            "Paired UTC-day Brier delta",
            "Candidate minus B2; negative values improve. The bootstrap resamples these daily aggregates.",
            "bar",
            "day_rows",
            {
                "x": {"field": "day", "type": "ordinal", "label": "UTC day"},
                "y": {"field": "delta_vs_b2", "type": "quantitative", "label": "Brier delta vs B2"},
            },
        ),
        chart(
            "band_safety",
            "Supported-band relative Brier regression",
            "Candidate relative to B2; negative values improve and positive values regress.",
            "bar",
            "band_rows",
            {
                "x": {"field": "band", "type": "ordinal", "label": "Band"},
                "y": {"field": "relative_brier_regression", "type": "quantitative", "label": "Relative regression"},
            },
        ),
        chart(
            "distance_safety",
            "Path-distance Brier delta",
            "Candidate minus B2 on fixed distance bins; short paths have explicit materiality tolerances.",
            "bar",
            "distance_rows",
            {
                "x": {"field": "distance", "type": "ordinal", "label": "Distance"},
                "y": {"field": "delta_vs_b2", "type": "quantitative", "label": "Brier delta vs B2"},
            },
        ),
        chart(
            "reliability",
            "Gate probability reliability",
            "Observed opportunity-weighted success versus mean predicted probability.",
            "line",
            "reliability_rows",
            {
                "x": {"field": "mean_prediction", "type": "quantitative", "label": "Mean prediction"},
                "y": {"field": "observed_rate", "type": "quantitative", "label": "Observed rate"},
                "color": {"field": "series", "type": "nominal", "label": "Series"},
            },
        ),
    ]
    tables = [
        {
            "id": "gate_table",
            "title": "Preregistered gate decision",
            "subtitle": "Every row must pass; evidence is copied from the immutable scorer output.",
            "dataset": "gate_rows",
            "sourceId": "gate_result",
            "defaultSort": {"field": "gate", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "gate", "label": "Gate", "type": "text"},
                {"field": "passed", "label": "Status", "type": "text"},
                {"field": "evidence", "label": "Evidence", "type": "text"},
            ],
        }
    ]
    synthetic_warning = (
        "**Synthetic fixture:** all values in this report are fabricated solely to validate rendering and browser behavior."
        if synthetic
        else "The result is a one-shot frozen outcome evaluation. It was not used for fitting or tuning."
    )
    blocks = [
        {"id": "title", "type": "markdown", "body": f"# Propagation V4.2: {scope_label}"},
        {"id": "summary", "type": "markdown", "body": f"## Technical summary\n\n{synthetic_warning}\n\n{decision_text}"},
        {"id": "cards", "type": "metric-strip", "cardIds": [item["id"] for item in cards]},
        {"id": "definition", "type": "markdown", "body": "## What the gate measures\n\nBrier score is the opportunity-weighted squared error of the public WSPR single-decode probability. Candidate and B2 receive identical rows. All comparisons are predictive and retrospective; they do not establish causal propagation effects or guaranteed QSOs."},
        {"id": "overall", "type": "chart", "chartId": "overall_brier", "layout": "full"},
        {"id": "gate_table_block", "type": "table", "tableId": "gate_table", "layout": "full"},
        {"id": "temporal", "type": "markdown", "body": "## Transfer must persist through time\n\nThe aggregate point estimate is paired with UTC-day bootstrap uncertainty and daily/weekly stability checks so a few high-volume periods cannot decide advancement."},
        {"id": "daily", "type": "chart", "chartId": "daily_delta", "layout": "full"},
        {"id": "slices", "type": "markdown", "body": "## Aggregate performance cannot hide unsafe slices\n\nOnly preregistered supported bands and distances are interpreted. December uses a 2% band ceiling and explicit short-path absolute-or-relative tolerances; the locked archive uses a 3% band ceiling."},
        {"id": "band", "type": "chart", "chartId": "band_safety", "layout": "full"},
        {"id": "distance", "type": "chart", "chartId": "distance_safety", "layout": "full"},
        {"id": "calibration", "type": "markdown", "body": "## Calibrated magnitude matters to the product\n\nReachMap and StationCast consume probability magnitude, so ECE and high-confidence reliability are mandatory alongside Brier."},
        {"id": "reliability_block", "type": "chart", "chartId": "reliability", "layout": "full"},
        {"id": "method", "type": "markdown", "body": "## Method and frozen execution\n\nThe scorer streams 100,000-row Arrow batches on native arm64, scores the packaged candidate and frozen B2 on the same feature matrix, and retains additive sufficient statistics only. The access protocol hashes every frozen dependency and records the one-shot attempt before acquisition."},
        {"id": "limits", "type": "markdown", "body": "## Limitations and robustness\n\nWSPR observations reflect receiver deployment and reporting behavior as well as ionospheric propagation. Supported-slice thresholds limit noisy vetoes but do not eliminate selection effects. Operational fallback and service parity evidence comes from Phase 3, not this archive stream."},
        {"id": "next", "type": "markdown", "body": "## Recommended next step\n\n" + decision_text},
        {"id": "questions", "type": "markdown", "body": "## Further questions\n\n- Does performance transfer to the next locked scope without tuning?\n- Which supported bands or distance regimes set the limiting gate?\n- Does the approved core improve operator choices during the prospective opt-in study?"},
    ]
    artifact = {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": f"Propagation V4.2: {scope_label}",
            "description": "Frozen outcome-gate evidence, uncertainty, calibration, slices, and operational decision.",
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
                "day_rows": day_rows,
                "band_rows": band_rows,
                "distance_rows": distance_rows,
                "reliability_rows": reliability_rows,
                "gate_rows": gate_rows,
            },
        },
        "sources": sources,
    }
    artifact_path = output_dir / "REPORT.artifact.json"
    write_json(artifact_path, artifact)
    markdown = f"""# Propagation V4.2: {scope_label}

Generated: {generated_at}

## Answer first

{synthetic_warning}

{decision_text}

Candidate Brier: `{candidate_brier:.8f}`

Frozen B2 Brier: `{baseline_brier:.8f}`

Relative improvement: `{improvement:.3%}`

## Gates

| Gate | Status |
|---|---|
"""
    for row in gate_rows:
        markdown += f"| {row['gate']} | {row['passed']} |\n"
    markdown += "\nSee `REPORT.html` for interactive charts, exact evidence, methods, and limitations.\n"
    (output_dir / "REPORT.md").write_text(markdown, encoding="utf-8")
    print(artifact_path)


if __name__ == "__main__":
    main()
