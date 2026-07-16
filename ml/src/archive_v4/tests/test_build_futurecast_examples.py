from __future__ import annotations

import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import polars as pl


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from build_futurecast_examples import (  # noqa: E402
    HF_BANDS,
    build_example_frame,
    derive_legal_issues,
    leakage_audit,
    model_feature_columns,
    scheduled_issue_time,
    source_partition_paths,
    split_for_issue,
)
from futurecast_examples import FEATURES  # noqa: E402


UTC = timezone.utc
ISSUE = datetime(2026, 7, 16, 12, 30, tzinfo=UTC)
VALID = ISSUE + timedelta(hours=3)
PROVIDER = "wspr.live-research-v1"
TRANSFORM = "wspr-opportunity-duckdb-v1"


def forecasts() -> pl.DataFrame:
    rows = []
    for (product, metric), cadence in FEATURES.items():
        valid_at = VALID.replace(minute=0, second=0, microsecond=0)
        if cadence == 24:
            valid_at = valid_at.replace(hour=0)
        else:
            valid_at = valid_at.replace(hour=valid_at.hour - valid_at.hour % 3)
        rows.append(
            {
                "payload_sha256": ("a" if "45_day" in product else "b") * 64,
                "product": product,
                "issued_at": datetime(2026, 7, 16, 0, tzinfo=UTC),
                "valid_at": valid_at,
                "available_at": datetime(2026, 7, 16, 12, 0, tzinfo=UTC),
                "metric": metric,
                "value": 10.0,
                "unit": None,
                "quality": "forecast",
            }
        )
    return pl.DataFrame(rows)


def aggregate_sources(*, future_history: bool = False) -> tuple[pl.DataFrame, pl.DataFrame]:
    outcome_hour = VALID.replace(minute=0, second=0, microsecond=0)
    history_hour = ISSUE.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    watermark_rows = []
    path_rows = []
    for band in HF_BANDS:
        for target_hour, available_at in (
            (outcome_hour, outcome_hour + timedelta(hours=1, minutes=15)),
            (
                history_hour,
                ISSUE + timedelta(minutes=1)
                if future_history
                else history_hour + timedelta(hours=1, minutes=15),
            ),
        ):
            watermark_rows.append(
                {
                    "target_hour": target_hour,
                    "band": band,
                    "available_at": available_at,
                    "status": "complete",
                    "source_watermark": target_hour + timedelta(hours=1),
                    "observation_count": 10,
                    "feature_cell_count": 1,
                    "provider": PROVIDER,
                    "transform_version": TRANSFORM,
                    "quality_flags": [],
                }
            )
            path_rows.append(
                {
                    "target_hour": target_hour,
                    "band": band,
                    "tx_grid4": "EM10",
                    "rx_grid4": "IO91",
                    "successes": 2.0,
                    "opportunities": 10.0,
                    "success_rate": 0.2,
                    "sampled_rows": 10,
                    "positive_rows": 2,
                    "available_at": available_at,
                    "source_watermark": target_hour + timedelta(hours=1),
                    "provider": PROVIDER,
                    "transform_version": TRANSFORM,
                    "quality_flags": [],
                }
            )
    return pl.DataFrame(path_rows), pl.DataFrame(watermark_rows)


