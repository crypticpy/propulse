"""PROP-07b (#1102): build the ITU-R P.1239-3 foF2 decile-factor asset.

Tables 2 and 3 of ITU-R P.1239-3 give the lower and upper decile factors for
the within-the-month variation of foF2, tabulated by decile, season, R12 range,
geographic latitude (0 to 90 degrees in steps of 5) and local time (hourly).
The ITU-R Study Group 3 reference distribution ships them as a plain text file;
this module fetches that file pinned to an immutable commit, transcodes it into
a little-endian float64 asset of our own, and records the provenance in the
ionosphere manifest beside the CCIR coefficient entry written by #953.

Nothing from the ITU tree is redistributed: the .txt is read, the numbers are
re-encoded into the Propulse binary, and the .txt itself is never committed.

This is a sibling of ``ionosphere_coefficients.py`` rather than a section of it
because that module rewrites the whole manifest from scratch and needs both the
pinned reference build and a live SILSO fetch to do so. This one merges a
single ``decile_factors`` block into the existing manifest and needs neither.

One reproducible command:

    python3 -m ml.propagation_validation.ionosphere_decile_factors \
        --cache /tmp/prop07b-cache --emit
"""

from __future__ import annotations

import argparse
import json
import re
import struct
from pathlib import Path

try:  # run as a package module
    from .ionosphere_coefficients import fetch, sha256_bytes, utc_now
except ImportError:  # run from inside ml/propagation_validation
    from ionosphere_coefficients import fetch, sha256_bytes, utc_now  # type: ignore[no-redef]

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSET_PATH = REPO_ROOT / "public/propagation/ionosphere/p1239-decile-factors-v1.bin"
MANIFEST_PATH = REPO_ROOT / "src/lib/propagation/ionosphere/assets/manifest.json"

# The table as published by ITU-R Study Group 3, pinned to the commit that last
# changed it (2019-02-27). The path holds spaces, so it is URL-encoded.
SG3_COMMIT = "1842db683f3f19146e60c77302f79172dfab0b7a"
SG3_PATH = "P533/Data/P1239-3 Decile Factors.txt"
SOURCE_URL = (
    "https://raw.githubusercontent.com/ITU-R-Study-Group-3/ITU-R-HF/"
    f"{SG3_COMMIT}/P533/Data/P1239-3%20Decile%20Factors.txt"
)

DECILES = ("lower", "upper")
SEASONS = ("winter", "equinox", "summer")
R12_RANGES = ("R12 < 50", "50 <= R12 <= 100", "R12 > 100")
LATITUDES = 19  # 0, 5, ... 90 degrees
HOURS = 24

ASSET_MAGIC = b"PROPULSE-P1239-DECILES\0\0"  # 24 bytes
ASSET_SCHEMA = 1
ASSET_HEADER_BYTES = 64

SECTION_RE = re.compile(
    r"^[a-i]\) foF2 variability: (lower|upper) decile, (winter|equinox|summer), (.+?)\s*$"
)


def parse_table(text: str) -> list[float]:
    """The 18 sections of the table, flattened in the asset's own order.

    Order is decile, season, R12 range, latitude ascending (0 to 90 by 5), hour
    0 to 23. The published sections run latitude *descending*, so each block is
    reversed here; the reference does the same thing when it fills ``foF2var``
    (ReadP1239.c counts ``k`` down from 18 so the index rises with latitude).

    The declared section order is checked against the sequence the file happens
    to be in rather than assumed: a reordered or truncated file must fail here,
    not silently shift every factor into a neighbouring season.
    """
    lines = text.splitlines()
    sections: dict[tuple[str, str, str], list[list[float]]] = {}
    for index, line in enumerate(lines):
        match = SECTION_RE.match(line)
        if match is None:
            continue
        decile, season, r12_range = match.groups()
        if r12_range not in R12_RANGES:
            raise ValueError(f"unknown R12 range {r12_range!r} on line {index + 1}")
        rows: list[list[float]] = []
        # Two lines of chrome (the "Lat." caption and the hour header) sit
        # between the section heading and the first latitude row.
        for offset in range(index + 3, index + 3 + LATITUDES):
            fields = lines[offset].split()
            values = [float(field) for field in fields[1:]]
            if len(values) != HOURS:
                raise ValueError(
                    f"line {offset + 1} holds {len(values)} factors, expected {HOURS}"
                )
            rows.append(values)
        sections[(decile, season, r12_range)] = rows[::-1]  # 90..0 becomes 0..90

    flat: list[float] = []
    for decile in DECILES:
        for season in SEASONS:
            for r12_range in R12_RANGES:
                key = (decile, season, r12_range)
                if key not in sections:
                    raise ValueError(f"table is missing section {key}")
                for row in sections[key]:
                    flat.extend(row)
    expected = len(DECILES) * len(SEASONS) * len(R12_RANGES) * LATITUDES * HOURS
    if len(flat) != expected or len(sections) != 18:
        raise ValueError(
            f"parsed {len(flat)} factors in {len(sections)} sections, "
            f"expected {expected} in 18"
        )
    return flat


