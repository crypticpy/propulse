from __future__ import annotations

import concurrent.futures
import json
import multiprocessing
import os
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from phase2_core import Phase2Error  # noqa: E402
from m5_runtime import M5RuntimeError, validate_m5_runtime  # noqa: E402
from train_phase2_scale import fold_needs_training, parallel_config  # noqa: E402


CONFIG_PATH = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


def scheduler_probe(delay: float) -> tuple[int, str]:
    time.sleep(delay)
    return os.getpid(), sys.platform


class Phase2TrainingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

    def test_parallel_scheduler_uses_all_m5_cores_without_oversubscription(self) -> None:
        workers = self.config["compute"]["apple_silicon"]["parallel_fit_workers"]
        changed = parallel_config(self.config, workers)
        per_fit = changed["training"]["parameters"]["nthread"]
        self.assertEqual(workers * per_fit, 18)
        self.assertEqual(self.config["training"]["parameters"]["nthread"], 14)

    @patch("m5_runtime._thermal_snapshot", return_value=("no limits", {}))
    @patch("m5_runtime._power_snapshot", return_value=("AC Power", {"AC Power": 2}))
    @patch("m5_runtime._sysctl_int")
    @patch("m5_runtime.os.cpu_count", return_value=18)
    @patch("m5_runtime.platform.machine", return_value="arm64")
    def test_m5_runtime_verifies_core_clusters_and_high_power(
        self,
        _machine,
        _cpu_count,
        sysctl,
        _power,
        _thermal,
    ) -> None:
        values = {
            "hw.physicalcpu": 18,
            "hw.perflevel0.physicalcpu": 6,
            "hw.perflevel1.physicalcpu": 12,
            "hw.memsize": 128 * 1024**3,
        }
        sysctl.side_effect = values.__getitem__
        runtime = validate_m5_runtime(self.config)
        self.assertEqual(runtime["core_clusters"], [6, 12])
        self.assertEqual(runtime["power_source"], "AC Power")
        self.assertEqual(runtime["power_modes"]["AC Power"], 2)

    @patch("m5_runtime._thermal_snapshot", return_value=("no limits", {}))
    @patch("m5_runtime._power_snapshot", return_value=("AC Power", {"AC Power": 2}))
    @patch("m5_runtime._sysctl_int")
    @patch("m5_runtime.os.cpu_count", return_value=18)
    @patch("m5_runtime.platform.machine", return_value="arm64")
    def test_m5_runtime_rejects_wrong_core_topology(
        self,
        _machine,
        _cpu_count,
        sysctl,
        _power,
        _thermal,
    ) -> None:
        values = {
            "hw.physicalcpu": 18,
            "hw.perflevel0.physicalcpu": 8,
            "hw.perflevel1.physicalcpu": 10,
            "hw.memsize": 128 * 1024**3,
        }
        sysctl.side_effect = values.__getitem__
        with self.assertRaises(M5RuntimeError):
            validate_m5_runtime(self.config)

    @patch("m5_runtime._thermal_snapshot", return_value=("no limits", {}))
    @patch("m5_runtime._power_snapshot", return_value=("Battery Power", {"AC Power": 2}))
    @patch("m5_runtime._sysctl_int")
    @patch("m5_runtime.os.cpu_count", return_value=18)
    @patch("m5_runtime.platform.machine", return_value="arm64")
    def test_m5_runtime_rejects_battery_execution(
        self,
        _machine,
        _cpu_count,
        sysctl,
        _power,
        _thermal,
    ) -> None:
        values = {
            "hw.physicalcpu": 18,
            "hw.perflevel0.physicalcpu": 6,
            "hw.perflevel1.physicalcpu": 12,
            "hw.memsize": 128 * 1024**3,
        }
        sysctl.side_effect = values.__getitem__
        with self.assertRaisesRegex(M5RuntimeError, "power source"):
            validate_m5_runtime(self.config)

    def test_unregistered_worker_count_is_rejected(self) -> None:
        with self.assertRaises(Phase2Error):
            parallel_config(self.config, 3)

    def test_continuation_only_occurs_at_active_ceiling(self) -> None:
        active = {"rounds_completed": 1200, "best_iteration": 1198}
        stopped = {"rounds_completed": 1315, "best_iteration": 1193}
        complete = {"rounds_completed": 2000, "best_iteration": 1999}
        self.assertTrue(fold_needs_training(active, self.config))
        self.assertFalse(fold_needs_training(stopped, self.config))
        self.assertFalse(fold_needs_training(complete, self.config))

    def test_spawn_scheduler_starts_two_independent_workers(self) -> None:
        context = multiprocessing.get_context("spawn")
        with concurrent.futures.ProcessPoolExecutor(
            max_workers=2, mp_context=context
        ) as executor:
            results = list(executor.map(scheduler_probe, (0.25, 0.25)))
        self.assertEqual(len({pid for pid, _ in results}), 2)
        self.assertTrue(all(platform_name == sys.platform for _, platform_name in results))


if __name__ == "__main__":
    unittest.main()