class BuildFutureCastExamplesTests(unittest.TestCase):
    def test_issue_time_is_first_configured_boundary_after_availability(self) -> None:
        self.assertEqual(
            scheduled_issue_time("2026-07-16T11:58:00+00:00", 30),
            datetime(2026, 7, 16, 12, 30, tzinfo=UTC),
        )
        self.assertEqual(
            scheduled_issue_time("2026-07-16T12:15:00+00:00", 30),
            datetime(2026, 7, 16, 12, 30, tzinfo=UTC),
        )

    def test_derives_complete_direct_horizon_issue(self) -> None:
        result = derive_legal_issues(
            forecasts(),
            start=date(2026, 7, 16),
            end=date(2026, 7, 16),
            issue_minute=30,
            horizons=[3],
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["issue_time"], ISSUE.isoformat())
        self.assertEqual(result[0]["valid_time"], VALID.isoformat())

    def test_does_not_mix_metrics_across_product_payloads(self) -> None:
        frame = forecasts()
        newer_partial = frame.filter(
            (pl.col("product") == "noaa_45_day_ap_f107")
            & (pl.col("metric") == "ap")
        ).with_columns(
            pl.lit("c" * 64).alias("payload_sha256"),
            pl.lit(datetime(2026, 7, 16, 6, tzinfo=UTC)).alias("issued_at"),
            pl.lit(datetime(2026, 7, 16, 12, 10, tzinfo=UTC)).alias(
                "available_at"
            ),
            pl.lit(99.0).alias("value"),
        )
        result = derive_legal_issues(
            pl.concat([frame, newer_partial]),
            start=ISSUE.date(),
            end=ISSUE.date(),
            issue_minute=30,
            horizons=[3],
        )
        self.assertEqual(len(result), 1)
        issuance = result[0]["issuances"]["noaa_45_day_ap_f107"]
        self.assertEqual(issuance["payload_sha256"], "a" * 64)
        self.assertEqual(
            result[0]["values"]["forecast__noaa_45_day_ap_f107__ap"],
            10.0,
        )

    def test_builds_weighted_path_examples_with_causal_history(self) -> None:
        path_rows, watermarks = aggregate_sources()
        forecast = derive_legal_issues(
            forecasts(),
            start=ISSUE.date(),
            end=ISSUE.date(),
            issue_minute=30,
            horizons=[3],
        )[0]
        frame = build_example_frame(
            paths=path_rows,
            watermarks=watermarks,
            forecast=forecast,
            provider=PROVIDER,
            transform_version=TRANSFORM,
            history_lags=[1, 2, 3, 24],
            split="train",
        )
        self.assertEqual(frame.height, 10)
        self.assertEqual(set(frame.get_column("band")), set(HF_BANDS))
        self.assertEqual(set(frame.get_column("path_prev1_available")), {1})
        self.assertEqual(set(frame.get_column("path_prev24_available")), {0})
        self.assertTrue(all(leakage_audit(frame, [1, 2, 3, 24]).values()))
        self.assertTrue((frame.get_column("dist_km") > 0).all())
        self.assertEqual(float(frame.get_column("opportunities").sum()), 100.0)
        columns = model_feature_columns([1, 2, 3, 24])
        self.assertTrue(set(columns["direct"]).issubset(frame.columns))
        self.assertTrue(set(columns["weather_only"]).issubset(frame.columns))
        self.assertNotIn("tx_grid4", columns["direct"])
        self.assertNotIn("rx_grid4", columns["direct"])
        early_outcome = frame.with_columns(
            pl.lit(VALID).alias("outcome_available_at")
        )
        with self.assertRaisesRegex(RuntimeError, "outcome_available_after_hour_close"):
            leakage_audit(early_outcome, [1, 2, 3, 24])
        with self.assertRaisesRegex(RuntimeError, "unique_path_keys"):
            leakage_audit(pl.concat([frame, frame]), [1, 2, 3, 24])

    def test_daily_partition_paths_are_deduplicated(self) -> None:
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "wspr_paths/target_date=2026-07-16/part-000.parquet"
            path.parent.mkdir(parents=True)
            path.touch()
            paths = source_partition_paths(
                root,
                "wspr_paths",
                [ISSUE, ISSUE + timedelta(hours=1), ISSUE + timedelta(hours=2)],
            )
            self.assertEqual(paths, [path])

    def test_excludes_history_not_available_by_issue_time(self) -> None:
        path_rows, watermarks = aggregate_sources(future_history=True)
        forecast = derive_legal_issues(
            forecasts(),
            start=ISSUE.date(),
            end=ISSUE.date(),
            issue_minute=30,
            horizons=[3],
        )[0]
        frame = build_example_frame(
            paths=path_rows,
            watermarks=watermarks,
            forecast=forecast,
            provider=PROVIDER,
            transform_version=TRANSFORM,
            history_lags=[1],
            split="train",
        )
        self.assertEqual(set(frame.get_column("path_prev1_available")), {0})
        self.assertEqual(set(frame.get_column("path_success_prev1")), {0.0})

    def test_split_is_chronological_and_day_blocked(self) -> None:
        split_days = {"train": 60, "calibration": 15, "gate": 15}
        start = date(2026, 7, 16)
        self.assertEqual(split_for_issue(ISSUE, start=start, split_days=split_days), "train")
        self.assertEqual(
            split_for_issue(ISSUE + timedelta(days=60), start=start, split_days=split_days),
            "calibration",
        )
        self.assertEqual(
            split_for_issue(ISSUE + timedelta(days=75), start=start, split_days=split_days),
            "gate",
        )
        with self.assertRaisesRegex(ValueError, "outside"):
            split_for_issue(ISSUE + timedelta(days=90), start=start, split_days=split_days)


if __name__ == "__main__":
    unittest.main()
