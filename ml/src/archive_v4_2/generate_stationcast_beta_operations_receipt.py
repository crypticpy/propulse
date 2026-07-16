#!/usr/bin/env python3
"""Build the aggregate operational audit required by the StationCast scorer."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import platform
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

from m5_runtime import validate_m5_runtime
from score_stationcast_beta import validate_beta_config
from validate_live_feature_migration import (
    DEFAULT_ENV,
    DEFAULT_POOLER_URL,
    ROOT,
    atomic_write,
    current_project_pooler_url,
    read_env,
)


CONFIG = ROOT / "ml/config/propagation_v4_2_beta_protocol.json"
M5_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/stationcast_beta_operations_receipt.json"
)

AUDIT_QUERY = """
WITH parameters AS (
  SELECT
    %s::timestamptz AS window_start,
    %s::timestamptz AS window_end,
    %s::text AS policy_version
),
attempt_scope AS (
  SELECT attempt.*
  FROM public.propagation_attempts AS attempt
  JOIN public.propagation_predictions AS prediction
    ON prediction.id = attempt.prediction_id
   AND prediction.user_id = attempt.user_id
  CROSS JOIN parameters
  WHERE prediction.sampled_for_research
    AND (
      (attempt.started_at >= parameters.window_start
       AND attempt.started_at < parameters.window_end)
      OR EXISTS (
        SELECT 1
        FROM public.propagation_outcomes AS observed
        WHERE observed.attempt_id = attempt.id
          AND observed.user_id = attempt.user_id
          AND observed.observed_at >= parameters.window_start
          AND observed.observed_at < parameters.window_end
      )
    )
),
prediction_scope AS (
  SELECT DISTINCT prediction.*
  FROM public.propagation_predictions AS prediction
  JOIN attempt_scope AS attempt
    ON attempt.prediction_id = prediction.id
   AND attempt.user_id = prediction.user_id
),
outcome_scope AS (
  SELECT outcome.*
  FROM public.propagation_outcomes AS outcome
  JOIN attempt_scope AS attempt
    ON attempt.id = outcome.attempt_id
   AND attempt.user_id = outcome.user_id
  CROSS JOIN parameters
  WHERE outcome.observed_at >= parameters.window_start
    AND outcome.observed_at < parameters.window_end
),
withdrawn_rows AS (
  SELECT count(*)::bigint AS rows_remaining
  FROM (
    SELECT prediction.id
    FROM public.propagation_predictions AS prediction
    JOIN public.ml_research_consents AS consent ON consent.user_id = prediction.user_id
    WHERE consent.status = 'withdrawn'
    UNION ALL
    SELECT attempt.id
    FROM public.propagation_attempts AS attempt
    JOIN public.ml_research_consents AS consent ON consent.user_id = attempt.user_id
    WHERE consent.status = 'withdrawn'
    UNION ALL
    SELECT outcome.id
    FROM public.propagation_outcomes AS outcome
    JOIN public.ml_research_consents AS consent ON consent.user_id = outcome.user_id
    WHERE consent.status = 'withdrawn'
  ) AS retained
),
expired_rows AS (
  SELECT count(*)::bigint AS rows_remaining
  FROM (
    SELECT prediction.id
    FROM public.propagation_predictions AS prediction
    JOIN public.ml_research_consents AS consent ON consent.user_id = prediction.user_id
    CROSS JOIN parameters
    WHERE consent.retention_until <= parameters.window_end
    UNION ALL
    SELECT attempt.id
    FROM public.propagation_attempts AS attempt
    JOIN public.ml_research_consents AS consent ON consent.user_id = attempt.user_id
    CROSS JOIN parameters
    WHERE consent.retention_until <= parameters.window_end
    UNION ALL
    SELECT outcome.id
    FROM public.propagation_outcomes AS outcome
    JOIN public.ml_research_consents AS consent ON consent.user_id = outcome.user_id
    CROSS JOIN parameters
    WHERE consent.retention_until <= parameters.window_end
  ) AS retained
)
SELECT
  (SELECT count(*) FROM prediction_scope)::bigint AS predictions,
  (SELECT count(*) FROM attempt_scope)::bigint AS attempts,
  (SELECT count(*) FROM outcome_scope WHERE outcome_type IN (
    'receive_success', 'receive_failure', 'contact_success', 'contact_failure'
  ))::bigint AS binary_outcomes,
  (SELECT count(*) FROM outcome_scope WHERE outcome_type = 'not_attempted')::bigint AS not_attempted,
  (SELECT count(*) FROM outcome_scope WHERE outcome_type = 'unknown')::bigint AS unknown,
  (SELECT count(*) FROM attempt_scope WHERE ended_at IS NULL)::bigint AS open_attempts,
  (SELECT count(*) FROM prediction_scope WHERE profile <> 'nowcast')::bigint AS fallback_predictions,
  (SELECT count(*) FROM prediction_scope WHERE station_supported IS NOT TRUE)::bigint AS unsupported_predictions,
  (SELECT count(*) FROM prediction_scope WHERE cardinality(ood_flags) > 0)::bigint AS ood_predictions,
  (
    SELECT count(*)
    FROM public.ml_research_consents AS consent, parameters
    WHERE consent.policy_version = parameters.policy_version
      AND consent.withdrawn_at >= parameters.window_start
      AND consent.withdrawn_at < parameters.window_end
  )::bigint AS withdrawals,
  (SELECT rows_remaining FROM withdrawn_rows)::bigint AS withdrawn_rows_remaining,
  (SELECT rows_remaining FROM expired_rows)::bigint AS expired_rows_remaining
