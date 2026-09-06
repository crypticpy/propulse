from __future__ import annotations

import copy
import json
import math
import unittest
from datetime import timedelta
from pathlib import Path

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
from runtime_activation import RuntimeActivation

from app import (
    PathRequest,
    RuntimePrediction,
    StationEnvelope,
    allowlisted_telemetry_dimension,
    beta_stop_event_for_prediction,
    build_runtime_capabilities,
    blend_probabilities,
    create_app,
    missing_feature_summary,
    model_feature_value,
    receipt_contains_raw_private_fields,
    research_receipt_signature,
    resolve_inference_mode,
    resolve_xgboost_prediction_threads,
    station_capability_classes,
)


ROOT = Path(__file__).resolve().parents[2]
CAPABILITIES_FIXTURE = json.loads(
    (ROOT / "ml/fixtures/propagation_capabilities_v1.json").read_text(
        encoding="utf-8"
    )
)
BETA_RUNTIME_ACTIVATION = RuntimeActivation(frozenset({"beta_collection"}))


class FakeRegistry:
    def __init__(self):
        self.batch_sizes = []
        self.path_history_stale_after_seconds = 7200
        self.feature_contract = "station-chain-v1"
        self.core_feature_contract = "archive-v4-features-test-v1"
        self.last_values = []
        self.missing_feature_names: list = []

    def predict(self, values, band, stale_history):
        self.last_values.append(dict(values))
        return RuntimePrediction(
            probability=0.4,
            confidence=0.8,
            model_version="v4-test",
            profile="physics" if stale_history else "nowcast",
            ood_flags=["recent_network_stale_physics_fallback"] if stale_history else [],
            top_factors=["sun_elev_mid"],
            missing_feature_names=list(self.missing_feature_names),
        )

    def predict_many(self, rows, bands, stale_history):
        self.batch_sizes.append(len(rows))
        return [
            self.predict(values, band, stale_history)
            for values, band in zip(rows, bands)
        ]

    def models(self):
        return [{
            "model_version": "v4-test",
            "feature_contract": "station-chain-v1",
            "core_feature_contract": "archive-v4-features-test-v1",
            "profiles": ["nowcast", "physics"],
            "profile_kinds": {"nowcast": "single", "physics": "single"},
        }]

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


class SpyUnavailablePathHistoryProvider(UnavailablePathHistoryProvider):
    """Records whether the no-op lookup was ever called."""

    def __init__(self):
        self.lookups = []

    def lookup(self, *, issue_time, band, origin_grid4, target_grid4s):
        self.lookups.append((issue_time, band, origin_grid4, list(target_grid4s)))
        return super().lookup(
            issue_time=issue_time,
            band=band,
            origin_grid4=origin_grid4,
            target_grid4s=target_grid4s,
        )


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


class RaisingOperationalWeatherProvider:
    name = "solar-snapshots-v1"

    def lookup(self, *, issue_time):
        raise RuntimeError("operational-weather lookup failed")


class RecordingBetaTelemetrySink:
    configured = True

    def __init__(self, *, fail=False):
        self.fail = fail
        self.events = []

    def record(self, counts, *, observed_at=None):
        if self.fail:
            raise RuntimeError("fixture telemetry failure")
        self.events.append((dict(counts), observed_at))


def set_station_path_gain(station, gain_dbi):
    power_at_antenna = station["conductedPowerWatts"] * math.pow(
        10,
        (station["amplifierGainDb"] - station["totalPassiveLossDb"]) / 10,
    )
    eirp = power_at_antenna * math.pow(10, gain_dbi / 10)
    station.update({
        "powerAtAntennaWatts": power_at_antenna,
        "eirpWatts": eirp,
        "erpWatts": eirp / math.pow(10, 2.15 / 10),
        "antennaGainTowardPathDbi": gain_dbi,
    })


