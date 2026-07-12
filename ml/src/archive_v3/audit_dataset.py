"""Record exact V3 feature-dataset schema, split aggregates, and checksum."""

from __future__ import annotations

import argparse

import polars as pl

from common import MANIFESTS, PROCESSED, load_config, relative, sha256, utc_now, write_json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--task", choices=("hf", "6m"), required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    dataset = PROCESSED / f"dataset_{config['run_id']}_{args.task}.parquet"
    if not dataset.exists():
        raise FileNotFoundError(dataset)
    scan = pl.scan_parquet(dataset)
    schema = scan.collect_schema()
    splits = (
        scan.group_by("split")
        .agg(
            pl.len().alias("rows"),
            pl.col("opportunities").sum().alias("weighted_opportunities"),
            pl.col("successes").sum().alias("weighted_successes"),
            pl.col("target_hour").min().alias("min_time"),
            pl.col("target_hour").max().alias("max_time"),
        )
        .sort("split")
        .collect()
        .to_dicts()
    )
    write_json(
        MANIFESTS / f"{config['run_id']}_{args.task}_dataset.json",
        {
            "schema_version": 1,
            "generated_at": utc_now(),
            "run_id": config["run_id"],
            "task": args.task,
            "config_path": config["config_path"],
            "path": relative(dataset),
            "bytes": dataset.stat().st_size,
            "sha256": sha256(dataset),
            "columns": [{"name": name, "type": str(kind)} for name, kind in schema.items()],
            "splits": splits,
            "availability_contract": (
                "Space-weather observations are joined at available_at=target_hour, "
                "where available_at is observed_hour+1h; path-history features use "
                "H-1, H-2, H-3, and H-24 only."
            ),
        },
    )
    print(f"{args.task}: {sum(row['rows'] for row in splits):,} rows")


if __name__ == "__main__":
    main()
