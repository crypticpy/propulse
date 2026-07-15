"""Frozen V4.2 December and locked-archive gate calculations."""

from __future__ import annotations

from typing import Any

import numpy as np


def rows_by_key(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    output = {str(row["key"]): row for row in rows}
    if len(output) != len(rows):
        raise ValueError("metric slice contains duplicate keys")
    return output


def relative_improvement(candidate: float, baseline: float) -> float:
    if baseline <= 0:
        raise ValueError("Brier baseline must be positive")
    return 1 - candidate / baseline


def relative_regression(candidate: float, baseline: float) -> float:
    return -relative_improvement(candidate, baseline)


def paired_day_bootstrap(
    candidate_rows: list[dict[str, Any]],
    baseline_rows: list[dict[str, Any]],
    *,
    seed: int,
    repetitions: int,
) -> dict[str, float]:
    candidate = rows_by_key(candidate_rows)
    baseline = rows_by_key(baseline_rows)
    if set(candidate) != set(baseline) or len(candidate) < 2:
        raise ValueError("paired UTC-day inventories differ or are too short")
    values = []
    for key in sorted(candidate):
        left = candidate[key]
        right = baseline[key]
        left_weight = float(left["opportunities"])
        right_weight = float(right["opportunities"])
        if not np.isclose(left_weight, right_weight, rtol=1e-10, atol=1e-6):
            raise ValueError(f"paired UTC-day opportunity mass differs: {key}")
        values.append(
            [
                left_weight,
                left_weight * float(left["weighted_brier"]),
                right_weight * float(right["weighted_brier"]),
            ]
        )
    matrix = np.asarray(values, dtype=np.float64)
    rng = np.random.default_rng(seed)
    delta = np.empty(repetitions, dtype=np.float64)
    skill = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sample = matrix[rng.integers(0, len(matrix), len(matrix))].sum(axis=0)
        candidate_brier = sample[1] / sample[0]
        baseline_brier = sample[2] / sample[0]
        delta[index] = candidate_brier - baseline_brier
        skill[index] = 1 - candidate_brier / baseline_brier
    return {
        "delta_lower_95": float(np.quantile(delta, 0.025)),
        "delta_median": float(np.quantile(delta, 0.5)),
        "delta_upper_95": float(np.quantile(delta, 0.975)),
        "skill_lower_95": float(np.quantile(skill, 0.025)),
        "skill_median": float(np.quantile(skill, 0.5)),
        "skill_upper_95": float(np.quantile(skill, 0.975)),
    }


def high_confidence_gap(metric: dict[str, Any]) -> float:
    rows = [
        row
        for row in metric["overall"].get("bins", [])
        if float(row["lower"]) >= 0.5
    ]
    return max(
        (
            abs(float(row["mean_prediction"]) - float(row["observed_rate"]))
            for row in rows
        ),
        default=0.0,
    )


def supported_pairs(
    candidate_rows: list[dict[str, Any]],
    baseline_rows: list[dict[str, Any]],
    *,
    minimum_rows: int,
    minimum_opportunities: float,
) -> dict[str, tuple[dict[str, Any], dict[str, Any]]]:
    candidate = rows_by_key(candidate_rows)
    baseline = rows_by_key(baseline_rows)
    if set(candidate) != set(baseline):
        raise ValueError("candidate and B2 slice inventories differ")
    return {
        key: (candidate[key], baseline[key])
        for key in sorted(candidate)
        if int(candidate[key]["rows"]) >= minimum_rows
        and float(candidate[key]["opportunities"]) >= minimum_opportunities
    }


def phase3_operational_gates(phase3: dict[str, Any]) -> dict[str, bool]:
    gates = phase3.get("gates", {})
    operational = (
        "bounded_probabilities",
        "fresh_selects_nowcast",
        "stale_selects_physics_with_provenance",
        "stale_reduces_confidence",
        "missing_feature_is_explicit",
        "frontend_response_contract",
    )
    privacy = (
        "bundle_checksum_and_schema",
        "public_manifest_privacy",
        "locked_scopes_remain_closed",
    )
    efficiency = ("single_latency", "batch_latency", "memory_budget", "bundle_size")
    return {
        "operational": all(bool(gates.get(name)) for name in operational),
        "parity": bool(gates.get("offline_service_parity")),
        "privacy_and_provenance": all(bool(gates.get(name)) for name in privacy),
        "efficiency": all(bool(gates.get(name)) for name in efficiency),
    }


def decide_december(
    metrics: dict[str, dict[str, Any]],
    phase3_validation: dict[str, Any],
    integrity_audit: dict[str, Any],
    config: dict[str, Any],
    *,
    locked_2025_read: bool,
) -> dict[str, Any]:
    candidate = metrics["candidate"]
    baseline = metrics["B2_frozen_v3"]
    gate = config["phase4"]
    overall_candidate = float(candidate["overall"]["weighted_brier"])
    overall_baseline = float(baseline["overall"]["weighted_brier"])
    improvement = relative_improvement(overall_candidate, overall_baseline)
    bootstrap = paired_day_bootstrap(
        candidate["slices"]["day"],
        baseline["slices"]["day"],
        seed=int(config["seed"]),
        repetitions=int(gate["bootstrap_repetitions"]),
    )
    candidate_days = rows_by_key(candidate["slices"]["day"])
    baseline_days = rows_by_key(baseline["slices"]["day"])
    qualified_days = [
        key
        for key, row in candidate_days.items()
        if float(row["opportunities"])
        >= float(gate["minimum_qualified_day_opportunities"])
    ]
    day_wins = sum(
        float(candidate_days[key]["weighted_brier"])
        < float(baseline_days[key]["weighted_brier"])
        for key in qualified_days
    )
    day_win_fraction = day_wins / len(qualified_days) if qualified_days else 0.0
    support = {
        "minimum_rows": int(gate["minimum_supported_slice_rows"]),
        "minimum_opportunities": float(
            gate["minimum_supported_slice_opportunities"]
        ),
    }
    weeks = supported_pairs(
        candidate["slices"]["week"], baseline["slices"]["week"], **support
    )
    week_regressions = {
        key: relative_regression(
            float(left["weighted_brier"]), float(right["weighted_brier"])
        )
        for key, (left, right) in weeks.items()
    }
    bands = supported_pairs(
        candidate["slices"]["band"], baseline["slices"]["band"], **support
    )
    band_regressions = {
        key: relative_regression(
            float(left["weighted_brier"]), float(right["weighted_brier"])
        )
        for key, (left, right) in bands.items()
    }
    distances = supported_pairs(
        candidate["slices"]["distance"],
        baseline["slices"]["distance"],
        **support,
    )
    short_path = {}
    for key in gate["short_distance_bins"]:
        if key not in distances:
            continue
        left, right = distances[key]
        baseline_brier = float(right["weighted_brier"])
        delta = float(left["weighted_brier"]) - baseline_brier
        tolerance = max(
            float(gate["maximum_short_path_absolute_brier_regression"]),
            float(gate["maximum_short_path_relative_brier_regression"])
            * baseline_brier,
        )
        short_path[key] = {
            "delta": delta,
            "tolerance": tolerance,
            "passed": delta <= tolerance,
        }
    ece_delta = float(candidate["overall"]["expected_calibration_error"]) - float(
        baseline["overall"]["expected_calibration_error"]
    )
    high_confidence_delta = high_confidence_gap(candidate) - high_confidence_gap(
        baseline
    )
    phase3 = phase3_operational_gates(phase3_validation)
    gates = [
        {
            "id": "G1_integrity_and_scope",
            "passed": bool(integrity_audit.get("passed")) and not locked_2025_read,
            "integrity_passed": bool(integrity_audit.get("passed")),
            "locked_2025_read": locked_2025_read,
        },
        {
            "id": "G2_overall_performance",
            "passed": improvement
            >= float(gate["minimum_relative_brier_improvement_vs_b2"])
            and bootstrap["delta_upper_95"] < 0,
            "relative_improvement": improvement,
            "minimum_relative_improvement": float(
                gate["minimum_relative_brier_improvement_vs_b2"]
            ),
            "paired_day": bootstrap,
        },
        {
            "id": "G3_temporal_value",
            "passed": bool(qualified_days)
            and day_win_fraction
            >= float(gate["minimum_qualified_day_win_fraction"])
            and bool(weeks)
            and all(
                value <= float(gate["maximum_week_relative_brier_regression"])
                for value in week_regressions.values()
            ),
            "qualified_days": len(qualified_days),
            "day_wins": day_wins,
            "day_win_fraction": day_win_fraction,
            "minimum_day_win_fraction": float(
                gate["minimum_qualified_day_win_fraction"]
            ),
            "week_relative_regressions": week_regressions,
        },
        {
            "id": "G4_band_safety",
            "passed": bool(bands)
            and all(
                value <= float(gate["maximum_band_relative_brier_regression"])
                for value in band_regressions.values()
            ),
            "relative_regressions": band_regressions,
            "maximum_relative_regression": float(
                gate["maximum_band_relative_brier_regression"]
            ),
        },
        {
            "id": "G5_short_path_materiality",
            "passed": len(short_path) == len(gate["short_distance_bins"])
            and all(value["passed"] for value in short_path.values()),
            "bins": short_path,
        },
        {
            "id": "G6_calibration",
            "passed": ece_delta <= float(gate["maximum_ece_delta_vs_b2"])
            and high_confidence_delta
            <= float(gate["maximum_high_confidence_gap_delta_vs_b2"]),
            "ece_delta_vs_b2": ece_delta,
            "high_confidence_gap_delta_vs_b2": high_confidence_delta,
        },
        {"id": "G7_operational_fallback", "passed": phase3["operational"]},
        {"id": "G8_serving_parity", "passed": phase3["parity"]},
        {
            "id": "G9_privacy_and_provenance",
            "passed": phase3["privacy_and_provenance"],
        },
        {"id": "G10_efficiency", "passed": phase3["efficiency"]},
    ]
    return {
        "gates": gates,
        "passed": all(row["passed"] for row in gates),
        "failed_gates": [row["id"] for row in gates if not row["passed"]],
        "bootstrap": bootstrap,
    }


def decide_archive(
    metrics: dict[str, dict[str, Any]],
    phase3_validation: dict[str, Any],
    integrity_audit: dict[str, Any],
    config: dict[str, Any],
    *,
    prospective_read: bool,
) -> dict[str, Any]:
    candidate = metrics["candidate"]
    baseline = metrics["B2_frozen_v3"]
    gate = config["phase5"]
    improvement = relative_improvement(
        float(candidate["overall"]["weighted_brier"]),
        float(baseline["overall"]["weighted_brier"]),
    )
    bootstrap = paired_day_bootstrap(
        candidate["slices"]["day"],
        baseline["slices"]["day"],
        seed=int(config["seed"]) + 100,
        repetitions=int(gate["bootstrap_repetitions"]),
    )
    candidate_months = rows_by_key(candidate["slices"]["month"])
    baseline_months = rows_by_key(baseline["slices"]["month"])
    month_deltas = {
        key: float(candidate_months[key]["weighted_brier"])
        - float(baseline_months[key]["weighted_brier"])
        for key in sorted(candidate_months)
    }
    support = {
        "minimum_rows": int(gate["minimum_supported_slice_rows"]),
        "minimum_opportunities": float(
            gate["minimum_supported_slice_opportunities"]
        ),
    }
    bands = supported_pairs(
        candidate["slices"]["band"], baseline["slices"]["band"], **support
    )
    band_regressions = {
        key: relative_regression(
            float(left["weighted_brier"]), float(right["weighted_brier"])
        )
        for key, (left, right) in bands.items()
    }
    ece_delta = float(candidate["overall"]["expected_calibration_error"]) - float(
        baseline["overall"]["expected_calibration_error"]
    )
    high_confidence_delta = high_confidence_gap(candidate) - high_confidence_gap(
        baseline
    )
    phase3 = phase3_operational_gates(phase3_validation)
    gates = [
        {
            "id": "A1_integrity_and_scope",
            "passed": bool(integrity_audit.get("passed")) and not prospective_read,
        },
        {
            "id": "A2_aggregate_performance",
            "passed": improvement
            >= float(
                gate["minimum_aggregate_relative_brier_improvement_vs_b2"]
            )
            and bootstrap["delta_upper_95"] < 0,
            "relative_improvement": improvement,
            "paired_day": bootstrap,
        },
        {
            "id": "A3_month_transfer",
            "passed": len(month_deltas) == len(gate["locked_months"])
            and sum(value < 0 for value in month_deltas.values())
            >= int(gate["minimum_months_with_point_improvement"]),
            "month_deltas": month_deltas,
        },
        {
            "id": "A4_band_safety",
            "passed": bool(bands)
            and all(
                value <= float(gate["maximum_band_relative_brier_regression"])
                for value in band_regressions.values()
            ),
            "relative_regressions": band_regressions,
        },
        {
            "id": "A5_calibration",
            "passed": ece_delta <= float(gate["maximum_ece_delta_vs_b2"])
            and high_confidence_delta
            <= float(gate["maximum_high_confidence_gap_delta_vs_b2"]),
            "ece_delta_vs_b2": ece_delta,
            "high_confidence_gap_delta_vs_b2": high_confidence_delta,
        },
        {
            "id": "A6_operational_contract",
            "passed": all(phase3.values()),
            "phase3": phase3,
        },
    ]
    return {
        "gates": gates,
        "passed": all(row["passed"] for row in gates),
        "failed_gates": [row["id"] for row in gates if not row["passed"]],
        "bootstrap": bootstrap,
    }
