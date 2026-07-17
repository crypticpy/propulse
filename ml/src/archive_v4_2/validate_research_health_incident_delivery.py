#!/usr/bin/env python3
"""Validate one real stale-heartbeat incident and genuine recovery episode."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/research_health_incident_delivery_validation.json"
)
MARKER = "<!-- propulse-research-health-monitor -->"
ISSUE_PATTERN = re.compile(
    rf"^{re.escape(MARKER)}\n"
    r"The independent GitHub-hosted monitor detected a NowCast "
    r"research-health problem\.\n\n"
    r"- Reason: M5 heartbeat stale\n"
    r"- M5 heartbeat age: (?P<age>\d+) seconds\n"
    r"- Failed webhook deliveries this run: (?P<failed>\d+)\n"
    r"- Exhausted webhook deliveries: (?P<exhausted>\d+)\n\n"
    r"This issue contains aggregate operational state only\. It excludes "
    r"callsigns, grids, equipment, user data, secrets, and private endpoint "
    r"addresses\.$"
)
RECOVERY_PATTERN = re.compile(
    rf"^{re.escape(MARKER)}\n"
    r"A genuine healthy heartbeat was observed again\. Current heartbeat age: "
    r"(?P<age>\d+) seconds\. Closing the monitor incident\.$"
)


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
        timezone.utc
    )


def gh_api(path: str) -> Any:
    result = subprocess.run(
        ["gh", "api", path],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def load_inputs(
    input_dir: Path | None,
    *,
    base: str,
    issue_number: int,
    stale_run_id: int,
    recovery_run_id: int,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    if input_dir is not None:
        source = input_dir.expanduser().resolve()
        return (
            json.loads((source / "issue.json").read_text(encoding="utf-8")),
            json.loads((source / "comments.json").read_text(encoding="utf-8")),
            json.loads((source / "issues.json").read_text(encoding="utf-8")),
            json.loads((source / "stale_run.json").read_text(encoding="utf-8")),
            json.loads((source / "recovery_run.json").read_text(encoding="utf-8")),
        )
    return (
        gh_api(f"{base}/issues/{issue_number}"),
        gh_api(f"{base}/issues/{issue_number}/comments?per_page=100"),
        gh_api(f"{base}/issues?state=all&per_page=100"),
        gh_api(f"{base}/actions/runs/{stale_run_id}"),
        gh_api(f"{base}/actions/runs/{recovery_run_id}"),
    )


def evaluate_episode(
    *,
    issue: dict[str, Any],
    comments: list[dict[str, Any]],
    issues: list[dict[str, Any]],
    stale_run: dict[str, Any],
    recovery_run: dict[str, Any],
    stale_seconds: int = 7200,
) -> tuple[dict[str, Any], dict[str, bool]]:
    issue_match = ISSUE_PATTERN.fullmatch(str(issue.get("body") or ""))
    recovery_matches = [
        (comment, match)
        for comment in comments
        if (match := RECOVERY_PATTERN.fullmatch(str(comment.get("body") or "")))
    ]
    stale_age = int(issue_match.group("age")) if issue_match else -1
    recovery_age = (
        int(recovery_matches[-1][1].group("age")) if recovery_matches else -1
    )
    matching_issues = [
        candidate
        for candidate in issues
        if str(candidate.get("body") or "").startswith(MARKER)
        and "pull_request" not in candidate
    ]
    issue_created = parse_time(str(issue["created_at"]))
    issue_closed = parse_time(str(issue["closed_at"]))
    stale_started = parse_time(str(stale_run["created_at"]))
    stale_finished = parse_time(str(stale_run["updated_at"]))
    recovery_started = parse_time(str(recovery_run["created_at"]))
    recovery_finished = parse_time(str(recovery_run["updated_at"]))
    recovery_comment = recovery_matches[-1][0] if recovery_matches else {}
    recovery_comment_at = (
        parse_time(str(recovery_comment["created_at"]))
        if recovery_comment
        else datetime.min.replace(tzinfo=timezone.utc)
    )

    summary = {
        "stale_run": {
            "id": int(stale_run["id"]),
            "conclusion": stale_run.get("conclusion"),
            "event": stale_run.get("event"),
            "url": stale_run.get("html_url"),
        },
        "recovery_run": {
            "id": int(recovery_run["id"]),
            "conclusion": recovery_run.get("conclusion"),
            "event": recovery_run.get("event"),
            "head_sha": recovery_run.get("head_sha"),
            "url": recovery_run.get("html_url"),
        },
        "incident": {
            "number": int(issue["number"]),
            "state": issue.get("state"),
            "url": issue.get("html_url"),
            "created_at": issue_created.isoformat(),
            "closed_at": issue_closed.isoformat(),
            "stale_heartbeat_age_seconds": stale_age,
            "recovery_heartbeat_age_seconds": recovery_age,
            "matching_incident_count": len(matching_issues),
        },
    }
    gates = {
        "stale_run_failed_closed": (
            stale_run.get("conclusion") == "failure"
            and stale_run.get("event") == "workflow_dispatch"
        ),
        "stale_age_exceeded_boundary": stale_age > stale_seconds,
        "single_durable_incident": (
            len(matching_issues) == 1
            and int(matching_issues[0]["number"]) == int(issue["number"])
        ),
        "incident_opened_by_stale_run": (
            stale_started <= issue_created <= stale_finished + timedelta(minutes=2)
        ),
        "issue_template_identity_free": bool(issue_match)
        and "http" not in str(issue.get("body") or "").lower(),
        "recovery_run_succeeded": (
            recovery_run.get("conclusion") == "success"
            and recovery_run.get("event") == "workflow_dispatch"
        ),
        "genuine_recovery_comment_exact": (
            len(recovery_matches) == 1
            and recovery_comment.get("user", {}).get("login") == "github-actions[bot]"
        ),
        "recovery_age_inside_boundary": 0 <= recovery_age < stale_seconds,
        "incident_closed_by_recovery_run": (
            issue.get("state") == "closed"
            and recovery_started <= issue_closed <= recovery_finished + timedelta(minutes=2)
            and recovery_started
            <= recovery_comment_at
            <= recovery_finished + timedelta(minutes=2)
        ),
    }
    return summary, gates


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--repository", default="crypticpy/propulse")
    parser.add_argument("--issue", type=int, default=10)
    parser.add_argument("--stale-run", type=int, default=29494058601)
    parser.add_argument("--recovery-run", type=int, default=29497729210)
    parser.add_argument("--input-dir", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    base = f"/repos/{args.repository}"
    issue, comments, issues, stale_run, recovery_run = load_inputs(
        args.input_dir,
        base=base,
        issue_number=args.issue,
        stale_run_id=args.stale_run,
        recovery_run_id=args.recovery_run,
    )
    summary, gates = evaluate_episode(
        issue=issue,
        comments=comments,
        issues=issues,
        stale_run=stale_run,
        recovery_run=recovery_run,
    )
    artifact = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "research_health_incident_delivery",
        "research_only": True,
        "locked_outcomes_read": False,
        "runtime": {
            "machine": runtime["machine"],
            "physical_cores_visible": runtime["physical_cores_visible"],
            "power_source": runtime["power_source"],
        },
        **summary,
        "gates": gates,
        "decision": "pass" if all(gates.values()) else "fail",
        "privacy": {
            "station_identity_read": False,
            "secret_values_written": False,
            "private_endpoint_written": False,
        },
    }
    atomic_write(args.output, artifact)
    print(json.dumps(artifact, indent=2, sort_keys=True))
    if artifact["decision"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
