"""Pure contracts shared by the V4.2 Phase 1 cohort and model runners."""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from datetime import datetime, timezone
from typing import Any


EXPECTED_CANDIDATES = (
    "A0_v3_control",
    "A1_v3_plus_availability",
    "A2_long_natural",
    "A3_long_balanced",
    "A4_recent_cycle",
    "A5_recency_weighted",
)
LOCKED_MONTHS = frozenset(("2024-12", "2025-01", "2025-04", "2025-07", "2025-10"))


class Phase1Error(RuntimeError):
    """Raised before Phase 1 could violate its development-only contract."""


def validate_config(config: Mapping[str, Any]) -> None:
    if config.get("execution_scope") != "development":
        raise Phase1Error("Phase 1 requires development scope")
    roles = config["data_roles"]
    permitted = set().union(
        *(set(value) for value in roles.values() if isinstance(value, list))
    )
    if permitted & LOCKED_MONTHS:
        raise Phase1Error("Phase 1 roles include a locked outcome")
    if list(roles["evaluation"]) != ["2024-10", "2024-11"]:
        raise Phase1Error("Phase 1 evaluation must be exactly October and November")
    if list(roles["early_stopping"]) != ["2024-07"]:
        raise Phase1Error("Phase 1 early stopping must be exactly July")
    if list(roles["calibration"]) != ["2024-08"]:
        raise Phase1Error("Phase 1 calibration must be exactly August")
    candidates = tuple(config["candidates"])
    if candidates != EXPECTED_CANDIDATES:
        raise Phase1Error(f"unexpected candidate order: {candidates}")
    followups = config["conditional_followups"]
    if followups["selection_month"] != roles["calibration"][0]:
        raise Phase1Error("conditional policies must be selected on calibration month")
    if followups["calibrator_fit_days"] != [1, 20]:
        raise Phase1Error("conditional calibrator fit window changed")
    if followups["policy_selection_days"] != [21, 31]:
        raise Phase1Error("conditional policy selection window changed")
    referenced = {
        followups["A6_recent_recency_blend"]["left"],
        followups["A6_recent_recency_blend"]["right"],
        followups["A7_60m_specialist"]["default"],
        followups["A7_60m_specialist"]["specialist"],
    }
    if not referenced <= set(candidates):
        raise Phase1Error("conditional policy references an unknown candidate")
    for month, path in config["source_roots"]["supplemental"].items():
        if month in LOCKED_MONTHS or any(value in str(path) for value in LOCKED_MONTHS):
            raise Phase1Error(f"locked source configured: {month}")


def sampling_threshold(total_rows: int, target_rows: int, oversample: float) -> int:
    if total_rows <= 0 or target_rows <= 0:
        raise ValueError("row counts must be positive")
    if not 0 <= oversample < 0.25:
        raise ValueError("oversample must be in [0, 0.25)")
    fraction = min(1.0, target_rows * (1.0 + oversample) / total_rows)
    return min(2**64 - 1, math.ceil((2**64 - 1) * fraction))


def recency_multiplier(
    timestamp: datetime,
    reference: datetime,
    half_life_months: float,
) -> float:
    if timestamp.tzinfo is None or reference.tzinfo is None:
        raise ValueError("recency timestamps must be timezone-aware")
    if half_life_months <= 0:
        raise ValueError("half life must be positive")
    months = (reference - timestamp).total_seconds() / (365.2425 / 12 * 86400)
    return 0.5 ** (months / half_life_months)


def month_from_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m")


def select_advancement(
    candidates: Iterable[Mapping[str, Any]],
    maximum: int = 3,
) -> list[str]:
    rows = list(candidates)
    if not rows or maximum <= 0:
        return []
    control = next(row for row in rows if row["candidate"] == "A0_v3_control")
    control_brier = float(control["evaluation_brier"])
    qualified = [
        row
        for row in rows
        if row["candidate"] != "A0_v3_control"
        and float(row["evaluation_brier"]) < control_brier
        and all(float(value) < 0 for value in row["month_deltas_vs_a0"].values())
        and float(row.get("bootstrap_upper_vs_a0", 0.0)) < 0
    ]
    return [
        str(row["candidate"])
        for row in sorted(
            qualified,
            key=lambda item: (
                float(item["evaluation_brier"]),
                str(item["candidate"]),
            ),
        )[:maximum]
    ]
