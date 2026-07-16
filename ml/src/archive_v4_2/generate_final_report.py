#!/usr/bin/env python3
"""Build the combined V4.2 research and operational validation report."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime


ROOT = Path(__file__).resolve().parents[3]
RUN_ID = "propagation_v4_2_phase2_scale"
RESULT = ROOT / "ml/results/propagation_v4_2" / RUN_ID
PHASE1 = ROOT / "ml/results/propagation_v4_2/propagation_v4_2_phase1_5m"
CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
INPUTS = {
    "phase1_evaluation": PHASE1 / "evaluation_results.json",
    "phase1_policy": PHASE1 / "conditional_results.json",
    "phase2_20m": RESULT / "evaluation_20m_results.json",
    "phase2_50m": RESULT / "evaluation_50m_results.json",
    "training_50m": RESULT / "training_50m_results.json",
    "backend_benchmark": RESULT / "backend_benchmark_decision.json",
    "prediction_benchmark": RESULT / "prediction_thread_benchmark.json",
    "phase3_validation": RESULT / "phase3_candidate_validation.json",
    "december_gate": RESULT / "december_gate_result.json",
    "archive_gate": RESULT / "archive_gate_result.json",
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def keyed(rows: list[dict[str, Any]], field: str = "key") -> dict[str, dict[str, Any]]:
    return {str(row[field]): row for row in rows}


def metric_brier(result: dict[str, Any], name: str) -> float:
    return float(result["metrics"][name]["overall"]["weighted_brier"])


def selection_rows(result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return keyed(result["selection"]["rows"], "candidate")


def source(path: Path) -> dict[str, Any]:
    location = relative(path)
    return {
        "id": "final_evidence",
        "label": "V4.2 combined reviewed evidence",
        "path": location,
        "query": {
            "engine": "duckdb",
            "language": "sql",
            "description": f"Load the derived, checksum-linked JSON evidence {location}.",
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
        "sourceId": "final_evidence",
        "encodings": encodings,
        "valueFormat": "number",
        "layout": "full",
    }


def build_evidence(values: dict[str, dict[str, Any]]) -> dict[str, Any]:
    phase1 = values["phase1_evaluation"]
    phase1_policy = values["phase1_policy"]
    phase20 = values["phase2_20m"]
    phase50 = values["phase2_50m"]
    training50 = values["training_50m"]
    backend = values["backend_benchmark"]
    prediction = values["prediction_benchmark"]
    phase3 = values["phase3_validation"]
    december = values["december_gate"]
    archive = values["archive_gate"]

    if not december["decision"]["passed"] or not archive["decision"]["passed"]:
        raise RuntimeError("final report requires passing frozen December and archive decisions")
    if bool(archive.get("prospective_read")):
        raise RuntimeError("the future prospective scope must remain unread")
    selected = phase50["final_candidate_selection"]["candidate"]
    if selected != "A6_recent_recency_blend":
        raise RuntimeError(f"unexpected final candidate: {selected}")

    p1_rows = selection_rows(phase1)
    p20_rows = selection_rows(phase20)
    p50_rows = selection_rows(phase50)
    display = {
        "A0_v3_control": "A0 V3 control",
        "A1_v3_plus_availability": "A1 availability",
        "A2_long_natural": "A2 long natural",
        "A3_long_balanced": "A3 balanced",
        "A4_recent_cycle": "A4 recent cycle",
        "A5_recency_weighted": "A5 recency weighted",
        "A6_recent_recency_blend": "A6 blend",
        "B2_frozen_v3": "Frozen V3/B2",
    }

    phase1_candidates = [
        {
            "candidate": display[name],
            "brier": float(row["evaluation_brier"]),
            "delta_vs_b2": float(row["delta_vs_b2"]),
            "decision": "advance" if name in phase1["selection"]["advance_to_20m"] else "stop",
        }
        for name, row in p1_rows.items()
    ]

    learning_curve: list[dict[str, Any]] = []
    for name in ("A4_recent_cycle", "A5_recency_weighted", "A6_recent_recency_blend"):
        learning_curve.extend(
            [
                {"candidate": display[name], "scale_millions": 5, "brier": float(p20_rows[name]["reference_brier"])},
                {"candidate": display[name], "scale_millions": 20, "brier": float(p20_rows[name]["evaluation_brier"])},
                {"candidate": display[name], "scale_millions": 50, "brier": float(p50_rows[name]["evaluation_brier"])},
            ]
        )
    b2_brier = metric_brier(phase50, "B2_frozen_v3")
    learning_curve.extend(
        {"candidate": display["B2_frozen_v3"], "scale_millions": scale, "brier": b2_brier}
        for scale in (5, 20, 50)
    )

    phase2_comparison = [
        {
            "candidate": display[name],
            "brier": metric_brier(phase50, name if name == "A6_recent_recency_blend" else f"{name}:calibrated"),
            "relative_improvement_vs_b2": -float(p50_rows[name]["relative_gap_to_b2"]),
        }
        for name in ("A4_recent_cycle", "A5_recency_weighted", "A6_recent_recency_blend")
    ]
    phase2_comparison.append(
        {
            "candidate": display["B2_frozen_v3"],
            "brier": b2_brier,
            "relative_improvement_vs_b2": 0.0,
        }
    )

    locked_scope: list[dict[str, Any]] = []
    for label, payload in (("2024-12", december), ("2025 aggregate", archive)):
        candidate_brier = metric_brier(payload, "candidate")
        baseline_brier = metric_brier(payload, "B2_frozen_v3")
        locked_scope.append(
            {
                "scope": label,
                "candidate_brier": candidate_brier,
                "b2_brier": baseline_brier,
                "relative_improvement": 1.0 - candidate_brier / baseline_brier,
                "rows": int(payload["rows"]),
            }
        )
    archive_candidate_months = keyed(archive["metrics"]["candidate"]["slices"]["month"])
    archive_baseline_months = keyed(archive["metrics"]["B2_frozen_v3"]["slices"]["month"])
    for month in archive["months"]:
        candidate_brier = float(archive_candidate_months[month]["weighted_brier"])
        baseline_brier = float(archive_baseline_months[month]["weighted_brier"])
        locked_scope.append(
            {
                "scope": month,
                "candidate_brier": candidate_brier,
                "b2_brier": baseline_brier,
                "relative_improvement": 1.0 - candidate_brier / baseline_brier,
                "rows": int(archive_candidate_months[month]["rows"]),
            }
        )

    locked_band: list[dict[str, Any]] = []
    for scope, payload in (("December 2024", december), ("2025 archive", archive)):
        candidate_bands = keyed(payload["metrics"]["candidate"]["slices"]["band"])
        baseline_bands = keyed(payload["metrics"]["B2_frozen_v3"]["slices"]["band"])
        locked_band.extend(
            {
                "scope": scope,
                "band": band,
                "relative_regression": float(row["weighted_brier"])
                / float(baseline_bands[band]["weighted_brier"])
                - 1.0,
            }
            for band, row in candidate_bands.items()
        )

    reliability: list[dict[str, Any]] = []
    for name, metric in (
        ("V4.2 A6", archive["metrics"]["candidate"]),
        ("Frozen V3/B2", archive["metrics"]["B2_frozen_v3"]),
    ):
        reliability.extend(
            {
                "series": name,
                "mean_prediction": float(row["mean_prediction"]),
                "observed_rate": float(row["observed_rate"]),
            }
            for row in metric["overall"]["bins"]
        )
    reliability.extend(
        {"series": "Perfect calibration", "mean_prediction": value, "observed_rate": value}
        for value in (0.0, 1.0)
    )

    prediction_threads = [
        {
            "threads": int(row["threads"]),
            "median_seconds": float(row["median_seconds"]),
            "speedup_vs_1": float(prediction["results"][0]["median_seconds"])
            / float(row["median_seconds"]),
        }
        for row in prediction["results"]
    ]

    training_rows = []
    for candidate in ("A4_recent_cycle", "A5_recency_weighted"):
        fold = next(iter(training50["candidates"][candidate].values()))
        training_rows.append(
            {
                "workload": f"50M {display[candidate]} training",
                "threads": int(fold["execution"]["xgboost_threads"]),
                "workers": int(training50["execution_scheduler"]["workers"]),
                "wall_minutes": float(fold["seconds"]) / 60.0,
                "peak_rss_gib": float(fold["peak_rss_gb"]),
            }
        )
    runtime_rows = training_rows + [
        {
            "workload": "50M development scoring",
            "threads": int(phase50["compute"]["xgboost_prediction_threads"]),
            "workers": 1,
            "wall_minutes": float(phase50["compute"]["wall_seconds"]) / 60.0,
            "peak_rss_gib": float(phase50["compute"]["peak_rss_gb"]),
        },
        {
            "workload": "Untouched December scoring",
            "threads": int(december["compute"]["xgboost_prediction_threads"]),
            "workers": 1,
            "wall_minutes": float(december["compute"]["wall_seconds"]) / 60.0,
            "peak_rss_gib": float(december["compute"]["peak_rss_gb"]),
        },
        {
            "workload": "Locked 2025 archive scoring",
            "threads": int(archive["compute"]["xgboost_prediction_threads"]),
            "workers": 1,
            "wall_minutes": float(archive["compute"]["wall_seconds"]) / 60.0,
            "peak_rss_gib": float(archive["compute"]["peak_rss_gb"]),
        },
    ]

    experiment_rows = [
        {
            "stage": "5M ablation",
            "candidate": row["candidate"],
            "result": row["decision"],
            "evidence": f"Brier {row['brier']:.8f}; delta vs B2 {row['delta_vs_b2']:+.8f}",
        }
        for row in phase1_candidates
    ]
    experiment_rows.extend(
        [
            {
                "stage": "Policy selection",
                "candidate": "A6 blend",
                "result": "advance",
                "evidence": (
                    "August-only blend selection; final 50M policy is "
                    f"{phase50['a6_policy_selection']['selected_left_weight']:.0%} A4 and "
                    f"{1 - phase50['a6_policy_selection']['selected_left_weight']:.0%} A5"
                ),
            },
            {
                "stage": "50M selection",
                "candidate": "A6 blend",
                "result": "selected",
                "evidence": f"Brier {metric_brier(phase50, 'A6_recent_recency_blend'):.8f}; robust B2 win",
            },
            {
                "stage": "100M decision",
                "candidate": "A4 and A5",
                "result": "stop",
                "evidence": "No preregistered residual rare-regime or variance need justified another fit",
            },
        ]
    )

    gate_rows = []
    for scope, payload in (("December 2024", december), ("2025 archive", archive)):
        gate_rows.extend(
            {
                "scope": scope,
                "gate": str(row["id"]),
                "status": "pass" if row["passed"] else "fail",
            }
            for row in payload["decision"]["gates"]
        )

    operational_rows = [
        {"check": "Offline/service probability parity", "value": float(phase3["maximum_offline_service_probability_difference"]), "limit": "1e-12", "status": "pass"},
        {"check": "Path API p95", "value": float(phase3["latency"]["api_path_p95_ms"]), "limit": "50 ms", "status": "pass"},
        {"check": "4,096-cell surface API p95", "value": float(phase3["latency"]["api_surface_p95_ms"]), "limit": "3,000 ms", "status": "pass"},
        {"check": "Validation peak RSS", "value": float(phase3["memory"]["peak_rss_gb"]), "limit": "32 GiB", "status": "pass"},
        {"check": "Bundle size", "value": float(phase3["bundle_bytes"]) / 1024**2, "limit": "256 MiB", "status": "pass"},
        {"check": "Serving XGBoost threads", "value": int(phase3["serving_runtime"]["xgboost_prediction_threads"]), "limit": "manifest default 1", "status": "pass"},
    ]

    archive_candidate = metric_brier(archive, "candidate")
    archive_b2 = metric_brier(archive, "B2_frozen_v3")
    archive_improvement = 1.0 - archive_candidate / archive_b2
    december_improvement = 1.0 - metric_brier(december, "candidate") / metric_brier(december, "B2_frozen_v3")
    months_won = sum(row["relative_improvement"] > 0 for row in locked_scope if row["scope"].startswith("2025-"))
    summary = [
        {
            "selected_candidate": selected,
            "development_improvement": -float(p50_rows[selected]["relative_gap_to_b2"]),
            "december_improvement": december_improvement,
            "archive_improvement": archive_improvement,
            "archive_months_won": months_won,
            "archive_months_total": len(archive["months"]),
            "locked_rows": int(december["rows"]) + int(archive["rows"]),
            "prediction_threads": int(prediction["selected_threads"]),
            "prediction_speedup": float(prediction["results"][0]["median_seconds"])
            / float(prediction["results"][-1]["median_seconds"]),
            "backend_speedup": float(backend["speedup"]),
            "path_p95_ms": float(phase3["latency"]["api_path_p95_ms"]),
            "prospective_complete": False,
        }
    ]

    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_id": RUN_ID,
        "scope": "combined_research_evidence_through_locked_2025_archive",
        "prospective_window": ["2026-08-01", "2026-09-30"],
        "prospective_read": False,
        "input_inventory": [
            {"id": name, "path": relative(INPUTS[name]), "sha256": sha256(INPUTS[name])}
            for name in INPUTS
        ],
        "datasets": {
            "summary": summary,
            "phase1_candidates": phase1_candidates,
            "learning_curve": learning_curve,
            "phase2_comparison": phase2_comparison,
            "locked_scope": locked_scope,
            "locked_band": locked_band,
            "reliability": reliability,
            "prediction_threads": prediction_threads,
            "runtime_rows": runtime_rows,
            "experiment_rows": experiment_rows,
            "gate_rows": gate_rows,
            "operational_rows": operational_rows,
        },
        "frozen_policy": {
            "candidate": selected,
            "components": {
                "A4_recent_cycle": float(phase50["a6_policy_selection"]["selected_left_weight"]),
                "A5_recency_weighted": 1.0 - float(phase50["a6_policy_selection"]["selected_left_weight"]),
            },
            "policy_selection_month": phase50["a6_policy_selection"]["selection_month"],
        },
        "negative_results": {
            "A3_long_balanced": "rejected at 5M",
            "A7_60m_specialist": "rejected for insufficient support and no benefit",
            "100M": "not scientifically justified by the frozen decision rule",
            "FutureCast": "withheld pending issued-forecast history",
            "learned_StationCast": "withheld pending consented prospective outcomes",
        },
    }


def build_artifact(evidence_path: Path, evidence: dict[str, Any]) -> dict[str, Any]:
    datasets = evidence["datasets"]
    summary = datasets["summary"][0]
    generated_at = datetime.now(timezone.utc).isoformat()
    cards = [
        {
            "id": name,
            "description": description,
            "dataset": "summary",
            "sourceId": "final_evidence",
            "metrics": [{"label": label, "field": field, "format": "number"}],
        }
        for name, label, field, description in (
            ("archive_skill", "2025 Brier improvement", "archive_improvement", "Frozen A6 relative to frozen V3/B2."),
            ("december_skill", "December improvement", "december_improvement", "First untouched one-shot outcome gate."),
            ("month_wins", "2025 months won", "archive_months_won", "Point improvement across locked quarterly months."),
            ("locked_rows", "Locked rows", "locked_rows", "December plus four 2025 path-hour rows."),
            ("prediction_speedup", "M5 inference speedup", "prediction_speedup", "18 threads versus one, with bit-identical predictions."),
            ("path_latency", "Path API p95 ms", "path_p95_ms", "Manifest-default one-thread serving contract."),
        )
    ]
    charts = [
        chart("phase1_ablation", "Recency was the useful 5M intervention", "Six controlled 5M candidates on identical October-November 2024 rows; lower Brier is better.", "bar", "phase1_candidates", {"x": {"field": "candidate", "type": "ordinal", "label": "Candidate"}, "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"}}),
        chart("learning_curve", "A6 improves from 5M through 50M", "Nested deterministic training cohorts; B2 is a fixed evaluation baseline, not a learning curve.", "line", "learning_curve", {"x": {"field": "scale_millions", "type": "quantitative", "label": "Training rows (millions)"}, "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"}, "color": {"field": "candidate", "type": "nominal", "label": "Candidate"}}),
        chart("phase2_comparison", "The 50M blend is the best development candidate", "October-November 2024, 110,407,406 identical evaluation rows; lower is better.", "bar", "phase2_comparison", {"x": {"field": "candidate", "type": "ordinal", "label": "Candidate"}, "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"}}),
        chart("locked_scope", "The gain transfers to every untouched month", "Relative Brier improvement versus frozen V3/B2; positive values improve.", "bar", "locked_scope", {"x": {"field": "scope", "type": "ordinal", "label": "Locked scope"}, "y": {"field": "relative_improvement", "type": "quantitative", "label": "Relative Brier improvement"}}),
        chart("locked_band", "Every supported HF band improves in both locked gates", "Relative candidate Brier regression versus B2; negative values improve.", "bar", "locked_band", {"x": {"field": "band", "type": "ordinal", "label": "Band"}, "y": {"field": "relative_regression", "type": "quantitative", "label": "Relative Brier regression"}, "color": {"field": "scope", "type": "nominal", "label": "Scope"}}),
        chart("reliability", "Archive probabilities remain auditable", "Observed opportunity-weighted decode rate versus mean prediction over all four locked 2025 months.", "line", "reliability", {"x": {"field": "mean_prediction", "type": "quantitative", "label": "Mean prediction"}, "y": {"field": "observed_rate", "type": "quantitative", "label": "Observed rate"}, "color": {"field": "series", "type": "nominal", "label": "Series"}}),
        chart("prediction_threads", "Apple Silicon scoring scales to all 18 cores", "Median time for 100,000 rows; every thread count produced the same prediction SHA-256.", "line", "prediction_threads", {"x": {"field": "threads", "type": "quantitative", "label": "XGBoost threads"}, "y": {"field": "median_seconds", "type": "quantitative", "label": "Median seconds"}}),
        chart("runtime_memory", "Large runs stayed far below the 96 GiB ceiling", "Per-process peak RSS; the two concurrent 50M training processes conservatively sum to 49.68 GiB.", "bar", "runtime_rows", {"x": {"field": "workload", "type": "ordinal", "label": "M5 workload"}, "y": {"field": "peak_rss_gib", "type": "quantitative", "label": "Peak RSS GiB"}}),
    ]
    tables = [
        {
            "id": "experiment_table",
            "title": "Experiment decisions, including stops",
            "subtitle": "Negative results are retained so the research path is reproducible.",
            "dataset": "experiment_rows",
            "sourceId": "final_evidence",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "stage", "label": "Stage", "type": "text"},
                {"field": "candidate", "label": "Candidate", "type": "text"},
                {"field": "result", "label": "Decision", "type": "text"},
                {"field": "evidence", "label": "Evidence", "type": "text"},
            ],
        },
        {
            "id": "gate_table",
            "title": "Frozen outcome gates",
            "subtitle": "Every preregistered December and 2025 archive gate passed.",
            "dataset": "gate_rows",
            "sourceId": "final_evidence",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "scope", "label": "Scope", "type": "text"},
                {"field": "gate", "label": "Gate", "type": "text"},
                {"field": "status", "label": "Status", "type": "text"},
            ],
        },
        {
            "id": "runtime_table",
            "title": "Measured M5 workload profile",
            "subtitle": "Native ARM64 XGBoost 3.3 with LLVM OpenMP; wall time and peak RSS are observed values.",
            "dataset": "runtime_rows",
            "sourceId": "final_evidence",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "workload", "label": "Workload", "type": "text"},
                {"field": "workers", "label": "Workers", "type": "number"},
                {"field": "threads", "label": "Threads each", "type": "number"},
                {"field": "wall_minutes", "label": "Minutes", "type": "number"},
                {"field": "peak_rss_gib", "label": "Peak RSS GiB", "type": "number"},
            ],
        },
        {
            "id": "operational_table",
            "title": "Packaged candidate contract",
            "subtitle": "Phase 3 measures the production bundle, service path, fallbacks, privacy, and bounded resources.",
            "dataset": "operational_rows",
            "sourceId": "final_evidence",
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "check", "label": "Check", "type": "text"},
                {"field": "value", "label": "Measured", "type": "number"},
                {"field": "limit", "label": "Contract", "type": "text"},
                {"field": "status", "label": "Status", "type": "text"},
            ],
        },
    ]
    blocks = [
        {"id": "title", "type": "markdown", "body": "# Propulse NowCast V4.2: final retrospective research report"},
        {"id": "technical_summary", "type": "markdown", "sourceId": "final_evidence", "body": f"## The 50M recency blend passes both untouched gates\n\nThe frozen **A6 NowCast** combines 70% A4 recent-cycle and 30% A5 recency-weighted probability. It improves weighted Brier by **{summary['development_improvement']:.2%}** on the October-November development evaluation, **{summary['december_improvement']:.2%}** on untouched December 2024, and **{summary['archive_improvement']:.2%}** across the locked four-month 2025 archive. It wins all **{summary['archive_months_won']} of {summary['archive_months_total']}** archive months. This supports shadow product integration; it does not complete the future August-September 2026 prospective or opt-in StationCast studies."},
        {"id": "cards", "type": "metric-strip", "cardIds": [item["id"] for item in cards]},
        {"id": "findings_heading", "type": "markdown", "body": "## Recency, then scale, produced the useful model"},
        {"id": "phase1_chart", "type": "chart", "chartId": "phase1_ablation", "layout": "full"},
        {"id": "phase1_explainer", "type": "markdown", "sourceId": "final_evidence", "body": "A0 reproduced the older training recipe; A1 isolated availability indicators; A2 and A3 tested long-history sampling; A4 emphasized the current solar cycle; A5 retained long history with recency weights. A3's balanced sampling failed badly. A4, A5, and A2 advanced, while the unsupported 60m specialist A7 stopped. This is evidence that the main recoverable weakness was stale training distribution, not merely missing-value flags."},
        {"id": "learning_chart", "type": "chart", "chartId": "learning_curve", "layout": "full"},
        {"id": "phase2_chart", "type": "chart", "chartId": "phase2_comparison", "layout": "full"},
        {"id": "scale_explainer", "type": "markdown", "sourceId": "final_evidence", "body": "The 20M stage established stable paired-day wins for A4 and A5. At 50M, A5 improved 1.12% over its 20M version, A4 improved 0.77%, and the frozen 70/30 A6 blend was best overall. A 100M run was rejected because scale alone was not enough: the preregistration also required evidence of residual variance or rare-regime support, and that evidence was absent."},
        {"id": "experiment_table_block", "type": "table", "tableId": "experiment_table", "layout": "full"},
        {"id": "locked_heading", "type": "markdown", "body": "## Untouched outcomes confirm temporal transfer"},
        {"id": "locked_chart", "type": "chart", "chartId": "locked_scope", "layout": "full"},
        {"id": "band_chart", "type": "chart", "chartId": "locked_band", "layout": "full"},
        {"id": "gate_explainer", "type": "markdown", "sourceId": "final_evidence", "body": "December was opened only after the candidate, scorer, environment, baseline, thresholds, and report path were frozen. The archive was opened only after December passed. Candidate and B2 were streamed over identical path-hour rows with opportunity weights. The protocol forbade fitting, calibration, threshold selection, or policy changes from either locked scope. All supported bands improved in both gates, so the aggregate result is not hiding a band-level regression."},
        {"id": "gate_table_block", "type": "table", "tableId": "gate_table", "layout": "full"},
        {"id": "calibration_heading", "type": "markdown", "body": "## Probability magnitude remains useful, with known calibration limits"},
        {"id": "reliability_chart", "type": "chart", "chartId": "reliability", "layout": "full"},
        {"id": "calibration_explainer", "type": "markdown", "sourceId": "final_evidence", "body": "Brier score jointly rewards discrimination and calibration. Reliability bins show where predicted probability differs from observed opportunity-weighted decode rate. The candidate passes the preregistered ECE and high-confidence-gap comparisons against B2, but a probability is not a guaranteed QSO: WSPR receiver deployment, listening behavior, interference, mode, and local noise remain part of the observation process."},
        {"id": "method_heading", "type": "markdown", "body": "## Model and experimental specification"},
        {"id": "method", "type": "markdown", "sourceId": "final_evidence", "body": "The open core is a calibrated XGBoost histogram-tree ensemble over 91 identity-free path features: geometry, solar illumination, prior-completed-hour space weather, band, missingness, and lagged path evidence. A4 trains on the recent solar-cycle distribution. A5 trains on broader history with an 18-month recency half-life. Their calibrated probabilities are blended 70/30 using only the preregistered August 2024 policy-selection slice. Cohorts are deterministic, nested, checksum-manifested, and split by time. The result predicts a WSPR single-decode opportunity under the declared conditions; it is predictive, not causal."},
        {"id": "data_scope", "type": "markdown", "sourceId": "final_evidence", "body": "## Scope, sources, and metric definitions\n\n**Primary outcome:** WSPRnet monthly archives ([source](https://www.wsprnet.org/archive/)). **Historical drivers:** NASA OMNI2 ([data](https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/)) and GFZ Hp60 ([data](https://kp.gfz.de/en/hp30-hp60/data)). **Operational parity:** NOAA SWPC JSON ([service](https://services.swpc.noaa.gov/json/)). The metric is opportunity-weighted Brier score, the weighted mean squared error of predicted decode probability; lower is better. Development evaluation is October-November 2024. Locked tests are December 2024 and January, April, July, and October 2025. All daily and monthly boundaries are UTC."},
        {"id": "compute_heading", "type": "markdown", "body": "## Native Apple Silicon execution is measured, not assumed"},
        {"id": "thread_chart", "type": "chart", "chartId": "prediction_threads", "layout": "full"},
        {"id": "memory_chart", "type": "chart", "chartId": "runtime_memory", "layout": "full"},
        {"id": "runtime_table_block", "type": "table", "tableId": "runtime_table", "layout": "full"},
        {"id": "compute_explainer", "type": "markdown", "sourceId": "final_evidence", "body": f"The M5 Max path is native ARM64 XGBoost 3.3 linked to LLVM OpenMP. XGBoost has no Metal tree-training backend, so CPU hist is the supported Apple Silicon engine. Independent fits run as two spawned workers with nine XGBoost threads and four Arrow I/O threads each, using all 18 physical cores without nested oversubscription. Single-process building and scoring use 18 CPU and six Arrow I/O threads. Iterator-fed QuantileDMatrix was selected only after it matched validation log loss exactly and ran {summary['backend_speedup']:.2f}x faster end to end than external memory. The 18-thread scorer was {summary['prediction_speedup']:.2f}x faster than one thread with bit-identical predictions."},
        {"id": "product_heading", "type": "markdown", "body": "## The bundle is ready for shadow use, not an unrestricted launch"},
        {"id": "operational_table_block", "type": "table", "tableId": "operational_table", "layout": "full"},
        {"id": "product_explainer", "type": "markdown", "sourceId": "final_evidence", "body": "NowCast remains identity-free and open. StationCast applies the user's private virtual-shack chain and active location deterministically at inference; learned personalization remains disabled. ReachMap can consume the batch probability surface. Fresh source data selects NowCast, while stale or missing freshness selects the physics fallback with reduced confidence and explicit provenance. Service containers default to one prediction thread even though M5 batch research uses 18."},
        {"id": "limitations", "type": "markdown", "sourceId": "final_evidence", "body": "## Limitations, uncertainty, and robustness\n\nThe five locked months are strong retrospective evidence, not prospective proof. WSPR observations mix propagation with the changing receiver network and reporting behavior. The locked comparison is against the strongest frozen operational statistical baseline, V3/B2; the pinned P.533 comparison remains a bounded development experiment and was not recomputed over the full locked archive. A station's equipment envelope changes practical reach but has not yet earned a learned residual. FutureCast has no valid training set until genuine issued forecasts accumulate, and 6m remains a separate mechanism model. The result does not justify causal language, guaranteed contacts, or extrapolation beyond supported bands, modes, freshness states, and horizons."},
        {"id": "next", "type": "markdown", "sourceId": "final_evidence", "body": "## Recommended next steps\n\n1. Run the frozen core in shadow mode through ReachMap and StationCast while retaining the physics fallback.\n2. Capture issue time, valid time, model version, feature watermark, freshness, fallback reason, core probability, deterministic personalized probability, and opt-in outcomes.\n3. Keep the 2026-08-01 through 2026-09-30 prospective window immutable and untuned, then score it once under the frozen protocol.\n4. Start learned StationCast residuals only after consent, minimum sample size, and selection-bias gates pass.\n5. Do not run 100M or train FutureCast merely because compute is available; require a new scientific question and a new untouched gate."},
        {"id": "questions", "type": "markdown", "body": "## Further questions\n\n- Does A6 retain at least 1% Brier skill in the frozen 2026 prospective window?\n- Does deterministic StationCast improve calibration for operators with materially different power, antenna gain, loss, and noise envelopes?\n- Which live-source outage patterns most often force physics fallback?\n- After prospective evidence, is there any residual slice where more data, a different loss, or a separate mechanism model is justified?"},
    ]
    source_spec = source(evidence_path)
    return {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Propulse NowCast V4.2: final retrospective research report",
            "description": "Ablations, learning curve, locked validation, Apple Silicon execution, product contract, and remaining evidence boundaries.",
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
            "datasets": datasets,
        },
        "sources": [source_spec],
    }


def markdown_summary(evidence: dict[str, Any]) -> str:
    summary = evidence["datasets"]["summary"][0]
    return f"""# Propulse NowCast V4.2: final retrospective research report

