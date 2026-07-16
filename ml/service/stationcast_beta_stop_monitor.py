#!/usr/bin/env python3
"""Evaluate preregistered StationCast beta safety stops from aggregate evidence."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import math
import os
import platform
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

from beta_telemetry import (
    MONITOR_STOP_FIELDS,
    STATIONCAST_BETA_PROTOCOL_VERSION,
    BetaTelemetrySink,
    PostgrestBetaTelemetryRecorder,
)


ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "ml/config/propagation_v4_2_beta_protocol.json"
DEFAULT_RUNTIME_ROOT = (
    Path.home() / "Library/Application Support/PropulseML/stationcast_beta"
)
POLICY_SCOPE = "privacy_bounded_wspr_reception_monitoring_not_promotion_score"
EVIDENCE_FIELDS = {
    "schema_version",
    "policy_version",
    "window_start",
    "window_end",
    "scope",
    "reportability",
    "summary",
    "strata",
    "calibration_bins",
    "privacy",
}
SUMMARY_FIELDS = {
    "reportable",
    "participants",
    "outcomes",
    "tier_a_outcomes",
    "core_brier",
    "stationcast_brier",
    "paired_brier_delta",
    "largest_participant_share",
}
STRATUM_FIELDS = {
    "dimension",
    "value",
    "participants",
    "outcomes",
    "core_brier",
    "personalized_brier",
}
CALIBRATION_FIELDS = {
    "model",
    "bin",
    "outcomes",
    "mean_probability",
    "observed_rate",
}
STRATUM_VALUES = {
    "band": frozenset({
        "160m", "80m", "60m", "40m", "30m", "20m", "17m", "15m", "12m",
        "10m", "6m",
    }),
    "origin_field": frozenset(
        f"{first}{second}"
        for first in "ABCDEFGHIJKLMNOPQR"
        for second in "ABCDEFGHIJKLMNOPQR"
    ),
    "tx_eirp": frozenset({
        "unknown", "lt_1w", "1_5w", "5_25w", "25_100w", "100_500w", "ge_500w",
    }),
    "passive_loss": frozenset({
        "unknown", "lt_1db", "1_3db", "3_6db", "ge_6db",
    }),
    "directional_gain": frozenset({
        "unknown", "lt_0dbi", "0_3dbi", "3_6dbi", "6_10dbi", "ge_10dbi",
    }),
    "receiver_evidence": frozenset({
        "unknown", "relative", "catalog", "measured",
    }),
    "evidence_tier": frozenset({"A", "B", "C"}),
}
STATE_FIELDS = {
    "schema_version",
    "protocol_version",
    "last_window_start",
    "last_window_end",
    "geographic_regression_streak",
    "geographic_regression_tokens",
    "high_confidence_stop_recorded",
    "geographic_regression_stop_recorded",
}
SIGNED_RECEIPT_FIELDS = {
    "schema_version",
    "scope",
    "signed_payload",
    "hmac_sha256",
}


class MonitoringPrivacyViolation(RuntimeError):
    """The aggregate monitor returned data outside the approved boundary."""


def nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def finite_number(value: Any, *, minimum: float, maximum: float) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
        and minimum <= float(value) <= maximum
    )


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("monitor timestamp must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode()


def json_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def owner_secret(path: Path) -> bytes:
    if not path.is_file() or path.stat().st_mode & 0o077:
        raise RuntimeError("monitor receipt secret must be an owner-only file")
    secret = path.read_bytes()
    if len(secret) < 32:
        raise RuntimeError("monitor receipt secret must contain at least 32 bytes")
    return secret


def sign_monitor_receipt(receipt: dict[str, Any], secret: bytes) -> dict[str, Any]:
    signed_payload = canonical_json(receipt).decode()
    return {
        "schema_version": 1,
        "scope": "stationcast_beta_signed_stop_monitor_receipt",
        "signed_payload": signed_payload,
        "hmac_sha256": hmac.new(
            secret,
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest(),
    }


def verify_monitor_receipt(
    value: dict[str, Any],
    secret: bytes,
) -> dict[str, Any]:
    if set(value) != SIGNED_RECEIPT_FIELDS:
        raise ValueError("signed monitor receipt fields are invalid")
    signed_payload = value.get("signed_payload")
    signature = value.get("hmac_sha256")
    if (
        value.get("schema_version") != 1
        or value.get("scope")
        != "stationcast_beta_signed_stop_monitor_receipt"
        or not isinstance(signed_payload, str)
        or not isinstance(signature, str)
        or not hmac.compare_digest(
            signature,
            hmac.new(secret, signed_payload.encode(), hashlib.sha256).hexdigest(),
        )
    ):
        raise ValueError("signed monitor receipt signature is invalid")
    decoded = json.loads(signed_payload)
    if not isinstance(decoded, dict):
        raise ValueError("signed monitor receipt payload is invalid")
    return decoded


def initial_state(protocol_version: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "protocol_version": protocol_version,
        "last_window_start": None,
        "last_window_end": None,
        "geographic_regression_streak": 0,
        "geographic_regression_tokens": [],
        "high_confidence_stop_recorded": False,
        "geographic_regression_stop_recorded": False,
    }


def validate_state(state: dict[str, Any], protocol_version: str) -> None:
    if (
        set(state) != STATE_FIELDS
        or state.get("schema_version") != 1
        or state.get("protocol_version") != protocol_version
        or isinstance(state.get("geographic_regression_streak"), bool)
        or not isinstance(state.get("geographic_regression_streak"), int)
        or state["geographic_regression_streak"] < 0
        or not isinstance(state.get("geographic_regression_tokens"), list)
        or any(
            not isinstance(value, str)
            or len(value) != 64
            or any(character not in "0123456789abcdef" for character in value)
            for value in state.get("geographic_regression_tokens", [])
        )
        or not isinstance(state.get("high_confidence_stop_recorded"), bool)
        or not isinstance(state.get("geographic_regression_stop_recorded"), bool)
    ):
        raise ValueError("StationCast beta monitor state is invalid")
    for name in ("last_window_start", "last_window_end"):
        value = state.get(name)
        if value is not None:
            parse_utc(value)


def validate_monitoring_evidence(
    evidence: dict[str, Any],
    config: dict[str, Any],
    *,
    window_start: datetime,
    window_end: datetime,
) -> None:
    privacy = evidence.get("privacy")
    if (
        set(evidence) != EVIDENCE_FIELDS
        or not isinstance(privacy, dict)
        or privacy != {
            "user_ids_returned": False,
            "exact_grid4_returned": False,
            "raw_station_inventory_returned": False,
            "participant_cap_applied": False,
        }
    ):
        raise MonitoringPrivacyViolation("unsafe StationCast monitoring evidence")
    if (
        evidence.get("schema_version") != 1
        or evidence.get("policy_version") != config["policy_version"]
        or evidence.get("scope") != POLICY_SCOPE
        or parse_utc(str(evidence.get("window_start"))) != window_start
        or parse_utc(str(evidence.get("window_end"))) != window_end
    ):
        raise ValueError("StationCast monitoring evidence binding is invalid")
    reportability = evidence.get("reportability")
    if reportability != {
        "minimum_participants": int(config["privacy"]["minimum_public_participants"]),
        "minimum_outcomes": int(config["privacy"]["minimum_public_outcomes"]),
    }:
        raise ValueError("StationCast monitoring reportability is invalid")
    summary = evidence.get("summary")
    if not isinstance(summary, dict) or not isinstance(
        summary.get("reportable"), bool
    ):
        raise ValueError("StationCast monitoring summary is invalid")
    if summary["reportable"]:
        if (
            set(summary) != SUMMARY_FIELDS
            or not nonnegative_int(summary.get("participants"))
            or not nonnegative_int(summary.get("outcomes"))
            or not nonnegative_int(summary.get("tier_a_outcomes"))
            or summary["participants"]
            < int(config["privacy"]["minimum_public_participants"])
            or summary["outcomes"]
            < int(config["privacy"]["minimum_public_outcomes"])
            or summary["tier_a_outcomes"] > summary["outcomes"]
            or not finite_number(summary.get("core_brier"), minimum=0, maximum=1)
            or not finite_number(
                summary.get("stationcast_brier"), minimum=0, maximum=1
            )
            or not finite_number(
                summary.get("paired_brier_delta"), minimum=-1, maximum=1
            )
            or not math.isclose(
                float(summary["paired_brier_delta"]),
                float(summary["stationcast_brier"]) - float(summary["core_brier"]),
                rel_tol=1e-9,
                abs_tol=1e-12,
            )
            or not finite_number(
                summary.get("largest_participant_share"), minimum=0, maximum=1
            )
        ):
            raise ValueError("StationCast monitoring summary fields are invalid")
    elif set(summary) != {"reportable"}:
        raise ValueError("unreportable StationCast summary disclosed extra fields")
    strata = evidence.get("strata")
    calibration = evidence.get("calibration_bins")
    if (
        not isinstance(strata, list)
        or any(not isinstance(row, dict) or set(row) != STRATUM_FIELDS for row in strata)
        or not isinstance(calibration, list)
        or any(
            not isinstance(row, dict) or set(row) != CALIBRATION_FIELDS
            for row in calibration
        )
    ):
        raise MonitoringPrivacyViolation("unsafe StationCast monitoring rows")
    if not summary["reportable"] and (strata or calibration):
        raise ValueError("unreportable StationCast evidence disclosed rows")
    stratum_keys: set[tuple[str, str]] = set()
    for row in strata:
        dimension = row["dimension"]
        value = row["value"]
        if (
            not isinstance(dimension, str)
            or not isinstance(value, str)
            or dimension not in STRATUM_VALUES
            or value not in STRATUM_VALUES[dimension]
            or not nonnegative_int(row["participants"])
            or not nonnegative_int(row["outcomes"])
            or row["participants"]
            < int(config["privacy"]["minimum_public_participants"])
            or row["outcomes"]
            < int(config["privacy"]["minimum_public_outcomes"])
            or not finite_number(row["core_brier"], minimum=0, maximum=1)
            or not finite_number(row["personalized_brier"], minimum=0, maximum=1)
        ):
            raise ValueError("StationCast monitoring stratum values are invalid")
        key = (dimension, value)
        if key in stratum_keys:
            raise ValueError("StationCast monitoring strata are duplicated")
        stratum_keys.add(key)
    calibration_keys: set[tuple[str, int]] = set()
    for row in calibration:
        if (
            not isinstance(row["model"], str)
            or row["model"] not in {"core", "stationcast"}
            or not nonnegative_int(row["bin"])
            or row["bin"] > 9
            or not nonnegative_int(row["outcomes"])
            or row["outcomes"]
            < int(config["privacy"]["minimum_public_outcomes"])
            or not finite_number(row["mean_probability"], minimum=0, maximum=1)
            or not finite_number(row["observed_rate"], minimum=0, maximum=1)
        ):
            raise ValueError("StationCast monitoring calibration values are invalid")
        key = (row["model"], row["bin"])
        if key in calibration_keys:
            raise ValueError("StationCast monitoring calibration rows are duplicated")
        calibration_keys.add(key)


def evaluate_week(
    evidence: dict[str, Any],
    config: dict[str, Any],
    state: dict[str, Any],
    *,
    window_start: datetime,
    window_end: datetime,
    generated_at: datetime | None = None,
    config_sha256: str | None = None,
) -> tuple[dict[str, int], dict[str, Any], dict[str, Any]]:
    if window_end - window_start != timedelta(days=7):
        raise ValueError("StationCast safety reads must cover exactly seven days")
    if window_start.tzinfo is None or window_end.tzinfo is None:
        raise ValueError("StationCast safety windows must be timezone-aware")
    protocol_version = str(config["protocol_version"])
    validate_state(state, protocol_version)
    validate_monitoring_evidence(
        evidence,
        config,
        window_start=window_start,
        window_end=window_end,
    )
    config_digest = config_sha256 or json_sha256(config)
    evidence_digest = json_sha256(evidence)

    if state["last_window_end"] is not None and parse_utc(
        state["last_window_end"]
    ) == window_end:
        receipt = {
            "schema_version": 1,
            "generated_at": (generated_at or datetime.now(timezone.utc)).isoformat(),
            "scope": "stationcast_beta_weekly_stop_monitor",
            "protocol_version": protocol_version,
            "config_sha256": config_digest,
            "evidence_sha256": evidence_digest,
            "window": {
                "start": window_start.isoformat(),
                "end": window_end.isoformat(),
            },
            "decision": "already_evaluated",
            "aggregate_only": True,
            "stop_counters_emitted": {},
            "high_confidence": {"eligible": False, "maximum_overprediction": None},
            "geographic": {"reportable_cells": 0, "regression_present": False},
            "geographic_regression_streak": state["geographic_regression_streak"],
        }
        return {}, dict(state), receipt

    beta = config["beta"]
    summary = evidence["summary"]
    high_eligible = bool(
        summary.get("reportable") is True
        and int(summary.get("outcomes", 0))
        >= int(config["alpha"]["minimum_binary_outcomes"])
    )
    high_threshold = float(beta["high_confidence_probability"])
    high_gaps = [
        float(row["mean_probability"]) - float(row["observed_rate"])
        for row in evidence["calibration_bins"]
        if row["model"] == "stationcast"
        and float(row["mean_probability"]) >= high_threshold
    ]
    maximum_overprediction = max(high_gaps, default=None)
    high_stop = bool(
        high_eligible
        and maximum_overprediction is not None
        and maximum_overprediction
        > float(beta["maximum_high_confidence_overprediction"])
    )

    reportable_geographies = []
    regressing_geographic_tokens: set[str] = set()
    for row in evidence["strata"]:
        if (
            row["dimension"] != "origin_field"
            or int(row["participants"]) < int(beta["minimum_cell_participants"])
            or int(row["outcomes"]) < int(beta["minimum_cell_outcomes"])
        ):
            continue
        core_brier = float(row["core_brier"])
        station_brier = float(row["personalized_brier"])
        relative_regression = (
            math.inf
            if core_brier <= 0 and station_brier > core_brier
            else 0.0
            if core_brier <= 0
            else (station_brier - core_brier) / core_brier
        )
        reportable_geographies.append(relative_regression)
        if relative_regression > float(
            beta["maximum_stratum_relative_brier_regression"]
        ):
            regressing_geographic_tokens.add(hashlib.sha256(
                f"{protocol_version}\0{row['value']}".encode()
            ).hexdigest())
    geographic_regression = bool(regressing_geographic_tokens)
    contiguous = bool(
        state["last_window_end"] is not None
        and parse_utc(state["last_window_end"]) == window_start
    )
    previous_tokens = (
        set(state["geographic_regression_tokens"]) if contiguous else set()
    )
    consecutive_tokens = previous_tokens & regressing_geographic_tokens
    geographic_stop = bool(consecutive_tokens)
    geographic_streak = (
        max(2, state["geographic_regression_streak"] + 1)
        if geographic_stop
        else 1
        if geographic_regression
        else 0
    )

    counters: dict[str, int] = {}
    if high_stop and not state["high_confidence_stop_recorded"]:
        counters["high_confidence_overprediction_events"] = 1
    if geographic_stop and not state["geographic_regression_stop_recorded"]:
        counters["geographic_regression_events"] = 1
    next_state = {
        "schema_version": 1,
        "protocol_version": protocol_version,
        "last_window_start": window_start.isoformat(),
        "last_window_end": window_end.isoformat(),
        "geographic_regression_streak": geographic_streak,
        "geographic_regression_tokens": sorted(regressing_geographic_tokens),
        "high_confidence_stop_recorded": bool(
            state["high_confidence_stop_recorded"] or high_stop
        ),
        "geographic_regression_stop_recorded": bool(
            state["geographic_regression_stop_recorded"] or geographic_stop
        ),
    }
    receipt = {
        "schema_version": 1,
        "generated_at": (generated_at or datetime.now(timezone.utc)).isoformat(),
        "scope": "stationcast_beta_weekly_stop_monitor",
        "protocol_version": protocol_version,
        "config_sha256": config_digest,
        "evidence_sha256": evidence_digest,
        "window": {
            "start": window_start.isoformat(),
            "end": window_end.isoformat(),
        },
        "decision": "stop" if high_stop or geographic_stop else "continue",
        "aggregate_only": True,
        "stop_counters_emitted": counters,
        "high_confidence": {
            "eligible": high_eligible,
            "maximum_overprediction": maximum_overprediction,
        },
        "geographic": {
            "reportable_cells": len(reportable_geographies),
            "regression_present": geographic_regression,
        },
        "geographic_regression_streak": geographic_streak,
    }
    return counters, next_state, receipt


class PostgrestBetaEvidenceProvider:
    def __init__(self, base_url: str, service_key: str) -> None:
        self._url = (
            f"{base_url.rstrip('/')}/rest/v1/rpc/get_propagation_beta_evidence"
        )
        self._headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def read(
        self,
        config: dict[str, Any],
        *,
        window_start: datetime,
        window_end: datetime,
    ) -> dict[str, Any]:
        with httpx.Client(follow_redirects=False) as client:
            response = client.post(
                self._url,
                headers=self._headers,
                json={
                    "p_policy_version": config["policy_version"],
                    "p_window_start": window_start.isoformat(),
                    "p_window_end": window_end.isoformat(),
                    "p_min_participants": int(
                        config["privacy"]["minimum_public_participants"]
                    ),
                    "p_min_outcomes": int(
                        config["privacy"]["minimum_public_outcomes"]
                    ),
                },
                timeout=30,
            )
        response.raise_for_status()
        value = response.json()
        if not isinstance(value, dict):
            raise ValueError("StationCast aggregate monitor returned no object")
        return value


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.parent.chmod(0o700)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as target:
            json.dump(value, target, indent=2, sort_keys=True)
            target.write("\n")
            target.flush()
            os.fsync(target.fileno())
        temporary.chmod(0o600)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def matching_committed_receipt(
    path: Path,
    secret: bytes,
    repeated_receipt: dict[str, Any],
) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(
            "the committed monitor receipt is missing for an evaluated window"
        )
    signed = json.loads(path.read_text(encoding="utf-8"))
    existing = verify_monitor_receipt(signed, secret)
    if any(
        existing.get(name) != repeated_receipt.get(name)
        for name in (
            "protocol_version",
            "config_sha256",
            "evidence_sha256",
            "window",
        )
    ) or existing.get("decision") not in {"continue", "stop"}:
        raise RuntimeError(
            "the committed monitor receipt does not match the evaluated window"
        )
    return signed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--window-end", required=True)
    parser.add_argument("--config", type=Path, default=CONFIG)
    parser.add_argument(
        "--state",
        type=Path,
        default=DEFAULT_RUNTIME_ROOT / "weekly_stop_monitor_state.json",
    )
    parser.add_argument("--receipt-secret", type=Path, required=True)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_RUNTIME_ROOT / "weekly_stop_monitor_receipt.json",
    )
    parser.add_argument("--commit", action="store_true")
    parser.add_argument("--acknowledge-beta-safety-monitor", action="store_true")
    args = parser.parse_args()

    if platform.machine() != "arm64":
        raise RuntimeError("StationCast safety monitor must run on the M5")
    if (
        os.environ.get("PROPULSE_STATIONCAST_BETA_MONITOR_ENABLED") != "true"
        or not args.acknowledge_beta_safety_monitor
    ):
        raise RuntimeError("StationCast beta safety monitor is disabled")
    window_end = parse_utc(args.window_end)
    if (
        window_end.weekday() != 0
        or window_end.hour
        or window_end.minute
        or window_end.second
        or window_end.microsecond
    ):
        raise ValueError("weekly stop windows must end Monday at 00:00 UTC")
    window_start = window_end - timedelta(days=7)
    config = json.loads(args.config.read_text(encoding="utf-8"))
    if config["protocol_version"] != STATIONCAST_BETA_PROTOCOL_VERSION:
        raise RuntimeError("StationCast beta protocol version is not frozen")
    url = os.environ.get("PROPULSE_BETA_TELEMETRY_STORE_URL", "").strip()
    key = os.environ.get("PROPULSE_BETA_TELEMETRY_STORE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError("StationCast beta aggregate store is unavailable")
    provider = PostgrestBetaEvidenceProvider(url, key)
    recorder: BetaTelemetrySink = PostgrestBetaTelemetryRecorder(
        url,
        key,
        allowed_fields=MONITOR_STOP_FIELDS | frozenset({"privacy_events"}),
    )
    receipt_secret = owner_secret(args.receipt_secret)
    state = (
        json.loads(args.state.read_text(encoding="utf-8"))
        if args.state.is_file()
        else initial_state(config["protocol_version"])
    )
    try:
        evidence = provider.read(
            config,
            window_start=window_start,
            window_end=window_end,
        )
        counters, next_state, receipt = evaluate_week(
            evidence,
            config,
            state,
            window_start=window_start,
            window_end=window_end,
            config_sha256=hashlib.sha256(args.config.read_bytes()).hexdigest(),
        )
    except MonitoringPrivacyViolation:
        if args.commit:
            recorder.record({"privacy_events": 1})
        raise
    if receipt["decision"] == "already_evaluated":
        existing_signed = matching_committed_receipt(
            args.output,
            receipt_secret,
            receipt,
        )
        print(json.dumps(existing_signed, indent=2, sort_keys=True))
        return
    signed_receipt = sign_monitor_receipt(receipt, receipt_secret)
    if args.commit:
        if counters:
            recorder.record(counters, observed_at=window_end)
        atomic_write(args.output, signed_receipt)
        atomic_write(args.state, next_state)
    else:
        atomic_write(args.output, signed_receipt)
    print(json.dumps(signed_receipt, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
