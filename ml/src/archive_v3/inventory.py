"""Record the V3 execution environment and local input availability."""

from __future__ import annotations

import argparse
import importlib.metadata
import shutil
from pathlib import Path

from common import DATA, MANIFESTS, ROOT, ensure_directories, machine_inventory, relative, write_json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="ml/data/manifests/archive_v3_environment.json")
    args = parser.parse_args()
    ensure_directories()
    inventory = machine_inventory()
    inventory["storage"] = {
        relative(path): {
            "total": shutil.disk_usage(path).total,
            "used": shutil.disk_usage(path).used,
            "free": shutil.disk_usage(path).free,
        }
        for path in (ROOT, DATA)
    }
    inventory["packages"] = {}
    for package in (
        "duckdb",
        "polars",
        "pyarrow",
        "numpy",
        "scikit-learn",
        "lightgbm",
        "xgboost",
    ):
        try:
            inventory["packages"][package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            inventory["packages"][package] = None
    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT / output
    write_json(output, inventory)
    print(output)


if __name__ == "__main__":
    main()
