#!/usr/bin/env python3
"""Preflight or arm a controlled M5 outage with a private boot challenge."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
WORKFLOW = ROOT / ".github/workflows/research-health-monitor.yml"
WORKFLOW_PATH = ".github/workflows/research-health-monitor.yml"
LIVE = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
DEFAULT_HEALTH = LIVE / "research_health_endpoint_validation.json"
DEFAULT_OUTPUT = LIVE / "m5_full_outage_preparation.json"
DEFAULT_PREFLIGHT_OUTPUT = LIVE / "m5_full_outage_preflight.json"
DEFAULT_STATE = (
    Path.home()
    / "Library/Application Support/PropulseML/full_outage_drill/private_state.json"
)
STALE_SECONDS = 7200
MINIMUM_POWER_OFF_SECONDS = 9000
BOOT_SESSION_RE = re.compile(r"^[0-9A-Fa-f-]{36}$")
BOOT_TIME_RE = re.compile(r"sec = (?P<seconds>[0-9]+)")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def command(*args: str) -> str:
    return subprocess.run(
        args,
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    ).stdout.strip()


def boot_snapshot() -> tuple[str, datetime]:
    session = command("/usr/sbin/sysctl", "-n", "kern.bootsessionuuid")
    raw_boot = command("/usr/sbin/sysctl", "-n", "kern.boottime")
    match = BOOT_TIME_RE.search(raw_boot)
    if not BOOT_SESSION_RE.fullmatch(session) or match is None:
        raise RuntimeError("macOS boot metadata is unavailable")
    return session.upper(), datetime.fromtimestamp(
        int(match.group("seconds")),
        tz=timezone.utc,
    )


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("outage drill timestamps must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require_outside_repository(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError:
        return resolved
    raise RuntimeError(f"{label} must remain outside the repository")


def github_main_workflow_sha256(repository: str) -> str:
    github_cli = shutil.which("gh")
    if github_cli is None:
        for candidate in ("/opt/homebrew/bin/gh", "/usr/local/bin/gh"):
            if Path(candidate).is_file():
                github_cli = candidate
                break
    if github_cli is None:
        raise RuntimeError("authenticated GitHub CLI is unavailable")
    result = subprocess.run(
        [
            github_cli,
            "api",
            "-H",
            "Accept: application/vnd.github.raw+json",
            f"/repos/{repository}/contents/{WORKFLOW_PATH}?ref=main",
        ],
        check=True,
        capture_output=True,
        timeout=30,
    )
    return hashlib.sha256(result.stdout).hexdigest()


def build_preflight_receipt(
    *,
    now: datetime,
    health_generated_at: datetime,
    health_evidence_sha256: str,
    workflow_sha256: str,
    boot_session: str,
    boot_time: datetime,
    private_state_not_armed: bool,
    runtime: dict[str, Any],
) -> dict[str, Any]:
    health_age_seconds = int((now - health_generated_at).total_seconds())
    gates = {
        "native_m5_runtime": runtime.get("machine") == "arm64",
        "fresh_pre_outage_heartbeat": 0 <= health_age_seconds <= 900,
        "evidence_checksums_recorded": bool(
            SHA256_RE.fullmatch(health_evidence_sha256)
            and SHA256_RE.fullmatch(workflow_sha256)
        ),
        "scheduled_main_workflow_matches_local": True,
        "boot_metadata_available": bool(
            BOOT_SESSION_RE.fullmatch(boot_session) and boot_time <= now
        ),
        "private_state_not_armed": private_state_not_armed,
        "locked_outcomes_unread": True,
    }
    passed = all(gates.values())
    return {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "valid_until": (now + timedelta(minutes=5)).isoformat(),
        "scope": "controlled_full_m5_power_outage_preflight",
        "decision": "pass" if passed else "fail",
        "outage_armed": False,
        "evidence": {
            "pre_boot_session_sha256": hashlib.sha256(
                boot_session.encode()
            ).hexdigest(),
            "pre_health_evidence_sha256": health_evidence_sha256,
            "workflow_sha256": workflow_sha256,
            "private_state_path_recorded": False,
        },
        "gates": gates,
        "runtime": {
            "machine": runtime.get("machine"),
            "physical_cores_visible": runtime.get("physical_cores_visible"),
            "power_source": runtime.get("power_source"),
        },
        "privacy": {
            "boot_session_identifier_written": False,
            "private_endpoint_written": False,
            "secret_value_written": False,
            "locked_outcomes_read": False,
        },
    }


def write_private(path: Path, value: dict[str, Any]) -> None:
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--repository", default="crypticpy/propulse")
    parser.add_argument("--health-evidence", type=Path, default=DEFAULT_HEALTH)
    parser.add_argument("--workflow", type=Path, default=WORKFLOW)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--preflight-output",
        type=Path,
        default=DEFAULT_PREFLIGHT_OUTPUT,
    )
    parser.add_argument("--preflight-only", action="store_true")
    parser.add_argument("--acknowledge-controlled-power-outage", action="store_true")
    args = parser.parse_args()
    if args.preflight_only == args.acknowledge_controlled_power_outage:
        raise RuntimeError(
            "choose exactly one of preflight-only or controlled outage acknowledgement"
        )

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    state_path = require_outside_repository(args.state, "outage private state")
    now = datetime.now(timezone.utc)
    health = json.loads(args.health_evidence.read_text(encoding="utf-8"))
    health_generated = parse_utc(str(health.get("generated_at")))
    if (
        health.get("decision") != "pass"
        or health.get("scope")
        != "private_research_health_endpoint_validation"
        or not timedelta(0) <= now - health_generated <= timedelta(minutes=15)
        or not isinstance(health.get("gates"), dict)
        or not health["gates"]
        or not all(value is True for value in health["gates"].values())
        or (health.get("runtime") or {}).get("machine") != "arm64"
    ):
        raise RuntimeError("fresh pre-outage external health evidence is required")
    workflow = args.workflow.read_text(encoding="utf-8")
    if (
        'cron: "17,47 * * * *"' not in workflow
        or "workflow_dispatch:" not in workflow
        or "runs-on: ubuntu-latest" not in workflow
    ):
        raise RuntimeError("off-M5 monitor workflow contract changed")
    workflow_sha = sha256(args.workflow)
    if github_main_workflow_sha256(args.repository) != workflow_sha:
        raise RuntimeError("local workflow does not match scheduled GitHub main")
    boot_session, boot_time = boot_snapshot()
    if args.preflight_only:
        receipt = build_preflight_receipt(
            now=now,
            health_generated_at=health_generated,
            health_evidence_sha256=sha256(args.health_evidence),
            workflow_sha256=workflow_sha,
            boot_session=boot_session,
            boot_time=boot_time,
            private_state_not_armed=not state_path.exists(),
            runtime=runtime,
        )
        atomic_write(args.preflight_output, receipt)
        print(json.dumps(receipt, indent=2, sort_keys=True))
        if receipt["decision"] != "pass":
            raise SystemExit(2)
        return
    challenge = secrets.token_hex(32)
    private_state = {
        "schema_version": 1,
        "scope": "controlled_full_m5_power_outage_private_state",
        "prepared_at": now.isoformat(),
        "challenge": challenge,
        "pre_boot_session_uuid": boot_session,
        "pre_boot_time": boot_time.isoformat(),
        "pre_health_generated_at": health_generated.isoformat(),
        "pre_health_evidence_sha256": sha256(args.health_evidence),
        "workflow_sha256": workflow_sha,
        "stale_seconds": STALE_SECONDS,
        "minimum_power_off_seconds": MINIMUM_POWER_OFF_SECONDS,
    }
    write_private(state_path, private_state)
    private_state_sha256 = sha256(state_path)
    receipt = {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "scope": "controlled_full_m5_power_outage_preparation",
        "decision": "armed",
        "required_operator_action": "shut_down_m5_and_restore_power_after_minimum_interval",
        "minimum_power_off_seconds": MINIMUM_POWER_OFF_SECONDS,
        "monitor_stale_seconds": STALE_SECONDS,
        "evidence": {
            "challenge_sha256": hashlib.sha256(challenge.encode()).hexdigest(),
            "pre_boot_session_sha256": hashlib.sha256(
                boot_session.encode()
            ).hexdigest(),
            "private_state_sha256": private_state_sha256,
            "pre_health_evidence_sha256": private_state[
                "pre_health_evidence_sha256"
            ],
            "workflow_sha256": private_state["workflow_sha256"],
            "private_state_path_recorded": False,
        },
        "runtime": {
            "machine": runtime["machine"],
            "physical_cores_visible": runtime["physical_cores_visible"],
            "power_source": runtime["power_source"],
        },
        "gates": {
            "native_m5_runtime": runtime["machine"] == "arm64",
            "fresh_pre_outage_heartbeat": True,
            "off_m5_schedule_exact": True,
            "scheduled_main_workflow_matches_local": True,
            "private_state_owner_only": (
                state_path.stat().st_mode & 0o077 == 0
            ),
            "challenge_committed_before_shutdown": True,
            "locked_outcomes_unread": True,
        },
        "privacy": {
            "boot_session_identifier_written": False,
            "private_endpoint_written": False,
            "secret_value_written": False,
            "locked_outcomes_read": False,
        },
    }
    atomic_write(args.output, receipt)
    print(json.dumps(receipt, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
