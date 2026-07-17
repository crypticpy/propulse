from __future__ import annotations

import hashlib
import hmac
import json
import sys
import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import polars as pl


MODULE = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(MODULE))

from export_stationcast_beta_private import rows_to_batch, secret_bytes  # noqa: E402
from generate_stationcast_beta_operations_receipt import (  # noqa: E402
    build_receipt,
    telemetry_signature,
    validate_api_telemetry,
    validate_stop_monitor_receipt,
)
from score_stationcast_beta import (  # noqa: E402
    participant_cap_weights,
    score_beta,
    validate_export_receipt,
    validate_operations_receipt,
    validate_private_input_binding,
)


CONFIG = json.loads(
    (ROOT / "ml/config/propagation_v4_2_beta_protocol.json").read_text(
        encoding="utf-8"
    )
)


def fixture_frame(participants: int = 20, rows_each: int = 20) -> pl.DataFrame:
    rows = []
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    bands = ["80m", "40m", "20m", "15m", "10m"]
    fields = ["EM", "FN", "IO", "JN"]
    tx_classes = ["5_25w", "25_100w", "100_500w"]
    for participant in range(participants):
        for index in range(rows_each):
            observed = (participant + index) % 2
            rows.append({
                "participant_key": f"private-{participant:02d}",
                "observed_at": start + timedelta(days=index % 7, minutes=participant),
                "band": bands[index % len(bands)],
                "mode": "WSPR",
                "task": "receive",
                "evidence_tier": "A" if index % 2 == 0 else "B",
                "origin_field": fields[participant % len(fields)],
                "station_tx_class": tx_classes[participant % len(tx_classes)],
                "station_loss_class": "1_3db",
                "station_antenna_class": "3_6dbi",
                "station_rx_class": "catalog",
                "profile": "nowcast",
                "station_supported": True,
                "ood_count": 0,
                "observed": observed,
                "core_probability": 0.5,
                "stationcast_probability": 0.8 if observed else 0.2,
            })
    return pl.DataFrame(rows)


def test_config() -> dict:
    config = deepcopy(CONFIG)
    config["beta"].update({
        "minimum_participants": 20,
        "minimum_weighted_primary_outcomes": 400,
        "minimum_tier_a_outcomes": 200,
        "minimum_calendar_days": 7,
        "minimum_supported_bands": 5,
        "minimum_band_outcomes": 20,
        "minimum_geography_cells": 4,
        "minimum_capability_cells": 3,
        "minimum_cell_outcomes": 20,
        "maximum_ece_degradation": 0.3,
        "maximum_high_confidence_gap_degradation": 0.3,
        "bootstrap_repetitions": 2_000,
    })
    return config


