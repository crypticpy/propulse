#!/usr/bin/env python3
"""Clone, pin, build, and smoke-test official ITU-R HF software."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import subprocess
from pathlib import Path

from p533_adapter import Circuit, P533Runner


ROOT = Path(__file__).resolve().parents[3]
TAG = "v14.3"
COMMIT = "cd172be56dc04b154e5d2fa91cbaa6ecf5284305"
REPOSITORY = "https://github.com/ITU-R-Study-Group-3/ITU-R-HF.git"


def run(command: list[str], cwd: Path) -> None:
    completed = subprocess.run(
        command, cwd=cwd, capture_output=True, text=True
    )
    if completed.returncode:
        raise RuntimeError(
            f"command failed ({completed.returncode}): {' '.join(command)}\n"
            f"{completed.stdout}\n{completed.stderr}"
        )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def build(source: Path) -> list[list[str]]:
    commands: list[list[str]] = []
    system = platform.system()
    targets = (
        ("P372/Linux", "-I../Src/P372/", "-dynamiclib -lm"),
        ("P533/Linux", "-I../Src/P533/", "-dynamiclib -lm"),
        ("ITURHFProp/Linux", "", "-lm"),
    )
    for directory, include, darwin_link in targets:
        cwd = source / directory
        clean = ["make", "clean"]
        run(clean, cwd)
        commands.append(clean)
        if system == "Darwin":
            command = [
                "make",
                "all",
                "CC=clang",
                f"CFLAGS=-std=c99 -fPIC -Wall -Wextra -O2 {include}".rstrip(),
                f"LDFLAGS={darwin_link}",
            ]
        elif system == "Linux":
            command = ["make", "all"]
        else:
            raise RuntimeError(f"unsupported P.533 build platform: {system}")
        run(command, cwd)
        commands.append(command)
    return commands


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source", default="ml/data/vendor/itu-r-hf-v14.3", type=Path
    )
    parser.add_argument(
        "--output",
        default="ml/results/propagation_v4/p533_build_manifest.json",
        type=Path,
    )
    args = parser.parse_args()
    source = (
        args.source if args.source.is_absolute() else ROOT / args.source
    ).resolve()
    if not source.exists():
        source.parent.mkdir(parents=True, exist_ok=True)
        run(
            ["git", "clone", "--depth", "1", "--branch", TAG, REPOSITORY, str(source)],
            ROOT,
        )
    actual = subprocess.check_output(
        ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
    ).strip()
    if actual != COMMIT:
        raise RuntimeError(f"P.533 source commit mismatch: {actual} != {COMMIT}")
    commands = build(source)
    runner = P533Runner(source)
    smoke = runner.run(
        Circuit(
            tx_lat=30.2672,
            tx_lon=-97.7431,
            rx_lat=51.5074,
            rx_lon=-0.1278,
            year=2024,
            month=4,
            utc_hours=(0, 6, 12, 18),
            sunspot_number=100,
            frequencies_mhz=(14.1,),
        )
    )
    if len(smoke) != 4 or any(
        not 0 <= row["overall_circuit_reliability"] <= 1 for row in smoke
    ):
        raise RuntimeError("P.533 smoke fixture failed")
    artifacts = [runner.executable, runner.p533_library, runner.p372_library]
    output = args.output if args.output.is_absolute() else ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "repository": REPOSITORY,
                "tag": TAG,
                "commit": COMMIT,
                "platform": platform.platform(),
                "architecture": platform.machine(),
                "commands": commands,
                "self_reported_version": runner.version(),
                "version_note": (
                    "Official tag v14.3 self-reports P533 14.2; preserve both values."
                ),
                "artifacts": [
                    {
                        "path": str(path.relative_to(source)),
                        "bytes": path.stat().st_size,
                        "sha256": sha256(path),
                    }
                    for path in artifacts
                ],
                "smoke_fixture": {
                    "name": "Austin-to-London 20m four-hour circuit",
                    "rows": smoke,
                },
                "redistribution": (
                    "Source is not vendored; reproduce from the pinned official repository."
                ),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(output)


if __name__ == "__main__":
    main()
