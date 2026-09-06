#!/usr/bin/env python3
"""Audit a once-opened V4.2 gate dataset and record immutable checksums."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
import pyarrow.dataset as ds


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE))

from outcome_protocol import (  # noqa: E402
    OutcomeProtocolError,
    load_json,
    resolve_manifest,
    resume_scope,
    sha256,
)
from train_phase2_scale import validate_m5_runtime  # noqa: E402
from feature_contract import nowcast_features  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V4_RESULTS = (
    ROOT
    / "ml/results/propagation_v4/propagation_v4_multiyear_50m"
    / "development_results.json"
)


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, default=str)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def repository_path(value: str | Path) -> Path:
    path = Path(value)
    path = path if path.is_absolute() else ROOT / path
    try:
        path.relative_to(ROOT)
    except ValueError as error:
        raise OutcomeProtocolError(f"audit path is outside the repository: {path}") from error
    return path


def parse_parts(values: list[str], expected: list[str]) -> dict[str, Path]:
    output = {}
    for value in values:
        month, separator, raw_path = value.partition("=")
        if not separator or month in output:
            raise OutcomeProtocolError(f"invalid --dataset value: {value}")
        output[month] = repository_path(raw_path)
    if list(output) != expected:
        raise OutcomeProtocolError(
            f"audit datasets must be ordered exactly {expected}; got {list(output)}"
        )
    return output


def required_features(config: dict[str, Any]) -> list[str]:
    """Feature columns the gate dataset must carry under this contract."""
    value = load_json(V4_RESULTS)["candidates"]["M2_nowcast"]
    return nowcast_features(config, list(map(str, value["features"])))


def dataset_stats(
    connection: duckdb.DuckDBPyConnection,
    path: Path,
    month: str,
) -> tuple[Any, ...]:
    """Return the exact integrity row used by the one-shot gate audit."""
    return connection.execute(
        """
        SELECT count(*) AS rows,
               count(*) FILTER (
                 strftime(target_hour AT TIME ZONE 'UTC', '%Y-%m') <> ?
               ) AS wrong_month,
               count(*) FILTER (split <> 'test') AS wrong_split,
               count(*) FILTER (opportunities IS NULL OR opportunities <= 0) AS bad_weights,
               count(*) FILTER (success_rate IS NULL OR success_rate < 0 OR success_rate > 1) AS bad_targets,
               count(*) FILTER (weather_available_at > target_hour) AS future_weather,
               min(target_hour), max(target_hour)
        FROM read_parquet(?)
        """,
        [month, str(path)],
    ).fetchone()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--manifest")
    parser.add_argument("--scope", choices=("december", "archive"), required=True)
    parser.add_argument("--attempt-id", required=True)
    parser.add_argument("--dataset", action="append", default=[], required=True)
    parser.add_argument("--opportunity-manifest", required=True)
    parser.add_argument("--source-manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    runtime = validate_m5_runtime(config)
    manifest_path = resolve_manifest(args.manifest, config)
    protocol = load_json(manifest_path)
    resume_scope(protocol, args.scope, args.attempt_id)
    months = list(
        map(
            str,
            config["phase4"]["gate_months"]
            if args.scope == "december"
            else config["phase5"]["locked_months"],
        )
    )
    parts = parse_parts(args.dataset, months)
    opportunity_path = repository_path(args.opportunity_manifest)
    source_path = repository_path(args.source_manifest)
    opportunity = load_json(opportunity_path)
    sources = load_json(source_path)
    opportunity_rows = {
        str(row["month"]): row for row in opportunity.get("months", [])
    }
    source_months = sorted(
        {
            str(item["url"]).split("wsprspots-")[-1].split(".csv.gz")[0]
            for item in sources.get("sources", [])
            if "wsprspots-" in str(item.get("url", ""))
        }
    )
    checks = []

    def check(name: str, passed: bool, detail: Any) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": str(detail)})

    check("source month inventory", source_months == sorted(months), source_months)
    check(
        "opportunity month inventory",
        set(opportunity_rows) == set(months),
        sorted(opportunity_rows),
    )
    features = required_features(config)
    datasets = {}
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    con.execute("SET threads=18")
    con.execute("SET memory_limit='80GB'")
    con.execute("SET preserve_insertion_order=false")
    tolerance = 0.03
    for month, path in parts.items():
        if not path.is_file():
            raise FileNotFoundError(path)
        columns = set(ds.dataset(path, format="parquet").schema.names)
        missing = sorted(set(features) - columns)
        check(f"{month} required feature contract", not missing, missing)
        stats = dataset_stats(con, path, month)
        check(f"{month} nonempty", stats[0] > 0, stats[0])
        check(f"{month} exact month", stats[1] == 0, stats[1])
        check(f"{month} test split only", stats[2] == 0, stats[2])
        check(f"{month} positive weights", stats[3] == 0, stats[3])
        check(f"{month} bounded targets", stats[4] == 0, stats[4])
        check(f"{month} no future weather", stats[5] == 0, stats[5])
        opportunity_row = opportunity_rows.get(month, {})
        exposure_error = float(
            opportunity_row.get("sampling_weight_relative_error", float("inf"))
        )
        check(
            f"{month} exposure reconstruction",
            abs(exposure_error) < tolerance,
            exposure_error,
        )
        datasets[month] = {
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "rows": int(stats[0]),
            "time_range": [stats[6], stats[7]],
            "feature_count": len(features),
        }
    failures = [row for row in checks if not row["passed"]]
    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_id": config["run_id"],
        "scope": args.scope,
        "attempt_id": args.attempt_id,
        "months": months,
        "december_2024_read": True,
        "locked_2025_read": args.scope == "archive",
        "prospective_read": False,
        "datasets": datasets,
        "opportunity_manifest": {
            "path": opportunity_path.relative_to(ROOT).as_posix(),
            "bytes": opportunity_path.stat().st_size,
            "sha256": sha256(opportunity_path),
        },
        "source_manifest": {
            "path": source_path.relative_to(ROOT).as_posix(),
            "bytes": source_path.stat().st_size,
            "sha256": sha256(source_path),
        },
        "checks": checks,
        "summary": {"checks": len(checks), "failures": len(failures)},
        "runtime": runtime,
        "passed": not failures,
    }
    output_path = repository_path(args.output)
    atomic_write(output_path, output)
    print(output_path)
    if failures:
        raise OutcomeProtocolError(
            f"locked dataset audit failed: {[row['name'] for row in failures]}"
        )


if __name__ == "__main__":
    main()
