"""Fail-closed runtime activation shared by the inference service."""

from __future__ import annotations

import json
import re
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
FUTURECAST_HORIZONS_HOURS = (3, 6, 12, 24)
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class RuntimeActivation:
    approved_modes: frozenset[str]
    errors: tuple[str, ...] = ()
    futurecast_horizons_hours: tuple[int, ...] = ()

    def allows(self, mode: str) -> bool:
        return not self.errors and mode in self.approved_modes

    def allows_futurecast_horizon(self, horizon_hours: int) -> bool:
        return (
            self.allows("futurecast")
            and horizon_hours in self.futurecast_horizons_hours
        )


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
    activation_readiness = activation.get("source_readiness_sha256")
    if not isinstance(activation_readiness, str) or not SHA256_PATTERN.fullmatch(
        activation_readiness
    ):
        errors.append("activation_readiness_sha")
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

    if eligibility.get("schema_version") != 2:
        errors.append("eligibility_schema")
    if eligibility.get("scope") != "phase6_runtime_eligibility":
        errors.append("eligibility_scope")
    if eligibility.get("locked_prospective_outcomes_read") is not False:
        errors.append("eligibility_outcome_boundary")
    eligibility_readiness = eligibility.get("source_readiness_sha256")
    if not isinstance(eligibility_readiness, str) or not SHA256_PATTERN.fullmatch(
        eligibility_readiness
    ):
        errors.append("eligibility_readiness_sha")
    elif (
        isinstance(activation_readiness, str)
        and SHA256_PATTERN.fullmatch(activation_readiness)
        and eligibility_readiness != activation_readiness
    ):
        errors.append("readiness_checksum_mismatch")

    modes = eligibility.get("modes")
    if not isinstance(modes, dict) or set(modes) != RUNTIME_MODES or not all(
        isinstance(value, bool) for value in modes.values()
    ):
        errors.append("eligibility_modes")
        modes = {}

    raw_horizons = eligibility.get("futurecast_horizons_hours")
    horizons_are_valid = (
        isinstance(raw_horizons, list)
        and all(
            type(value) is int and value in FUTURECAST_HORIZONS_HOURS
            for value in raw_horizons
        )
        and len(set(raw_horizons)) == len(raw_horizons)
        and all(
            index == 0 or value > raw_horizons[index - 1]
            for index, value in enumerate(raw_horizons)
        )
    )
    if not horizons_are_valid:
        errors.append("eligibility_futurecast_horizons")
        futurecast_horizons: tuple[int, ...] = ()
    else:
        futurecast_horizons = tuple(raw_horizons)
    if modes and horizons_are_valid and modes["futurecast"] != bool(
        futurecast_horizons
    ):
        errors.append("eligibility_futurecast_consistency")

    ineligible = sorted(mode for mode in approved_modes if modes.get(mode) is not True)
    if ineligible:
        errors.append("approved_mode_not_eligible:" + ",".join(ineligible))
    if errors:
        approved_modes = frozenset()
        futurecast_horizons = ()
    return RuntimeActivation(
        approved_modes,
        tuple(errors),
        futurecast_horizons,
    )


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
