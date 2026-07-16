from __future__ import annotations

import copy
import json
import unittest
from datetime import timedelta

import numpy as np
from fastapi.testclient import TestClient

from path_history import (
    DEFAULT_PATH_TRANSFORM_VERSION,
    UnavailablePathHistoryProvider,
    VerifiedPathHistory,
)
from operational_weather import (
    UnavailableOperationalWeatherProvider,
    VerifiedOperationalWeather,
)

from app import (
    RuntimePrediction,
    allowlisted_telemetry_dimension,
    blend_probabilities,
    create_app,
    model_feature_value,
    research_receipt_signature,
    resolve_inference_mode,
    resolve_xgboost_prediction_threads,
)


class FakeRegistry:
    def __init__(self):
        self.batch_sizes = []
        self.path_history_stale_after_seconds = 7200
        self.feature_contract = "station-chain-v1"
        self.core_feature_contract = "archive-v4-features-test-v1"
        self.last_values = []

    def predict(self, values, band, stale_history):
        self.last_values.append(dict(values))
        return RuntimePrediction(
            probability=0.4,
            confidence=0.8,
            model_version="v4-test",
            profile="physics" if stale_history else "nowcast",
            ood_flags=["recent_network_stale_physics_fallback"] if stale_history else [],
            top_factors=["sun_elev_mid"],
        )

    def predict_many(self, rows, bands, stale_history):
        self.batch_sizes.append(len(rows))
        return [
            self.predict(values, band, stale_history)
            for values, band in zip(rows, bands)
        ]

    def models(self):
        return [{"model_version": "v4-test"}]

    def health(self):
        return {"status": "ok", "model_version": "v4-test"}


class FakePathHistoryProvider:
    name = "approved-fixture"
    transform_version = DEFAULT_PATH_TRANSFORM_VERSION

    def __init__(self, age_seconds=60, quality_flags=(), future_available=False):
        self.age_seconds = age_seconds
        self.quality_flags = tuple(quality_flags)
        self.future_available = future_available
        self.lookups = []

    def lookup(self, *, issue_time, band, origin_grid4, target_grid4s):
        self.lookups.append((issue_time, band, origin_grid4, list(target_grid4s)))
        available_at = issue_time + timedelta(seconds=1) if self.future_available else issue_time
        return {
            target: VerifiedPathHistory(
                target_grid4=target,
                path_success_prev1=0.1,
                path_success_prev2=0.2,
                path_success_prev3=0.3,
                path_success_prev24=0.4,
                path_prev1_available=1,
                path_prev2_available=1,
                path_prev3_available=1,
                path_prev24_available=1,
                source_watermark=issue_time - timedelta(seconds=self.age_seconds),
                available_at=available_at,
                provider=self.name,
                transform_version=self.transform_version,
                quality_flags=self.quality_flags,
            )
            for target in target_grid4s
        }


class FakeOperationalWeatherProvider:
    name = "solar-snapshots-v1"

    def __init__(self, age_seconds=60, future_available=False):
        self.age_seconds = age_seconds
        self.future_available = future_available

    def lookup(self, *, issue_time):
        available_at = issue_time + timedelta(seconds=1) if self.future_available else issue_time
        return VerifiedOperationalWeather(
            values={"kp": 2.0, "f107": 155.0, "kp_max_24h": 3.0},
            source_watermark=issue_time - timedelta(seconds=self.age_seconds),
            available_at=available_at,
        )


