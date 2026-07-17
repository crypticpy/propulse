from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from prepare_wspr_permission_request import (  # noqa: E402
    build_preparation_receipt,
)


NOW = datetime(2026, 7, 16, 16, 18, tzinfo=timezone.utc)
RUNTIME = {"machine": "arm64", "physical_cores_visible": 18}


def receipt(**values: object) -> dict:
    arguments = {
        "now": NOW,
        "snapshot_retrieved_at": NOW - timedelta(seconds=5),
        "proposal_sha256": "a" * 64,
        "terms_snapshot_sha256": "b" * 64,
        "terms_content_exact": True,
        "terms_snapshot_owner_only": True,
        "runtime": RUNTIME,
    }
    arguments.update(values)
    return build_preparation_receipt(**arguments)


class WsprPermissionRequestPreparationTests(unittest.TestCase):
    def test_fresh_exact_request_is_prepared_but_never_authorized(self) -> None:
        result = receipt()

        self.assertEqual(result["decision"], "prepared_not_sent")
        self.assertTrue(all(result["gates"].values()))
        self.assertFalse(result["request"]["email_sent"])
        self.assertFalse(
            result["authorization"]["subscriber_facing_authorized"]
        )
        self.assertNotIn("/Users/", json.dumps(result))

    def test_stale_terms_or_non_m5_runtime_is_invalid(self) -> None:
        stale = receipt(
            snapshot_retrieved_at=NOW - timedelta(minutes=16),
        )
        self.assertEqual(stale["decision"], "invalid")

        wrong_machine = receipt(
            runtime={"machine": "x86_64", "physical_cores_visible": 18},
        )
        self.assertEqual(wrong_machine["decision"], "invalid")

    def test_terms_content_and_owner_only_storage_are_mandatory(self) -> None:
        self.assertEqual(
            receipt(terms_content_exact=False)["decision"],
            "invalid",
        )
        self.assertEqual(
            receipt(terms_snapshot_owner_only=False)["decision"],
            "invalid",
        )
        self.assertEqual(
            receipt(proposal_sha256="not-a-checksum")["decision"],
            "invalid",
        )


if __name__ == "__main__":
    unittest.main()
