#!/usr/bin/env python3
"""Exercise every non-participation beta stop producer against the real target."""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi.testclient import TestClient

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write, read_env


SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(SERVICE))
from app import RuntimePrediction, create_app  # noqa: E402
from beta_telemetry import (  # noqa: E402
    PostgrestBetaTelemetryRecorder,
    PrivacyBoundaryViolation,
    emit_shadow_telemetry,
)
from operational_weather import UnavailableOperationalWeatherProvider  # noqa: E402
from path_history import UnavailablePathHistoryProvider  # noqa: E402
from stationcast_beta_stop_monitor import (  # noqa: E402
    CONFIG as BETA_CONFIG,
    evaluate_week,
    initial_state,
)


PHASE2_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
LIVE = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline"
)
DEFAULT_OUTPUT = LIVE / "stationcast_beta_stop_producer_validation.json"
DEFAULT_ENV = ROOT / ".env.local"
TEST_PROTOCOL = "propagation-v4.2-stationcast-beta-2099-03-01"
TEST_START = datetime(2099, 3, 2, tzinfo=timezone.utc)
COUNT_FIELDS = {
    "requests",
    "errors",
    "integrity_errors",
    "privacy_events",
    "consent_errors",
    "subject_binding_errors",
    "stale_profile_events",
    "equipment_math_events",
    "unsupported_support_events",
    "high_confidence_overprediction_events",
    "geographic_regression_events",
}


class FakeRegistry:
    path_history_stale_after_seconds = 7200
    feature_contract = "station-chain-v1"
    core_feature_contract = "archive-v4-features-test-v1"

    def predict(self, values, band, stale_history):
        del values, band
        return RuntimePrediction(
            probability=0.4,
            confidence=0.8,
            model_version="v4.2-stop-producer-validation",
            profile="physics" if stale_history else "nowcast",
            ood_flags=(
                ["recent_network_stale_physics_fallback"]
                if stale_history
                else []
            ),
            top_factors=[],
        )

    def predict_many(self, rows, bands, stale_history):
        return [
            self.predict(row, band, stale_history)
            for row, band in zip(rows, bands)
        ]

    def models(self):
        return [{"model_version": "v4.2-stop-producer-validation"}]

    def health(self):
        return {"status": "ok"}


class FixedTimeSink:
    configured = True

    def __init__(self, recorder, observed_at):
        self.recorder = recorder
        self.observed_at = observed_at

    def record(self, counts, *, observed_at=None):
        self.recorder.record(
            counts,
            observed_at=observed_at or self.observed_at,
        )


def station() -> dict[str, Any]:
    conducted = 25.0
    passive_loss = 1.0
    gain = 7.1
    at_antenna = conducted * math.pow(10, -passive_loss / 10)
    eirp = at_antenna * math.pow(10, gain / 10)
    return {
        "featureContract": "station-chain-v1",
        "chainFingerprint": "fnv1a64:0123456789abcdef",
        "band": "20m",
        "frequencyMHz": 14.15,
        "mode": "WSPR",
        "requestedPowerWatts": 25,
        "conductedPowerWatts": conducted,
        "powerAtAntennaWatts": at_antenna,
        "eirpWatts": eirp,
        "erpWatts": eirp / math.pow(10, 2.15 / 10),
        "totalPassiveLossDb": passive_loss,
        "feedlineLossDb": 0.8,
        "inlineLossDb": 0.2,
        "amplifierGainDb": 0,
        "antennaGainTowardPathDbi": gain,
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
    }


def request_payload() -> dict[str, Any]:
    return {
        "origin_grid4": "EM10",
        "issue_time": "2099-03-02T00:00:00Z",
        "valid_time": "2099-03-02T00:00:00Z",
        "band": "20m",
        "mode": "WSPR",
        "declared_power_watts": 25,
        "features": {"target_grid4": "IO91", "values": {"band_mhz": 14.15}},
        "station": station(),
        "research_subject_binding": {
            "schema_version": "propagation-research-subject-v1",
            "expires_at": "2099-03-02T02:00:00Z",
            "hmac_sha256": "a" * 64,
        },
    }


