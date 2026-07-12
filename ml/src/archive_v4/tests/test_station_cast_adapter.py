from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(MODULE))

from station_cast_adapter import apply_station_physics_adapter  # noqa: E402


class StationCastParityTests(unittest.TestCase):
    def test_shared_golden_fixtures(self) -> None:
        fixture = json.loads((ROOT / "ml/fixtures/station_cast_v1.json").read_text())
        for case in fixture["cases"]:
            result = apply_station_physics_adapter(
                case["coreProbability"],
                case["coreConfidence"],
                case["coreReferencePowerWatts"],
                case["envelope"],
            )
            for key, expected in case["expected"].items():
                self.assertAlmostEqual(result[key], expected, places=10)


if __name__ == "__main__":
    unittest.main()
