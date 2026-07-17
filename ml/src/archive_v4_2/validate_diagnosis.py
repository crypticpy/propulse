#!/usr/bin/env python3
"""Validate structural and numerical invariants in the V4.2 Phase 0 result."""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RUN_ID = "propagation_v4_2_performance_recovery"
RESULT = ROOT / "ml/results/propagation_v4_2" / RUN_ID
DEFAULT_INPUT = RESULT / "diagnosis.json"
DEFAULT_OUTPUT = RESULT / "diagnosis_validation.json"
EXPECTED_MONTHS = ["2024-02", "2024-04", "2024-05", "2024-08", "2024-10", "2024-11"]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def close(left: float, right: float, tolerance: float = 1e-10) -> bool:
    return math.isclose(left, right, rel_tol=tolerance, abs_tol=tolerance)


def validate(result: dict[str, Any]) -> dict[str, bool]:
    access = result["outcome_access"]
    months = access["observed_months"]
    month_rows = {row["key"]: row for row in result["slices"]["month"]}
    total_rows = sum(int(item["rows"]) for item in result["inputs"].values())
    total_opportunities = sum(float(row["opportunities"]) for row in month_rows.values())
    combined_b2 = sum(
        float(row["b2_brier"]) * float(row["opportunities"])
        for row in month_rows.values()
    ) / total_opportunities
    combined_m2 = sum(
        float(row["m2_brier"]) * float(row["opportunities"])
        for row in month_rows.values()
    ) / total_opportunities
    all_observed = result["overall"]["all_observed"]
    intervals = list(result["bootstrap"].values())
    band_choices = result["routers"]["band"]["choices"]
    stable_choices = result["routers"]["stable_band_distance"]["choices"]
    expected_bands = {row["key"] for row in result["slices"]["band"]}
    return {
        "scope_is_observed_diagnosis": result["scope"] == "observed_2024_paired_diagnosis",
        "exact_months": months == EXPECTED_MONTHS,
        "december_closed": access["december_2024_read"] is False,
        "locked_2025_closed": access["locked_2025_read"] is False,
        "all_input_hashes_verified": all(
            item["sha256_verified_this_run"] for item in result["inputs"].values()
        ),
        "input_inventory_exact": set(result["inputs"]) == set(EXPECTED_MONTHS),
        "month_slices_exact": set(month_rows) == set(EXPECTED_MONTHS),
        "row_totals_reconcile": sum(int(row["rows"]) for row in month_rows.values()) == total_rows,
        "opportunity_totals_reconcile": close(
            float(all_observed["opportunities"]), total_opportunities
        ),
        "b2_brier_reconciles": close(float(all_observed["b2_brier"]), combined_b2),
        "m2_brier_reconciles": close(float(all_observed["m2_brier"]), combined_m2),
        "blend_weight_bounded": 0.0 <= float(
            result["blend_selection"]["rounded_b2_weight"]
        ) <= 1.0,
        "band_router_complete": set(band_choices) == expected_bands,
        "band_router_values_valid": set(band_choices.values()) <= {"b2", "m2"},
        "stable_router_values_valid": set(stable_choices.values()) <= {"b2", "m2"},
        "bootstrap_intervals_ordered": all(
            math.isfinite(float(interval["lower_95"]))
            and float(interval["lower_95"]) <= float(interval["median"])
            <= float(interval["upper_95"])
            and math.isfinite(float(interval["upper_95"]))
            for interval in intervals
        ),
        "memory_within_m5_budget": float(result["compute"]["maximum_rss_gb"]) < 96.0,
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
        raise RuntimeError(f"diagnosis validation failed: {failed}")
    print(output_path)


if __name__ == "__main__":
    main()
