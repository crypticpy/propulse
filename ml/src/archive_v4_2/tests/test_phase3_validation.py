from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(MODULE))
sys.path.insert(0, str(SERVICE))

from validate_phase3_candidate import (  # noqa: E402
    ValidationPathHistoryProvider,
    percentile_ms,
    scan_privacy,
)
from package_phase3_candidate import PATH_HISTORY_CONTRACT_V2  # noqa: E402
from path_history import path_history_contract_mismatch  # noqa: E402


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


class ValidationPathHistoryProviderContractTests(unittest.TestCase):
    """#306 "A7 contract assertion": the v2 fixture must satisfy the real
    path_history_contract_mismatch() check create_app() runs at startup, not
    just a stand-in isinstance() check."""

    def test_v2_fixture_satisfies_the_real_contract_mismatch_check(self) -> None:
        provider = ValidationPathHistoryProvider({}, 0, v2=True)
        self.assertIsNone(
            path_history_contract_mismatch(
                "archive-v4-features-v2",
                dict(PATH_HISTORY_CONTRACT_V2),
                provider=provider,
            )
        )

    def test_v2_fixture_statistic_tracks_the_packaged_contract(self) -> None:
        # Sourced from PATH_HISTORY_CONTRACT_V2, not a literal, so a future
        # change to the packaged statistic can't silently desync from this
        # validation fixture.
        provider = ValidationPathHistoryProvider({}, 0, v2=True)
        self.assertEqual(provider.statistic, PATH_HISTORY_CONTRACT_V2["statistic"])

    def test_v1_fixture_is_unaffected(self) -> None:
        provider = ValidationPathHistoryProvider({}, 0, v2=False)
        self.assertIsNone(provider.statistic)
        self.assertEqual(provider.name, "phase3-validation-fixture")


if __name__ == "__main__":
    unittest.main()
