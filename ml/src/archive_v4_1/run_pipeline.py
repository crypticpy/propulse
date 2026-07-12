#!/usr/bin/env python3
"""M5-only orchestration for the V4.1 calibration recovery experiment."""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

from protocol import (
    DEFAULT_CONFIG,
    DEFAULT_MANIFEST,
    ProtocolError,
    freeze_artifact,
    load_json,
    record_development_access,
)
from scoped_config import transform_config, write_transform_config


ROOT = Path(__file__).resolve().parents[3]
V3 = ROOT / "ml/src/archive_v3"
V41 = ROOT / "ml/src/archive_v4_1"
RESULT_ROOT = ROOT / "ml/results/propagation_v4_1"


DEVELOPMENT_STAGES: tuple[tuple[str, Path, list[str]], ...] = (
    ("download", V3 / "download_sources.py", []),
    ("space-weather", V3 / "build_space_weather.py", []),
    ("source-manifest", V3 / "build_source_manifest.py", []),
    ("bronze", V3 / "build_bronze.py", []),
    ("opportunities-hf", V3 / "build_opportunities.py", ["--task", "hf"]),
    ("features-hf", V3 / "build_features.py", ["--task", "hf"]),
)


def require_m5(config: dict) -> None:
    if platform.machine() != "arm64":
        raise ProtocolError("V4.1 heavy stages require the Apple Silicon M5")
    try:
        memory = int(
            subprocess.check_output(
                ["sysctl", "-n", "hw.memsize"],
                text=True,
            ).strip()
        )
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        raise ProtocolError("cannot verify M5 memory") from error
    if memory < 100 * 1024**3:
        raise ProtocolError("V4.1 heavy stages require at least 100 GiB memory")
    for name in ("data_root", "model_root", "temp_root"):
        path = Path(config["compute"][name])
        path.mkdir(parents=True, exist_ok=True)
        if not str(path).startswith("/Volumes/Projects/PropulseML/"):
            raise ProtocolError(f"{name} is not on the approved external root")


def environment(config: dict) -> dict[str, str]:
    env = dict(os.environ)
    env.update(
        {
            "PROPULSE_ARCHIVE_NAMESPACE": config["archive_namespace"],
            "PROPULSE_ML_DATA_ROOT": config["compute"]["data_root"],
            "PROPULSE_ML_MODEL_ROOT": config["compute"]["model_root"],
            "PROPULSE_ML_TEMP_ROOT": config["compute"]["temp_root"],
            "PROPULSE_ML_RESULTS_ROOT": str(RESULT_ROOT),
            "PROPULSE_DUCKDB_THREADS": str(config["compute"]["duckdb_threads"]),
            "PROPULSE_DUCKDB_MEMORY_LIMIT": config["compute"]["duckdb_memory_limit"],
            "MPLCONFIGDIR": "/tmp/propulse-v4_1-matplotlib",
        }
    )
    return env


def run(command: list[str], config: dict) -> None:
    subprocess.run(command, cwd=ROOT, env=environment(config), check=True)


def validate(config: dict) -> None:
    run([sys.executable, str(V41 / "validate_preregistration.py")], config)


def freeze_b2(config: dict) -> None:
    output = RESULT_ROOT / "preregistration/b2_freeze.json"
    run(
        [
            sys.executable,
            str(V41 / "freeze_b2.py"),
            "--config",
            str(DEFAULT_CONFIG),
            "--output",
            str(output),
            "--profile",
            "m5",
        ],
        config,
    )
    freeze_artifact(DEFAULT_MANIFEST, "b2_freeze", output)


def score_b2_engineering(config: dict) -> None:
    output = RESULT_ROOT / "preregistration/b2_october_engineering.json"
    run(
        [
            sys.executable,
            str(V41 / "score_b2_engineering.py"),
            "--config",
            str(DEFAULT_CONFIG),
            "--output",
            str(output),
            "--profile",
            "m5",
        ],
        config,
    )
    freeze_artifact(DEFAULT_MANIFEST, "b2_engineering", output)


def prepare_development(config: dict, force: bool) -> None:
    manifest = record_development_access(
        DEFAULT_MANIFEST,
        config["data_roles"]["new_calibration_sources"],
    )
    scoped = transform_config(config, manifest, "calibration-development")
    config_path = (
        Path(config["compute"]["data_root"])
        / "manifests/propagation_v4_1_calibration_development.json"
    )
    write_transform_config(scoped, config_path)
    for name, script, extra in DEVELOPMENT_STAGES:
        print(f"\n== {name} ==", flush=True)
        command = [sys.executable, str(script), "--config", str(config_path), *extra]
        if force and name in {"download", "bronze", "opportunities-hf"}:
            command.append("--force")
        run(command, config)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "stage",
        choices=(
            "validate",
            "freeze-b2",
            "score-b2-engineering",
            "prepare-development",
        ),
    )
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    del args.profile
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    require_m5(config)
    if args.stage == "validate":
        validate(config)
    elif args.stage == "freeze-b2":
        freeze_b2(config)
    elif args.stage == "score-b2-engineering":
        score_b2_engineering(config)
    elif args.stage == "prepare-development":
        prepare_development(config, args.force)


if __name__ == "__main__":
    main()
