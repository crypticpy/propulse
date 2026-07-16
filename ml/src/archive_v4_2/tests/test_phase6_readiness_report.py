from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from generate_phase6_readiness_report import (  # noqa: E402
    INPUTS,
    build_artifact,
    build_evidence,
)


class Phase6ReadinessReportTests(unittest.TestCase):
    def test_current_report_is_answer_first_visual_and_fail_closed(self) -> None:
        values = {
            name: __import__("json").loads(path.read_text(encoding="utf-8"))
            for name, path in INPUTS.items()
        }
        evidence = build_evidence(values)
        artifact = build_artifact(
            ROOT
            / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
            / "live_feature_pipeline/phase6_report/PHASE6_REPORT_EVIDENCE.json",
            evidence,
        )

        self.assertEqual(evidence["decision"], "withheld")
        self.assertFalse(evidence["locked_prospective_outcomes_read"])
        self.assertEqual(artifact["surface"], "report")
        self.assertEqual(artifact["snapshot"]["status"], "ready")
        self.assertEqual(len(artifact["manifest"]["charts"]), 5)
        self.assertEqual(len(artifact["manifest"]["tables"]), 4)
        block_ids = [block["id"] for block in artifact["manifest"]["blocks"]]
        self.assertEqual(block_ids[:3], ["title", "technical_summary", "metrics"])
        for required in (
            "performance_chart",
            "gate_chart",
            "collection_chart",
            "beta_dry_run_chart",
            "beta_gate_table_block",
            "mode_chart",
            "limitations",
            "next_table",
            "further_questions",
        ):
            self.assertIn(required, block_ids)
        summary = evidence["datasets"]["summary"][0]
        self.assertEqual(summary["beta_dry_run_gates"], 16)
        self.assertFalse(summary["beta_dry_run_release_approved"])
        self.assertTrue(
            all(row["passed"] for row in evidence["datasets"]["beta_gate_rows"])
        )
        self.assertTrue(any(
            "stop-event producer" in row["action"]
            for row in evidence["datasets"]["next_steps"]
        ))

    def test_report_keeps_mode_decisions_separate(self) -> None:
        values = {
            name: __import__("json").loads(path.read_text(encoding="utf-8"))
            for name, path in INPUTS.items()
        }
        evidence = build_evidence(values)
        rows = {row["mode"]: row for row in evidence["datasets"]["mode_rows"]}

        self.assertEqual(rows["core nowcast"]["status"], "shadow_only")
        self.assertEqual(rows["stationcast deterministic"]["status"], "shadow_only")
        self.assertEqual(rows["futurecast"]["status"], "withheld")
        self.assertEqual(rows["six meter"]["status"], "withheld")
        self.assertEqual(evidence["datasets"]["summary"][0]["releaseable_modes"], 0)


if __name__ == "__main__":
    unittest.main()
