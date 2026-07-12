"""Validate V3 source, dataset, split, model, metric, and release invariants."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import polars as pl

from common import (
    MANIFESTS,
    PROCESSED,
    RESULTS,
    load_config,
    relative,
    utc_now,
    write_json,
)


class Checks:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []

    def add(self, name: str, passed: bool, detail: str) -> None:
        self.rows.append({"name": name, "passed": bool(passed), "detail": detail})


def finite_metrics(value: Any, prefix: str = "") -> list[str]:
    failures = []
    if isinstance(value, dict):
        for key, child in value.items():
            failures.extend(finite_metrics(child, f"{prefix}.{key}" if prefix else key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            failures.extend(finite_metrics(child, f"{prefix}[{index}]"))
    elif isinstance(value, float) and not math.isfinite(value):
        failures.append(prefix)
    return failures


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--task", choices=("hf", "6m"), required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    checks = Checks()
    bronze_manifest = MANIFESTS / f"{config['run_id']}_bronze.json"
    source_manifest = MANIFESTS / f"{config['run_id']}_sources.json"
    opportunity_manifest = MANIFESTS / f"{config['run_id']}_{args.task}_opportunities.json"
    dataset = PROCESSED / f"dataset_{config['run_id']}_{args.task}.parquet"
    results_path = RESULTS / config["run_id"] / f"{args.task}_results.json"
    for name, path in {
        "bronze manifest": bronze_manifest,
        "source manifest": source_manifest,
        "opportunity manifest": opportunity_manifest,
        "dataset": dataset,
        "results": results_path,
    }.items():
        checks.add(f"exists: {name}", path.exists(), relative(path))
    if not all(path.exists() for path in (bronze_manifest, source_manifest, opportunity_manifest, dataset, results_path)):
        output = RESULTS / config["run_id"] / f"{args.task}_validation.json"
        write_json(output, {"generated_at": utc_now(), "checks": checks.rows})
        raise SystemExit(1)

    bronze = json.loads(bronze_manifest.read_text())
    sources = json.loads(source_manifest.read_text())
    opportunities = json.loads(opportunity_manifest.read_text())
    results = json.loads(results_path.read_text())
    checks.add(
        "bronze month coverage",
        {row["month"] for row in bronze["months"]} == set(config["months"]),
        f"manifest={len(bronze['months'])} expected={len(config['months'])}",
    )
    expected_source_count = len(config["months"]) * 2 + len(
        {month[:4] for month in config["months"]}
    )
    checks.add(
        "source registry coverage",
        len(sources.get("sources", [])) == expected_source_count,
        f"manifest={len(sources.get('sources', []))} expected={expected_source_count}",
    )
    checks.add(
        "source registry checksums",
        all(len(row.get("sha256", "")) == 64 for row in sources.get("sources", [])),
        "all source checksums must be SHA-256",
    )
    for row in bronze["months"]:
        checks.add(
            f"bronze unique rows {row['month']}",
            row["rows"] == row["unique_rows"],
            f"rows={row['rows']} unique={row['unique_rows']}",
        )
        checks.add(
            f"bronze checksum {row['month']}",
            len(row["source_sha256"]) == 64,
            row["source_sha256"],
        )
    checks.add(
        "opportunity month coverage",
        {row["month"] for row in opportunities["months"]} == set(config["months"]),
        f"manifest={len(opportunities['months'])} expected={len(config['months'])}",
    )
    for row in opportunities["months"]:
        checks.add(
            f"positive opportunity weights {row['month']}",
            row["weighted_opportunities"] > 0 and 0 <= row["weighted_prevalence"] <= 1,
            f"weight={row['weighted_opportunities']} prevalence={row['weighted_prevalence']}",
        )
        checks.add(
            f"sample includes positives {row['month']}",
            row["positive_rows"] > 0 if args.task == "hf" else row["positive_rows"] >= 0,
            f"positive_rows={row['positive_rows']}",
        )
        checks.add(
            f"inverse-weight exposure audit {row['month']}",
            abs(row["sampling_weight_relative_error"]) < 0.03,
            f"relative_error={row['sampling_weight_relative_error']:.6f}",
        )

    scan = pl.scan_parquet(dataset)
    schema = scan.collect_schema()
    required = {
        "target_hour",
        "band",
        "tx_grid4",
        "rx_grid4",
        "success_rate",
        "opportunities",
        "split",
        "dist_km",
        "sun_elev_tx",
        "kp",
        "path_success_prev1",
    }
    checks.add("dataset required columns", required <= set(schema.names()), str(required - set(schema.names())))
    aggregate = scan.select(
        pl.len().alias("rows"),
        pl.col("opportunities").min().alias("min_weight"),
        pl.col("success_rate").min().alias("min_target"),
        pl.col("success_rate").max().alias("max_target"),
        pl.col("target_hour").min().alias("min_time"),
        pl.col("target_hour").max().alias("max_time"),
    ).collect().row(0, named=True)
    checks.add("dataset nonempty", aggregate["rows"] > 0, str(aggregate["rows"]))
    checks.add("strict positive sample weights", aggregate["min_weight"] > 0, str(aggregate["min_weight"]))
    checks.add(
        "fractional target bounds",
        aggregate["min_target"] >= 0 and aggregate["max_target"] <= 1,
        f"[{aggregate['min_target']}, {aggregate['max_target']}]",
    )
    split_rows = scan.group_by("split").agg(pl.len().alias("rows")).collect()
    split_map = dict(zip(split_rows["split"].to_list(), split_rows["rows"].to_list()))
    for split in ("train", "validation", "test"):
        checks.add(f"split nonempty: {split}", split_map.get(split, 0) > 0, str(split_map.get(split, 0)))
    overlap = (
        scan.select("target_hour", "split")
        .unique()
        .group_by("target_hour")
        .agg(pl.col("split").n_unique().alias("n"))
        .filter(pl.col("n") > 1)
        .select(pl.len())
        .collect()
        .item()
    )
    checks.add("no hour split overlap", overlap == 0, str(overlap))
    checks.add("result run id", results.get("run_id") == config["run_id"], str(results.get("run_id")))
    checks.add("result task", results.get("task") == args.task, str(results.get("task")))
    failures = finite_metrics(results)
    checks.add("all numeric metrics finite", not failures, ", ".join(failures[:10]))
    for profile in ("physics", "nowcast"):
        profile_result = results.get("profiles", {}).get(profile, {})
        if "skipped" in profile_result:
            checks.add(f"{profile} explicitly skipped", args.task == "6m", profile_result["skipped"])
            continue
        checks.add(f"{profile} test metrics", "test_calibrated" in profile_result, str(profile_result.keys()))
        checks.add(
            f"{profile} probability bounds",
            0 <= profile_result["test_calibrated"]["mean_prediction"] <= 1,
            str(profile_result["test_calibrated"]["mean_prediction"]),
        )
        checks.add(
            f"{profile} calibration bins",
            len(profile_result.get("calibration_bins", [])) >= 3,
            str(len(profile_result.get("calibration_bins", []))),
        )
    if len(config["months"]) >= 8 and args.task == "hf":
        rolling_path = RESULTS / config["run_id"] / "hf_rolling_results.json"
        checks.add(
            "rolling evaluation exists", rolling_path.exists(), relative(rolling_path)
        )
        if rolling_path.exists():
            rolling = json.loads(rolling_path.read_text())
            checks.add(
                "rolling fold coverage",
                len(rolling.get("folds", [])) >= 2,
                str(len(rolling.get("folds", []))),
            )
            for fold in rolling.get("folds", []):
                nowcast = fold.get("profiles", {}).get("nowcast", {})
                interval = nowcast.get("day_block", {}).get("bootstrap_95_ci", [0, 0])
                checks.add(
                    f"rolling nowcast stability: {fold.get('name')}",
                    nowcast.get("brier_skill", 0) > 0 and interval[-1] < 0,
                    f"skill={nowcast.get('brier_skill')} ci={interval}",
                )
    output = RESULTS / config["run_id"] / f"{args.task}_validation.json"
    failed = [row for row in checks.rows if not row["passed"]]
    write_json(
        output,
        {
            "generated_at": utc_now(),
            "run_id": config["run_id"],
            "task": args.task,
            "summary": {"checks": len(checks.rows), "failures": len(failed)},
            "checks": checks.rows,
        },
    )
    print(f"{len(checks.rows)} checks, {len(failed)} failures")
    for row in failed:
        print(f"FAIL {row['name']}: {row['detail']}")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
