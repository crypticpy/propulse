from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from generate_phase2_report import (  # noqa: E402
    any_fold_execution,
    apple_silicon_or_linux_gpu_section,
    backend_benchmark_applicable,
    compute_finding_body,
    ensure_open_scope,
    feature_gain_encodings,
    selection_by_name,
    training_profile_of,
    training_rows,
    variant,
)
from m5_runtime import LINUX_GPU_PROFILE, M5_PROFILE  # noqa: E402


class Phase2ReportTests(unittest.TestCase):
    def test_feature_gain_bar_uses_categorical_x_and_numeric_y(self) -> None:
        encodings = feature_gain_encodings()
        self.assertEqual(encodings["x"], {
            "field": "feature",
            "type": "ordinal",
            "label": "Feature",
        })
        self.assertEqual(encodings["y"]["field"], "weighted_gain")
        self.assertEqual(encodings["y"]["type"], "quantitative")

    def test_candidate_variant_matches_scoring_schema(self) -> None:
        self.assertEqual(variant("A4_recent_cycle"), "A4_recent_cycle:calibrated")
        self.assertEqual(variant("A6_recent_recency_blend"), "A6_recent_recency_blend")

    def test_closed_scope_is_rejected(self) -> None:
        ensure_open_scope(
            {"december_2024_read": False, "locked_2025_read": False}, "open"
        )
        with self.assertRaises(RuntimeError):
            ensure_open_scope(
                {"december_2024_read": True, "locked_2025_read": False},
                "closed",
            )

    def test_selection_lookup_is_stable(self) -> None:
        value = {"selection": {"rows": [{"candidate": "A4", "score": 1}]}}
        self.assertEqual(selection_by_name(value)["A4"]["score"], 1)

    def test_training_rows_use_frozen_thread_fallback_for_legacy_fold(self) -> None:
        training = {
            "candidates": {
                "A4_recent_cycle": {
                    "F1_2024_02": {
                        "early_stopping_month": "2024-02",
                        "best_iteration": 100,
                        "best_score": 0.2,
                        "seconds": 3600,
                        "peak_rss_gb": 10,
                        "training_mode": "external_memory_quantile",
                    },
                    "F3_2024_07": {
                        "early_stopping_month": "2024-07",
                        "best_iteration": 200,
                        "best_score": 0.1,
                        "seconds": 1800,
                        "peak_rss_gb": 20,
                        "training_mode": "streamed_in_memory_quantile",
                        "execution": {"xgboost_threads": 9},
                    },
                }
            }
        }

        rows = training_rows(20_000_000, training, 14)

        self.assertEqual([row["xgboost_threads"] for row in rows], [14, 9])
        self.assertEqual(
            [row["thread_evidence"] for row in rows],
            ["frozen default training contract", "per-fold execution telemetry"],
        )

    def linux_gpu_training(self) -> dict:
        return {
            "training_profile": LINUX_GPU_PROFILE,
            "candidates": {
                "A4_recent_cycle": {
                    "F3_2024_07": {
                        "execution": {
                            "profile": LINUX_GPU_PROFILE,
                            "device": "cuda",
                            "tree_method": "hist",
                            "parallel_fit_workers": 1,
                            "runtime": {"machine": "x86_64", "gpu": "RTX 5080"},
                        }
                    }
                }
            },
        }

    def test_training_profile_of_defaults_to_m5_for_legacy_results(self) -> None:
        self.assertEqual(training_profile_of({}), M5_PROFILE)
        self.assertEqual(
            training_profile_of({"training_profile": LINUX_GPU_PROFILE}),
            LINUX_GPU_PROFILE,
        )

    def test_backend_benchmark_applicable_is_always_true_for_m5(self) -> None:
        self.assertTrue(backend_benchmark_applicable(M5_PROFILE, {}))

    def test_backend_benchmark_applicable_false_when_linux_gpu_marks_not_applicable(
        self,
    ) -> None:
        config = {"compute": {"linux_gpu": {"backend_benchmark": "not_applicable_cuda_profile"}}}
        self.assertFalse(backend_benchmark_applicable(LINUX_GPU_PROFILE, config))

    def test_backend_benchmark_applicable_true_when_linux_gpu_has_a_benchmark(self) -> None:
        config = {"compute": {"linux_gpu": {"backend_benchmark": "measured"}}}
        self.assertTrue(backend_benchmark_applicable(LINUX_GPU_PROFILE, config))

    def test_any_fold_execution_finds_first_recorded_block(self) -> None:
        training = self.linux_gpu_training()
        execution = any_fold_execution(training)
        self.assertEqual(execution["device"], "cuda")
        self.assertIsNone(any_fold_execution({"candidates": {}}))

    def test_compute_finding_body_uses_m5_prose_for_m5_profile(self) -> None:
        body = compute_finding_body(
            M5_PROFILE,
            True,
            {"training_profile": M5_PROFILE},
            {"selected_threads": 12},
            {"speedup": 1.8, "projected_parallel_peak_rss_gb": 40.0},
        )
        self.assertIn("Native Apple Silicon execution", body)
        self.assertIn("no Metal backend", body)

    def test_compute_finding_body_is_honest_about_linux_gpu(self) -> None:
        body = compute_finding_body(
            LINUX_GPU_PROFILE,
            False,
            self.linux_gpu_training(),
            {"selected_threads": 12},
            None,
        )
        self.assertNotIn("Apple Silicon", body)
        self.assertNotIn("Metal", body)
        self.assertIn("device=cuda", body)
        self.assertIn("tree_method=hist", body)
        self.assertIn("not applicable under linux_gpu", body)

    def test_apple_silicon_section_switches_on_profile(self) -> None:
        m5_section = apple_silicon_or_linux_gpu_section(
            M5_PROFILE,
            True,
            {"training_profile": M5_PROFILE},
            {"selected_threads": 12},
            {"speedup": 1.8, "projected_parallel_peak_rss_gb": 40.0},
        )
        self.assertIn("## Apple Silicon execution", m5_section)

        linux_gpu_section = apple_silicon_or_linux_gpu_section(
            LINUX_GPU_PROFILE,
            False,
            self.linux_gpu_training(),
            {"selected_threads": 12},
            None,
        )
        self.assertIn("## Linux GPU execution", linux_gpu_section)
        self.assertIn("device=cuda", linux_gpu_section)
        self.assertIn("not applicable under linux_gpu", linux_gpu_section)
        self.assertNotIn("CUDA/Metal", linux_gpu_section)


if __name__ == "__main__":
    unittest.main()
