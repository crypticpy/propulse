"""Python parity implementation of the public Stage A StationCast adapter."""

from __future__ import annotations

import math
from typing import Any


WSPR_THRESHOLD_DB = -28.0
DB_PER_LOG_ODDS = 6.0


def clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def apply_station_physics_adapter(
    core_probability: float,
    core_confidence: float,
    core_reference_power_watts: float,
    envelope: dict[str, Any],
) -> dict[str, Any]:
    bounded = clamp(core_probability, 1e-6, 1 - 1e-6)
    reference_power = max(core_reference_power_watts, 1e-9)
    effective_power = max(float(envelope["eirpWatts"]), 1e-9)
    power_adjustment_db = 10 * math.log10(effective_power / reference_power)
    mode_adjustment_db = WSPR_THRESHOLD_DB - float(envelope["modeSnrThresholdDb"])
    link_adjustment_db = clamp(power_adjustment_db + mode_adjustment_db, -30, 30)
    log_odds = math.log(bounded / (1 - bounded))
    personalized = 1 / (1 + math.exp(-(log_odds + link_adjustment_db / DB_PER_LOG_ODDS)))
    if not envelope["supported"]:
        personalized = 0.0
    confidence_penalty = 1.0
    if envelope.get("localSystemNoiseFloorDbm") is None:
        confidence_penalty *= 0.85
    if envelope.get("receiverEvidenceIsRelative"):
        confidence_penalty *= 0.9
    if not envelope["supported"]:
        confidence_penalty *= 0.5
    return {
        "featureContract": "station-chain-v1",
        "coreProbability": clamp(core_probability, 0, 1),
        "personalizedProbability": clamp(personalized, 0, 1),
        "confidence": clamp(core_confidence * confidence_penalty, 0, 1),
        "linkAdjustmentDb": link_adjustment_db,
        "powerAdjustmentDb": power_adjustment_db,
        "modeAdjustmentDb": mode_adjustment_db,
        "stage": "deterministic_physics_adapter",
        "assumptions": [
            "six_db_per_log_odds_link_response",
            "wspr_threshold_is_minus_28_db",
            *envelope.get("assumptions", []),
        ],
    }
