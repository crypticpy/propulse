#!/usr/bin/env python3
"""Build deterministic natural and validation cohorts for V4.2 Phase 1."""

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

from phase1_core import Phase1Error, sampling_threshold, validate_config  # noqa: E402
from feature_contract import contract_marker, core_feature_contract  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase1_5m.json"
MANIFEST = ROOT / "ml/data/manifests/propagation_v4_2_phase1_5m_cohorts.json"
NATURAL_COHORTS = (
    "v3_month_pool",
    "long_history_pool",
    "recent_cycle_pool",
    "long_recent_pool",
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


def month_sql(months: list[str]) -> str:
    return "(" + ",".join(sql_string(value) for value in months) + ")"


def parquet_month(path: Path) -> tuple[str, int]:
    file = pq.ParquetFile(path)
    index = file.schema_arrow.get_field_index("target_hour")
    statistics = file.metadata.row_group(0).column(index).statistics
    if statistics is None or statistics.min is None:
        raise Phase1Error(f"target_hour statistics are missing: {path}")
    month = statistics.min.strftime("%Y-%m")
    return month, file.metadata.num_rows


def verify_feature_contract(dataset_root: Path, config: dict[str, Any]) -> None:
    """Raise if a dataset's ``_CONTRACT`` marker disagrees with the run config.

    ``build_features.py`` stamps the feature contract it built into
    ``_CONTRACT`` alongside its output. A dataset with no marker predates
    that stamp and is not checked; a dataset whose marker disagrees with the
    run config's ``core_feature_contract`` has the wrong feature layout for
    this run and must not be silently loaded.
    """
    declared = contract_marker(dataset_root)
    if declared is None:
        return
    expected = core_feature_contract(config)
    if declared != expected:
        raise Phase1Error(
            f"{dataset_root}: _CONTRACT marker declares {declared!r} but "
            f"{config['run_id']} expects core_feature_contract={expected!r}"
        )


def resolve_sources(config: dict[str, Any]) -> tuple[dict[str, Path], dict[str, int]]:
    roots = config["source_roots"]
    quarterly = ROOT / roots["quarterly"]
    if not quarterly.is_dir():
        raise FileNotFoundError(quarterly)
    verify_feature_contract(quarterly, config)
    sources: dict[str, Path] = {}
    rows: dict[str, int] = {}
    for path in sorted(quarterly.glob("part-[0-9][0-9][0-9].parquet")):
        month, count = parquet_month(path)
        sources[month] = path
        rows[month] = count
    for month, relative in roots["supplemental"].items():
        path = ROOT / relative
        verify_feature_contract(path.parent, config)
        observed, count = parquet_month(path)
        if observed != month:
            raise Phase1Error(f"supplemental month mismatch: {month} != {observed}")
        sources[month] = path
        rows[month] = count
    required = set().union(
        *(set(value) for value in config["data_roles"].values())
    )
    missing = sorted(required - set(sources))
    if missing:
        raise Phase1Error(f"source inventory is missing months: {missing}")
    return sources, rows


def configure_connection(config: dict[str, Any]) -> duckdb.DuckDBPyConnection:
    compute = config["compute"]
    temp = Path(compute["temp_root"])
    temp.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    connection.execute("SET TimeZone='UTC'")
    connection.execute("SET threads=14")
    connection.execute("SET memory_limit='80GB'")
    connection.execute(f"SET temp_directory={sql_string(temp)}")
    connection.execute("SET preserve_insertion_order=false")
    return connection


def output_roots(config: dict[str, Any]) -> tuple[Path, Path]:
    data_root = Path(config["compute"]["data_root"])
    external = data_root / config["run_id"]
    external.mkdir(parents=True, exist_ok=True)
    repository = ROOT / "ml/data/processed/archive_v4_2"
    repository.parent.mkdir(parents=True, exist_ok=True)
    if repository.exists():
        if repository.resolve() != data_root.resolve():
            raise Phase1Error(
                f"large-artifact path resolves outside external storage: {repository}"
            )
    else:
        repository.symlink_to(data_root, target_is_directory=True)
    return external, repository / config["run_id"]


def row_count(path: Path) -> int:
    return pq.ParquetFile(path).metadata.num_rows


def sampling_key(seed: int) -> str:
    return (
        "hash(target_hour, band, tx_grid4, rx_grid4, power_bin_dbm, "
        f"{seed})"
    )


def copy_master(
    connection: duckdb.DuckDBPyConnection,
    sources: list[Path],
    total_rows: int,
    output: Path,
    config: dict[str, Any],
    force: bool,
) -> None:
    target = int(config["sampling"]["master_rows"])
    if output.exists() and not force:
        if row_count(output) != target:
            raise Phase1Error("existing master pool has the wrong row count")
        return
    if force:
        output.unlink(missing_ok=True)
    threshold = sampling_threshold(
        total_rows,
        target,
        float(config["sampling"]["hash_oversample_fraction"]),
    )
    key = sampling_key(int(config["seed"]))
    connection.execute(
        f"""
        COPY (
          SELECT * EXCLUDE (v4_2_sample_key), v4_2_sample_key
          FROM (
            SELECT *, {key}::UBIGINT AS v4_2_sample_key
            FROM read_parquet({sql_path_list(sources)}, union_by_name=true)
            WHERE {key}::UBIGINT <= {threshold}::UBIGINT
          )
          ORDER BY v4_2_sample_key, target_hour, band, tx_grid4, rx_grid4,
                   power_bin_dbm
          LIMIT {target}
        ) TO {sql_string(output)}
          (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000)
        """
    )
    observed = row_count(output)
    if observed != target:
        raise Phase1Error(
            f"master hash threshold returned {observed:,}; expected {target:,}"
        )


def copy_natural_cohort(
    connection: duckdb.DuckDBPyConnection,
    master: Path,
    output: Path,
    months: list[str],
    config: dict[str, Any],
    force: bool,
) -> None:
    target = int(config["sampling"]["train_rows"])
    if output.exists() and not force:
        if row_count(output) != target:
            raise Phase1Error(f"existing cohort has the wrong row count: {output}")
        return
    if force:
        output.unlink(missing_ok=True)
    half_life = float(config["sampling"]["recency_half_life_months"])
    reference = config["sampling"]["recency_reference"]
    connection.execute(
        f"""
        COPY (
          WITH selected AS (
            SELECT *
            FROM read_parquet({sql_string(master)})
            WHERE strftime(target_hour, '%Y-%m') IN {month_sql(months)}
            ORDER BY v4_2_sample_key
            LIMIT {target}
          ), multipliers AS (
            SELECT *, power(
              0.5,
              date_diff('day', target_hour, TIMESTAMPTZ {sql_string(reference)})
                / (30.436875 * {half_life})
            ) AS recency_multiplier
            FROM selected
          ), normalized AS (
            SELECT *,
              sum(opportunities) OVER ()
                / sum(opportunities * recency_multiplier) OVER () AS recency_scale
            FROM multipliers
          )
          SELECT * EXCLUDE (recency_multiplier, recency_scale),
                 opportunities::DOUBLE AS training_weight,
                 opportunities * recency_multiplier * recency_scale
                   AS recency_training_weight
          FROM normalized
          ORDER BY v4_2_sample_key
        ) TO {sql_string(output)}
          (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000)
        """
    )
    if row_count(output) != target:
        raise Phase1Error(f"cohort is smaller than {target:,}: {output}")


def copy_top_sample(
    connection: duckdb.DuckDBPyConnection,
    source: Path,
    output: Path,
    target: int,
    config: dict[str, Any],
    force: bool,
) -> None:
    if output.exists() and not force:
        if row_count(output) != target:
            raise Phase1Error(f"existing sample has the wrong row count: {output}")
        return
    if force:
        output.unlink(missing_ok=True)
    total = row_count(source)
    threshold = sampling_threshold(
        total,
        target,
        float(config["sampling"]["hash_oversample_fraction"]),
    )
    key = sampling_key(int(config["seed"]))
    connection.execute(
        f"""
        COPY (
          SELECT * EXCLUDE (v4_2_sample_key), v4_2_sample_key,
                 opportunities::DOUBLE AS training_weight
          FROM (
            SELECT *, {key}::UBIGINT AS v4_2_sample_key
            FROM read_parquet({sql_string(source)})
            WHERE {key}::UBIGINT <= {threshold}::UBIGINT
          )
          ORDER BY v4_2_sample_key
          LIMIT {target}
        ) TO {sql_string(output)}
          (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000)
        """
    )
    if row_count(output) != target:
        raise Phase1Error(f"sample is smaller than {target:,}: {output}")


def distribution(connection: duckdb.DuckDBPyConnection, path: Path) -> dict[str, Any]:
    rows = connection.execute(
        f"""
        SELECT strftime(target_hour, '%Y-%m') AS month, count(*)::BIGINT,
               sum(opportunities)::DOUBLE, sum(training_weight)::DOUBLE
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


def artifact(path: Path, repository_path: Path) -> dict[str, Any]:
    return {
        "path": repository_path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "rows": row_count(path),
        "sha256": sha256(path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    del args.profile
    started = time.monotonic()
    config = load_json(Path(args.config))
    validate_config(config)
    sources, source_rows = resolve_sources(config)
    external, repository = output_roots(config)
    connection = configure_connection(config)

    master_months = list(config["data_roles"]["master_pool"])
    master_sources = [sources[month] for month in master_months]
    master = external / "master_natural_50m.parquet"
    copy_master(
        connection,
        master_sources,
        sum(source_rows[month] for month in master_months),
        master,
        config,
        args.force,
    )

    cohort_paths: dict[str, Path] = {}
    for name in NATURAL_COHORTS:
        path = external / f"cohort_{name}_5m.parquet"
        copy_natural_cohort(
            connection,
            master,
            path,
            list(config["data_roles"][name]),
            config,
            args.force,
        )
        cohort_paths[name] = path

    early = external / "sample_early_stopping_2024_07_5m.parquet"
    calibration = external / "sample_calibration_2024_08_5m.parquet"
    copy_top_sample(
        connection,
        sources["2024-07"],
        early,
        int(config["sampling"]["early_stopping_rows"]),
        config,
        args.force,
    )
    copy_top_sample(
        connection,
        sources["2024-08"],
        calibration,
        int(config["sampling"]["calibration_rows"]),
        config,
        args.force,
    )

    existing_balanced = (
        ROOT
        / "ml/data/processed/archive_v4/samples/propagation_v4_multiyear_50m/hf/train"
    )
    balanced_rows = connection.execute(
        f"""
        SELECT count(*) FROM read_parquet(
          {sql_string(existing_balanced / '**/*.parquet')},
          hive_partitioning=true
        ) WHERE in_sample_5000000
        """
    ).fetchone()[0]
    if int(balanced_rows) != int(config["sampling"]["train_rows"]):
        raise Phase1Error(f"balanced cohort has {balanced_rows:,} rows")

    manifest = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "development_only",
        "december_2024_read": False,
        "locked_2025_read": False,
        "seed": config["seed"],
        "sampling_key": sampling_key(int(config["seed"])),
        "source_inventory": {
            month: {
                "path": sources[month].relative_to(ROOT).as_posix(),
                "rows": source_rows[month],
            }
            for month in sorted(set(master_months + ["2024-07", "2024-08"]))
        },
        "master": artifact(master, repository / master.name),
        "cohorts": {
            name: {
                **artifact(path, repository / path.name),
                "months": config["data_roles"][name],
                "distribution": distribution(connection, path),
            }
            for name, path in cohort_paths.items()
        },
        "early_stopping": artifact(early, repository / early.name),
        "calibration": artifact(calibration, repository / calibration.name),
        "existing_balanced": {
            "path": existing_balanced.relative_to(ROOT).as_posix(),
            "rows": int(balanced_rows),
            "filter": "in_sample_5000000 == true",
            "weight": "training_weight",
        },
        "environment": {
            "python": platform.python_version(),
            "duckdb": duckdb.__version__,
            "platform": platform.platform(),
        },
        "seconds": time.monotonic() - started,
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    temporary = MANIFEST.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, MANIFEST)
    print(MANIFEST)


if __name__ == "__main__":
    main()
