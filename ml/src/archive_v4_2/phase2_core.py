"""Pure contracts and selection rules for V4.2 Phase 2 scaling."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any


EXPECTED_CANDIDATES = (
    "A2_long_natural",
    "A4_recent_cycle",
    "A5_recency_weighted",
)
EXPECTED_FOLDS = (
    "F1_2024_02",
    "F2_2024_05",
    "F3_2024_07",
)
LOCKED_MONTHS = frozenset(("2024-12", "2025-01", "2025-04", "2025-07", "2025-10"))


class Phase2Error(RuntimeError):
    """Raised before Phase 2 can violate its frozen development contract."""


def validate_config(config: Mapping[str, Any]) -> None:
    if config.get("execution_scope") != "development":
        raise Phase2Error("Phase 2 requires development scope")
    if tuple(config["candidates"]) != EXPECTED_CANDIDATES:
        raise Phase2Error("Phase 2 candidate order changed")
    if tuple(config["rolling_folds"]) != EXPECTED_FOLDS:
        raise Phase2Error("Phase 2 rolling-fold order changed")
    if config["final_fold"] != EXPECTED_FOLDS[-1]:
        raise Phase2Error("final fold must remain the July fold")
    if config["calibration_month"] != "2024-08":
        raise Phase2Error("calibration month must remain August 2024")
    if list(config["evaluation_months"]) != ["2024-10", "2024-11"]:
        raise Phase2Error("evaluation months must remain October and November")
    scales = [int(value) for value in config["sampling"]["scales"]]
    if scales != [20_000_000, 50_000_000]:
        raise Phase2Error("Phase 2 scales must remain 20M then 50M")
    seen_training: set[str] = set(config["base_training_months"])
    previous_month: str | None = None
    for name, fold in config["rolling_folds"].items():
        month = str(fold["early_stopping_month"])
        if previous_month is not None and month <= previous_month:
            raise Phase2Error("rolling folds are not chronological")
        previous_month = month
        training = set(fold["available_2024_training_months"])
        if month in training or any(value >= month for value in training):
            raise Phase2Error(f"{name} includes its future validation month")
        reference = datetime.fromisoformat(
            str(fold["recency_reference"]).replace("Z", "+00:00")
        )
        if reference.strftime("%Y-%m") != month:
            raise Phase2Error(f"{name} recency reference does not match validation")
        seen_training.update(training)
        seen_training.add(month)
    configured = seen_training | {
        str(config["calibration_month"]),
        *map(str, config["evaluation_months"]),
    }
    if configured & LOCKED_MONTHS:
        raise Phase2Error("Phase 2 references a locked outcome month")
    if set(config["frozen_outcomes"]["forbidden"]) != LOCKED_MONTHS:
        raise Phase2Error("locked outcome inventory changed")
    policy = config["conditional_policy"]
    if policy["left"] != "A4_recent_cycle" or policy["right"] != "A5_recency_weighted":
        raise Phase2Error("A6 component contract changed")
    if policy["selection_month"] != config["calibration_month"]:
        raise Phase2Error("A6 must be selected on the calibration month")
    if policy["calibrator_fit_days"] != [1, 20]:
        raise Phase2Error("A6 calibrator-fit days changed")
    if policy["policy_selection_days"] != [21, 31]:
        raise Phase2Error("A6 selection days changed")
    if int(config["advancement"]["maximum_50m_components"]) > 2:
        raise Phase2Error("more than two 50M component models are configured")
    for month, path in config["source_roots"]["supplemental"].items():
        if month in LOCKED_MONTHS or any(value in str(path) for value in LOCKED_MONTHS):
            raise Phase2Error(f"locked source configured: {month}")


def training_months(
    config: Mapping[str, Any], candidate: str, fold: str
) -> list[str]:
    if candidate not in EXPECTED_CANDIDATES:
        raise Phase2Error(f"unknown candidate: {candidate}")
    if fold not in EXPECTED_FOLDS:
        raise Phase2Error(f"unknown fold: {fold}")
    base = list(map(str, config["base_training_months"]))
    if candidate == "A2_long_natural":
        return base
    available = list(
        map(str, config["rolling_folds"][fold]["available_2024_training_months"])
    )
    if candidate == "A4_recent_cycle":
        return [month for month in base if month >= "2022-01"] + available
    return base + available


def scale_workset(
    config: Mapping[str, Any],
    scale: int,
    phase2_20m_evaluation: Mapping[str, Any] | None = None,
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Return the preregistered candidate/fold inventory for a scale."""
    if scale == 20_000_000:
        return EXPECTED_CANDIDATES, EXPECTED_FOLDS
    if scale != 50_000_000:
        raise Phase2Error(f"unsupported Phase 2 scale: {scale}")
    if phase2_20m_evaluation is None:
        raise Phase2Error("50M requires the frozen 20M evaluation selection")
    if int(phase2_20m_evaluation.get("scale", 0)) != 20_000_000:
        raise Phase2Error("50M selection source is not the 20M evaluation")
    if phase2_20m_evaluation.get("december_2024_read") or phase2_20m_evaluation.get(
        "locked_2025_read"
    ):
        raise Phase2Error("50M selection source reports locked outcome access")
    selected = tuple(
        map(str, phase2_20m_evaluation["selection"]["advance_to_50m"])
    )
    maximum = int(config["advancement"]["maximum_50m_components"])
    if not selected:
        raise Phase2Error("the 20M evidence advances no candidate to 50M")
    if len(selected) > maximum or len(set(selected)) != len(selected):
        raise Phase2Error("invalid 50M candidate count or duplicate selection")
    if any(name not in EXPECTED_CANDIDATES for name in selected):
        raise Phase2Error("50M selection contains an unknown candidate")
    return selected, (str(config["final_fold"]),)


