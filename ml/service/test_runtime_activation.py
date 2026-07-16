from __future__ import annotations

import unittest

from runtime_activation import evaluate_runtime_activation


def activation(**updates: object) -> dict[str, object]:
    value: dict[str, object] = {
        "schema_version": 1,
        "scope": "phase6_runtime_activation",
        "activation_state": "approved",
        "product_activation_recorded": True,
        "approved_modes": ["beta_collection"],
        "locked_prospective_outcomes_read": False,
    }
    value.update(updates)
    return value


def eligibility(**modes: bool) -> dict[str, object]:
    return {
        "schema_version": 1,
        "scope": "phase6_runtime_eligibility",
        "locked_prospective_outcomes_read": False,
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


if __name__ == "__main__":
    unittest.main()
