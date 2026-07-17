#!/usr/bin/env python3
"""Validate the frozen V4.1 plan, config, and initial protocol state."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CONFIG_PATH = ROOT / "ml/config/propagation_v4_1.json"
SCHEMA_PATH = ROOT / "ml/config/propagation_v4_1.schema.json"
PLAN_PATH = ROOT / "ml/PERSONALIZED-PROPAGATION-V4.1-CALIBRATION-PLAN.md"
MANIFEST_PATH = ROOT / "ml/results/propagation_v4_1/preregistration/run_manifest.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    config = load(CONFIG_PATH)
    schema = load(SCHEMA_PATH)
    manifest = load(MANIFEST_PATH)
    plan = PLAN_PATH.read_text(encoding="utf-8")

    require(config["run_id"] == manifest["run_id"], "run_id mismatch")
    require(config["plan_commit"] == manifest["plan_commit"], "plan commit mismatch")
    require(
        config["parent_evidence_commit"] == manifest["parent_evidence_commit"],
        "parent evidence mismatch",
    )
    require(config["archive_namespace"] == "archive_v4_1", "namespace changed")
    require(config["seed"] == 20260712, "seed changed")
    require(schema["properties"]["run_id"]["const"] == config["run_id"], "schema mismatch")

    roles = config["data_roles"]
    expected = {
        "calibration_development": ["2024-02", "2024-04", "2024-05", "2024-08"],
        "new_calibration_sources": ["2024-02", "2024-05", "2024-08"],
        "observed_engineering": ["2024-10"],
        "untouched_development_gate": ["2024-11"],
        "reserved_future_version": ["2024-12"],
        "locked_archive_test": ["2025-01", "2025-04", "2025-07", "2025-10"],
    }
    for name, months in expected.items():
        require(roles[name] == months, f"{name} changed")

    list_roles = {
        name: set(value)
        for name, value in roles.items()
        if isinstance(value, list)
    }
    disjoint = [
        "new_calibration_sources",
        "observed_engineering",
        "untouched_development_gate",
        "reserved_future_version",
        "locked_archive_test",
    ]
    for index, left in enumerate(disjoint):
        for right in disjoint[index + 1 :]:
            require(not list_roles[left] & list_roles[right], f"{left}/{right} overlap")

    require(len(roles["frozen_core_train"]) == 24, "frozen training months changed")
    require(config["calibration"]["candidate_ids"] == [
        "C0_identity",
        "C1_global_isotonic",
        "C2_per_band_isotonic",
        "C3_hierarchical_isotonic",
        "C4_guarded_hierarchical_isotonic",
    ], "calibrator candidates changed")
    require(config["calibration"]["bootstrap_repetitions"] == 2000, "bootstrap changed")
    require(config["calibration"]["minimum_rows"] == 10000, "support threshold changed")
    require(config["compute"]["required_profile"] == "m5", "M5 requirement changed")

    prospective = roles["locked_prospective_test"]
    require(
        date.fromisoformat(prospective["start"]) <= date.fromisoformat(prospective["end"]),
        "prospective range reversed",
    )
    require(manifest["protocol_state"] in {
        "preregistered",
        "development_opened",
        "candidate_frozen",
        "november_gate_opened",
        "development_approved",
        "development_failed",
        "locked_archive_opened",
    }, "unknown protocol state")
    access = manifest["outcome_access"]
    require(access["2024-12"] is False, "reserved 2024-12 was accessed")
    require(
        access["2024-11"] is manifest["november_gate_opened"],
        "November access flag mismatch",
    )
    require(
        all(access[month] is manifest["locked_archive_test_opened"] for month in expected["locked_archive_test"]),
        "locked 2025 access flag mismatch",
    )
    if manifest["development_outcomes_opened"]:
        require(
            all(access[month] for month in expected["new_calibration_sources"]),
            "development access is incomplete",
        )
    else:
        require(
            not any(access[month] for month in expected["new_calibration_sources"]),
            "development access marked before opening",
        )
    if manifest["development_gates_passed"]:
        require(manifest["november_gate_opened"], "approval without November gate")
    if manifest["locked_archive_test_opened"]:
        require(manifest["development_gates_passed"], "2025 opened without approval")
    for name, item in manifest["frozen_artifacts"].items():
        require(len(item.get("sha256", "")) == 64, f"invalid frozen hash: {name}")
        require(item.get("bytes", 0) > 0, f"invalid frozen size: {name}")

    required_phrases = [
        "locked 2025 outcomes",
        "use November 2024 exactly once",
        "do not build or train the 100M cohort during V4.1",
        "M5-only",
    ]
    for phrase in required_phrases:
        require(phrase in plan, f"plan boundary missing: {phrase}")

    print(
        "V4.1 preregistration: OK "
        f"(state={manifest['protocol_state']}; 3 new development months, "
        "1 untouched November gate, 4 locked 2025 months)"
    )


if __name__ == "__main__":
    main()
