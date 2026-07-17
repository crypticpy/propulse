#!/usr/bin/env python3
"""Generate the repository-safe FutureCast V1 synthetic engineering report."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


ROOT = Path(__file__).resolve().parents[3]
V4_2 = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(V4_2))

from m5_runtime import validate_m5_runtime  # noqa: E402


CONFIG = ROOT / "ml/config/futurecast_v1.json"
RUNTIME_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_OUTPUT = ROOT / "ml/results/propagation_v4/futurecast_v1_synthetic_e2e"
MODEL_LABELS = {
    "direct": "Direct model",
    "persistence": "Path persistence",
    "climatology": "Band-hour climatology",
    "weather_only": "Weather-only model",
}


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"FutureCast report input is not an object: {path}")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(
        json.dumps(payload, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def finite(value: Any, label: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise RuntimeError(f"FutureCast report metric is not finite: {label}")
    return number


def validate_inputs(
    *,
    source_path: Path,
    examples_path: Path,
    training_path: Path,
    p533_path: Path,
    gate_path: Path,
) -> tuple[dict[str, Any], ...]:
    config = read_json(CONFIG)
    source = read_json(source_path)
    examples = read_json(examples_path)
    training = read_json(training_path)
    p533 = read_json(p533_path)
    gate = read_json(gate_path)
    if (
        source.get("scope") != "futurecast_v1_private_source_export"
        or source.get("data_scope") != "synthetic_fixture"
        or source.get("release_approved") is not False
        or source.get("config_sha256") != sha256(CONFIG)
        or int(source.get("window", {}).get("days", 0)) != 90
    ):
        raise RuntimeError("FutureCast synthetic source evidence is invalid")
    if (
        examples.get("scope") != "futurecast_v1_direct_horizon_examples"
        or examples.get("data_scope") != "synthetic_fixture"
        or examples.get("release_approved") is not False
        or examples.get("source_manifest_sha256") != sha256(source_path)
        or examples.get("config_sha256") != sha256(CONFIG)
        or len(examples.get("partitions", [])) != 360
        or not all(all(row.get("gates", {}).values()) for row in examples["partitions"])
    ):
        raise RuntimeError("FutureCast synthetic example evidence is invalid")
    models = training.get("models", [])
    if (
        training.get("scope") != "futurecast_v1_development_models"
        or training.get("data_scope") != "synthetic_fixture"
        or training.get("decision") != "models_frozen_gate_unopened"
        or training.get("release_approved") is not False
        or training.get("example_manifest_sha256") != sha256(examples_path)
        or training.get("gate", {}).get("rows_read") is not False
        or len(models) != 8
    ):
        raise RuntimeError("FutureCast synthetic training evidence is invalid")
    expected_models = {
        (int(horizon), profile)
        for horizon in config["horizons_hours"]
        for profile in ("direct", "weather_only")
    }
    if {
        (int(row["horizon_hours"]), str(row["profile"])) for row in models
    } != expected_models:
        raise RuntimeError("FutureCast synthetic model set is incomplete")
    for row in models:
        if (
            sha256(Path(row["model_path"])) != row.get("model_sha256")
            or sha256(Path(row["calibrator_path"])) != row.get("calibrator_sha256")
        ):
            raise RuntimeError("FutureCast synthetic model checksum mismatch")
    if (
        p533.get("scope") != "futurecast_v1_p533_forecast_diagnostic"
        or p533.get("data_scope") != "synthetic_fixture"
        or p533.get("decision") != "diagnostic_frozen_gate_labels_unread"
        or p533.get("release_approved") is not False
        or p533.get("gate_labels_read") is not False
        or p533.get("equivalent_forecast_inputs") is not True
        or p533.get("training_manifest_sha256") != sha256(training_path)
        or len(p533.get("partitions", [])) != 8
    ):
        raise RuntimeError("FutureCast synthetic P.533 evidence is invalid")
    for row in p533["partitions"]:
        if sha256(Path(row["prediction_path"])) != row.get("prediction_sha256"):
            raise RuntimeError("FutureCast synthetic P.533 checksum mismatch")
    horizons = gate.get("horizons", {})
    if (
        gate.get("scope") != "futurecast_v1_locked_gate"
        or gate.get("data_scope") != "synthetic_fixture"
        or gate.get("decision") != "withheld"
        or gate.get("release_approved") is not False
        or gate.get("released_horizons_hours") != []
        or gate.get("gate_scored_once") is not True
        or gate.get("post_gate_tuning_permitted") is not False
        or gate.get("example_manifest_sha256") != sha256(examples_path)
        or gate.get("training_manifest_sha256") != sha256(training_path)
        or gate.get("p533_manifest_sha256") != sha256(p533_path)
        or set(horizons) != {str(value) for value in config["horizons_hours"]}
        or any(row.get("release_approved") is not False for row in horizons.values())
    ):
        raise RuntimeError("FutureCast synthetic gate evidence is invalid")
    privacy = source.get("privacy", {})
    if any(
        privacy.get(name) is not False
        for name in (
            "raw_wspr_observations_read",
            "callsigns_read",
            "station_identity_read",
            "equipment_read",
            "beta_outcomes_read",
            "core_prospective_outcomes_read",
        )
    ):
        raise RuntimeError("FutureCast synthetic report crossed a privacy boundary")
    return config, source, examples, training, p533, gate


def build_evidence(
    *,
    source_path: Path,
    examples_path: Path,
    training_path: Path,
    p533_path: Path,
    gate_path: Path,
) -> dict[str, Any]:
    config, source, examples, training, p533, gate = validate_inputs(
        source_path=source_path,
        examples_path=examples_path,
        training_path=training_path,
        p533_path=p533_path,
        gate_path=gate_path,
    )
    horizon_rows: list[dict[str, Any]] = []
    brier_rows: list[dict[str, Any]] = []
    p533_rows: list[dict[str, Any]] = []
    calibration_rows: list[dict[str, Any]] = []
    gate_rows: list[dict[str, Any]] = []
    for horizon in config["horizons_hours"]:
        result = gate["horizons"][str(horizon)]
        metrics = result["metrics"]
        best = str(result["best_baseline"])
        gates = result["gates"]
        paired = result["p533_paired_diagnostic"]["metrics"]
        horizon_rows.append(
            {
                "horizon_hours": int(horizon),
                "status": str(result["status"]),
                "best_baseline": MODEL_LABELS[best],
                "direct_brier": finite(metrics["direct"]["weighted_brier"], "direct Brier"),
                "best_baseline_brier": finite(metrics[best]["weighted_brier"], "baseline Brier"),
                "relative_brier_improvement": finite(
                    result["relative_brier_improvement"], "relative Brier improvement"
                ),
                "paired_upper_95": finite(
                    result["paired_issue_day_brier_delta_upper_95"], "bootstrap bound"
                ),
                "direct_ece": finite(metrics["direct"]["expected_calibration_error"], "direct ECE"),
                "best_baseline_ece": finite(metrics[best]["expected_calibration_error"], "baseline ECE"),
                "gate_opportunities": finite(
                    metrics["direct"]["weighted_opportunities"], "gate opportunities"
                ),
                "gates_passed": sum(value is True for value in gates.values()),
                "gates_total": len(gates),
                "released": False,
            }
        )
        for name in ("direct", "persistence", "climatology", "weather_only"):
            brier_rows.append(
                {
                    "horizon_hours": int(horizon),
                    "model": MODEL_LABELS[name],
                    "weighted_brier": finite(metrics[name]["weighted_brier"], f"{name} Brier"),
                    "weighted_log_loss": finite(
                        metrics[name]["weighted_log_loss"], f"{name} log loss"
                    ),
                    "weighted_opportunities": finite(
                        metrics[name]["weighted_opportunities"], f"{name} opportunities"
                    ),
                }
            )
        for name, label in (("direct", "Direct model"), ("p533", "Calibrated P.533")):
            p533_rows.append(
                {
                    "horizon_hours": int(horizon),
                    "model": label,
                    "weighted_brier": finite(paired[name]["weighted_brier"], f"P.533 {name} Brier"),
                    "weighted_opportunities": finite(
                        paired[name]["weighted_opportunities"], "P.533 opportunities"
                    ),
                }
            )
        calibration_rows.extend(
            (
                {
                    "horizon_hours": int(horizon),
                    "model": "Direct model",
                    "ece": finite(metrics["direct"]["expected_calibration_error"], "direct ECE"),
                },
                {
                    "horizon_hours": int(horizon),
                    "model": f"Best: {MODEL_LABELS[best]}",
                    "ece": finite(metrics[best]["expected_calibration_error"], "baseline ECE"),
                },
            )
        )
        gate_rows.extend(
            {
                "horizon_hours": int(horizon),
                "gate": name.replace("_", " "),
                "status": "pass" if passed else "fail",
            }
            for name, passed in gates.items()
        )
    model_rows = [
        {
            "horizon_hours": int(row["horizon_hours"]),
            "profile": "Direct" if row["profile"] == "direct" else "Weather-only",
            "features": len(row["features"]),
            "train_rows": int(row["train_rows"]),
            "early_stopping_rows": int(row["early_stopping_rows"]),
            "best_iteration": int(row["best_iteration"]),
            "calibration_method": str(row["calibration_method"]),
            "wall_seconds": finite(row["wall_seconds"], "model wall seconds"),
            "peak_rss_gib": finite(row["peak_rss_gib"], "model RSS"),
        }
        for row in training["models"]
    ]
    partitions = examples["partitions"]
    p533_partitions = p533["partitions"]
    total_gates = sum(row["gates_total"] for row in horizon_rows)
    passed_gates = sum(row["gates_passed"] for row in horizon_rows)
    summary = {
        "issued_days": int(source["window"]["days"]),
        "example_partitions": len(partitions),
        "example_rows": sum(int(row["rows"]) for row in partitions),
        "example_opportunities": sum(float(row["opportunities"]) for row in partitions),
        "models_frozen": len(model_rows),
        "xgboost_threads": int(training["parallelism"]["total_xgboost_threads"]),
        "combined_peak_rss_gib": finite(
            training["parallelism"]["conservative_combined_peak_rss_gib"],
            "combined RSS",
        ),
        "p533_sample_rows": sum(int(row["rows"]) for row in p533_partitions),
        "p533_unique_circuits": int(p533["execution"]["unique_circuits"]),
        "p533_workers": int(p533["execution"]["workers"]),
        "p533_wall_seconds": finite(p533["execution"]["wall_seconds"], "P.533 wall seconds"),
        "gates_passed": passed_gates,
        "gates_total": total_gates,
        "released_horizons": 0,
        "total_horizons": len(config["horizons_hours"]),
        "decision": "withheld",
    }
    generated = datetime.now(timezone.utc).isoformat()
    return {
        "schema_version": 1,
        "generated_at": generated,
        "scope": "futurecast_v1_synthetic_e2e_evidence",
        "data_scope": "synthetic_fixture",
        "decision": "engineering_pipeline_validated_release_withheld",
        "release_approved": False,
        "inputs": {
            "config_sha256": sha256(CONFIG),
            "source_manifest_sha256": sha256(source_path),
            "example_manifest_sha256": sha256(examples_path),
            "training_manifest_sha256": sha256(training_path),
            "p533_manifest_sha256": sha256(p533_path),
            "gate_result_sha256": sha256(gate_path),
        },
        "definitions": {
            "label": "successes / opportunities for one identity-free path, band, and valid hour",
            "weight": "WSPR opportunities",
            "brier": "sum(weight * (label - probability)^2) / sum(weight); lower is better",
            "relative_improvement": "1 - direct Brier / best frozen full-gate baseline Brier",
            "bootstrap": "2,000 paired resamples of the 15 UTC issue-day Brier deltas",
            "p533": "bounded paired diagnostic using issued F10.7, not a full-gate baseline",
        },
        "privacy": {
            "raw_wspr_rows_in_report": False,
            "callsigns_in_report": False,
            "station_identity_in_report": False,
            "grid4_in_report": False,
            "equipment_in_report": False,
            "locked_core_outcomes_read": False,
        },
        "datasets": {
            "summary": [summary],
            "horizon_metrics": horizon_rows,
            "full_gate_brier": brier_rows,
            "p533_brier": p533_rows,
            "calibration": calibration_rows,
            "model_fits": sorted(model_rows, key=lambda row: (row["horizon_hours"], row["profile"])),
            "gate_matrix": gate_rows,
        },
    }


def source_record(evidence_path: Path) -> dict[str, Any]:
    location = relative(evidence_path)
    return {
        "id": "futurecast_e2e",
        "label": "FutureCast V1 synthetic end-to-end evidence",
        "path": location,
        "query": {
            "engine": "duckdb",
            "language": "sql",
            "description": f"Load the reviewed aggregate evidence in {location}.",
            "sql": f"SELECT * FROM read_json_auto('{location}')",
            "tables_used": [location],
            "filters": [
                "Synthetic 90-day fixture only",
                "Four direct horizons: +3, +6, +12, +24 hours",
                "Private path keys and local artifact paths excluded",
            ],
            "metric_definitions": {
                "weighted_brier": "Opportunity-weighted mean squared probability error; lower is better.",
                "relative_brier_improvement": "1 - direct Brier / best frozen full-gate baseline Brier.",
                "paired_upper_95": "One-sided 95% issue-day bootstrap bound for direct minus best-baseline Brier.",
                "ece": "Twenty-bin opportunity-weighted expected calibration error.",
            },
        },
    }


def card(card_id: str, description: str, field: str, label: str, *, unit: str | None = None) -> dict[str, Any]:
    metric: dict[str, Any] = {"label": label, "field": field, "format": "number"}
    if unit:
        metric["unit"] = unit
    return {
        "id": card_id,
        "description": description,
        "dataset": "summary",
        "sourceId": "futurecast_e2e",
        "metrics": [metric],
    }


def grouped_chart(
    chart_id: str,
    title: str,
    subtitle: str,
    dataset: str,
    value_field: str,
    value_label: str,
    series_field: str,
) -> dict[str, Any]:
    return {
        "id": chart_id,
        "title": title,
        "subtitle": subtitle,
        "type": "bar",
        "dataset": dataset,
        "sourceId": "futurecast_e2e",
        "encodings": {
            "x": {"field": "horizon_hours", "type": "ordinal", "label": "Horizon (hours)"},
            "y": {"field": value_field, "type": "quantitative", "label": value_label},
            "color": {"field": series_field, "type": "nominal", "label": "Model"},
        },
        "valueFormat": "number",
        "layout": "full",
    }


def build_artifact(evidence_path: Path, evidence: dict[str, Any]) -> dict[str, Any]:
    source = source_record(evidence_path)
    cards = [
        card("issued_days", "Frozen chronological fixture window.", "issued_days", "Issued days"),
        card("example_rows", "Identity-free path-band-hour examples.", "example_rows", "Examples"),
        card("models", "Direct and weather-only models across four horizons.", "models_frozen", "Models frozen"),
        card("threads", "Two XGBoost workers with nine native threads each.", "xgboost_threads", "Training threads"),
        card("rss", "Conservative sum of simultaneous fit peaks.", "combined_peak_rss_gib", "Peak RSS", unit="GiB"),
        card("p533", "Calibration plus unlabeled-gate physics sample.", "p533_sample_rows", "P.533 rows"),
        card("released", "Synthetic evidence can never authorize release.", "released_horizons", "Horizons released"),
    ]
    charts = [
        grouped_chart(
            "full_gate_brier_chart",
            "Full-gate weighted Brier by horizon",
            "Synthetic 15-day gate; lower is better. Baselines and direct model use identical rows.",
            "full_gate_brier",
            "weighted_brier",
            "Weighted Brier",
            "model",
        ),
        {
            "id": "relative_skill_chart",
            "title": "Direct-model relative Brier improvement",
            "subtitle": "Versus the best frozen full-gate baseline; negative values are regressions.",
            "type": "bar",
            "dataset": "horizon_metrics",
            "sourceId": "futurecast_e2e",
            "encodings": {
                "x": {"field": "horizon_hours", "type": "ordinal", "label": "Horizon (hours)"},
                "y": {"field": "relative_brier_improvement", "type": "quantitative", "label": "Relative improvement"},
            },
            "valueFormat": "percent",
            "layout": "full",
        },
        grouped_chart(
            "p533_chart",
            "Paired P.533 diagnostic Brier",
            "Up to 50 paths per issue day, horizon, and band; calibrated on pre-gate days.",
            "p533_brier",
            "weighted_brier",
            "Weighted Brier",
            "model",
        ),
        grouped_chart(
            "calibration_chart",
            "Expected calibration error by horizon",
            "Direct model versus the horizon's best full-gate baseline; lower is better.",
            "calibration",
            "ece",
            "Expected calibration error",
            "model",
        ),
        grouped_chart(
            "iterations_chart",
            "Best boosting iteration by horizon",
            "Frozen five-day early-stopping block; fresh spawn child per fit.",
            "model_fits",
            "best_iteration",
            "Best iteration",
            "profile",
        ),
    ]
    tables = [
        {
            "id": "horizon_table",
            "title": "Per-horizon gate result",
            "subtitle": "Exact full-gate metrics and one-sided paired uncertainty.",
            "dataset": "horizon_metrics",
            "sourceId": "futurecast_e2e",
            "defaultSort": {"field": "horizon_hours", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "horizon_hours", "label": "Horizon h", "type": "number"},
                {"field": "status", "label": "Decision", "type": "text"},
                {"field": "best_baseline", "label": "Best baseline", "type": "text"},
                {"field": "direct_brier", "label": "Direct Brier", "type": "number"},
                {"field": "best_baseline_brier", "label": "Baseline Brier", "type": "number"},
                {"field": "relative_brier_improvement", "label": "Relative skill", "type": "number"},
                {"field": "paired_upper_95", "label": "Paired upper 95%", "type": "number"},
                {"field": "gate_opportunities", "label": "Gate opportunities", "type": "number"},
                {"field": "gates_passed", "label": "Gates passed", "type": "number"},
                {"field": "gates_total", "label": "Gates total", "type": "number"},
            ],
        },
        {
            "id": "model_table",
            "title": "Frozen model fits",
            "subtitle": "External-memory XGBoost models; gate rows remained unread during fitting.",
            "dataset": "model_fits",
            "sourceId": "futurecast_e2e",
            "defaultSort": {"field": "horizon_hours", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "horizon_hours", "label": "Horizon h", "type": "number"},
                {"field": "profile", "label": "Profile", "type": "text"},
                {"field": "features", "label": "Features", "type": "number"},
                {"field": "train_rows", "label": "Train rows", "type": "number"},
                {"field": "best_iteration", "label": "Best iteration", "type": "number"},
                {"field": "calibration_method", "label": "Calibration", "type": "text"},
                {"field": "wall_seconds", "label": "Wall seconds", "type": "number"},
                {"field": "peak_rss_gib", "label": "Peak RSS GiB", "type": "number"},
            ],
        },
        {
            "id": "gate_table",
            "title": "All preregistered release gates",
            "subtitle": "Every gate is mandatory and evaluated separately for each horizon.",
            "dataset": "gate_matrix",
            "sourceId": "futurecast_e2e",
            "defaultSort": {"field": "horizon_hours", "direction": "asc"},
            "density": "dense",
            "layout": "full",
            "columns": [
                {"field": "horizon_hours", "label": "Horizon h", "type": "number"},
                {"field": "gate", "label": "Gate", "type": "text"},
                {"field": "status", "label": "Status", "type": "text"},
            ],
        },
    ]
    blocks = [
        {"id": "title", "type": "markdown", "body": "# FutureCast V1: synthetic end-to-end engineering report"},
        {
            "id": "summary",
            "type": "markdown",
            "sourceId": "futurecast_e2e",
            "body": (
                "## Technical summary\n\n**The complete FutureCast training and evaluation path works on the M5, "
                "but this run is not model-quality evidence.** The fixture exercised 90 legal issue days, "
                "360 leakage-audited Parquet partitions, eight direct-horizon XGBoost fits, a pinned "
                "issued-input P.533 diagnostic, and one-shot streamed gate scoring. All four horizons "
                "remain withheld. The direct models lost to a frozen full-gate baseline in this deliberately "
                "small synthetic world, and `data_scope: synthetic_fixture` independently makes release impossible."
            ),
        },
        {"id": "cards", "type": "metric-strip", "cardIds": [row["id"] for row in cards]},
        {
            "id": "finding",
            "type": "markdown",
            "sourceId": "futurecast_e2e",
            "body": (
                "## Learned path history did not beat the simpler fixture baselines\n\nThe direct model "
                "regressed against weather-only at +3, +6, and +12 hours and against one-hour persistence "
                "at +24 hours. That is a useful negative control: the scorer selected the strongest frozen "
                "comparator instead of manufacturing a win."
            ),
        },
        {"id": "brier", "type": "chart", "chartId": "full_gate_brier_chart", "layout": "full"},
        {"id": "skill", "type": "chart", "chartId": "relative_skill_chart", "layout": "full"},
        {
            "id": "physics",
            "type": "markdown",
            "sourceId": "futurecast_e2e",
            "body": (
                "## The physics comparator is reproducible and bounded\n\nP.533 used the same issued NOAA "
                "three-day F10.7 value, an explicitly pinned statistical sunspot conversion, and fixed 1 W, "
                "6 Hz, -28 dB reference conditions. Calibration used only pre-gate days. P.533 is a paired "
                "diagnostic, not an eligible full-gate baseline."
            ),
        },
        {"id": "p533", "type": "chart", "chartId": "p533_chart", "layout": "full"},
        {
            "id": "scope",
            "type": "markdown",
            "sourceId": "futurecast_e2e",
            "body": (
                "## Scope, data, and metric definitions\n\nEach row is one identity-free grid4 path, HF band, "
                "and valid hour. The fractional label is `successes / opportunities`; opportunities are the "
                "sample weight. Brier is the opportunity-weighted mean squared probability error. Issue days "
                "are split chronologically 60 train / 15 calibration / 15 gate, and the gate is read only after "
                "model and P.533 artifacts are frozen."
            ),
        },
        {"id": "horizon", "type": "table", "tableId": "horizon_table", "layout": "full"},
        {"id": "calibration_text", "type": "markdown", "body": "## Calibration remains a product gate\n\nReachMap and band forecasts consume probability magnitude, so Brier wins cannot compensate for poor expected calibration error."},
        {"id": "calibration", "type": "chart", "chartId": "calibration_chart", "layout": "full"},
        {
            "id": "method",
            "type": "markdown",
            "sourceId": "futurecast_e2e",
            "body": (
                "## Model and execution specification\n\nOne direct and one weather-only XGBoost model are fit "
                "per horizon. Two macOS spawn children run concurrently with nine native threads each; every "
                "child handles exactly one model. Arrow and XGBoost stream bounded Parquet batches from the "
                "Projects SSD, and conservative simultaneous peak RSS stayed below 1 GiB on this fixture."
            ),
        },
        {"id": "iterations", "type": "chart", "chartId": "iterations_chart", "layout": "full"},
        {"id": "models_table", "type": "table", "tableId": "model_table", "layout": "full"},
        {"id": "gates_text", "type": "markdown", "body": "## Release remains fail-closed\n\nA horizon must pass every performance, uncertainty, calibration, supported-band, integrity, P.533, production-evidence, and resource gate. Partial release is permitted only for individually passing production horizons."},
        {"id": "gates", "type": "table", "tableId": "gate_table", "layout": "full"},
        {
            "id": "limits",
            "type": "markdown",
            "body": (
                "## Limitations, uncertainty, and robustness\n\nThis fixture is intentionally small and deterministic. "
                "It cannot estimate real HF forecast accuracy, receiver-selection bias, geography transfer, "
                "solar-event behavior, or supported-band safety. Only 60,000 gate opportunities exist per "
                "horizon, so the million-opportunity gate and 10,000-opportunity per-band support rule correctly "
                "withhold. The P.533 F10.7-to-sunspot relationship is statistical, not exact."
            ),
        },
        {
            "id": "next",
            "type": "markdown",
            "body": (
                "## Recommended next step\n\nKeep the immutable NOAA and permitted WSPR collectors running. "
                "When the first 90 consecutive common legal issuance days mature, export that first window, "
                "run this unchanged pipeline once, and release only horizons that clear every frozen gate."
            ),
        },
        {
            "id": "questions",
            "type": "markdown",
            "body": (
                "## Further questions\n\n- Which horizons add value beyond weather-only and persistence on genuine issued forecasts?\n"
                "- Do improvements survive all supported bands, solar regimes, and geographic slices?\n"
                "- Does the production P.533 sample reveal systematic physics/model disagreements worth a hybrid feature?\n"
                "- Which passing horizons are calibrated well enough for operator-facing probability maps?"
            ),
        },
    ]
    return {
        "surface": "report",
        "manifest": {
            "version": 1,
            "surface": "report",
            "title": "FutureCast V1: synthetic end-to-end engineering report",
            "description": "Issued-forecast pipeline, model, physics diagnostic, gate, and M5 resource evidence.",
            "generatedAt": evidence["generated_at"],
            "cards": cards,
            "charts": charts,
            "tables": tables,
            "sources": [source],
            "blocks": blocks,
        },
        "snapshot": {
            "version": 1,
            "generatedAt": evidence["generated_at"],
            "status": "fixture",
            "datasets": evidence["datasets"],
        },
        "sources": [source],
    }


def markdown_summary(evidence: dict[str, Any]) -> str:
    summary = evidence["datasets"]["summary"][0]
    return f"""# FutureCast V1: synthetic end-to-end engineering report

