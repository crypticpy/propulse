"""Fail-closed aggregate telemetry for StationCast beta stop events."""

from __future__ import annotations

import math
import os
import re
from datetime import datetime, timezone
from typing import Any, Mapping, Protocol

import httpx


STATIONCAST_BETA_PROTOCOL_VERSION = (
    "propagation-v4.2-stationcast-beta-2026-07-16"
)
MODEL_STOP_FIELDS = frozenset({
    "privacy_events",
    "equipment_math_events",
    "unsupported_support_events",
})
MONITOR_STOP_FIELDS = frozenset({
    "high_confidence_overprediction_events",
    "geographic_regression_events",
})
STOP_COUNTERS = MODEL_STOP_FIELDS | MONITOR_STOP_FIELDS
TELEMETRY_COUNTERS = STOP_COUNTERS | {
    "requests",
    "errors",
    "integrity_errors",
    "consent_errors",
    "subject_binding_errors",
    "stale_profile_events",
}
HF_BAND_FREQUENCIES_MHZ = {
    "160m": 1.9,
    "80m": 3.6,
    "60m": 5.35,
    "40m": 7.15,
    "30m": 10.125,
    "20m": 14.15,
    "17m": 18.1,
    "15m": 21.2,
    "12m": 24.93,
    "10m": 28.5,
}
MODE_LINK_ASSUMPTIONS = {
    "WSPR": (6.0, -28.0),
    "FT8": (50.0, -21.0),
    "FT4": (90.0, -17.5),
    "CW": (100.0, -15.0),
    "SSB": (2400.0, 10.0),
}
MATH_CORRECTION_WARNINGS = {
    "negative_passive_loss_rejected",
    "negative_inline_loss_rejected",
    "feedline_input_clamped",
}
SHADOW_EVENT_FIELDS = {
    "schema_version",
    "event_type",
    "inference_mode",
    "request_kind",
    "receipt_time",
    "issue_time",
    "valid_time",
    "band",
    "mode",
    "cell_count",
    "model_version",
    "feature_contract",
    "station_feature_contract",
    "path_history_provider",
    "path_history_transform_version",
    "operational_weather_provider",
    "profile_counts",
    "source_freshness",
    "ood_flag_counts",
    "core_probability_summary",
    "personalized_probability_summary",
    "confidence_summary",
    "latency_ms",
}
SUMMARY_FIELDS = {"minimum", "mean", "maximum"}
FRESHNESS_FIELDS = {
    "path_history_seconds",
    "path_history_stale",
    "space_weather_seconds",
}
SAFE_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$")
PROHIBITED_TELEMETRY_KEYS = {
    "callsign",
    "chainFingerprint",
    "coordinates",
    "eirpWatts",
    "exact_grid4",
    "inventory",
    "origin_grid4",
    "password",
    "radioId",
    "research_subject_binding",
    "station",
    "target_grid4",
    "user_id",
}


class BetaTelemetrySink(Protocol):
    configured: bool

    def record(
        self,
        counts: Mapping[str, int],
        *,
        observed_at: datetime | None = None,
    ) -> None: ...


BetaTelemetryRecorder = BetaTelemetrySink


class PrivacyBoundaryViolation(RuntimeError):
    """Raised before an unsafe shadow telemetry event can be emitted."""


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("beta telemetry timestamp must include a UTC offset")
    return value.astimezone(timezone.utc)


def validate_telemetry_counts(
    counts: Mapping[str, int],
    *,
    allowed_fields: frozenset[str] = STOP_COUNTERS,
) -> dict[str, int]:
    if not counts or not set(counts).issubset(allowed_fields):
        raise ValueError("invalid aggregate beta telemetry counters")
    normalized = dict(counts)
    if any(
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < 1
        or value > 1_000_000
        for value in normalized.values()
    ):
        raise ValueError("invalid aggregate beta telemetry counter value")
    return normalized


def validate_stop_counts(
    counts: Mapping[str, int],
    *,
    allowed_fields: frozenset[str],
) -> dict[str, int]:
    return validate_telemetry_counts(counts, allowed_fields=allowed_fields)


