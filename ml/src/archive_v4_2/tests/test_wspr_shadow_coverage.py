from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from analyze_wspr_shadow_coverage import (  # noqa: E402
    DISTANCE_QUERY,
    HOURLY_QUERY,
    REGION_QUERY,
    aggregate_region_chunks,
    build_coverage_receipt,
    hour_chunks,
    jensen_shannon_divergence,
    scheduled_audit_window,
)


START = datetime(2026, 7, 1, tzinfo=timezone.utc)
RUNTIME = {"machine": "arm64", "physical_cores_visible": 18}
BANDS = (
    "160m",
    "80m",
    "60m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
)
DISTANCES = (
    "<1,000 km",
    "1,000-3,000 km",
    "3,000-6,000 km",
    "6,000-10,000 km",
    "10,000+ km",
)


def evidence(hours: int, *, late_multiplier: int = 1) -> tuple[list[dict], list[dict], list[dict]]:
    hourly: list[dict] = []
    distance: list[dict] = []
    for offset in range(hours):
        target = START + timedelta(hours=offset)
        multiplier = late_multiplier if offset >= hours - 168 else 1
        for band_index, band in enumerate(BANDS):
            hourly.append(
                {
                    "target_hour": target,
                    "band": band,
                    "feature_cells": (100 + band_index) * multiplier,
                    "sampled_rows": (1000 + band_index) * multiplier,
                }
            )
            distance.append(
                {
                    "target_hour": target,
                    "band": band,
                    "distance_bucket": DISTANCES[band_index % len(DISTANCES)],
                    "feature_cells": (100 + band_index) * multiplier,
                    "sampled_rows": (1000 + band_index) * multiplier,
                }
            )
    regions = [
        {
            "dimension": "origin",
            "region": "EM",
            "band": "20m",
            "feature_cells": 500,
            "completed_hours": 12,
            "sampled_rows": 5000,
        }
    ]
    return hourly, regions, distance


def receipt(hours: int, *, late_multiplier: int = 1) -> dict:
    hourly, regions, distance = evidence(hours, late_multiplier=late_multiplier)
    return build_coverage_receipt(
        generated_at=START + timedelta(hours=hours),
        window_start=START,
        window_end=START + timedelta(hours=hours - 1),
        hourly_rows=hourly,
        region_rows=regions,
        distance_rows=distance,
        runtime=RUNTIME,
        provider="wspr.live-research-v1",
        transform_version="wspr-opportunity-duckdb-v1",
        query_seconds={"hourly": 0.1},
        window_provenance={
            "source_scope": "wspr_research_shadow_progress",
            "progress_sha256": "a" * 64,
            "scheduled_expected_hours": hours,
            "audited_start": START.isoformat(),
            "audited_end": (START + timedelta(hours=hours - 1)).isoformat(),
            "audited_expected_hours": hours,
        },
        query_chunk_hours=24,
        query_chunk_count=(hours + 23) // 24,
        query_max_seconds={"hourly": 0.1},
    )


