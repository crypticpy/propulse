from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path

import polars as pl


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from train_6m_validation import MECHANISMS, add_mechanism  # noqa: E402


class MechanismRoutingTests(unittest.TestCase):
    def test_frozen_router_covers_every_declared_mechanism(self) -> None:
        frame = pl.DataFrame(
            {
                "target_hour": [
                    datetime(2024, 1, 1),
                    datetime(2024, 4, 1),
                    datetime(2024, 1, 1),
                    datetime(2024, 1, 1),
                    datetime(2024, 1, 1),
                    datetime(2024, 1, 1),
                ],
                "kp": [4.0, 1.0, 1.0, 1.0, 1.0, 1.0],
                "mid_lat": [45.0, 45.0, 45.0, 10.0, 45.0, 45.0],
                "dist_km": [1500.0, 1500.0, 500.0, 3000.0, 1500.0, 5000.0],
                "f107": [100.0, 100.0, 100.0, 160.0, 100.0, 100.0],
            }
        )

        routed = add_mechanism(frame)["mechanism"].to_list()

        self.assertEqual(routed, list(MECHANISMS))

    def test_auroral_precedence_is_stable_during_es_season(self) -> None:
        frame = pl.DataFrame(
            {
                "target_hour": [datetime(2024, 7, 1)],
                "kp": [5.0],
                "mid_lat": [50.0],
                "dist_km": [1200.0],
                "f107": [140.0],
            }
        )

        self.assertEqual(add_mechanism(frame)["mechanism"].item(), "auroral")


if __name__ == "__main__":
    unittest.main()