def shadow_event() -> dict[str, Any]:
    return {
        "schema_version": "propagation-shadow-v1",
        "event_type": "propagation_inference_completed",
        "inference_mode": "active",
        "request_kind": "path",
        "receipt_time": TEST_START.isoformat(),
        "issue_time": TEST_START.isoformat(),
        "valid_time": TEST_START.isoformat(),
        "band": "20m",
        "mode": "WSPR",
        "cell_count": 1,
        "model_version": "v4.2-stop-producer-validation",
        "feature_contract": "archive-v4-features-test-v1",
        "station_feature_contract": "station-chain-v1",
        "path_history_provider": "validation-provider",
        "path_history_transform_version": "validation-transform-v1",
        "operational_weather_provider": "validation-weather-v1",
        "profile_counts": {"physics": 1},
        "source_freshness": {
            "path_history_seconds": None,
            "path_history_stale": True,
            "space_weather_seconds": None,
        },
        "ood_flag_counts": {"recent_network_stale_physics_fallback": 1},
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
        "latency_ms": 1.0,
    }


def monitoring_evidence(config, start, end):
    return {
        "schema_version": 1,
        "policy_version": config["policy_version"],
        "window_start": start.isoformat(),
        "window_end": end.isoformat(),
        "scope": "privacy_bounded_wspr_reception_monitoring_not_promotion_score",
        "reportability": {
            "minimum_participants": 5,
            "minimum_outcomes": 20,
        },
        "summary": {
            "reportable": True,
            "participants": 20,
            "outcomes": 250,
            "tier_a_outcomes": 200,
            "core_brier": 0.1,
            "stationcast_brier": 0.11,
            "paired_brier_delta": 0.01,
            "largest_participant_share": 0.08,
        },
        "strata": [{
            "dimension": "origin_field",
            "value": "EM",
            "participants": 8,
            "outcomes": 120,
            "core_brier": 0.1,
            "personalized_brier": 0.105,
        }],
        "calibration_bins": [{
            "model": "stationcast",
            "bin": 8,
            "outcomes": 200,
            "mean_probability": 0.85,
            "observed_rate": 0.70,
        }],
        "privacy": {
            "user_ids_returned": False,
            "exact_grid4_returned": False,
            "raw_station_inventory_returned": False,
            "participant_cap_applied": False,
        },
    }


