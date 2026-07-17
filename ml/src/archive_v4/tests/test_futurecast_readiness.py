from __future__ import annotations

import sys
import unittest
from datetime import date
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from assess_futurecast_readiness import (  # noqa: E402
    assess,
    consecutive_day_runs,
    first_qualifying_window,
)


class FutureCastReadinessTests(unittest.TestCase):
    def test_freezes_the_first_qualifying_consecutive_window(self) -> None:
        days = {
            date(2026, 7, 1),
            date(2026, 7, 2),
            date(2026, 7, 5),
            date(2026, 7, 6),
            date(2026, 7, 7),
            date(2026, 7, 8),
        }
        self.assertEqual(
            consecutive_day_runs(days),
            [
                (date(2026, 7, 1), date(2026, 7, 2)),
                (date(2026, 7, 5), date(2026, 7, 8)),
            ],
        )
        self.assertEqual(
            first_qualifying_window(days, 3),
            (date(2026, 7, 5), date(2026, 7, 7)),
        )

    @staticmethod
    def capture(source: str, day: int, *, captured_hour: int = 6) -> dict[str, object]:
        return {
            "source": source,
            "issued_at": f"2026-07-{day:02d}T00:00:00+00:00",
            "captured_at": f"2026-07-{day:02d}T{captured_hour:02d}:00:00+00:00",
            "sha256": f"{day:064x}",
            "horizons_covered": [3, 6, 12, 24],
        }

    def test_withholds_horizons_without_issued_history(self) -> None:
        result = assess(
            [
                self.capture("noaa_45_day", 12),
                self.capture("noaa_3_day", 12),
            ],
            minimum_days=90,
        )
        self.assertFalse(result["issued_forecast_training_ready"])
        self.assertTrue(all(
            row["status"] == "withheld_insufficient_issued_history"
            for row in result["horizons"].values()
        ))

    def test_marks_development_ready_only_after_both_sources_cover_window(self) -> None:
        captures = [
            self.capture(source, day)
            for source in ("noaa_45_day", "noaa_3_day")
            for day in range(1, 4)
        ]
        result = assess(captures, minimum_days=3)
        self.assertTrue(result["issued_forecast_training_ready"])
        self.assertEqual(
            result["horizons"]["24"]["qualifying_window_start"],
            "2026-07-01",
        )
        self.assertEqual(
            result["horizons"]["24"]["qualifying_window_end"],
            "2026-07-03",
        )
        self.assertFalse(result["release_approved"])

    def test_gap_does_not_count_as_consecutive_history(self) -> None:
        captures = [
            self.capture(source, day)
            for source in ("noaa_45_day", "noaa_3_day")
            for day in (1, 2, 4)
        ]
        result = assess(captures, minimum_days=3)
        self.assertFalse(result["issued_forecast_training_ready"])
        self.assertEqual(result["horizons"]["3"]["longest_consecutive_common_days"], 2)

    def test_rejects_capture_that_predates_issuance(self) -> None:
        captures = [
            self.capture("noaa_45_day", 1, captured_hour=6),
            self.capture("noaa_3_day", 1, captured_hour=6),
            {
                **self.capture("noaa_45_day", 2),
                "captured_at": "2026-07-01T23:00:00+00:00",
            },
        ]
        result = assess(captures, minimum_days=2)
        self.assertFalse(result["issued_forecast_training_ready"])
        self.assertEqual(result["invalid_reasons"], {"capture_before_issue": 1})


if __name__ == "__main__":
    unittest.main()
