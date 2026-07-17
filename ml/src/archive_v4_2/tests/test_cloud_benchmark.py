from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from benchmark_cloud_inference import grid4s, percentile, station, summary


class CloudBenchmarkTests(unittest.TestCase):
    def test_percentile_uses_nearest_rank(self) -> None:
        self.assertEqual(percentile([4, 1, 3, 2], 0.95), 4)

    def test_summary_reports_latency_and_rate(self) -> None:
        result = summary([1, 2, 3, 4])
        self.assertEqual(result["median_ms"], 2.5)
        self.assertEqual(result["p95_ms"], 4)
        self.assertEqual(result["max_ms"], 4)
        self.assertEqual(result["requests_per_second"], 400)

    def test_grid_generation_is_unique_and_valid(self) -> None:
        values = grid4s(4096)
        self.assertEqual(len(values), 4096)
        self.assertEqual(len(set(values)), 4096)
        self.assertTrue(all(len(value) == 4 for value in values))
        self.assertTrue(all(value[:2].isalpha() for value in values))
        self.assertTrue(all(value[2:].isdigit() for value in values))

    def test_station_power_chain_is_internally_consistent(self) -> None:
        value = station()
        expected_antenna_power = value["conductedPowerWatts"] * math.pow(
            10,
            -value["totalPassiveLossDb"] / 10,
        )
        expected_eirp = expected_antenna_power * math.pow(
            10,
            value["antennaGainTowardPathDbi"] / 10,
        )
        self.assertAlmostEqual(value["powerAtAntennaWatts"], expected_antenna_power)
        self.assertAlmostEqual(value["eirpWatts"], expected_eirp)


if __name__ == "__main__":
    unittest.main()