class PostgrestBetaTelemetryRecorder:
    """Write only exact aggregate increments through the hardened target RPC."""

    configured = True

    def __init__(
        self,
        base_url: str,
        service_key: str,
        *,
        allowed_fields: frozenset[str] = STOP_COUNTERS,
        protocol_version: str = STATIONCAST_BETA_PROTOCOL_VERSION,
        timeout_seconds: float = 10.0,
        client: httpx.Client | None = None,
    ) -> None:
        root = base_url.rstrip("/")
        if (
            not root
            or not service_key
            or len(protocol_version) > 128
            or not allowed_fields
            or not allowed_fields.issubset(STOP_COUNTERS)
        ):
            raise ValueError("beta telemetry store configuration is invalid")
        if not root.startswith("https://") and not root.startswith(
            ("http://127.0.0.1", "http://localhost")
        ):
            raise ValueError("beta telemetry store must use HTTPS")
        self._url = f"{root}/rest/v1/rpc/record_propagation_beta_telemetry"
        self._service_key = service_key
        self.allowed_fields = allowed_fields
        self.protocol_version = protocol_version
        self._timeout_seconds = timeout_seconds
        self._client = client

    def record(
        self,
        counts: Mapping[str, int],
        *,
        observed_at: datetime | None = None,
    ) -> None:
        normalized = validate_telemetry_counts(
            counts,
            allowed_fields=self.allowed_fields,
        )
        payload = {
            "p_protocol_version": self.protocol_version,
            "p_observed_at": _aware_utc(
                observed_at or datetime.now(timezone.utc)
            ).isoformat(),
            "p_counts": normalized,
        }
        headers = {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
            "Content-Type": "application/json",
        }
        if self._client is not None:
            response = self._client.post(
                self._url,
                headers=headers,
                json=payload,
                timeout=self._timeout_seconds,
            )
        else:
            with httpx.Client(follow_redirects=False) as client:
                response = client.post(
                    self._url,
                    headers=headers,
                    json=payload,
                    timeout=self._timeout_seconds,
                )
        try:
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise RuntimeError("beta stop-event telemetry write failed") from error


PostgrestBetaTelemetrySink = PostgrestBetaTelemetryRecorder


class UnavailableBetaTelemetrySink:
    configured = False

    def record(
        self,
        counts: Mapping[str, int],
        *,
        observed_at: datetime | None = None,
    ) -> None:
        del counts, observed_at
        raise RuntimeError("beta stop-event telemetry is unavailable")


def beta_telemetry_recorder_from_environment(
    *,
    allowed_fields: frozenset[str] = STOP_COUNTERS,
    protocol_version: str = STATIONCAST_BETA_PROTOCOL_VERSION,
) -> BetaTelemetryRecorder | None:
    url = os.environ.get("PROPULSE_BETA_TELEMETRY_STORE_URL", "").strip()
    key = os.environ.get("PROPULSE_BETA_TELEMETRY_STORE_SERVICE_KEY", "")
    if bool(url) != bool(key):
        raise RuntimeError(
            "beta telemetry store URL and service key must be configured together"
        )
    if not url:
        return None
    return PostgrestBetaTelemetryRecorder(
        url,
        key,
        allowed_fields=allowed_fields,
        protocol_version=protocol_version,
    )


def model_beta_telemetry_sink_from_environment() -> BetaTelemetrySink:
    return beta_telemetry_recorder_from_environment(
        allowed_fields=MODEL_STOP_FIELDS,
    ) or UnavailableBetaTelemetrySink()


def _close(actual: float, expected: float) -> bool:
    return math.isclose(actual, expected, rel_tol=1e-6, abs_tol=1e-6)


