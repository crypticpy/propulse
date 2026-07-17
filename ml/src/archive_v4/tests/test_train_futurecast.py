from __future__ import annotations

import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

import numpy as np


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from train_futurecast import (  # noqa: E402
    apply_calibrator,
    calibration_groups,
    fit_guarded_isotonic,
    partition_records,
    validate_calibration_sample_sizes,
)


def records() -> list[dict[str, object]]:
    start = date(2026, 7, 16)
    rows = []
    for offset in range(90):
        split = "train" if offset < 60 else "calibration" if offset < 75 else "gate"
        issue_day = start + timedelta(days=offset)
        rows.append(
            {
                "path": f"/private/h3-{issue_day}.parquet",
                "issue_time": f"{issue_day}T12:30:00+00:00",
                "horizon_hours": 3,
                "split": split,
            }
        )
    return rows


class TrainFutureCastTests(unittest.TestCase):
    def test_gate_partitions_are_separate_from_training_and_calibration(self) -> None:
        manifest = {"partitions": records()}
        train = partition_records(manifest, horizon=3, split="train")
        calibration = partition_records(manifest, horizon=3, split="calibration")
        gate = partition_records(manifest, horizon=3, split="gate")
        self.assertEqual((len(train), len(calibration), len(gate)), (60, 15, 15))
        self.assertTrue(set(row["path"] for row in train).isdisjoint(
            row["path"] for row in gate
        ))

    def test_calibration_subsplit_is_five_issue_days_each(self) -> None:
        calibration = [row for row in records() if row["split"] == "calibration"]
        groups = calibration_groups(
            calibration,
            {"early_stopping": 5, "isotonic_fit": 5, "identity_guard": 5},
        )
        self.assertEqual({name: len(paths) for name, paths in groups.items()}, {
            "early_stopping": 5,
            "isotonic_fit": 5,
            "identity_guard": 5,
        })
        self.assertTrue(set(groups["early_stopping"]).isdisjoint(groups["identity_guard"]))

    def test_identity_guard_rejects_harmful_isotonic(self) -> None:
        calibrator, metrics = fit_guarded_isotonic(
            fit_prediction=np.array([0.1, 0.9]),
            fit_target=np.array([0.9, 0.1]),
            fit_weight=np.ones(2),
            guard_prediction=np.array([0.1, 0.9]),
            guard_target=np.array([0.1, 0.9]),
            guard_weight=np.ones(2),
        )
        self.assertEqual(calibrator["method"], "identity")
        self.assertLess(
            metrics["identity"]["weighted_brier"],
            metrics["isotonic"]["weighted_brier"],
        )

    def test_identity_guard_selects_helpful_isotonic(self) -> None:
        calibrator, metrics = fit_guarded_isotonic(
            fit_prediction=np.array([0.1, 0.2, 0.8, 0.9]),
            fit_target=np.array([0.0, 0.0, 1.0, 1.0]),
            fit_weight=np.ones(4),
            guard_prediction=np.array([0.2, 0.8]),
            guard_target=np.array([0.0, 1.0]),
            guard_weight=np.ones(2),
        )
        self.assertEqual(calibrator["method"], "isotonic")
        calibrated = apply_calibrator(np.array([0.2, 0.8]), calibrator)
        self.assertTrue(np.allclose(calibrated, [0.0, 1.0]))
        self.assertLess(
            metrics["isotonic"]["weighted_brier"],
            metrics["identity"]["weighted_brier"],
        )

    def test_calibration_subsplits_enforce_frozen_row_minimum(self) -> None:
        validate_calibration_sample_sizes(10_000, 10_000, 10_000)
        with self.assertRaisesRegex(RuntimeError, "row minimum"):
            validate_calibration_sample_sizes(9_999, 10_000, 10_000)


if __name__ == "__main__":
    unittest.main()
