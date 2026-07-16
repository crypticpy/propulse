from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from prepare_m5_full_outage_drill import (  # noqa: E402
    build_preflight_receipt,
)


NOW = datetime(2026, 7, 16, 16, 30, tzinfo=timezone.utc)
SESSION = "11111111-1111-1111-1111-111111111111"
RUNTIME = {
    "machine": "arm64",
    "physical_cores_visible": 18,
    "power_source": "AC Power",
}


def receipt(**values: object) -> dict:
    arguments = {
        "now": NOW,
        "health_generated_at": NOW - timedelta(seconds=30),
        "health_evidence_sha256": "a" * 64,
        "workflow_sha256": "b" * 64,
        "boot_session": SESSION,
        "boot_time": NOW - timedelta(days=1),
        "private_state_not_armed": True,
        "runtime": RUNTIME,
    }
    arguments.update(values)
    return build_preflight_receipt(**arguments)


class M5FullOutagePreflightTests(unittest.TestCase):
    def test_preflight_passes_without_arming_or_leaking_boot_id(self) -> None:
        result = receipt()

        self.assertEqual(result["decision"], "pass")
        self.assertFalse(result["outage_armed"])
        self.assertTrue(all(result["gates"].values()))
        self.assertNotIn(SESSION, json.dumps(result))

    def test_stale_health_or_wrong_machine_fails(self) -> None:
        stale = receipt(
            health_generated_at=NOW - timedelta(seconds=901),
        )
        self.assertEqual(stale["decision"], "fail")

        wrong_machine = receipt(
            runtime={**RUNTIME, "machine": "x86_64"},
        )
        self.assertEqual(wrong_machine["decision"], "fail")

        armed = receipt(private_state_not_armed=False)
        self.assertEqual(armed["decision"], "fail")

        bad_checksum = receipt(workflow_sha256="not-a-checksum")
        self.assertEqual(bad_checksum["decision"], "fail")


if __name__ == "__main__":
    unittest.main()
