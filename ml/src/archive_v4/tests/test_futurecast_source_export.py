from __future__ import annotations

import json
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from export_futurecast_sources import (  # noqa: E402
    FORECAST_QUERY,
    HF_BANDS,
    PATH_QUERY,
    REQUIRED_SOURCE_TABLES,
    WATERMARK_QUERY,
    qualifying_window,
    validate_outcome_watermark_maturity,
)


CONFIG = json.loads(
    (Path(__file__).resolve().parents[3] / "config/futurecast_v1.json").read_text(
        encoding="utf-8"
    )
)


def readiness(*, ready: bool = True) -> dict[str, object]:
    status = "eligible_for_development" if ready else "withheld_insufficient_issued_history"
    return {
        "minimum_distinct_capture_days": 90,
        "invalid_capture_count": 0,
        "issued_forecast_training_ready": ready,
        "release_approved": False,
        "horizons": {
            str(horizon): {
                "status": status,
                "qualifying_window_start": "2026-07-16" if ready else None,
                "qualifying_window_end": "2026-10-13" if ready else None,
            }
            for horizon in (3, 6, 12, 24)
        },
    }


class FutureCastSourceExportTests(unittest.TestCase):
    def test_accepts_only_one_shared_first_qualifying_window(self) -> None:
        start, end = qualifying_window(readiness(), CONFIG)
        self.assertEqual(start, date(2026, 7, 16))
        self.assertEqual(end, date(2026, 10, 13))

        changed = readiness()
        changed["horizons"]["24"]["qualifying_window_start"] = "2026-07-17"  # type: ignore[index]
        with self.assertRaisesRegex(RuntimeError, "do not share"):
            qualifying_window(changed, CONFIG)

    def test_rejects_immature_or_invalid_history(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "not ready"):
            qualifying_window(readiness(ready=False), CONFIG)
        invalid = readiness()
        invalid["invalid_capture_count"] = 1
        with self.assertRaisesRegex(RuntimeError, "not ready"):
            qualifying_window(invalid, CONFIG)

    def test_queries_only_preregistered_aggregate_source_tables(self) -> None:
        rendered = "\n".join((FORECAST_QUERY, WATERMARK_QUERY, PATH_QUERY)).lower()
        self.assertEqual(
            REQUIRED_SOURCE_TABLES,
            (
                "public.space_weather_forecast_values",
                "public.wspr_feature_watermarks",
                "public.wspr_path_hourly_features",
            ),
        )
        for table in REQUIRED_SOURCE_TABLES:
            self.assertIn(table, rendered)
        for forbidden in (
            "wspr_observations_rolling",
            "propagation_outcomes",
            "propagation_attempts",
            "tx_call",
            "rx_call",
            "equipment",
        ):
            self.assertNotIn(forbidden, rendered)

    def test_requires_every_outcome_hour_band_watermark_before_label_export(self) -> None:
        hour = datetime(2026, 10, 14, 0, tzinfo=timezone.utc)
        rows = [
            {
                "target_hour": hour,
                "band": band,
                "available_at": hour + timedelta(hours=1, minutes=15),
                "status": "complete",
                "source_watermark": hour + timedelta(hours=1),
                "quality_flags": [],
            }
            for band in HF_BANDS
        ]
        summary = validate_outcome_watermark_maturity(
            rows,
            outcome_hours=[hour],
        )
        self.assertEqual(summary["required_hour_band_watermarks"], 10)
        with self.assertRaisesRegex(RuntimeError, "outcomes are not mature"):
            validate_outcome_watermark_maturity(
                rows[:-1],
                outcome_hours=[hour],
            )


if __name__ == "__main__":
    unittest.main()
