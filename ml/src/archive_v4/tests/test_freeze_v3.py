from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4"
sys.path.insert(0, str(MODULE))

from freeze_v3 import collect_model_paths, is_portable_evidence  # noqa: E402


class FreezeV3Tests(unittest.TestCase):
    def test_model_references_include_the_isotonic_calibrator(self) -> None:
        paths = collect_model_paths({
            "model": {
                "model_path": "ml/models/archive_v3/run/hf_nowcast.json",
            },
        })
        self.assertEqual(paths, {
            "ml/models/archive_v3/run/hf_nowcast.json",
            "ml/models/archive_v3/run/hf_nowcast.isotonic.joblib",
        })

    def test_nested_references_are_deduplicated(self) -> None:
        paths = collect_model_paths([
            {"model_path": "ml/models/archive_v3/run/6m.json"},
            {"copy": {"model_path": "ml/models/archive_v3/run/6m.json"}},
        ])
        self.assertEqual(len(paths), 2)

    def test_macos_metadata_is_not_release_evidence(self) -> None:
        self.assertFalse(is_portable_evidence(Path(".DS_Store")))
        self.assertFalse(is_portable_evidence(Path("._hf_nowcast.json")))
        self.assertTrue(is_portable_evidence(Path("hf_results.json")))


if __name__ == "__main__":
    unittest.main()
