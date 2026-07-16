"""Fail-closed runtime activation shared by the inference service."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
ACTIVATION_PATH = (
    ROOT / "ml/config/propagation_v4_2_runtime_activation.json"
)
ELIGIBILITY_PATH = (
    ROOT / "ml/config/propagation_v4_2_runtime_eligibility.json"
)
RUNTIME_MODES = frozenset({
    "system_health_view",
    "beta_collection",
    "core_nowcast",
    "stationcast_deterministic",
    "stationcast_learned",
    "futurecast",
    "six_meter",
})


@dataclass(frozen=True)
class RuntimeActivation:
    approved_modes: frozenset[str]
    errors: tuple[str, ...] = ()

    def allows(self, mode: str) -> bool:
        return not self.errors and mode in self.approved_modes


def evaluate_runtime_activation(
    activation: dict[str, Any],
    eligibility: dict[str, Any],
) -> RuntimeActivation:
    errors: list[str] = []
    if activation.get("schema_version") != 1:
        errors.append("activation_schema")
    if activation.get("scope") != "phase6_runtime_activation":
        errors.append("activation_scope")
    if activation.get("locked_prospective_outcomes_read") is not False:
        errors.append("activation_outcome_boundary")
    approved = activation.get("approved_modes")
    if not isinstance(approved, list) or not all(
        isinstance(mode, str) and mode in RUNTIME_MODES for mode in approved
    ):
        errors.append("activation_modes")
        approved_modes: frozenset[str] = frozenset()
    else:
        approved_modes = frozenset(approved)
        if len(approved_modes) != len(approved):
            errors.append("activation_mode_duplicates")

    state = activation.get("activation_state")
    recorded = activation.get("product_activation_recorded")
    if state == "disabled":
        if recorded is not False or approved_modes:
            errors.append("disabled_activation_inconsistent")
        approved_modes = frozenset()
    elif state == "approved":
        if recorded is not True or not approved_modes:
            errors.append("approved_activation_inconsistent")
    else:
        errors.append("activation_state")

    modes = eligibility.get("modes")
    if eligibility.get("schema_version") != 1:
        errors.append("eligibility_schema")
    if eligibility.get("scope") != "phase6_runtime_eligibility":
        errors.append("eligibility_scope")
    if eligibility.get("locked_prospective_outcomes_read") is not False:
        errors.append("eligibility_outcome_boundary")
    if not isinstance(modes, dict) or set(modes) != RUNTIME_MODES or not all(
        isinstance(value, bool) for value in modes.values()
    ):
        errors.append("eligibility_modes")
        modes = {}

    ineligible = sorted(mode for mode in approved_modes if modes.get(mode) is not True)
    if ineligible:
        errors.append("approved_mode_not_eligible:" + ",".join(ineligible))
    if errors:
        approved_modes = frozenset()
    return RuntimeActivation(approved_modes, tuple(errors))


def load_runtime_activation(
    activation_path: Path = ACTIVATION_PATH,
    eligibility_path: Path = ELIGIBILITY_PATH,
) -> RuntimeActivation:
    try:
        activation = json.loads(activation_path.read_text(encoding="utf-8"))
        eligibility = json.loads(eligibility_path.read_text(encoding="utf-8"))
        if not isinstance(activation, dict) or not isinstance(eligibility, dict):
            raise ValueError("activation documents must be objects")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return RuntimeActivation(frozenset(), (type(error).__name__,))
    return evaluate_runtime_activation(activation, eligibility)
