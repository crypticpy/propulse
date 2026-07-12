#!/usr/bin/env python3
"""Run V4 data stages through the proven Archive V3 implementation."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from scoped_config import write_scoped_config


ROOT = Path(__file__).resolve().parents[3]
V3 = ROOT / "ml/src/archive_v3"
DEFAULT_CONFIG = "ml/config/propagation_v4.json"


STAGES: dict[str, tuple[Path, list[str], str]] = {
    "inventory": (V3 / "inventory.py", ["--output", "ml/data/manifests/propagation_v4_environment.json"], "none"),
    "download": (V3 / "download_sources.py", [], "all-sources"),
    "space-weather": (V3 / "build_space_weather.py", [], "all-sources"),
    "source-manifest": (V3 / "build_source_manifest.py", [], "all-sources"),
    "bronze": (V3 / "build_bronze.py", [], "development"),
    "opportunities-hf": (V3 / "build_opportunities.py", ["--task", "hf"], "development"),
    "opportunities-6m": (V3 / "build_opportunities.py", ["--task", "6m"], "development"),
    "features-hf": (V3 / "build_features.py", ["--task", "hf"], "development"),
    "features-6m": (V3 / "build_features.py", ["--task", "6m"], "development"),
    "audit-hf": (ROOT / "ml/src/archive_v4/audit_development.py", ["--task", "hf"], "development"),
    "audit-6m": (ROOT / "ml/src/archive_v4/audit_development.py", ["--task", "6m"], "development"),
    "sample-hf": (ROOT / "ml/src/archive_v4/build_balanced_sample.py", ["--task", "hf"], "development"),
    "train-validation": (ROOT / "ml/src/archive_v4/train_validation.py", [], "development"),
    "rolling-validation": (ROOT / "ml/src/archive_v4/rolling_validation.py", [], "development"),
    "detailed-validation": (ROOT / "ml/src/archive_v4/detailed_validation.py", [], "development"),
    "report-artifact": (ROOT / "ml/src/archive_v4/generate_report_artifact.py", [], "development"),
    "package-serving": (ROOT / "ml/src/archive_v4/package_serving_bundle.py", [], "development"),
    "source-outage-validation": (ROOT / "ml/src/archive_v4/validate_source_outage.py", [], "development"),
    "train-6m": (ROOT / "ml/src/archive_v4/train_6m_validation.py", [], "development"),
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
    "sample-hf",
]


def environment(config: dict, profile: str) -> dict[str, str]:
    env = dict(os.environ)
    env["PROPULSE_ARCHIVE_NAMESPACE"] = config["archive_namespace"]
    env.setdefault("MPLCONFIGDIR", "/tmp/propulse-matplotlib")
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
    script, extra, scope = STAGES[stage]
    command = [sys.executable, str(script)]
    if stage != "inventory":
        scoped_path = ROOT / f"ml/data/manifests/propagation_v4_{scope}.json"
        write_scoped_config(config, scope, scoped_path)
        command.extend(["--config", str(scoped_path)])
    command.extend(extra)
    if force and stage in {
        "download",
        "bronze",
        "opportunities-hf",
        "opportunities-6m",
        "features-hf",
        "features-6m",
        "sample-hf",
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