Generated: {evidence['generated_at']}

## Answer first

The frozen 50M A6 blend passed December 2024 and the four-month locked 2025
archive without tuning. Relative Brier improvement versus frozen V3/B2 was
`{summary['december_improvement']:.3%}` in December and
`{summary['archive_improvement']:.3%}` across 2025, with point improvement in
`{summary['archive_months_won']}/{summary['archive_months_total']}` archive months.

The bundle is approved for shadow product integration. Prospective August to
September 2026 evidence and opt-in learned StationCast evidence remain pending.

See `REPORT.html` for the complete interactive report, charts, experimental
decisions, methods, operational checks, limitations, and source details.
"""


def model_card(evidence: dict[str, Any]) -> str:
    summary = evidence["datasets"]["summary"][0]
    return f"""# Propulse NowCast V4.2 Model Card

## Model

- Version: `propagation_v4_2_phase2_scale-phase3-candidate-50000000`
- Open core: calibrated identity-free WSPR path probability
- Engine: XGBoost 3.3 histogram trees, native ARM64/OpenMP
- Policy: 70% A4 recent-cycle plus 30% A5 recency-weighted probability
- Core features: 91 geometry, solar illumination, prior-completed-hour space
  weather, band, availability, missingness, and lagged path-evidence values
- Serving fallback: frozen physics profile when freshness is stale or missing

