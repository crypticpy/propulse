#!/usr/bin/env python3
"""Audit V4.1 development sources, exposure reconstruction, and feature timing."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import duckdb

from protocol import ROOT, artifact, atomic_write_json, load_json, sha256, utc_now


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_1.json"
DEFAULT_OUTPUT = (
    ROOT / "ml/results/propagation_v4_1/preregistration/development_data_audit.json"
)


def part_inventory(directory: Path) -> list[dict[str, Any]]:
    parts = sorted(directory.glob("part-*.parquet"))
    if not parts:
        raise FileNotFoundError(f"no feature parts in {directory}")
    return [
        {
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in parts
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile

    config = load_json(Path(args.config))
    months = config["data_roles"]["new_calibration_sources"]
    run_id = config["run_id"]
    dataset = (
        ROOT
        / "ml/data/processed/archive_v4_1"
        / f"dataset_{run_id}_hf.parquet"
    )
    source_manifest = ROOT / "ml/data/manifests" / f"{run_id}_sources.json"
    bronze_manifest = ROOT / "ml/data/manifests" / f"{run_id}_bronze.json"
    opportunity_manifest = (
        ROOT / "ml/data/manifests" / f"{run_id}_hf_opportunities.json"
    )
    for path in (dataset, source_manifest, bronze_manifest, opportunity_manifest):
        if not path.exists():
            raise FileNotFoundError(path)

    source = str(dataset / "part-*.parquet")
    connection = duckdb.connect()
    connection.execute("SET TimeZone='UTC'")
    connection.execute(
        f"SET threads={int(config['compute']['duckdb_threads'])}"
    )
    connection.execute(
        f"SET memory_limit='{config['compute']['duckdb_memory_limit']}'"
    )
    aggregate = connection.execute(
        f"""
        SELECT count(*) AS rows,
               count(*) FILTER (split <> 'validation' OR split IS NULL) AS bad_splits,
               count(*) FILTER (strftime(target_hour, '%Y-%m') NOT IN
                 ({','.join(repr(month) for month in months)})) AS forbidden_month_rows,
               count(*) FILTER (opportunities <= 0 OR opportunities IS NULL) AS bad_weights,
               count(*) FILTER (success_rate < 0 OR success_rate > 1
                                 OR success_rate IS NULL) AS bad_targets,
               count(*) FILTER (weather_available_at > target_hour) AS future_weather_rows,
               count(*) FILTER (target_hour IS NULL) AS null_target_hours,
               min(target_hour), max(target_hour),
               sum(opportunities), sum(successes)
        FROM read_parquet('{source}')
        """
    ).fetchone()
    per_month = connection.execute(
        f"""
        SELECT strftime(target_hour, '%Y-%m') AS month,
               count(*) AS rows,
               sum(opportunities) AS opportunities,
               sum(successes) AS successes,
               sum(successes) / sum(opportunities) AS prevalence,
               count(*) FILTER (weather_available_at > target_hour) AS future_weather_rows
        FROM read_parquet('{source}')
        GROUP BY 1 ORDER BY 1
        """
    ).fetchall()
    connection.close()

    opportunities = load_json(opportunity_manifest)
    opportunity_months = opportunities.get("months", [])
    sources = load_json(source_manifest)
    bronze = load_json(bronze_manifest)
    tolerance = config["gates"]["maximum_exposure_weight_error_fraction"]
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, detail: Any) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    check("dataset nonempty", aggregate[0] > 0, aggregate[0])
    check("validation split only", aggregate[1] == 0, aggregate[1])
    check("assigned months only", aggregate[2] == 0, aggregate[2])
    check("positive opportunity weights", aggregate[3] == 0, aggregate[3])
    check("target bounds", aggregate[4] == 0, aggregate[4])
    check("no future weather availability", aggregate[5] == 0, aggregate[5])
    check("target hours present", aggregate[6] == 0, aggregate[6])
    check(
        "feature month coverage",
        [row[0] for row in per_month] == months,
        [row[0] for row in per_month],
    )
    check(
        "opportunity month coverage",
        [row["month"] for row in opportunity_months] == months,
        [row["month"] for row in opportunity_months],
    )
    check("source manifest entries", len(sources.get("sources", [])) == 7,
          len(sources.get("sources", [])))
    check("bronze month coverage", len(bronze.get("months", [])) == 3,
          len(bronze.get("months", [])))
    for row in opportunity_months:
        error = abs(float(row["sampling_weight_relative_error"]))
        check(
            f"exposure reconstruction {row['month']}",
            error < tolerance,
            error,
        )
    failed = [row for row in checks if not row["passed"]]
    output = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": run_id,
        "scope": "calibration_development",
        "months": months,
        "november_gate_read": False,
        "locked_archive_test_read": False,
        "dataset": dataset.relative_to(ROOT).as_posix(),
        "feature_parts": part_inventory(dataset),
        "source_manifest": artifact(source_manifest),
        "bronze_manifest": artifact(bronze_manifest),
        "opportunity_manifest": artifact(opportunity_manifest),
        "rows": aggregate[0],
        "time_range": [aggregate[7].isoformat(), aggregate[8].isoformat()],
        "weighted_opportunities": aggregate[9],
        "weighted_successes": aggregate[10],
        "per_month": [
            {
                "month": row[0],
                "rows": row[1],
                "opportunities": row[2],
                "successes": row[3],
                "prevalence": row[4],
                "future_weather_rows": row[5],
            }
            for row in per_month
        ],
        "summary": {"checks": len(checks), "failures": len(failed)},
        "checks": checks,
        "passed": not failed,
    }
    atomic_write_json(Path(args.output), output)
    print(f"{len(checks)} checks, {len(failed)} failures: {args.output}")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
