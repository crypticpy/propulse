from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from app import RuntimePrediction, create_app


class FakeRegistry:
    def predict(self, values, band, stale_history):
        return RuntimePrediction(
            probability=0.4,
            confidence=0.8,
            model_version="v4-test",
            profile="physics" if stale_history else "nowcast",
            ood_flags=["recent_network_stale_physics_fallback"] if stale_history else [],
            top_factors=["sun_elev_mid"],
        )

    def models(self):
        return [{"model_version": "v4-test"}]

    def health(self):
        return {"status": "ok", "model_version": "v4-test"}


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
        "data_freshness_seconds": {"path_history": 60},
    }


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app(FakeRegistry()))

    def test_path_applies_station_envelope(self):
        response = self.client.post("/v1/propagation/path", json=request_payload())
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["core_probability"], 0.4)
        self.assertGreater(body["personalized_probability"], body["core_probability"])
        self.assertEqual(body["model_version"], "v4-test")

    def test_raw_equipment_fields_are_rejected(self):
        payload = request_payload()
        payload["station"]["radioId"] = "private-id"
        response = self.client.post("/v1/propagation/path", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_stale_history_selects_physics_fallback(self):
        payload = request_payload()
        payload["data_freshness_seconds"]["path_history"] = 10_000
        response = self.client.post("/v1/propagation/path", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"], "physics")

    def test_surface_scores_multiple_cells(self):
        payload = request_payload()
        payload["cells"] = [
            payload.pop("features"),
            {"target_grid4": "FN31", "values": {"band_mhz": 14.1}},
        ]
        response = self.client.post("/v1/propagation/surface", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["cells"]), 2)


if __name__ == "__main__":
    unittest.main()
