#!/usr/bin/env python3
"""Run V4 data stages through the proven Archive V3 implementation."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
V3 = ROOT / "ml/src/archive_v3"
DEFAULT_CONFIG = "ml/config/propagation_v4.json"


STAGES: dict[str, tuple[str, list[str]]] = {
    "inventory": ("inventory.py", ["--output", "ml/data/manifests/propagation_v4_environment.json"]),
    "download": ("download_sources.py", []),
    "space-weather": ("build_space_weather.py", []),
    "source-manifest": ("build_source_manifest.py", []),
    "bronze": ("build_bronze.py", []),
    "opportunities-hf": ("build_opportunities.py", ["--task", "hf"]),
    "opportunities-6m": ("build_opportunities.py", ["--task", "6m"]),
    "features-hf": ("build_features.py", ["--task", "hf"]),
    "features-6m": ("build_features.py", ["--task", "6m"]),
    "audit-hf": ("audit_dataset.py", ["--task", "hf"]),
    "audit-6m": ("audit_dataset.py", ["--task", "6m"]),
}

PREPARE = [
    "inventory",
    "download",
    "space-weather",
    "source-manifest",
    "bronze",
    "opportunities-hf",
    "opportunities-6m",
    "features-hf",
    "features-6m",
    "audit-hf",
    "audit-6m",
]


def environment(config: dict, profile: str) -> dict[str, str]:
    env = dict(os.environ)
    env["PROPULSE_ARCHIVE_NAMESPACE"] = config["archive_namespace"]
    if profile == "local-m3":
        env.update(
            {
                "PROPULSE_DUCKDB_THREADS": "10",
                "PROPULSE_DUCKDB_MEMORY_LIMIT": "26GB",
                "PROPULSE_ML_TEMP_ROOT": "/tmp/propulse-ml",
            }
        )
    elif profile == "m5":
        env.update(
            {
                "PROPULSE_DUCKDB_THREADS": "14",
                "PROPULSE_DUCKDB_MEMORY_LIMIT": "80GB",
                "PROPULSE_ML_TEMP_ROOT": config["compute"]["temp_root"],
            }
        )
    return env


def run_stage(
    stage: str,
    config_path: str,
    config: dict,
    profile: str,
    force: bool,
) -> None:
    script, extra = STAGES[stage]
    command = [sys.executable, str(V3 / script)]
    if stage != "inventory":
        command.extend(["--config", config_path])
    command.extend(extra)
    if force and stage in {
        "download",
        "bronze",
        "opportunities-hf",
        "opportunities-6m",
        "features-hf",
        "features-6m",
    }:
        command.append("--force")
    print(f"\n== {stage} ==", flush=True)
    subprocess.run(
        command,
        cwd=ROOT,
        env=environment(config, profile),
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=[*STAGES, "prepare"])
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--profile", choices=("local-m3", "m5"), default="local-m3")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    config = json.loads((ROOT / args.config).read_text())
    stages = PREPARE if args.stage == "prepare" else [args.stage]
    for stage in stages:
        run_stage(stage, args.config, config, args.profile, args.force)


if __name__ == "__main__":
    main()
