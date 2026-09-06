#!/usr/bin/env python3
"""Fill in ``bytes``/``sha256`` for a phase-0 evaluation-inputs config.

``ml/config/propagation_v4_2_v2.json`` ships with ``null`` placeholders because
the V2 datasets are built after the config is written. Once they exist, run
this script to stamp the observed size and checksum of every input in place.
Existing non-null values are verified, not overwritten, so a stamped config
doubles as a freeze.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]


class InventoryError(RuntimeError):
    """Raised when an evaluation input is missing or has changed."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def inventory(
    config: dict[str, Any], *, verify_only: bool = False
) -> tuple[dict[str, Any], list[str]]:
    """Stamp every ``diagnosis.inputs`` entry; return the config and a log."""
    inputs = config["diagnosis"]["inputs"]
    log: list[str] = []
    for month in sorted(inputs):
        item = inputs[month]
        path = ROOT / str(item["path"])
        if not path.is_file():
            raise InventoryError(f"evaluation input is missing: {item['path']}")
        observed_bytes = path.stat().st_size
        observed_sha = sha256(path)
        recorded_bytes = item.get("bytes")
        recorded_sha = item.get("sha256")
        if recorded_bytes is not None and int(recorded_bytes) != observed_bytes:
            raise InventoryError(f"evaluation input size changed: {item['path']}")
        if recorded_sha is not None and str(recorded_sha) != observed_sha:
            raise InventoryError(f"evaluation input hash changed: {item['path']}")
        if recorded_bytes is None or recorded_sha is None:
            if verify_only:
                raise InventoryError(
                    f"evaluation input is not stamped: {item['path']}"
                )
            item["bytes"] = observed_bytes
            item["sha256"] = observed_sha
            log.append(f"stamped {month}: {observed_bytes} bytes {observed_sha}")
        else:
            log.append(f"verified {month}: {observed_bytes} bytes {observed_sha}")
    return config, log


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Fail instead of stamping when an entry still has placeholders.",
    )
    args = parser.parse_args()
    config_path = Path(args.config).resolve()
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config, log = inventory(config, verify_only=args.verify_only)
    if not args.verify_only:
        atomic_write(config_path, config)
    for line in log:
        print(line)
    print(config_path)


if __name__ == "__main__":
    main()
