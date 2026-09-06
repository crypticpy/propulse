#!/usr/bin/env python3
"""Build and browser-verify the synthetic V4.2 gate report."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE))

from outcome_protocol import atomic_write, load_json  # noqa: E402
from train_phase2_scale import validate_m5_runtime  # noqa: E402
import run_paths  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    args = parser.parse_args()
    config_path = Path(args.config).resolve()
    config = load_json(config_path)
    runtime = validate_m5_runtime(config)
    output_dir = run_paths.synthetic_gate_dir(config)
    output_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            str(MODULE / "generate_gate_report.py"),
            "--config",
            str(config_path),
            "--synthetic",
            "--output-dir",
            str(output_dir),
            "--profile",
            "m5",
        ],
        cwd=ROOT,
        check=True,
    )
    node = shutil.which("node") or str(Path.home() / ".local/bin/node")
    if not Path(node).is_file():
        raise RuntimeError("Node is required for the portable report builder")
    process = subprocess.run(
        [
            node,
            "ml/src/archive_v4/package_report.mjs",
            "--input",
            str(output_dir / "REPORT.artifact.json"),
            "--output",
            str(output_dir / "REPORT.html"),
        ],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    lines = [value for value in process.stdout.splitlines() if value.strip()]
    receipt = json.loads(lines[-1])
    verification = receipt.get("stages", {}).get("verification")
    html_path = output_dir / "REPORT.html"
    html = html_path.read_text(encoding="utf-8")
    checks = {
        "portable_builder_completed": bool(receipt),
        "browser_verification_passed": verification == "passed",
        "html_nonempty": html_path.stat().st_size > 100_000,
        "synthetic_label_visible": "Synthetic fixture" in html,
        "report_title_visible": "Propagation V4.2" in html,
        "no_remote_script": "<script src=\"http" not in html,
    }
    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "synthetic_gate_report_dry_run",
        "run_id": str(config["run_id"]),
        "synthetic": True,
        "december_2024_read": False,
        "locked_2025_read": False,
        "runtime": runtime,
        "builder_receipt": receipt,
        "checks": checks,
        "passed": all(checks.values()),
    }
    validation_path = output_dir / "report_validation.json"
    atomic_write(validation_path, output)
    print(validation_path)
    if not output["passed"]:
        raise RuntimeError(
            f"synthetic gate report failed: "
            f"{[name for name, passed in checks.items() if not passed]}"
        )


if __name__ == "__main__":
    main()
