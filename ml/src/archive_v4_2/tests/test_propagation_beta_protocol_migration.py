from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MIGRATION = (
    ROOT
    / "supabase/migrations/20260716013000_propagation_beta_protocol.sql"
)


class PropagationBetaProtocolMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = re.sub(r"\s+", " ", MIGRATION.read_text(encoding="utf-8").lower())

    def test_capability_classes_are_nullable_and_strictly_enumerated(self) -> None:
        for column in (
            "station_tx_class",
            "station_loss_class",
            "station_antenna_class",
            "station_rx_class",
            "station_supported",
        ):
            column_type = "boolean" if column == "station_supported" else "text"
            self.assertIn(
                f"add column if not exists {column} {column_type}",
                self.sql,
            )
            self.assertNotIn(f"{column} {column_type} not null", self.sql)
            if column_type == "text":
                self.assertIn(f"{column} is null or {column} in", self.sql)
        for value in (
            "lt_1w",
            "ge_500w",
            "lt_1db",
            "ge_6db",
            "lt_0dbi",
            "ge_10dbi",
            "relative",
            "catalog",
            "measured",
        ):
            self.assertIn(f"'{value}'", self.sql)

    def test_consent_update_atomically_scrubs_unselected_equipment_use(self) -> None:
        self.assertIn("set_propagation_research_consent", self.sql)
        self.assertIn("'derived_equipment_training' = any(normalized_uses)", self.sql)
        for column in (
            "station_tx_class",
            "station_loss_class",
            "station_antenna_class",
            "station_rx_class",
        ):
            self.assertIn(f"{column} = null", self.sql)
        self.assertNotIn("station_supported = null", self.sql)
        self.assertIn("not 'attempt_outcome_training' = any(normalized_uses)", self.sql)

    def test_withdrawal_and_retention_are_atomic_and_bounded(self) -> None:
        self.assertIn("interval '730 days'", self.sql)
        self.assertIn("withdraw_propagation_research_consent", self.sql)
        self.assertIn("prune_expired_propagation_research_data", self.sql)
        for table in (
            "public.propagation_outcomes",
            "public.propagation_attempts",
            "public.propagation_predictions",
        ):
            self.assertIn(f"delete from {table}", self.sql)
        self.assertIn("for update skip locked", self.sql)

    def test_aggregate_export_is_k_anonymous_and_consent_aware(self) -> None:
        self.assertIn("get_propagation_beta_evidence", self.sql)
        self.assertIn("count(distinct user_id) >= p_min_participants", self.sql)
        self.assertIn("count(*) >= p_min_outcomes", self.sql)
        self.assertIn("where dimension.value is not null", self.sql)
        self.assertIn("where mode = 'wspr' and task = 'receive'", self.sql)
        self.assertIn("monitoring_not_promotion_score", self.sql)
        self.assertIn("'participant_cap_applied', false", self.sql)
        self.assertIn("'reportable', false", self.sql)
        self.assertIn("'derived_equipment_training' = any(consent.allowed_uses)", self.sql)
        self.assertIn("prediction.station_supported is true", self.sql)
        self.assertNotIn("prediction.origin_grid4 as", self.sql)

    def test_functions_are_service_role_only(self) -> None:
        for function in (
            "set_propagation_research_consent",
            "withdraw_propagation_research_consent",
            "prune_expired_propagation_research_data",
            "get_propagation_beta_evidence",
        ):
            self.assertRegex(
                self.sql,
                rf"revoke all on function public\.{function}\([^;]+"
                r"\) from public, anon, authenticated;",
            )
            self.assertRegex(
                self.sql,
                rf"grant execute on function public\.{function}\([^;]+"
                r"\) to service_role;",
            )

    def test_prediction_writes_remain_server_authoritative(self) -> None:
        self.assertIn(
            "revoke insert, update on public.propagation_predictions "
            "from anon, authenticated",
            self.sql,
        )
        self.assertIn(
            "grant select, insert, update, delete on "
            "public.propagation_predictions to service_role",
            self.sql,
        )


if __name__ == "__main__":
    unittest.main()