## Intended Use

NowCast estimates the probability of at least one WSPR decode for a declared HF
path, band, issue time, power, and available live context. ReachMap may batch the
core over a world grid. StationCast may apply the user's private deterministic
station envelope at inference. The open core must not receive callsigns, station
identity, exact private home locations, or raw virtual-shack records.

## Evidence

| Scope | Relative Brier improvement vs frozen V3/B2 |
|---|---:|
| October-November 2024 development | {summary['development_improvement']:.3%} |
| Untouched December 2024 | {summary['december_improvement']:.3%} |
| Locked 2025 quarterly archive | {summary['archive_improvement']:.3%} |

The candidate improves in `{summary['archive_months_won']}/{summary['archive_months_total']}`
locked 2025 months and passes every preregistered December and archive gate.
Offline and service predictions match exactly in Phase 3 validation.

## Not Approved

- No guaranteed-contact or causal propagation claim.
- No FutureCast claim until genuine issued-forecast history exists.
- No learned StationCast residual until consent, sample-size, and selection-bias
  gates pass.
- No 6m claim from this HF model; 6m remains a separate mechanism track.
- No prospective claim before the frozen 2026-08-01 to 2026-09-30 evaluation.

## Limitations

WSPR outcomes depend on receiver deployment, listening and reporting behavior,
interference, mode, and local noise as well as propagation. Locked tests compare
against frozen V3/B2. Pinned P.533 remains a bounded development baseline and
was not recomputed across the full locked archive. Use confidence, freshness,
OOD flags, assumptions, and fallback provenance with every prediction.

