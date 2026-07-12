from __future__ import annotations

import sys
import unittest
from pathlib import Path

import polars as pl


V3 = Path(__file__).resolve().parents[2] / "archive_v3"
sys.path.insert(0, str(V3))

from build_space_weather import canonicalize_omni_schema  # noqa: E402


class SpaceWeatherSchemaTests(unittest.TestCase):
    def test_all_null_proton_flux_retains_numeric_missing_contract(self) -> None:
        frame = canonicalize_omni_schema(
            pl.DataFrame(
                {
                    "proton_flux_10mev": [None, None],
                    "sunspot_number": [None, None],
                }
            )
        )
        numeric = [
            name
            for name, kind in frame.schema.items()
            if kind.is_numeric()
        ]
        output = frame.with_columns(
            *[
                pl.col(name).is_null().cast(pl.UInt8).alias(f"{name}_missing")
                for name in numeric
            ]
        )

        self.assertEqual(frame.schema["proton_flux_10mev"], pl.Float64)
        self.assertEqual(frame.schema["sunspot_number"], pl.Int64)
        self.assertEqual(output["proton_flux_10mev_missing"].to_list(), [1, 1])


if __name__ == "__main__":
    unittest.main()
