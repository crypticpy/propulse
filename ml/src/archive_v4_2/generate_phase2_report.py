#!/usr/bin/env python3
"""Generate the canonical V4.2 scale-gate technical report."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE))

from phase2_core import validate_config  # noqa: E402
from train_phase2_scale import validate_m5_runtime  # noqa: E402
import run_paths  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
PHASE1 = ROOT / "ml/results/propagation_v4_2/propagation_v4_2_phase1_5m"


LABELS = {
    "A2_long_natural": "A2 long natural",
    "A4_recent_cycle": "A4 recent cycle",
    "A5_recency_weighted": "A5 recency weighted",
    "A6_recent_recency_blend": "A6 A4/A5 blend",
    "B2_frozen_v3": "Frozen V3/B2",
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


def union_source(
    source_id: str, label: str, paths: list[Path]
) -> dict[str, Any]:
    locations = [relative(path) for path in paths]
    quoted = ",".join(f"'{value}'" for value in locations)
    return {
        "id": source_id,
        "label": label,
        "path": locations[0],
        "query": {
            "engine": "duckdb",
            "language": "sql",
            "description": "Load the reviewed JSON artifacts with schema union.",
            "sql": (
                f"SELECT * FROM read_json_auto([{quoted}], union_by_name=true)"
            ),
            "tables_used": locations,
        },
    }


def chart(
    chart_id: str,
    title: str,
    subtitle: str,
    chart_type: str,
    dataset: str,
    encodings: dict[str, Any],
    source_id: str,
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
    source_id: str,
) -> dict[str, Any]:
    return {
        "id": card_id,
        "description": description,
        "dataset": "summary",
        "sourceId": source_id,
        "metrics": [{"label": label, "field": field, "format": "number"}],
    }


def feature_gain_encodings() -> dict[str, dict[str, str]]:
    return {
        "x": {"field": "feature", "type": "ordinal", "label": "Feature"},
        "y": {
            "field": "weighted_gain",
            "type": "quantitative",
            "label": "Weighted split gain",
        },
    }


def ensure_open_scope(value: dict[str, Any], label: str) -> None:
    if value.get("december_2024_read") or value.get("locked_2025_read"):
        raise RuntimeError(f"{label} reports access to a closed outcome")


def variant(name: str) -> str:
    return name if name.startswith("A6") else f"{name}:calibrated"


def selection_by_name(evaluation: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(row["candidate"]): row
        for row in evaluation["selection"]["rows"]
    }


def metric(evaluation: dict[str, Any], name: str) -> dict[str, Any]:
    return evaluation["metrics"][variant(name)]


def slice_lookup(
    evaluation: dict[str, Any], name: str, dimension: str
) -> dict[str, dict[str, Any]]:
    return {
        str(row["key"]): row
        for row in evaluation["metrics"][variant(name)]["slices"][dimension]
    }


def phase1_learning_rows(
    phase1_evaluation: dict[str, Any], phase1_conditional: dict[str, Any]
) -> list[dict[str, Any]]:
    rows = []
    for row in phase1_evaluation["selection"]["rows"]:
        name = str(row["candidate"])
        if name not in {"A2_long_natural", "A4_recent_cycle", "A5_recency_weighted"}:
            continue
        rows.append(
            {
                "candidate": LABELS[name],
                "candidate_id": name,
                "scale_million": 5,
                "brier": float(row["evaluation_brier"]),
            }
        )
    if "A6_recent_recency_blend" in phase1_conditional["metrics"]:
        rows.append(
            {
                "candidate": LABELS["A6_recent_recency_blend"],
                "candidate_id": "A6_recent_recency_blend",
                "scale_million": 5,
                "brier": float(
                    phase1_conditional["metrics"]["A6_recent_recency_blend"][
                        "overall"
                    ]["weighted_brier"]
                ),
            }
        )
    reference = next(
        row
        for row in phase1_evaluation["selection"]["rows"]
        if row["candidate"] == "A4_recent_cycle"
    )
    rows.append(
        {
            "candidate": LABELS["B2_frozen_v3"],
            "candidate_id": "B2_frozen_v3",
            "scale_million": 5,
            "brier": float(reference["evaluation_brier"] - reference["delta_vs_b2"]),
        }
    )
    return rows


def scale_learning_rows(evaluation: dict[str, Any]) -> list[dict[str, Any]]:
    scale = int(evaluation["scale"]) // 1_000_000
    rows = [
        {
            "candidate": LABELS.get(str(row["candidate"]), str(row["candidate"])),
            "candidate_id": str(row["candidate"]),
            "scale_million": scale,
            "brier": float(row["evaluation_brier"]),
        }
        for row in evaluation["selection"]["rows"]
    ]
    reference = evaluation["selection"]["rows"][0]
    rows.append(
        {
            "candidate": LABELS["B2_frozen_v3"],
            "candidate_id": "B2_frozen_v3",
            "scale_million": scale,
            "brier": float(reference["b2_brier"]),
        }
    )
    return rows


def candidate_decision_rows(
    evaluation: dict[str, Any], selected: str | None
) -> list[dict[str, Any]]:
    scale = int(evaluation["scale"]) // 1_000_000
    advanced = set(evaluation["selection"].get("advance_to_50m", []))
    rows = []
    for row in evaluation["selection"]["rows"]:
        name = str(row["candidate"])
        if selected == name:
            decision = "selected for Phase 3"
        elif scale == 20 and name in advanced:
            decision = "advanced to 50M"
        elif scale == 50:
            decision = "not selected"
        else:
            decision = "did not advance"
        rows.append(
            {
                "candidate": LABELS.get(name, name),
                "candidate_id": name,
                "scale_million": scale,
                "brier": float(row["evaluation_brier"]),
                "delta_vs_b2": float(row["delta_vs_b2"]),
                "relative_improvement_vs_reference": float(
                    row["relative_improvement_vs_reference"]
                ),
                "october_vs_b2": float(row["month_deltas_vs_b2"]["2024-10"]),
                "november_vs_b2": float(row["month_deltas_vs_b2"]["2024-11"]),
                "upper_95_vs_b2": float(row["bootstrap_upper_vs_b2"]),
                "upper_95_vs_reference": float(
                    row["bootstrap_upper_vs_reference"]
                ),
                "decision": decision,
            }
        )
    return rows


def training_rows(
    scale: int,
    training: dict[str, Any],
    fallback_threads: int,
) -> list[dict[str, Any]]:
    rows = []
    for name, folds in training["candidates"].items():
        for fold, info in folds.items():
            execution = info.get("execution")
            xgboost_threads = (
                int(execution["xgboost_threads"])
                if execution is not None
                else fallback_threads
            )
            rows.append(
                {
                    "candidate": LABELS.get(name, name),
                    "candidate_id": name,
                    "series": f"{LABELS.get(name, name)} {scale // 1_000_000}M",
                    "scale_million": scale // 1_000_000,
                    "fold": fold,
                    "early_stopping_month": str(info["early_stopping_month"]),
                    "best_iteration": int(info["best_iteration"]),
                    "best_logloss": float(info["best_score"]),
                    "training_hours": float(info["seconds"]) / 3600,
                    "peak_rss_gb": float(info["peak_rss_gb"]),
                    "backend": str(info["training_mode"]),
                    "xgboost_threads": xgboost_threads,
                    "thread_evidence": (
                        "per-fold execution telemetry"
                        if execution is not None
                        else "frozen default training contract"
                    ),
                }
            )
    return rows


def combined_feature_rows(
    training: dict[str, Any], evaluation: dict[str, Any], focus: str
) -> list[dict[str, Any]]:
    final_fold = "F3_2024_07"
    weights = [(focus, 1.0)]
    if focus == "A6_recent_recency_blend":
        policy = evaluation["a6_policy_selection"]
        left_weight = float(policy["selected_left_weight"])
        weights = [
            (str(policy["left"]), left_weight),
            (str(policy["right"]), 1 - left_weight),
        ]
    gains: dict[str, float] = {}
    for name, weight in weights:
        for row in training["candidates"][name][final_fold][
            "feature_importance_gain"
        ]:
            feature = str(row["feature"])
            gains[feature] = gains.get(feature, 0.0) + weight * float(row["gain"])
    return [
        {"feature": name, "weighted_gain": gain}
        for name, gain in sorted(gains.items(), key=lambda item: item[1], reverse=True)[
            :15
        ]
    ]


def cohort_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    manifest = read_json(path)
    rows = []
    for candidate, folds in manifest["cohorts"].items():
        for fold, item in folds.items():
            rows.append(
                {
                    "scale_million": int(manifest["scale"]) // 1_000_000,
                    "candidate": LABELS.get(candidate, candidate),
                    "fold": fold,
                    "rows": int(item["rows"]),
                    "bytes_gb": int(item["bytes"]) / 1024**3,
                    "sha256": str(item["sha256"]),
                }
            )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--evaluation-20m")
    parser.add_argument("--evaluation-50m")
    args = parser.parse_args()
    del args.profile

    config = read_json(Path(args.config).resolve())
    validate_config(config)
    validate_m5_runtime(config)
    run_id = str(config["run_id"])
    result = run_paths.results_dir(config)
    backend_decision_path = result / "backend_benchmark_decision.json"
    backend_external_path = result / "backend_benchmark_external_memory_quantile.json"
    backend_quantile_path = result / "backend_benchmark_streamed_in_memory_quantile.json"
    prediction_benchmark_path = run_paths.prediction_thread_benchmark_path(config)
    phase1_evaluation = read_json(PHASE1 / "evaluation_results.json")
    phase1_conditional = read_json(PHASE1 / "conditional_results.json")
    evaluation_20_path = Path(
        args.evaluation_20m or run_paths.evaluation_results_path(config, 20_000_000)
    ).resolve()
    evaluation_50_path = Path(
        args.evaluation_50m or run_paths.evaluation_results_path(config, 50_000_000)
    ).resolve()
    evaluation_20 = read_json(evaluation_20_path)
    evaluation_50 = read_json(evaluation_50_path) if evaluation_50_path.exists() else None
    training_20_path = run_paths.training_results_path(config, 20_000_000)
    training_50_path = run_paths.training_results_path(config, 50_000_000)
    training_20 = read_json(training_20_path)
    training_50 = read_json(training_50_path) if training_50_path.exists() else None
    scope_values = [
        ("20M evaluation", evaluation_20),
        ("20M training", training_20),
    ]
    if evaluation_50 is not None:
        scope_values.append(("50M evaluation", evaluation_50))
    if training_50 is not None:
        scope_values.append(("50M training", training_50))
    for label, value in scope_values:
        ensure_open_scope(value, label)

    latest = evaluation_50 or evaluation_20
    latest_training = training_50 or training_20
    latest_scale = int(latest["scale"]) // 1_000_000
    final_selection = latest.get("final_candidate_selection")
    selected = str(final_selection["candidate"]) if final_selection else None
    if evaluation_50 is not None and selected is not None:
        decision = (
            f"Select **{LABELS.get(selected, selected)}** for the frozen Phase 3 "
            f"serving candidate using `{final_selection['basis']}`. December remains closed."
        )
    elif evaluation_50 is not None:
        decision = (
            "No 50M candidate satisfied the frozen B2 or learning fallback rule. "
            "Stop before Phase 3 and do not open December."
        )
    elif evaluation_20["selection"]["advance_to_50m"]:
        names = ", ".join(
            f"**{LABELS.get(name, name)}**"
            for name in evaluation_20["selection"]["advance_to_50m"]
        )
        decision = (
            f"Advance {names} to 50M. This is an interim scale decision; "
            "December remains closed."
        )
    else:
        decision = (
            "No 20M component satisfied the frozen 50M advancement rules. Stop scaling "
            "and keep December closed."
        )

    latest_rows = selection_by_name(latest)
    focus = selected or min(
        latest_rows, key=lambda name: float(latest_rows[name]["evaluation_brier"])
    )
    focus_row = latest_rows[focus]
    focus_metric = metric(latest, focus)
    b2_metric = latest["metrics"]["B2_frozen_v3"]
    learning = phase1_learning_rows(phase1_evaluation, phase1_conditional)
    learning.extend(scale_learning_rows(evaluation_20))
    if evaluation_50 is not None:
        learning.extend(scale_learning_rows(evaluation_50))
    decision_rows = candidate_decision_rows(evaluation_20, None)
    if evaluation_50 is not None:
        decision_rows.extend(candidate_decision_rows(evaluation_50, selected))
    month_rows = [
        {
            "month": month,
            "candidate": LABELS.get(focus, focus),
            "delta_vs_b2": float(focus_row["month_deltas_vs_b2"][month]),
        }
        for month in latest["evaluation_months"]
    ]
    band_focus = slice_lookup(latest, focus, "band")
    band_b2 = {
        str(row["key"]): row
        for row in b2_metric["slices"]["band"]
    }
    band_rows = [
        {
            "band": key,
            "delta_vs_b2": float(value["weighted_brier"])
            - float(band_b2[key]["weighted_brier"]),
            "opportunities": float(value["opportunities"]),
        }
        for key, value in band_focus.items()
    ]
    distance_focus = slice_lookup(latest, focus, "distance")
    distance_b2 = {
        str(row["key"]): row
        for row in b2_metric["slices"]["distance"]
    }
    distance_rows = [
        {
            "distance": key,
            "delta_vs_b2": float(value["weighted_brier"])
            - float(distance_b2[key]["weighted_brier"]),
            "opportunities": float(value["opportunities"]),
        }
        for key, value in distance_focus.items()
    ]
    reliability_rows = [
        {
            "series": LABELS.get(focus, focus),
            "mean_prediction": float(row["mean_prediction"]),
            "observed_rate": float(row["observed_rate"]),
            "opportunities": float(row["opportunities"]),
        }
        for row in focus_metric["overall"]["bins"]
    ]
    reliability_rows.extend(
        [
            {
                "series": "Perfect calibration",
                "mean_prediction": value,
                "observed_rate": value,
                "opportunities": 0,
            }
            for value in (0.0, 1.0)
        ]
    )
    fallback_training_threads = int(config["training"]["parameters"]["nthread"])
    all_training_rows = training_rows(
        20_000_000, training_20, fallback_training_threads
    )
    if training_50 is not None:
        all_training_rows.extend(
            training_rows(50_000_000, training_50, fallback_training_threads)
        )
    feature_rows = combined_feature_rows(latest_training, latest, focus)

    backend_external = read_json(backend_external_path)
    backend_quantile = read_json(backend_quantile_path)
    backend_decision = read_json(backend_decision_path)
    prediction_benchmark = read_json(prediction_benchmark_path)
    ensure_open_scope(prediction_benchmark, "prediction thread benchmark")
    backend_rows = []
    for value, label in (
        (backend_external, "External-memory Quantile"),
        (backend_quantile, "Streamed in-memory Quantile"),
    ):
        for stage in ("construct", "train", "total"):
            backend_rows.append(
                {
                    "backend": label,
                    "stage": stage,
                    "seconds": float(value[f"{stage}_seconds"]),
                }
            )
    backend_table_rows = [
        {
            "backend": label,
            "total_seconds": float(value["total_seconds"]),
            "validation_logloss": float(value["final_validation_logloss"]),
            "peak_rss_gb": float(value["peak_rss_gb"]),
        }
        for value, label in (
            (backend_external, "External-memory Quantile"),
            (backend_quantile, "Streamed in-memory Quantile"),
        )
    ]
    single_thread_seconds = next(
        float(row["median_seconds"])
        for row in prediction_benchmark["results"]
        if int(row["threads"]) == 1
    )
    prediction_thread_rows = [
        {
            "threads": int(row["threads"]),
            "median_seconds": float(row["median_seconds"]),
            "speedup_vs_one_thread": single_thread_seconds
            / float(row["median_seconds"]),
            "bit_identical": float(row["maximum_absolute_delta"]) == 0,
        }
        for row in prediction_benchmark["results"]
    ]
    cohorts = cohort_rows(
        ROOT / "ml/data/manifests/propagation_v4_2_phase2_20m_cohorts.json"
    )
    cohorts.extend(
        cohort_rows(
            ROOT / "ml/data/manifests/propagation_v4_2_phase2_50m_cohorts.json"
        )
    )
    summary = [
        {
            "latest_scale_million": latest_scale,
            "evaluation_rows": int(latest["rows"]),
            "b2_brier": float(focus_row["b2_brier"]),
            "focus_brier": float(focus_row["evaluation_brier"]),
            "focus_delta_vs_b2": float(focus_row["delta_vs_b2"]),
            "focus_ece": float(
                focus_metric["overall"]["expected_calibration_error"]
            ),
            "evaluation_peak_rss_gb": float(latest["compute"]["peak_rss_gb"]),
            "backend_speedup": float(backend_decision["speedup"]),
            "prediction_threads": int(prediction_benchmark["selected_threads"]),
        }
    ]

    generated_at = datetime.now(timezone.utc).isoformat()
    evaluation_sources = [
        PHASE1 / "evaluation_results.json",
        PHASE1 / "conditional_results.json",
        evaluation_20_path,
    ]
    training_sources = [training_20_path]
    if evaluation_50 is not None:
        evaluation_sources.append(evaluation_50_path)
        training_sources.append(training_50_path)
    cohort_sources = [
        ROOT / "ml/data/manifests/propagation_v4_2_phase2_20m_cohorts.json"
    ]
    cohort_50_path = (
        ROOT / "ml/data/manifests/propagation_v4_2_phase2_50m_cohorts.json"
    )
    if cohort_50_path.exists():
        cohort_sources.append(cohort_50_path)
    sources = [
        union_source(
            "evaluation_combined",
            "5M-to-50M held-out evaluations",
            evaluation_sources,
        ),
        union_source(
            "training_combined",
            "20M-to-50M rolling training",
            training_sources,
        ),
        union_source(
            "cohorts", "Deterministic nested cohort manifests", cohort_sources
        ),
        union_source(
            "backend_combined",
            "M5 training backend benchmark",
            [backend_decision_path, backend_external_path, backend_quantile_path],
        ),
        source("evaluation20", "20M held-out evaluation", evaluation_20_path),
        source("training20", "20M rolling training", training_20_path),
        source("phase1", "5M Phase 1 evaluation", PHASE1 / "evaluation_results.json"),
        source("conditional", "5M A6 policy evaluation", PHASE1 / "conditional_results.json"),
        source("backend", "M5 backend benchmark decision", backend_decision_path),
        source("backend_external", "External-memory backend benchmark", backend_external_path),
        source("backend_quantile", "In-memory Quantile benchmark", backend_quantile_path),
        source(
            "prediction_threads",
            "M5 XGBoost prediction-thread benchmark",
            prediction_benchmark_path,
        ),
    ]
    if evaluation_50 is not None:
        sources.extend(
            [
                source("evaluation50", "50M held-out evaluation", evaluation_50_path),
                source("training50", "50M final-fold training", training_50_path),
            ]
        )
    latest_source = "evaluation50" if evaluation_50 is not None else "evaluation20"
    cards = [
        card("scale", "Latest scale (M rows)", "latest_scale_million", "Largest completed training cohort.", latest_source),
        card("rows", "Evaluation rows", "evaluation_rows", "Identical October and November rows.", latest_source),
        card("b2", "Frozen B2 Brier", "b2_brier", "Current operational statistical benchmark.", latest_source),
        card("focus", "Focus model Brier", "focus_brier", "Lower opportunity-weighted error is better.", latest_source),
        card("delta", "Focus minus B2", "focus_delta_vs_b2", "Negative values improve on B2.", latest_source),
        card("speed", "Backend speedup", "backend_speedup", "Measured total-time ratio at exact log-loss parity.", "backend_combined"),
        card("prediction_threads", "Prediction threads", "prediction_threads", "Fastest bit-identical M5 inference setting.", "prediction_threads"),
    ]
    charts = [
        chart(
            "learning_curve",
            "Held-out Brier across training scales",
            "Same full October/November population; lower is better. B2 is frozen and does not train at these scales.",
            "line",
            "learning_rows",
            {
                "x": {"field": "scale_million", "type": "quantitative", "label": "Training rows (millions)"},
                "y": {"field": "brier", "type": "quantitative", "label": "Weighted Brier"},
                "color": {"field": "candidate", "type": "nominal", "label": "Candidate"},
            },
            "evaluation_combined",
        ),
        chart(
            "candidate_delta",
            f"Candidate error at {latest_scale}M",
            "Candidate minus frozen B2 Brier; negative values improve probability accuracy.",
            "bar",
            "latest_candidate_rows",
            {
                "x": {"field": "candidate", "type": "ordinal", "label": "Candidate"},
                "y": {"field": "delta_vs_b2", "type": "quantitative", "label": "Brier delta vs B2"},
            },
            latest_source,
        ),
        chart(
            "month_delta",
            f"{LABELS.get(focus, focus)} transfer by month",
            "Candidate minus B2 Brier on identical opportunity mass; negative values improve.",
            "bar",
            "month_rows",
            {
                "x": {"field": "month", "type": "ordinal", "label": "Evaluation month"},
                "y": {"field": "delta_vs_b2", "type": "quantitative", "label": "Brier delta vs B2"},
            },
            latest_source,
        ),
        chart(
            "band_delta",
            f"{LABELS.get(focus, focus)} transfer by HF band",
            "Candidate minus B2 Brier; development slice evidence, not a production safety claim.",
            "bar",
            "band_rows",
            {
                "x": {"field": "band", "type": "ordinal", "label": "Band"},
                "y": {"field": "delta_vs_b2", "type": "quantitative", "label": "Brier delta vs B2"},
            },
            latest_source,
        ),
        chart(
            "distance_delta",
            f"{LABELS.get(focus, focus)} transfer by path distance",
            "Candidate minus B2 Brier on fixed distance bins; negative values improve.",
            "bar",
            "distance_rows",
            {
                "x": {"field": "distance", "type": "ordinal", "label": "Distance"},
                "y": {"field": "delta_vs_b2", "type": "quantitative", "label": "Brier delta vs B2"},
            },
            latest_source,
        ),
        chart(
            "reliability",
            f"{LABELS.get(focus, focus)} reliability",
            "Twenty opportunity-weighted probability bins versus the perfect-calibration reference.",
            "line",
            "reliability_rows",
            {
                "x": {"field": "mean_prediction", "type": "quantitative", "label": "Mean predicted probability"},
                "y": {"field": "observed_rate", "type": "quantitative", "label": "Observed success rate"},
                "color": {"field": "series", "type": "nominal", "label": "Series"},
            },
            latest_source,
        ),
        chart(
            "iterations",
            "Rolling-fold early-stopped capacity",
            "Best iteration by candidate, scale, and earlier temporal validation fold.",
            "bar",
            "training_rows",
            {
                "x": {"field": "fold", "type": "ordinal", "label": "Rolling fold"},
                "y": {"field": "best_iteration", "type": "quantitative", "label": "Best iteration"},
                "color": {"field": "series", "type": "nominal", "label": "Candidate and scale"},
            },
            "training_combined",
        ),
        chart(
            "backend_time",
            "M5 training backend benchmark",
            "A4 F3 at 20M, 5M validation rows, first 50 trees; lower elapsed seconds is better.",
            "bar",
            "backend_rows",
            {
                "x": {"field": "stage", "type": "ordinal", "label": "Stage"},
                "y": {"field": "seconds", "type": "quantitative", "label": "Elapsed seconds"},
                "color": {"field": "backend", "type": "nominal", "label": "Backend"},
            },
            "backend_combined",
        ),
        chart(
            "prediction_thread_time",
            "M5 XGBoost prediction thread sweep",
            "Median time on the same 100,000-row early-stopping feature matrix; every prediction digest must match.",
            "line",
            "prediction_thread_rows",
            {
                "x": {"field": "threads", "type": "quantitative", "label": "Prediction threads"},
                "y": {"field": "median_seconds", "type": "quantitative", "label": "Median seconds"},
            },
            "prediction_threads",
        ),
        chart(
            "feature_gain",
            f"Leading split-gain features for {LABELS.get(focus, focus)}",
            "Weighted component gain for an ensemble; descriptive model use, not causal attribution.",
            "bar",
            "feature_rows",
            feature_gain_encodings(),
            "training50" if training_50 is not None else "training20",
        ),
    ]
    tables = [
        {
            "id": "candidate_table",
            "title": "Scale and selection decisions",
            "subtitle": "All comparisons use paired full October/November scoring and 2,000 UTC-day resamples.",
            "dataset": "candidate_rows",
            "sourceId": "evaluation_combined",
            "defaultSort": {"field": "scale_million", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "scale_million", "label": "Scale M", "format": "number"},
                {"field": "candidate", "label": "Candidate", "type": "text"},
                {"field": "brier", "label": "Brier", "format": "number"},
                {"field": "delta_vs_b2", "label": "Delta vs B2", "format": "number"},
                {"field": "october_vs_b2", "label": "October", "format": "number"},
                {"field": "november_vs_b2", "label": "November", "format": "number"},
                {"field": "upper_95_vs_b2", "label": "Upper 95% vs B2", "format": "number"},
                {"field": "decision", "label": "Decision", "type": "text"},
            ],
        },
        {
            "id": "training_table",
            "title": "M5 training efficiency and temporal sensitivity",
            "subtitle": "Per-process peak RSS; 20M uses external memory and 50M uses streamed QuantileDMatrix.",
            "dataset": "training_rows",
            "sourceId": "training_combined",
            "defaultSort": {"field": "scale_million", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "scale_million", "label": "Scale M", "format": "number"},
                {"field": "candidate", "label": "Candidate", "type": "text"},
                {"field": "fold", "label": "Fold", "type": "text"},
                {"field": "best_iteration", "label": "Best iteration", "format": "number"},
                {"field": "best_logloss", "label": "Best log loss", "format": "number"},
                {"field": "training_hours", "label": "Hours", "format": "number"},
                {"field": "peak_rss_gb", "label": "Peak RSS GiB", "format": "number"},
                {"field": "xgboost_threads", "label": "Threads", "format": "number"},
                {"field": "backend", "label": "Backend", "type": "text"},
            ],
        },
        {
            "id": "backend_table",
            "title": "Backend parity and resource comparison",
            "subtitle": "The adopted backend had identical validation log loss at recorded precision.",
            "dataset": "backend_table_rows",
            "sourceId": "backend_combined",
            "defaultSort": {"field": "total_seconds", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "backend", "label": "Backend", "type": "text"},
                {"field": "total_seconds", "label": "Total seconds", "format": "number"},
                {"field": "validation_logloss", "label": "Validation log loss", "format": "number"},
                {"field": "peak_rss_gb", "label": "Peak RSS GiB", "format": "number"},
            ],
        },
        {
            "id": "cohort_table",
            "title": "Deterministic nested training cohorts",
            "subtitle": "Checksummed Parquet artifacts on the Projects volume; raw station identity is excluded from the model contract.",
            "dataset": "cohort_rows",
            "sourceId": "cohorts",
            "defaultSort": {"field": "scale_million", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "scale_million", "label": "Scale M", "format": "number"},
                {"field": "candidate", "label": "Candidate", "type": "text"},
                {"field": "fold", "label": "Fold", "type": "text"},
                {"field": "rows", "label": "Rows", "format": "number"},
                {"field": "bytes_gb", "label": "GiB", "format": "number"},
                {"field": "sha256", "label": "SHA-256", "type": "text"},
            ],
        },
    ]
    blocks = [
        {"id": "title", "type": "markdown", "body": "# Propagation V4.2 Phase 2: Scale, Transfer, and Efficiency"},
        {"id": "summary", "type": "markdown", "body": "## Technical summary\n\n" + decision},
        {"id": "metrics", "type": "metric-strip", "cardIds": [item["id"] for item in cards]},
        {
            "id": "plain_language",
            "type": "markdown",
            "body": (
                "## Plain-language explainer\n\nThink of each training row as one question: for this hour, band, "
                "transmitter area, receiver area, power level, space-weather state, and recent network history, what "
                "is the chance that at least one public WSPR receiver reports a decode? The model studies millions of "
                "past questions and outputs a probability from 0 to 1. **Brier score** is the average squared distance "
                "between those probabilities and what happened, so lower is better. More rows help only when that score "
                "also improves on later months. **NowCast** is the identity-free core probability. **StationCast** then "
                "adjusts it with the operator's private equipment chain at inference time. **FutureCast** is a later "
                "forecast product and is not justified by this retrospective experiment. Receiver locations and activity "
                "still affect what WSPR can observe, so this is a decode-opportunity model, not a guarantee that a two-way "
                "contact will succeed."
            ),
        },
        {
            "id": "definitions",
            "type": "markdown",
            "body": (
                "## Scope and metric definitions\n\n**Brier score** is the opportunity-weighted mean squared error of the "
                "single-public-WSPR-decode probability; lower is better. Every scale uses the same full October and "
                "November 2024 inferred-active path-hour population. **B2** is the frozen V3 NowCast benchmark. "
                "October/November are development evidence already observed in earlier work; December 2024 and all "
                "2025 outcomes are still closed."
            ),
        },
        {
            "id": "scale_finding",
            "type": "markdown",
            "body": "## The scale curve determines whether extra rows buy generalization\n\nThe learning curve compares calibrated models on identical outcomes. A flatter or worsening curve is evidence to stop, not a reason to spend a larger run.",
        },
        {"id": "learning", "type": "chart", "chartId": "learning_curve", "layout": "full"},
        {"id": "candidate_delta_block", "type": "chart", "chartId": "candidate_delta", "layout": "full"},
        {"id": "candidate_table_block", "type": "table", "tableId": "candidate_table", "layout": "full"},
        {
            "id": "temporal_finding",
            "type": "markdown",
            "body": "## Advancement requires both months and day-level uncertainty\n\nAn aggregate win is insufficient. The frozen rule requires the correct sign in October and November plus a paired UTC-day upper 95% bound below zero, preventing one month or a few high-volume days from deciding the result.",
        },
        {"id": "month", "type": "chart", "chartId": "month_delta", "layout": "full"},
        {
            "id": "safety_finding",
            "type": "markdown",
            "body": "## Slice checks show where aggregate performance is fragile\n\nBand and distance deltas use identical opportunity mass for the focus model and B2. Small-support slices remain diagnostic until the untouched gate confirms them.",
        },
        {"id": "band", "type": "chart", "chartId": "band_delta", "layout": "full"},
        {"id": "distance", "type": "chart", "chartId": "distance_delta", "layout": "full"},
        {
            "id": "calibration_finding",
            "type": "markdown",
            "body": "## Probability calibration must remain useful, not just rankings\n\nReliability compares predicted probability with observed opportunity-weighted success. The serving product needs calibrated probabilities because ReachMap and StationCast use magnitude, not merely ordering.",
        },
        {"id": "reliability_block", "type": "chart", "chartId": "reliability", "layout": "full"},
        {
            "id": "compute_finding",
            "type": "markdown",
            "body": (
                "## Native Apple Silicon execution removes the main scale bottleneck\n\nThe M5 uses native arm64 Python, "
                "OpenMP-enabled XGBoost, 18 DuckDB threads, and a spawn-based two-process scheduler with nine XGBoost "
                "threads and four Arrow I/O threads per fit. XGBoost has no Metal backend, so the correct acceleration "
                "path is multicore CPU plus bounded unified memory. The 50M QuantileDMatrix backend was adopted only "
                f"after a {backend_decision['speedup']:.3f}x total-time benchmark at exact validation parity and a "
                f"conservative {backend_decision['projected_parallel_peak_rss_gb']:.2f} GiB two-worker projection. "
                f"Single-process scoring uses the measured fastest bit-identical setting of "
                f"{int(prediction_benchmark['selected_threads'])} XGBoost threads."
            ),
        },
        {"id": "backend", "type": "chart", "chartId": "backend_time", "layout": "full"},
        {"id": "prediction_threads", "type": "chart", "chartId": "prediction_thread_time", "layout": "full"},
        {"id": "backend_table_block", "type": "table", "tableId": "backend_table", "layout": "full"},
        {"id": "iterations_block", "type": "chart", "chartId": "iterations", "layout": "full"},
        {"id": "training_table_block", "type": "table", "tableId": "training_table", "layout": "full"},
        {
            "id": "model_spec",
            "type": "markdown",
            "body": (
                "## Model specification and deterministic data design\n\nAll components use 91 identity-free V4 core features, "
                "histogram XGBoost with depth 9, learning rate 0.04, 2,000-round ceiling, 75-round early stopping, "
                "and August-only calibration. A2 spans the long archive naturally, A4 emphasizes the current solar "
                "cycle, A5 applies an 18-month recency half-life, and A6 is an August-selected calibrated A4/A5 blend. "
                "Cohorts are deterministic hash samples; 20M is nested inside 50M."
            ),
        },
        {"id": "features", "type": "chart", "chartId": "feature_gain", "layout": "full"},
        {"id": "cohort_table_block", "type": "table", "tableId": "cohort_table", "layout": "full"},
        {
            "id": "method",
            "type": "markdown",
            "body": (
                "## Methodology and validation design\n\nThree rolling folds move early stopping through February, May, "
                "and July 2024 without using later outcomes. Final-fold calibrators are selected on August. Full "
                "October and November are scored once per scale in bounded Arrow batches against B2 and the smaller "
                "version of the same candidate. Selection uses 2,000 paired UTC-day bootstrap resamples. A6 weights "
                "are refit only on the frozen August split. All inputs and generated model artifacts are checksummed."
            ),
        },
        {
            "id": "limits",
            "type": "markdown",
            "body": (
                "## Limitations, uncertainty, and robustness\n\nThis phase measures retrospective NowCast transfer, not a future "
                "forecast and not causal feature effects. WSPR receiver availability and station behavior remain part "
                "of the observation process. Split gain is descriptive. October/November have been observed during "
                "model development, so only the untouched December gate can support a fresh archive claim. Hardware "
                "timings apply to the named M5 environment and batch shapes."
            ),
        },
        {
            "id": "next",
            "type": "markdown",
            "body": "## Recommended next step\n\n" + decision,
        },
        {
            "id": "questions",
            "type": "markdown",
            "body": (
                "## Further questions\n\n- Does the frozen candidate pass the untouched December paired-day, band, "
                "short-path, calibration, and operational gates?\n- Does source staleness trigger the physics fallback at "
                "the exact service boundary?\n- If December passes, does the no-tuning 2025 archive preserve the benefit "
                "across at least three of four months?\n- After archive approval, does personalized StationCast improve "
                "operator decisions in opt-in prospective use?"
            ),
        },
    ]
    artifact = {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "Propagation V4.2 Phase 2: Scale, Transfer, and Efficiency",
            "description": "Auditable 5M-to-50M learning curves, temporal transfer, calibration, and native M5 efficiency.",
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
                "learning_rows": learning,
                "candidate_rows": decision_rows,
                "latest_candidate_rows": [
                    row for row in decision_rows if row["scale_million"] == latest_scale
                ],
                "month_rows": month_rows,
                "band_rows": band_rows,
                "distance_rows": distance_rows,
                "reliability_rows": reliability_rows,
                "training_rows": all_training_rows,
                "backend_rows": backend_rows,
                "backend_table_rows": backend_table_rows,
                "prediction_thread_rows": prediction_thread_rows,
                "feature_rows": feature_rows,
                "cohort_rows": cohorts,
            },
        },
        "sources": sources,
    }
    write_json(result / "REPORT.artifact.json", artifact)

    markdown = f"""# Propagation V4.2 Phase 2: Scale, Transfer, and Efficiency