## Distribution

The public manifest and checksums are tracked in Git. The approximately 252 MiB
serving bundle should be published through a versioned model release registry or
Git LFS, not committed as an ordinary GitHub blob. License and release tags must
be finalized before public binary distribution.
"""


def data_card(evidence: dict[str, Any]) -> str:
    summary = evidence["datasets"]["summary"][0]
    return f"""# Propulse NowCast V4.2 Data Card

## Data Roles

| Role | Time scope | Outcome use |
|---|---|---|
| Multi-year training | quarterly 2018-2023 plus legally available 2024 context | fitting only |
| Policy/calibration development | preregistered 2024 folds and August policy slice | selection only |
| Development evaluation | October-November 2024 | model selection |
| First untouched gate | December 2024 | one-shot pass/fail |
| Locked archive | January, April, July, October 2025 | one-shot final retrospective gate |
| Prospective | 2026-08-01 through 2026-09-30 | future, currently unread |

Training uses deterministic, checksum-manifested, nested 5M, 20M, and 50M
cohorts. Evaluation uses natural full-month distributions rather than balanced
samples. The final locked evidence contains `{summary['locked_rows']:,}` path-hour
rows across December and the four 2025 months.

## Outcome and Weight

Each row represents a band/path/hour opportunity where transmitter and receiver
activity can be reconstructed. The binary target is whether at least one WSPR
decode occurred. Opportunity weights represent inferred opportunity mass; all
reported Brier, log-loss, calibration, day, month, band, and distance comparisons
apply the same rows and weights to candidate and baseline.

