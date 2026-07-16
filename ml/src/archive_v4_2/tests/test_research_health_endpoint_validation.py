from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from generate_live_feature_report import INPUTS, build_evidence  # noqa: E402
from validate_research_health_endpoint import (  # noqa: E402
    keys_are_identity_free,
    store_config,
)


class ResearchHealthEndpointValidationTests(unittest.TestCase):
    def test_evidence_key_scan_rejects_identity_and_secret_fields(self) -> None:
        self.assertTrue(
            keys_are_identity_free(
                {
                    "decision": "healthy",
                    "progress": {"completed_hours": 3, "missing_hours": 0},
                }
            )
        )
        for forbidden in ("station_id", "path_grid", "equipment_type", "secret"):
            with self.subTest(forbidden=forbidden):
                self.assertFalse(keys_are_identity_free({forbidden: "redacted"}))

    def test_dedicated_store_configuration_is_all_or_nothing(self) -> None:
        with self.assertRaises(RuntimeError):
            store_config({"PROPULSE_RESEARCH_HEALTH_STORE_URL": "https://store.test"})
        with self.assertRaises(RuntimeError):
            store_config({"PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY": "key"})
        self.assertEqual(
            store_config(
                {
                    "PROPULSE_RESEARCH_HEALTH_STORE_URL": "https://store.test/",
                    "PROPULSE_RESEARCH_HEALTH_STORE_SERVICE_KEY": "dedicated-key",
                    "VITE_SUPABASE_URL": "https://general.test",
                    "SUPABASE_SERVICE_ROLE_KEY": "general-key",
                }
            ),
            ("https://store.test", "dedicated-key"),
        )

    def test_general_store_is_only_the_complete_fallback(self) -> None:
        self.assertEqual(
            store_config(
                {
                    "VITE_SUPABASE_URL": "https://general.test/",
                    "SUPABASE_SERVICE_ROLE_KEY": "general-key",
                }
            ),
            ("https://general.test", "general-key"),
        )
        with self.assertRaises(RuntimeError):
            store_config({"VITE_SUPABASE_URL": "https://general.test"})

    def test_report_records_remote_heartbeat_without_enabling_public_view(self) -> None:
        values = {
            name: json.loads(path.read_text(encoding="utf-8"))
            for name, path in INPUTS.items()
        }
        evidence = build_evidence(
            values["transform_parity"],
            values["foundation_validation"],
            values["replay_validation"],
            values["migration_validation"],
            values["deployment_validation"],
            values["research_health_migration_validation"],
            values["research_health_deployment_validation"],
            values["research_health_endpoint_validation"],
            values["research_health_monitor_migration_validation"],
            values["research_health_monitor_deployment_validation"],
            values["research_health_external_monitor_validation"],
            values["research_participation_migration_validation"],
            values["research_participation_deployment_validation"],
            values["operational_weather_validation"],
            values["orchestration_validation"],
            values["wspr_live_connector_validation"],
            values["wspr_live_hour_validation"],
            values["wspr_research_schedule_validation"],
            values["wspr_research_shadow_progress"],
        )
        health = evidence["research_health"]
        self.assertTrue(health["remote_endpoint_configured"])
        self.assertTrue(health["remote_heartbeat_delivered"])
        self.assertTrue(health["monitor_migration_deployed"])
        self.assertTrue(health["external_monitor_invoked"])
        self.assertFalse(health["alert_delivery_configured"])
        self.assertFalse(health["public_view_enabled"])
        participation = evidence["research_participation"]
        self.assertTrue(participation["migration_deployed"])
        self.assertFalse(participation["frontend_enabled"])
        self.assertFalse(participation["server_enabled"])
        self.assertFalse(participation["real_consents_or_outcomes_collected"])


if __name__ == "__main__":
    unittest.main()
