from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from outcome_protocol import (  # noqa: E402
    REQUIRED_DECEMBER_FREEZES,
    OutcomeProtocolError,
    authorize_scope,
    new_manifest,
    resume_scope,
)


class OutcomeProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(
            (ROOT / "ml/config/propagation_v4_2_phase2_scale.json").read_text()
        )

    def frozen_manifest(self) -> dict:
        manifest = new_manifest(self.config)
        manifest["candidate_frozen"] = True
        manifest["frozen_artifacts"] = {
            name: {"path": name, "bytes": 1, "sha256": "x"}
            for name in REQUIRED_DECEMBER_FREEZES
        }
        return manifest

    def test_december_requires_exact_month_and_all_freezes(self) -> None:
        manifest = self.frozen_manifest()
        self.assertEqual(
            authorize_scope(manifest, self.config, "december", ["2024-12"]),
            ["2024-12"],
        )
        with self.assertRaises(OutcomeProtocolError):
            authorize_scope(manifest, self.config, "december", ["2024-11"])
        manifest["frozen_artifacts"].pop("gate_scorer")
        with self.assertRaises(OutcomeProtocolError):
            authorize_scope(manifest, self.config, "december", ["2024-12"])

    def test_archive_requires_passing_december(self) -> None:
        manifest = self.frozen_manifest()
        months = self.config["phase5"]["locked_months"]
        with self.assertRaises(OutcomeProtocolError):
            authorize_scope(manifest, self.config, "archive", months)
        manifest["december_decision_passed"] = True
        self.assertEqual(
            authorize_scope(manifest, self.config, "archive", months), months
        )

    def test_resume_requires_original_attempt(self) -> None:
        manifest = self.frozen_manifest()
        manifest["december_opened"] = True
        manifest["december_attempt_id"] = "attempt-1"
        resume_scope(manifest, "december", "attempt-1")
        with self.assertRaises(OutcomeProtocolError):
            resume_scope(manifest, "december", "attempt-2")


if __name__ == "__main__":
    unittest.main()