def request_payload():
    payload = {
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
            "frequencyMHz": 14.15,
            "mode": "WSPR",
            "requestedPowerWatts": 25,
            "conductedPowerWatts": 25,
            "powerAtAntennaWatts": 0,
            "eirpWatts": 0,
            "erpWatts": 0,
            "totalPassiveLossDb": 1,
            "feedlineLossDb": 0.8,
            "inlineLossDb": 0.2,
            "amplifierGainDb": 0,
            "antennaGainTowardPathDbi": 7.1,
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
    set_station_path_gain(payload["station"], 7.1)
    return payload


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.registry = FakeRegistry()
        self.client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
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
        beta_sink = RecordingBetaTelemetrySink()
        client = TestClient(create_app(
            self.registry,
            inference_mode="active",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=UnavailableOperationalWeatherProvider(),
            research_receipt_secret=secret,
            beta_telemetry_sink=beta_sink,
            runtime_activation=BETA_RUNTIME_ACTIVATION,
        ))
        response = client.post("/v1/propagation/path", json=request_payload())
        self.assertEqual(response.status_code, 200)
        receipt = response.json()["research_receipt"]
        payload = json.loads(receipt["signed_payload"])

        self.assertEqual(payload["schema_version"], "propagation-research-receipt-v2")
        self.assertEqual(payload["model_version"], "v4-test")
        self.assertEqual(payload["feature_contract"], "archive-v4-features-test-v1")
        self.assertEqual(payload["station_feature_contract"], "station-chain-v1")
        self.assertEqual(payload["chain_fingerprint"], "fixture:test")
        self.assertEqual(payload["origin_grid4"], "EM10")
        self.assertEqual(payload["target_grid4"], "IO91")
        self.assertEqual(payload["profile"], "physics")
        self.assertEqual(payload["station_capability"], {
            "tx_eirp": "100_500w",
            "passive_loss": "1_3db",
            "directional_gain": "6_10dbi",
            "receiver_evidence": "relative",
            "supported": True,
        })
        capability_text = json.dumps(payload["station_capability"], sort_keys=True)
        for raw_field in (
            "eirpWatts",
            "totalPassiveLossDb",
            "antennaGainTowardPathDbi",
            "localSystemNoiseFloorDbm",
            "chainFingerprint",
        ):
            self.assertNotIn(raw_field, capability_text)
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
        self.assertEqual(health["activated_runtime_modes"], ["beta_collection"])
        self.assertTrue(health["beta_stop_event_telemetry_configured"])
        self.assertEqual(beta_sink.events, [])
        self.assertEqual(
            health["research_receipt_schema_version"],
            "propagation-research-receipt-v2",
        )

    def test_station_capability_classes_are_bounded_and_identity_free(self):
        station = request_payload()["station"]
        self.assertEqual(
            station_capability_classes(StationEnvelope.model_validate(station)),
            {
                "tx_eirp": "100_500w",
                "passive_loss": "1_3db",
                "directional_gain": "6_10dbi",
                "receiver_evidence": "relative",
                "supported": True,
            },
        )
        self.assertEqual(
            station_capability_classes(None),
            {
                "tx_eirp": "unknown",
                "passive_loss": "unknown",
                "directional_gain": "unknown",
                "receiver_evidence": "unknown",
                "supported": False,
            },
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
            beta_telemetry_sink=RecordingBetaTelemetrySink(),
            runtime_activation=BETA_RUNTIME_ACTIVATION,
        ))
        response = client.post("/v1/propagation/path", json=payload)
        self.assertNotIn("research_receipt", response.json())

    def test_research_receipt_secret_fails_closed_when_too_short(self):
        with self.assertRaisesRegex(RuntimeError, "at least 32 characters"):
            create_app(
                self.registry,
                inference_mode="active",
                research_receipt_secret="short",
                runtime_activation=BETA_RUNTIME_ACTIVATION,
            )

    def test_active_inference_is_independent_from_beta_collection(self):
        client = TestClient(create_app(
            self.registry,
            inference_mode="active",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=UnavailableOperationalWeatherProvider(),
            runtime_activation=RuntimeActivation(frozenset()),
        ))
        response = client.post("/v1/propagation/path", json=request_payload())
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("research_receipt", response.json())
        health = client.get("/v1/propagation/health").json()
        self.assertFalse(health["beta_collection_activated"])
        self.assertFalse(health["research_receipts_enabled"])

    def test_active_beta_collection_requires_a_receipt_secret(self):
        with self.assertRaisesRegex(RuntimeError, "requires PROPULSE"):
            create_app(
                self.registry,
                inference_mode="active",
                runtime_activation=BETA_RUNTIME_ACTIVATION,
            )

    def test_active_research_receipts_require_stop_event_telemetry(self):
        with self.assertRaisesRegex(
            RuntimeError,
            "require beta stop-event telemetry",
        ):
            create_app(
                self.registry,
                inference_mode="active",
                research_receipt_secret=(
                    "test-research-receipt-secret-at-least-32-chars"
                ),
                runtime_activation=BETA_RUNTIME_ACTIVATION,
            )

    def test_equipment_math_violation_is_recorded_and_prediction_is_suppressed(self):
        payload = request_payload()
        payload["station"]["eirpWatts"] = 500
        beta_sink = RecordingBetaTelemetrySink()
        client = TestClient(create_app(
            self.registry,
            inference_mode="active",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=UnavailableOperationalWeatherProvider(),
            research_receipt_secret=(
                "test-research-receipt-secret-at-least-32-chars"
            ),
            beta_telemetry_sink=beta_sink,
            runtime_activation=BETA_RUNTIME_ACTIVATION,
        ))

        response = client.post("/v1/propagation/path", json=payload)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            beta_sink.events,
            [({"equipment_math_events": 1}, None)],
        )
        self.assertNotIn("research_receipt", response.text)

    def test_stop_event_telemetry_failure_suppresses_prediction(self):
        payload = request_payload()
        payload["station"]["eirpWatts"] = 500
        client = TestClient(create_app(
            self.registry,
            inference_mode="active",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=UnavailableOperationalWeatherProvider(),
            research_receipt_secret=(
                "test-research-receipt-secret-at-least-32-chars"
            ),
            beta_telemetry_sink=RecordingBetaTelemetrySink(fail=True),
            runtime_activation=BETA_RUNTIME_ACTIVATION,
        ))

        response = client.post("/v1/propagation/path", json=payload)

        self.assertEqual(response.status_code, 503)
        self.assertIn("telemetry unavailable", response.text)

    def test_unsupported_and_privacy_stop_conditions_are_classified(self):
        payload = request_payload()
        payload["station"].update({
            "supported": False,
            "powerAtAntennaWatts": 0,
            "eirpWatts": 0,
            "erpWatts": 0,
        })
        request = PathRequest.model_validate(payload)
        self.assertEqual(
            beta_stop_event_for_prediction(
                request,
                {"personalized_probability": 0.2},
            ),
            "unsupported_support_events",
        )
        self.assertTrue(receipt_contains_raw_private_fields({
            "station_capability": {"eirpWatts": 100},
        }))
        self.assertTrue(receipt_contains_raw_private_fields({
            "station_capability": {"RADIOID": "private"},
        }))
        self.assertFalse(receipt_contains_raw_private_fields({
            "station_capability": {"tx_eirp": "25_100w"},
        }))

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

    def test_health_serving_profile_follows_path_history_provider_state(self):
        unavailable_client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=UnavailablePathHistoryProvider(),
        ))
        unavailable_body = unavailable_client.get("/v1/propagation/health").json()
        self.assertEqual(unavailable_body["path_history_provider"], "unavailable")
        self.assertEqual(unavailable_body["serving_profile"], "physics")
        self.assertEqual(unavailable_body["missing_feature_counts"], [])

        configured_client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=FakePathHistoryProvider(),
        ))
        configured_body = configured_client.get("/v1/propagation/health").json()
        self.assertEqual(configured_body["path_history_provider"], "approved-fixture")
        self.assertEqual(configured_body["configured_profile"], "nowcast")
        self.assertEqual(configured_body["serving_profile"], "nowcast")

    def test_health_serving_profile_follows_the_last_served_prediction(self):
        # A configured provider whose rows are stale serves physics on every
        # request; /health must say so rather than advertise the configured
        # (phantom) nowcast profile.
        stale_client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=FakePathHistoryProvider(age_seconds=7201),
        ))
        before = stale_client.get("/v1/propagation/health").json()
        self.assertEqual(before["configured_profile"], "nowcast")
        self.assertEqual(before["serving_profile"], "nowcast")
        stale_client.post("/v1/propagation/path", json=request_payload())
        after = stale_client.get("/v1/propagation/health").json()
        self.assertEqual(after["configured_profile"], "nowcast")
        self.assertEqual(after["serving_profile"], "physics")
        self.assertEqual(after["served_profile_counts"], {"physics": 1})

    def test_unavailable_path_history_provider_skips_the_lookup(self):
        provider = SpyUnavailablePathHistoryProvider()
        client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=provider,
        ))
        response = client.post("/v1/propagation/path", json=request_payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(provider.lookups, [])

    def test_missing_features_reach_the_shadow_event_and_health_counter(self):
        self.registry.missing_feature_names = ["f107", "kp"]
        events = []
        client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            telemetry_sink=events.append,
            path_history_provider=UnavailablePathHistoryProvider(),
        ))
        response = client.post("/v1/propagation/path", json=request_payload())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            events[0]["missing_features"],
            {
                "first_row_names": ["f107", "kp"],
                "first_row_count": 2,
                "histogram": {"f107": 1, "kp": 1},
            },
        )
        health = client.get("/v1/propagation/health").json()
        self.assertIn({"feature": "f107", "count": 1}, health["missing_feature_counts"])
        self.assertIn({"feature": "kp", "count": 1}, health["missing_feature_counts"])

    def test_served_profile_counts_reflects_actual_predictions(self):
        client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=UnavailablePathHistoryProvider(),
        ))
        self.assertEqual(
            client.get("/v1/propagation/health").json()["served_profile_counts"], {}
        )

        client.post("/v1/propagation/path", json=request_payload())
        health = client.get("/v1/propagation/health").json()
        self.assertEqual(health["served_profile_counts"], {"physics": 1})

        # Rolling since startup: a second request accumulates, not resets.
        client.post("/v1/propagation/path", json=request_payload())
        health = client.get("/v1/propagation/health").json()
        self.assertEqual(health["served_profile_counts"], {"physics": 2})

        # configured_profile reflects configuration; serving_profile and
        # served_profile_counts reflect what predict_many actually returned -
        # a fresh, configured provider serves nowcast.
        nowcast_client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=FakePathHistoryProvider(),
        ))
        nowcast_client.post("/v1/propagation/path", json=request_payload())
        nowcast_health = nowcast_client.get("/v1/propagation/health").json()
        self.assertEqual(nowcast_health["serving_profile"], "nowcast")
        self.assertEqual(nowcast_health["served_profile_counts"], {"nowcast": 1})

    def test_missing_feature_summary_sorts_caps_and_handles_empty_input(self):
        self.assertEqual(
            missing_feature_summary([]),
            {"first_row_names": [], "first_row_count": 0, "histogram": {}},
        )
        predictions = [
            RuntimePrediction(
                probability=0.1,
                confidence=0.5,
                model_version="v4-test",
                profile="physics",
                missing_feature_names=["b", "a"],
            ),
            RuntimePrediction(
                probability=0.1,
                confidence=0.5,
                model_version="v4-test",
                profile="physics",
                missing_feature_names=["a", "c"],
            ),
        ]
        summary = missing_feature_summary(predictions)
        self.assertEqual(summary["first_row_names"], ["a", "b"])
        self.assertEqual(summary["first_row_count"], 2)
        self.assertEqual(summary["histogram"], {"a": 2, "b": 1, "c": 1})

    def test_capabilities_match_the_shared_cross_language_fixture(self):
        activation = RuntimeActivation(frozenset())
        self.assertEqual(
            build_runtime_capabilities(
                self.registry,
                "shadow",
                activation,
                False,
            ),
            CAPABILITIES_FIXTURE,
        )
        client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            runtime_activation=activation,
        ))
        self.assertEqual(
            client.get("/v1/propagation/capabilities").json(),
            CAPABILITIES_FIXTURE,
        )

    def test_service_token_protects_every_endpoint_except_health(self):
        token = "service-token-at-least-32-characters-long"
        client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            service_token=token,
        ))
        health = client.get("/v1/propagation/health")
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()["service_auth_enabled"])
        self.assertEqual(
            client.get("/v1/propagation/capabilities").status_code,
            401,
        )
        self.assertEqual(
            client.get(
                "/v1/propagation/capabilities",
                headers={"Authorization": "Bearer wrong"},
            ).status_code,
            401,
        )
        self.assertEqual(
            client.get(
                "/v1/propagation/capabilities",
                headers={"Authorization": f"Bearer {token}"},
            ).status_code,
            200,
        )

    def test_short_service_token_fails_startup(self):
        with self.assertRaisesRegex(RuntimeError, "at least 32"):
            create_app(self.registry, service_token="short")

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
            inference_mode="shadow",
            path_history_provider=FakePathHistoryProvider(age_seconds=7200),
        ))
        response = fresh_client.post("/v1/propagation/path", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"], "nowcast")

        stale_client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
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
            inference_mode="shadow",
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
            inference_mode="shadow",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=FakeOperationalWeatherProvider(
                future_available=True
            ),
        ))

        with self.assertLogs("uvicorn.error", level="WARNING") as captured:
            response = client.post("/v1/propagation/path", json=request_payload())

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("space_weather", response.json()["data_freshness"])
        self.assertEqual(self.registry.last_values[-1]["kp_missing"], 1)
        self.assertTrue(
            any("reason=future_available_at" in line for line in captured.output)
        )

    def test_operational_weather_lookup_failure_logs_exception_class(self):
        client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=RaisingOperationalWeatherProvider(),
        ))

        with self.assertLogs("uvicorn.error", level="WARNING") as captured:
            response = client.post("/v1/propagation/path", json=request_payload())

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("space_weather", response.json()["data_freshness"])
        self.assertTrue(
            any("reason=lookup_failed" in line for line in captured.output)
        )
        self.assertTrue(
            any("error=RuntimeError" in line for line in captured.output)
        )

    def test_future_or_flagged_server_snapshot_fails_closed(self):
        for provider in (
            FakePathHistoryProvider(future_available=True),
            FakePathHistoryProvider(quality_flags=("coverage_low",)),
        ):
            client = TestClient(create_app(
                self.registry,
                inference_mode="shadow",
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

    def test_surface_profile_depends_only_on_verified_path_history(self):
        payload = request_payload()
        first = payload.pop("features")
        first["values"].update({
            "path_success_prev1": 0.99,
            "path_prev1_available": 1,
        })
        payload["cells"] = [
            first,
            {"target_grid4": "FN31", "values": {"band_mhz": 14.1}},
        ]
        payload["data_freshness_seconds"]["path_history"] = 0

        unavailable = self.client.post("/v1/propagation/surface", json=payload)
        self.assertEqual(unavailable.status_code, 200)
        self.assertEqual(
            [cell["profile"] for cell in unavailable.json()["cells"]],
            ["physics", "physics"],
        )
        self.assertTrue(all(
            "path_history" not in cell["data_freshness"]
            for cell in unavailable.json()["cells"]
        ))
        self.assertEqual(self.registry.last_values[-2]["path_success_prev1"], 0.0)

        verified_client = TestClient(create_app(
            self.registry,
            inference_mode="shadow",
            path_history_provider=FakePathHistoryProvider(age_seconds=60),
        ))
        verified = verified_client.post("/v1/propagation/surface", json=payload)
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(
            [cell["profile"] for cell in verified.json()["cells"]],
            ["nowcast", "nowcast"],
        )
        self.assertTrue(all(
            cell["data_freshness"]["path_history"] == 60
            for cell in verified.json()["cells"]
        ))

    def test_surface_applies_per_direction_station_envelopes(self):
        payload = request_payload()
        base_features = payload.pop("features")
        weak_station = copy.deepcopy(payload["station"])
        set_station_path_gain(weak_station, -6)
        strong_station = copy.deepcopy(payload["station"])
        set_station_path_gain(strong_station, 10)
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

    def test_disabled_mode_refuses_path_and_surface_predictions(self):
        client = TestClient(create_app(
            self.registry,
            inference_mode="disabled",
        ))
        path_response = client.post("/v1/propagation/path", json=request_payload())
        self.assertEqual(path_response.status_code, 503)
        surface_payload = request_payload()
        surface_payload["cells"] = [surface_payload.pop("features")]
        surface_response = client.post("/v1/propagation/surface", json=surface_payload)
        self.assertEqual(surface_response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
