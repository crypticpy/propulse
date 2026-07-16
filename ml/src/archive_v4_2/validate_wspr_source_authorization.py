#!/usr/bin/env python3
"""Validate written WSPR.live permission without publishing correspondence."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
PROPOSAL = ROOT / "ml/WSPR-LIVE-PERMISSION-EMAIL.txt"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/source_authorization.json"
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
TOP_LEVEL_FIELDS = {
    "schema_version",
    "scope",
    "source",
    "public_terms",
    "request",
    "response",
    "authorized_roles",
    "conditions",
    "private_correspondence_in_record",
}
SOURCE_FIELDS = {"id", "operator", "service_url", "terms_url"}
PUBLIC_TERMS_FIELDS = {"url", "checked_at", "snapshot_sha256"}
REQUEST_FIELDS = {"sent_at", "proposal_sha256"}
RESPONSE_FIELDS = {
    "received_at",
    "decision",
    "private_message_sha256",
    "authorizer_role",
    "expires_at",
}
CONDITION_FIELDS = {
    "nonprofit_donation_supported_use",
    "derived_core_results_free_of_charge",
    "profit_oriented_use",
    "raw_rows_redistributed",
    "maximum_private_raw_retention_hours",
    "maximum_queries_per_completed_utc_hour",
    "query_window_hours",
    "all_ten_hf_bands_single_query",
    "identity_free_outputs",
    "attribution",
    "fallback_profile",
    "written_conditions_implemented",
}
REQUIRED_ROLES = {"internal_research", "subscriber_recent_path_features"}
REQUIRED_ATTRIBUTION = {
    "WSPR.live",
    "WSPRnet",
    "contributing amateur stations",
}
PUBLIC_TERMS_MARKERS = (
    "welcome to wspr live",
    "results are accessable free of charge for everyone",
    "not allowed to use this service for any commercial or profit oriented use cases",
    "db1.wspr.live",
    "wsprnet.org",
)


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("authorization timestamps must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def owner_only(path: Path) -> bool:
    return path.is_file() and path.stat().st_mode & 0o077 == 0


def require_outside_repository(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError:
        return resolved
    raise RuntimeError(f"{label} must remain outside the repository")


def public_terms_content_valid(path: Path) -> bool:
    try:
        value = path.read_text(encoding="utf-8").lower()
    except (OSError, UnicodeDecodeError):
        return False
    value = re.sub(r"\s+", " ", value)
    return all(marker in value for marker in PUBLIC_TERMS_MARKERS)


def evaluate_authorization(
    record: dict[str, Any],
    *,
    now: datetime,
    proposal_sha256: str,
    public_terms_sha256: str,
    public_terms_content_exact: bool,
    input_sha256: str,
    runtime: dict[str, Any],
) -> dict[str, Any]:
    source = record.get("source")
    public_terms = record.get("public_terms")
    request = record.get("request")
    response = record.get("response")
    conditions = record.get("conditions")
    roles = record.get("authorized_roles")
    structural = bool(
        set(record) == TOP_LEVEL_FIELDS
        and record.get("schema_version") == 1
        and record.get("scope") == "wspr_live_written_permission"
        and isinstance(source, dict)
        and set(source) == SOURCE_FIELDS
        and isinstance(public_terms, dict)
        and set(public_terms) == PUBLIC_TERMS_FIELDS
        and isinstance(request, dict)
        and set(request) == REQUEST_FIELDS
        and isinstance(response, dict)
        and set(response) == RESPONSE_FIELDS
        and isinstance(conditions, dict)
        and set(conditions) == CONDITION_FIELDS
        and isinstance(roles, list)
        and all(isinstance(role, str) for role in roles)
        and len(roles) == len(set(roles))
    )
    sent_at: datetime | None = None
    received_at: datetime | None = None
    expires_at: datetime | None = None
    terms_checked_at: datetime | None = None
    try:
        if structural:
            sent_at = parse_utc(str(request["sent_at"]))
            received_at = parse_utc(str(response["received_at"]))
            terms_checked_at = parse_utc(str(public_terms["checked_at"]))
            if response["expires_at"] is not None:
                expires_at = parse_utc(str(response["expires_at"]))
    except (TypeError, ValueError):
        structural = False

    source_exact = bool(
        structural
        and source
        == {
            "id": "wspr_live",
            "operator": "WSPR.live volunteer service",
            "service_url": "https://wspr.live/",
            "terms_url": "https://wspr.live/",
        }
    )
    written_approval = bool(
        structural
        and response["decision"] == "approved"
        and response["authorizer_role"] == "service_operator"
        and isinstance(response["private_message_sha256"], str)
        and SHA256_RE.fullmatch(response["private_message_sha256"])
        and sent_at is not None
        and received_at is not None
        and sent_at <= received_at <= now
        and (expires_at is None or expires_at > now)
    )
    public_terms_bound = bool(
        structural
        and public_terms["url"] == "https://wspr.live/"
        and isinstance(public_terms["snapshot_sha256"], str)
        and public_terms["snapshot_sha256"] == public_terms_sha256
        and SHA256_RE.fullmatch(public_terms["snapshot_sha256"])
        and terms_checked_at is not None
        and received_at is not None
        and terms_checked_at <= now
        and abs(received_at - terms_checked_at) <= timedelta(days=30)
    )
    bounded_integer_conditions = bool(
        structural
        and type(conditions["maximum_private_raw_retention_hours"]) is int
        and type(conditions["maximum_queries_per_completed_utc_hour"]) is int
        and type(conditions["query_window_hours"]) is int
    )
    conditions_exact = bool(
        bounded_integer_conditions
        and conditions["nonprofit_donation_supported_use"] is True
        and conditions["derived_core_results_free_of_charge"] is True
        and conditions["profit_oriented_use"] is False
        and conditions["raw_rows_redistributed"] is False
        and conditions["maximum_private_raw_retention_hours"] <= 30
        and conditions["maximum_private_raw_retention_hours"] >= 0
        and conditions["maximum_queries_per_completed_utc_hour"] == 1
        and conditions["query_window_hours"] == 1
        and conditions["all_ten_hf_bands_single_query"] is True
        and conditions["identity_free_outputs"] is True
        and isinstance(conditions["attribution"], list)
        and all(
            isinstance(value, str) for value in conditions["attribution"]
        )
        and len(conditions["attribution"])
        == len(set(conditions["attribution"]))
        and set(conditions["attribution"]) == REQUIRED_ATTRIBUTION
        and conditions["fallback_profile"] == "physics_weather"
        and conditions["written_conditions_implemented"] is True
    )
    gates = {
        "private_input_schema_exact": structural,
        "source_identity_and_urls_exact": source_exact,
        "public_terms_snapshot_bound_to_approval": public_terms_bound,
        "public_terms_snapshot_content_exact": public_terms_content_exact,
        "proposal_checksum_matches_sent_request": bool(
            structural
            and request["proposal_sha256"] == proposal_sha256
            and SHA256_RE.fullmatch(str(request["proposal_sha256"]))
        ),
        "written_operator_approval_current": written_approval,
        "required_roles_explicitly_authorized": bool(
            structural and set(roles) == REQUIRED_ROLES
        ),
        "published_terms_and_operating_conditions_enforced": conditions_exact,
        "private_correspondence_absent": bool(
            structural and record["private_correspondence_in_record"] is False
        ),
        "authorization_input_checksum_recorded": bool(
            SHA256_RE.fullmatch(input_sha256)
        ),
        "native_m5_validation": runtime.get("machine") == "arm64",
        "locked_outcomes_unread": True,
    }
    passed = all(gates.values())
    return {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "scope": "approved_subscriber_recent_path_source",
        "decision": "pass" if passed else "fail",
        "subscriber_facing_authorized": passed,
        "authorization_basis": "written_permission_from_source_operator",
        "source": {
            "id": "wspr_live",
            "service_url": "https://wspr.live/",
            "terms_url": "https://wspr.live/",
        },
        "public_terms": {
            "content_contract": "wspr_live_terms_v1",
            "checked_at": (
                terms_checked_at.isoformat() if terms_checked_at is not None else None
            ),
            "snapshot_sha256": (
                public_terms_sha256
                if SHA256_RE.fullmatch(public_terms_sha256)
                else None
            ),
        },
        "authorized_roles": sorted(REQUIRED_ROLES) if passed else [],
        "evidence": {
            "proposal_sha256": proposal_sha256,
            "authorization_input_sha256": input_sha256,
            "private_message_sha256": (
                response.get("private_message_sha256")
                if isinstance(response, dict)
                and SHA256_RE.fullmatch(
                    str(response.get("private_message_sha256", ""))
                )
                else None
            ),
            "private_correspondence_recorded": False,
        },
        "gates": gates,
        "runtime": {
            "machine": runtime.get("machine"),
            "physical_cores_visible": runtime.get("physical_cores_visible"),
        },
        "privacy": {
            "locked_outcomes_read": False,
            "private_correspondence_written": False,
            "station_identity_written": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--authorization-input", type=Path, required=True)
    parser.add_argument("--public-terms-snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    source = require_outside_repository(
        args.authorization_input,
        "authorization input",
    )
    if not owner_only(source):
        raise RuntimeError("authorization input must be an owner-only file")
    raw = source.read_bytes()
    record = json.loads(raw)
    if not isinstance(record, dict):
        raise RuntimeError("authorization input must be a JSON object")
    public_terms_snapshot = require_outside_repository(
        args.public_terms_snapshot,
        "public terms snapshot",
    )
    if not public_terms_snapshot.is_file():
        raise RuntimeError("public terms snapshot must be a regular file")
    result = evaluate_authorization(
        record,
        now=datetime.now(timezone.utc),
        proposal_sha256=sha256(PROPOSAL),
        public_terms_sha256=sha256(public_terms_snapshot),
        public_terms_content_exact=public_terms_content_valid(
            public_terms_snapshot
        ),
        input_sha256=hashlib.sha256(raw).hexdigest(),
        runtime=runtime,
    )
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2, sort_keys=True))
    if result["decision"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
