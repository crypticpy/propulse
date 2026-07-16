from __future__ import annotations

import argparse
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from validate_research_health_external_monitor import (  # noqa: E402
    build_evidence,
    parse_bool,
)


WORKFLOW = """name: Research health monitor

on:
  schedule:
    - cron: "17,47 * * * *"
  workflow_dispatch:
"""
RUNTIME = {"machine": "arm64", "physical_cores_visible": 16}
ENDPOINT = {
    "decision": "pass",
    "endpoint": {"coarse_view_status": 404},
}


def evidence(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "runtime": RUNTIME,
        "workflow": WORKFLOW,
        "endpoint_evidence": ENDPOINT,
        "run_id": 29480631813,
        "run_url": (
            "https://github.com/crypticpy/propulse/actions/runs/29480631813"
        ),
        "head_sha": "f60f4dd397d712d531cbe22f3175efc9263fc000",
        "conclusion": "success",
        "evaluated": True,
        "heartbeat_stale": False,
        "state_changed": False,
        "heartbeat_age_seconds": 490,
        "delivery_configured": False,
        "delivery_failed": 0,
        "delivery_exhausted": 0,
    }
    values.update(overrides)
    return build_evidence(**values)  # type: ignore[arg-type]


class ResearchHealthExternalMonitorTests(unittest.TestCase):
    def test_successful_fresh_identity_free_proof_passes(self) -> None:
        result = evidence()
        self.assertEqual(result["decision"], "pass")
        self.assertTrue(all(result["gates"].values()))
        self.assertFalse(result["response"]["alert_delivery"]["configured"])

    def test_stale_or_failed_delivery_fails(self) -> None:
        self.assertEqual(
            evidence(heartbeat_age_seconds=7200)["decision"],
            "fail",
        )
        self.assertEqual(
            evidence(delivery_configured=True, delivery_failed=1)["decision"],
            "fail",
        )
        self.assertEqual(evidence(evaluated=False)["decision"], "fail")

    def test_redirected_or_mismatched_run_url_fails(self) -> None:
        self.assertEqual(
            evidence(
                run_url=(
                    "https://github.com/crypticpy/propulse/actions/runs/1?next=bad"
                )
            )["decision"],
            "fail",
        )

    def test_temporary_push_trigger_fails_release_gate(self) -> None:
        workflow = WORKFLOW.replace("on:\n", "on:\n  push:\n")
        self.assertEqual(evidence(workflow=workflow)["decision"], "fail")

    def test_boolean_cli_values_are_explicit(self) -> None:
        self.assertTrue(parse_bool("true"))
        self.assertFalse(parse_bool("FALSE"))
        with self.assertRaises(argparse.ArgumentTypeError):
            parse_bool("0")


if __name__ == "__main__":
    unittest.main()