class StationCastBetaScoringTests(unittest.TestCase):
    def test_participant_cap_bounds_a_dominant_operator(self) -> None:
        keys = np.array(["dominant"] * 100 + [f"p{index}" for index in range(9) for _ in range(10)])
        weights, summary = participant_cap_weights(keys, 0.1)

        self.assertAlmostEqual(summary["largest_weight_share"], 0.1, places=10)
        self.assertGreater(weights.sum(), 0)
        self.assertLess(weights[:100].sum(), 100)

    def test_positive_fixture_passes_and_never_writes_private_keys(self) -> None:
        result = score_beta(fixture_frame(), test_config())

        self.assertEqual(result["decision"], "pass")
        self.assertTrue(result["release_approved"])
        self.assertTrue(all(result["gates"].values()))
        text = json.dumps(result, sort_keys=True)
        self.assertNotIn("private-00", text)
        self.assertNotIn("participant_key", text)

    def test_active_stop_condition_fails_an_otherwise_positive_result(self) -> None:
        result = score_beta(
            fixture_frame(),
            test_config(),
            active_stop_conditions=["receipt_integrity"],
        )

        self.assertFalse(result["release_approved"])
        self.assertEqual(result["blockers"], ["no_active_stop_condition"])

    def test_band_gate_uses_the_dedicated_outcome_threshold(self) -> None:
        config = test_config()
        config["beta"]["minimum_band_outcomes"] = 81
        result = score_beta(fixture_frame(), config)

        self.assertFalse(result["gates"]["minimum_supported_bands"])
        self.assertEqual(result["coverage"]["supported_band_cells"], 0)

    def test_calendar_gate_counts_distinct_observed_days_not_elapsed_span(self) -> None:
        start = datetime(2026, 7, 1, tzinfo=timezone.utc)
        frame = fixture_frame()
        sparse_dates = [
            start + timedelta(days=29 if index % 2 else 0, minutes=index)
            for index in range(frame.height)
        ]
        result = score_beta(
            frame.with_columns(pl.Series("observed_at", sparse_dates)),
            test_config(),
        )

        self.assertFalse(result["gates"]["minimum_calendar_days"])
        self.assertEqual(result["calendar_days"], 2)

    def test_high_confidence_overprediction_stop_is_independent(self) -> None:
        result = score_beta(
            fixture_frame().with_columns(
                pl.lit(0.9).alias("stationcast_probability")
            ),
            test_config(),
        )

        self.assertFalse(
            result["gates"]["high_confidence_overprediction_below_stop"]
        )

    def test_capability_gate_requires_distinct_combined_station_cells(self) -> None:
        homogeneous = fixture_frame().with_columns(
            pl.lit("25_100w").alias("station_tx_class")
        )
        result = score_beta(homogeneous, test_config())

        self.assertFalse(result["gates"]["minimum_capability_cells"])
        self.assertEqual(result["coverage"]["capability_cells"], 1)

    def test_subthreshold_cohort_suppresses_counts_and_metrics(self) -> None:
        result = score_beta(fixture_frame(participants=2, rows_each=2), test_config())

        self.assertFalse(result["primary_cohort_reportable"])
        self.assertNotIn("participants", result)
        self.assertNotIn("primary_rows", result)
        self.assertNotIn("metrics", result)

    def test_private_export_batch_hashes_ids_and_secret_is_owner_only(self) -> None:
        secret = b"x" * 32
        row = (
            "d7c4604a-f3bd-411b-b2e6-9999e50709cd",
            datetime(2026, 7, 16, tzinfo=timezone.utc),
            "20m", "WSPR", "receive", "A", "EM",
            "25_100w", "1_3db", "3_6dbi", "catalog",
            "nowcast", True, 0, 1, 0.4, 0.5,
        )
        batch = rows_to_batch([row], secret)
        participant = batch.column(0)[0].as_py()
        self.assertEqual(len(participant), 64)
        self.assertNotEqual(participant, row[0])
        self.assertNotIn(row[0], str(batch.to_pydict()))

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "secret"
            path.write_bytes(secret)
            path.chmod(0o600)
            self.assertEqual(secret_bytes(path), secret)
            binary_secret = b"\n" + b"x" * 31
            path.write_bytes(binary_secret)
            self.assertEqual(secret_bytes(path), binary_secret)
            path.chmod(0o644)
            with self.assertRaisesRegex(RuntimeError, "owner-only"):
                secret_bytes(path)

    def test_private_export_receipt_and_window_bind_the_scored_rows(self) -> None:
        frame = fixture_frame()
        start = datetime(2026, 7, 1, tzinfo=timezone.utc)
        end = datetime(2026, 8, 1, tzinfo=timezone.utc)
        parquet_digest = "a" * 64
        config_digest = "b" * 64
        export = {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scope": "private_stationcast_beta_export",
            "protocol_version": CONFIG["protocol_version"],
            "policy_version": CONFIG["policy_version"],
            "window": {"start": start.isoformat(), "end": end.isoformat()},
            "rows": frame.height,
            "parquet_sha256": parquet_digest,
            "config_sha256": config_digest,
            "private_path_recorded": False,
            "runtime": {"machine": "arm64", "physical_cores_visible": 18},
            "privacy": {
                "user_ids_written": False,
                "pseudonymous_participant_key_private_only": True,
                "exact_grid4_written": False,
                "raw_station_inventory_written": False,
                "secret_value_written": False,
            },
        }
        valid, errors = validate_export_receipt(
            export,
            CONFIG,
            parquet_sha256=parquet_digest,
            config_sha256=config_digest,
        )
        operations = {
            "window": export["window"],
            "audit": {"database": {"binary_outcomes": frame.height}},
        }

        self.assertTrue(valid, errors)
        self.assertEqual(validate_private_input_binding(frame, export, operations), [])
        export["rows"] -= 1
        self.assertIn(
            "export_row_count",
            validate_private_input_binding(frame, export, operations),
        )

    def test_real_operations_receipt_is_aggregate_and_fail_closed(self) -> None:
        start = datetime(2026, 8, 1, tzinfo=timezone.utc)
        end = datetime(2026, 9, 1, tzinfo=timezone.utc)
        database = {
            "predictions": 2_100,
            "attempts": 2_000,
            "binary_outcomes": 1_900,
            "not_attempted": 50,
            "unknown": 25,
            "open_attempts": 25,
            "fallback_predictions": 30,
            "unsupported_predictions": 20,
            "ood_predictions": 10,
            "withdrawals": 2,
            "withdrawn_rows_remaining": 0,
            "expired_rows_remaining": 0,
        }
        telemetry = {
            "counts": {
                "requests": 4_100,
                "errors": 4,
                "integrity_errors": 0,
                "privacy_events": 0,
                "consent_errors": 0,
                "subject_binding_errors": 0,
                "stale_profile_events": 0,
                "equipment_math_events": 0,
                "unsupported_support_events": 0,
                "high_confidence_overprediction_events": 0,
                "geographic_regression_events": 0,
            }
        }
        stop_monitor = {
            "decision": "continue",
            "config_sha256": "b" * 64,
            "evidence_sha256": "c" * 64,
        }
        receipt = build_receipt(
            database,
            telemetry,
            [],
            CONFIG,
            window_start=start,
            window_end=end,
            runtime={"physical_cores_visible": 18},
            telemetry_sha256="a" * 64,
            config_sha256="b" * 64,
            wall_seconds=0.1,
            stop_monitor=stop_monitor,
            stop_monitor_errors=[],
            stop_monitor_sha256="d" * 64,
        )

        valid, errors = validate_operations_receipt(
            receipt,
            CONFIG,
            allow_synthetic=False,
        )
        self.assertTrue(valid, errors)
        self.assertEqual(receipt["decision"], "pass")
        self.assertAlmostEqual(
            receipt["audit"]["rates"]["attempt_without_recorded_outcome"],
            0.0125,
        )
        self.assertNotIn("user", json.dumps(receipt).lower())
        receipt["inputs"]["stop_monitor_decision"] = "stop"
        valid, errors = validate_operations_receipt(
            receipt,
            CONFIG,
            allow_synthetic=False,
        )
        self.assertFalse(valid)
        self.assertIn("inputs", errors)
        receipt["inputs"]["stop_monitor_decision"] = "continue"

        database["withdrawn_rows_remaining"] = 1
        blocked = build_receipt(
            database,
            telemetry,
            [],
            CONFIG,
            window_start=start,
            window_end=end,
            runtime={"physical_cores_visible": 18},
            telemetry_sha256="a" * 64,
            config_sha256="b" * 64,
            wall_seconds=0.1,
            stop_monitor=stop_monitor,
            stop_monitor_errors=[],
            stop_monitor_sha256="d" * 64,
        )
        self.assertEqual(blocked["decision"], "withheld")
        self.assertIn("withdrawal_deletion_integrity", blocked["active_stop_conditions"])

    def test_api_telemetry_requires_signature_window_and_aggregate_counts(self) -> None:
        start = datetime(2026, 8, 1, tzinfo=timezone.utc)
        end = datetime(2026, 9, 1, tzinfo=timezone.utc)
        telemetry = {
            "schema_version": 1,
            "scope": "stationcast_beta_api_telemetry",
            "protocol_version": CONFIG["protocol_version"],
            "window": {"start": start.isoformat(), "end": end.isoformat()},
            "counts": {
                "requests": 10,
                "errors": 0,
                "integrity_errors": 0,
                "privacy_events": 0,
                "consent_errors": 0,
                "subject_binding_errors": 0,
                "stale_profile_events": 0,
                "equipment_math_events": 0,
                "unsupported_support_events": 0,
                "high_confidence_overprediction_events": 0,
                "geographic_regression_events": 0,
            },
            "participant_data_present": False,
        }
        secret = b"t" * 32
        telemetry["signature"] = telemetry_signature(telemetry, secret)
        self.assertEqual(
            validate_api_telemetry(
                telemetry,
                CONFIG,
                window_start=start,
                window_end=end,
                secret=secret,
            ),
            [],
        )
        telemetry["signature"] = "0" * 64
        self.assertIn(
            "api_telemetry_signature",
            validate_api_telemetry(
                telemetry,
                CONFIG,
                window_start=start,
                window_end=end,
                secret=secret,
            ),
        )

        telemetry["signature"] = telemetry_signature(telemetry, secret)
        telemetry["raw_participant_rows"] = []
        telemetry["signature"] = telemetry_signature(telemetry, secret)
        self.assertIn(
            "api_telemetry_fields",
            validate_api_telemetry(
                telemetry,
                CONFIG,
                window_start=start,
                window_end=end,
                secret=secret,
            ),
        )
        telemetry.pop("raw_participant_rows")
        telemetry["counts"]["requests"] = True
        telemetry["signature"] = telemetry_signature(telemetry, secret)
        self.assertIn(
            "api_telemetry_counts",
            validate_api_telemetry(
                telemetry,
                CONFIG,
                window_start=start,
                window_end=end,
                secret=secret,
            ),
        )

    def test_stop_monitor_receipt_is_signed_fresh_and_config_bound(self) -> None:
        operations_start = datetime(2026, 8, 1, tzinfo=timezone.utc)
        operations_end = datetime(2026, 9, 1, tzinfo=timezone.utc)
        config_digest = "b" * 64
        payload = {
            "schema_version": 1,
            "generated_at": operations_end.isoformat(),
            "scope": "stationcast_beta_weekly_stop_monitor",
            "protocol_version": CONFIG["protocol_version"],
            "config_sha256": config_digest,
            "evidence_sha256": "c" * 64,
            "window": {
                "start": (operations_end - timedelta(days=8)).isoformat(),
                "end": (operations_end - timedelta(days=1)).isoformat(),
            },
            "decision": "continue",
            "aggregate_only": True,
            "stop_counters_emitted": {},
            "high_confidence": {
                "eligible": True,
                "maximum_overprediction": 0.05,
            },
            "geographic": {
                "reportable_cells": 4,
                "regression_present": False,
            },
            "geographic_regression_streak": 0,
        }
        signed_payload = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
        )
        secret = b"m" * 32
        receipt = {
            "schema_version": 1,
            "scope": "stationcast_beta_signed_stop_monitor_receipt",
            "signed_payload": signed_payload,
            "hmac_sha256": hmac.new(
                secret,
                signed_payload.encode(),
                hashlib.sha256,
            ).hexdigest(),
        }

        decoded, errors = validate_stop_monitor_receipt(
            receipt,
            CONFIG,
            operations_start=operations_start,
            operations_end=operations_end,
            secret=secret,
            config_sha256=config_digest,
        )

        self.assertEqual(errors, [])
        self.assertEqual(decoded, payload)
        receipt["hmac_sha256"] = "0" * 64
        _decoded, errors = validate_stop_monitor_receipt(
            receipt,
            CONFIG,
            operations_start=operations_start,
            operations_end=operations_end,
            secret=secret,
            config_sha256=config_digest,
        )
        self.assertIn("stop_monitor_signature", errors)
        payload["decision"] = "already_evaluated"
        signed_payload = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
        )
        receipt["signed_payload"] = signed_payload
        receipt["hmac_sha256"] = hmac.new(
            secret,
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        _decoded, errors = validate_stop_monitor_receipt(
            receipt,
            CONFIG,
            operations_start=operations_start,
            operations_end=operations_end,
            secret=secret,
            config_sha256=config_digest,
        )
        self.assertIn("stop_monitor_payload", errors)

        payload["decision"] = "continue"
        payload["stop_counters_emitted"] = {
            "high_confidence_overprediction_events": 1,
        }
        signed_payload = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
        )
        receipt["signed_payload"] = signed_payload
        receipt["hmac_sha256"] = hmac.new(
            secret,
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        _decoded, errors = validate_stop_monitor_receipt(
            receipt,
            CONFIG,
            operations_start=operations_start,
            operations_end=operations_end,
            secret=secret,
            config_sha256=config_digest,
        )
        self.assertIn("stop_monitor_consistency", errors)

if __name__ == "__main__":
    unittest.main()
