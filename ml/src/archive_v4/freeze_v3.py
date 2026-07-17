#!/usr/bin/env python3
"""Create a reproducible checksum inventory for the published V3 evidence."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RESULT_DIR = ROOT / "ml/results/archive_v3/archive_v3_eight_month"
OUTPUT = RESULT_DIR / "manifests/v3_release_freeze.json"
BASELINE_COMMIT = "95d1e68"
FREEZE_TAG = "propagation-v3-evidence-v1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def collect_model_paths(value: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "model_path" and isinstance(child, str):
                found.add(child)
                model_path = Path(child)
                if model_path.suffix == ".json":
                    found.add(
                        model_path.with_suffix(".isotonic.joblib").as_posix()
                    )
            else:
                found.update(collect_model_paths(child))
    elif isinstance(value, list):
        for child in value:
            found.update(collect_model_paths(child))
    return found


def is_portable_evidence(path: Path) -> bool:
    return path.name != ".DS_Store" and not path.name.startswith("._")


def main() -> None:
    evidence = [
        ROOT / "ml/config/archive_v3_eight_month.json",
        ROOT / "ml/ARCHIVE-MULTIMONTH-V3-PLAN.md",
        ROOT / "ml/ARCHIVE-MULTIMONTH-V3-RESULTS.md",
    ]
    evidence.extend(
        path
        for path in RESULT_DIR.rglob("*")
        if path.is_file() and path != OUTPUT and is_portable_evidence(path)
    )
    evidence = sorted(set(evidence))

    artifacts = []
    model_paths: set[str] = set()
    for path in evidence:
        artifacts.append(
            {
                "path": relative(path),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "status": "present",
            }
        )
        if path.suffix == ".json":
            try:
                model_paths.update(collect_model_paths(json.loads(path.read_text())))
            except json.JSONDecodeError:
                pass

    models = []
    for model_path in sorted(model_paths):
        path = ROOT / model_path
        if path.exists():
            models.append(
                {
                    "path": model_path,
                    "bytes": path.stat().st_size,
                    "sha256": sha256(path),
                    "status": "present",
                }
            )
        else:
            models.append(
                {
                    "path": model_path,
                    "status": "missing_on_this_machine",
                    "required_action": "hash and freeze on the M5 before V4 scoring",
                }
            )

    payload = {
        "manifest_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "baseline_commit": BASELINE_COMMIT,
        "freeze_tag": FREEZE_TAG,
        "run_id": "archive_v3_eight_month",
        "evidence_artifacts": artifacts,
        "model_artifacts": models,
        "complete": bool(models) and all(
            item["status"] == "present" for item in models
        ),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(
        f"wrote {relative(OUTPUT)} with {len(artifacts)} evidence files "
        f"and {len(models)} model references"
    )
    if not payload["complete"]:
        raise SystemExit("V3 freeze is incomplete; required model artifacts are missing")


if __name__ == "__main__":
    main()