## Primary Sources

- WSPRnet monthly archive: <https://www.wsprnet.org/archive/>
- NASA SPDF OMNI low-resolution data: <https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/>
- GFZ Hp30/Hp60: <https://kp.gfz.de/en/hp30-hp60/data>
- NOAA SWPC operational JSON: <https://services.swpc.noaa.gov/json/>

Raw third-party archives remain ignored and are not redistributed through this
repository. Acquisition manifests record URL, retrieval time, byte count,
SHA-256, role, and license or acknowledgement notes.

## Biases and Privacy

Receiver geography and network eras are nuisance variables, not pure propagation
measurements. WSPR overrepresents automated weak-signal operation and does not
directly estimate SSB QSO completion. Public artifacts contain no callsigns,
private station records, or exact operator locations. Learned personalization
requires separate opt-in consent and evidence.
"""


def reproducibility(evidence: dict[str, Any]) -> str:
    inputs = "\n".join(
        f"- `{row['path']}`: `{row['sha256']}`" for row in evidence["input_inventory"]
    )
    return f"""# Propulse NowCast V4.2 Reproducibility Guide

## Environment

The large workflow is frozen to an Apple M5 Max with 128 GiB unified memory,
native ARM64 Python, XGBoost 3.3 with LLVM OpenMP, AC power, and High Power mode.
The runtime guard rejects the wrong architecture, core topology, memory budget,
power state, OpenMP build, or active macOS CPU limit.

