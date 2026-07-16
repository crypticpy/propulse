#!/usr/bin/env python3
"""Validate the protected aggregate research-health endpoint from the M5."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write, read_env


sys.path.insert(0, str(ROOT / "ml/service"))
from check_m5_wspr_research_health import (  # noqa: E402
    NoRedirectHandler,
    build_remote_health_payload,
    load_remote_health_config,
    publish_remote_health,
    remote_request_headers,
)


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_ENV = ROOT / ".env.local"
DEFAULT_RUNTIME = Path.home() / "Library/Application Support/PropulseML"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/research_health_endpoint_validation.json"
)
FORBIDDEN_KEY_PARTS = ("call", "grid", "path", "station", "equipment", "secret")


def store_config(values: dict[str, str]) -> tuple[str, str]:
    dedicated_url = values.get("PROPULSE_RESEARCH_HEALTH_STORE_URL", "")
    dedicated_key = values.get("PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY", "")
    if bool(dedicated_url) != bool(dedicated_key):
        raise RuntimeError("dedicated research-health store is partially configured")
    base_url = dedicated_url or values.get("VITE_SUPABASE_URL", "")
    service_key = dedicated_key or values.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not service_key:
        raise RuntimeError("research-health store configuration is unavailable")
    return base_url.rstrip("/"), service_key


def store_json(
    base_url: str,
    service_key: str,
    path: str,
    *,
    method: str = "GET",
) -> Any:
    request = urllib.request.Request(
        f"{base_url}/rest/v1/{path}",
        method=method,
        headers={
            "Accept": "application/json",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError("research-health store rejected validation request")
        raw = response.read(16_384)
    return json.loads(raw.decode("utf-8")) if raw else None


def coarse_view_status(config: Any) -> int:
    headers: dict[str, str] = {"Accept": "application/json"}
    if config.bypass_secret is not None:
        headers["X-Vercel-Protection-Bypass"] = config.bypass_secret
    request = urllib.request.Request(config.endpoint, method="GET", headers=headers)
    opener = urllib.request.build_opener(NoRedirectHandler())
    try:
        with opener.open(request, timeout=15) as response:
            response.read(4096)
            return int(response.status)
    except urllib.error.HTTPError as error:
        error.read(4096)
        return int(error.code)


def keys_are_identity_free(value: Any) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = str(key).lower()
            if any(part in lowered for part in FORBIDDEN_KEY_PARTS):
                return False
            if not keys_are_identity_free(child):
                return False
    elif isinstance(value, list):
        return all(keys_are_identity_free(child) for child in value)
    return True


def pending_outbox_has_no_failed_delivery(value: Any) -> bool:
    if not isinstance(value, list):
        return False
    return all(
        isinstance(row, dict)
        and type(row.get("attempts")) is int
        and row["attempts"] == 0
        and row.get("last_error") is None
        for row in value
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--runtime-root", type=Path, default=DEFAULT_RUNTIME)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    remote = load_remote_health_config(args.env_file)
    if remote is None:
        raise RuntimeError("remote research-health endpoint is not configured")
    values = read_env(args.env_file)
    base_url, service_key = store_config(values)
    alert = json.loads(
        (args.runtime_root.expanduser() / "live_wspr_alert.json").read_text(
            encoding="utf-8"
        )
    )
    if alert.get("decision") != "healthy" or alert.get("alerts") != []:
        raise RuntimeError("endpoint validation requires a healthy local watchdog state")
    observations = alert.get("observations")
    if not isinstance(observations, dict):
        raise RuntimeError("local watchdog observations are unavailable")

    generated_at = datetime.now(timezone.utc).isoformat()
    payload = build_remote_health_payload(
        generated_at=generated_at,
        decision="healthy",
        alerts=[],
        observations=observations,
    )
    response = publish_remote_health(remote, payload, timeout_seconds=15)
    singleton_query = urllib.parse.urlencode(
        {
            "singleton_key": "eq.nowcast-research",
            "select": (
                "reported_at,decision,last_completed_target_hour,"
                "continuous_completed_hours,completed_hours,required_hours,"
                "missing_hours,freshness_seconds"
            ),
            "limit": "1",
        }
    )
    rows = store_json(
        base_url,
        service_key,
        f"propagation_research_health?{singleton_query}",
    )
    pending = store_json(
        base_url,
        service_key,
        (
            "propagation_research_alert_outbox?delivered_at=is.null&"
            "select=attempts,last_error"
        ),
    )
    view_status = coarse_view_status(remote)
    row = rows[0] if isinstance(rows, list) and len(rows) == 1 else None
    expected_completed = int(observations.get("shadow_completed_hours") or 0)
    expected_continuous = int(observations.get("continuous_completed_hours") or 0)
    expected_required = int(observations.get("shadow_required_hours") or 720)
    expected_missing = int(observations.get("shadow_missing_hours") or 0)
    expected_target = observations.get("last_completed_target_hour")
    stored_target = row.get("last_completed_target_hour") if isinstance(row, dict) else None
    normalized_target = (
        datetime.fromisoformat(str(stored_target).replace("Z", "+00:00")).isoformat()
        if stored_target is not None
        else None
    )
    normalized_expected_target = (
        datetime.fromisoformat(str(expected_target).replace("Z", "+00:00")).isoformat()
        if expected_target is not None
        else None
    )

    evidence = {
        "schema_version": 1,
        "generated_at": generated_at,
        "scope": "private_research_health_endpoint_validation",
        "locked_outcomes_read": False,
        "research_only": True,
        "progress": {
            "continuous_hours": expected_continuous,
            "completed_hours": expected_completed,
            "required_hours": expected_required,
            "missing_hours": expected_missing,
        },
        "endpoint": {
            "protected_preview_bypass_configured": remote.bypass_secret is not None,
            "private_access_mode": (
                "preview_bypass"
                if remote.bypass_secret is not None
                else "signed_ingest_with_disabled_reader"
            ),
            "accepted": response.get("accepted"),
            "state_changed": response.get("stateChanged"),
            "alert_delivery_configured": (
                response.get("alertDelivery", {}).get("configured")
                if isinstance(response.get("alertDelivery"), dict)
                else None
            ),
            "coarse_view_status": view_status,
        },
        "store": {
            "decision": row.get("decision") if isinstance(row, dict) else None,
            "continuous_hours": (
                row.get("continuous_completed_hours") if isinstance(row, dict) else None
            ),
            "completed_hours": row.get("completed_hours") if isinstance(row, dict) else None,
            "required_hours": row.get("required_hours") if isinstance(row, dict) else None,
            "missing_hours": row.get("missing_hours") if isinstance(row, dict) else None,
            "pending_alert_events": len(pending) if isinstance(pending, list) else None,
            "attempted_pending_alert_events": (
                sum(
                    isinstance(item, dict)
                    and type(item.get("attempts")) is int
                    and item["attempts"] > 0
                    for item in pending
                )
                if isinstance(pending, list)
                else None
            ),
        },
        "runtime": {
            "machine": runtime["machine"],
            "physical_cores_visible": runtime["physical_cores_visible"],
            "power_source": runtime["power_source"],
            "power_modes": runtime["power_modes"],
        },
    }
    gates = {
        "signed_heartbeat_accepted": response.get("accepted") is True,
        "stored_aggregate_exact": bool(
            isinstance(row, dict)
            and row.get("decision") == "healthy"
            and int(row.get("continuous_completed_hours", -1)) == expected_continuous
            and int(row.get("completed_hours", -1)) == expected_completed
            and int(row.get("required_hours", -1)) == expected_required
            and int(row.get("missing_hours", -1)) == expected_missing
            and normalized_target == normalized_expected_target
        ),
        "alert_outbox_has_no_failed_delivery": (
            pending_outbox_has_no_failed_delivery(pending)
        ),
        "coarse_view_remains_disabled": view_status == 404,
        "private_access_boundary_verified": bool(
            remote.bypass_secret is not None or view_status == 404
        ),
        "native_m5_runtime": runtime["machine"] == "arm64",
        "locked_outcomes_unread": True,
    }
    evidence["gates"] = gates
    evidence["gates"]["identity_free_evidence"] = keys_are_identity_free(evidence)
    evidence["decision"] = "pass" if all(evidence["gates"].values()) else "fail"
    atomic_write(args.output, evidence)
    print(json.dumps(evidence, indent=2))
    if evidence["decision"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
