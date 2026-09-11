"""Clone, pin, build and inventory the official ITU-R HF reference.

Nothing this script downloads is committed. Only `manifest.json` (this
script's output) and `golden-v1.json` (the generator's output) enter git.

    python3 -m ml.propagation_validation.reference.build          # from repo root
    scripts/propagation-reference-fetch                           # wrapper

The build directory defaults to `ml/propagation_validation/reference/.build/`
which is gitignored.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

if __package__ in (None, ""):  # direct `python3 build.py`
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from reference.runner import (  # type: ignore[no-redef]
        COMMIT, DEFAULT_BUILD_DIR, HERE, REPOSITORY, SOURCE_DIRNAME, TAG,
        ReferenceBuild,
    )
else:
    from .runner import (
        COMMIT, DEFAULT_BUILD_DIR, HERE, REPOSITORY, SOURCE_DIRNAME, TAG,
        ReferenceBuild,
    )

MANIFEST_PATH = HERE / "manifest.json"
MANIFEST_SCHEMA_VERSION = 1

# The reference ships no LICENSE file. The rights statement lives in the
# source headers; this is the canonical location and the verbatim wording is
# copied into the manifest so a reviewer never has to re-clone to read it.
LICENCE_LOCATION = "ITURHFProp/Src/ITURHFProp/ITURHFProp.c"
LICENCE_LINE_RANGE = [59, 76]
RIGHTS_STATEMENT = (
    "The ITURHFProp, P533 and P372 software has been developed "
    "collaboratively by participants in ITU-R Study Group 3. It may be used "
    "by implementers in their implementation of the Recommendation as well "
    "as in revisions of the specific original Recommendation and in other "
    "ITU Recommendations, free from any copyright assertions. This software "
    "is provided \"as is\" WITH NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING "
    "BUT NOT LIMITED TO, THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A "
    "PARTICULAR PURPOSE AND NON-INFRINGEMENT OF INTELLECTUAL PROPERTY "
    "RIGHTS. The ITU shall not be held liable in any event for any damages "
    "whatsoever (including, without limitation, damages for loss of profits, "
    "business interruption, loss of information, or any other pecuniary "
    "loss) arising out of or related to use of the software."
)

# The only data directory the golden runs read: DataFilePath in every
# rendered input points here. P533/Data and ITURHFProp/Data are byte-identical
# copies plus an antenna-pattern tree, rolled up rather than itemised.
COEFFICIENT_DIR = "P372/Data"
ROLLUP_DIRS = ("P533/Data", "ITURHFProp/Data")

BUILD_TARGETS = (
    ("P372/Linux", "-I../Src/P372/", "-dynamiclib -lm"),
    ("P533/Linux", "-I../Src/P533/", "-dynamiclib -lm"),
    ("ITURHFProp/Linux", "", "-lm"),
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], cwd: Path) -> str:
    completed = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    if completed.returncode:
        raise RuntimeError(
            f"command failed ({completed.returncode}): {' '.join(command)}\n"
            f"{completed.stdout}\n{completed.stderr}"
        )
    return completed.stdout


def tool_version(command: list[str]) -> str:
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError) as error:
        return f"unavailable: {error}"
    text = (result.stdout or result.stderr).strip().splitlines()
    return text[0] if text else "unknown"


def ensure_clone(source: Path) -> None:
    if not (source / ".git").exists():
        source.parent.mkdir(parents=True, exist_ok=True)
        run(
            ["git", "clone", "--quiet", "--depth", "1", "--branch", TAG,
             REPOSITORY, str(source)],
            source.parent,
        )
    actual = subprocess.check_output(
        ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
    ).strip()
    if actual != COMMIT:
        raise RuntimeError(
            f"pinned commit mismatch: clone is at {actual}, contract pins {COMMIT}"
        )


def build_native(source: Path) -> tuple[list[list[str]], float]:
    commands: list[list[str]] = []
    system = platform.system()
    if system not in ("Darwin", "Linux"):
        raise RuntimeError(f"unsupported reference build platform: {system}")
    started = time.monotonic()
    for directory, include, darwin_link in BUILD_TARGETS:
        cwd = source / directory
        clean = ["make", "clean"]
        subprocess.run(clean, cwd=cwd, capture_output=True, text=True)
        commands.append(clean)
        if system == "Darwin":
            # The upstream Makefiles assume GNU ld (`-shared -z muldefs`);
            # clang on macOS needs -dynamiclib and rejects -z muldefs.
            command = [
                "make", "all", "CC=clang",
                f"CFLAGS=-std=c99 -fPIC -Wall -Wextra -O2 {include}".rstrip(),
                f"LDFLAGS={darwin_link}",
            ]
        else:
            command = ["make", "all"]
        run(command, cwd)
        commands.append(command)
    return commands, round(time.monotonic() - started, 3)


def inventory(source: Path) -> dict[str, Any]:
    coefficient_root = source / COEFFICIENT_DIR
    files = sorted(p for p in coefficient_root.iterdir() if p.is_file())
    entries = [
        {
            "path": f"{COEFFICIENT_DIR}/{path.name}",
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }
        for path in files
    ]
    rollups = []
    for directory in ROLLUP_DIRS:
        root = source / directory
        members = sorted(p for p in root.rglob("*") if p.is_file())
        digests = [f"{p.relative_to(root).as_posix()}:{sha256_file(p)}" for p in members]
        rollups.append(
            {
                "path": directory,
                "file_count": len(members),
                "bytes": sum(p.stat().st_size for p in members),
                "tree_sha256": hashlib.sha256(
                    "\n".join(digests).encode("utf-8")
                ).hexdigest(),
                "note": (
                    "Rolled up, not itemised: unused by the golden runs "
                    "(DataFilePath points at P372/Data) and dominated by "
                    "antenna-pattern files."
                ),
            }
        )
    return {
        "coefficient_files": entries,
        "coefficient_total_bytes": sum(entry["bytes"] for entry in entries),
        "other_data_trees": rollups,
    }


def build_manifest(source: Path, build_dir: Path) -> dict[str, Any]:
    ensure_clone(source)
    commands, build_seconds = build_native(source)
    reference = ReferenceBuild(source)
    reference.require()
    artifacts = [
        {
            "path": path.relative_to(source).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }
        for path in (
            reference.executable,
            reference.p533_library,
            reference.p372_library,
        )
    ]
    data = inventory(source)
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "source": {
            "repository": REPOSITORY,
            "tag": TAG,
            "commit": COMMIT,
            "vendored": False,
            "build_dir": str(build_dir.relative_to(Path.cwd()))
            if build_dir.is_relative_to(Path.cwd())
            else str(build_dir),
        },
        "version": {
            "recommendations": ["ITU-R P.533-14", "ITU-R P.372-15"],
            "self_reported": reference.version(),
            "note": (
                "Official tag v14.3 self-reports 'P533 Version: 14.2'. Both "
                "values are recorded; neither is corrected."
            ),
        },
        "rights": {
            "licence_file": None,
            "licence_text_location": LICENCE_LOCATION,
            "licence_text_lines": LICENCE_LINE_RANGE,
            "statement": RIGHTS_STATEMENT,
            "redistribution": (
                "Not committed and not redistributed: no source, binary or "
                "coefficient file from the pinned repository enters Propulse "
                "git. Reproduce locally from the pinned commit."
            ),
        },
        "toolchain": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "cc": tool_version(["cc", "--version"]),
            "make": tool_version(["make", "--version"]),
            "cmake": tool_version(["cmake", "--version"]),
            "emcc": tool_version(["emcc", "--version"]),
            "git": tool_version(["git", "--version"]),
        },
        "build": {
            "commands": commands,
            "seconds": build_seconds,
            "artifacts": artifacts,
            "note": (
                "ITURHFProp dlopen()s libp533.so which dlopen()s libp372.so; "
                "the executable itself links only libSystem."
            ),
        },
        "data": data,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-dir", type=Path, default=DEFAULT_BUILD_DIR)
    parser.add_argument("--output", type=Path, default=MANIFEST_PATH)
    args = parser.parse_args(argv)
    build_dir = args.build_dir.resolve()
    source = build_dir / SOURCE_DIRNAME
    manifest = build_manifest(source, build_dir)
    args.output.write_text(
        json.dumps(manifest, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {args.output} ({args.output.stat().st_size} bytes)")
    print(f"native build: {manifest['build']['seconds']} s")
    print(
        f"coefficient files: {len(manifest['data']['coefficient_files'])} "
        f"({manifest['data']['coefficient_total_bytes']} bytes)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
