from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from replay_live_feature_pipeline import (  # noqa: E402
    ReplayStore,
    compare_features,
    stratified_utc_hours,
)


class LiveFeatureReplayTests(unittest.TestCase):
    def test_stratified_hours_cover_every_utc_hour_deterministically(self):
        start = datetime(2024, 10, 1, tzinfo=timezone.utc)
        values = [start + timedelta(hours=hour) for hour in range(24 * 5)]
        first = stratified_utc_hours(values)
        second = stratified_utc_hours(reversed(values))
        self.assertEqual(first, second)
        self.assertEqual(len(first), 24)
        self.assertEqual(sorted(value.hour for value in first), list(range(24)))
        self.assertGreater(first[-1] - first[0], timedelta(days=3))

    def test_replay_store_deduplicates_and_filters_receipt_cutoff(self):
        store = ReplayStore()
        target = datetime(2024, 10, 1, 1, tzinfo=timezone.utc)
        rows = [
            {
                "observation_key_sha256": str(index),
                "target_hour": target.isoformat(),
                "band": "20m",
                "source": "fixture",
                "received_at": (target + timedelta(hours=1, minutes=index)).isoformat(),
            }
            for index in range(3)
        ]
        store.insert_observation_page(rows)
        store.insert_observation_page(rows[:1])
        self.assertEqual(store.insert_attempts, 4)
        self.assertEqual(len(store.observations), 3)
        pages = list(store.observation_pages(
            target_hour=target,
            band="20m",
            provider="fixture",
            available_at=target + timedelta(hours=1, minutes=1),
            page_size=1,
        ))
        self.assertEqual(sum(map(len, pages)), 2)

    def test_feature_comparison_enforces_keys_and_numeric_tolerance(self):
        expected = {("AA00", "BB11"): {
            "successes": 1.0,
            "opportunities": 3.0,
            "success_rate": 1 / 3,
            "sampled_rows": 2.0,
            "positive_rows": 1.0,
        }}
        actual = {key: dict(value) for key, value in expected.items()}
        actual[("AA00", "BB11")]["success_rate"] += 5e-13
        self.assertTrue(compare_features(actual, expected)["within_tolerance"])
        actual[("AA00", "BB11")]["success_rate"] += 1e-10
        self.assertFalse(compare_features(actual, expected)["within_tolerance"])


if __name__ == "__main__":
    unittest.main()
