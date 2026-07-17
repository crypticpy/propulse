from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from freeze_6m_release import build_decision  # noqa: E402


class Freeze6mReleaseTests(unittest.TestCase):
    def fixture(self, root: Path) -> tuple[dict[str, object], Path, Path]:
        model = root / "models/auroral.json"
        calibrator = root / "models/auroral.joblib"
        model.parent.mkdir(parents=True)
        model.write_text("model", encoding="utf-8")
        calibrator.write_text("calibrator", encoding="utf-8")
        audit = root / "audit.json"
        audit.write_text(json.dumps({"checks": 35, "failures": 0}), encoding="utf-8")
        results_path = root / "results.json"
        results = {
            "run_id": "test",
            "scope": "development_only",
            "locked_archive_test_read": False,
            "release_approved": False,
            "release_blockers": ["Independent event catalog is missing."],
            "event_gate": {"brier_skill": 0.2},
            "quiet_gate": {"brier_skill": 0.3},
            "gate_row_coverage": 0.9,
            "mechanisms": {
                "auroral": {
                    "status": "trained_experimental",
                    "train_rows": 1000,
                    "gate_rows": 200,
                    "brier_skill": 0.2,
                    "model_path": "models/auroral.json",
                    "model_sha256": hashlib.sha256(b"model").hexdigest(),
                    "calibrator_path": "models/auroral.joblib",
                    "calibrator_sha256": hashlib.sha256(b"calibrator").hexdigest(),
                },
                "meteor_scatter": {
                    "status": "insufficient_support",
                    "train_rows": 10,
                },
            },
        }
        results_path.write_text(json.dumps(results), encoding="utf-8")
        return results, results_path, audit

    def test_freezes_withheld_decision_and_hashes_experimental_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            results, results_path, audit = self.fixture(root)
            decision = build_decision(
                results,
                root=root,
                results_path=results_path,
                audit_path=audit,
            )
        self.assertEqual(decision["decision"], "withheld")
        self.assertFalse(decision["product_serving_allowed"])
        self.assertEqual(decision["released_mechanisms"], [])
        self.assertEqual(len(decision["experimental_mechanisms"][0]["artifacts"]), 2)
        self.assertTrue(decision["complete"])

    def test_rejects_any_claim_that_release_is_approved(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            results, results_path, audit = self.fixture(root)
            results["release_approved"] = True
            with self.assertRaisesRegex(RuntimeError, "withheld decision"):
                build_decision(
                    results,
                    root=root,
                    results_path=results_path,
                    audit_path=audit,
                )


if __name__ == "__main__":
    unittest.main()