def station_envelope_stop_counts(
    station: Any,
    *,
    request_band: str,
    request_mode: str,
    request_declared_power_watts: float | None = None,
) -> dict[str, int]:
    """Return request-level stop counters for a derived station envelope."""

    if station is None:
        return {}
    values = station.model_dump() if hasattr(station, "model_dump") else dict(station)
    math_violation = False
    unsupported_treated_supported = False
    supported = values.get("supported") is True
    band = str(values.get("band", ""))
    mode = str(values.get("mode", "")).upper()
    warning_codes = {
        str(value) for value in values.get("warningCodes", [])
    }

    numeric_names = (
        "frequencyMHz",
        "requestedPowerWatts",
        "conductedPowerWatts",
        "powerAtAntennaWatts",
        "eirpWatts",
        "erpWatts",
        "totalPassiveLossDb",
        "feedlineLossDb",
        "inlineLossDb",
        "amplifierGainDb",
        "antennaGainTowardPathDbi",
        "modeBandwidthHz",
        "modeSnrThresholdDb",
    )
    numbers: dict[str, float] = {}
    for name in numeric_names:
        try:
            numbers[name] = float(values[name])
        except (KeyError, TypeError, ValueError):
            math_violation = True
            continue
        if not math.isfinite(numbers[name]):
            math_violation = True

    if band != request_band or mode != request_mode.upper():
        math_violation = True
    if (
        request_declared_power_watts is not None
        and "conductedPowerWatts" in numbers
        and not _close(
            numbers["conductedPowerWatts"],
            request_declared_power_watts,
        )
    ):
        math_violation = True
    expected_frequency = HF_BAND_FREQUENCIES_MHZ.get(band)
    if expected_frequency is None:
        unsupported_treated_supported = supported
    elif "frequencyMHz" in numbers and not _close(
        numbers["frequencyMHz"], expected_frequency
    ):
        math_violation = True

    expected_mode = MODE_LINK_ASSUMPTIONS.get(mode)
    if expected_mode is None:
        unsupported_treated_supported = supported
    elif all(name in numbers for name in ("modeBandwidthHz", "modeSnrThresholdDb")):
        if not _close(numbers["modeBandwidthHz"], expected_mode[0]) or not _close(
            numbers["modeSnrThresholdDb"], expected_mode[1]
        ):
            math_violation = True

    if all(
        name in numbers
        for name in ("totalPassiveLossDb", "feedlineLossDb", "inlineLossDb")
    ) and numbers["totalPassiveLossDb"] + 1e-6 < (
        numbers["feedlineLossDb"] + numbers["inlineLossDb"]
    ):
        math_violation = True

    if supported and all(
        name in numbers
        for name in (
            "conductedPowerWatts",
            "amplifierGainDb",
            "totalPassiveLossDb",
            "powerAtAntennaWatts",
            "antennaGainTowardPathDbi",
            "eirpWatts",
            "erpWatts",
        )
    ):
        expected_power = numbers["conductedPowerWatts"] * math.pow(
            10.0,
            (numbers["amplifierGainDb"] - numbers["totalPassiveLossDb"]) / 10.0,
        )
        expected_eirp = numbers["powerAtAntennaWatts"] * math.pow(
            10.0,
            numbers["antennaGainTowardPathDbi"] / 10.0,
        )
        expected_erp = numbers["eirpWatts"] / math.pow(10.0, 2.15 / 10.0)
        if (
            expected_power <= 0
            or not _close(numbers["powerAtAntennaWatts"], expected_power)
            or not _close(numbers["eirpWatts"], expected_eirp)
            or not _close(numbers["erpWatts"], expected_erp)
        ):
            math_violation = True
    elif not supported and any(
        abs(numbers.get(name, 0.0)) > 1e-6 for name in ("eirpWatts", "erpWatts")
    ):
        math_violation = True

    target_bearing = values.get("targetBearingDeg")
    takeoff_angle = values.get("takeoffAngleDeg")
    if target_bearing is not None and not 0 <= float(target_bearing) < 360:
        math_violation = True
    if takeoff_angle is not None and not -90 <= float(takeoff_angle) <= 90:
        math_violation = True
    for name in ("receiverNoiseFloorDbm", "localSystemNoiseFloorDbm"):
        value = values.get(name)
        if value is not None and not -200 <= float(value) <= 0:
            math_violation = True

    if warning_codes & MATH_CORRECTION_WARNINGS:
        math_violation = True
    if supported and any(
        code.endswith("_unsupported")
        or code.endswith("_missing")
        or "band_unsupported" in code
        for code in warning_codes
    ):
        unsupported_treated_supported = True

    counts: dict[str, int] = {}
    if math_violation:
        counts["equipment_math_events"] = 1
    if unsupported_treated_supported:
        counts["unsupported_support_events"] = 1
    return counts


