"""The V1 config must keep resolving to byte-identical V1 artifact paths.

Every phase-2 script used to hard-code these strings. ``run_paths`` now derives
them from ``config["run_id"]``; this test pins the V1 answers literally so a
future run-id change can never silently move the frozen V1 chain, and checks
that the V2 config resolves to V2-only paths.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

import run_paths  # noqa: E402


V1_CONFIG_PATH = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V2_CONFIG_PATH = ROOT / "ml/config/propagation_v4_2_phase2_scale_v2.json"
V1_RESULTS = "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
V2_RESULTS = "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale_v2"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class V1PathParityTest(unittest.TestCase):
    """Literal expectations copied from the pre-refactor module constants."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.config = load(V1_CONFIG_PATH)

    def expect(self, actual: Path, relative: str) -> None:
        self.assertEqual(str(actual), str(ROOT / relative))

    def test_run_id_is_unchanged(self) -> None:
        self.assertEqual(run_paths.run_id(self.config), run_paths.V1_RUN_ID)
        self.assertEqual(run_paths.run_id(self.config), "propagation_v4_2_phase2_scale")

    def test_results_dir(self) -> None:
        self.expect(run_paths.results_dir(self.config), V1_RESULTS)

    def test_cohort_manifest_names(self) -> None:
        self.expect(
            run_paths.cohort_manifest_path(self.config, 20_000_000),
            "ml/data/manifests/propagation_v4_2_phase2_20m_cohorts.json",
        )
        self.expect(
            run_paths.cohort_manifest_path(self.config, 50_000_000),
            "ml/data/manifests/propagation_v4_2_phase2_50m_cohorts.json",
        )

    def test_cohort_manifest_prefix_defaults_from_the_run_id(self) -> None:
        self.assertNotIn("cohort_manifest_prefix", self.config)
        self.assertEqual(
            run_paths.cohort_manifest_prefix(self.config),
            "propagation_v4_2_phase2",
        )

    def test_training_and_evaluation_results(self) -> None:
        self.expect(
            run_paths.training_results_path(self.config, 20_000_000),
            f"{V1_RESULTS}/training_20m_results.json",
        )
        self.expect(
            run_paths.training_results_path(self.config, 50_000_000),
            f"{V1_RESULTS}/training_50m_results.json",
        )
        self.expect(
            run_paths.evaluation_results_path(self.config, 20_000_000),
            f"{V1_RESULTS}/evaluation_20m_results.json",
        )
        self.expect(
            run_paths.evaluation_20m_path(self.config),
            f"{V1_RESULTS}/evaluation_20m_results.json",
        )
        self.expect(
            run_paths.evaluation_results_path(self.config, 50_000_000),
            f"{V1_RESULTS}/evaluation_50m_results.json",
        )
        self.expect(
            run_paths.validation_results_path(self.config, 50_000_000),
            f"{V1_RESULTS}/validation_50m.json",
        )

    def test_protocol_and_benchmark_artifacts(self) -> None:
        self.expect(
            run_paths.prediction_thread_benchmark_path(self.config),
            f"{V1_RESULTS}/prediction_thread_benchmark.json",
        )
        self.expect(
            run_paths.transform_parity_path(self.config),
            f"{V1_RESULTS}/live_feature_pipeline/transform_parity.json",
        )
        self.expect(
            run_paths.outcome_manifest_path(self.config),
            f"{V1_RESULTS}/outcome_protocol_manifest.json",
        )
        self.expect(
            run_paths.source_freeze_path(self.config),
            f"{V1_RESULTS}/source_pipeline_freeze.json",
        )
        self.expect(
            run_paths.synthetic_gate_dir(self.config),
            f"{V1_RESULTS}/synthetic_gate_dry_run",
        )
        self.expect(
            run_paths.phase3_validation_path(self.config),
            f"{V1_RESULTS}/phase3_candidate_validation.json",
        )

    def test_serving_bundle_paths(self) -> None:
        self.expect(
            run_paths.serving_bundle_dir(self.config),
            "ml/models/archive_v4_2/propagation_v4_2_phase2_scale/serving",
        )
        self.expect(
            run_paths.serving_manifest_path(self.config),
            "ml/models/archive_v4_2/propagation_v4_2_phase2_scale/serving/serving_manifest.json",
        )
        self.assertEqual(
            str(run_paths.external_serving_bundle_dir(self.config)),
            str(
                Path(self.config["compute"]["external_root"])
                / "models/archive_v4_2/propagation_v4_2_phase2_scale/serving"
            ),
        )

    def test_evaluation_inputs_config_defaults_to_the_v1_phase0_config(self) -> None:
        self.assertNotIn("evaluation_inputs_config", self.config)
        self.expect(
            run_paths.evaluation_inputs_config_path(self.config),
            "ml/config/propagation_v4_2.json",
        )

    def test_v1_outcome_manifest_still_exists_where_the_protocol_left_it(self) -> None:
        self.assertTrue(run_paths.outcome_manifest_path(self.config).is_file())

    def test_no_resolved_v1_path_mentions_v2(self) -> None:
        for name, value in run_paths.resolved_paths(self.config).items():
            with self.subTest(name=name):
                self.assertNotIn("_v2", value)


class V2PathIsolationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = load(V2_CONFIG_PATH)

    def test_run_id(self) -> None:
        self.assertEqual(
            run_paths.run_id(self.config), "propagation_v4_2_phase2_scale_v2"
        )

    def test_cohort_manifests_do_not_collide_with_v1(self) -> None:
        v1 = load(V1_CONFIG_PATH)
        for scale in (20_000_000, 50_000_000):
            with self.subTest(scale=scale):
                self.assertNotEqual(
                    run_paths.cohort_manifest_path(self.config, scale),
                    run_paths.cohort_manifest_path(v1, scale),
                )
        self.assertEqual(
            str(run_paths.cohort_manifest_path(self.config, 20_000_000)),
            str(ROOT / "ml/data/manifests/propagation_v4_2_phase2_v2_20m_cohorts.json"),
        )

    def test_every_resolved_path_is_v2_scoped(self) -> None:
        resolved = run_paths.resolved_paths(self.config)
        for name, value in resolved.items():
            if name in ("cohort_manifest_20m", "cohort_manifest_50m"):
                self.assertIn("propagation_v4_2_phase2_v2", value)
                continue
            with self.subTest(name=name):
                self.assertIn("_v2", value)

    def test_no_resolved_path_is_shared_with_v1(self) -> None:
        v1 = run_paths.resolved_paths(load(V1_CONFIG_PATH))
        v2 = run_paths.resolved_paths(self.config)
        self.assertEqual(set(v1), set(v2))
        for name in v1:
            with self.subTest(name=name):
                self.assertNotEqual(v1[name], v2[name])

    def test_evaluation_inputs_config_points_at_the_v2_phase0_config(self) -> None:
        path = run_paths.evaluation_inputs_config_path(self.config)
        self.assertEqual(str(path), str(ROOT / "ml/config/propagation_v4_2_v2.json"))
        self.assertTrue(path.is_file())

    def test_evaluation_inputs_are_v2_datasets(self) -> None:
        inputs = run_paths.evaluation_inputs(self.config)
        self.assertEqual(sorted(inputs), sorted(load(V1_CONFIG_PATH.parent / "propagation_v4_2.json")["diagnosis"]["inputs"]))
        for month, item in inputs.items():
            with self.subTest(month=month):
                self.assertIn("_v2_hf.parquet", str(item["path"]))


if __name__ == "__main__":
    unittest.main()
