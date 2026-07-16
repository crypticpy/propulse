from __future__ import annotations

import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from generate_futurecast_report import build_artifact  # noqa: E402
from run_futurecast_synthetic_report import portable_builder_receipt  # noqa: E402


class FutureCastReportTests(unittest.TestCase):
    def test_delivery_receipt_uses_repository_relative_html_path(self) -> None:
        html = (
            Path(__file__).resolve().parents[3]
            / "results/propagation_v4/futurecast_v1_synthetic_e2e/REPORT.html"
        )
        receipt = portable_builder_receipt(
            {"ok": True, "html": "/Users/private/repository/REPORT.html"},
            html,
        )
        self.assertEqual(
            receipt["html"],
            "ml/results/propagation_v4/futurecast_v1_synthetic_e2e/REPORT.html",
        )

    def test_artifact_has_technical_report_structure_and_fixture_scope(self) -> None:
        evidence = {
            "generated_at": "2026-07-16T00:00:00+00:00",
            "datasets": {
                "summary": [{
                    "issued_days": 90,
                    "example_partitions": 360,
                    "example_rows": 14400,
                    "example_opportunities": 1440000,
                    "models_frozen": 8,
                    "xgboost_threads": 18,
                    "combined_peak_rss_gib": 0.6,
                    "p533_sample_rows": 4800,
                    "p533_unique_circuits": 4000,
                    "p533_workers": 18,
                    "p533_wall_seconds": 24.0,
                    "gates_passed": 16,
                    "gates_total": 40,
                    "released_horizons": 0,
                    "total_horizons": 4,
                    "decision": "withheld",
                }],
                "horizon_metrics": [],
                "full_gate_brier": [],
                "p533_brier": [],
                "calibration": [],
                "model_fits": [],
                "gate_matrix": [],
            },
        }
        evidence_path = (
            Path(__file__).resolve().parents[3]
            / "results/propagation_v4/futurecast_v1_synthetic_e2e"
            / "FUTURECAST_SYNTHETIC_E2E_EVIDENCE.json"
        )
        artifact = build_artifact(evidence_path, evidence)
        self.assertEqual(artifact["surface"], "report")
        self.assertEqual(artifact["snapshot"]["status"], "fixture")
        self.assertEqual(len(artifact["manifest"]["charts"]), 5)
        block_ids = [row["id"] for row in artifact["manifest"]["blocks"]]
        for required in ("summary", "finding", "scope", "method", "limits", "next", "questions"):
            self.assertIn(required, block_ids)


if __name__ == "__main__":
    unittest.main()