"""

API_COUNT_FIELDS = (
    "requests",
    "errors",
    "integrity_errors",
    "privacy_events",
    "consent_errors",
    "subject_binding_errors",
    "stale_profile_events",
    "equipment_math_events",
    "unsupported_support_events",
    "high_confidence_overprediction_events",
    "geographic_regression_events",
)
TELEMETRY_FIELDS = {
    "schema_version",
    "scope",
    "protocol_version",
    "window",
    "counts",
    "participant_data_present",
    "signature",
}


def nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def owner_secret(path: Path) -> bytes:
    if not path.is_file():
        raise RuntimeError("beta telemetry secret is unavailable")
    if path.stat().st_mode & 0o077:
        raise RuntimeError("beta telemetry secret must be owner-only")
    secret = path.read_bytes()
    if len(secret) < 32:
        raise RuntimeError("beta telemetry secret must contain at least 32 bytes")
    return secret


def telemetry_signature(telemetry: dict[str, Any], secret: bytes) -> str:
    payload = {key: value for key, value in telemetry.items() if key != "signature"}
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode()
    return hmac.new(secret, encoded, hashlib.sha256).hexdigest()


def validate_api_telemetry(
    telemetry: dict[str, Any],
    config: dict[str, Any],
    *,
    window_start: datetime,
    window_end: datetime,
    secret: bytes,
) -> list[str]:
    errors: list[str] = []
    if set(telemetry) != TELEMETRY_FIELDS:
        errors.append("api_telemetry_fields")
    if telemetry.get("schema_version") != 1:
        errors.append("api_telemetry_schema")
    if telemetry.get("scope") != "stationcast_beta_api_telemetry":
        errors.append("api_telemetry_scope")
    if telemetry.get("protocol_version") != config["protocol_version"]:
        errors.append("api_telemetry_protocol")
    supplied_signature = telemetry.get("signature")
    if not isinstance(supplied_signature, str) or not hmac.compare_digest(
        supplied_signature,
        telemetry_signature(telemetry, secret),
    ):
        errors.append("api_telemetry_signature")
    window = telemetry.get("window")
    try:
        matching_window = bool(
            isinstance(window, dict)
            and parse_utc(str(window["start"])) == window_start
            and parse_utc(str(window["end"])) == window_end
        )
    except (KeyError, TypeError, ValueError):
        matching_window = False
    if not matching_window or window_end <= window_start:
        errors.append("api_telemetry_window")
    counts = telemetry.get("counts")
    if (
        not isinstance(counts, dict)
        or set(counts) != set(API_COUNT_FIELDS)
        or any(not nonnegative_int(counts.get(name)) for name in API_COUNT_FIELDS)
        or (
            nonnegative_int(counts.get("errors"))
            and nonnegative_int(counts.get("requests"))
            and counts["errors"] > counts["requests"]
        )
    ):
        errors.append("api_telemetry_counts")
    if telemetry.get("participant_data_present") is not False:
        errors.append("api_telemetry_privacy")
    return errors


def build_receipt(
    database: dict[str, int],
    telemetry: dict[str, Any],
    telemetry_errors: list[str],
    config: dict[str, Any],
    *,
    window_start: datetime,
    window_end: datetime,
    runtime: dict[str, Any],
    telemetry_sha256: str,
    config_sha256: str,
    wall_seconds: float,
) -> dict[str, Any]:
    api_counts = telemetry.get("counts", {}) if not telemetry_errors else {}
    api = {
        name: int(api_counts.get(name, 0))
        for name in API_COUNT_FIELDS
    }
    active = list(telemetry_errors)
    if database["withdrawn_rows_remaining"]:
        active.append("withdrawal_deletion_integrity")
    if database["expired_rows_remaining"]:
        active.append("retention_deletion_integrity")
    event_stop_conditions = {
        "integrity_errors": "api_integrity",
        "privacy_events": "privacy_boundary",
        "consent_errors": "consent_integrity",
        "subject_binding_errors": "receipt_subject_binding",
        "stale_profile_events": "stale_profile_labeled_nowcast",
        "equipment_math_events": "station_chain_invariant",
        "unsupported_support_events": "unsupported_treated_supported",
        "high_confidence_overprediction_events": "high_confidence_overprediction",
        "geographic_regression_events": "consecutive_geographic_regression",
    }
    for field, stop_condition in event_stop_conditions.items():
        if api[field]:
            active.append(stop_condition)
    active = sorted(set(active))
    attempts = database["attempts"]
    resolved = (
        database["binary_outcomes"]
        + database["not_attempted"]
        + database["unknown"]
    )
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "stationcast_beta_operations",
        "protocol_version": config["protocol_version"],
        "policy_version": config["policy_version"],
        "decision": "pass" if not active else "withheld",
        "synthetic": False,
        "window": {
            "start": window_start.isoformat(),
            "end": window_end.isoformat(),
        },
        "audit": {
            "database": database,
            "api": api,
            "rates": {
                "attempt_without_recorded_outcome": (
                    max(attempts - resolved, 0) / attempts if attempts else 0.0
                ),
                "unknown_or_not_attempted": (
                    (database["unknown"] + database["not_attempted"]) / resolved
                    if resolved
                    else 0.0
                ),
                "api_error": api["errors"] / api["requests"] if api["requests"] else 0.0,
            },
        },
        "active_stop_conditions": active,
        "inputs": {
            "api_telemetry_sha256": telemetry_sha256,
            "api_telemetry_path_recorded": False,
            "config_sha256": config_sha256,
        },
        "runtime": {
            "machine": platform.machine(),
            "physical_cores_visible": runtime["physical_cores_visible"],
            "wall_seconds": wall_seconds,
            "psycopg_version": psycopg.__version__,
        },
        "privacy": {
            "participant_identifiers_written": False,
            "exact_grid4_written": False,
            "raw_station_inventory_written": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--window-start", required=True)
    parser.add_argument("--window-end", required=True)
    parser.add_argument("--api-telemetry-receipt", type=Path, required=True)
    parser.add_argument("--api-telemetry-secret", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=CONFIG)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--pooler-url-file", type=Path, default=DEFAULT_POOLER_URL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(M5_CONFIG.read_text(encoding="utf-8")))
    config = json.loads(args.config.read_text(encoding="utf-8"))
    validate_beta_config(config)
    window_start = parse_utc(args.window_start)
    window_end = parse_utc(args.window_end)
    if window_end <= window_start or window_end - window_start > timedelta(days=180):
        raise RuntimeError("StationCast operations window is invalid")
    telemetry = json.loads(args.api_telemetry_receipt.read_text(encoding="utf-8"))
    telemetry_secret = owner_secret(args.api_telemetry_secret)
    telemetry_errors = validate_api_telemetry(
        telemetry,
        config,
        window_start=window_start,
        window_end=window_end,
        secret=telemetry_secret,
    )

    values = read_env(args.env_file)
    password = values.get("SUPABASE_DB_PASSWORD", "")
    if not password:
        raise RuntimeError("target database password is unavailable")
    pooler_url = current_project_pooler_url(
        values,
        args.pooler_url_file.read_text(encoding="utf-8").strip(),
    )
    started = time.perf_counter()
    with psycopg.connect(
        pooler_url,
        password=password,
        connect_timeout=15,
        sslmode="require",
        application_name="propulse-stationcast-beta-operations-audit",
        row_factory=dict_row,
    ) as connection:
        connection.execute("SET TRANSACTION READ ONLY")
        database_row = connection.execute(
            AUDIT_QUERY,
            (window_start, window_end, config["policy_version"]),
        ).fetchone()
        connection.rollback()
    if database_row is None:
        raise RuntimeError("StationCast database audit returned no row")
    database = {name: int(value) for name, value in database_row.items()}
    receipt = build_receipt(
        database,
        telemetry,
        telemetry_errors,
        config,
        window_start=window_start,
        window_end=window_end,
        runtime=runtime,
        telemetry_sha256=sha256(args.api_telemetry_receipt),
        config_sha256=sha256(args.config),
        wall_seconds=time.perf_counter() - started,
    )
    atomic_write(args.output, receipt)
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