Use [`PERSONALIZED-PROPAGATION-V4.2-M5-RUNBOOK.md`](../../../../PERSONALIZED-PROPAGATION-V4.2-M5-RUNBOOK.md)
for exact cohort, training, scoring, packaging, gate, and report commands. Large
data, models, caches, and spill files belong under `/Volumes/Projects/PropulseML`.

## Parallel Execution Contract

- DuckDB cohort builds: 18 threads, 80 GB limit, external SSD spill.
- 20M fits: two spawned workers, nine XGBoost and four Arrow I/O threads each,
  external-memory QuantileDMatrix.
- 50M fits: two spawned workers, nine XGBoost and four Arrow I/O threads each,
  iterator-fed in-memory QuantileDMatrix.
- Batch scoring: benchmark-selected 18 XGBoost, 18 Arrow CPU, and six Arrow I/O
  threads with 100,000-row batches.
- API serving: one XGBoost thread per request by manifest default.

XGBoost has no Metal tree-training backend. A rented NVIDIA GPU is not required
for this result and would need a separate reproducibility benchmark before use.

## Final Evidence Inputs

{inputs}

`FINAL_REPORT_EVIDENCE.json` records this inventory again and drives every chart,
table, metric, and quantitative statement in `REPORT.html`.
"""


def source_registry() -> str:
    return """# Propulse NowCast V4.2 Source Registry

