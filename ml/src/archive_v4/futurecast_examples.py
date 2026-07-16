"""Leakage-safe issued-forecast feature selection for direct FutureCast horizons."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable


HORIZONS = (3, 6, 12, 24)
FEATURES = {
    ("noaa_45_day_ap_f107", "ap"): 24,
    ("noaa_45_day_ap_f107", "f107"): 24,
    ("noaa_3_day_solar_geomagnetic", "planetary_ap"): 24,
    ("noaa_3_day_solar_geomagnetic", "f107"): 24,
    ("noaa_3_day_solar_geomagnetic", "mid_latitude_k"): 3,
    ("noaa_3_day_solar_geomagnetic", "high_latitude_k"): 3,
}


def aware(value: str | datetime) -> datetime:
    parsed = (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, str)
        else value
    )
    if parsed.tzinfo is None:
        raise ValueError("FutureCast timestamps must include a timezone")
    return parsed.astimezone(timezone.utc)


def feature_name(product: str, metric: str) -> str:
    return f"forecast__{product}__{metric}"


def build_issued_forecast_features(
    rows: Iterable[dict[str, Any]],
    *,
    issue_time: str | datetime,
    horizon_hours: int,
) -> dict[str, Any]:
    if horizon_hours not in HORIZONS:
        raise ValueError(f"unsupported FutureCast horizon: {horizon_hours}")
    issue = aware(issue_time)
    valid = issue + timedelta(hours=horizon_hours)
    candidates: dict[tuple[str, str], list[tuple[datetime, datetime, str, dict[str, Any]]]] = {}
    for row in rows:
        key = (str(row.get("product")), str(row.get("metric")))
        cadence_hours = FEATURES.get(key)
        if cadence_hours is None or row.get("quality", "forecast") != "forecast":
            continue
        issued_at = aware(row["issued_at"])
        available_at = aware(row["available_at"])
        valid_at = aware(row["valid_at"])
        if issued_at > issue or available_at > issue:
            continue
        if not valid_at <= valid < valid_at + timedelta(hours=cadence_hours):
            continue
        payload_sha256 = str(row.get("payload_sha256", ""))
        candidates.setdefault(key, []).append(
            (issued_at, available_at, payload_sha256, row)
        )

    values: dict[str, float] = {}
    provenance: dict[str, dict[str, Any]] = {}
    missing: list[str] = []
    for key, _cadence_hours in FEATURES.items():
        name = feature_name(*key)
        eligible = candidates.get(key, [])
        if not eligible:
            missing.append(name)
            continue
        issued_at, available_at, payload_sha256, selected = max(
            eligible,
            key=lambda item: (item[0], item[1], item[2]),
        )
        valid_at = aware(selected["valid_at"])
        values[name] = float(selected["value"])
        provenance[name] = {
            "payload_sha256": payload_sha256,
            "issued_at": issued_at.isoformat(),
            "available_at": available_at.isoformat(),
            "valid_at": valid_at.isoformat(),
            "forecast_age_minutes": int((issue - issued_at).total_seconds() // 60),
            "availability_age_minutes": int(
                (issue - available_at).total_seconds() // 60
            ),
        }
    return {
        "schema_version": 1,
        "issue_time": issue.isoformat(),
        "valid_time": valid.isoformat(),
        "horizon_hours": horizon_hours,
        "complete": not missing,
        "values": values,
        "provenance": provenance,
        "missing_features": sorted(missing),
    }
