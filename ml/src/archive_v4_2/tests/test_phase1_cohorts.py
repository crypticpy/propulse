from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from build_phase1_cohorts import verify_feature_contract  # noqa: E402
from phase1_core import Phase1Error  # noqa: E402


class VerifyFeatureContractTests(unittest.TestCase):
    def test_no_marker_is_silently_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            verify_feature_contract(Path(directory), {"run_id": "r"})

    def test_matching_v1_marker_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "_CONTRACT").write_text("archive-v4-features-v1\n", encoding="ascii")
            verify_feature_contract(root, {"run_id": "r"})

    def test_mismatched_marker_raises_phase1_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "_CONTRACT").write_text("archive-v4-features-v2\n", encoding="ascii")
            with self.assertRaises(Phase1Error) as raised:
                verify_feature_contract(root, {"run_id": "r"})
            self.assertIn("archive-v4-features-v2", str(raised.exception))
            self.assertIn("archive-v4-features-v1", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