def request_payload():
    return {
        "origin_grid4": "EM10",
        "issue_time": "2026-07-12T08:00:00Z",
        "valid_time": "2026-07-12T08:00:00Z",
        "band": "20m",
        "mode": "WSPR",
        "declared_power_watts": 25,
        "features": {"target_grid4": "IO91", "values": {"band_mhz": 14.1}},
        "station": {
            "featureContract": "station-chain-v1",
            "chainFingerprint": "fixture:test",
            "band": "20m",
            "frequencyMHz": 14.1,
            "mode": "WSPR",
            "requestedPowerWatts": 25,
            "conductedPowerWatts": 25,
            "powerAtAntennaWatts": 20,
            "eirpWatts": 100,
            "erpWatts": 60.95,
            "totalPassiveLossDb": 1,
            "feedlineLossDb": 0.8,
            "inlineLossDb": 0.2,
            "amplifierGainDb": 0,
            "antennaGainTowardPathDbi": 6.99,
            "targetBearingDeg": 90,
            "takeoffAngleDeg": None,
            "receiverNoiseFloorDbm": -135,
            "receiverEvidence": "independent_test",
            "receiverEvidenceIsRelative": True,
            "localSystemNoiseFloorDbm": None,
            "modeBandwidthHz": 6,
            "modeSnrThresholdDb": -28,
            "supported": True,
            "warningCodes": [],
            "assumptions": ["local_noise_not_measured"],
        },
        "research_subject_binding": {
            "schema_version": "propagation-research-subject-v1",
            "expires_at": "2026-07-12T10:00:00Z",
            "hmac_sha256": "a" * 64,
        },
        "data_freshness_seconds": {"path_history": 60},
    }


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.registry = FakeRegistry()
        self.client = TestClient(create_app(
            self.registry,
            inference_mode="disabled",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=UnavailableOperationalWeatherProvider(),
        ))

    def test_path_applies_station_envelope(self):
        response = self.client.post("/v1/propagation/path", json=request_payload())
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["core_probability"], 0.4)
        self.assertGreater(body["personalized_probability"], body["core_probability"])
        self.assertEqual(body["model_version"], "v4-test")
        self.assertNotIn("research_receipt", body)

    def test_active_path_emits_a_signed_minimized_research_receipt(self):
        secret = "test-research-receipt-secret-at-least-32-chars"
        client = TestClient(create_app(
            self.registry,
            inference_mode="active",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=UnavailableOperationalWeatherProvider(),
            research_receipt_secret=secret,
        ))
        response = client.post("/v1/propagation/path", json=request_payload())
        self.assertEqual(response.status_code, 200)
        receipt = response.json()["research_receipt"]
        payload = json.loads(receipt["signed_payload"])

        self.assertEqual(payload["schema_version"], "propagation-research-receipt-v1")
        self.assertEqual(payload["model_version"], "v4-test")
        self.assertEqual(payload["feature_contract"], "archive-v4-features-test-v1")
        self.assertEqual(payload["station_feature_contract"], "station-chain-v1")
        self.assertEqual(payload["chain_fingerprint"], "fixture:test")
        self.assertEqual(payload["origin_grid4"], "EM10")
        self.assertEqual(payload["target_grid4"], "IO91")
        self.assertNotIn("station", payload)
        self.assertNotIn("values", payload)
        self.assertNotIn("callsign", str(payload).lower())
        self.assertEqual(
            payload["research_subject_binding"]["schema_version"],
            "propagation-research-subject-v1",
        )
        self.assertEqual(
            receipt["hmac_sha256"],
            research_receipt_signature(receipt["signed_payload"], secret),
        )

        health = client.get("/v1/propagation/health").json()
        self.assertTrue(health["research_receipts_enabled"])
        self.assertEqual(
            health["research_receipt_schema_version"],
            "propagation-research-receipt-v1",
        )

    def test_shadow_mode_never_emits_research_receipts(self):
        client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=UnavailableOperationalWeatherProvider(),
            research_receipt_secret="test-research-receipt-secret-at-least-32-chars",
        ))
        response = client.post("/v1/propagation/path", json=request_payload())
        self.assertNotIn("research_receipt", response.json())
        self.assertFalse(client.get("/v1/propagation/health").json()["research_receipts_enabled"])

    def test_active_path_without_subject_binding_never_emits_a_receipt(self):
        payload = request_payload()
        del payload["research_subject_binding"]
        client = TestClient(create_app(
            self.registry,
            inference_mode="active",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=UnavailableOperationalWeatherProvider(),
            research_receipt_secret="test-research-receipt-secret-at-least-32-chars",
        ))
        response = client.post("/v1/propagation/path", json=payload)
        self.assertNotIn("research_receipt", response.json())

    def test_research_receipt_secret_fails_closed_when_too_short(self):
        with self.assertRaisesRegex(RuntimeError, "at least 32 characters"):
            create_app(
                self.registry,
                inference_mode="active",
                research_receipt_secret="short",
            )

    def test_missing_model_features_match_training_imputation(self):
        self.assertEqual(model_feature_value(None), 0.0)
        self.assertEqual(model_feature_value(0), 0.0)

    def test_serving_threads_default_to_manifest_and_allow_explicit_override(self):
        self.assertEqual(
            resolve_xgboost_prediction_threads(
                {"xgboost_prediction_threads": 2}, None
            ),
            (2, "manifest"),
        )
        self.assertEqual(
            resolve_xgboost_prediction_threads(
                {"xgboost_prediction_threads": 2}, "4"
            ),
            (4, "environment"),
        )
        with self.assertRaisesRegex(RuntimeError, "between 1 and 64"):
            resolve_xgboost_prediction_threads({}, "0")

    def test_inference_mode_is_strict_and_health_reports_it(self):
        self.assertEqual(resolve_inference_mode("off"), "disabled")
        self.assertEqual(resolve_inference_mode("shadow"), "shadow")
        self.assertEqual(allowlisted_telemetry_dimension("am", {"AM"}), "AM")
        self.assertEqual(
            allowlisted_telemetry_dimension("private", {"AM"}), "other"
        )
        with self.assertRaisesRegex(RuntimeError, "disabled, shadow, or active"):
            resolve_inference_mode("maybe")
        client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=UnavailablePathHistoryProvider(),
        ))
        body = client.get("/v1/propagation/health").json()
        self.assertEqual(body["inference_mode"], "shadow")
        self.assertEqual(body["telemetry_schema_version"], "propagation-shadow-v1")

    def test_weighted_ensemble_probability_is_exact(self):
        output = blend_probabilities(
            [np.asarray([0.2, 0.8]), np.asarray([0.6, 0.4])],
            [0.75, 0.25],
        )
        np.testing.assert_allclose(output, np.asarray([0.3, 0.7]))

    def test_weighted_ensemble_rejects_invalid_weights(self):
        with self.assertRaises(ValueError):
            blend_probabilities(
                [np.asarray([0.2]), np.asarray([0.6])],
                [0.8, 0.3],
            )

    def test_raw_equipment_fields_are_rejected(self):
        payload = request_payload()
        payload["station"]["radioId"] = "private-id"
        response = self.client.post("/v1/propagation/path", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_stale_history_selects_physics_fallback(self):
        payload = request_payload()
        fresh_client = TestClient(create_app(
            self.registry,
            inference_mode="disabled",
            path_history_provider=FakePathHistoryProvider(age_seconds=7200),
        ))
        response = fresh_client.post("/v1/propagation/path", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"], "nowcast")

        stale_client = TestClient(create_app(
            self.registry,
            inference_mode="disabled",
            path_history_provider=FakePathHistoryProvider(age_seconds=7201),
        ))
        response = stale_client.post("/v1/propagation/path", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"], "physics")

    def test_client_cannot_forge_fresh_path_history(self):
        payload = request_payload()
        payload["features"]["values"].update({
            "path_success_prev1": 0.99,
            "path_prev1_available": 1,
        })
        payload["data_freshness_seconds"]["path_history"] = 0
        response = self.client.post("/v1/propagation/path", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"], "physics")
        self.assertNotIn("path_history", response.json()["data_freshness"])
        self.assertEqual(self.registry.last_values[-1]["path_success_prev1"], 0.0)
        self.assertEqual(self.registry.last_values[-1]["path_prev1_available"], 0)

    def test_client_cannot_forge_operational_weather(self):
        payload = request_payload()
        payload["features"]["values"].update({"kp": 9.0, "kp_missing": 0})
        payload["data_freshness_seconds"]["space_weather"] = 0

        response = self.client.post("/v1/propagation/path", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("space_weather", response.json()["data_freshness"])
        self.assertNotIn("kp", self.registry.last_values[-1])
        self.assertEqual(self.registry.last_values[-1]["kp_missing"], 1)

    def test_server_operational_weather_replaces_client_values(self):
        payload = request_payload()
        payload["features"]["values"].update({"kp": 9.0, "kp_missing": 0})
        client = TestClient(create_app(
            self.registry,
            inference_mode="disabled",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=FakeOperationalWeatherProvider(),
        ))

        response = client.post("/v1/propagation/path", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data_freshness"]["space_weather"], 60)
        self.assertEqual(self.registry.last_values[-1]["kp"], 2.0)
        self.assertEqual(self.registry.last_values[-1]["kp_missing"], 0)
        self.assertEqual(self.registry.last_values[-1]["f107"], 155.0)

    def test_future_operational_weather_snapshot_is_rejected(self):
        client = TestClient(create_app(
            self.registry,
            inference_mode="disabled",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=FakeOperationalWeatherProvider(
                future_available=True
            ),
        ))

        response = client.post("/v1/propagation/path", json=request_payload())

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("space_weather", response.json()["data_freshness"])
        self.assertEqual(self.registry.last_values[-1]["kp_missing"], 1)

    def test_future_or_flagged_server_snapshot_fails_closed(self):
        for provider in (
            FakePathHistoryProvider(future_available=True),
            FakePathHistoryProvider(quality_flags=("coverage_low",)),
        ):
            client = TestClient(create_app(
                self.registry,
                inference_mode="disabled",
                path_history_provider=provider,
            ))
            response = client.post("/v1/propagation/path", json=request_payload())
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["profile"], "physics")

    def test_missing_or_invalid_freshness_never_selects_nowcast(self):
        payload = request_payload()
        payload.pop("data_freshness_seconds")
        response = self.client.post("/v1/propagation/path", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"], "physics")

        payload["data_freshness_seconds"] = {"path_history": -1}
        response = self.client.post("/v1/propagation/path", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_surface_scores_multiple_cells(self):
        payload = request_payload()
        payload["cells"] = [
            payload.pop("features"),
            {"target_grid4": "FN31", "values": {"band_mhz": 14.1}},
        ]
        response = self.client.post("/v1/propagation/surface", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["cells"]), 2)
        self.assertEqual(self.registry.batch_sizes, [2])

    def test_surface_applies_per_direction_station_envelopes(self):
        payload = request_payload()
        base_features = payload.pop("features")
        weak_station = copy.deepcopy(payload["station"])
        weak_station["eirpWatts"] = 5
        weak_station["antennaGainTowardPathDbi"] = -6
        strong_station = copy.deepcopy(payload["station"])
        strong_station["eirpWatts"] = 250
        strong_station["antennaGainTowardPathDbi"] = 10
        payload["cells"] = [
            {**base_features, "station": weak_station},
            {
                "target_grid4": "FN31",
                "values": {"band_mhz": 14.1},
                "station": strong_station,
            },
        ]
        response = self.client.post("/v1/propagation/surface", json=payload)
        self.assertEqual(response.status_code, 200)
        probabilities = [
            cell["personalized_probability"]
            for cell in response.json()["cells"]
        ]
        self.assertGreater(probabilities[1], probabilities[0])

    def test_shadow_telemetry_is_aggregate_and_identity_free(self):
        events = []
        client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            telemetry_sink=events.append,
            path_history_provider=FakePathHistoryProvider(),
        ))
        path_payload = request_payload()
        path_payload["band"] = "private-band-value"
        path_payload["mode"] = "K1PRIVATE"
        path_response = client.post("/v1/propagation/path", json=path_payload)
        self.assertEqual(path_response.status_code, 200)

        surface_payload = request_payload()
        surface_payload["cells"] = [
            surface_payload.pop("features"),
            {"target_grid4": "FN31", "values": {"band_mhz": 14.1}},
        ]
        surface_response = client.post(
            "/v1/propagation/surface", json=surface_payload
        )
        self.assertEqual(surface_response.status_code, 200)
        self.assertEqual([event["request_kind"] for event in events], ["path", "surface"])
        self.assertEqual(events[0]["cell_count"], 1)
        self.assertEqual(events[0]["band"], "other")
        self.assertEqual(events[0]["mode"], "other")
        self.assertEqual(events[1]["cell_count"], 2)
        self.assertEqual(
            events[1]["feature_contract"], "archive-v4-features-test-v1"
        )
        self.assertEqual(events[1]["station_feature_contract"], "station-chain-v1")
        self.assertEqual(events[1]["path_history_provider"], "approved-fixture")
        self.assertEqual(
            events[1]["path_history_transform_version"],
            DEFAULT_PATH_TRANSFORM_VERSION,
        )
        self.assertEqual(events[1]["profile_counts"], {"nowcast": 2})
        self.assertEqual(
            events[1]["core_probability_summary"],
            {"minimum": 0.4, "mean": 0.4, "maximum": 0.4},
        )
        serialized = str(events)
        for private_value in (
            "EM10",
            "IO91",
            "FN31",
            "fixture:test",
            "chainFingerprint",
            "origin_grid4",
            "target_grid4",
            "eirpWatts",
            "requestedPowerWatts",
            "receiverNoiseFloorDbm",
            "private-band-value",
            "K1PRIVATE",
        ):
            self.assertNotIn(private_value, serialized)

    def test_local_browser_preflight_is_allowed(self):
        response = self.client.options(
            "/v1/propagation/path",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:5173",
        )


if __name__ == "__main__":
    unittest.main()
