#!/usr/bin/env python3
"""Audit the V4 development dataset without reading a locked-test outcome."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import duckdb


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
sys.path.insert(0, str(V3))
from common import (  # noqa: E402
    MANIFESTS,
    PROCESSED,
    configure_duckdb,
    load_config,
    relative,
    sha256,
    utc_now,
    write_json,
)


def duckdb_parquet_source(path: Path) -> str:
    return str(path / "*.parquet") if path.is_dir() else str(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--task", choices=("hf", "6m"), required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    if config.get("execution_scope") != "development":
        raise RuntimeError("development audit requires the development scoped config")
    dataset = PROCESSED / f"dataset_{config['run_id']}_{args.task}.parquet"
    opportunity_manifest = (
        MANIFESTS / f"{config['run_id']}_{args.task}_opportunities.json"
    )
    if not dataset.exists() or not opportunity_manifest.exists():
        raise FileNotFoundError(dataset if not dataset.exists() else opportunity_manifest)
    con = duckdb.connect()
    configure_duckdb(con, config, f"audit-development-{args.task}")
    source = duckdb_parquet_source(dataset)
    aggregate = con.execute(
        f"""
        SELECT count(*) AS rows,
               count(*) FILTER (split NOT IN ('train','validation')) AS forbidden_split_rows,
               count(*) FILTER (strftime(target_hour, '%Y-%m') NOT IN
                 ({','.join(repr(month) for month in config['months'])})) AS forbidden_month_rows,
               count(*) FILTER (opportunities <= 0 OR opportunities IS NULL) AS bad_weights,
               count(*) FILTER (success_rate < 0 OR success_rate > 1
                                 OR success_rate IS NULL) AS bad_targets,
               count(*) FILTER (weather_available_at > target_hour) AS future_weather_rows,
               min(target_hour), max(target_hour)
        FROM read_parquet('{source}')
        """
    ).fetchone()
    split_rows = con.execute(
        f"""
        SELECT split, count(*) AS rows, sum(opportunities) AS opportunities,
               sum(successes) AS successes
        FROM read_parquet('{source}') GROUP BY split ORDER BY split
        """
    ).fetchall()
    opportunity = json.loads(opportunity_manifest.read_text(encoding="utf-8"))
    months = opportunity.get("months", [])
    expected_months = set(config["months"])
    seen_months = {row["month"] for row in months}
    tolerance = float(config["gates"]["max_exposure_weight_error_fraction"])
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, detail: Any) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": str(detail)})

    check("dataset nonempty", aggregate[0] > 0, aggregate[0])
    check("locked split absent", aggregate[1] == 0, aggregate[1])
    check("locked months absent", aggregate[2] == 0, aggregate[2])
    check("positive opportunity weights", aggregate[3] == 0, aggregate[3])
    check("target bounds", aggregate[4] == 0, aggregate[4])
    check("no future weather availability", aggregate[5] == 0, aggregate[5])
    check("opportunity month coverage", seen_months == expected_months,
          sorted(expected_months - seen_months))
    for row in months:
        check(
            f"exposure reconstruction {row['month']}",
            abs(float(row["sampling_weight_relative_error"])) < tolerance,
            row["sampling_weight_relative_error"],
        )
    failed = [row for row in checks if not row["passed"]]
    output = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "task": args.task,
        "execution_scope": "development",
        "dataset": relative(dataset),
        "dataset_sha256": sha256(dataset),
        "rows": aggregate[0],
        "time_range": [aggregate[6], aggregate[7]],
        "splits": [
            {"split": row[0], "rows": row[1], "opportunities": row[2], "successes": row[3]}
            for row in split_rows
        ],
        "summary": {"checks": len(checks), "failures": len(failed)},
        "checks": checks,
    }
    path = MANIFESTS / f"{config['run_id']}_{args.task}_development_audit.json"
    write_json(path, output)
    print(f"{len(checks)} checks, {len(failed)} failures: {path}")
    if failed:
        for row in failed:
            print(f"FAIL {row['name']}: {row['detail']}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
