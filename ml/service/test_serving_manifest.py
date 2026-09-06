from __future__ import annotations

import copy
import unittest

from serving_manifest import (
    CORE_FEATURE_CONTRACT_V2,
    feature_order_sha256,
    validate_serving_manifest,
)


SHA256 = "a" * 64
VALID_PATH_HISTORY_CONTRACT = {
    "provider_kind": "field-recency-v2",
    "transform_version": "psk-rbn-field-recency-v2",
    "statistic": "quantile",
}


def component(name: str, features: list[str], weight: float | None = None):
    value = {
        "component": name,
        "model_path": f"{name}.json",
        "model_sha256": SHA256,
        "calibrator_path": f"{name}.joblib",
        "calibrator_sha256": SHA256,
        "features": features,
        "best_iteration": 10,
        "model_format": "xgboost_json",
        "calibrator_class": "calibration.CalibratorBundle",
        "calibration_method": "fixture",
    }
    if weight is not None:
        value["weight"] = weight
    return value


def valid_manifest():
    physics_features = ["band_mhz"]
    nowcast_features = ["band_mhz", "path_success_prev1"]
    return {
        "schema_version": 3,
        "run_id": "propagation_v4_2_phase2_scale",
        "model_version": "a6-retrospective-internal",
        "release_stage": "retrospective_validated_internal",
        "release_approved": False,
        "december_gate_scored": True,
        "locked_archive_test_scored": True,
        "prospective_test_scored": False,
        "feature_contract": "station-chain-v1",
        "core_feature_contract": "archive-v4-features-v1",
        "primary_candidate": "A6_recent_recency_blend",
        "runtime_policy": {
            "path_history_stale_after_seconds": 7200,
            "xgboost_prediction_threads": 1,
        },
        "native_runtime": {
            "model_format": "xgboost_json",
            "calibrator_class": "calibration.CalibratorBundle",
            "serialization_pair": (
                "xgboost-json+joblib-calibrator-bundle-v1"
            ),
        },
        "evidence": {
            "protocol_state": "archive_passed",
            "december_attempt_id": "december-fixture",
            "archive_attempt_id": "archive-fixture",
            "outcome_protocol_sha256": SHA256,
            "source_candidate_manifest_sha256": SHA256,
            "december_gate_result_sha256": SHA256,
            "archive_gate_result_sha256": SHA256,
            "december_decision_sha256": SHA256,
            "archive_decision_sha256": SHA256,
        },
        "profiles": {
            "physics": {
                "kind": "single",
                **component("M1_physics", physics_features),
                "feature_order_sha256": feature_order_sha256(
                    physics_features
                ),
            },
            "nowcast": {
                "kind": "weighted_ensemble",
                "features": nowcast_features,
                "feature_order_sha256": feature_order_sha256(
                    nowcast_features
                ),
                "components": [
                    component("A4_recent_cycle", nowcast_features, 0.7),
                    component("A5_recency_weighted", nowcast_features, 0.3),
                ],
            },
        },
    }