class TargetClient:
    def __init__(self, base_url: str, service_key: str) -> None:
        self.root = base_url.rstrip("/")
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def delete_test_rows(self) -> None:
        with httpx.Client(follow_redirects=False) as client:
            response = client.delete(
                f"{self.root}/rest/v1/propagation_beta_telemetry_hourly",
                headers={**self.headers, "Prefer": "return=minimal"},
                params={"protocol_version": f"eq.{TEST_PROTOCOL}"},
                timeout=30,
            )
        response.raise_for_status()

    def counts(self) -> dict[str, int]:
        with httpx.Client(follow_redirects=False) as client:
            response = client.post(
                f"{self.root}/rest/v1/rpc/get_propagation_beta_api_telemetry",
                headers=self.headers,
                json={
                    "p_protocol_version": TEST_PROTOCOL,
                    "p_window_start": TEST_START.isoformat(),
                    "p_window_end": (TEST_START + timedelta(days=21)).isoformat(),
                },
                timeout=30,
            )
        response.raise_for_status()
        payload = response.json()
        counts = payload.get("counts") if isinstance(payload, dict) else None
        if not isinstance(counts, dict) or set(counts) != COUNT_FIELDS:
            raise RuntimeError("target aggregate telemetry response is invalid")
        return {name: int(value) for name, value in counts.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    runtime = validate_m5_runtime(
        json.loads(PHASE2_CONFIG.read_text(encoding="utf-8"))
    )
    env = read_env(args.env_file)
    url = (env.get("VITE_SUPABASE_URL") or env.get("SUPABASE_URL") or "").strip()
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("target aggregate telemetry credentials are unavailable")
    target = TargetClient(url, key)
    recorder = PostgrestBetaTelemetryRecorder(
        url,
        key,
        protocol_version=TEST_PROTOCOL,
    )
    sink = FixedTimeSink(recorder, TEST_START)
    gates: dict[str, bool] = {}
    observed_counts: dict[str, int] = {}
    cleanup_counts: dict[str, int] = {}
    target.delete_test_rows()
    try:
        client = TestClient(create_app(
            FakeRegistry(),
            inference_mode="active",
            path_history_provider=UnavailablePathHistoryProvider(),
            operational_weather_provider=UnavailableOperationalWeatherProvider(),
            research_receipt_secret="validation-receipt-secret-at-least-32-characters",
            beta_telemetry_sink=sink,
        ))
        math_payload = request_payload()
        math_payload["station"]["eirpWatts"] *= 2
        gates["equipment_math_request_failed_closed"] = (
            client.post("/v1/propagation/path", json=math_payload).status_code == 503
        )
        unsupported_payload = request_payload()
        unsupported_payload["station"]["warningCodes"] = [
            "radio_band_unsupported"
        ]
        gates["unsupported_support_request_failed_closed"] = (
            client.post(
                "/v1/propagation/path",
                json=unsupported_payload,
            ).status_code
            == 503
        )

        unsafe_event = {**shadow_event(), "origin_grid4": "never-emitted"}
        emitted = []
        try:
            emit_shadow_telemetry(
                unsafe_event,
                sink=emitted.append,
                beta_recorder=sink,
                beta_collection_enabled=True,
                observed_at=TEST_START,
            )
        except PrivacyBoundaryViolation:
            pass
        gates["privacy_event_intercepted_before_sink"] = not emitted

        config = json.loads(BETA_CONFIG.read_text(encoding="utf-8"))
        first_end = TEST_START + timedelta(days=7)
        first = monitoring_evidence(config, TEST_START, first_end)
        high_counts, state, _receipt = evaluate_week(
            first,
            config,
            initial_state(config["protocol_version"]),
            window_start=TEST_START,
            window_end=first_end,
        )
        sink.record(high_counts, observed_at=first_end)
        gates["high_confidence_monitor_emitted_stop"] = high_counts == {
            "high_confidence_overprediction_events": 1
        }
        second_end = first_end + timedelta(days=7)
        second = monitoring_evidence(config, first_end, second_end)
        geographic_counts, _state, _receipt = evaluate_week(
            second,
            config,
            state,
            window_start=first_end,
            window_end=second_end,
        )
        sink.record(geographic_counts, observed_at=second_end)
        gates["two_week_geographic_monitor_emitted_stop"] = geographic_counts == {
            "geographic_regression_events": 1
        }

        observed_counts = target.counts()
        expected = {name: 0 for name in COUNT_FIELDS}
        expected.update({
            "privacy_events": 1,
            "equipment_math_events": 1,
            "unsupported_support_events": 1,
            "high_confidence_overprediction_events": 1,
            "geographic_regression_events": 1,
        })
        gates["target_aggregate_counts_exact"] = observed_counts == expected
    finally:
        target.delete_test_rows()
        cleanup_counts = target.counts()
    gates["persistent_test_rows_absent"] = all(
        value == 0 for value in cleanup_counts.values()
    )
    gates["locked_outcomes_unread"] = True
    gates["participant_data_absent"] = True
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "stationcast_beta_stop_producer_target_validation",
        "decision": "pass" if all(gates.values()) else "fail",
        "passed": all(gates.values()),
        "synthetic_stop_inputs": True,
        "real_target_aggregate_rpc": True,
        "protocol_version": TEST_PROTOCOL,
        "production_protocol_unchanged": True,
        "observed_counts": observed_counts,
        "post_cleanup_counts": cleanup_counts,
        "gates": gates,
        "runtime": {
            "machine": runtime["machine"],
            "physical_cores_visible": runtime["physical_cores_visible"],
        },
        "privacy": {
            "locked_outcomes_read": False,
            "participant_data_written": False,
            "path_or_equipment_dimensions_written": False,
            "secret_value_written": False,
        },
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["passed"]:
        raise SystemExit("StationCast beta stop producer validation failed")


if __name__ == "__main__":
    main()
