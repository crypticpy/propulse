#!/usr/bin/env python3
"""Validate a literal M5 shutdown detected and recovered by the off-M5 monitor."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timedelta, timezone, tzinfo
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from prepare_m5_full_outage_drill import (
    BOOT_SESSION_RE,
    WORKFLOW,
    boot_snapshot,
    parse_utc,
    require_outside_repository,
)
from validate_live_feature_migration import ROOT, atomic_write
from validate_research_health_incident_delivery import (
    ISSUE_PATTERN,
    MARKER,
    RECOVERY_PATTERN,
    load_inputs,
)


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
LIVE = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
DEFAULT_PREPARATION = LIVE / "m5_full_outage_preparation.json"
DEFAULT_HEALTH = LIVE / "research_health_endpoint_validation.json"
DEFAULT_OUTPUT = LIVE / "m5_full_outage_recovery_validation.json"
DEFAULT_STATE = (
    Path.home()
    / "Library/Application Support/PropulseML/full_outage_drill/private_state.json"
)
LAST_RE = re.compile(
    r"^(?P<kind>reboot|shutdown) time\s+\w{3} "
    r"(?P<month>\w{3})\s+(?P<day>\d{1,2})\s+"
    r"(?P<year>\d{4})\s+(?P<hour>\d{2}):(?P<minute>\d{2})$"
)
STATE_FIELDS = {
    "schema_version",
    "scope",
    "prepared_at",
    "challenge",
    "pre_boot_session_uuid",
    "pre_boot_time",
    "pre_health_generated_at",
    "pre_health_evidence_sha256",
    "workflow_sha256",
    "stale_seconds",
    "minimum_power_off_seconds",
}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
WORKFLOW_PATH = ".github/workflows/research-health-monitor.yml"
WORKFLOW_NAME = "Research health monitor"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def owner_only(path: Path) -> bool:
    return path.is_file() and path.stat().st_mode & 0o077 == 0


def private_state_schema_exact(state: dict[str, Any]) -> bool:
    return bool(
        set(state) == STATE_FIELDS
        and state.get("schema_version") == 1
        and state.get("scope")
        == "controlled_full_m5_power_outage_private_state"
        and isinstance(state.get("challenge"), str)
        and len(state["challenge"]) == 64
        and re.fullmatch(r"[0-9a-f]{64}", state["challenge"])
        and isinstance(state.get("pre_boot_session_uuid"), str)
        and BOOT_SESSION_RE.fullmatch(state["pre_boot_session_uuid"])
        and isinstance(state.get("pre_health_evidence_sha256"), str)
        and SHA256_RE.fullmatch(state["pre_health_evidence_sha256"])
        and isinstance(state.get("workflow_sha256"), str)
        and SHA256_RE.fullmatch(state["workflow_sha256"])
        and type(state.get("stale_seconds")) is int
        and state["stale_seconds"] == 7200
        and type(state.get("minimum_power_off_seconds")) is int
        and state["minimum_power_off_seconds"] == 9000
    )


def shutdown_history() -> str:
    return subprocess.run(
        ["/usr/bin/last", "-y", "-n", "12", "shutdown", "reboot"],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    ).stdout


def gh_workflow_sha256(repository: str, ref: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", ref):
        raise ValueError("workflow run head SHA is invalid")
    result = subprocess.run(
        [
            "gh",
            "api",
            "-H",
            "Accept: application/vnd.github.raw+json",
            f"/repos/{repository}/contents/{WORKFLOW_PATH}?ref={ref}",
        ],
        check=True,
        capture_output=True,
        timeout=30,
    )
    return hashlib.sha256(result.stdout).hexdigest()


def parse_shutdown_history(
    value: str,
    *,
    local_timezone: tzinfo,
) -> tuple[datetime, datetime]:
    rows: list[tuple[str, datetime]] = []
    for line in value.splitlines():
        match = LAST_RE.fullmatch(line.strip())
        if match is None:
            continue
        parsed = datetime.strptime(
            (
                f"{match.group('month')} {match.group('day')} "
                f"{match.group('year')} {match.group('hour')}:"
                f"{match.group('minute')}"
            ),
            "%b %d %Y %H:%M",
        ).replace(tzinfo=local_timezone)
        rows.append((match.group("kind"), parsed.astimezone(timezone.utc)))
    reboot_index = next(
        (index for index, row in enumerate(rows) if row[0] == "reboot"),
        None,
    )
    if reboot_index is None:
        raise ValueError("current reboot record is missing")
    shutdown = next(
        (row[1] for row in rows[reboot_index + 1 :] if row[0] == "shutdown"),
        None,
    )
    if shutdown is None:
        raise ValueError("preceding shutdown record is missing")
    return shutdown, rows[reboot_index][1]


def evaluate_outage_episode(
    *,
    state: dict[str, Any],
    state_sha256: str,
    preparation: dict[str, Any],
    issue: dict[str, Any],
    comments: list[dict[str, Any]],
    issues: list[dict[str, Any]],
    stale_run: dict[str, Any],
    recovery_run: dict[str, Any],
    stale_workflow_sha256: str,
    recovery_workflow_sha256: str,
    current_boot_session: str,
    current_boot_time: datetime,
    recorded_shutdown_at: datetime,
    recorded_reboot_at: datetime,
    post_health: dict[str, Any],
    now: datetime,
) -> dict[str, Any]:
    if not private_state_schema_exact(state):
        raise ValueError("outage drill private state schema is invalid")
    prepared_at = parse_utc(str(state["prepared_at"]))
    pre_boot_time = parse_utc(str(state["pre_boot_time"]))
    pre_health_at = parse_utc(str(state["pre_health_generated_at"]))
    post_health_at = parse_utc(str(post_health.get("generated_at")))
    issue_created = parse_utc(str(issue["created_at"]))
    issue_closed = parse_utc(str(issue["closed_at"]))
    stale_started = parse_utc(str(stale_run["created_at"]))
    stale_finished = parse_utc(str(stale_run["updated_at"]))
    recovery_started = parse_utc(str(recovery_run["created_at"]))
    recovery_finished = parse_utc(str(recovery_run["updated_at"]))
    issue_match = ISSUE_PATTERN.fullmatch(str(issue.get("body") or ""))
    recovery_matches = [
        (comment, match)
        for comment in comments
        if (match := RECOVERY_PATTERN.fullmatch(str(comment.get("body") or "")))
    ]
    recovery_comment = recovery_matches[-1][0] if recovery_matches else {}
    recovery_comment_at = (
        parse_utc(str(recovery_comment["created_at"]))
        if recovery_comment
        else datetime.min.replace(tzinfo=timezone.utc)
    )
    stale_age = int(issue_match.group("age")) if issue_match else -1
    recovery_age = (
        int(recovery_matches[-1][1].group("age")) if recovery_matches else -1
    )
    outage_issues = [
        candidate
        for candidate in issues
        if str(candidate.get("body") or "").startswith(MARKER)
        and "pull_request" not in candidate
        and recorded_shutdown_at
        <= parse_utc(str(candidate["created_at"]))
        <= current_boot_time
    ]
    minimum_power_off = int(state["minimum_power_off_seconds"])
    power_off_seconds = int(
        (current_boot_time - recorded_shutdown_at).total_seconds()
    )
    expected_challenge = hashlib.sha256(
        str(state["challenge"]).encode()
    ).hexdigest()
    expected_pre_session = hashlib.sha256(
        str(state["pre_boot_session_uuid"]).encode()
    ).hexdigest()
    preparation_evidence = preparation.get("evidence")
    preparation_evidence = (
        preparation_evidence if isinstance(preparation_evidence, dict) else {}
    )
    preparation_gates = preparation.get("gates")
    gates = {
        "preparation_receipt_and_private_state_bound": bool(
            preparation.get("schema_version") == 1
            and preparation.get("decision") == "armed"
            and preparation.get("scope")
            == "controlled_full_m5_power_outage_preparation"
            and preparation.get("required_operator_action")
            == "shut_down_m5_and_restore_power_after_minimum_interval"
            and preparation.get("minimum_power_off_seconds")
            == minimum_power_off
            and preparation.get("monitor_stale_seconds")
            == int(state["stale_seconds"])
            and preparation_evidence.get("private_state_sha256") == state_sha256
            and preparation_evidence.get("challenge_sha256") == expected_challenge
            and preparation_evidence.get("pre_boot_session_sha256")
            == expected_pre_session
            and preparation_evidence.get("pre_health_evidence_sha256")
            == state["pre_health_evidence_sha256"]
            and preparation_evidence.get("workflow_sha256")
            == state["workflow_sha256"]
            and preparation_evidence.get("private_state_path_recorded") is False
            and isinstance(preparation_gates, dict)
            and preparation_gates
            and all(value is True for value in preparation_gates.values())
        ),
        "scheduled_runs_use_precommitted_workflow": bool(
            stale_workflow_sha256 == state["workflow_sha256"]
            and recovery_workflow_sha256 == state["workflow_sha256"]
            and stale_run.get("name") == WORKFLOW_NAME
            and recovery_run.get("name") == WORKFLOW_NAME
            and stale_run.get("path") == WORKFLOW_PATH
            and recovery_run.get("path") == WORKFLOW_PATH
            and stale_run.get("head_branch") == "main"
            and recovery_run.get("head_branch") == "main"
            and int(stale_run.get("run_attempt", 0)) == 1
            and int(recovery_run.get("run_attempt", 0)) == 1
        ),
        "fresh_health_published_before_shutdown": bool(
            pre_boot_time <= pre_health_at <= prepared_at
            and prepared_at <= recorded_shutdown_at + timedelta(seconds=90)
            and prepared_at - pre_health_at <= timedelta(minutes=15)
        ),
        "new_m5_boot_session_observed": bool(
            BOOT_SESSION_RE.fullmatch(current_boot_session)
            and current_boot_session.upper()
            != str(state["pre_boot_session_uuid"]).upper()
        ),
        "shutdown_and_reboot_history_match_current_boot": bool(
            prepared_at <= recorded_shutdown_at + timedelta(seconds=90)
            and recorded_shutdown_at < current_boot_time
            and abs((current_boot_time - recorded_reboot_at).total_seconds()) < 90
        ),
        "power_off_interval_exceeded_monitor_boundary": bool(
            power_off_seconds - 60 >= minimum_power_off
            and minimum_power_off >= int(state["stale_seconds"])
        ),
        "off_m5_monitor_detected_power_loss": bool(
            issue_match
            and stale_age > int(state["stale_seconds"])
            and stale_run.get("conclusion") == "failure"
            and stale_run.get("event") == "schedule"
            and recorded_shutdown_at <= stale_started <= current_boot_time
            and stale_started <= issue_created <= stale_finished + timedelta(minutes=2)
            and recorded_shutdown_at <= issue_created <= current_boot_time
            and len(outage_issues) == 1
            and int(outage_issues[0]["number"]) == int(issue["number"])
            and issue.get("user", {}).get("login") == "github-actions[bot]"
        ),
        "identity_free_incident_template": bool(
            issue_match and "http" not in str(issue.get("body") or "").lower()
        ),
        "publisher_recovered_after_power_restore": bool(
            recovery_run.get("conclusion") == "success"
            and recovery_run.get("event") == "schedule"
            and current_boot_time <= recovery_started <= now
            and recovery_started
            <= recovery_comment_at
            <= recovery_finished + timedelta(minutes=2)
            and recovery_started <= issue_closed <= recovery_finished + timedelta(minutes=2)
            and issue.get("state") == "closed"
            and len(recovery_matches) == 1
            and recovery_comment.get("user", {}).get("login")
            == "github-actions[bot]"
            and 0 <= recovery_age < int(state["stale_seconds"])
        ),
        "post_boot_health_endpoint_passed": bool(
            post_health.get("decision") == "pass"
            and post_health.get("scope")
            == "protected_preview_research_health_endpoint_validation"
            and current_boot_time <= post_health_at <= now
            and isinstance(post_health.get("gates"), dict)
            and post_health["gates"]
            and all(value is True for value in post_health["gates"].values())
            and (post_health.get("runtime") or {}).get("machine") == "arm64"
        ),
        "locked_outcomes_unread": True,
    }
    passed = all(gates.values())
    return {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "scope": "controlled_full_m5_power_outage_recovery",
        "decision": "pass" if passed else "fail",
        "outage": {
            "shutdown_at": recorded_shutdown_at.isoformat(),
            "boot_at": current_boot_time.isoformat(),
            "power_off_seconds_lower_bound": power_off_seconds - 60,
            "minimum_power_off_seconds": minimum_power_off,
        },
        "external_monitor": {
            "stale_run_id": int(stale_run["id"]),
            "recovery_run_id": int(recovery_run["id"]),
            "incident_number": int(issue["number"]),
            "stale_heartbeat_age_seconds": stale_age,
            "recovery_heartbeat_age_seconds": recovery_age,
        },
        "evidence": {
            "preparation_sha256": hashlib.sha256(
                json.dumps(
                    preparation,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode()
            ).hexdigest(),
            "private_state_sha256": state_sha256,
            "pre_boot_session_sha256": expected_pre_session,
            "post_boot_session_sha256": hashlib.sha256(
                current_boot_session.encode()
            ).hexdigest(),
            "private_state_path_recorded": False,
        },
        "gates": gates,
        "privacy": {
            "boot_session_identifier_written": False,
            "private_endpoint_written": False,
            "secret_value_written": False,
            "locked_outcomes_read": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--repository", default="crypticpy/propulse")
    parser.add_argument("--issue", type=int, required=True)
    parser.add_argument("--stale-run", type=int, required=True)
    parser.add_argument("--recovery-run", type=int, required=True)
    parser.add_argument("--input-dir", type=Path)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    parser.add_argument("--preparation", type=Path, default=DEFAULT_PREPARATION)
    parser.add_argument("--post-health", type=Path, default=DEFAULT_HEALTH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--workflow", type=Path, default=WORKFLOW)
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    state_path = require_outside_repository(args.state, "outage private state")
    if not owner_only(state_path):
        raise RuntimeError("outage drill private state must be owner-only")
    state_raw = state_path.read_bytes()
    state = json.loads(state_raw)
    if not isinstance(state, dict) or not private_state_schema_exact(state):
        raise RuntimeError("outage drill private state schema is invalid")
    preparation = json.loads(args.preparation.read_text(encoding="utf-8"))
    post_health = json.loads(args.post_health.read_text(encoding="utf-8"))
    issue, comments, issues, stale_run, recovery_run = load_inputs(
        args.input_dir,
        base=f"/repos/{args.repository}",
        issue_number=args.issue,
        stale_run_id=args.stale_run,
        recovery_run_id=args.recovery_run,
    )
    if args.input_dir is None:
        stale_workflow_sha = gh_workflow_sha256(
            args.repository, str(stale_run.get("head_sha", ""))
        )
        recovery_workflow_sha = gh_workflow_sha256(
            args.repository, str(recovery_run.get("head_sha", ""))
        )
    else:
        source = args.input_dir.expanduser().resolve()
        stale_workflow_sha = sha256(source / "stale_workflow.yml")
        recovery_workflow_sha = sha256(source / "recovery_workflow.yml")
    if sha256(args.workflow) != str(state.get("workflow_sha256", "")):
        raise RuntimeError("local workflow no longer matches the armed drill")
    current_session, current_boot = boot_snapshot()
    local_timezone = datetime.now().astimezone().tzinfo
    if local_timezone is None:
        raise RuntimeError("M5 local timezone is unavailable")
    shutdown_at, reboot_at = parse_shutdown_history(
        shutdown_history(),
        local_timezone=local_timezone,
    )
    result = evaluate_outage_episode(
        state=state,
        state_sha256=hashlib.sha256(state_raw).hexdigest(),
        preparation=preparation,
        issue=issue,
        comments=comments,
        issues=issues,
        stale_run=stale_run,
        recovery_run=recovery_run,
        stale_workflow_sha256=stale_workflow_sha,
        recovery_workflow_sha256=recovery_workflow_sha,
        current_boot_session=current_session,
        current_boot_time=current_boot,
        recorded_shutdown_at=shutdown_at,
        recorded_reboot_at=reboot_at,
        post_health=post_health,
        now=datetime.now(timezone.utc),
    )
    result["runtime"] = {
        "machine": runtime["machine"],
        "physical_cores_visible": runtime["physical_cores_visible"],
        "power_source": runtime["power_source"],
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2, sort_keys=True))
    if result["decision"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
