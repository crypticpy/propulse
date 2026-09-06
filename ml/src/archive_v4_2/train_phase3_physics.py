#!/usr/bin/env python3
"""Train the V4.2 physics component under archive-v4-features-v2.

The V1 chain reused the frozen ``M1_physics`` booster from
``propagation_v4_multiyear_50m``. That booster consumes ``ae``, ``al``, ``au``
and ``pcn`` -- raw OMNI2 channels the operational collector cannot supply --
so it cannot back the physics fallback under the V2 contract.

This script retrains ``M1_physics`` on the V2 physics feature order (the V2
nowcast order minus the eight path-history lags) using the same fit path as
``train_phase2_scale``: the A4_recent_cycle 50M cohort for training and the
2024-07 early-stopping sample for validation, followed by the same calibrator
selection on the August calibration sample. The result is written into
``training_50m_results.json`` under a ``physics`` key, where
``package_phase3_candidate`` picks it up instead of copying the V1 physics.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
V4 = ROOT / "ml/src/archive_v4"
MODULE = Path(__file__).resolve().parent
for path in (V4, MODULE):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from phase2_core import Phase2Error, validate_config  # noqa: E402
from feature_contract import CORE_FEATURE_CONTRACT_V2, core_feature_contract  # noqa: E402
from train_phase2_scale import (  # noqa: E402
    atomic_write,
    contract_physics_features,
    ensure_model_root,
    load_json,
    train_fold,
    utc_now,
    validate_m5_runtime,
)
import run_paths  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
PHYSICS_COMPONENT = "M1_physics"
PHYSICS_SCALE = 50_000_000
#: The physics component reuses the recent-cycle cohort, which is the training
#: family the A6 policy's left component is built from.
PHYSICS_COHORT_CANDIDATE = "A4_recent_cycle"


def physics_cohort_candidate(config: dict[str, Any]) -> str:
    candidate = str(config["conditional_policy"]["left"])
    if candidate != PHYSICS_COHORT_CANDIDATE:
        raise Phase2Error(
            f"physics cohort contract changed: expected {PHYSICS_COHORT_CANDIDATE}, "
            f"got {candidate}"
        )
    return candidate


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Retrain even when a physics component is already recorded.",
    )
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    validate_config(config)
    if core_feature_contract(config) != CORE_FEATURE_CONTRACT_V2:
        raise Phase2Error(
            "physics retraining is only defined for archive-v4-features-v2; "
            "the V1 chain copies the frozen propagation_v4 physics component"
        )
    runtime = validate_m5_runtime(config)
    candidate = physics_cohort_candidate(config)
    fold = str(config["final_fold"])
    manifest_path = run_paths.cohort_manifest_path(config, PHYSICS_SCALE)
    manifest = load_json(manifest_path)
    if int(manifest["scale"]) != PHYSICS_SCALE:
        raise Phase2Error("cohort manifest scale mismatch")
    if manifest["december_2024_read"] or manifest["locked_2025_read"]:
        raise Phase2Error("cohort manifest reports locked outcome access")
    if candidate not in manifest["cohorts"]:
        raise Phase2Error(
            f"the 50M cohort manifest has no {candidate} cohort to train physics on"
        )
    if fold not in manifest["cohorts"][candidate]:
        raise Phase2Error(f"the 50M {candidate} cohort has no {fold} fold")

    result_path = run_paths.training_results_path(config, PHYSICS_SCALE)
    if not result_path.is_file():
        raise Phase2Error(
            f"train the 50M nowcast candidates before physics: {result_path}"
        )
    output = load_json(result_path)
    if output.get("physics") is not None and not args.force:
        print(f"reuse {PHYSICS_COMPONENT}", flush=True)
        print(result_path)
        return

    features = contract_physics_features(config)
    external_models, repository_models = ensure_model_root(config, PHYSICS_SCALE)
    print(
        f"train {PHYSICS_COMPONENT} on {candidate} {fold} "
        f"with {len(features)} features",
        flush=True,
    )
    result = train_fold(
        candidate,
        fold,
        config,
        manifest,
        PHYSICS_SCALE,
        features,
        external_models,
        repository_models,
        previous=None,
        model_stem=f"{PHYSICS_COMPONENT}_{fold}",
    )
    result["candidate"] = PHYSICS_COMPONENT
    result["component"] = PHYSICS_COMPONENT
    result["cohort_candidate"] = candidate
    result["core_feature_contract"] = CORE_FEATURE_CONTRACT_V2
    output["physics"] = result
    output["hardware_runtime"] = runtime
    output["generated_at"] = utc_now()
    atomic_write(result_path, output)
    print(result_path)


if __name__ == "__main__":
    main()
