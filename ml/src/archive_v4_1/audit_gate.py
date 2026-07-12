#!/usr/bin/env python3
"""Audit the once-opened November feature dataset before scoring it."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import duckdb

from protocol import DEFAULT_MANIFEST, ProtocolError, artifact, atomic_write_json, load_json, utc_now


ROOT = Path(__file__).resolve().parents[3]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--attempt-id", required=True)
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config = load_json(args.config)
    manifest = load_json(DEFAULT_MANIFEST)
    if config.get("execution_scope") != "november-gate":
        raise ProtocolError("gate audit requires the November scoped config")
    if config.get("months") != ["2024-11"] or config.get("test", {}).get("months") != ["2024-11"]:
        raise ProtocolError("gate audit requires exactly November 2024 as test")
    if manifest.get("november_gate_attempt_id") != args.attempt_id:
        raise ProtocolError("gate audit attempt does not match the permanent ledger")

    run_id = config["run_id"]
    dataset = ROOT / "ml/data/processed/archive_v4_1" / f"dataset_{run_id}_hf.parquet"
    source_manifest = ROOT / "ml/data/manifests" / f"{run_id}_sources.json"
    bronze_manifest = ROOT / "ml/data/manifests" / f"{run_id}_bronze.json"
    opportunity_manifest = ROOT / "ml/data/manifests" / f"{run_id}_hf_opportunities.json"
    required = (dataset, source_manifest, bronze_manifest, opportunity_manifest, dataset / "_SUCCESS")
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError(missing)
    parts = sorted(dataset.glob("part-*.parquet"))
    if len(parts) != 1:
        raise ProtocolError(f"November gate requires one feature part, found {len(parts)}")

    connection = duckdb.connect()
    connection.execute("SET TimeZone='UTC'")
    aggregate = connection.execute(
        f"""
        SELECT count(*),
               count(*) FILTER (split <> 'test' OR split IS NULL),
               count(*) FILTER (strftime(target_hour, '%Y-%m') <> '2024-11'),
               count(*) FILTER (opportunities <= 0 OR opportunities IS NULL),
               count(*) FILTER (success_rate < 0 OR success_rate > 1 OR success_rate IS NULL),
               count(*) FILTER (weather_available_at > target_hour),
               count(*) FILTER (target_hour IS NULL),
               min(target_hour), max(target_hour), sum(opportunities), sum(successes)
        FROM read_parquet('{parts[0]}', hive_partitioning=false)
        """
    ).fetchone()
    connection.close()
    opportunities = load_json(opportunity_manifest)
    sources = load_json(source_manifest)
    bronze = load_json(bronze_manifest)
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, detail: Any) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    check("dataset nonempty", aggregate[0] > 0, aggregate[0])
    check("test split only", aggregate[1] == 0, aggregate[1])
    check("November 2024 only", aggregate[2] == 0, aggregate[2])
    check("positive opportunity weights", aggregate[3] == 0, aggregate[3])
    check("target bounds", aggregate[4] == 0, aggregate[4])
    check("no future weather availability", aggregate[5] == 0, aggregate[5])
    check("target hours present", aggregate[6] == 0, aggregate[6])
    check(
        "opportunity month coverage",
        [row.get("month") for row in opportunities.get("months", [])] == ["2024-11"],
        [row.get("month") for row in opportunities.get("months", [])],
    )
    check("source manifest entries", len(sources.get("sources", [])) == 3,
          len(sources.get("sources", [])))
    check("bronze month coverage", len(bronze.get("months", [])) == 1,
          len(bronze.get("months", [])))
    tolerance = 0.03
    for row in opportunities.get("months", []):
        error = abs(float(row["sampling_weight_relative_error"]))
        check("exposure reconstruction 2024-11", error < tolerance, error)
    failed = [row for row in checks if not row["passed"]]
    output = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": run_id,
        "scope": "untouched_november_gate_integrity",
        "attempt_id": args.attempt_id,
        "months": ["2024-11"],
        "november_gate_read": True,
        "locked_archive_test_read": False,
        "dataset": artifact(parts[0]),
        "success_marker": artifact(dataset / "_SUCCESS"),
        "source_manifest": artifact(source_manifest),
        "bronze_manifest": artifact(bronze_manifest),
        "opportunity_manifest": artifact(opportunity_manifest),
        "rows": int(aggregate[0]),
        "time_range": [aggregate[7].isoformat(), aggregate[8].isoformat()],
        "weighted_opportunities": float(aggregate[9]),
        "weighted_successes": float(aggregate[10]),
        "checks": checks,
        "summary": {"checks": len(checks), "failures": len(failed)},
        "passed": not failed,
    }
    atomic_write_json(args.output, output)
    print(args.output)
    if failed:
        raise ProtocolError(f"November integrity audit failed: {[row['name'] for row in failed]}")


if __name__ == "__main__":
    main()
