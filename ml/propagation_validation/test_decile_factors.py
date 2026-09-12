"""Round trip for the P.1239-3 decile-factor parser and encoder (#1102).

The table is 18 sections that differ only in their heading line, so the failure
this guards against is a silent transposition: a season read into another
season's slot, or a latitude block stored upside down. The synthetic table
below gives every cell a value that names its own coordinates, so any such
transposition lands a recognisably wrong number rather than a plausible one.
"""

from __future__ import annotations

import struct
import unittest

try:
    from .ionosphere_decile_factors import (
        ASSET_HEADER_BYTES,
        DECILES,
        HOURS,
        LATITUDES,
        R12_RANGES,
        SEASONS,
        encode_asset,
        parse_table,
    )
except ImportError:  # unittest discover runs from inside the package directory
    from ionosphere_decile_factors import (  # type: ignore[no-redef]
        ASSET_HEADER_BYTES,
        DECILES,
        HOURS,
        LATITUDES,
        R12_RANGES,
        SEASONS,
        encode_asset,
        parse_table,
    )

SECTION_LETTERS = "abcdefghi"


def cell(decile: int, season: int, r12: int, latitude_deg: int, hour: int) -> float:
    """A value that spells out its own coordinates: decile, season, range, latitude, hour."""
    return round(
        1000 * decile + 100 * season + 10 * r12 + latitude_deg / 100 + hour / 10000,
        4,
    )


def synthetic_table() -> str:
    """A table with the published file's shape and headings, and known numbers."""
    lines = ["ITU-R P.1239-2", "TABLE 2 and TABLE 3"]
    for decile_index, decile in enumerate(DECILES):
        for season_index, season in enumerate(SEASONS):
            for r12_index, r12 in enumerate(R12_RANGES):
                letter = SECTION_LETTERS[season_index * len(R12_RANGES) + r12_index]
                lines.append(f"{letter}) foF2 variability: {decile} decile, {season}, {r12}")
                lines.append("Lat.                    Local time (h)")
                lines.append("   " + " ".join(f"{hour:02d}" for hour in range(HOURS)))
                for row in range(LATITUDES - 1, -1, -1):  # published order: 90 down to 0
                    latitude = row * 5
                    factors = " ".join(
                        f"{cell(decile_index, season_index, r12_index, latitude, hour):.4f}"
                        for hour in range(HOURS)
                    )
                    lines.append(f"{latitude}° {factors}")
    return "\n".join(lines) + "\n"


class DecileTableRoundTripTests(unittest.TestCase):
    def test_parse_then_encode_preserves_every_coordinate(self) -> None:
        factors = parse_table(synthetic_table())
        expected_count = (
            len(DECILES) * len(SEASONS) * len(R12_RANGES) * LATITUDES * HOURS
        )
        self.assertEqual(len(factors), expected_count)

        asset = encode_asset(factors)
        self.assertEqual(len(asset), ASSET_HEADER_BYTES + expected_count * 8)
        decoded = struct.unpack_from(f"<{expected_count}d", asset, ASSET_HEADER_BYTES)

        for decile in range(len(DECILES)):
            for season in range(len(SEASONS)):
                for r12 in range(len(R12_RANGES)):
                    for row in range(LATITUDES):
                        for hour in range(HOURS):
                            index = (
                                (
                                    ((decile * len(SEASONS) + season) * len(R12_RANGES) + r12)
                                    * LATITUDES
                                    + row
                                )
                                * HOURS
                                + hour
                            )
                            self.assertAlmostEqual(
                                decoded[index],
                                cell(decile, season, r12, row * 5, hour),
                                places=9,
                                msg=(
                                    f"decile {decile} season {season} r12 {r12} "
                                    f"latitude {row * 5} hour {hour}"
                                ),
                            )

    def test_latitude_rows_are_stored_ascending(self) -> None:
        """The published block runs 90 down to 0; the asset must run 0 up to 90."""
        factors = parse_table(synthetic_table())
        self.assertAlmostEqual(factors[0], cell(0, 0, 0, 0, 0), places=9)
        self.assertAlmostEqual(
            factors[(LATITUDES - 1) * HOURS], cell(0, 0, 0, 90, 0), places=9
        )

    def test_a_missing_section_is_an_error_not_a_shifted_table(self) -> None:
        text = synthetic_table()
        cut = text.split("\n")
        heading = next(
            index
            for index, line in enumerate(cut)
            if line.startswith("i) foF2 variability: upper decile, summer")
        )
        with self.assertRaises(ValueError):
            parse_table("\n".join(cut[:heading]) + "\n")


if __name__ == "__main__":
    unittest.main()