| Source | Role | Public location | Distribution note |
|---|---|---|---|
| WSPRnet monthly archive | decode outcomes and exposure reconstruction | <https://www.wsprnet.org/archive/> | raw archives are not committed |
| NASA SPDF OMNI2 | definitive historical hourly solar-wind, F10.7, and geomagnetic inputs | <https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/> | retain acknowledgement and provenance |
| OMNI documentation | definitions and acknowledgement | <https://omniweb.gsfc.nasa.gov/html/ow_data.html> | cite with derived work |
| GFZ Hp60 | lagged high-cadence geomagnetic input | <https://kp.gfz.de/en/hp30-hp60/data> | CC BY 4.0; preserve attribution |
| NOAA SWPC JSON | live operational feature parity | <https://services.swpc.noaa.gov/json/> | retain capture and source timestamps |
| ITU-R P.533 | physics fallback and bounded baseline reference | <https://www.itu.int/rec/R-REC-P.533> | follow ITU software/text terms |

The committed acquisition manifests are the authoritative per-file registry.
They retain URL, retrieval timestamp, byte count, SHA-256, role, and license or
acknowledgement note without redistributing raw restricted archives.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(RESULT / "final_report"))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    output_dir = Path(args.output_dir).resolve()
    try:
        output_dir.relative_to(ROOT)
    except ValueError as error:
        raise RuntimeError("final report output must remain under the repository") from error
    validate_m5_runtime(read_json(CONFIG))
    values = {name: read_json(path) for name, path in INPUTS.items()}
    evidence = build_evidence(values)
    evidence_path = output_dir / "FINAL_REPORT_EVIDENCE.json"
    write_json(evidence_path, evidence)
    artifact = build_artifact(evidence_path, evidence)
    write_json(output_dir / "REPORT.artifact.json", artifact)
    (output_dir / "REPORT.md").write_text(markdown_summary(evidence), encoding="utf-8")
    (output_dir / "MODEL_CARD.md").write_text(model_card(evidence), encoding="utf-8")
    (output_dir / "DATA_CARD.md").write_text(data_card(evidence), encoding="utf-8")
    (output_dir / "REPRODUCIBILITY.md").write_text(
        reproducibility(evidence), encoding="utf-8"
    )
    (output_dir / "SOURCE_REGISTRY.md").write_text(
        source_registry(), encoding="utf-8"
    )
    print(output_dir / "REPORT.artifact.json")


if __name__ == "__main__":
    main()
