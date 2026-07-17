from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from generate_stationcast_beta_api_telemetry import (  # noqa: E402
    require_owner_only_directory,
    validate_unsigned_receipt,
)


CONFIG = json.loads(
    (ROOT / "ml/config/propagation_v4_2_beta_protocol.json").read_text(
        encoding="utf-8"
    )
)
START = datetime(2026, 8, 1, tzinfo=timezone.utc)
END = datetime(2026, 9, 1, tzinfo=timezone.utc)
COUNTS = {
    "requests": 20,
    "errors": 1,
    "integrity_errors": 0,
    "privacy_events": 0,
    "consent_errors": 0,
    "subject_binding_errors": 0,
    "stale_profile_events": 0,
    "equipment_math_events": 0,
    "unsupported_support_events": 0,
    "high_confidence_overprediction_events": 0,
    "geographic_regression_events": 0,
}


def receipt() -> dict[str, object]:
    return {
        "schema_version": 1,
        "scope": "stationcast_beta_api_telemetry",
        "protocol_version": CONFIG["protocol_version"],
        "window": {"start": START.isoformat(), "end": END.isoformat()},
        "counts": dict(COUNTS),
        "participant_data_present": False,
    }


class StationCastBetaApiTelemetryTest(unittest.TestCase):
    def test_accepts_exact_aggregate_unsigned_receipt(self) -> None:
        validate_unsigned_receipt(
            receipt(), CONFIG, window_start=START, window_end=END
        )

    def test_rejects_participant_fields_and_missing_counters(self) -> None:
        with_identity = receipt()
        with_identity["participant_id"] = "private"
        with self.assertRaisesRegex(RuntimeError, "fields"):
            validate_unsigned_receipt(
                with_identity, CONFIG, window_start=START, window_end=END
            )
        missing = receipt()
        del missing["counts"]["privacy_events"]  # type: ignore[index]
        with self.assertRaisesRegex(RuntimeError, "incomplete"):
            validate_unsigned_receipt(
                missing, CONFIG, window_start=START, window_end=END
            )

    def test_rejects_invalid_counts_and_window(self) -> None:
        invalid = receipt()
        invalid["counts"]["errors"] = 21  # type: ignore[index]
        with self.assertRaisesRegex(RuntimeError, "exceeds requests"):
            validate_unsigned_receipt(
                invalid, CONFIG, window_start=START, window_end=END
            )
        mismatched = receipt()
        mismatched["window"] = {
            "start": START.isoformat(),
            "end": datetime(2026, 9, 2, tzinfo=timezone.utc).isoformat(),
        }
        with self.assertRaisesRegex(RuntimeError, "does not match"):
            validate_unsigned_receipt(
                mismatched, CONFIG, window_start=START, window_end=END
            )

    def test_rejects_non_hour_and_oversized_windows(self) -> None:
        non_hour_start = START + timedelta(minutes=1)
        non_hour = receipt()
        non_hour["window"] = {
            "start": non_hour_start.isoformat(),
            "end": END.isoformat(),
        }
        with self.assertRaisesRegex(RuntimeError, "UTC hours"):
            validate_unsigned_receipt(
                non_hour,
                CONFIG,
                window_start=non_hour_start,
                window_end=END,
            )

        oversized_end = START + timedelta(days=181)
        oversized = receipt()
        oversized["window"] = {
            "start": START.isoformat(),
            "end": oversized_end.isoformat(),
        }
        with self.assertRaisesRegex(RuntimeError, "UTC hours"):
            validate_unsigned_receipt(
                oversized,
                CONFIG,
                window_start=START,
                window_end=oversized_end,
            )

    def test_requires_owner_only_output_directory_without_mutating_it(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            private = Path(temporary) / "private"
            require_owner_only_directory(private)
            self.assertEqual(private.stat().st_mode & 0o077, 0)

            shared = Path(temporary) / "shared"
            shared.mkdir(mode=0o755)
            os.chmod(shared, 0o755)
            with self.assertRaisesRegex(RuntimeError, "owner-only"):
                require_owner_only_directory(shared)
            self.assertEqual(shared.stat().st_mode & 0o077, 0o055)


if __name__ == "__main__":
    unittest.main()