Generated: {generated_at}

## Answer first

{decision}

The {latest_scale}M focus result is **{LABELS.get(focus, focus)}** at
`{float(focus_row['evaluation_brier']):.8f}` Brier
(`{float(focus_row['delta_vs_b2']):+.8f}` versus frozen B2).

## Plain-language explanation

Each row asks whether at least one public WSPR receiver reports a decode for a
particular path, hour, band, power level, weather state, and recent network
history. The model outputs a probability; lower Brier means those probabilities
were closer to what happened. NowCast is the identity-free core. StationCast
applies the operator's private equipment chain at inference time. FutureCast is
a separate future-forecast claim and is not established by this experiment.
Receiver coverage remains part of what the dataset can observe, so this is not
a guarantee of a completed two-way contact.

## Scale decisions

| Scale M | Candidate | Brier | Delta vs B2 | October | November | Upper 95% vs B2 | Decision |
|---:|---|---:|---:|---:|---:|---:|---|
"""
    for row in decision_rows:
        markdown += (
            f"| {row['scale_million']} | {row['candidate']} | {row['brier']:.8f} | "
            f"{row['delta_vs_b2']:+.8f} | {row['october_vs_b2']:+.8f} | "
            f"{row['november_vs_b2']:+.8f} | {row['upper_95_vs_b2']:+.8f} | "
            f"{row['decision']} |\n"
        )
    markdown += f"""

