from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from package_phase3_candidate import public_profile, selected_components  # noqa: E402
from phase2_core import Phase2Error  # noqa: E402


class Phase3PackagingTests(unittest.TestCase):
    def test_single_candidate_has_unit_weight(self) -> None:
        self.assertEqual(
            selected_components({}, "A4_recent_cycle"),
            [("A4_recent_cycle", 1.0)],
        )

    def test_a6_uses_frozen_component_weights(self) -> None:
        evaluation = {
            "a6_policy_selection": {
                "left": "A4_recent_cycle",
                "right": "A5_recency_weighted",
                "selected_left_weight": 0.75,
            }
        }
        self.assertEqual(
            selected_components(evaluation, "A6_recent_recency_blend"),
            [("A4_recent_cycle", 0.75), ("A5_recency_weighted", 0.25)],
        )

    def test_a6_requires_policy(self) -> None:
        with self.assertRaises(Phase2Error):
            selected_components({}, "A6_recent_recency_blend")

    def test_public_ensemble_paths_include_bundle_prefix(self) -> None:
        profile = {
            "kind": "weighted_ensemble",
            "components": [
                {
                    "model_path": "a.json",
                    "calibrator_path": "a.joblib",
                }
            ],
        }
        value = public_profile(profile, "ml/models/run/serving")
        self.assertEqual(
            value["components"][0]["model_path"],
            "ml/models/run/serving/a.json",
        )


if __name__ == "__main__":
    unittest.main()
