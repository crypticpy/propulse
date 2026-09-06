from __future__ import annotations

import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import polars as pl


V3 = Path(__file__).resolve().parents[2] / "archive_v3"
sys.path.insert(0, str(V3))

from build_features import (  # noqa: E402
    FEATURE_CONTRACT,
    FIELD_RECENCY_COLUMNS,
    add_polars_features,
    split_sql,
    write_feature_base,
)


HOUR0 = datetime(2024, 10, 1, 0, tzinfo=timezone.utc)
HOUR1 = datetime(2024, 10, 1, 1, tzinfo=timezone.utc)
HOUR2 = datetime(2024, 10, 1, 2, tzinfo=timezone.utc)


def opportunity_frame(rows: list[tuple]) -> pl.DataFrame:
    return pl.DataFrame(
        rows,
        schema={
            "target_hour": pl.Datetime("us", "UTC"),
            "band": pl.String,
            "tx_grid4": pl.String,
            "rx_grid4": pl.String,
            "power_bin_dbm": pl.Float64,
            "successes": pl.Float64,
            "opportunities": pl.Float64,
            "positive_rows": pl.Int32,
            "sampled_rows": pl.Int32,
        },
        orient="row",
    ).with_columns(
        (pl.col("successes") / pl.col("opportunities")).alias("success_rate"),
        (pl.col("successes") > 0).cast(pl.UInt8).alias("any_success"),
    )


def weather_frame() -> pl.DataFrame:
    hours = [HOUR0, HOUR1, HOUR2]
    return pl.DataFrame(
        {
            "observed_hour": hours,
            "available_at": hours,
            "kp": [1.0, 2.0, 3.0],
            "ae": [100.0, 110.0, 120.0],
        },
        schema={
            "observed_hour": pl.Datetime("us", "UTC"),
            "available_at": pl.Datetime("us", "UTC"),
            "kp": pl.Float64,
            "ae": pl.Float64,
        },
    )


