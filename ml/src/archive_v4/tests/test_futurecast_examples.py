from __future__ import annotations

import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from futurecast_examples import (  # noqa: E402
    FEATURES,
    build_issued_forecast_features,
    feature_name,
)


ISSUE = "2026-07-16T12:00:00+00:00"


def rows_for_horizon(horizon: int) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for (product, metric), cadence in FEATURES.items():
        target_hour = 12 + horizon
        day = 16 + target_hour // 24
        hour = target_hour % 24
        if cadence == 24:
            hour = 0
        else:
            hour = hour - hour % 3
        rows.append({
            "product": product,
            "metric": metric,
            "issued_at": "2026-07-16T00:00:00+00:00",
            "available_at": "2026-07-16T10:00:00+00:00",
            "valid_at": f"2026-07-{day:02d}T{hour:02d}:00:00+00:00",
            "payload_sha256": "a" * 64,
            "value": float(horizon),
            "quality": "forecast",
        })
    return rows


class FutureCastExampleTests(unittest.TestCase):
    def test_builds_complete_direct_horizon_examples(self) -> None:
        for horizon in (3, 6, 12, 24):
            with self.subTest(horizon=horizon):
                result = build_issued_forecast_features(
                    rows_for_horizon(horizon),
                    issue_time=ISSUE,
                    horizon_hours=horizon,
                )
                self.assertTrue(result["complete"])
                self.assertEqual(len(result["values"]), len(FEATURES))
                self.assertEqual(result["horizon_hours"], horizon)

    def test_rejects_future_issuance_and_future_availability(self) -> None:
        rows = rows_for_horizon(3)
        target = rows[0]
        rows.extend([
            {**target, "issued_at": "2026-07-16T13:00:00+00:00", "value": 999.0},
            {**target, "available_at": "2026-07-16T12:00:01+00:00", "value": 888.0},
        ])
        result = build_issued_forecast_features(
            rows,
            issue_time=ISSUE,
            horizon_hours=3,
        )
        self.assertTrue(result["complete"])
        self.assertEqual(
            result["values"][feature_name(str(target["product"]), str(target["metric"]))],
            3.0,
        )

    def test_marks_example_incomplete_when_a_required_metric_is_missing(self) -> None:
        rows = rows_for_horizon(6)[1:]
        result = build_issued_forecast_features(
            rows,
            issue_time=ISSUE,
            horizon_hours=6,
        )
        self.assertFalse(result["complete"])
        self.assertEqual(len(result["missing_features"]), 1)

    def test_rejects_recursive_or_unsupported_horizons(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported FutureCast horizon"):
            build_issued_forecast_features(
                [],
                issue_time=ISSUE,
                horizon_hours=9,
            )


if __name__ == "__main__":
    unittest.main()
