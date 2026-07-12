"""Create V3-compatible configs without widening V4.1 outcome access."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from protocol import ProtocolError, assert_exact_months, authorize_scope


def transform_config(
    config: dict[str, Any],
    manifest: dict[str, Any],
    scope: str,
) -> dict[str, Any]:
    value = copy.deepcopy(config)
    scoped_run_id = config["run_id"]
    if scope == "calibration-development":
        months = authorize_scope(
            config,
            manifest,
            scope,
            config["data_roles"]["new_calibration_sources"],
        )
        train: list[str] = []
        validation = months
        test: list[str] = []
    elif scope == "november-gate":
        requested = config["data_roles"]["untouched_development_gate"]
        months = (
            assert_exact_months(requested, requested, scope)
            if manifest["november_gate_opened"]
            else authorize_scope(config, manifest, scope, requested)
        )
        train = []
        validation = []
        test = months
        scoped_run_id = f"{config['run_id']}_november_gate"
    elif scope == "locked-archive":
        requested = config["data_roles"]["locked_archive_test"]
        if manifest["locked_archive_test_opened"]:
            if not manifest["development_gates_passed"]:
                raise ProtocolError(
                    "opened locked archive is inconsistent with development decision"
                )
            months = assert_exact_months(requested, requested, scope)
        else:
            months = authorize_scope(config, manifest, scope, requested)
        train = []
        validation = []
        test = months
        scoped_run_id = f"{config['run_id']}_locked_archive"
    else:
        raise ValueError(f"unknown V4.1 transform scope: {scope}")
    return {
        "run_id": scoped_run_id,
        "archive_namespace": config["archive_namespace"],
        "seed": config["seed"],
        "execution_scope": scope,
        "months": months,
        "train": {"months": train},
        "validation": {"months": validation},
        "test": {"months": test},
        "negative_receivers_per_tx_slot": 4,
        "compute": config["compute"],
    }


def write_transform_config(value: dict[str, Any], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    return path