class BuildFeaturesRecencyTests(unittest.TestCase):
    def test_field_recency_lags_join_alongside_grid4_lags(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "part.parquet"
            weather = root / "weather.parquet"
            base = root / "base.parquet"
            # Hour 0: EM10->IO91 succeeds 1 of 4; EM12->IO91 heard; FN31->JN18 heard.
            # Hour 1: EM10->IO91 fails 0 of 2; FN31->JN18 succeeds.
            # Hour 2: EM10->IO91 sampled only (no positives anywhere in the hour).
            opportunity_frame(
                [
                    (HOUR0, "20m", "EM10", "IO91", 37.0, 1.0, 4.0, 1, 4),
                    (HOUR0, "20m", "EM12", "IO91", 37.0, 2.0, 2.0, 2, 2),
                    (HOUR0, "20m", "FN31", "JN18", 30.0, 1.0, 1.0, 1, 1),
                    (HOUR1, "20m", "EM10", "IO91", 37.0, 0.0, 2.0, 0, 2),
                    (HOUR1, "20m", "FN31", "JN18", 30.0, 1.0, 3.0, 1, 3),
                    (HOUR2, "20m", "EM10", "IO91", 37.0, 0.0, 2.0, 0, 2),
                ]
            ).write_parquet(source)
            weather_frame().write_parquet(weather)
            con = duckdb.connect()
            con.execute("SET TimeZone='UTC'")
            split = split_sql(
                {
                    "train": {"months": []},
                    "validation": {"months": ["2024-10"]},
                    "test": {"months": []},
                }
            )
            write_feature_base(con, source=source, weather=weather, base=base, split=split)
            frame = pl.read_parquet(base).sort(["target_hour", "tx_grid4", "rx_grid4"])
            names = frame.columns
            self.assertEqual(frame.height, 6)
            for column in FIELD_RECENCY_COLUMNS:
                self.assertIn(column, names)
            for lag in (1, 2, 3, 24):
                self.assertIn(f"wspr_path_success_prev{lag}", names)
                self.assertIn(f"wspr_path_prev{lag}_available", names)
            # Existing columns keep their order; the v2 columns are appended.
            self.assertLess(names.index("split"), names.index("path_success_prev1"))
            self.assertLess(names.index("wspr_path_prev24_available"), names.index("split"))
            self.assertIn("ae", names)
            self.assertEqual(frame["split"].unique().to_list(), ["validation"])

            def row(hour: datetime, tx: str, rx: str) -> dict:
                return frame.filter(
                    (pl.col("target_hour") == hour)
                    & (pl.col("tx_grid4") == tx)
                    & (pl.col("rx_grid4") == rx)
                ).row(0, named=True)

            first = row(HOUR0, "EM10", "IO91")
            self.assertEqual(first["path_prev1_available"], 0)
            self.assertEqual(first["path_success_prev1"], 0.0)
            self.assertEqual(first["path_recency_rate_prev1"], 0.0)
            self.assertEqual(first["wspr_path_prev1_available"], 0)
            self.assertEqual(first["wspr_path_success_prev1"], 0.0)

            second = row(HOUR1, "EM10", "IO91")
            # Field grain at hour 0: IO heard only EM (EM10 and EM12 collapse)
            # and JN heard only FN, so both exposures are 1 -> rate 1.0, and
            # the two 20m pairs tie -> percent_rank 0.
            self.assertEqual(second["path_prev1_available"], 1)
            self.assertEqual(second["path_recency_rate_prev1"], 1.0)
            self.assertEqual(second["path_success_prev1"], 0.0)
            # Grid4 grain keeps the old success_rate semantics under alias.
            self.assertEqual(second["wspr_path_prev1_available"], 1)
            self.assertEqual(second["wspr_path_success_prev1"], 0.25)
            self.assertEqual(second["path_prev2_available"], 0)
            self.assertEqual(second["wspr_path_prev2_available"], 0)

            third = row(HOUR2, "EM10", "IO91")
            # Hour 1 had no EM->IO positives: field lag absent, grid4 lag
            # present with a 0 success rate.
            self.assertEqual(third["path_prev1_available"], 0)
            self.assertEqual(third["path_success_prev1"], 0.0)
            self.assertEqual(third["wspr_path_prev1_available"], 1)
            self.assertEqual(third["wspr_path_success_prev1"], 0.0)
            self.assertEqual(third["path_prev2_available"], 1)
            self.assertEqual(third["path_recency_rate_prev2"], 1.0)
            self.assertEqual(third["wspr_path_success_prev2"], 0.25)

            fn_second = row(HOUR1, "FN31", "JN18")
            self.assertEqual(fn_second["path_prev1_available"], 1)
            self.assertEqual(fn_second["wspr_path_success_prev1"], 1.0)

            output = root / "dataset.parquet"
            add_polars_features([base], output, "hf")
            output_names = pl.scan_parquet(output / "*.parquet").collect_schema().names()
            for column in FIELD_RECENCY_COLUMNS:
                self.assertIn(column, output_names)
            self.assertEqual(FEATURE_CONTRACT, "archive-v4-features-v2")

    def test_quantile_orders_pairs_within_hour_and_band(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "part.parquet"
            weather = root / "weather.parquet"
            base = root / "base.parquet"
            # Hour 0 on 20m: IO hears EM, FN, JN (exposure 3, rate 1/3);
            # PM hears EM only (exposure 1, rate 1). Ranks: 0, 0, 0, 1.
            rows = [
                (HOUR0, "20m", "EM10", "IO91", 37.0, 1.0, 1.0, 1, 1),
                (HOUR0, "20m", "FN31", "IO91", 37.0, 1.0, 1.0, 1, 1),
                (HOUR0, "20m", "JN18", "IO91", 37.0, 1.0, 1.0, 1, 1),
                (HOUR0, "20m", "EM10", "PM95", 37.0, 1.0, 1.0, 1, 1),
                (HOUR1, "20m", "EM10", "IO91", 37.0, 0.0, 1.0, 0, 1),
                (HOUR1, "20m", "EM10", "PM95", 37.0, 0.0, 1.0, 0, 1),
            ]
            opportunity_frame(rows).write_parquet(source)
            weather_frame().write_parquet(weather)
            con = duckdb.connect()
            con.execute("SET TimeZone='UTC'")
            split = split_sql(
                {
                    "train": {"months": ["2024-10"]},
                    "validation": {"months": []},
                    "test": {"months": []},
                }
            )
            write_feature_base(con, source=source, weather=weather, base=base, split=split)
            frame = pl.read_parquet(base).filter(pl.col("target_hour") == HOUR1)
            by_rx = {row["rx_grid4"]: row for row in frame.iter_rows(named=True)}
            self.assertEqual(by_rx["IO91"]["path_recency_rate_prev1"], 1.0 / 3)
            self.assertEqual(by_rx["IO91"]["path_success_prev1"], 0.0)
            self.assertEqual(by_rx["PM95"]["path_recency_rate_prev1"], 1.0)
            self.assertEqual(by_rx["PM95"]["path_success_prev1"], 1.0)
            self.assertEqual(by_rx["PM95"]["path_prev1_available"], 1)


if __name__ == "__main__":
    unittest.main()
