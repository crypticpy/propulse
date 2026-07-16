from __future__ import annotations

import hashlib
import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from manage_phase6_runtime_activation import build_activation_document  # noqa: E402
from validate_phase6_release_readiness import runtime_eligibility_document  # noqa: E402


NOW = datetime(2026, 10, 2, tzinfo=timezone.utc)
def eligibility(source: dict[str, object]) -> dict[str, object]:
    content = json.dumps(source).encode()
    return runtime_eligibility_document(
        source,
        source_readiness_sha256=hashlib.sha256(content).hexdigest(),
    )


def readiness(core: bool = False, beta: bool = False) -> dict[str, object]:
    status = "release_candidate" if core else "shadow_only"
    return {
        "schema_version": 1,
        "scope": "phase6_mode_specific_release_readiness",
        "valid_fail_closed_decision": True,
        "locked_prospective_outcomes_read": False,
        "beta_collection": {
            "status": "eligible" if beta else "disabled",
        },
        "mode_decisions": {
            "system_health_view": {
                "status": "eligible_hidden_by_product_flag" if beta else "hidden",
            },
            "core_nowcast": {"status": status},
            "stationcast_deterministic": {"status": "shadow_only"},
            "stationcast_learned": {"status": "withheld"},
            "futurecast": {"status": "withheld"},
            "six_meter": {"status": "withheld"},
        },
    }


class Phase6RuntimeActivationTests(unittest.TestCase):
    def test_explicit_eligible_mode_can_be_approved(self) -> None:
        source = readiness(core=True)
        content = json.dumps(source).encode()
        result = build_activation_document(
            content,
            eligibility(source),
            ["core_nowcast"],
            activated_at=NOW,
        )

        self.assertEqual(result["activation_state"], "approved")
        self.assertEqual(result["approved_modes"], ["core_nowcast"])
        self.assertTrue(result["product_activation_recorded"])
        self.assertEqual(result["activated_at"], NOW.isoformat())

    def test_ineligible_mode_cannot_be_approved(self) -> None:
        source = readiness()
        with self.assertRaisesRegex(RuntimeError, "not evidence-eligible"):
            build_activation_document(
                json.dumps(source).encode(),
                eligibility(source),
                ["core_nowcast"],
                activated_at=NOW,
            )

    def test_stale_eligibility_cannot_be_used(self) -> None:
        source = readiness(core=True)
        stale = eligibility(source)
        stale["modes"]["core_nowcast"] = False
        with self.assertRaisesRegex(RuntimeError, "stale"):
            build_activation_document(
                json.dumps(source).encode(),
                stale,
                [],
                activated_at=NOW,
            )

    def test_disable_all_records_no_activation(self) -> None:
        source = readiness()
        result = build_activation_document(
            json.dumps(source).encode(),
            eligibility(source),
            [],
            activated_at=NOW,
        )
        self.assertEqual(result["activation_state"], "disabled")
        self.assertFalse(result["product_activation_recorded"])
        self.assertIsNone(result["activated_at"])


if __name__ == "__main__":
    unittest.main()
