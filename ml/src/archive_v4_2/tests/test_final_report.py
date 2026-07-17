from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from generate_final_report import INPUTS, build_artifact, build_evidence  # noqa: E402


class FinalReportTests(unittest.TestCase):
    def test_combined_report_preserves_locked_and_prospective_boundaries(self) -> None:
        if not INPUTS["archive_gate"].exists():
            self.skipTest("locked archive result has not been committed yet")
        values = {
            name: json.loads(path.read_text(encoding="utf-8"))
            for name, path in INPUTS.items()
        }
        evidence = build_evidence(values)
        artifact = build_artifact(
            ROOT / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/final_report/FINAL_REPORT_EVIDENCE.json",
            evidence,
        )
        self.assertFalse(evidence["prospective_read"])
        self.assertEqual(evidence["frozen_policy"]["candidate"], "A6_recent_recency_blend")
        self.assertGreaterEqual(
            evidence["datasets"]["summary"][0]["archive_months_won"], 3
        )
        self.assertGreaterEqual(len(artifact["manifest"]["charts"]), 8)
        self.assertGreaterEqual(len(artifact["manifest"]["tables"]), 4)
        self.assertIn(
            "limitations",
            [block["id"] for block in artifact["manifest"]["blocks"]],
        )


if __name__ == "__main__":
    unittest.main()