## Apple Silicon execution

The frozen 50M backend is `streamed_in_memory_quantile`. It was
`{backend_decision['speedup']:.3f}x` faster end to end than external memory at
identical recorded validation log loss. The conservative two-worker 50M memory
projection is `{backend_decision['projected_parallel_peak_rss_gb']:.2f}` GiB.

The scheduler uses two spawn-isolated fits, nine XGBoost OpenMP threads per fit,
four Arrow I/O threads per fit, and 18 DuckDB threads for cohort construction.
XGBoost's macOS build is native arm64 and has no CUDA/Metal training backend.
Single-process scoring uses the measured fastest bit-identical setting of
`{int(prediction_benchmark['selected_threads'])}` XGBoost prediction threads.

## Interpretation limits

October and November are development evidence, not a fresh gate. December 2024
and the four 2025 archive months remain closed. The model predicts a public WSPR
single-decode opportunity; it does not directly prove QSO success or causal
propagation mechanisms.

## Reproduce the visual report

```bash
ml/.venv/bin/python ml/src/archive_v4_2/benchmark_prediction_threads.py \\
  --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/generate_phase2_report.py --profile m5
node ml/src/archive_v4/package_report.mjs --input \\
  ml/results/propagation_v4_2/{run_id}/REPORT.artifact.json --output \\
  ml/results/propagation_v4_2/{run_id}/REPORT.html
```
"""
    (result / "REPORT.md").write_text(markdown, encoding="utf-8")
    print(result / "REPORT.artifact.json")


if __name__ == "__main__":
    main()