def _contains_prohibited_key(value: Any) -> bool:
    if isinstance(value, Mapping):
        return any(
            str(key) in PROHIBITED_TELEMETRY_KEYS
            or _contains_prohibited_key(child)
            for key, child in value.items()
        )
    if isinstance(value, list):
        return any(_contains_prohibited_key(child) for child in value)
    return False


def validate_shadow_telemetry_privacy(event: Mapping[str, Any]) -> None:
    if set(event) != SHADOW_EVENT_FIELDS or _contains_prohibited_key(event):
        raise PrivacyBoundaryViolation("unsafe propagation shadow telemetry fields")
    if event.get("schema_version") != "propagation-shadow-v1" or event.get(
        "event_type"
    ) != "propagation_inference_completed":
        raise PrivacyBoundaryViolation("unsafe propagation shadow telemetry schema")
    if event.get("request_kind") not in {"path", "surface"} or event.get(
        "inference_mode"
    ) not in {"shadow", "active"}:
        raise PrivacyBoundaryViolation("unsafe propagation shadow telemetry mode")
    if set(event.get("source_freshness", {})) != FRESHNESS_FIELDS:
        raise PrivacyBoundaryViolation("unsafe propagation freshness telemetry")
    for name in (
        "core_probability_summary",
        "personalized_probability_summary",
        "confidence_summary",
    ):
        summary = event.get(name)
        if not isinstance(summary, Mapping) or set(summary) != SUMMARY_FIELDS:
            raise PrivacyBoundaryViolation("unsafe propagation probability telemetry")
        try:
            numbers = [float(summary[field]) for field in SUMMARY_FIELDS]
        except (TypeError, ValueError):
            raise PrivacyBoundaryViolation(
                "unsafe propagation probability telemetry"
            ) from None
        if not all(math.isfinite(value) and 0 <= value <= 1 for value in numbers):
            raise PrivacyBoundaryViolation("unsafe propagation probability telemetry")
    for name in (
        "model_version",
        "feature_contract",
        "station_feature_contract",
        "path_history_provider",
        "path_history_transform_version",
        "operational_weather_provider",
    ):
        value = event.get(name)
        if not isinstance(value, str) or SAFE_TOKEN.fullmatch(value) is None:
            raise PrivacyBoundaryViolation("unsafe propagation telemetry token")
    for name in ("profile_counts", "ood_flag_counts"):
        counts = event.get(name)
        if not isinstance(counts, Mapping) or any(
            not isinstance(key, str)
            or SAFE_TOKEN.fullmatch(key) is None
            or isinstance(value, bool)
            or not isinstance(value, int)
            or value < 0
            for key, value in counts.items()
        ):
            raise PrivacyBoundaryViolation("unsafe propagation telemetry counts")


def emit_shadow_telemetry(
    event: dict[str, Any],
    *,
    sink: Any,
    beta_recorder: BetaTelemetrySink | None,
    beta_collection_enabled: bool,
    observed_at: datetime | None = None,
) -> None:
    try:
        validate_shadow_telemetry_privacy(event)
    except PrivacyBoundaryViolation:
        if beta_collection_enabled:
            if beta_recorder is None:
                raise RuntimeError("beta stop telemetry is unavailable")
            beta_recorder.record(
                {"privacy_events": 1},
                observed_at=observed_at or datetime.now(timezone.utc),
            )
        raise
    sink(event)
