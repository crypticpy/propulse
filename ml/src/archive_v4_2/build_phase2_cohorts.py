#!/usr/bin/env python3
"""Build deterministic nested cohorts for V4.2 Phase 2 scaling."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
import pyarrow.parquet as pq


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE))

from phase1_core import sampling_threshold  # noqa: E402
from phase2_core import (  # noqa: E402
    EXPECTED_CANDIDATES,
    EXPECTED_FOLDS,
    Phase2Error,
    scale_workset,
    training_months,
    validate_config,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
PHASE1_MANIFEST = ROOT / "ml/data/manifests/propagation_v4_2_phase1_5m_cohorts.json"
PHASE1_COHORT_NAMES = {
    "A2_long_natural": "long_history_pool",
    "A4_recent_cycle": "recent_cycle_pool",
    "A5_recency_weighted": "long_recent_pool",
}
PHASE2_20M_EVALUATION = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "evaluation_20m_results.json"
)
PHASE2_20M_MANIFEST = (
    ROOT / "ml/data/manifests/propagation_v4_2_phase2_20m_cohorts.json"
)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sql_string(value: str | Path) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def sql_path_list(paths: list[Path]) -> str:
    return "[" + ",".join(sql_string(path) for path in paths) + "]"


def parquet_month(path: Path) -> tuple[str, int]:
    file = pq.ParquetFile(path)
    index = file.schema_arrow.get_field_index("target_hour")
    statistics = file.metadata.row_group(0).column(index).statistics
    if statistics is None or statistics.min is None:
        raise Phase2Error(f"target_hour statistics are missing: {path}")
    return statistics.min.strftime("%Y-%m"), file.metadata.num_rows


def resolve_sources(config: dict[str, Any]) -> tuple[dict[str, Path], dict[str, int]]:
    quarterly = ROOT / config["source_roots"]["quarterly"]
    if not quarterly.is_dir():
        raise FileNotFoundError(quarterly)
    sources: dict[str, Path] = {}
    rows: dict[str, int] = {}
    for path in sorted(quarterly.glob("part-[0-9][0-9][0-9].parquet")):
        month, count = parquet_month(path)
        sources[month] = path
        rows[month] = count
    for month, relative in config["source_roots"]["supplemental"].items():
        path = ROOT / relative
        observed, count = parquet_month(path)
        if observed != month:
            raise Phase2Error(f"supplemental month mismatch: {month} != {observed}")
        sources[month] = path
        rows[month] = count
    required = set(config["base_training_months"])
    required.update(config["evaluation_months"])
    required.add(config["calibration_month"])
    for fold in config["rolling_folds"].values():
        required.add(fold["early_stopping_month"])
        required.update(fold["available_2024_training_months"])
    missing = sorted(required - set(sources))
    if missing:
        raise Phase2Error(f"source inventory is missing months: {missing}")
    return sources, rows


def configure_connection(config: dict[str, Any]) -> duckdb.DuckDBPyConnection:
    temp = Path(config["compute"]["temp_root"])
    temp.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    threads = int(config["compute"]["apple_silicon"]["duckdb_threads"])
    connection.execute(f"SET threads={threads}")
    connection.execute("SET memory_limit='80GB'")
    connection.execute(f"SET temp_directory={sql_string(temp)}")
    connection.execute("SET preserve_insertion_order=false")
    return connection


def output_roots(config: dict[str, Any], scale: int) -> tuple[Path, Path]:
    data_root = Path(config["compute"]["data_root"])
    external = data_root / config["run_id"] / f"{scale // 1_000_000}m"
    external.mkdir(parents=True, exist_ok=True)
    repository = ROOT / "ml/data/processed/archive_v4_2"
    repository.parent.mkdir(parents=True, exist_ok=True)
    if repository.exists():
        if repository.resolve() != data_root.resolve():
            raise Phase2Error(f"data path resolves outside external storage: {repository}")
    else:
        repository.symlink_to(data_root, target_is_directory=True)
    return external, repository / config["run_id"] / external.name


def row_count(path: Path) -> int:
    return pq.ParquetFile(path).metadata.num_rows


def sampling_key(seed: int) -> str:
    return "hash(target_hour, band, tx_grid4, rx_grid4, power_bin_dbm, " f"{seed})"


def copy_cohort(
    connection: duckdb.DuckDBPyConnection,
    sources: list[Path],
    total_rows: int,
    output: Path,
    target: int,
    seed: int,
    oversample: float,
    *,
    recency_reference: str | None,
    half_life_months: float,
    force: bool,
) -> None:
    if output.exists() and not force:
        if row_count(output) != target:
            raise Phase2Error(f"existing cohort has the wrong row count: {output}")
        return
    if force:
        output.unlink(missing_ok=True)
    threshold = sampling_threshold(total_rows, target, oversample)
    key = sampling_key(seed)
    selected = f"""
      SELECT *, {key}::UBIGINT AS v4_2_sample_key
      FROM read_parquet({sql_path_list(sources)}, union_by_name=true)
      WHERE {key}::UBIGINT <= {threshold}::UBIGINT
      ORDER BY v4_2_sample_key, target_hour, band, tx_grid4, rx_grid4,
               power_bin_dbm
      LIMIT {target}
    """
    if recency_reference is None:
        query = f"""
          WITH selected AS ({selected})
          SELECT *, opportunities::DOUBLE AS training_weight
          FROM selected ORDER BY v4_2_sample_key
        """
    else:
        query = f"""
          WITH selected AS ({selected}), multipliers AS (
            SELECT *, power(
              0.5,
              date_diff(
                'day', target_hour, TIMESTAMPTZ {sql_string(recency_reference)}
              ) / (30.436875 * {half_life_months})
            ) AS recency_multiplier
            FROM selected
          ), normalized AS (
            SELECT *, sum(opportunities) OVER ()
              / sum(opportunities * recency_multiplier) OVER () AS recency_scale
            FROM multipliers
          )
          SELECT * EXCLUDE (recency_multiplier, recency_scale),
                 opportunities::DOUBLE AS training_weight,
                 opportunities * recency_multiplier * recency_scale
                   AS recency_training_weight
          FROM normalized ORDER BY v4_2_sample_key
        """
    connection.execute(
        f"""
        COPY ({query}) TO {sql_string(output)}
          (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000)
        """
    )
    observed = row_count(output)
    if observed != target:
        raise Phase2Error(f"cohort returned {observed:,}; expected {target:,}")


def copy_sample(
    connection: duckdb.DuckDBPyConnection,
    source: Path,
    output: Path,
    target: int,
    seed: int,
    oversample: float,
    force: bool,
) -> None:
    if output.exists() and not force:
        if row_count(output) != target:
            raise Phase2Error(f"existing sample has the wrong row count: {output}")
        return
    if force:
        output.unlink(missing_ok=True)
    total = row_count(source)
    threshold = sampling_threshold(total, target, oversample)
    key = sampling_key(seed)
    connection.execute(
        f"""
        COPY (
          SELECT *, {key}::UBIGINT AS v4_2_sample_key,
                 opportunities::DOUBLE AS training_weight
          FROM read_parquet({sql_string(source)})
          WHERE {key}::UBIGINT <= {threshold}::UBIGINT
          ORDER BY v4_2_sample_key, target_hour, band, tx_grid4, rx_grid4,
                   power_bin_dbm
          LIMIT {target}
        ) TO {sql_string(output)}
          (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000)
        """
    )
    if row_count(output) != target:
        raise Phase2Error(f"sample is smaller than {target:,}: {output}")


def artifact(path: Path, repository_path: Path) -> dict[str, Any]:
    return {
        "path": repository_path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "rows": row_count(path),
        "sha256": sha256(path),
    }


def distribution(
    connection: duckdb.DuckDBPyConnection, path: Path, weight_column: str
) -> dict[str, Any]:
    rows = connection.execute(
        f"""
        SELECT strftime(target_hour, '%Y-%m') AS month, count(*)::BIGINT,
               sum(opportunities)::DOUBLE, sum({weight_column})::DOUBLE
        FROM read_parquet({sql_string(path)})
        GROUP BY month ORDER BY month
        """
    ).fetchall()
    return {
        str(month): {
            "rows": int(count),
            "opportunities": float(opportunities),
            "training_weight": float(training_weight),
        }
        for month, count, opportunities, training_weight in rows
    }


def verify_nested(
    connection: duckdb.DuckDBPyConnection, phase1_path: Path, phase2_path: Path
) -> dict[str, Any]:
    missing = int(
        connection.execute(
            f"""
            SELECT count(*) FROM read_parquet({sql_string(phase1_path)}) old
            ANTI JOIN read_parquet({sql_string(phase2_path)}) new
            USING (v4_2_sample_key)
            """
        ).fetchone()[0]
    )
    phase1_rows = row_count(phase1_path)
    return {
        "phase1_rows": phase1_rows,
        "missing_phase1_keys": missing,
        "exact_phase1_key_subset": missing == 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--scale", type=int, required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    del args.profile
    started = time.monotonic()
    config = load_json(Path(args.config))
    validate_config(config)
    scale = int(args.scale)
    if scale not in [int(value) for value in config["sampling"]["scales"]]:
        raise Phase2Error(f"scale is not preregistered: {scale}")
    phase2_20m_evaluation = (
        load_json(PHASE2_20M_EVALUATION) if scale == 50_000_000 else None
    )
    candidates, folds = scale_workset(config, scale, phase2_20m_evaluation)
    sources, source_rows = resolve_sources(config)
    external, repository = output_roots(config, scale)
    connection = configure_connection(config)
    seed = int(config["seed"])
    oversample = float(config["sampling"]["hash_oversample_fraction"])
    half_life = float(config["sampling"]["recency_half_life_months"])

    cohort_paths: dict[str, dict[str, Path]] = {}
    for candidate in candidates:
        cohort_paths[candidate] = {}
        for fold in folds:
            if candidate == "A2_long_natural" and fold != folds[0]:
                cohort_paths[candidate][fold] = cohort_paths[candidate][folds[0]]
                continue
            months = training_months(config, candidate, fold)
            suffix = "shared" if candidate == "A2_long_natural" else fold
            path = external / f"cohort_{candidate}_{suffix}_{scale // 1_000_000}m.parquet"
            copy_cohort(
                connection,
                [sources[month] for month in months],
                sum(source_rows[month] for month in months),
                path,
                scale,
                seed,
                oversample,
                recency_reference=(
                    config["rolling_folds"][fold]["recency_reference"]
                    if candidate == "A5_recency_weighted"
                    else None
                ),
                half_life_months=half_life,
                force=args.force,
            )
            cohort_paths[candidate][fold] = path
            print(f"cohort {candidate} {fold}: {path}", flush=True)

    phase1 = load_json(PHASE1_MANIFEST)
    nested_manifest_path = (
        PHASE1_MANIFEST if scale == 20_000_000 else PHASE2_20M_MANIFEST
    )
    nested_manifest = load_json(nested_manifest_path)
    early_samples: dict[str, dict[str, Any]] = {}
    for fold in folds:
        month = config["rolling_folds"][fold]["early_stopping_month"]
        if month == "2024-07":
            early_samples[fold] = dict(phase1["early_stopping"])
            continue
        path = external / f"sample_early_stopping_{month.replace('-', '_')}_5m.parquet"
        copy_sample(
            connection,
            sources[month],
            path,
            int(config["sampling"]["early_stopping_rows"]),
            seed,
            oversample,
            args.force,
        )
        early_samples[fold] = artifact(path, repository / path.name)
    calibration = dict(phase1["calibration"])

    cohorts: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        cohorts[candidate] = {}
        for fold in folds:
            path = cohort_paths[candidate][fold]
            repo_path = repository / path.name
            weight = str(config["candidates"][candidate]["weight"])
            months = training_months(config, candidate, fold)
            value = {
                **artifact(path, repo_path),
                "months": months,
                "weight_column": weight,
                "distribution": distribution(connection, path, weight),
            }
            if fold == config["final_fold"]:
                if scale == 20_000_000:
                    old_item = phase1["cohorts"][PHASE1_COHORT_NAMES[candidate]]
                    nested_scale = 5_000_000
                else:
                    old_item = nested_manifest["cohorts"][candidate][fold]
                    nested_scale = 20_000_000
                nestedness = verify_nested(connection, ROOT / old_item["path"], path)
                value["nestedness"] = {
                    **nestedness,
                    "source_scale": nested_scale,
                    "source_path": old_item["path"],
                }
                if scale == 20_000_000:
                    value["phase1_nestedness"] = nestedness
                if not nestedness["exact_phase1_key_subset"]:
                    raise Phase2Error(
                        f"{candidate} is not nested over its {nested_scale // 1_000_000}M cohort"
                    )
            cohorts[candidate][fold] = value

    manifest = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scale": scale,
        "scope": "development_only",
        "december_2024_read": False,
        "locked_2025_read": False,
        "seed": seed,
        "selected_candidates": list(candidates),
        "folds": list(folds),
        "sampling_key": sampling_key(seed),
        "source_inventory": {
            month: {
                "path": sources[month].relative_to(ROOT).as_posix(),
                "rows": source_rows[month],
                "bytes": sources[month].stat().st_size,
            }
            for month in sorted(
                set().union(
                    *(set(training_months(config, candidate, fold))
                      for candidate in candidates for fold in folds),
                    {config["calibration_month"]},
                    *(set(config["evaluation_months"]),),
                )
            )
        },
        "cohorts": cohorts,
        "early_stopping": early_samples,
        "calibration": calibration,
        "phase1_manifest": PHASE1_MANIFEST.relative_to(ROOT).as_posix(),
        "nested_over_manifest": nested_manifest_path.relative_to(ROOT).as_posix(),
        "selection_source": (
            PHASE2_20M_EVALUATION.relative_to(ROOT).as_posix()
            if scale == 50_000_000
            else None
        ),
        "environment": {
            "python": platform.python_version(),
            "duckdb": duckdb.__version__,
            "platform": platform.platform(),
        },
        "seconds": time.monotonic() - started,
    }
    manifest_path = (
        ROOT
        / "ml/data/manifests"
        / f"propagation_v4_2_phase2_{scale // 1_000_000}m_cohorts.json"
    )
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = manifest_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, manifest_path)
    print(manifest_path)


if __name__ == "__main__":
    main()
