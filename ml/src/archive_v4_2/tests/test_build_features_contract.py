from __future__ import annotations

import sys
import unittest
from pathlib import Path


V3 = Path(__file__).resolve().parents[2] / "archive_v3"
sys.path.insert(0, str(V3))

from build_features import FEATURE_CONTRACT, require_feature_contract  # noqa: E402


class RequireFeatureContractTests(unittest.TestCase):
    def test_matching_contract_passes(self) -> None:
        require_feature_contract(
            {"run_id": "some_run", "feature_contract": FEATURE_CONTRACT}
        )

    def test_missing_contract_key_raises_a_clear_v1_frozen_message(self) -> None:
        # A V1 config (ml/config/propagation_v4.json, propagation_v4_1.json)
        # declares no feature_contract key at all -- exactly the case this
        # guard exists to stop, since FEATURE_CONTRACT is hardcoded to v2.
        with self.assertRaises(RuntimeError) as raised:
            require_feature_contract(
                {"run_id": "propagation_v4_multiyear_50m", "config_path": "ml/config/propagation_v4.json"}
            )
        message = str(raised.exception)
        self.assertIn("ml/config/propagation_v4.json", message)
        self.assertIn(FEATURE_CONTRACT, message)
        self.assertIn("V1 datasets are frozen", message)

    def test_wrong_contract_value_raises(self) -> None:
        with self.assertRaises(RuntimeError):
            require_feature_contract(
                {"run_id": "some_run", "feature_contract": "archive-v4-features-v1"}
            )

    def test_falls_back_to_run_id_when_config_path_is_absent(self) -> None:
        with self.assertRaises(RuntimeError) as raised:
            require_feature_contract({"run_id": "some_run"})
        self.assertIn("some_run", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
