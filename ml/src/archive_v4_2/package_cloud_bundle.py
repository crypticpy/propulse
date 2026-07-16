#!/usr/bin/env python3
"""Create a deterministic private cloud bundle from the promoted A6 manifest."""

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
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(MODULE))
sys.path.insert(0, str(SERVICE))

from m5_runtime import validate_m5_runtime  # noqa: E402
from model_bundle import create_bundle_archive  # noqa: E402
from serving_manifest import sha256_file  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_RESULT_DIR = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
)
INTERNAL_MANIFEST_NAME = "retrospective_validated_internal_manifest.json"
RECEIPT_NAME = "cloud_bundle_package_receipt.json"


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"JSON artifact must be an object: {path}")
    return value


def write_new_json(path: Path, value: dict[str, Any]) -> None:
    try:
        with path.open("x", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError as error:
        raise RuntimeError(f"immutable artifact already exists: {path}") from error


def package(
    manifest_path: Path,
    output_dir: Path,
    result_dir: Path,
    *,
    generated_at: str,
    compression_threads: int,
    machine_receipt: dict[str, Any],
) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        prefix=".a6-",
        suffix=".tar.zst",
        dir=output_dir,
    )
    os.close(descriptor)
    temporary_path = Path(temporary)
    temporary_path.unlink()
    try:
        archive = create_bundle_archive(
            manifest_path,
            temporary_path,
            compression_threads=compression_threads,
        )
        final_path = output_dir / f"{archive['sha256']}.tar.zst"
        if final_path.exists():
            if (
                final_path.stat().st_size != archive["bytes"]
                or sha256_file(final_path) != archive["sha256"]
            ):
                raise RuntimeError("existing cloud bundle differs")
            temporary_path.unlink()
        else:
            os.replace(temporary_path, final_path)
        receipt = {
            "schema_version": 1,
            "generated_at": generated_at,
            "release_stage": "retrospective_validated_internal",
            "object": {
                "bucket": "propagation-models",
                "key": f"a6/{archive['sha256']}.tar.zst",
                "bytes": archive["bytes"],
                "sha256": archive["sha256"],
            },
            "members": archive["members"],
            "compression": {
                "format": "tar.zst",
                "zstd_level": 10,
                "threads": compression_threads,
            },
            "machine": machine_receipt,
        }
        receipt_path = result_dir / RECEIPT_NAME
        write_new_json(receipt_path, receipt)
        return final_path, receipt_path
    finally:
        temporary_path.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--result-dir", type=Path, default=DEFAULT_RESULT_DIR)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--compression-threads", type=int)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_json(args.config)
    machine = validate_m5_runtime(config)
    external_root = Path(config["compute"]["external_root"])
    bundle_dir = (
        external_root / "models/archive_v4_2" / config["run_id"] / "serving"
    )
    manifest_path = args.manifest or bundle_dir / INTERNAL_MANIFEST_NAME
    output_dir = args.output_dir or external_root / "cloud_bundles/a6"
    threads = args.compression_threads or int(
        config["compute"]["apple_silicon"]["performance_cores"]
    )
    generated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    archive_path, receipt_path = package(
        manifest_path,
        output_dir,
        args.result_dir,
        generated_at=generated_at,
        compression_threads=threads,
        machine_receipt={
            "machine": machine["machine"],
            "physical_cores_visible": machine["physical_cores_visible"],
            "core_clusters": machine["core_clusters"],
            "unified_memory_gb": machine["unified_memory_gb"],
            "power_source": machine["power_source"],
            "thermal_limits": machine["thermal_limits"],
            "python_version": machine["python_version"],
        },
    )
    print(archive_path)
    print(receipt_path)


if __name__ == "__main__":
    main()