## Result

The full M5 pipeline passed engineering validation across {summary['issued_days']} synthetic
issue days, {summary['example_partitions']} leakage-audited partitions, and
{summary['models_frozen']} frozen models. Release remains **withheld** for all four
horizons because this is synthetic evidence and the direct models did not beat their
best frozen full-gate baselines.

## Execution

- XGBoost: {summary['xgboost_threads']} native threads, two fresh spawn workers.
- Conservative combined peak RSS: {summary['combined_peak_rss_gib']:.3f} GiB.
- P.533: {summary['p533_sample_rows']:,} paired rows, {summary['p533_unique_circuits']:,}
  unique circuits, {summary['p533_workers']} workers.
- Release gates: {summary['gates_passed']}/{summary['gates_total']} passed across four horizons.

The interactive `REPORT.html` is the primary visual report. This Markdown file is its
compact semantic companion. Synthetic results establish pipeline behavior only, not
real propagation forecast accuracy.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--example-manifest", type=Path, required=True)
    parser.add_argument("--training-manifest", type=Path, required=True)
    parser.add_argument("--p533-manifest", type=Path, required=True)
    parser.add_argument("--gate-result", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    validate_m5_runtime(read_json(RUNTIME_CONFIG))
    args.output_dir = args.output_dir.expanduser().resolve()
    if not args.output_dir.is_relative_to(ROOT):
        raise RuntimeError("FutureCast report output must remain inside the repository")
    paths = {
        "source_path": args.source_manifest.expanduser().resolve(),
        "examples_path": args.example_manifest.expanduser().resolve(),
        "training_path": args.training_manifest.expanduser().resolve(),
        "p533_path": args.p533_manifest.expanduser().resolve(),
        "gate_path": args.gate_result.expanduser().resolve(),
    }
    evidence = build_evidence(**paths)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    evidence_path = args.output_dir / "FUTURECAST_SYNTHETIC_E2E_EVIDENCE.json"
    atomic_json(evidence_path, evidence)
    atomic_json(args.output_dir / "REPORT.artifact.json", build_artifact(evidence_path, evidence))
    (args.output_dir / "REPORT.md").write_text(markdown_summary(evidence), encoding="utf-8")
    print(args.output_dir / "REPORT.artifact.json")


if __name__ == "__main__":
    main()
