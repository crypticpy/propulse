from __future__ import annotations

import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from build_balanced_sample import allocate_quotas  # noqa: E402
from scoped_config import scoped_config  # noqa: E402


class ScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = {
            "run_id": "v4",
            "splits": {
                "train": ["2018-01", "2018-04"],
                "validation": ["2024-01"],
                "locked_archive_test": ["2025-01"],
            },
            "months": [],
            "train": {"months": []},
            "validation": {"months": []},
            "test": {"months": []},
        }

    def test_development_scope_cannot_include_locked_months(self) -> None:
        value = scoped_config(self.config, "development")
        self.assertEqual(value["months"], ["2018-01", "2018-04", "2024-01"])
        self.assertEqual(value["test"]["months"], [])
        self.assertNotIn("2025-01", value["months"])

    def test_locked_scope_contains_only_frozen_test(self) -> None:
        value = scoped_config(self.config, "locked-archive")
        self.assertEqual(value["months"], ["2025-01"])
        self.assertEqual(value["train"]["months"], [])
        self.assertEqual(value["run_id"], "v4_locked_archive")
        self.assertEqual(value["space_weather_run_id"], "v4")


class AllocationTests(unittest.TestCase):
    def test_quota_is_exact_bounded_and_deterministic(self) -> None:
        counts = [2, 5, 20, 100]
        first = allocate_quotas(counts, 50)
        self.assertEqual(first, allocate_quotas(counts, 50))
        self.assertEqual(sum(first), 50)
        self.assertTrue(all(0 <= quota <= count for quota, count in zip(first, counts)))

    def test_nested_caps_produce_nested_quotas(self) -> None:
        counts = [1, 3, 10, 100]
        small = allocate_quotas(counts, 20)
        large = allocate_quotas(counts, 80)
        self.assertTrue(all(left <= right for left, right in zip(small, large)))


if __name__ == "__main__":
    unittest.main()
