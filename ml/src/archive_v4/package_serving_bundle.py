#!/usr/bin/env python3
"""Package checksumed development-shadow M1/M2 artifacts for inference."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(V3))
from common import MODELS, RESULTS, load_config, sha256, utc_now, write_json  # noqa: E402


def profile_item(
    source: dict[str, Any],
    bundle_dir: Path,
    profile_name: str,
) -> dict[str, Any]:
    model_source = ROOT / source["model_path"]
    calibrator_source = ROOT / source["calibrator_path"]
    model_target = bundle_dir / f"{profile_name}.json"
    calibrator_target = bundle_dir / f"{profile_name}.isotonic.joblib"
    shutil.copy2(model_source, model_target)
    shutil.copy2(calibrator_source, calibrator_target)
    return {
        "model_path": model_target.name,
        "model_sha256": sha256(model_target),
        "calibrator_path": calibrator_target.name,
        "calibrator_sha256": sha256(calibrator_target),
        "features": source["features"],
        "best_iteration": source["best_iteration"],
        "calibration_method": source["calibration_method"],
        "top_factors": [
            row["feature"] for row in source.get("feature_importance_gain", [])[:8]
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--allow-development-cap", action="store_true")
    args = parser.parse_args()
    config = load_config(args.config)
    result_path = RESULTS / config["run_id"] / "development_results.json"
    results = json.loads(result_path.read_text(encoding="utf-8"))
    candidates = results["candidates"]
    physics = candidates["M1_physics"]
    nowcast = candidates["M2_nowcast"]
    cap = int(nowcast["train_cap"])
    expected = int(config["sampling"]["primary_train_rows"])
    if cap != expected and not args.allow_development_cap:
        raise RuntimeError(
            f"serving bundle requires the primary {expected:,}-row cap; found {cap:,}"
        )
    if int(physics["train_cap"]) != cap:
        raise RuntimeError("physics and nowcast caps differ")
    bundle_dir = MODELS / config["run_id"] / "serving"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    profiles = {
        "physics": profile_item(physics, bundle_dir, "physics"),
        "nowcast": profile_item(nowcast, bundle_dir, "nowcast"),
    }
    manifest = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "model_version": f"{config['run_id']}-development-{cap}",
        "release_stage": "development_shadow",
        "release_approved": False,
        "locked_archive_test_scored": False,
        "prospective_test_scored": False,
        "feature_contract": "station-chain-v1",
        "core_feature_contract": "archive-v4-features-v1",
        "train_cap": cap,
        "profiles": profiles,
        "limitations": [
            "This bundle is for local shadow validation only.",
            "The locked 2025 archive and 2026 prospective tests are pending.",
            "Mode probabilities other than WSPR remain engineering estimates.",
        ],
    }
    write_json(bundle_dir / "serving_manifest.json", manifest)
    print(bundle_dir / "serving_manifest.json")


if __name__ == "__main__":
    main()