def matrix_backend(config: Mapping[str, Any], scale: int) -> str:
    if scale == 20_000_000:
        return "external_memory_quantile"
    if scale != 50_000_000:
        raise Phase2Error(f"unsupported Phase 2 scale: {scale}")
    backend = str(
        config["compute"]["apple_silicon"]["backend_benchmark"][
            "fifty_million_backend"
        ]
    )
    allowed = {"external_memory_quantile", "streamed_in_memory_quantile"}
    if backend not in allowed:
        raise Phase2Error("50M matrix backend is not frozen from the benchmark")
    return backend


def is_robust_b2_win(row: Mapping[str, Any]) -> bool:
    return (
        float(row["delta_vs_b2"]) < 0
        and all(float(value) < 0 for value in row["month_deltas_vs_b2"].values())
        and float(row["bootstrap_upper_vs_b2"]) < 0
    )


def is_learning_candidate(row: Mapping[str, Any], maximum_relative_gap: float) -> bool:
    return (
        float(row["delta_vs_5m"]) < 0
        and all(float(value) < 0 for value in row["month_deltas_vs_5m"].values())
        and float(row["bootstrap_upper_vs_5m"]) < 0
        and float(row["relative_gap_to_b2"]) <= maximum_relative_gap
    )


def select_50m_components(
    rows: list[Mapping[str, Any]],
    *,
    a6_row: Mapping[str, Any] | None,
    maximum: int,
    maximum_relative_gap: float,
) -> list[str]:
    if maximum <= 0 or maximum > 2:
        raise ValueError("maximum must be one or two")
    by_name = {str(row["candidate"]): row for row in rows}
    if set(by_name) != set(EXPECTED_CANDIDATES):
        raise Phase2Error("selection rows do not match Phase 2 candidates")
    if a6_row is not None and is_robust_b2_win(a6_row):
        return ["A4_recent_cycle", "A5_recency_weighted"][:maximum]
    robust = [row for row in rows if is_robust_b2_win(row)]
    ordered = sorted(
        robust,
        key=lambda value: (float(value["evaluation_brier"]), str(value["candidate"])),
    )
    selected = [str(value["candidate"]) for value in ordered[:maximum]]
    if len(selected) == maximum:
        return selected
    learning = [
        row
        for row in rows
        if str(row["candidate"]) not in selected
        and is_learning_candidate(row, maximum_relative_gap)
    ]
    for row in sorted(
        learning,
        key=lambda value: (float(value["evaluation_brier"]), str(value["candidate"])),
    ):
        selected.append(str(row["candidate"]))
        if len(selected) == maximum:
            break
    return selected


def decide_100m(
    row: Mapping[str, Any], minimum_relative_curve_improvement: float
) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if float(row["relative_improvement_20m_to_50m"]) < minimum_relative_curve_improvement:
        reasons.append("20M-to-50M relative Brier improvement is below threshold")
    if not bool(row["residual_supports_variance_or_rare_regime"]):
        reasons.append("residual evidence does not identify variance or rare-regime support")
    if not bool(row["beats_b2_consistently"]):
        reasons.append("50M candidate does not beat B2 consistently")
    if not bool(row["compute_fits"]):
        reasons.append("100M compute does not fit the documented budget")
    if not bool(row["inference_compatible"]):
        reasons.append("inference contract is not product-compatible")
    if bool(row["december_2024_read"]):
        reasons.append("December was opened before the 100M decision")
    return not reasons, reasons


def select_training_backend(
    external: Mapping[str, Any],
    in_memory: Mapping[str, Any],
    policy: Mapping[str, Any],
    workers: int,
) -> dict[str, Any]:
    expected = {
        "external_memory_quantile": external,
        "streamed_in_memory_quantile": in_memory,
    }
    for backend, result in expected.items():
        if result.get("backend") != backend:
            raise Phase2Error(f"backend benchmark result mismatch: {backend}")
        if result.get("december_2024_read") or result.get("locked_2025_read"):
            raise Phase2Error("backend benchmark reports locked outcome access")
    comparable = (
        external["candidate"] == in_memory["candidate"]
        and external["fold"] == in_memory["fold"]
        and int(external["scale"]) == int(in_memory["scale"])
        and external["inputs"] == in_memory["inputs"]
        and external["parameters"] == in_memory["parameters"]
        and int(external["boost_rounds"]) == int(in_memory["boost_rounds"])
    )
    if not comparable:
        raise Phase2Error("backend benchmark arms are not comparable")
    speedup = float(external["total_seconds"]) / float(in_memory["total_seconds"])
    loss_difference = abs(
        float(external["final_validation_logloss"])
        - float(in_memory["final_validation_logloss"])
    )
    scale_factor = float(policy["target_scale"]) / float(in_memory["scale"])
    parallel_peak = workers * float(in_memory["peak_rss_gb"]) * scale_factor
    checks = {
        "minimum_speedup": speedup >= float(policy["minimum_speedup_to_adopt"]),
        "validation_logloss_parity": loss_difference
        <= float(policy["maximum_validation_logloss_difference"]),
        "parallel_memory_budget": parallel_peak
        <= float(policy["maximum_parallel_peak_rss_gb"]),
    }
    selected = (
        "streamed_in_memory_quantile"
        if all(checks.values())
        else "external_memory_quantile"
    )
    return {
        "selected_backend": selected,
        "checks": checks,
        "speedup": speedup,
        "validation_logloss_difference": loss_difference,
        "projected_parallel_peak_rss_gb": parallel_peak,
        "memory_scale_factor": scale_factor,
        "workers": workers,
    }
