"""Frozen V4.1 gate-decision calculations over additive daily aggregates."""

from __future__ import annotations

from typing import Any

import numpy as np


SIMPLER_CALIBRATORS = (
    "C0_identity",
    "C1_global_isotonic",
    "C2_per_band_isotonic",
    "C3_hierarchical_isotonic",
)
PRIMARY = "C4_guarded_hierarchical_isotonic"


def day_bootstrap(
    daily: list[dict[str, Any]],
    left: str,
    right: str,
    *,
    seed: int,
    repetitions: int,
) -> dict[str, float]:
    days = sorted({str(row["day"]) for row in daily})
    candidates = sorted({str(row["candidate"]) for row in daily})
    if left not in candidates or right not in candidates or len(days) < 2:
        raise ValueError("paired day bootstrap lacks candidates or UTC days")
    lookup = {
        (str(row["day"]), str(row["candidate"])): row
        for row in daily
    }
    matrix = np.asarray(
        [
            [
                float(lookup[(day, left)]["weighted_opportunities"]),
                float(lookup[(day, left)]["weighted_squared_error"]),
                float(lookup[(day, right)]["weighted_squared_error"]),
            ]
            for day in days
        ],
        dtype=np.float64,
    )
    rng = np.random.default_rng(seed)
    delta = np.empty(repetitions, dtype=np.float64)
    skill = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sample = matrix[rng.integers(0, len(matrix), len(matrix))].sum(axis=0)
        left_brier = sample[1] / sample[0]
        right_brier = sample[2] / sample[0]
        delta[index] = left_brier - right_brier
        skill[index] = 1 - left_brier / right_brier
    return {
        "left": left,
        "right": right,
        "delta_lower_95": float(np.quantile(delta, 0.025)),
        "delta_median": float(np.quantile(delta, 0.5)),
        "delta_upper_95": float(np.quantile(delta, 0.975)),
        "skill_lower_95": float(np.quantile(skill, 0.025)),
        "skill_median": float(np.quantile(skill, 0.5)),
        "skill_upper_95": float(np.quantile(skill, 0.975)),
    }


def high_confidence_gap(metric: dict[str, Any]) -> float:
    bins = [
        row
        for row in metric.get("calibration_bins", [])
        if float(row["lower"]) >= 0.5
    ]
    if not bins:
        return 0.0
    return max(
        abs(float(row["mean_prediction"]) - float(row["observed_rate"]))
        for row in bins
    )


def relative_improvement(candidate: float, baseline: float) -> float:
    if baseline <= 0:
        raise ValueError("relative Brier comparison requires a positive baseline")
    return 1 - candidate / baseline