def encode_asset(factors: list[float]) -> bytes:
    """64-byte header then little-endian float64 in the order ``parse_table`` returns.

    float64 rather than float32 for the same reason as the CCIR asset: the
    consumer interpolates bilinearly between four of these and the test suite
    compares against decimals read out of the published table, so the storage
    step should contribute nothing at all to the residual.
    """
    header = bytearray(ASSET_HEADER_BYTES)
    header[0 : len(ASSET_MAGIC)] = ASSET_MAGIC
    struct.pack_into(
        "<6I",
        header,
        len(ASSET_MAGIC),
        ASSET_SCHEMA,
        len(DECILES),
        len(SEASONS),
        len(R12_RANGES),
        LATITUDES,
        HOURS,
    )
    return bytes(header) + struct.pack(f"<{len(factors)}d", *factors)


def manifest_entry(asset: bytes, source_sha256: str, captured_at: str) -> dict:
    return {
        "asset": {
            "path": "public/propagation/ionosphere/p1239-decile-factors-v1.bin",
            "served_at": "/propagation/ionosphere/p1239-decile-factors-v1.bin",
            "bytes": len(asset),
            "sha256": f"sha256:{sha256_bytes(asset)}",
            "encoding": (
                "64-byte header (magic PROPULSE-P1239-DECILES, uint32 schema, "
                "deciles, seasons, R12 ranges, latitudes, hours) then "
                "little-endian float64 ordered decile (lower, upper), season "
                "(winter, equinox, summer), R12 range (<50, 50..100, >100), "
                "latitude ascending 0..90 by 5, hour 0..23"
            ),
        },
        "model": {
            "name": "foF2 within-the-month decile factors",
            "recommendation": "ITU-R P.1239-3 Tables 2 and 3",
            "quantity": (
                "lower and upper decile factors for the within-the-month "
                "variation of foF2, dimensionless multipliers of the monthly "
                "median"
            ),
            "consumed_by": (
                "ITU-R P.533-14 section 3.6 within-the-month probability of "
                "ionospheric propagation support; the circuit MUF decile "
                "deviations are #954, not this leaf"
            ),
            "axes": (
                "2 deciles x 3 seasons x 3 R12 ranges x 19 latitudes (0..90 by "
                "5 degrees) x 24 local-time hours"
            ),
        },
        "source": {
            "origin": (
                "ITU-R P.1239-3 Tables 2 and 3 as published in the ITU-R Study "
                "Group 3 reference distribution; the file's own header still "
                "reads P.1239-2, which is the edition the numbers were first "
                "tabulated in"
            ),
            "repository": "https://github.com/ITU-R-Study-Group-3/ITU-R-HF",
            "commit": SG3_COMMIT,
            "path": SG3_PATH,
            "url": SOURCE_URL,
            "sha256": f"sha256:{source_sha256}",
            "bytes": 73427,
            "captured_at": captured_at,
            "capture_note": (
                "The url is pinned to the immutable commit that last changed "
                "the file (2019-02-27), so a capture older than generated_at is "
                "still the same bytes. The text file is transcoded and is not "
                "redistributed, preserving the #952 policy."
            ),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp/prop07b-cache"))
    parser.add_argument("--emit", action="store_true")
    args = parser.parse_args()

    got = fetch(SOURCE_URL, args.cache)
    factors = parse_table(got.data.decode("iso-8859-1"))
    asset = encode_asset(factors)
    entry = manifest_entry(asset, got.sha256, got.captured_at)
    entry["source"]["bytes"] = len(got.data)

    if args.emit:
        ASSET_PATH.parent.mkdir(parents=True, exist_ok=True)
        ASSET_PATH.write_bytes(asset)
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        manifest["decile_factors"] = entry
        MANIFEST_PATH.write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
    print(json.dumps(entry["asset"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
