from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

import run_paths  # noqa: E402
from benchmark_prediction_threads import resolve_output_path  # noqa: E402


class ResolveOutputPathTests(unittest.TestCase):
    def test_explicit_output_wins(self) -> None:
        config = {"run_id": "propagation_v4_2_phase2_scale"}
        resolved = resolve_output_path("/tmp/custom.json", config)
        self.assertEqual(resolved, Path("/tmp/custom.json"))

    def test_missing_output_falls_back_to_run_paths_default(self) -> None:
        config = {"run_id": "propagation_v4_2_phase2_scale"}
        resolved = resolve_output_path(None, config)
        self.assertEqual(
            resolved, run_paths.prediction_thread_benchmark_path(config)
        )

    def test_empty_string_output_falls_back_to_default(self) -> None:
        config = {"run_id": "propagation_v4_2_phase2_scale_v2"}
        resolved = resolve_output_path("", config)
        self.assertEqual(
            resolved, run_paths.prediction_thread_benchmark_path(config)
        )


if __name__ == "__main__":
    unittest.main()
