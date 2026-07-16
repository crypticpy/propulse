#!/usr/bin/env python3
"""Independently validate the active research-only WSPR hourly schedule."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import plistlib
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx


ROOT = Path(__file__).resolve().parents[3]
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(SERVICE))

from wspr_finalizer import HF_BANDS  # noqa: E402
from wspr_scheduler import CompletionManifest, aware_utc  # noqa: E402


LABEL = "org.propulse.wspr-research"
HEALTH_LABEL = "org.propulse.wspr-research-health"
DEFAULT_RUNTIME_ROOT = Path.home() / "Library/Application Support/PropulseML"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/wspr_research_schedule_validation.json"
)
IDENTITY_KEY_FRAGMENTS = (
    "callsign",
    "grid4",
    "grid6",
    "latitude",
    "longitude",
    "receiver",
    "transmitter",
    "user_id",
    "ip_address",
)
EXPECTED_RECEIPT_GATES = {
    "connector_complete",
    "connector_spool_removed",
    "connector_matches_manifest",
    "scheduler_complete",
    "scheduler_matches_manifest",
    "all_bands_finalized",
    "m5_threads_bounded",
    "timestamps_causal",
}
EXPECTED_RECEIPT_KEYS = {
    "schema_version",
    "generated_at",
    "status",
    "research_only",
    "provider",
    "target_hour",
    "source_watermark",
    "available_at",
    "started_at",
    "ended_at",
    "source_checkpoint_sha256",
    "completion_manifest_sha256",
    "source_record_count",
    "records_by_band",
    "feature_cell_count",
    "pruned_observations",
    "connector",
    "finalizer",
    "gates",
}
EXPECTED_LAUNCHD_ENVIRONMENT = {
    "PROPULSE_WSPR_LIVE_RESEARCH_ENABLED",
    "PROPULSE_ML_ARTIFACT_ROOT",
}
EXPECTED_WATCHDOG_GATES = {
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
}


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"{path.name} is not a JSON object")
    return value


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def latest_receipt(receipt_dir: Path) -> Path:
    receipts = sorted(receipt_dir.glob("*.json"))
    if not receipts:
        raise RuntimeError("no completed WSPR research receipt exists")
    return receipts[-1]


def has_identity_key(value: Any) -> bool:
    if isinstance(value, dict):
        return any(
            any(fragment in str(key).lower() for fragment in IDENTITY_KEY_FRAGMENTS)
            or has_identity_key(child)
            for key, child in value.items()
        )
    if isinstance(value, list):
        return any(has_identity_key(child) for child in value)
    return False


def launchd_gates(payload: dict[str, Any], *, runtime_root: Path) -> dict[str, bool]:
    arguments = payload.get("ProgramArguments", [])
    environment = payload.get("EnvironmentVariables", {})
    rendered = repr(payload).lower()
    secret_markers = ("secret", "password", "token", "service_role", "apikey")
    try:
        root_index = arguments.index("--artifact-root") + 1
        configured_root = Path(arguments[root_index])
    except (AttributeError, IndexError, ValueError, TypeError):
        configured_root = Path("/")
    return {
        "launchd_hourly_and_restart_enabled": (
            payload.get("Label") == LABEL
            and payload.get("StartCalendarInterval") == {"Minute": 15}
            and payload.get("RunAtLoad") is True
        ),
        "launchd_runtime_internal_and_exact": (
            configured_root == runtime_root
            and environment.get("PROPULSE_ML_ARTIFACT_ROOT") == str(runtime_root)
            and runtime_root.resolve().is_relative_to(Path.home().resolve())
        ),
        "launchd_research_gate_explicit": (
            environment.get("PROPULSE_WSPR_LIVE_RESEARCH_ENABLED") == "true"
        ),
        "launchd_owner_only_and_secret_free": (
            payload.get("Umask") == 0o077
            and set(environment) == EXPECTED_LAUNCHD_ENVIRONMENT
            and not any(marker in rendered for marker in secret_markers)
        ),
        "launchd_logs_on_internal_home": all(
            str(payload.get(key, "")).startswith(str(Path.home() / "Library/Logs"))
            for key in ("StandardOutPath", "StandardErrorPath")
        ),
    }


def health_launchd_gates(
    payload: dict[str, Any], *, runtime_root: Path, remote_env: Path | None = None
) -> dict[str, bool]:
    arguments = payload.get("ProgramArguments", [])
    rendered = repr(payload).lower()
    secret_markers = ("secret", "password", "token", "service_role", "apikey")
    remote_env = remote_env or ROOT / ".env.local"
    remote_env_details = remote_env.stat() if remote_env.exists() else None
    expected_values = {
        "--runtime-root": str(runtime_root),
        "--alert-output": str(runtime_root / "live_wspr_alert.json"),
        "--stale-seconds": "7200",
        "--max-runtime-bytes": str(2 * 1024**3),
        "--remote-env-file": str(remote_env),
    }
    values: dict[str, str] = {}
    for option in expected_values:
        try:
            values[option] = str(arguments[arguments.index(option) + 1])
        except (AttributeError, IndexError, ValueError, TypeError):
            values[option] = ""
    return {
        "watchdog_twice_hourly_and_restart_enabled": (
            payload.get("Label") == HEALTH_LABEL
            and payload.get("StartCalendarInterval")
            == [{"Minute": 0}, {"Minute": 30}]
            and payload.get("RunAtLoad") is True
        ),
        "watchdog_thresholds_and_runtime_exact": (
            values == expected_values
            and len(arguments) == 13
            and runtime_root.resolve().is_relative_to(Path.home().resolve())
            and remote_env_details is not None
            and not remote_env.is_symlink()
            and remote_env_details.st_uid == os.getuid()
            and remote_env_details.st_mode & 0o077 == 0
        ),
        "watchdog_owner_only_and_secret_free": (
            payload.get("Umask") == 0o077
            and "EnvironmentVariables" not in payload
            and not any(marker in rendered for marker in secret_markers)
        ),
        "watchdog_local_notification_enabled": "--notify-local" in arguments,
        "watchdog_logs_on_internal_home": all(
            str(payload.get(key, "")).startswith(str(Path.home() / "Library/Logs"))
            for key in ("StandardOutPath", "StandardErrorPath")
        ),
    }


class TargetReader:
    def __init__(self, *, base_url: str, service_key: str) -> None:
        if not base_url.strip() or not service_key.strip():
            raise RuntimeError("feature-store URL and service key are required")
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=30)
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }
        self.request_count = 0

    def rows(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        self.request_count += 1
        response = self.client.get(
            f"{self.base_url}/rest/v1/{table}",
            headers=self.headers,
            params=params,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
            raise RuntimeError(f"{table} returned invalid JSON")
        return payload

    def exact_count(self, table: str, params: dict[str, str]) -> int:
        self.request_count += 1
        response = self.client.get(
            f"{self.base_url}/rest/v1/{table}",
            headers={**self.headers, "Prefer": "count=exact", "Range": "0-0"},
            params={"select": "id", **params},
        )
        response.raise_for_status()
        content_range = response.headers.get("content-range", "")
        try:
            return int(content_range.rsplit("/", 1)[1])
        except (IndexError, ValueError) as error:
            raise RuntimeError(f"{table} did not return an exact count") from error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-root", type=Path, default=DEFAULT_RUNTIME_ROOT)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--plist", type=Path)
    parser.add_argument("--health-plist", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    args.runtime_root = args.runtime_root.expanduser().resolve()
    started = time.perf_counter()
    receipt_path = args.receipt or latest_receipt(args.runtime_root / "live_wspr_receipts")
    receipt = read_json(receipt_path)
    completed_manifest_path = (
        args.runtime_root / "live_wspr_manifests/completed" / receipt_path.name
    )
    manifest_payload = read_json(completed_manifest_path)
    manifest = CompletionManifest.from_json(
        manifest_payload,
        signing_secret=os.environ.get("PROPULSE_WSPR_COMPLETION_SECRET", ""),
    )
    health = read_json(args.runtime_root / "live_wspr_health.json")
    plist_path = args.plist or (
        Path.home() / "Library/LaunchAgents" / f"{LABEL}.plist"
    )
    plist_payload = plistlib.loads(plist_path.read_bytes())
    if not isinstance(plist_payload, dict):
        raise RuntimeError("launchd plist is not a dictionary")
    health_plist_path = args.health_plist or (
        Path.home() / "Library/LaunchAgents" / f"{HEALTH_LABEL}.plist"
    )
    health_plist_payload = plistlib.loads(health_plist_path.read_bytes())
    if not isinstance(health_plist_payload, dict):
        raise RuntimeError("watchdog launchd plist is not a dictionary")
    watchdog = read_json(args.runtime_root / "live_wspr_alert.json")
    watchdog_delivery_test = read_json(
        args.runtime_root / "live_wspr_notification_test.json"
    )
    target = TargetReader(
        base_url=os.environ.get("PROPULSE_FEATURE_STORE_URL", ""),
        service_key=os.environ.get("PROPULSE_FEATURE_STORE_SERVICE_KEY", ""),
    )
    target_iso = manifest.target_hour.isoformat()
    available_iso = manifest.available_at.isoformat()
    observation_counts = {
        band: target.exact_count(
            "wspr_observations_rolling",
            {
                "source": f"eq.{manifest.provider}",
                "target_hour": f"eq.{target_iso}",
                "band": f"eq.{band}",
                "received_at": f"lte.{available_iso}",
            },
        )
        for band in sorted(HF_BANDS)
    }
    feature_counts = {
        band: target.exact_count(
            "wspr_path_hourly_features",
            {
                "provider": f"eq.{manifest.provider}",
                "target_hour": f"eq.{target_iso}",
                "band": f"eq.{band}",
                "available_at": f"eq.{available_iso}",
            },
        )
        for band in sorted(HF_BANDS)
    }
    watermarks = target.rows(
        "wspr_feature_watermarks",
        {
            "select": "band,status,observation_count,feature_cell_count,quality_flags",
            "provider": f"eq.{manifest.provider}",
            "target_hour": f"eq.{target_iso}",
            "available_at": f"eq.{available_iso}",
            "order": "band.asc",
        },
    )
    watermark_by_band = {str(row.get("band")): row for row in watermarks}
    launchctl = subprocess.run(
        ["/bin/launchctl", "print", f"gui/{os.getuid()}/{LABEL}"],
        check=False,
        capture_output=True,
        text=True,
    )
    launchd = launchd_gates(plist_payload, runtime_root=args.runtime_root)
    health_launchd = health_launchd_gates(
        health_plist_payload, runtime_root=args.runtime_root
    )
    health_launchctl = subprocess.run(
        ["/bin/launchctl", "print", f"gui/{os.getuid()}/{HEALTH_LABEL}"],
        check=False,
        capture_output=True,
        text=True,
    )
    target_hour = aware_utc(str(receipt.get("target_hour")), "receipt target_hour")
    completed_manifest_hash = sha256(completed_manifest_path)
    gates = {
        "signed_manifest_v2_accepted": manifest_payload.get("schema_version") == 2,
        "receipt_complete_research_only": (
            receipt.get("status") == "complete" and receipt.get("research_only") is True
        ),
        "receipt_identity_free": (
            set(receipt) == EXPECTED_RECEIPT_KEYS and not has_identity_key(receipt)
        ),
        "receipt_manifest_hash_linked": (
            receipt.get("completion_manifest_sha256") == completed_manifest_hash
        ),
        "receipt_manifest_counts_exact": (
            target_hour == manifest.target_hour
            and receipt.get("records_by_band") == manifest.source_records_by_band
            and int(receipt.get("source_record_count", -1)) == manifest.source_record_count
            and sum(manifest.source_records_by_band.values()) == manifest.source_record_count
        ),
        "receipt_gates_all_pass": (
            set(receipt.get("gates", {})) == EXPECTED_RECEIPT_GATES
            and all(receipt.get("gates", {}).values())
        ),
        "all_hf_bands_present": set(observation_counts) == HF_BANDS,
        "target_observation_counts_exact": observation_counts == manifest.source_records_by_band,
        "target_watermarks_complete_and_exact": (
            len(watermarks) == len(HF_BANDS)
            and set(watermark_by_band) == HF_BANDS
            and all(
                row.get("status") == "complete"
                and not row.get("quality_flags")
                and int(row.get("observation_count", -1))
                == manifest.source_records_by_band[band]
                and int(row.get("feature_cell_count", -1)) == feature_counts[band]
                for band, row in watermark_by_band.items()
            )
        ),
        "target_feature_total_exact": (
            sum(feature_counts.values()) == int(receipt.get("feature_cell_count", -1))
        ),
        "health_matches_latest_receipt": (
            health.get("status") == "healthy"
            and int(health.get("consecutive_failures", -1)) == 0
            and aware_utc(
                str(health.get("last_completed_target_hour")),
                "health last completed hour",
            )
            == manifest.target_hour
            and int(health.get("continuous_completed_hours", 0)) >= 1
        ),
        "m5_multicore_bounded": (
            receipt.get("finalizer", {}).get("workers") == 2
            and receipt.get("finalizer", {}).get("threads_per_band") == 9
            and receipt.get("finalizer", {}).get("maximum_compute_threads") == 18
        ),
        "transient_spool_removed": not any(
            (args.runtime_root / "live_wspr_spool").glob("*")
        ),
        "launchd_job_loaded_and_clean_exit": (
            launchctl.returncode == 0
            and (
                "state = running" in launchctl.stdout
                or "last exit code = 0" in launchctl.stdout
            )
        ),
        **launchd,
        "watchdog_current_status_healthy": (
            watchdog.get("decision") == "healthy"
            and not watchdog.get("alerts")
            and set(watchdog.get("gates", {})) == EXPECTED_WATCHDOG_GATES
            and all(watchdog.get("gates", {}).values())
        ),
        "watchdog_job_loaded_and_clean_exit": (
            health_launchctl.returncode == 0
            and (
                "state = running" in health_launchctl.stdout
                or "last exit code = 0" in health_launchctl.stdout
            )
        ),
        "watchdog_local_delivery_smoke_passed": (
            watchdog_delivery_test.get("decision") == "pass"
            and watchdog_delivery_test.get("accepted") is True
            and watchdog_delivery_test.get("research_only") is True
            and watchdog_delivery_test.get("locked_outcomes_read") is False
        ),
        **health_launchd,
        "locked_outcomes_unread": True,
    }
    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "active_wspr_research_schedule_validation",
        "decision": "pass" if all(gates.values()) else "fail",
        "locked_outcomes_read": False,
        "research_only": True,
        "subscriber_facing_authorized": False,
        "provider": manifest.provider,
        "target_hour": target_iso,
        "source_record_count": manifest.source_record_count,
        "records_by_band": manifest.source_records_by_band,
        "feature_cell_count": sum(feature_counts.values()),
        "connector": receipt["connector"],
        "finalizer": receipt["finalizer"],
        "health": {
            "status": health.get("status"),
            "continuous_completed_hours": health.get("continuous_completed_hours"),
            "consecutive_failures": health.get("consecutive_failures"),
            "freshness_seconds": health.get("freshness_seconds"),
        },
        "schedule": {
            "label": LABEL,
            "minute": 15,
            "run_at_load": True,
            "watchdog_label": HEALTH_LABEL,
            "watchdog_minutes": [0, 30],
            "runtime_storage": "internal_owner_only",
            "large_ml_storage": "projects_volume",
        },
        "watchdog": {
            "decision": watchdog.get("decision"),
            "alerts": watchdog.get("alerts"),
            "thresholds": watchdog.get("thresholds"),
            "observations": watchdog.get("observations"),
            "delivery": watchdog.get("delivery"),
            "delivery_test": {
                "decision": watchdog_delivery_test.get("decision"),
                "accepted": watchdog_delivery_test.get("accepted"),
                "generated_at": watchdog_delivery_test.get("generated_at"),
            },
        },
        "execution": {
            "target_requests": target.request_count,
            "validation_wall_seconds": time.perf_counter() - started,
        },
        "gates": gates,
    }
    atomic_write(args.output, output)
    print(json.dumps(output, indent=2))
    if output["decision"] != "pass":
        raise SystemExit("active WSPR research schedule validation failed")


if __name__ == "__main__":
    main()
