"""Contract tests for the archive-v4-features-v2 core feature contract."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from feature_contract import (  # noqa: E402
    CORE_FEATURE_CONTRACT_V1,
    CORE_FEATURE_CONTRACT_V2,
    EXPECTED_V1_NOWCAST_FEATURES,
    EXPECTED_V2_NOWCAST_FEATURES,
    EXPECTED_V2_PHYSICS_FEATURES,
    PATH_FEATURES,
    UNSERVABLE_WEATHER,
    FeatureContractError,
    assert_servable,
    core_feature_contract,
    is_v2,
    nowcast_features,
    nowcast_features_v2,
    physics_features_v2,
)


V4_RESULTS = (
    ROOT
    / "ml/results/propagation_v4/propagation_v4_multiyear_50m/development_results.json"
)


def v1_nowcast_features() -> list[str]:
    result = json.loads(V4_RESULTS.read_text(encoding="utf-8"))
    return [str(value) for value in result["candidates"]["M2_nowcast"]["features"]]


class FeatureContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.v1 = v1_nowcast_features()

    def test_v1_order_is_the_frozen_91_feature_contract(self) -> None:
        self.assertEqual(len(self.v1), EXPECTED_V1_NOWCAST_FEATURES)
        for name in UNSERVABLE_WEATHER:
            self.assertIn(name, self.v1)
            self.assertIn(f"{name}_missing", self.v1)

    def test_nowcast_v2_drops_only_the_unservable_channels(self) -> None:
        v2 = nowcast_features_v2(self.v1)
        self.assertEqual(len(v2), EXPECTED_V2_NOWCAST_FEATURES)
        dropped = set(self.v1) - set(v2)
        self.assertEqual(
            dropped,
            {
                *UNSERVABLE_WEATHER,
                *(f"{name}_missing" for name in UNSERVABLE_WEATHER),
            },
        )

    def test_nowcast_v2_preserves_v1_relative_order(self) -> None:
        v2 = nowcast_features_v2(self.v1)
        self.assertEqual(v2, [name for name in self.v1 if name in set(v2)])

    def test_nowcast_v2_is_idempotent_on_missing_channels(self) -> None:
        with self.assertRaises(FeatureContractError):
            nowcast_features_v2(nowcast_features_v2(self.v1))

    def test_nowcast_v2_rejects_duplicate_input(self) -> None:
        with self.assertRaises(FeatureContractError):
            nowcast_features_v2([*self.v1, self.v1[0]])

    def test_physics_v2_drops_the_eight_path_lags(self) -> None:
        v2 = nowcast_features_v2(self.v1)
        physics = physics_features_v2(self.v1)
        self.assertEqual(len(physics), EXPECTED_V2_PHYSICS_FEATURES)
        self.assertEqual(set(v2) - set(physics), set(PATH_FEATURES))
        self.assertEqual(physics, [n for n in v2 if n not in set(PATH_FEATURES)])

    def test_physics_v2_rejects_a_list_without_path_history(self) -> None:
        stripped = [name for name in self.v1 if name not in set(PATH_FEATURES)]
        with self.assertRaises(FeatureContractError):
            physics_features_v2(stripped)

    def test_assert_servable_accepts_the_v2_orders(self) -> None:
        assert_servable(nowcast_features_v2(self.v1))
        assert_servable(physics_features_v2(self.v1))

    def test_assert_servable_rejects_the_v1_order(self) -> None:
        with self.assertRaises(FeatureContractError):
            assert_servable(self.v1)

    def test_assert_servable_rejects_each_unservable_channel(self) -> None:
        for name in UNSERVABLE_WEATHER:
            with self.subTest(name=name):
                with self.assertRaises(FeatureContractError):
                    assert_servable([name])
                with self.assertRaises(FeatureContractError):
                    assert_servable([f"{name}_missing"])

    def test_assert_servable_ignores_non_weather_features(self) -> None:
        assert_servable(["distance_km", "band_20m", *PATH_FEATURES])


class ConfigContractTest(unittest.TestCase):
    def test_v1_config_defaults_to_contract_v1(self) -> None:
        config = {"candidates": {"A4": {"features": "v4"}}}
        self.assertEqual(core_feature_contract(config), CORE_FEATURE_CONTRACT_V1)
        self.assertFalse(is_v2(config))

    def test_v2_config_requires_v2_candidate_tags(self) -> None:
        config = {
            "core_feature_contract": CORE_FEATURE_CONTRACT_V2,
            "candidates": {"A4": {"features": "v2"}},
        }
        self.assertTrue(is_v2(config))

    def test_half_migrated_config_is_rejected(self) -> None:
        config = {
            "core_feature_contract": CORE_FEATURE_CONTRACT_V2,
            "candidates": {"A4": {"features": "v2"}, "A5": {"features": "v4"}},
        }
        with self.assertRaises(FeatureContractError):
            core_feature_contract(config)

    def test_unknown_contract_is_rejected(self) -> None:
        with self.assertRaises(FeatureContractError):
            core_feature_contract({"core_feature_contract": "archive-v9"})

    def test_nowcast_features_follows_the_config_contract(self) -> None:
        v1 = v1_nowcast_features()
        v1_config = {"candidates": {"A4": {"features": "v4"}}}
        v2_config = {
            "core_feature_contract": CORE_FEATURE_CONTRACT_V2,
            "candidates": {"A4": {"features": "v2"}},
        }
        self.assertEqual(nowcast_features(v1_config, v1), v1)
        self.assertEqual(
            len(nowcast_features(v2_config, v1)), EXPECTED_V2_NOWCAST_FEATURES
        )


if __name__ == "__main__":
    unittest.main()
