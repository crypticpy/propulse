#!/usr/bin/env python3
"""Validate V4.2 Phase 1 conditional A6/A7 result invariants."""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RUN_ID = "propagation_v4_2_phase1_5m"
RESULT = ROOT / "ml/results/propagation_v4_2" / RUN_ID
DEFAULT_INPUT = RESULT / "conditional_results.json"
DEFAULT_OUTPUT = RESULT / "conditional_validation.json"
EXPECTED_POLICIES = {"A6_recent_recency_blend", "A7_60m_specialist"}
EXPECTED_MONTHS = ["2024-10", "2024-11"]
EXPECTED_BASELINES = {"A4_recent_cycle", "A0_v3_control", "B2_frozen_v3"}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def close(left: float, right: float, tolerance: float = 1e-10) -> bool:
    return math.isclose(left, right, rel_tol=tolerance, abs_tol=tolerance)


def metric_reconciles(metric: dict[str, Any]) -> bool:
    overall = metric["overall"]
    months = metric["slices"]["month"]
    opportunities = sum(float(row["opportunities"]) for row in months)
    brier = sum(
        float(row["weighted_brier"]) * float(row["opportunities"])
        for row in months
    ) / opportunities
    return (
        sum(int(row["rows"]) for row in months) == int(overall["rows"])
        and close(opportunities, float(overall["opportunities"]))
        and close(brier, float(overall["weighted_brier"]))
    )


def validate(result: dict[str, Any]) -> dict[str, bool]:
    inputs = result["evaluation_inputs"]
    artifacts = result["candidate_artifacts"]
    selection = result["policy_selection"]
    metrics = result["metrics"]
    comparisons = result["comparisons"]
    blend = selection["A6_recent_recency_blend"]
    router = selection["A7_60m_specialist"]
    best_grid = min(
        blend["grid"],
        key=lambda row: (row["weighted_brier"], -row["left_weight"]),
    )
    expected_advance = [
        name
        for name in ("A6_recent_recency_blend", "A7_60m_specialist")
        if all(
            value < 0
            for value in comparisons[name]["A4_recent_cycle"][
                "month_deltas"
            ].values()
        )
        and comparisons[name]["A4_recent_cycle"]["paired_day_bootstrap"][
            "upper_95"
        ]
        < 0
    ]
    intervals = [
        value["paired_day_bootstrap"]
        for policy in comparisons.values()
        for value in policy.values()
    ]
    return {
        "scope_is_conditional_followup": result["scope"]
        == "observed_2024_phase1_conditional_followup",
        "exact_evaluation_months": result["evaluation_months"] == EXPECTED_MONTHS,
        "december_closed": result["december_2024_read"] is False,
        "locked_2025_closed": result["locked_2025_read"] is False,
        "input_inventory_exact": set(inputs) == set(EXPECTED_MONTHS),
        "all_input_hashes_verified": all(
            item["sha256_verified_this_run"] for item in inputs.values()
        ),
        "row_total_matches_inputs": int(result["rows"])
        == sum(int(item["rows"]) for item in inputs.values()),
        "artifact_inventory_exact": set(artifacts)
        == {"A1_v3_plus_availability", "A4_recent_cycle", "A5_recency_weighted"},
        "all_artifact_hashes_verified": all(
            item["sha256_verified_this_run"]
            for values in artifacts.values()
            for item in values.values()
        ),
        "selection_uses_august": selection["month"] == "2024-08",
        "selection_days_frozen": selection["calibrator_fit_days"] == [1, 20]
        and selection["policy_selection_days"] == [21, 31],
        "calibration_hash_verified": selection["calibration_sample"][
            "sha256_verified_this_run"
        ],
        "blend_grid_selection_reproduces": close(
            float(blend["selected_left_weight"]), float(best_grid["left_weight"])
        )
        and close(float(blend["selected_brier"]), float(best_grid["weighted_brier"])),
        "router_inventory_valid": set(router["routed_bands"])
        <= set(router["eligible_bands"]),
        "router_rules_reproduce": all(
            row["qualifies"]
            == (
                float(row["opportunities"])
                >= float(router["minimum_selection_opportunities"])
                and float(row["specialist_minus_default_brier"]) < 0
            )
            for row in router["comparison"]
        ),
        "policy_inventory_exact": set(metrics) == EXPECTED_POLICIES,
        "metric_totals_reconcile": all(
            metric_reconciles(metric) for metric in metrics.values()
        ),
        "comparison_inventory_exact": set(comparisons) == EXPECTED_POLICIES
        and all(set(value) == EXPECTED_BASELINES for value in comparisons.values()),
        "comparison_months_exact": all(
            set(value["month_deltas"]) == set(EXPECTED_MONTHS)
            for policy in comparisons.values()
            for value in policy.values()
        ),
        "bootstrap_intervals_ordered": all(
            math.isfinite(float(interval["lower_95"]))
            and float(interval["lower_95"]) <= float(interval["median"])
            <= float(interval["upper_95"])
            and math.isfinite(float(interval["upper_95"]))
            for interval in intervals
        ),
        "advancement_rule_reproduces": result["advance_conditional_policy"]
        == expected_advance,
        "memory_within_m5_budget": result["compute"]["memory_limit_respected"]
        and float(result["compute"]["peak_rss_gb"])
        <= float(result["compute"]["maximum_rss_gb"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    input_path = Path(args.input).resolve()
    checks = validate(read_json(input_path))
    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_id": RUN_ID,
        "input": input_path.relative_to(ROOT).as_posix(),
        "checks": checks,
        "passed": all(checks.values()),
    }
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    if not payload["passed"]:
        failed = [name for name, passed in checks.items() if not passed]
        raise RuntimeError(f"conditional validation failed: {failed}")
    print(output_path)


if __name__ == "__main__":
    main()
