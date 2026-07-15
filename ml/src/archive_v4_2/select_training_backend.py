#!/usr/bin/env python3
"""Apply the preregistered Phase 2 matrix-backend decision gates."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE))

from phase2_core import select_training_backend, validate_config  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    validate_config(config)
    result_dir = ROOT / "ml/results/propagation_v4_2" / config["run_id"]
    external_path = result_dir / "backend_benchmark_external_memory_quantile.json"
    in_memory_path = result_dir / "backend_benchmark_streamed_in_memory_quantile.json"
    external = load_json(external_path)
    in_memory = load_json(in_memory_path)
    hardware = config["compute"]["apple_silicon"]
    decision = select_training_backend(
        external,
        in_memory,
        hardware["backend_benchmark"],
        int(hardware["parallel_fit_workers"]),
    )
    output = {
        "schema_version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "scope": "training_and_early_stopping_only",
        "december_2024_read": False,
        "locked_2025_read": False,
        **decision,
        "benchmark_results": {
            "external_memory_quantile": external_path.relative_to(ROOT).as_posix(),
            "streamed_in_memory_quantile": in_memory_path.relative_to(ROOT).as_posix(),
        },
    }
    output_path = result_dir / "backend_benchmark_decision.json"
    atomic_write(output_path, output)
    print(output_path)


if __name__ == "__main__":
    main()
