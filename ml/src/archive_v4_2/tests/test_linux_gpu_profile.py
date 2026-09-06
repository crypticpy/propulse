"""The linux_gpu training profile: runtime probes, fit params and path remap.

CUDA cannot be exercised here -- the M5 venv carries a CPU-only XGBoost -- so
every GPU probe is mocked. What these tests pin is the contract: which host the
profile accepts, which fit parameters each profile derives, where a cohort
recorded on the M5 is read from on the box, and that none of it moves the
frozen V1 answers.
"""

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
TESTS = Path(__file__).resolve().parent
for path in (MODULE, TESTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import m5_runtime  # noqa: E402
import test_run_paths  # noqa: E402
from m5_runtime import (  # noqa: E402
    LINUX_GPU_PROFILE,
    M5_PROFILE,
    LinuxGpuRuntimeError,
    RuntimeProfileError,
    artifact_path,
    profile_settings,
    resolve_compute_profile,
    supported_profiles,
    validate_linux_gpu_runtime,
    validate_runtime,
)
from phase2_core import (  # noqa: E402
    Phase2Error,
    matrix_backend,
    validate_config,
    validate_profiles,
)
from train_phase2_scale import (  # noqa: E402
    parallel_config,
    training_parameters,
    verify_artifact,
)


V1_CONFIG_PATH = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V2_CONFIG_PATH = ROOT / "ml/config/propagation_v4_2_phase2_scale_v2.json"
M5_ROOT = "/Volumes/Projects/PropulseML"
BOX_ROOT = "/srv/propulseml"
COHORT = (
    "ml/data/processed/archive_v4_2/propagation_v4_2_phase2_scale_v2/20m"
    "/cohort_A4_recent_cycle_shared_20m.parquet"
)
CUDA_BUILD = SimpleNamespace(
    build_info=lambda: {"USE_CUDA": True, "USE_OPENMP": True},
    __version__="3.3.0",
)
CPU_BUILD = SimpleNamespace(
    build_info=lambda: {"USE_CUDA": False, "USE_OPENMP": True},
    __version__="3.3.0",
)
HEALTHY_BOX = {
    "system": "Linux",
    "machine": "x86_64",
    "cpu_count": 16,
    "physical_cores": 16,
    "memory_gb": 64.0,
    "gpus": [
        {
            "name": "NVIDIA GeForce RTX 5080",
            "free_vram_gb": 15.5,
            "total_vram_gb": 16.0,
        }
    ],
    "free_disk_gb": 900.0,
}


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class LinuxGpuRuntimeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load(V2_CONFIG_PATH)

    def box(self, **overrides):
        """Patch every host probe with a healthy box, minus any override."""
        values = {**HEALTHY_BOX, **overrides}
        stack = ExitStack()
        # pmset/sysctl must never run on Linux; _command is the only path to them.
        self.command = stack.enter_context(
            patch.object(
                m5_runtime,
                "_command",
                Mock(side_effect=AssertionError("macOS probe ran on Linux")),
            )
        )
        stack.enter_context(
            patch.object(m5_runtime.platform, "system", return_value=values["system"])
        )
        stack.enter_context(
            patch.object(m5_runtime.platform, "machine", return_value=values["machine"])
        )
        stack.enter_context(
            patch.object(m5_runtime.os, "cpu_count", return_value=values["cpu_count"])
        )
        stack.enter_context(
            patch.object(
                m5_runtime,
                "_linux_physical_cores",
                return_value=values["physical_cores"],
            )
        )
        stack.enter_context(
            patch.object(
                m5_runtime, "_meminfo_total_gb", return_value=values["memory_gb"]
            )
        )
        stack.enter_context(
            patch.object(m5_runtime, "_nvidia_gpus", return_value=values["gpus"])
        )
        stack.enter_context(
            patch.object(
                m5_runtime, "_free_disk_gb", return_value=values["free_disk_gb"]
            )
        )
        return stack

    def test_healthy_box_passes_and_reports_the_gpu(self) -> None:
        with self.box():
            runtime = validate_linux_gpu_runtime(
                self.config, xgboost_module=CUDA_BUILD
            )
        self.assertEqual(runtime["profile"], LINUX_GPU_PROFILE)
        self.assertEqual(runtime["machine"], "x86_64")
        self.assertEqual(runtime["physical_cores_visible"], 16)
        self.assertEqual(runtime["os_cpu_count"], 16)
        self.assertEqual(runtime["unified_memory_gb"], 64.0)
        self.assertEqual(runtime["gpu"]["name"], "NVIDIA GeForce RTX 5080")
        self.assertEqual(runtime["gpu"]["total_vram_gb"], 16.0)
        self.assertTrue(runtime["xgboost_cuda"])
        self.assertEqual(runtime["external_root"], BOX_ROOT)
        self.command.assert_not_called()

    def test_snapshot_shares_the_m5_keys_the_results_json_records(self) -> None:
        with self.box():
            runtime = validate_linux_gpu_runtime(
                self.config, xgboost_module=CUDA_BUILD
            )
        for key in (
            "profile",
            "machine",
            "physical_cores_visible",
            "os_cpu_count",
            "unified_memory_gb",
            "python_version",
            "xgboost_openmp",
            "xgboost_cuda",
            "xgboost_version",
        ):
            self.assertIn(key, runtime)

    def test_macos_is_rejected(self) -> None:
        with self.box(system="Darwin"):
            with self.assertRaisesRegex(LinuxGpuRuntimeError, "requires Linux"):
                validate_linux_gpu_runtime(self.config, xgboost_module=CUDA_BUILD)

    def test_non_x86_machine_is_rejected(self) -> None:
        with self.box(machine="aarch64"):
            with self.assertRaisesRegex(LinuxGpuRuntimeError, "x86_64"):
                validate_linux_gpu_runtime(self.config, xgboost_module=CUDA_BUILD)

    def test_too_few_cores_is_rejected(self) -> None:
        with self.box(physical_cores=4):
            with self.assertRaisesRegex(LinuxGpuRuntimeError, "physical cores"):
                validate_linux_gpu_runtime(self.config, xgboost_module=CUDA_BUILD)

    def test_too_little_ram_is_rejected(self) -> None:
        with self.box(memory_gb=16.0):
            with self.assertRaisesRegex(LinuxGpuRuntimeError, "host memory"):
                validate_linux_gpu_runtime(self.config, xgboost_module=CUDA_BUILD)

    def test_insufficient_free_vram_is_rejected(self) -> None:
        gpus = [{**HEALTHY_BOX["gpus"][0], "free_vram_gb": 6.0}]
        with self.box(gpus=gpus):
            with self.assertRaisesRegex(LinuxGpuRuntimeError, "free VRAM"):
                validate_linux_gpu_runtime(self.config, xgboost_module=CUDA_BUILD)

    def test_insufficient_free_disk_is_rejected(self) -> None:
        with self.box(free_disk_gb=50.0):
            with self.assertRaisesRegex(LinuxGpuRuntimeError, "free space"):
                validate_linux_gpu_runtime(self.config, xgboost_module=CUDA_BUILD)

    def test_cpu_only_xgboost_is_rejected(self) -> None:
        with self.box():
            with self.assertRaisesRegex(LinuxGpuRuntimeError, "CUDA"):
                validate_linux_gpu_runtime(self.config, xgboost_module=CPU_BUILD)

    def test_nvidia_smi_output_is_parsed_into_gibibytes(self) -> None:
        row = "15772, 16303, NVIDIA GeForce RTX 5080"
        with patch.object(m5_runtime, "_run", return_value=row):
            gpus = m5_runtime._nvidia_gpus()
        self.assertEqual(len(gpus), 1)
        self.assertEqual(gpus[0]["name"], "NVIDIA GeForce RTX 5080")
        self.assertAlmostEqual(gpus[0]["free_vram_gb"], 15772 / 1024, places=6)
        self.assertAlmostEqual(gpus[0]["total_vram_gb"], 16303 / 1024, places=6)

    def test_missing_nvidia_smi_is_a_profile_error(self) -> None:
        with patch.object(
            m5_runtime.subprocess, "run", side_effect=FileNotFoundError("nvidia-smi")
        ):
            with self.assertRaisesRegex(LinuxGpuRuntimeError, "runtime probe failed"):
                m5_runtime._nvidia_gpus()

    def test_no_visible_gpu_is_rejected(self) -> None:
        with patch.object(m5_runtime, "_run", return_value=""):
            with self.assertRaisesRegex(LinuxGpuRuntimeError, "no CUDA device"):
                m5_runtime._nvidia_gpus()

    def test_meminfo_is_parsed_in_gibibytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "meminfo"
            path.write_text(
                "MemTotal:       65805832 kB\nMemFree:  123 kB\n", encoding="utf-8"
            )
            self.assertAlmostEqual(
                m5_runtime._meminfo_total_gb(str(path)),
                65805832 * 1024 / 1024**3,
                places=6,
            )

    def test_dispatch_selects_the_linux_validator(self) -> None:
        with self.box():
            runtime = validate_runtime(
                self.config, LINUX_GPU_PROFILE, xgboost_module=CUDA_BUILD
            )
        self.assertEqual(runtime["profile"], LINUX_GPU_PROFILE)
        self.command.assert_not_called()

    def test_dispatch_rejects_an_unknown_profile(self) -> None:
        with self.assertRaises(RuntimeProfileError):
            validate_runtime(self.config, "windows_gpu")


class FitParameterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load(V2_CONFIG_PATH)

    def test_m5_parameters_are_the_configured_parameters_plus_the_seed(self) -> None:
        parameters = training_parameters(self.config, M5_PROFILE)
        expected = dict(self.config["training"]["parameters"])
        expected["seed"] = int(self.config["seed"])
        self.assertEqual(parameters, expected)
        self.assertNotIn("device", parameters)
        self.assertEqual(parameters["tree_method"], "hist")
        self.assertEqual(parameters["nthread"], 14)

    def test_linux_gpu_only_changes_where_the_trees_are_fit(self) -> None:
        m5 = training_parameters(self.config, M5_PROFILE)
        box = training_parameters(self.config, LINUX_GPU_PROFILE)
        self.assertEqual(box["device"], "cuda")
        self.assertEqual(box["tree_method"], "hist")
        self.assertEqual(box["nthread"], 8)
        differences = {
            key for key in set(m5) | set(box) if m5.get(key) != box.get(key)
        }
        self.assertEqual(differences, {"device", "nthread"})
        for key in ("objective", "eval_metric", "max_depth", "eta", "max_bin"):
            self.assertEqual(m5[key], box[key])
        self.assertEqual(m5["seed"], box["seed"])

    def test_matrix_backend_is_profile_aware(self) -> None:
        self.assertEqual(
            matrix_backend(self.config, 20_000_000, M5_PROFILE),
            "external_memory_quantile",
        )
        self.assertEqual(
            matrix_backend(self.config, 50_000_000, M5_PROFILE),
            "streamed_in_memory_quantile",
        )
        for scale in (20_000_000, 50_000_000):
            self.assertEqual(
                matrix_backend(self.config, scale, LINUX_GPU_PROFILE),
                "streamed_in_memory_quantile",
            )

    def test_matrix_backend_rejects_an_unknown_linux_backend(self) -> None:
        changed = load(V2_CONFIG_PATH)
        changed["compute"]["linux_gpu"]["twenty_million_backend"] = "pending"
        with self.assertRaises(Phase2Error):
            matrix_backend(changed, 20_000_000, LINUX_GPU_PROFILE)

    def test_linux_gpu_runs_one_fit_at_a_time(self) -> None:
        single = parallel_config(self.config, 1, LINUX_GPU_PROFILE)
        self.assertEqual(single["training"]["parameters"]["nthread"], 8)
        with self.assertRaises(Phase2Error):
            parallel_config(self.config, 2, LINUX_GPU_PROFILE)

    def test_m5_worker_contract_is_unchanged(self) -> None:
        parallel = parallel_config(self.config, 2, M5_PROFILE)
        self.assertEqual(parallel["training"]["parameters"]["nthread"], 9)
        self.assertEqual(parallel_config(self.config, 2), parallel)

    def test_backend_benchmark_is_not_applicable_under_cuda(self) -> None:
        hardware = profile_settings(self.config, LINUX_GPU_PROFILE)
        self.assertEqual(
            hardware["backend_benchmark"], "not_applicable_cuda_profile"
        )


class CohortPathRemapTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load(V2_CONFIG_PATH)
        self.box = resolve_compute_profile(self.config, LINUX_GPU_PROFILE)
        self.m5 = resolve_compute_profile(self.config, M5_PROFILE)

    def test_profile_roots_come_from_the_profile_block(self) -> None:
        active = self.box["compute"]["active_profile"]
        self.assertEqual(active["name"], LINUX_GPU_PROFILE)
        self.assertEqual(active["external_root"], BOX_ROOT)
        self.assertEqual(
            active["data_root"], f"{BOX_ROOT}/data/processed/archive_v4_2"
        )
        self.assertEqual(
            active["temp_root"],
            f"{BOX_ROOT}/tmp/propagation_v4_2_phase2_scale_v2",
        )
        self.assertEqual(active["maximum_rss_gb"], 48.0)
        self.assertEqual(active["source_external_root"], M5_ROOT)

    def test_m5_roots_are_unchanged_by_resolution(self) -> None:
        active = self.m5["compute"]["active_profile"]
        self.assertEqual(active["external_root"], M5_ROOT)
        self.assertEqual(active["maximum_rss_gb"], 96.0)
        self.assertEqual(
            str(artifact_path(COHORT, self.m5)), str(ROOT / COHORT)
        )

    def test_repository_relative_cohort_is_remapped_onto_the_box_root(self) -> None:
        self.assertEqual(
            str(artifact_path(COHORT, self.box)),
            f"{BOX_ROOT}/{COHORT.removeprefix('ml/')}",
        )

    def test_absolute_m5_path_is_remapped_onto_the_box_root(self) -> None:
        absolute = f"{M5_ROOT}/data/processed/archive_v4_2/20m/cohort.parquet"
        self.assertEqual(
            str(artifact_path(absolute, self.box)),
            f"{BOX_ROOT}/data/processed/archive_v4_2/20m/cohort.parquet",
        )

    def test_absolute_path_outside_the_m5_root_is_rejected(self) -> None:
        with self.assertRaises(RuntimeProfileError):
            artifact_path("/tmp/elsewhere/cohort.parquet", self.box)

    def test_repository_internal_paths_are_not_remapped(self) -> None:
        for relative in (
            "ml/data/manifests/propagation_v4_2_phase2_v2_20m_cohorts.json",
            "ml/results/propagation_v4_2/x/training_20m_results.json",
        ):
            with self.subTest(relative=relative):
                self.assertEqual(
                    str(artifact_path(relative, self.box)), str(ROOT / relative)
                )

    def test_model_tree_is_remapped_so_checkpoints_resolve(self) -> None:
        relative = "ml/models/archive_v4_2/run/20m/A4_recent_cycle_F3_2024_07.json"
        self.assertEqual(
            str(artifact_path(relative, self.box)),
            f"{BOX_ROOT}/{relative.removeprefix('ml/')}",
        )

    def test_data_root_override_rebases_every_root(self) -> None:
        override = resolve_compute_profile(
            self.config, LINUX_GPU_PROFILE, data_root_override="/mnt/ml"
        )
        active = override["compute"]["active_profile"]
        self.assertEqual(active["external_root"], "/mnt/ml")
        self.assertEqual(active["data_root"], "/mnt/ml/data/processed/archive_v4_2")
        self.assertEqual(
            active["temp_root"], "/mnt/ml/tmp/propagation_v4_2_phase2_scale_v2"
        )
        self.assertEqual(
            str(artifact_path(COHORT, override)),
            f"/mnt/ml/{COHORT.removeprefix('ml/')}",
        )

    def test_data_root_override_is_rejected_for_the_m5(self) -> None:
        with self.assertRaises(RuntimeProfileError):
            resolve_compute_profile(
                self.config, M5_PROFILE, data_root_override="/mnt/ml"
            )

    def test_verify_artifact_reads_the_remapped_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = b"cohort bytes"
            target = Path(directory) / "data/processed/archive_v4_2/20m"
            target.mkdir(parents=True)
            (target / "cohort.parquet").write_bytes(payload)
            box = resolve_compute_profile(
                self.config, LINUX_GPU_PROFILE, data_root_override=directory
            )
            item = {
                "path": "ml/data/processed/archive_v4_2/20m/cohort.parquet",
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
            self.assertEqual(
                verify_artifact(item, config=box), target / "cohort.parquet"
            )
            missing = dict(item)
            missing["path"] = "ml/data/processed/archive_v4_2/20m/absent.parquet"
            with self.assertRaisesRegex(Phase2Error, "artifact is missing"):
                verify_artifact(missing, config=box)


class V1ProfileParityTest(test_run_paths.V1PathParityTest):
    """The frozen V1 chain keeps its answers now that profiles exist.

    Inherits every V1 path expectation so a profile regression fails here too.
    """

    def test_v1_supports_only_the_m5_profile(self) -> None:
        self.assertNotIn("supported_profiles", self.config["compute"])
        self.assertEqual(supported_profiles(self.config), (M5_PROFILE,))
        self.assertEqual(validate_profiles(self.config), (M5_PROFILE,))
        validate_config(self.config)

    def test_v1_rejects_the_linux_gpu_profile(self) -> None:
        with self.assertRaises(RuntimeProfileError):
            profile_settings(self.config, LINUX_GPU_PROFILE)
        with self.assertRaises(RuntimeProfileError):
            resolve_compute_profile(self.config, LINUX_GPU_PROFILE)
        with self.assertRaises(Phase2Error):
            matrix_backend(self.config, 20_000_000, LINUX_GPU_PROFILE)

    def test_v1_paths_are_never_remapped(self) -> None:
        resolved = resolve_compute_profile(self.config, M5_PROFILE)
        self.assertEqual(
            resolved["compute"]["external_root"], self.config["compute"]["external_root"]
        )
        for relative in (COHORT, "ml/data/manifests/x.json", "ml/models/a/b.json"):
            with self.subTest(relative=relative):
                self.assertEqual(
                    str(artifact_path(relative, resolved)), str(ROOT / relative)
                )
                self.assertEqual(
                    str(artifact_path(relative)), str(ROOT / relative)
                )

    def test_v1_matrix_backends_are_unchanged(self) -> None:
        self.assertEqual(
            matrix_backend(self.config, 20_000_000), "external_memory_quantile"
        )
        self.assertEqual(
            matrix_backend(self.config, 50_000_000), "streamed_in_memory_quantile"
        )

    def test_v1_fit_parameters_are_unchanged(self) -> None:
        expected = dict(self.config["training"]["parameters"])
        expected["seed"] = int(self.config["seed"])
        self.assertEqual(training_parameters(self.config, M5_PROFILE), expected)


class ProfileContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load(V2_CONFIG_PATH)

    def test_v2_declares_both_profiles_and_still_validates(self) -> None:
        validate_config(self.config)
        self.assertEqual(
            supported_profiles(self.config), (M5_PROFILE, LINUX_GPU_PROFILE)
        )
        self.assertEqual(self.config["compute"]["required_profile"], M5_PROFILE)

    def test_a_declared_profile_needs_its_hardware_block(self) -> None:
        changed = load(V2_CONFIG_PATH)
        del changed["compute"]["linux_gpu"]
        with self.assertRaises(Phase2Error):
            validate_profiles(changed)

    def test_supported_profiles_must_include_the_required_profile(self) -> None:
        changed = load(V2_CONFIG_PATH)
        changed["compute"]["supported_profiles"] = [LINUX_GPU_PROFILE]
        with self.assertRaises(Phase2Error):
            validate_profiles(changed)

    def test_unknown_profiles_are_rejected(self) -> None:
        changed = load(V2_CONFIG_PATH)
        changed["compute"]["supported_profiles"] = [M5_PROFILE, "windows_gpu"]
        with self.assertRaises(Phase2Error):
            validate_profiles(changed)


if __name__ == "__main__":
    unittest.main()
