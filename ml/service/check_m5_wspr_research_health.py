#!/usr/bin/env python3
"""Evaluate the M5 WSPR research schedule and deliver local state changes."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import stat
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from wspr_live_connector import aware_utc, latest_settled_hour
from wspr_scheduler import write_json_atomic
from summarize_wspr_research_shadow import build_shadow_summary


WORKER_LABEL = "org.propulse.wspr-research"
COVERAGE_LABEL = "org.propulse.wspr-research-coverage"
DEFAULT_RUNTIME_ROOT = Path.home() / "Library/Application Support/PropulseML"
DEFAULT_STALE_SECONDS = 7200
DEFAULT_MAX_RUNTIME_BYTES = 2 * 1024**3
COVERAGE_MINIMUM_DUE_HOURS = 24
COVERAGE_MAX_AGE_SECONDS = 14 * 3600
COVERAGE_MAX_LAG_HOURS = 12
GATE_NAMES = (
    "health_record_parseable",
    "health_status_healthy",
    "zero_consecutive_failures",
    "health_record_recent",
    "latest_settled_hour_complete",
    "source_freshness_within_limit",
    "receipt_continuity_positive",
    "target_hour_utc_aligned",
    "runtime_storage_bounded",
    "worker_job_loaded",
    "worker_job_clean_or_running",
    "shadow_rollup_operational_healthy",
    "coverage_job_loaded",
    "coverage_job_clean_or_running",
    "coverage_audit_current_and_healthy",
)
REMOTE_ENV_KEYS = (
    "PROPULSE_RESEARCH_HEALTH_ENDPOINT",
    "PROPULSE_RESEARCH_HEALTH_INGEST_SECRET",
    "PROPULSE_RESEARCH_HEALTH_BYPASS_SECRET",
)


@dataclass(frozen=True)
class RemoteHealthConfig:
    endpoint: str
    secret: str
    bypass_secret: str | None = None


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> None:
        del request, file_pointer, code, message, headers, new_url
        return None


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"{path.name} is not a JSON object")
    return value


def directory_bytes(root: Path) -> int:
    total = 0
    for path in root.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        total += path.stat().st_size
    return total


def _env_value(raw: str) -> str:
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        value = value[1:-1]
    if "\x00" in value or "\n" in value or "\r" in value:
        raise RuntimeError("remote health environment value is invalid")
    return value


def load_remote_health_config(path: Path | None) -> RemoteHealthConfig | None:
    if path is None:
        return None
    expanded = path.expanduser()
    if expanded.is_symlink():
        raise RuntimeError("remote health environment must not be a symlink")
    resolved = expanded.resolve()
    details = resolved.stat()
    if details.st_uid != os.getuid():
        raise RuntimeError("remote health environment must be an owner file")
    if stat.S_IMODE(details.st_mode) & 0o077:
        raise RuntimeError("remote health environment must be owner-only")
    values: dict[str, str] = {}
    for raw_line in resolved.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").lstrip()
        key, raw_value = line.split("=", 1)
        if key.strip() in REMOTE_ENV_KEYS:
            values[key.strip()] = _env_value(raw_value)
    endpoint = values.get("PROPULSE_RESEARCH_HEALTH_ENDPOINT", "")
    secret = values.get("PROPULSE_RESEARCH_HEALTH_INGEST_SECRET", "")
    bypass_secret = values.get("PROPULSE_RESEARCH_HEALTH_BYPASS_SECRET", "")
    if not endpoint and not secret and not bypass_secret:
        return None
    if not endpoint or len(secret) < 32:
        raise RuntimeError("remote health endpoint and 32-byte secret are required together")
    if bypass_secret and not 16 <= len(bypass_secret) <= 512:
        raise RuntimeError("remote health bypass secret has an invalid length")
    parsed = urlsplit(endpoint)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise RuntimeError("remote health endpoint must be credential-free HTTPS")
    return RemoteHealthConfig(
        endpoint=endpoint,
        secret=secret,
        bypass_secret=bypass_secret or None,
    )


def remote_request_headers(
    config: RemoteHealthConfig,
    *,
    timestamp: str,
    signature: str,
) -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Propulse-Timestamp": timestamp,
        "X-Propulse-Signature": f"v1={signature}",
        "User-Agent": "Propulse-M5-Research-Health/1",
    }
    if config.bypass_secret is not None:
        headers["X-Vercel-Protection-Bypass"] = config.bypass_secret
    return headers


def build_remote_health_payload(
    *,
    generated_at: str,
    decision: str,
    alerts: list[str],
    observations: dict[str, Any],
) -> dict[str, Any]:
    ordered_alerts = sorted(alerts)
    event_material = json.dumps(
        [generated_at, decision, ordered_alerts],
        separators=(",", ":"),
    )
    return {
        "schemaVersion": 1,
        "eventId": hashlib.sha256(event_material.encode("utf-8")).hexdigest(),
        "generatedAt": generated_at,
        "decision": decision,
        "researchOnly": True,
        "alerts": ordered_alerts,
        "lastCompletedTargetHour": observations.get("last_completed_target_hour"),
        "continuousCompletedHours": int(
            observations.get("continuous_completed_hours") or 0
        ),
        "completedHours": int(observations.get("shadow_completed_hours") or 0),
        "requiredHours": int(observations.get("shadow_required_hours") or 720),
        "missingHours": int(observations.get("shadow_missing_hours") or 0),
        "freshnessSeconds": observations.get("dynamic_freshness_seconds"),
    }


def publish_remote_health(
    config: RemoteHealthConfig,
    payload: dict[str, Any],
    *,
    timeout_seconds: float = 10.0,
) -> dict[str, Any]:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    timestamp = str(int(datetime.now(timezone.utc).timestamp()))
    signature = hmac.new(
        config.secret.encode("utf-8"),
        timestamp.encode("ascii") + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    request = urllib.request.Request(
        config.endpoint,
        data=body,
        method="POST",
        headers=remote_request_headers(
            config,
            timestamp=timestamp,
            signature=signature,
        ),
    )
    opener = urllib.request.build_opener(NoRedirectHandler())
    with opener.open(request, timeout=timeout_seconds) as response:
        if response.status < 200 or response.status >= 300:
            raise RuntimeError("remote health endpoint rejected the heartbeat")
        raw = response.read(4096)
    try:
        result = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("remote health endpoint returned invalid JSON") from error
    if not isinstance(result, dict):
        raise RuntimeError("remote health endpoint returned a non-object response")
    return result


def evaluate_health(
    health: dict[str, Any],
    *,
    now: datetime,
    runtime_bytes: int,
    worker_loaded: bool,
    worker_running: bool,
    worker_clean_exit: bool,
    shadow_summary: dict[str, Any],
    coverage_loaded: bool = True,
    coverage_running: bool = False,
    coverage_clean_exit: bool = True,
    coverage_receipt: dict[str, Any] | None = None,
    stale_seconds: int = DEFAULT_STALE_SECONDS,
    max_runtime_bytes: int = DEFAULT_MAX_RUNTIME_BYTES,
) -> tuple[dict[str, bool], dict[str, Any]]:
    current = aware_utc(now, "now")
    generated = aware_utc(str(health["generated_at"]), "health generated_at")
    last = aware_utc(
        str(health["last_completed_target_hour"]),
        "last completed target hour",
    )
    latest = latest_settled_hour(current, timedelta(minutes=10))
    freshness_seconds = max(
        0,
        int((current - (last + timedelta(hours=1))).total_seconds()),
    )
    health_age_seconds = max(0, int((current - generated).total_seconds()))
    shadow_window = shadow_summary.get("window", {})
    shadow_expected_hours = int(shadow_window.get("expected_hours") or 0)
    coverage_due = shadow_expected_hours >= COVERAGE_MINIMUM_DUE_HOURS
    coverage_valid = False
    coverage_age_seconds: int | None = None
    coverage_lag_hours: int | None = None
    coverage_decision: str | None = None
    coverage_chunk_hours: int | None = None
    if coverage_receipt is not None:
        try:
            coverage_generated = aware_utc(
                str(coverage_receipt["generated_at"]),
                "coverage generated_at",
            )
            coverage_window = coverage_receipt["window"]
            coverage_end = aware_utc(
                str(coverage_window["end"]),
                "coverage window end",
            )
            shadow_end = aware_utc(
                str(shadow_window["last_completed_target_hour"]),
                "shadow last completed target hour",
            )
            coverage_age_seconds = int(
                (current - coverage_generated).total_seconds()
            )
            coverage_lag_hours = int(
                (shadow_end - coverage_end).total_seconds() // 3600
            )
            coverage_decision = str(coverage_receipt.get("decision"))
            coverage_execution = coverage_receipt.get("execution", {})
            coverage_chunk_hours = int(
                coverage_execution.get("query_chunk_hours", 0)
            )
            coverage_privacy = coverage_receipt.get("privacy", {})
            coverage_gates = coverage_receipt.get("gates", {})
            coverage_valid = bool(
                coverage_receipt.get("scope")
                == "wspr_shadow_aggregate_coverage_and_source_drift"
                and coverage_decision in {"collecting", "pass"}
                and coverage_receipt.get("operational_status") == "healthy"
                and coverage_receipt.get("research_only") is True
                and 0 <= coverage_age_seconds <= COVERAGE_MAX_AGE_SECONDS
                and 0 <= coverage_lag_hours <= COVERAGE_MAX_LAG_HOURS
                and int(coverage_window.get("expected_hours", 0))
                <= shadow_expected_hours
                and coverage_gates.get(
                    "window_bound_to_signed_scheduled_receipts"
                )
                is True
                and coverage_gates.get("database_queries_bounded_to_24_hours")
                is True
                and 1 <= coverage_chunk_hours <= 24
                and coverage_privacy.get("raw_observation_table_read") is False
                and coverage_privacy.get("station_identity_written") is False
                and coverage_privacy.get("grid4_written") is False
                and coverage_privacy.get("equipment_written") is False
                and coverage_privacy.get("locked_outcomes_read") is False
            )
        except (KeyError, TypeError, ValueError):
            coverage_valid = False
    gates = {
        "health_record_parseable": True,
        "health_status_healthy": health.get("status") == "healthy",
        "zero_consecutive_failures": int(health.get("consecutive_failures", -1)) == 0,
        "health_record_recent": health_age_seconds <= stale_seconds,
        "latest_settled_hour_complete": (
            last >= latest
            or (
                worker_running
                and latest - last == timedelta(hours=1)
            )
        ),
        "source_freshness_within_limit": freshness_seconds <= stale_seconds,
        "receipt_continuity_positive": int(
            health.get("continuous_completed_hours", 0)
        ) >= 1,
        "target_hour_utc_aligned": (
            last.minute == 0 and last.second == 0 and last.microsecond == 0
        ),
        "runtime_storage_bounded": 0 <= runtime_bytes <= max_runtime_bytes,
        "worker_job_loaded": worker_loaded,
        "worker_job_clean_or_running": worker_running or worker_clean_exit,
        "shadow_rollup_operational_healthy": (
            shadow_summary.get("operational_status") == "healthy"
            or (
                worker_running
                and shadow_summary.get("window", {}).get("missing_hours") == 1
                and all(
                    passed
                    for name, passed in shadow_summary.get("gates", {}).items()
                    if name
                    not in {
                        "scheduled_completion_rate_at_least_99_percent",
                        "minimum_30_day_window_complete",
                    }
                )
            )
        ),
        "coverage_job_loaded": coverage_loaded,
        "coverage_job_clean_or_running": (
            not coverage_due or coverage_running or coverage_clean_exit
        ),
        "coverage_audit_current_and_healthy": (
            not coverage_due or coverage_running or coverage_valid
        ),
    }
    observations = {
        "latest_settled_target_hour": latest.isoformat(),
        "last_completed_target_hour": last.isoformat(),
        "dynamic_freshness_seconds": freshness_seconds,
        "health_record_age_seconds": health_age_seconds,
        "continuous_completed_hours": int(
            health.get("continuous_completed_hours", 0)
        ),
        "runtime_bytes": runtime_bytes,
        "shadow_expected_hours": shadow_summary.get("window", {}).get(
            "expected_hours"
        ),
        "shadow_completed_hours": shadow_summary.get("window", {}).get(
            "completed_hours"
        ),
        "shadow_completion_rate": shadow_summary.get("window", {}).get(
            "completion_rate"
        ),
        "shadow_required_hours": shadow_summary.get("window", {}).get(
            "minimum_hours"
        ),
        "shadow_missing_hours": shadow_summary.get("window", {}).get(
            "missing_hours"
        ),
        "coverage_audit_due": coverage_due,
        "coverage_audit_age_seconds": coverage_age_seconds,
        "coverage_window_lag_hours": coverage_lag_hours,
        "coverage_decision": coverage_decision,
        "coverage_query_chunk_hours": coverage_chunk_hours,
    }
    return gates, observations


def job_state(label: str) -> tuple[bool, bool, bool]:
    result = subprocess.run(
        ["/bin/launchctl", "print", f"gui/{os.getuid()}/{label}"],
        check=False,
        capture_output=True,
        text=True,
    )
    return (
        result.returncode == 0,
        "state = running" in result.stdout,
        "last exit code = 0" in result.stdout,
    )


def notify(message: str) -> bool:
    subprocess.run(
        ["/usr/bin/logger", "-t", "PropulseWSPR", message],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    escaped = message.replace("\\", "\\\\").replace('"', '\\"')
    result = subprocess.run(
        [
            "/usr/bin/osascript",
            "-e",
            f'display notification "{escaped}" with title "Propulse WSPR research"',
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-root", type=Path, default=DEFAULT_RUNTIME_ROOT)
    parser.add_argument("--alert-output", type=Path)
    parser.add_argument("--stale-seconds", type=int, default=DEFAULT_STALE_SECONDS)
    parser.add_argument("--max-runtime-bytes", type=int, default=DEFAULT_MAX_RUNTIME_BYTES)
    parser.add_argument("--notify-local", action="store_true")
    parser.add_argument("--remote-env-file", type=Path)
    parser.add_argument("--test-notification", action="store_true")
    parser.add_argument("--test-output", type=Path)
    args = parser.parse_args()
    if args.stale_seconds < 3600 or args.stale_seconds > 21600:
        raise ValueError("stale seconds must be between one and six hours")
    if args.max_runtime_bytes < 256 * 1024**2:
        raise ValueError("runtime storage limit must be at least 256 MiB")
    if args.test_notification:
        delivered = notify("Research watchdog delivery test passed")
        result = {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "test": "local_notification",
            "decision": "pass" if delivered else "fail",
            "accepted": delivered,
            "research_only": True,
            "locked_outcomes_read": False,
        }
        if args.test_output is not None:
            write_json_atomic(args.test_output, result)
        print(json.dumps(result, indent=2))
        if not delivered:
            raise SystemExit(2)
        return
    args.runtime_root = args.runtime_root.expanduser().resolve()
    output_path = args.alert_output or args.runtime_root / "live_wspr_alert.json"
    previous = read_json(output_path) if output_path.exists() else {}
    gates = {name: False for name in GATE_NAMES}
    observations: dict[str, Any] = {}
    error_type: str | None = None
    try:
        health = read_json(args.runtime_root / "live_wspr_health.json")
        loaded, running, clean_exit = job_state(WORKER_LABEL)
        coverage_loaded, coverage_running, coverage_clean_exit = job_state(
            COVERAGE_LABEL
        )
        coverage_path = (
            args.runtime_root / "live_wspr_shadow_coverage_drift.json"
        )
        coverage_receipt = (
            read_json(coverage_path) if coverage_path.exists() else None
        )
        now = datetime.now(timezone.utc)
        shadow_summary = build_shadow_summary(args.runtime_root, now=now)
        write_json_atomic(
            args.runtime_root / "live_wspr_shadow_progress.json",
            shadow_summary,
        )
        gates, observations = evaluate_health(
            health,
            now=now,
            runtime_bytes=directory_bytes(args.runtime_root),
            worker_loaded=loaded,
            worker_running=running,
            worker_clean_exit=clean_exit,
            shadow_summary=shadow_summary,
            coverage_loaded=coverage_loaded,
            coverage_running=coverage_running,
            coverage_clean_exit=coverage_clean_exit,
            coverage_receipt=coverage_receipt,
            stale_seconds=args.stale_seconds,
            max_runtime_bytes=args.max_runtime_bytes,
        )
    except (KeyError, OSError, TypeError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        error_type = type(error).__name__
    alerts = sorted(name for name, passed in gates.items() if not passed)
    decision = "healthy" if not alerts else "alert"
    state_changed = (
        previous.get("decision") != decision
        or previous.get("alerts") != alerts
    )
    notification_attempted = False
    notification_delivered = False
    should_notify = (
        decision == "alert" or previous.get("decision") == "alert"
    )
    if args.notify_local and state_changed and should_notify:
        notification_attempted = True
        message = (
            "Research shadow recovered"
            if decision == "healthy"
            else "Research shadow alert: " + ", ".join(alerts)
        )
        notification_delivered = notify(message)
    generated_at = datetime.now(timezone.utc).isoformat()
    remote_configured = False
    remote_attempted = False
    remote_delivered = False
    remote_error_type: str | None = None
    remote_required = False
    try:
        remote_config = load_remote_health_config(args.remote_env_file)
        remote_configured = remote_config is not None
        remote_required = remote_configured
        if remote_config is not None:
            remote_attempted = True
            publish_remote_health(
                remote_config,
                build_remote_health_payload(
                    generated_at=generated_at,
                    decision=decision,
                    alerts=alerts,
                    observations=observations,
                ),
            )
            remote_delivered = True
    except (OSError, RuntimeError, ValueError, urllib.error.URLError) as error:
        remote_required = True
        remote_error_type = type(error).__name__
    output = {
        "schema_version": 1,
        "generated_at": generated_at,
        "decision": decision,
        "research_only": True,
        "alerts": alerts,
        "error_type": error_type,
        "thresholds": {
            "stale_seconds": args.stale_seconds,
            "max_runtime_bytes": args.max_runtime_bytes,
        },
        "observations": observations,
        "delivery": {
            "state_changed": state_changed,
            "local_notification_enabled": args.notify_local,
            "notification_attempted": notification_attempted,
            "notification_delivered": notification_delivered,
            "remote_configured": remote_configured,
            "remote_attempted": remote_attempted,
            "remote_delivered": remote_delivered,
            "remote_error_type": remote_error_type,
        },
        "gates": gates,
    }
    write_json_atomic(output_path, output)
    print(json.dumps(output, indent=2))
    if decision != "healthy" or (remote_required and not remote_delivered):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
