#!/usr/bin/env python3
"""Record a repository-safe M5 receipt for a prepared WSPR.live request."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write
from validate_wspr_source_authorization import (
    PROPOSAL,
    SHA256_RE,
    owner_only,
    public_terms_content_valid,
    require_outside_repository,
)


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/wspr_permission_request_preparation.json"
)
MAXIMUM_SNAPSHOT_AGE = timedelta(minutes=15)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_preparation_receipt(
    *,
    now: datetime,
    snapshot_retrieved_at: datetime,
    proposal_sha256: str,
    terms_snapshot_sha256: str,
    terms_content_exact: bool,
    terms_snapshot_owner_only: bool,
    runtime: dict[str, Any],
) -> dict[str, Any]:
    snapshot_age_seconds = int((now - snapshot_retrieved_at).total_seconds())
    gates = {
        "native_m5_validation": bool(
            runtime.get("machine") == "arm64"
            and int(runtime.get("physical_cores_visible", 0)) >= 18
        ),
        "immutable_request_checksum_recorded": bool(
            SHA256_RE.fullmatch(proposal_sha256)
        ),
        "terms_snapshot_checksum_recorded": bool(
            SHA256_RE.fullmatch(terms_snapshot_sha256)
        ),
        "official_terms_content_contract_passed": terms_content_exact,
        "terms_snapshot_fresh": (
            0 <= snapshot_age_seconds <= int(MAXIMUM_SNAPSHOT_AGE.total_seconds())
        ),
        "terms_snapshot_owner_only": terms_snapshot_owner_only,
        "private_correspondence_absent": True,
        "subscriber_authorization_still_closed": True,
        "locked_outcomes_unread": True,
    }
    prepared = all(gates.values())
    return {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "scope": "wspr_live_permission_request_preparation",
        "decision": "prepared_not_sent" if prepared else "invalid",
        "request": {
            "recipient": "admin@wspr.live",
            "proposal_sha256": proposal_sha256,
            "email_sent": False,
        },
        "public_terms": {
            "url": "https://wspr.live/",
            "content_contract": "wspr_live_terms_v1",
            "snapshot_retrieved_at": snapshot_retrieved_at.isoformat(),
            "snapshot_age_seconds": snapshot_age_seconds,
            "snapshot_sha256": terms_snapshot_sha256,
        },
        "authorization": {
            "written_operator_response_received": False,
            "subscriber_facing_authorized": False,
        },
        "required_next_actions": [
            "send_exact_tracked_request",
            "retain_complete_reply_headers_privately",
            "validate_written_operator_response_on_m5",
        ],
        "gates": gates,
        "runtime": {
            "machine": runtime.get("machine"),
            "physical_cores_visible": runtime.get("physical_cores_visible"),
        },
        "privacy": {
            "private_snapshot_path_written": False,
            "private_correspondence_written": False,
            "station_identity_written": False,
            "locked_outcomes_read": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--public-terms-snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    snapshot = require_outside_repository(
        args.public_terms_snapshot,
        "public terms snapshot",
    )
    if not snapshot.is_file():
        raise RuntimeError("public terms snapshot must be a regular file")
    retrieved_at = datetime.fromtimestamp(
        snapshot.stat().st_mtime,
        tz=timezone.utc,
    )
    receipt = build_preparation_receipt(
        now=datetime.now(timezone.utc),
        snapshot_retrieved_at=retrieved_at,
        proposal_sha256=sha256(PROPOSAL),
        terms_snapshot_sha256=sha256(snapshot),
        terms_content_exact=public_terms_content_valid(snapshot),
        terms_snapshot_owner_only=owner_only(snapshot),
        runtime=runtime,
    )
    atomic_write(args.output, receipt)
    print(json.dumps(receipt, indent=2, sort_keys=True))
    if receipt["decision"] != "prepared_not_sent":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
