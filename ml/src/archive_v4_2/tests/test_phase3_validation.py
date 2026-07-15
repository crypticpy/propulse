from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from validate_phase3_candidate import percentile_ms, scan_privacy  # noqa: E402


class Phase3ValidationTests(unittest.TestCase):
    def test_privacy_scan_detects_nested_private_key(self) -> None:
        self.assertEqual(
            scan_privacy({"profile": {"radio_id": "secret"}}),
            ["root.profile.radio_id"],
        )
        self.assertEqual(scan_privacy({"model": {"features": ["dist_km"]}}), [])
        self.assertEqual(
            scan_privacy({"note": "contains call_sign data"}),
            ["root.note"],
        )

    def test_latency_percentile_is_reported_in_milliseconds(self) -> None:
        self.assertAlmostEqual(percentile_ms([0.001, 0.002, 0.003], 0.5), 2.0)


if __name__ == "__main__":
    unittest.main()