class WsprShadowCoverageTests(unittest.TestCase):
    def test_hour_chunks_are_gap_free_and_capped(self) -> None:
        chunks = hour_chunks(START, START + timedelta(hours=54))

        self.assertEqual(len(chunks), 3)
        self.assertEqual(chunks[0], (START, START + timedelta(hours=23)))
        self.assertEqual(chunks[-1], (
            START + timedelta(hours=48),
            START + timedelta(hours=54),
        ))
        self.assertTrue(all(
            following[0] == current[1] + timedelta(hours=1)
            for current, following in zip(chunks, chunks[1:])
        ))

    def test_region_chunks_aggregate_before_suppression_and_cap(self) -> None:
        rows = []
        for index in range(14):
            region = f"A{chr(ord('A') + index)}"
            rows.extend((
                {
                    "dimension": "origin",
                    "region": region,
                    "band": "20m",
                    "feature_cells": 60,
                    "completed_hours": 3,
                    "sampled_rows": 600,
                },
                {
                    "dimension": "origin",
                    "region": region,
                    "band": "20m",
                    "feature_cells": 60,
                    "completed_hours": 3,
                    "sampled_rows": 600,
                },
            ))

        result = aggregate_region_chunks(rows)

        self.assertEqual(len(result), 12)
        self.assertTrue(all(row["eligible_region_count"] == 14 for row in result))
        self.assertEqual([row["coverage_rank"] for row in result], list(range(1, 13)))

    def test_audit_window_is_bound_to_scheduled_receipt_progress(self) -> None:
        progress = {
            "schema_version": 1,
            "scope": "wspr_research_shadow_progress",
            "decision": "collecting",
            "operational_status": "healthy",
            "research_only": True,
            "subscriber_facing_authorized": False,
            "locked_outcomes_read": False,
            "gates": {
                "secret_file_owner_only": True,
                "all_receipts_and_manifests_valid": True,
                "all_ten_bands_present_each_hour": True,
                "receipt_timestamps_causal": True,
                "m5_multicore_profile_exact": True,
                "one_source_request_per_hour": True,
                "no_future_target_receipts": True,
                "completed_hours_within_7200_seconds": True,
                "scheduled_completion_rate_at_least_99_percent": True,
                "minimum_30_day_window_complete": False,
                "locked_outcomes_unread": True,
            },
            "window": {
                "start_target_hour": "2026-07-16T03:00:00+00:00",
                "latest_settled_target_hour": "2026-07-16T15:00:00+00:00",
                "expected_hours": 13,
                "completed_hours": 13,
                "missing_hours": 0,
            },
        }
        start, end, provenance = scheduled_audit_window(progress, "b" * 64)

        self.assertEqual(start.isoformat(), "2026-07-16T03:00:00+00:00")
        self.assertEqual(end.isoformat(), "2026-07-16T15:00:00+00:00")
        self.assertEqual(provenance["audited_expected_hours"], 13)

    def test_jsd_is_symmetric_bounded_and_zero_for_equal_mass(self) -> None:
        self.assertEqual(jensen_shannon_divergence({"a": 1}, {"a": 4}), 0.0)
        separated = jensen_shannon_divergence({"a": 1}, {"b": 1})
        self.assertAlmostEqual(separated, 1.0)
        self.assertEqual(
            separated,
            jensen_shannon_divergence({"b": 1}, {"a": 1}),
        )

    def test_short_window_is_honestly_collecting(self) -> None:
        result = receipt(12)
        self.assertEqual(result["decision"], "collecting")
        self.assertEqual(result["operational_status"], "healthy")
        self.assertFalse(result["gates"]["window_spans_720_hours"])
        self.assertFalse(result["drift"]["sample_sufficient"])
        self.assertIsNone(result["drift"]["early_feature_cells"])
        self.assertIsNone(result["drift"]["late_to_early_volume_ratio"])
        self.assertFalse(result["privacy"]["locked_outcomes_read"])

    def test_complete_stable_window_passes(self) -> None:
        result = receipt(720)
        self.assertEqual(result["decision"], "pass")
        self.assertTrue(all(result["gates"].values()))
        self.assertEqual(result["window"]["completed_hours"], 720)
        self.assertEqual(result["coverage"]["observed_utc_hours"], list(range(24)))

    def test_large_volume_shift_fails_final_drift_gate(self) -> None:
        result = receipt(720, late_multiplier=3)
        self.assertEqual(result["decision"], "collecting")
        self.assertFalse(
            result["gates"]["aggregate_source_distribution_stable"]
        )
        self.assertEqual(result["drift"]["late_to_early_volume_ratio"], 3.0)

    def test_unsuppressed_region_or_wrong_runtime_is_invalid(self) -> None:
        hourly, regions, distance = evidence(12)
        regions[0]["feature_cells"] = 99
        result = build_coverage_receipt(
            generated_at=START + timedelta(hours=12),
            window_start=START,
            window_end=START + timedelta(hours=11),
            hourly_rows=hourly,
            region_rows=regions,
            distance_rows=distance,
            runtime={"machine": "x86_64", "physical_cores_visible": 18},
            provider="wspr.live-research-v1",
            transform_version="wspr-opportunity-duckdb-v1",
            query_seconds={},
            window_provenance={
                "source_scope": "wspr_research_shadow_progress",
                "progress_sha256": "a" * 64,
                "scheduled_expected_hours": 12,
                "audited_start": START.isoformat(),
                "audited_end": (START + timedelta(hours=11)).isoformat(),
                "audited_expected_hours": 12,
            },
            query_chunk_hours=24,
            query_chunk_count=1,
            query_max_seconds={},
        )
        self.assertEqual(result["decision"], "invalid")
        self.assertFalse(result["gates"]["region_output_k_suppressed"])
        self.assertFalse(result["gates"]["native_m5_validation"])

    def test_queries_use_only_aggregate_private_feature_tables(self) -> None:
        sql = "\n".join((HOURLY_QUERY, REGION_QUERY, DISTANCE_QUERY)).lower()
        self.assertIn("wspr_feature_watermarks", sql)
        self.assertIn("wspr_path_hourly_features", sql)
        for forbidden in (
            "wspr_observations_rolling",
            "tx_call",
            "rx_call",
            "propagation_outcomes",
            "ml_research_consents",
        ):
            self.assertNotIn(forbidden, sql)
        result = receipt(12)
        serialized = json.dumps(result)
        self.assertNotIn("tx_grid4", serialized)
        self.assertNotIn("rx_grid4", serialized)
        self.assertTrue(
            all(
                len(row.get("region", "")) == 2
                for row in result["coverage"]["regional_fields"]
            )
        )
        self.assertNotIn("grid4", " ".join(
            row.get("region", "")
            for row in result["coverage"]["regional_fields"]
        ).lower())


if __name__ == "__main__":
    unittest.main()
