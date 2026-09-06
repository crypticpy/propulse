from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from freeze_phase3_candidate import SOURCE_FILES, training_profile_fields  # noqa: E402
from prepare_locked_gate import verify_source_freeze  # noqa: E402


class Phase3FreezeTests(unittest.TestCase):
    def test_source_freeze_inventory_covers_every_pipeline_stage(self) -> None:
        self.assertEqual(
            set(SOURCE_FILES),
            {
                "v3_common",
                "v3_download",
                "v3_space_weather",
                "v3_bronze",
                "v3_source_manifest",
                "v3_opportunities",
                "v3_features",
                "v4_2_prepare_gate",
                "v4_2_audit_gate",
                "live_opportunity_transform",
            },
        )
        self.assertTrue(all(path.is_file() for path in SOURCE_FILES.values()))

    def test_missing_source_freeze_is_rejected(self) -> None:
        with self.assertRaises(FileNotFoundError):
            verify_source_freeze(ROOT / "ml/results/does-not-exist.json")

    def test_training_profile_fields_stays_v1_compatible_for_m5(self) -> None:
        fields = training_profile_fields("m5", {"compute": {}})
        self.assertEqual(fields, {"training_profile": "m5"})

    def test_training_profile_fields_adds_linux_gpu_contract(self) -> None:
        config = {"compute": {"linux_gpu": {"device": "cuda", "tree_method": "hist"}}}
        fields = training_profile_fields("linux_gpu", config)
        self.assertEqual(
            fields,
            {
                "training_profile": "linux_gpu",
                "linux_gpu_contract": {"device": "cuda", "tree_method": "hist"},
            },
        )


if __name__ == "__main__":
    unittest.main()
