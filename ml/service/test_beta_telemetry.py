from __future__ import annotations

import copy
import math
import unittest
from datetime import datetime, timezone

import httpx

from beta_telemetry import (
    PostgrestBetaTelemetryRecorder,
    PrivacyBoundaryViolation,
    emit_shadow_telemetry,
    station_envelope_stop_counts,
    validate_shadow_telemetry_privacy,
    validate_telemetry_counts,
)


class RecordingSink:
    configured = True

    def __init__(self) -> None:
        self.events = []

    def record(self, counts, *, observed_at=None) -> None:
        self.events.append((dict(counts), observed_at))


def station() -> dict:
    conducted = 25.0
    loss = 1.0
    gain = 7.1
    at_antenna = conducted * math.pow(10, -loss / 10)
    eirp = at_antenna * math.pow(10, gain / 10)
    return {
        "featureContract": "station-chain-v1",
        "chainFingerprint": "fnv1a64:0123456789abcdef",
        "band": "20m",
        "frequencyMHz": 14.15,
        "mode": "WSPR",
        "requestedPowerWatts": 25.0,
        "conductedPowerWatts": conducted,
        "powerAtAntennaWatts": at_antenna,
        "eirpWatts": eirp,
        "erpWatts": eirp / math.pow(10, 2.15 / 10),
        "totalPassiveLossDb": loss,
        "feedlineLossDb": 0.8,
        "inlineLossDb": 0.2,
        "amplifierGainDb": 0.0,
        "antennaGainTowardPathDbi": gain,
        "targetBearingDeg": 90.0,
        "takeoffAngleDeg": None,
        "receiverNoiseFloorDbm": -135.0,
        "receiverEvidence": "independent_test",
        "receiverEvidenceIsRelative": True,
        "localSystemNoiseFloorDbm": None,
        "modeBandwidthHz": 6.0,
        "modeSnrThresholdDb": -28.0,
        "supported": True,
        "warningCodes": [],
        "assumptions": ["local_noise_not_measured"],
    }


def telemetry_event() -> dict:
    return {
        "schema_version": "propagation-shadow-v1",
        "event_type": "propagation_inference_completed",
        "inference_mode": "active",
        "request_kind": "path",
        "receipt_time": "2026-07-16T12:00:01+00:00",
        "issue_time": "2026-07-16T12:00:00+00:00",
        "valid_time": "2026-07-16T12:00:00+00:00",
        "band": "20m",
        "mode": "WSPR",
        "cell_count": 1,
        "model_version": "archive-v4.2-a6-v1",
        "feature_contract": "archive-v4-features-v1",
        "station_feature_contract": "station-chain-v1",
        "path_history_provider": "approved-provider-v1",
        "path_history_transform_version": "wspr-opportunity-duckdb-v1",
        "operational_weather_provider": "solar-snapshots-v1",
        "profile_counts": {"nowcast": 1},
        "source_freshness": {
            "path_history_seconds": 60,
            "path_history_stale": False,
            "space_weather_seconds": 120,
        },
        "ood_flag_counts": {},
        "core_probability_summary": {
            "minimum": 0.4,
            "mean": 0.4,
            "maximum": 0.4,
        },
        "personalized_probability_summary": {
            "minimum": 0.5,
            "mean": 0.5,
            "maximum": 0.5,
        },
        "confidence_summary": {
            "minimum": 0.8,
            "mean": 0.8,
            "maximum": 0.8,
        },
        "latency_ms": 3.5,
    }


class BetaTelemetryTests(unittest.TestCase):
    def test_counter_and_postgrest_contract_are_exact(self) -> None:
        requests = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(204)

        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            recorder = PostgrestBetaTelemetryRecorder(
                "https://store.example.test",
                "service-key",
                client=client,
            )
            recorder.record(
                {"equipment_math_events": 1},
                observed_at=datetime(2026, 7, 16, 12, tzinfo=timezone.utc),
            )
        self.assertEqual(len(requests), 1)
        self.assertTrue(
            requests[0].url.path.endswith(
                "/rest/v1/rpc/record_propagation_beta_telemetry"
            )
        )
        self.assertIn(b'"equipment_math_events":1', requests[0].content)
        with self.assertRaises(ValueError):
            validate_telemetry_counts({"user_id": 1})
        with self.assertRaises(ValueError):
            validate_telemetry_counts({"privacy_events": True})

    def test_station_math_and_unsupported_support_are_independent(self) -> None:
        valid = station()
        self.assertEqual(
            station_envelope_stop_counts(
                valid,
                request_band="20m",
                request_mode="WSPR",
                request_declared_power_watts=25,
            ),
            {},
        )
        invalid_math = copy.deepcopy(valid)
        invalid_math["eirpWatts"] *= 2
        self.assertEqual(
            station_envelope_stop_counts(
                invalid_math,
                request_band="20m",
                request_mode="WSPR",
                request_declared_power_watts=25,
            ),
            {"equipment_math_events": 1},
        )
        unsupported_claim = copy.deepcopy(valid)
        unsupported_claim["warningCodes"] = ["radio_band_unsupported"]
        self.assertEqual(
            station_envelope_stop_counts(
                unsupported_claim,
                request_band="20m",
                request_mode="WSPR",
                request_declared_power_watts=25,
            ),
            {"unsupported_support_events": 1},
        )
        six_meter_claim = copy.deepcopy(valid)
        six_meter_claim.update({"band": "6m", "frequencyMHz": 50.1})
        self.assertEqual(
            station_envelope_stop_counts(
                six_meter_claim,
                request_band="6m",
                request_mode="WSPR",
                request_declared_power_watts=25,
            ),
            {"unsupported_support_events": 1},
        )

    def test_private_shadow_event_is_counted_before_emission(self) -> None:
        safe = telemetry_event()
        validate_shadow_telemetry_privacy(safe)
        emitted = []
        recorder = RecordingSink()
        unsafe = {**safe, "origin_grid4": "EM10"}

        with self.assertRaises(PrivacyBoundaryViolation):
            emit_shadow_telemetry(
                unsafe,
                sink=emitted.append,
                beta_recorder=recorder,
                beta_collection_enabled=True,
            )

        self.assertEqual(emitted, [])
        self.assertEqual(recorder.events[0][0], {"privacy_events": 1})


if __name__ == "__main__":
    unittest.main()
