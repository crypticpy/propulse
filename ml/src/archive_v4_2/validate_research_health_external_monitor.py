#!/usr/bin/env python3
"""Record and validate the identity-free off-M5 monitor proof on the M5."""

from __future__ import annotations

import argparse
import json
import re
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write
from validate_research_health_endpoint import keys_are_identity_free


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
WORKFLOW = ROOT / ".github/workflows/research-health-monitor.yml"
RESULT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
ENDPOINT_EVIDENCE = RESULT / "research_health_endpoint_validation.json"
DEFAULT_OUTPUT = RESULT / "research_health_external_monitor_validation.json"
STALE_SECONDS = 7200
RUN_URL_RE = re.compile(
    r"^/crypticpy/propulse/actions/runs/(?P<run_id>[1-9][0-9]*)$"
)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def parse_bool(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise argparse.ArgumentTypeError("expected true or false")


def build_evidence(
    *,
    runtime: dict[str, Any],
    workflow: str,
    endpoint_evidence: dict[str, Any],
    run_id: int,
    run_url: str,
    head_sha: str,
    conclusion: str,
    event: str,
    head_branch: str,
    evaluated: bool,
    heartbeat_stale: bool,
    state_changed: bool,
    heartbeat_age_seconds: int,
    delivery_configured: bool,
    delivery_failed: int,
    delivery_exhausted: int,
) -> dict[str, Any]:
    parsed = urllib.parse.urlsplit(run_url)
    run_match = RUN_URL_RE.fullmatch(parsed.path)
    run_url_exact = bool(
        parsed.scheme == "https"
        and parsed.hostname == "github.com"
        and parsed.port in (None, 443)
        and parsed.username is None
        and parsed.password is None
        and not parsed.query
        and not parsed.fragment
        and run_match
        and int(run_match.group("run_id")) == run_id
    )
    public_view_disabled = bool(
        endpoint_evidence.get("decision") == "pass"
        and endpoint_evidence.get("endpoint", {}).get("coarse_view_status") == 404
    )
    scheduled = (
        'cron: "17,47 * * * *"' in workflow
        and "workflow_dispatch:" in workflow
    )
    temporary_push_removed = "\n  push:" not in workflow
    response = {
        "evaluated": evaluated,
        "heartbeat_stale": heartbeat_stale,
        "state_changed": state_changed,
        "heartbeat_age_seconds": heartbeat_age_seconds,
        "alert_delivery": {
            "configured": delivery_configured,
            "failed": delivery_failed,
            "exhausted": delivery_exhausted,
        },
    }
    evidence: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "off_m5_protected_preview_fresh_heartbeat_validation",
        "research_only": True,
        "locked_outcomes_read": False,
        "public_view_enabled": False,
        "external_runner": "github_actions",
        "workflow_run": {
            "id": run_id,
            "url": run_url,
            "head_sha": head_sha,
            "conclusion": conclusion,
            "event": event,
            "head_branch": head_branch,
        },
        "response": response,
        "runtime": {
            "validation_machine": runtime["machine"],
            "physical_cores_visible": runtime["physical_cores_visible"],
        },
    }
    gates = {
        "github_workflow_concluded_success": conclusion == "success",
        "github_run_url_exact": run_url_exact,
        "immutable_head_sha_recorded": bool(SHA_RE.fullmatch(head_sha)),
        "default_branch_invocation": (
            head_branch == "main" and event in {"schedule", "workflow_dispatch"}
        ),
        "fresh_heartbeat_evaluated": (
            evaluated and 0 <= heartbeat_age_seconds < STALE_SECONDS
        ),
        "heartbeat_not_stale": response["heartbeat_stale"] is False,
        "no_unexpected_state_transition": response["state_changed"] is False,
        "no_failed_or_exhausted_delivery": (
            delivery_failed == 0 and delivery_exhausted == 0
        ),
        "independent_schedule_configured": scheduled,
        "release_workflow_push_trigger_removed": temporary_push_removed,
        "public_view_remains_disabled": public_view_disabled,
        "native_m5_evidence_validation": runtime["machine"] == "arm64",
        "locked_outcomes_unread": True,
    }
    evidence["gates"] = gates
    gates["identity_free_evidence"] = keys_are_identity_free(evidence)
    evidence["decision"] = "pass" if all(gates.values()) else "fail"
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--run-id", type=int, required=True)
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--head-sha", required=True)
    parser.add_argument("--conclusion", required=True)
    parser.add_argument(
        "--event", choices=("schedule", "workflow_dispatch"), required=True
    )
    parser.add_argument("--head-branch", required=True)
    parser.add_argument("--evaluated", type=parse_bool, required=True)
    parser.add_argument("--heartbeat-stale", type=parse_bool, required=True)
    parser.add_argument("--state-changed", type=parse_bool, required=True)
    parser.add_argument("--heartbeat-age-seconds", type=int, required=True)
    parser.add_argument("--delivery-configured", type=parse_bool, required=True)
    parser.add_argument("--delivery-failed", type=int, default=0)
    parser.add_argument("--delivery-exhausted", type=int, default=0)
    parser.add_argument("--workflow", type=Path, default=WORKFLOW)
    parser.add_argument("--endpoint-evidence", type=Path, default=ENDPOINT_EVIDENCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    evidence = build_evidence(
        runtime=runtime,
        workflow=args.workflow.read_text(encoding="utf-8"),
        endpoint_evidence=json.loads(
            args.endpoint_evidence.read_text(encoding="utf-8")
        ),
        run_id=args.run_id,
        run_url=args.run_url,
        head_sha=args.head_sha,
        conclusion=args.conclusion,
        event=args.event,
        head_branch=args.head_branch,
        evaluated=args.evaluated,
        heartbeat_stale=args.heartbeat_stale,
        state_changed=args.state_changed,
        heartbeat_age_seconds=args.heartbeat_age_seconds,
        delivery_configured=args.delivery_configured,
        delivery_failed=args.delivery_failed,
        delivery_exhausted=args.delivery_exhausted,
    )
    atomic_write(args.output, evidence)
    print(json.dumps(evidence, indent=2))
    if evidence["decision"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
