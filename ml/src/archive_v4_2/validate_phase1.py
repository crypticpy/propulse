#!/usr/bin/env python3
"""Validate structural and numerical invariants in the V4.2 Phase 1 result."""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE))

from phase1_core import EXPECTED_CANDIDATES, select_advancement  # noqa: E402


RUN_ID = "propagation_v4_2_phase1_5m"
RESULT = ROOT / "ml/results/propagation_v4_2" / RUN_ID
DEFAULT_INPUT = RESULT / "evaluation_results.json"
DEFAULT_OUTPUT = RESULT / "evaluation_validation.json"
EXPECTED_MONTHS = ["2024-10", "2024-11"]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def close(left: float, right: float, tolerance: float = 1e-10) -> bool:
    return math.isclose(left, right, rel_tol=tolerance, abs_tol=tolerance)


def metric_reconciles(metric: dict[str, Any]) -> bool:
    overall = metric["overall"]
    months = metric["slices"]["month"]
    opportunities = sum(float(row["opportunities"]) for row in months)
    if opportunities <= 0:
        return False
    candidate_brier = sum(
        float(row["candidate_brier"]) * float(row["opportunities"])
        for row in months
    ) / opportunities
    b2_brier = sum(
        float(row["b2_brier"]) * float(row["opportunities"])
        for row in months
    ) / opportunities
    return all(
        (
            sum(int(row["rows"]) for row in months) == int(overall["rows"]),
            close(opportunities, float(overall["opportunities"])),
            close(candidate_brier, float(overall["candidate_brier"])),
            close(b2_brier, float(overall["b2_brier"])),
            close(
                float(overall["candidate_minus_b2_brier"]),
                float(overall["candidate_brier"]) - float(overall["b2_brier"]),
            ),
        )
    )


def validate(result: dict[str, Any]) -> dict[str, bool]:
    expected_variants = {
        f"{candidate}:{kind}"
        for candidate in EXPECTED_CANDIDATES
        for kind in ("raw", "calibrated")
    }
    metrics = result["metrics"]
    inputs = result["evaluation_inputs"]
    artifacts = result["candidate_artifacts"]
    selection_rows = result["selection"]["rows"]
    intervals = result["bootstrap_candidate_minus_a0"]
    pairwise = result["pairwise_calibrated_residual_diagnostics"]
    expected_pairs = len(EXPECTED_CANDIDATES) * (len(EXPECTED_CANDIDATES) - 1) // 2
    expected_rows = sum(int(item["rows"]) for item in inputs.values())
    reference = metrics["A0_v3_control:calibrated"]["overall"]
    month_keys = {
        variant: {row["key"] for row in value["slices"]["month"]}
        for variant, value in metrics.items()
    }
    finite_metrics = all(
        math.isfinite(float(value["overall"][field]))
        for value in metrics.values()
        for field in (
            "opportunities",
            "b2_brier",
            "candidate_brier",
            "candidate_minus_b2_brier",
        )
    )
    expected_advancement = select_advancement(selection_rows, maximum=3)
    return {
        "scope_is_phase1_evaluation": result["scope"] == "observed_2024_phase1_evaluation",
        "exact_evaluation_months": result["evaluation_months"] == EXPECTED_MONTHS,
        "december_closed": result["december_2024_read"] is False,
        "locked_2025_closed": result["locked_2025_read"] is False,
        "input_inventory_exact": set(inputs) == set(EXPECTED_MONTHS),
        "all_input_hashes_verified": all(
            item["sha256_verified_this_run"] for item in inputs.values()
        ),
        "artifact_inventory_exact": set(artifacts) == set(EXPECTED_CANDIDATES)
        and all(set(items) == {"model", "calibrator"} for items in artifacts.values()),
        "all_artifact_hashes_verified": all(
            item["sha256_verified_this_run"]
            for items in artifacts.values()
            for item in items.values()
        ),
        "row_total_matches_inputs": int(result["rows"]) == expected_rows,
        "variant_inventory_exact": set(metrics) == expected_variants,
        "month_slices_exact": all(
            keys == set(EXPECTED_MONTHS) for keys in month_keys.values()
        ),
        "all_metric_totals_reconcile": all(
            metric_reconciles(value) for value in metrics.values()
        ),
        "common_evaluation_mass": all(
            int(value["overall"]["rows"]) == int(reference["rows"])
            and close(
                float(value["overall"]["opportunities"]),
                float(reference["opportunities"]),
            )
            and close(
                float(value["overall"]["b2_brier"]),
                float(reference["b2_brier"]),
            )
            for value in metrics.values()
        ),
        "all_metrics_finite": finite_metrics,
        "brier_values_bounded": all(
            0 <= float(value["overall"][field]) <= 1
            for value in metrics.values()
            for field in ("b2_brier", "candidate_brier")
        ),
        "selection_inventory_exact": {
            row["candidate"] for row in selection_rows
        } == set(EXPECTED_CANDIDATES),
        "bootstrap_inventory_exact": set(intervals) == set(EXPECTED_CANDIDATES),
        "bootstrap_intervals_ordered": all(
            math.isfinite(float(interval["lower_95"]))
            and float(interval["lower_95"]) <= float(interval["median"])
            <= float(interval["upper_95"])
            and math.isfinite(float(interval["upper_95"]))
            for interval in intervals.values()
        ),
        "pairwise_inventory_exact": len(pairwise) == expected_pairs,
        "pairwise_months_exact": all(
            set(item["months"]) == set(EXPECTED_MONTHS) for item in pairwise.values()
        ),
        "pairwise_diagnostics_valid": all(
            0 <= float(scope["optimal_left_weight"]) <= 1
            and math.isfinite(float(scope["residual_correlation"]))
            and -1.0000001 <= float(scope["residual_correlation"]) <= 1.0000001
            and float(scope["improvement_vs_better_component"]) >= -1e-12
            for item in pairwise.values()
            for scope in [item["overall"], *item["months"].values()]
        ),
        "advancement_rule_reproduces": result["selection"]["advance_to_20m"]
        == expected_advancement,
        "maximum_three_advance": len(result["selection"]["advance_to_20m"]) <= 3,
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
        raise RuntimeError(f"Phase 1 validation failed: {failed}")
    print(output_path)


if __name__ == "__main__":
    main()
