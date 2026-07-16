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
    issuances: dict[
        tuple[str, datetime, str],
        dict[str, list[tuple[datetime, datetime, dict[str, Any]]]],
    ] = {}
    for row in rows:
        key = (str(row.get("product")), str(row.get("metric")))
        cadence_hours = FEATURES.get(key)
        if cadence_hours is None or row.get("quality") != "forecast":
            continue
        issued_at = aware(row["issued_at"])
        available_at = aware(row["available_at"])
        valid_at = aware(row["valid_at"])
        payload_sha256 = str(row.get("payload_sha256", "")).lower()
        if (
            len(payload_sha256) != 64
            or any(character not in "0123456789abcdef" for character in payload_sha256)
        ):
            raise ValueError("FutureCast forecast payload SHA-256 is invalid")
        if issued_at > issue or available_at > issue:
            continue
        if available_at < issued_at:
            raise ValueError("FutureCast forecast was available before it was issued")
        if not valid_at <= valid < valid_at + timedelta(hours=cadence_hours):
            continue
        issuances.setdefault((key[0], issued_at, payload_sha256), {}).setdefault(
            key[1], []
        ).append(
            (valid_at, available_at, row)
        )

    values: dict[str, float] = {}
    provenance: dict[str, dict[str, Any]] = {}
    issuance_provenance: dict[str, dict[str, Any]] = {}
    missing: list[str] = []
    products = sorted({product for product, _metric in FEATURES})
    for product in products:
        required_metrics = sorted(
            metric for candidate, metric in FEATURES if candidate == product
        )
        complete: list[
            tuple[
                datetime,
                datetime,
                str,
                dict[str, tuple[datetime, datetime, dict[str, Any]]],
            ]
        ] = []
        for (candidate, issued_at, payload_sha256), metric_rows in issuances.items():
            if candidate != product or not all(
                metric in metric_rows for metric in required_metrics
            ):
                continue
            selected_rows = {
                metric: max(metric_rows[metric], key=lambda item: (item[0], item[1]))
                for metric in required_metrics
            }
            complete.append(
                (
                    issued_at,
                    max(row[1] for row in selected_rows.values()),
                    payload_sha256,
                    selected_rows,
                )
            )
        if not complete:
            missing.extend(feature_name(product, metric) for metric in required_metrics)
            continue
        issued_at, issuance_available_at, payload_sha256, selected_rows = max(
            complete,
            key=lambda item: (item[0], item[1], item[2]),
        )
        issuance_provenance[product] = {
            "payload_sha256": payload_sha256,
            "issued_at": issued_at.isoformat(),
            "available_at": issuance_available_at.isoformat(),
        }
        for metric in required_metrics:
            valid_at, available_at, selected = selected_rows[metric]
            name = feature_name(product, metric)
            values[name] = float(selected["value"])
            provenance[name] = {
                "payload_sha256": payload_sha256,
                "issued_at": issued_at.isoformat(),
                "available_at": available_at.isoformat(),
                "valid_at": valid_at.isoformat(),
                "forecast_age_minutes": int(
                    (issue - issued_at).total_seconds() // 60
                ),
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
        "issuances": issuance_provenance,
        "missing_features": sorted(missing),
    }
