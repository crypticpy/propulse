"""Derive immutable execution scopes from the frozen V4 preregistration."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any


def scoped_config(config: dict[str, Any], scope: str) -> dict[str, Any]:
    value = copy.deepcopy(config)
    train = list(config["splits"]["train"])
    validation = list(config["splits"]["validation"])
    locked = list(config["splits"]["locked_archive_test"])
    if scope == "development":
        value["months"] = train + validation
        value["train"]["months"] = train
        value["validation"]["months"] = validation
        value["test"]["months"] = []
    elif scope == "locked-archive":
        original_run_id = value["run_id"]
        value["parent_run_id"] = original_run_id
        value["space_weather_run_id"] = original_run_id
        value["run_id"] = f"{original_run_id}_locked_archive"
        value["months"] = locked
        value["train"]["months"] = []
        value["validation"]["months"] = []
        value["test"]["months"] = locked
    elif scope == "all-sources":
        value["months"] = train + validation + locked
    else:
        raise ValueError(f"unknown V4 execution scope: {scope}")
    value["execution_scope"] = scope
    return value


def write_scoped_config(config: dict[str, Any], scope: str, path: Path) -> Path:
    value = scoped_config(config, scope)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    return path
