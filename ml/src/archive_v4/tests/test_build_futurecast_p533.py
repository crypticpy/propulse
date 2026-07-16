from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import polars as pl


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from build_futurecast_p533 import (  # noqa: E402
    apply_calibrator,
    f107_to_sunspot_number,
    fit_calibrator,
    grid_center,
    sample_sql,
)


class BuildFutureCastP533Tests(unittest.TestCase):
    def test_pins_government_f107_to_sunspot_conversion(self) -> None:
        self.assertEqual(f107_to_sunspot_number(67.0), 1)
        self.assertEqual(f107_to_sunspot_number(100.0), 48)
        self.assertEqual(f107_to_sunspot_number(200.0), 152)
        self.assertEqual(f107_to_sunspot_number(500.0), 311)
        with self.assertRaisesRegex(ValueError, "finite"):
            f107_to_sunspot_number(float("nan"))

    def test_reconstructs_maidenhead_grid_center(self) -> None:
        self.assertEqual(grid_center("EM10"), (30.5, -97.0))
        self.assertEqual(grid_center("io91"), (51.5, -1.0))
        with self.assertRaisesRegex(ValueError, "Maidenhead"):
            grid_center("BAD")

    def test_gate_sample_query_does_not_project_labels(self) -> None:
        query = sample_sql(
            [Path("/private/gate.parquet")],
            f107_feature="forecast__noaa_3_day_solar_geomagnetic__f107",
            rows_per_band_day=50,
            seed=20260716,
            include_labels=False,
        ).lower()
        self.assertIn("md5", query)
        self.assertIn("partition by cast(issue_time as date), horizon_hours, band", query)
        self.assertNotIn("success_rate", query)
        self.assertNotIn("opportunities", query)

    def test_calibration_guard_can_select_isotonic_snr(self) -> None:
        rows = []
        for offset in range(15):
            day = datetime(2026, 7, 16 + offset, tzinfo=timezone.utc)
            for snr, target in ((-40.0, 0.0), (-10.0, 1.0)):
                rows.append(
                    {
                        "issue_time": day,
                        "p533_snr_db": snr,
                        "p533_raw_reliability": 0.5,
                        "success_rate": target,
                        "opportunities": 10.0,
                    }
                )
        frame = pl.DataFrame(rows)
        calibrator, evidence = fit_calibrator(frame, fit_days=10, guard_days=5)
        self.assertEqual(calibrator["method"], "isotonic_snr")
        self.assertEqual(evidence["selected"], "isotonic_snr")
        prediction = apply_calibrator(frame, calibrator)
        self.assertTrue(np.all((prediction >= 0) & (prediction <= 1)))


if __name__ == "__main__":
    unittest.main()
