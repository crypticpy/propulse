from __future__ import annotations

import json
import unittest
from pathlib import Path

from runtime_activation import RUNTIME_MODES, evaluate_runtime_activation


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = json.loads(
    (ROOT / "ml/fixtures/runtime_activation_v2_cases.json").read_text(
        encoding="utf-8"
    )
)
READINESS_SHA256 = FIXTURE["readiness_sha256"]


def activation(**updates: object) -> dict[str, object]:
    value: dict[str, object] = {
        "schema_version": 1,
        "scope": "phase6_runtime_activation",
        "activation_state": "approved",
        "product_activation_recorded": True,
        "approved_modes": ["beta_collection"],
        "locked_prospective_outcomes_read": False,
        "source_readiness_sha256": READINESS_SHA256,
    }
    value.update(updates)
    return value


def eligibility(*, horizons: list[int] | None = None, **modes: bool) -> dict[str, object]:
    return {
        "schema_version": 2,
        "scope": "phase6_runtime_eligibility",
        "locked_prospective_outcomes_read": False,
        "source_readiness_sha256": READINESS_SHA256,
        "futurecast_horizons_hours": horizons or [],
        "modes": {
            "system_health_view": False,
            "beta_collection": False,
            "core_nowcast": False,
            "stationcast_deterministic": False,
            "stationcast_learned": False,
            "futurecast": False,
            "six_meter": False,
            **modes,
        },
    }


class RuntimeActivationTests(unittest.TestCase):
    def test_shared_v2_contract_cases(self) -> None:
        for case in FIXTURE["cases"]:
            with self.subTest(case=case["name"]):
                result = evaluate_runtime_activation(
                    case["activation"],
                    case["eligibility"],
                )
                self.assertEqual(
                    sorted(result.approved_modes),
                    case["allowed_modes"],
                )
                self.assertEqual(
                    list(result.futurecast_horizons_hours),
                    case["futurecast_horizons_hours"],
                )
                self.assertEqual(not result.errors, case["valid"])
                for mode in RUNTIME_MODES:
                    self.assertEqual(
                        result.allows(mode),
                        mode in case["allowed_modes"],
                    )

    def test_requires_activation_and_eligibility(self) -> None:
        result = evaluate_runtime_activation(
            activation(),
            eligibility(beta_collection=True),
        )
        self.assertTrue(result.allows("beta_collection"))
        self.assertFalse(result.allows("core_nowcast"))

    def test_approved_but_ineligible_mode_fails_closed(self) -> None:
        result = evaluate_runtime_activation(activation(), eligibility())
        self.assertFalse(result.allows("beta_collection"))
        self.assertIn("approved_mode_not_eligible:beta_collection", result.errors)

    def test_disabled_state_cannot_carry_approved_modes(self) -> None:
        result = evaluate_runtime_activation(
            activation(
                activation_state="disabled",
                product_activation_recorded=False,
            ),
            eligibility(beta_collection=True),
        )
        self.assertFalse(result.allows("beta_collection"))
        self.assertIn("disabled_activation_inconsistent", result.errors)

    def test_unknown_mode_invalidates_the_whole_document(self) -> None:
        result = evaluate_runtime_activation(
            activation(approved_modes=["beta_collection", "unknown"]),
            eligibility(beta_collection=True),
        )
        self.assertFalse(result.approved_modes)
        self.assertIn("activation_modes", result.errors)

    def test_futurecast_horizons_are_independently_activated(self) -> None:
        result = evaluate_runtime_activation(
            activation(approved_modes=["futurecast"]),
            eligibility(horizons=[3, 12], futurecast=True),
        )
        self.assertTrue(result.allows_futurecast_horizon(3))
        self.assertFalse(result.allows_futurecast_horizon(6))
        self.assertTrue(result.allows_futurecast_horizon(12))

    def test_readiness_checksum_is_required(self) -> None:
        result = evaluate_runtime_activation(
            activation(source_readiness_sha256="invalid"),
            eligibility(beta_collection=True),
        )
        self.assertIn("activation_readiness_sha", result.errors)
        self.assertFalse(result.approved_modes)


if __name__ == "__main__":
    unittest.main()
