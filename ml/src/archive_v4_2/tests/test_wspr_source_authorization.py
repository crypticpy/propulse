from __future__ import annotations

import copy
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from validate_wspr_source_authorization import (  # noqa: E402
    PUBLIC_TERMS_MARKERS,
    ROOT,
    evaluate_authorization,
    public_terms_content_valid,
    require_outside_repository,
)


NOW = datetime(2026, 7, 17, tzinfo=timezone.utc)
SHA = "a" * 64
RUNTIME = {"machine": "arm64", "physical_cores_visible": 18}


def authorization() -> dict:
    return {
        "schema_version": 1,
        "scope": "wspr_live_written_permission",
        "source": {
            "id": "wspr_live",
            "operator": "WSPR.live volunteer service",
            "service_url": "https://wspr.live/",
            "terms_url": "https://wspr.live/",
        },
        "public_terms": {
            "url": "https://wspr.live/",
            "checked_at": "2026-07-16T15:00:00Z",
            "snapshot_sha256": SHA,
        },
        "request": {
            "sent_at": "2026-07-16T16:00:00Z",
            "proposal_sha256": SHA,
        },
        "response": {
            "received_at": "2026-07-16T18:00:00Z",
            "decision": "approved",
            "private_message_sha256": "b" * 64,
            "authorizer_role": "service_operator",
            "expires_at": None,
        },
        "authorized_roles": [
            "internal_research",
            "subscriber_recent_path_features",
        ],
        "conditions": {
            "nonprofit_donation_supported_use": True,
            "derived_core_results_free_of_charge": True,
            "profit_oriented_use": False,
            "raw_rows_redistributed": False,
            "maximum_private_raw_retention_hours": 30,
            "maximum_queries_per_completed_utc_hour": 1,
            "query_window_hours": 1,
            "all_ten_hf_bands_single_query": True,
            "identity_free_outputs": True,
            "attribution": [
                "WSPR.live",
                "WSPRnet",
                "contributing amateur stations",
            ],
            "fallback_profile": "physics_weather",
            "written_conditions_implemented": True,
        },
        "private_correspondence_in_record": False,
    }


def evaluate(value: dict) -> dict:
    return evaluate_authorization(
        value,
        now=NOW,
        proposal_sha256=SHA,
        public_terms_sha256=SHA,
        public_terms_content_exact=True,
        input_sha256="c" * 64,
        runtime=RUNTIME,
    )


class WsprSourceAuthorizationTests(unittest.TestCase):
    def test_private_inputs_cannot_be_placed_in_repository(self) -> None:
        with self.assertRaises(RuntimeError):
            require_outside_repository(ROOT / "private.json", "private input")
        self.assertEqual(
            require_outside_repository(
                Path("/tmp/propulse-private.json"),
                "private input",
            ),
            Path("/tmp/propulse-private.json").resolve(),
        )

    def test_public_terms_contract_normalizes_html_whitespace(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory) / "terms.html"
            snapshot.write_text(
                "<html>" + "\n".join(
                    marker.replace(" ", "\n", 1)
                    for marker in PUBLIC_TERMS_MARKERS
                ) + "</html>",
                encoding="utf-8",
            )
            self.assertTrue(public_terms_content_valid(snapshot))

            snapshot.write_text("<html>unrelated page</html>", encoding="utf-8")
            self.assertFalse(public_terms_content_valid(snapshot))

    def test_exact_written_permission_passes_without_correspondence(self) -> None:
        result = evaluate(authorization())

        self.assertEqual(result["decision"], "pass")
        self.assertTrue(result["subscriber_facing_authorized"])
        self.assertTrue(all(result["gates"].values()))
        self.assertNotIn("@", str(result))

    def test_public_terms_or_unimplemented_conditions_cannot_pass(self) -> None:
        value = authorization()
        value["response"]["authorizer_role"] = "public_terms_only"
        self.assertEqual(evaluate(value)["decision"], "fail")

        value = authorization()
        value["conditions"]["derived_core_results_free_of_charge"] = False
        self.assertEqual(evaluate(value)["decision"], "fail")

    def test_proposal_drift_expiry_and_extra_fields_fail_closed(self) -> None:
        value = authorization()
        value["request"]["proposal_sha256"] = "d" * 64
        self.assertEqual(evaluate(value)["decision"], "fail")

        value = authorization()
        value["response"]["expires_at"] = "2026-07-16T19:00:00Z"
        self.assertEqual(evaluate(value)["decision"], "fail")

        value = copy.deepcopy(authorization())
        value["private_message_body"] = "must never be accepted"
        self.assertEqual(evaluate(value)["decision"], "fail")

    def test_schema_scope_terms_snapshot_and_numeric_types_fail_closed(self) -> None:
        value = authorization()
        value["schema_version"] = 2
        self.assertEqual(evaluate(value)["decision"], "fail")

        value = authorization()
        value["scope"] = "internal_research_only"
        self.assertEqual(evaluate(value)["decision"], "fail")

        value = authorization()
        value["public_terms"]["snapshot_sha256"] = "d" * 64
        self.assertEqual(evaluate(value)["decision"], "fail")

        value = authorization()
        value["conditions"]["maximum_private_raw_retention_hours"] = "30"
        self.assertEqual(evaluate(value)["decision"], "fail")

        value = authorization()
        value["conditions"]["maximum_queries_per_completed_utc_hour"] = True
        self.assertEqual(evaluate(value)["decision"], "fail")

        value = authorization()
        result = evaluate_authorization(
            value,
            now=NOW,
            proposal_sha256=SHA,
            public_terms_sha256=SHA,
            public_terms_content_exact=False,
            input_sha256="c" * 64,
            runtime=RUNTIME,
        )
        self.assertEqual(result["decision"], "fail")


if __name__ == "__main__":
    unittest.main()
