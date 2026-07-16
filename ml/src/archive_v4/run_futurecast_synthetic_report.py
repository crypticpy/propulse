#!/usr/bin/env python3
"""Generate, package, and browser-verify the FutureCast synthetic report."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from generate_futurecast_report import ROOT, atomic_json


MODULE = Path(__file__).resolve().parent
DEFAULT_OUTPUT = ROOT / "ml/results/propagation_v4/futurecast_v1_synthetic_e2e"
RUNTIME_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V4_2 = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(V4_2))

from m5_runtime import validate_m5_runtime  # noqa: E402


def portable_builder_receipt(builder: dict, html_path: Path) -> dict:
    receipt = dict(builder)
    receipt["html"] = html_path.resolve().relative_to(ROOT).as_posix()
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--example-manifest", type=Path, required=True)
    parser.add_argument("--training-manifest", type=Path, required=True)
    parser.add_argument("--p533-manifest", type=Path, required=True)
    parser.add_argument("--gate-result", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    runtime = validate_m5_runtime(json.loads(RUNTIME_CONFIG.read_text(encoding="utf-8")))
    output = args.output_dir.expanduser().resolve()
    if not output.is_relative_to(ROOT):
        raise RuntimeError("FutureCast report output must remain inside the repository")
    command = [
        sys.executable,
        str(MODULE / "generate_futurecast_report.py"),
        "--profile",
        "m5",
        "--source-manifest",
        str(args.source_manifest),
        "--example-manifest",
        str(args.example_manifest),
        "--training-manifest",
        str(args.training_manifest),
        "--p533-manifest",
        str(args.p533_manifest),
        "--gate-result",
        str(args.gate_result),
        "--output-dir",
        str(output),
    ]
    subprocess.run(command, cwd=ROOT, check=True)
    node = shutil.which("node") or str(Path.home() / ".local/bin/node")
    if not Path(node).is_file():
        raise RuntimeError("Node is required for the canonical report packager")
    process = subprocess.run(
        [
            node,
            "ml/src/archive_v4/package_report.mjs",
            "--input",
            str(output / "REPORT.artifact.json"),
            "--output",
            str(output / "REPORT.html"),
        ],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    lines = [line for line in process.stdout.splitlines() if line.strip()]
    html_path = output / "REPORT.html"
    builder = portable_builder_receipt(json.loads(lines[-1]), html_path)
    html = html_path.read_text(encoding="utf-8")
    checks = {
        "canonical_builder_completed": bool(builder.get("ok")),
        "browser_verification_passed": builder.get("stages", {}).get("verification") == "passed",
        "html_nonempty": html_path.stat().st_size > 100_000,
        "synthetic_scope_visible": "synthetic end-to-end" in html.lower(),
        "withheld_decision_visible": "withheld" in html.lower(),
        "no_remote_script": '<script src="http' not in html,
    }
    receipt = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "futurecast_v1_synthetic_report_delivery",
        "data_scope": "synthetic_fixture",
        "release_approved": False,
        "runtime": runtime,
        "builder_receipt": builder,
        "checks": checks,
        "passed": all(checks.values()),
    }
    atomic_json(output / "DELIVERY_RECEIPT.json", receipt)
    print(output / "DELIVERY_RECEIPT.json")
    if not receipt["passed"]:
        raise RuntimeError(
            "FutureCast report delivery failed: "
            + ", ".join(name for name, passed in checks.items() if not passed)
        )


if __name__ == "__main__":
    main()