class ServingManifestTests(unittest.TestCase):
    def test_accepts_exact_retrospective_internal_contract(self):
        validate_serving_manifest(valid_manifest())

    def test_rejects_schema_stage_and_thread_drift(self):
        for field, value, message in (
            ("schema_version", 2, "schema"),
            ("release_stage", "released", "release stage"),
        ):
            payload = valid_manifest()
            payload[field] = value
            with self.subTest(field=field):
                with self.assertRaisesRegex(RuntimeError, message):
                    validate_serving_manifest(payload)
        payload = valid_manifest()
        payload["runtime_policy"]["xgboost_prediction_threads"] = 2
        with self.assertRaisesRegex(RuntimeError, "one prediction thread"):
            validate_serving_manifest(payload)

    def test_rejects_feature_order_and_component_drift(self):
        payload = valid_manifest()
        payload["profiles"]["nowcast"]["features"].reverse()
        with self.assertRaisesRegex(RuntimeError, "feature order hash"):
            validate_serving_manifest(payload)

        payload = valid_manifest()
        payload["profiles"]["nowcast"]["components"][0][
            "component"
        ] = "unexpected"
        with self.assertRaisesRegex(RuntimeError, "unexpected A6 components"):
            validate_serving_manifest(payload)

    def test_rejects_non_native_calibrator_and_escaped_path(self):
        payload = valid_manifest()
        payload["profiles"]["physics"]["calibrator_class"] = "other.Type"
        with self.assertRaisesRegex(RuntimeError, "non-native calibrator"):
            validate_serving_manifest(payload)

        payload = copy.deepcopy(valid_manifest())
        payload["profiles"]["physics"]["model_path"] = "../model.json"
        with self.assertRaisesRegex(RuntimeError, "bundle-local"):
            validate_serving_manifest(payload)

    def test_accepts_v2_with_valid_path_history_contract(self):
        payload = valid_manifest()
        payload["core_feature_contract"] = CORE_FEATURE_CONTRACT_V2
        payload["path_history_contract"] = dict(VALID_PATH_HISTORY_CONTRACT)
        validate_serving_manifest(payload)

    def test_v2_without_path_history_contract_is_rejected(self):
        payload = valid_manifest()
        payload["core_feature_contract"] = CORE_FEATURE_CONTRACT_V2
        with self.assertRaisesRegex(RuntimeError, "path_history_contract"):
            validate_serving_manifest(payload)

    def test_v2_rejects_malformed_path_history_contract(self):
        for updates, message in (
            ({"provider_kind": "wspr-live-v1"}, "provider_kind"),
            ({"transform_version": ""}, "transform_version"),
            ({"transform_version": 12}, "transform_version"),
            ({"statistic": "opportunity"}, "statistic"),
        ):
            payload = valid_manifest()
            payload["core_feature_contract"] = CORE_FEATURE_CONTRACT_V2
            payload["path_history_contract"] = {
                **VALID_PATH_HISTORY_CONTRACT,
                **updates,
            }
            with self.subTest(updates=updates):
                with self.assertRaisesRegex(RuntimeError, message):
                    validate_serving_manifest(payload)

    def test_v2_rejects_forbidden_weather_features_and_missing_flags(self):
        for feature in ("ae", "al", "au", "pcn", "ae_missing", "pcn_missing"):
            payload = valid_manifest()
            payload["core_feature_contract"] = CORE_FEATURE_CONTRACT_V2
            payload["path_history_contract"] = dict(VALID_PATH_HISTORY_CONTRACT)
            payload["profiles"]["nowcast"]["features"].append(feature)
            payload["profiles"]["nowcast"]["feature_order_sha256"] = (
                feature_order_sha256(payload["profiles"]["nowcast"]["features"])
            )
            for component in payload["profiles"]["nowcast"]["components"]:
                component["features"] = payload["profiles"]["nowcast"]["features"]
            with self.subTest(feature=feature):
                with self.assertRaisesRegex(RuntimeError, "forbidden feature"):
                    validate_serving_manifest(payload)

    def test_v1_manifest_ignores_forbidden_feature_names(self):
        # archive-v4-features-v1 never carried a path_history_contract
        # requirement or the forbidden-feature ban; this documents that the
        # v2 check is not accidentally applied to v1.
        payload = valid_manifest()
        payload["profiles"]["nowcast"]["features"].append("ae")
        payload["profiles"]["nowcast"]["feature_order_sha256"] = (
            feature_order_sha256(payload["profiles"]["nowcast"]["features"])
        )
        for component in payload["profiles"]["nowcast"]["components"]:
            component["features"] = payload["profiles"]["nowcast"]["features"]
        validate_serving_manifest(payload)

    def test_rejects_unsupported_core_feature_contract(self):
        payload = valid_manifest()
        payload["core_feature_contract"] = "archive-v4-features-v3"
        with self.assertRaisesRegex(RuntimeError, "core feature contract"):
            validate_serving_manifest(payload)


if __name__ == "__main__":
    unittest.main()