def decide_gates(
    metrics: dict[str, dict[str, Any]],
    daily: list[dict[str, Any]],
    config: dict[str, Any],
    *,
    integrity_passed: bool,
    fallback_passed: bool,
    serving_parity_passed: bool,
) -> dict[str, Any]:
    required = {
        "B0_climatology",
        "M1_physics",
        "B2_frozen_v3",
        "M2_raw",
        *SIMPLER_CALIBRATORS,
        PRIMARY,
    }
    missing = sorted(required - set(metrics))
    if missing:
        raise ValueError(f"gate metrics are missing candidates: {missing}")
    repetitions = int(config["calibration"]["bootstrap_repetitions"])
    seed = int(config["seed"])
    bootstrap = {
        "m2_vs_b0": day_bootstrap(
            daily, PRIMARY, "B0_climatology", seed=seed, repetitions=repetitions
        ),
        "m2_vs_m1": day_bootstrap(
            daily, PRIMARY, "M1_physics", seed=seed + 1, repetitions=repetitions
        ),
        "m2_vs_b2": day_bootstrap(
            daily, PRIMARY, "B2_frozen_v3", seed=seed + 2, repetitions=repetitions
        ),
        "calibrated_vs_raw": day_bootstrap(
            daily, PRIMARY, "M2_raw", seed=seed + 3, repetitions=repetitions
        ),
    }
    gate_config = config["gates"]
    primary = metrics[PRIMARY]
    raw = metrics["M2_raw"]
    b2 = metrics["B2_frozen_v3"]
    short_primary = primary["slices"]["audit_distance"]["under-3000km"]
    short_b2 = b2["slices"]["audit_distance"]["under-3000km"]

    short_labels = ("0-500km", "500-1500km", "1500-3000km")
    short_deltas = {
        label: (
            primary["slices"]["audit_distance"][label]["weighted_brier"]
            - raw["slices"]["audit_distance"][label]["weighted_brier"]
        )
        for label in short_labels
    }
    band_regressions: dict[str, float] = {}
    for band, primary_band in primary["slices"]["band"].items():
        eligible = [
            metrics[name]["slices"]["band"][band]["weighted_brier"]
            for name in SIMPLER_CALIBRATORS
            if band in metrics[name]["slices"]["band"]
        ]
        best = min(eligible)
        band_regressions[band] = (
            float(primary_band["weighted_brier"]) / float(best) - 1
        )

    ece_delta = float(primary["expected_calibration_error"] - raw["expected_calibration_error"])
    high_confidence_regression = high_confidence_gap(primary) - high_confidence_gap(raw)
    gates = [
        {"id": "G1_integrity", "passed": bool(integrity_passed), "value": bool(integrity_passed)},
        {
            "id": "G2_overall_skill_vs_b0",
            "passed": bootstrap["m2_vs_b0"]["skill_lower_95"] > float(gate_config["minimum_overall_brier_skill"]),
            "value": bootstrap["m2_vs_b0"]["skill_lower_95"],
            "threshold": float(gate_config["minimum_overall_brier_skill"]),
        },
        {
            "id": "G3_history_value_vs_m1",
            "passed": bootstrap["m2_vs_m1"]["delta_upper_95"] <= float(gate_config["history_delta_bootstrap_upper_bound"]),
            "value": bootstrap["m2_vs_m1"]["delta_upper_95"],
            "threshold": float(gate_config["history_delta_bootstrap_upper_bound"]),
        },
        {
            "id": "G4_frozen_v3",
            "passed": (
                primary["weighted_brier"] < b2["weighted_brier"]
                and relative_improvement(short_primary["weighted_brier"], short_b2["weighted_brier"])
                >= float(gate_config["minimum_short_path_relative_brier_improvement_over_v3"])
            ),
            "overall_m2_minus_b2": float(primary["weighted_brier"] - b2["weighted_brier"]),
            "short_path_relative_improvement": relative_improvement(short_primary["weighted_brier"], short_b2["weighted_brier"]),
            "threshold": float(gate_config["minimum_short_path_relative_brier_improvement_over_v3"]),
        },
        {
            "id": "G5_calibration_overall",
            "passed": primary["weighted_brier"] - raw["weighted_brier"] <= float(gate_config["maximum_calibrated_minus_raw_brier"]),
            "value": float(primary["weighted_brier"] - raw["weighted_brier"]),
            "threshold": float(gate_config["maximum_calibrated_minus_raw_brier"]),
        },
        {
            "id": "G6_short_path_calibration",
            "passed": all(value <= float(gate_config["maximum_calibrated_minus_raw_brier"]) for value in short_deltas.values()),
            "values": short_deltas,
            "threshold": float(gate_config["maximum_calibrated_minus_raw_brier"]),
        },
        {
            "id": "G7_band_safety",
            "passed": all(value <= float(gate_config["maximum_band_relative_brier_regression"]) for value in band_regressions.values()),
            "values": band_regressions,
            "threshold": float(gate_config["maximum_band_relative_brier_regression"]),
        },
        {
            "id": "G8_reliability",
            "passed": (
                ece_delta <= float(gate_config["maximum_ece_delta_vs_raw"])
                and high_confidence_regression <= float(gate_config["maximum_ece_delta_vs_raw"])
            ),
            "ece_delta": ece_delta,
            "high_confidence_max_gap_delta": high_confidence_regression,
            "threshold": float(gate_config["maximum_ece_delta_vs_raw"]),
        },
        {"id": "G9_operational_fallback", "passed": bool(fallback_passed), "value": bool(fallback_passed)},
        {"id": "G10_serving_parity", "passed": bool(serving_parity_passed), "value": bool(serving_parity_passed)},
    ]
    return {
        "bootstrap": bootstrap,
        "gates": gates,
        "passed": all(row["passed"] for row in gates),
        "failed_gates": [row["id"] for row in gates if not row["passed"]],
    }
