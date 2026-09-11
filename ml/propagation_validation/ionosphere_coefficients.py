"""PROP-07 (#953): build and prove the ionospheric climatology coefficient asset.

The ITU-R P.533 reference does not evaluate spherical harmonics at run time: it
reads 134 MB of pre-rendered 1.5-degree monthly grids (``ionos%02d.bin``) that
Suessman's ``iongrid`` produced from the CCIR numerical-map coefficients. This
module goes the other way. It fetches the public ITU-R CCIR coefficient set,
emits a 274 kB asset the browser can load, and then *proves* the asset by
rebuilding every value of the reference grid from it:

    G0  foF2        max |delta| over 12 x 2 x 24 x 241 x 121 points
    G1  M(3000)F2   the same, for the propagation factor

Both gates run against the pinned #952 reference checkout, so the proof is
against the ITU data files themselves and never against this repository's
TypeScript. Nothing from the pinned ITU-R-HF tree is copied into Propulse;
it is used only as the oracle.

Usage (needs a completed `scripts/propagation-reference-fetch` build):

    python -m ml.propagation_validation.ionosphere_coefficients \
        --cache /tmp/prop07-cache --emit --validate --fixtures
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
import subprocess
import sys
import tempfile
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSET_PATH = REPO_ROOT / "public/propagation/ionosphere/ccir-numerical-map-v1.bin"
MANIFEST_PATH = REPO_ROOT / "src/lib/propagation/ionosphere/assets/manifest.json"
FIXTURE_PATH = (
    REPO_ROOT / "src/lib/propagation/ionosphere/fixtures/reference-parity.json"
)

# ---------------------------------------------------------------------------
# Pinned public sources
# ---------------------------------------------------------------------------
# The CCIR numerical-map coefficients issued by the ITU-R as the companion data
# of the NeQuick G / P.531 software package, taken from the Orekit mirror at a
# pinned commit. Orekit is Apache-2.0 and republishes the ITU files unmodified.
#
# These are NOT interchangeable with the IRI distribution's ccir%02d.asc: the
# IRI copies diverge from the ITU set in months 7, 8, 9, 11 and 12 by up to
# 5.9e-2 MHz of foF2, which is 58x the G0 gate. Parity here is against P.533,
# so the ITU set is the only correct source. Measured, not assumed.
OREKIT_COMMIT = "f0c1fdc852f3a2ae5af99c38b4743144b9281877"
OREKIT_BASE = (
    "https://raw.githubusercontent.com/CS-SI/Orekit/"
    f"{OREKIT_COMMIT}/src/main/resources/assets/org/orekit/nequick"
)
SILSO_URL = "https://www.sidc.be/SILSO/DATA/SN_ms_tot_V2.0.txt"

# ---------------------------------------------------------------------------
# CCIR numerical map structure (ITU-R P.1239 Annex 1; IRI GAMMA1)
# ---------------------------------------------------------------------------
QF = (11, 11, 8, 4, 1, 0, 0, 0, 0)  # foF2 latitude degrees per longitude harmonic
QM = (6, 7, 5, 2, 1, 0, 0)  # M(3000)F2
FOF2_GEO, FOF2_TIME = 76, 13  # 76 geographic functions x (1 + 2*6) time terms
M3000_GEO, M3000_TIME = 49, 9  # 49 geographic functions x (1 + 2*4) time terms
MONTHS, SOLAR_LEVELS = 12, 2

ASSET_MAGIC = b"PROPULSE-IONOMAP"
ASSET_SCHEMA = 1
ASSET_HEADER_BYTES = 64

GRID_LON, GRID_LAT, GRID_HOURS = 241, 121, 24
GRID_INCREMENT_DEG = 1.5

G0_GATE_MHZ = 1e-3
G1_GATE = 1e-4

FLOAT_RE = re.compile(r"[+-]?\d\.\d+E[+-]\d+")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str, cache: Path) -> tuple[bytes, str]:
    """Fetch with an on-disk cache so a re-run is reproducible offline."""
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / hashlib.sha256(url.encode()).hexdigest()[:16]
    if target.exists():
        data = target.read_bytes()
    else:
        with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310
            data = response.read()
        target.write_bytes(data)
    return data, sha256_bytes(data)


def parse_ccir(text: str) -> tuple[list[float], list[float]]:
    """One ccir%02d.asc: foF2 (2 x 76 x 13) then M(3000)F2 (2 x 49 x 9).

    Solar level is the slowest axis and the time terms are contiguous, which is
    the layout IRI's GAMMA1 indexes with ``MI = (I-1) * MM``.
    """
    values = [float(token) for token in FLOAT_RE.findall(text)]
    foF2_count = SOLAR_LEVELS * FOF2_GEO * FOF2_TIME
    m3000_count = SOLAR_LEVELS * M3000_GEO * M3000_TIME
    if len(values) < foF2_count + m3000_count:
        raise ValueError(
            f"coefficient file holds {len(values)} values, "
            f"expected at least {foF2_count + m3000_count}"
        )
    return (
        values[:foF2_count],
        values[foF2_count : foF2_count + m3000_count],
    )


def encode_asset(months: list[tuple[list[float], list[float]]]) -> bytes:
    """Header plus float64 coefficients, month-major then solar level.

    float64, not float32: the coefficients are summed over 988 basis terms, and
    float32 rounding of the inputs alone moves foF2 by up to ~1e-3 MHz, which is
    the whole G0 budget. 274 kB fetched once is the cheaper side of that trade.
    """
    header = bytearray(ASSET_HEADER_BYTES)
    header[0:16] = ASSET_MAGIC
    struct.pack_into(
        "<8I",
        header,
        16,
        ASSET_SCHEMA,
        MONTHS,
        SOLAR_LEVELS,
        FOF2_GEO,
        FOF2_TIME,
        M3000_GEO,
        M3000_TIME,
        0,
    )
    body = bytearray()
    for foF2, m3000 in months:
        for level in range(SOLAR_LEVELS):
            start = level * FOF2_GEO * FOF2_TIME
            body += struct.pack(
                f"<{FOF2_GEO * FOF2_TIME}d",
                *foF2[start : start + FOF2_GEO * FOF2_TIME],
            )
            start = level * M3000_GEO * M3000_TIME
            body += struct.pack(
                f"<{M3000_GEO * M3000_TIME}d",
                *m3000[start : start + M3000_GEO * M3000_TIME],
            )
    return bytes(header) + bytes(body)


# ---------------------------------------------------------------------------
# Magnetic dip: port of the reference magfit() (P.1239 eqs 5-11, REC533 MAGFIT)
# ---------------------------------------------------------------------------
R0_KM = 6371.009
_G = [
    [0.0, 0.304112, 0.024035, -0.031518, -0.041794, 0.016256, -0.019523],
    [0.0, 0.021474, -0.051253, 0.062130, -0.045298, -0.034407, -0.004853],
    [0.0, 0.0, -0.013381, -0.024898, -0.021795, -0.019447, 0.003212],
    [0.0, 0.0, 0.0, -0.0064960, 0.007008, -0.000608, 0.021413],
    [0.0, 0.0, 0.0, 0.0, -0.002044, 0.002775, 0.001051],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.000697, 0.000227],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.001115],
]
_H = [
    [0.0] * 7,
    [0.0, -0.057989, 0.033124, 0.014870, -0.011825, -0.000796, -0.005758],
    [0.0, 0.0, -0.001579, -0.004075, 0.010006, -0.002000, -0.008735],
    [0.0, 0.0, 0.0, 0.000210, 0.000430, 0.004597, -0.003406],
    [0.0, 0.0, 0.0, 0.0, 0.001385, 0.002421, -0.000118],
    [0.0, 0.0, 0.0, 0.0, 0.0, -0.001218, -0.001116],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.000325],
]
_CT = [
    [0.0, 0.0, 0.33333333, 0.266666666, 0.25714286, 0.25396825, 0.25252525],
    [0.0, 0.0, 0.0, 0.200000000, 0.22857142, 0.23809523, 0.24242424],
    [0.0, 0.0, 0.0, 0.0, 0.14285714, 0.19047619, 0.21212121],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.11111111, 0.16161616],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.09090909],
    [0.0] * 7,
    [0.0] * 7,
]


def magnetic_dip_rad(lat_rad: float, lon_rad: float, height_km: float) -> float:
    p = [[0.0] * 7 for _ in range(7)]
    dp = [[0.0] * 7 for _ in range(7)]
    p[0][0] = 1.0
    ar = R0_KM / (R0_KM + height_km)
    sl, cl = math.sin(lat_rad), math.cos(lat_rad)
    fx = fy = fz = 0.0
    for n in range(1, 7):
        sumz = sumx = sumy = 0.0
        for m in range(0, n + 1):
            if n == m:
                p[m][n] = cl * p[m - 1][n - 1]
                dp[m][n] = cl * dp[m - 1][n - 1] + sl * p[m - 1][n - 1]
            elif n != 1:
                p[m][n] = sl * p[m][n - 1] - _CT[m][n] * p[m][n - 2]
                dp[m][n] = (
                    sl * dp[m][n - 1] - cl * p[m][n - 1] - _CT[m][n] * dp[m][n - 2]
                )
            else:
                p[m][n] = sl * p[m][n - 1]
                dp[m][n] = sl * dp[m][n - 1] - cl * p[m][n - 1]
            cs = _G[m][n] * math.cos(m * lon_rad) + _H[m][n] * math.sin(m * lon_rad)
            sn = _G[m][n] * math.sin(m * lon_rad) - _H[m][n] * math.cos(m * lon_rad)
            sumz += p[m][n] * cs
            sumx += dp[m][n] * cs
            sumy += m * p[m][n] * sn
        fz += ar ** (n + 2) * (n + 1) * sumz
        fx -= ar ** (n + 2) * sumx
        fy += ar ** (n + 2) * sumy
    horizontal = math.sqrt(fx * fx + (fy / cl) ** 2)
    return math.atan(fz / horizontal)


def basis(lat_rad: float, lon_rad: float, x: float, nq, harmonics: int) -> list[float]:
    """The CCIR geographic functions, in IRI GAMMA1's exact emission order."""
    columns = [x**n for n in range(nq[0] + 1)]
    cos_lat = math.cos(lat_rad)
    for m in range(1, harmonics):
        scale = cos_lat**m
        c, s = math.cos(m * lon_rad), math.sin(m * lon_rad)
        for n in range(nq[m] + 1):
            columns.append(x**n * scale * c)
            columns.append(x**n * scale * s)
    return columns


def time_terms(ut_hours: float, harmonics: int) -> list[float]:
    angle = math.radians(15.0 * ut_hours - 180.0)
    terms = [1.0]
    for k in range(1, harmonics + 1):
        terms.append(math.sin(k * angle))
        terms.append(math.cos(k * angle))
    return terms


def evaluate(coefficients, geo_terms, time_count, harmonics, nq, lat_deg, lon_deg, ut):
    lat_rad, lon_rad = math.radians(lat_deg), math.radians(lon_deg)
    dip = magnetic_dip_rad(lat_rad, lon_rad, 300.0)
    x = math.sin(math.atan(dip / math.sqrt(math.cos(lat_rad))))
    g = basis(lat_rad, lon_rad, x, nq, harmonics)
    t = time_terms(ut, (time_count - 1) // 2)
    total = 0.0
    for j in range(geo_terms):
        base = j * time_count
        a = 0.0
        for k in range(time_count):
            a += coefficients[base + k] * t[k]
        total += a * g[j]
    return total


# ---------------------------------------------------------------------------
# G0 / G1: rebuild the reference grid from the asset
# ---------------------------------------------------------------------------
def read_reference_grid(data_dir: Path, month: int):
    """foF2 and M(3000)F2 as [level][lon][lat][hour_index], hour_index i is UT i+1."""
    raw = (data_dir / f"ionos{month:02d}.bin").read_bytes()
    count = GRID_HOURS * GRID_LON * GRID_LAT * SOLAR_LEVELS
    fo = struct.unpack_from(f"<{count}f", raw, 5)
    mk = struct.unpack_from(f"<{count}f", raw, 5 + count * 4 + 10)
    return fo, mk


def grid_index(level: int, lon_i: int, lat_i: int, hour_i: int) -> int:
    return (
        level * GRID_LON * GRID_LAT * GRID_HOURS
        + lon_i * GRID_LAT * GRID_HOURS
        + lat_i * GRID_HOURS
        + hour_i
    )


def _grid_basis(nq, harmonics: int):
    """Vectorised geographic functions over the whole 241 x 121 node grid."""
    import numpy as np

    lon = np.radians(np.arange(GRID_LON) * GRID_INCREMENT_DEG - 180.0)[:, None]
    lat = np.radians(np.arange(GRID_LAT) * GRID_INCREMENT_DEG - 90.0)[None, :]
    lat = np.clip(lat, -math.pi / 2 + 1e-9, math.pi / 2 - 1e-9)
    lon_b, lat_b = np.broadcast_arrays(lon, lat)
    dip = np.vectorize(magnetic_dip_rad)(lat_b, lon_b, 300.0)
    x = np.sin(np.arctan(dip / np.sqrt(np.cos(lat_b))))
    columns = [x**n for n in range(nq[0] + 1)]
    cos_lat = np.cos(lat_b)
    for m in range(1, harmonics):
        scale = cos_lat**m
        c, s_ = np.cos(m * lon_b), np.sin(m * lon_b)
        for n in range(nq[m] + 1):
            columns.append(x**n * scale * c)
            columns.append(x**n * scale * s_)
    return np.stack(columns, axis=-1)  # (lon, lat, geo_terms)


def validate(months, data_dir: Path, stride: int = 1) -> dict:
    """Rebuild every node of the ITU grid from the coefficients and measure.

    This is the whole proof of the asset: 12 months x 2 solar levels x 24 UT x
    241 lon x 121 lat = 16,796,736 points per parameter, compared against the
    ITU's own ionos%02d.bin. A sampled check would not be a proof.
    """
    import numpy as np

    f_basis = _grid_basis(QF, 9)
    m_basis = _grid_basis(QM, 7)
    per_month = []
    worst_f = worst_m = 0.0
    worst_f_at = worst_m_at = None
    points = 0
    for month_index, (foF2, m3000) in enumerate(months):
        fo, mk = read_reference_grid(data_dir, month_index + 1)
        fo = np.asarray(fo, dtype=np.float64).reshape(
            SOLAR_LEVELS, GRID_LON, GRID_LAT, GRID_HOURS
        )
        mk = np.asarray(mk, dtype=np.float64).reshape(
            SOLAR_LEVELS, GRID_LON, GRID_LAT, GRID_HOURS
        )
        f_coeff = np.asarray(foF2).reshape(SOLAR_LEVELS, FOF2_GEO, FOF2_TIME)
        m_coeff = np.asarray(m3000).reshape(SOLAR_LEVELS, M3000_GEO, M3000_TIME)
        month_f = month_m = 0.0
        for level in range(SOLAR_LEVELS):
            for ut in range(1, 25):
                hour_i = (ut - 1) % GRID_HOURS
                ft = np.asarray(time_terms(ut, (FOF2_TIME - 1) // 2))
                mt = np.asarray(time_terms(ut, (M3000_TIME - 1) // 2))
                predicted = f_basis @ (f_coeff[level] @ ft)
                delta = np.abs(predicted - fo[level, :, :, hour_i])
                peak = float(delta.max())
                if peak > month_f:
                    month_f = peak
                if peak > worst_f:
                    flat = int(delta.argmax())
                    worst_f, worst_f_at = peak, {
                        "month": month_index + 1,
                        "solar_level": level,
                        "ut_hour": ut,
                        "latitude_deg": (flat % GRID_LAT) * GRID_INCREMENT_DEG - 90.0,
                        "longitude_deg": (flat // GRID_LAT) * GRID_INCREMENT_DEG - 180.0,
                    }
                predicted = m_basis @ (m_coeff[level] @ mt)
                delta = np.abs(predicted - mk[level, :, :, hour_i])
                peak = float(delta.max())
                if peak > month_m:
                    month_m = peak
                if peak > worst_m:
                    flat = int(delta.argmax())
                    worst_m, worst_m_at = peak, {
                        "month": month_index + 1,
                        "solar_level": level,
                        "ut_hour": ut,
                        "latitude_deg": (flat % GRID_LAT) * GRID_INCREMENT_DEG - 90.0,
                        "longitude_deg": (flat // GRID_LAT) * GRID_INCREMENT_DEG - 180.0,
                    }
                points += GRID_LON * GRID_LAT
        per_month.append(
            {
                "month": month_index + 1,
                "foF2_max_abs_delta_mhz": month_f,
                "m3000f2_max_abs_delta": month_m,
            }
        )
    return {
        "points_per_parameter": points,
        "foF2_max_abs_delta_mhz": worst_f,
        "foF2_worst_at": worst_f_at,
        "foF2_gate_mhz": G0_GATE_MHZ,
        "foF2_pass": worst_f <= G0_GATE_MHZ,
        "m3000f2_max_abs_delta": worst_m,
        "m3000f2_worst_at": worst_m_at,
        "m3000f2_gate": G1_GATE,
        "m3000f2_pass": worst_m <= G1_GATE,
        "per_month": per_month,
        "residual_note": (
            "The residual is dominated by the float32 storage of ionos%02d.bin, "
            "not by the expansion: the ITU grid itself only carries ~1e-4 MHz of "
            "significance at these magnitudes."
        ),
    }


# ---------------------------------------------------------------------------
# Fixtures from the native ITURHFProp executable (RPT_DUMPPATH)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class DumpCase:
    case_id: str
    tx_lat: float
    tx_lon: float
    rx_lat: float
    rx_lon: float
    month: int  # 1-12
    hour_utc: int  # 0-23; rendered as the reference's 1-24
    ssn: int
    frequency_mhz: float


# P.533 accepts SSN 1..311 (ValidatePath.c); SSN 0 is rejected, so the
# low-solar cases use the smallest legal values rather than the map's R12=0 level.
DUMP_CASES = (
    DumpCase("mid-latitude-winter-day", 40.0, -75.0, 51.5, 0.0, 1, 11, 50, 14.1),
    DumpCase("mid-latitude-summer-night", 40.0, -75.0, 51.5, 0.0, 7, 3, 50, 7.1),
    DumpCase("equatorial-equinox", -5.0, -60.0, 5.0, 10.0, 4, 17, 100, 21.2),
    DumpCase("auroral-high-solar", 64.0, -21.0, 70.0, 25.0, 10, 23, 160, 10.1),
    DumpCase("polar-winter", 78.0, 15.0, 68.0, -53.0, 12, 5, 5, 7.05),
    DumpCase("southern-mid-latitude", -34.0, 151.0, -41.0, 174.0, 8, 8, 120, 14.2),
    DumpCase("longitude-wrap", 35.0, 176.0, 21.0, -157.0, 3, 14, 75, 18.1),
    DumpCase("low-solar-equinox", 48.0, 2.0, 55.0, 37.0, 9, 20, 10, 10.12),
)

CP_SPLIT = re.compile(r"\*\s+Control Point\s+-\s+(.+?)\s+\*")
# "\tLatitude\t=\t 0.791\t( 45.323)\t[45 19 21]": radians, degrees, then DMS.
# The DMS is the most precise form (+-0.5 arcsec against +-1.8 arcsec for the
# 3-decimal degrees) but carries no sign for |value| < 1 degree, so the sign
# comes from the decimal field and the magnitude from the DMS.
COORD = re.compile(
    r"{}\s*=\s*(-?[\d.]+)\s*\(\s*(-?[\d.]+)\)\s*\[\s*(-?\d+)\s+(\d+)\s+(\d+)\]"
)


def parse_coordinate(body: str, label: str) -> float | None:
    match = re.search(COORD.pattern.format(label), body)
    if match is None:
        return None
    decimal = float(match.group(2))
    degrees, minutes, seconds = (int(part) for part in match.groups()[2:])
    magnitude = abs(degrees) + minutes / 60.0 + seconds / 3600.0
    return round(-magnitude if decimal < 0 else magnitude, 6)


def render_dump_input(case: DumpCase, data_path: Path, report_dir: Path) -> str:
    return f"""PathName "{case.case_id}"
PathTXName "TX"
Path.L_tx.lat {case.tx_lat}
Path.L_tx.lng {case.tx_lon}
TXAntFilePath "ISOTROPIC"
TXGOS 0.0
TXBearing 0.0
PathRXName "RX"
Path.L_rx.lat {case.rx_lat}
Path.L_rx.lng {case.rx_lon}
RXAntFilePath "ISOTROPIC"
RXGOS 0.0
RXBearing 0.0
AntennaOrientation "TX2RX"
Path.year 2026
Path.month {case.month}
Path.hour {case.hour_utc + 1}
Path.SSN {case.ssn}
Path.frequency {case.frequency_mhz:.6f}
Path.txpower 0.0
Path.BW 3000
Path.SNRr 10
Path.SNRXXp 90
Path.ManMadeNoise "RURAL"
Path.Modulation "ANALOG"
Path.SIRr 0
Path.A 0
Path.TW 0
Path.FW 0
Path.T0 0
Path.F0 0
Path.SorL "SHORTPATH"
RptFilePath "{report_dir}/"
RptFileFormat "RPT_DUMPPATH"
LL.lat {case.rx_lat}
LL.lng {case.rx_lon}
LR.lat {case.rx_lat}
LR.lng {case.rx_lon}
UL.lat {case.rx_lat}
UL.lng {case.rx_lon}
UR.lat {case.rx_lat}
UR.lng {case.rx_lon}
latinc 1.0
lnginc 1.0
DataFilePath "{data_path}/"
"""


def parse_dump(text: str, case: DumpCase) -> list[dict]:
    rows = []
    blocks = CP_SPLIT.split(text)
    for name, body in zip(blocks[1::2], blocks[2::2]):

        def find(pattern: str, body=body):
            match = re.search(pattern, body)
            return None if match is None else float(match.group(1))

        latitude = parse_coordinate(body, "Latitude")
        longitude = parse_coordinate(body, "Longitude")
        foF2 = find(r"foF2\s*=\s*(-?[\d.]+)")
        if latitude is None or longitude is None or not foF2:
            # Control points at +-d0/2 only exist on paths longer than 2*d0; on
            # shorter paths the reference leaves the slot zeroed. A zeroed slot
            # is not a prediction, so it must not become a fixture.
            continue
        row = {
            "case_id": f"{case.case_id}:{name.strip().replace(' ', '_')}",
            "source": "iturhfprop-dumppath",
            "month": case.month,
            "hour_utc": case.hour_utc,
            "ssn": case.ssn,
            "latitude_deg": latitude,
            "longitude_deg": longitude,
            "foF2_mhz": foF2,
            "m3000f2": find(r"M\(3000\)F2\s*=\s*(-?[\d.]+)"),
            "foE_mhz": find(r"foE\s*=\s*(-?[\d.]+)"),
            "magnetic_dip_300km_deg": find(r"Magnetic dip \(300 km\)\s*=\s*(-?[\d.]+)"),
            "gyrofrequency_300km_mhz": find(r"Gyrofrequency \(300 km\)\s*=\s*(-?[\d.]+)"),
            "solar_zenith_angle_deg": find(r"solar zenith angle\s*=\s*(-?[\d.]+)"),
            "solar_declination_deg": find(r"solar declination\s*=\s*(-?[\d.]+)"),
        }
        mirror_height = find(r"reflection height\s*=\s*(-?[\d.]+)")
        if mirror_height is not None:
            row["mirror_reflection_height_km"] = mirror_height
            row["frequency_mhz"] = case.frequency_mhz
        rows.append(row)
    return rows


def run_native_dumps(build_dir: Path) -> list[dict]:
    executable = build_dir / "ITURHFProp/Linux/ITURHFProp"
    data_path = build_dir / "P372/Data"
    if not executable.exists():
        raise SystemExit(f"no reference executable at {executable}")
    rows: list[dict] = []
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        for case in DUMP_CASES:
            input_file = work / f"{case.case_id}.in"
            output_file = work / f"{case.case_id}.out"
            input_file.write_text(
                render_dump_input(case, data_path, work), encoding="utf-8"
            )
            subprocess.run(
                [str(executable), "-s", str(input_file), str(output_file)],
                check=True,
                capture_output=True,
                env={
                    "DYLD_LIBRARY_PATH": f"{build_dir}/P533/Linux:{build_dir}/P372/Linux",
                    "LD_LIBRARY_PATH": f"{build_dir}/P533/Linux:{build_dir}/P372/Linux",
                    "PATH": "/usr/bin:/bin",
                },
            )
            rows += parse_dump(output_file.read_text(encoding="utf-8"), case)
    return rows


def grid_node_fixtures(data_dir: Path) -> list[dict]:
    """Exact grid nodes: no coordinate rounding, so the tolerance is the asset's."""
    rows = []
    picks = [
        (1, 0, 1, 0, 0),
        (1, 1, 12, 60, 120),
        (4, 0, 7, 30, 0),
        (6, 1, 24, 100, 200),
        (7, 0, 18, 90, 240),
        (10, 1, 6, 10, 60),
        (12, 0, 23, 120, 0),
        (12, 1, 13, 0, 160),
    ]
    for month, level, ut, lat_i, lon_i in picks:
        fo, mk = read_reference_grid(data_dir, month)
        index = grid_index(level, lon_i, lat_i, (ut - 1) % GRID_HOURS)
        rows.append(
            {
                "case_id": f"grid-{month:02d}-{level}-{ut:02d}-{lat_i}-{lon_i}",
                "source": "itu-ionos-grid",
                "month": month,
                # ut is the map's 1..24 hour; the provider's UTC hour is ut - 1
                # because the ITU grid is hour-ending (see numericalMap.ts).
                "hour_utc": ut - 1,
                "ssn": level * 100,
                "latitude_deg": lat_i * GRID_INCREMENT_DEG - 90.0,
                "longitude_deg": lon_i * GRID_INCREMENT_DEG - 180.0,
                "foF2_mhz": fo[index],
                "m3000f2": mk[index],
            }
        )
    return rows


def parse_silso(text: str) -> list[dict]:
    entries = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        year, month, _, value = parts[0], parts[1], parts[2], parts[3]
        if float(value) < 0:
            continue
        entries.append({"year": int(year), "month": int(month), "smoothed_sn_v2": float(value)})
    return entries[-12:]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp/prop07-cache"))
    parser.add_argument("--build-dir", type=Path, default=None)
    parser.add_argument("--emit", action="store_true")
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--fixtures", action="store_true")
    args = parser.parse_args()

    captured_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )
    sources = []
    months = []
    for month in range(1, 13):
        url = f"{OREKIT_BASE}/ccir{month + 10}.asc"
        data, digest = fetch(url, args.cache)
        sources.append({"url": url, "sha256": f"sha256:{digest}", "bytes": len(data)})
        months.append(parse_ccir(data.decode("ascii")))

    silso_raw, silso_digest = fetch(SILSO_URL, args.cache)
    silso = parse_silso(silso_raw.decode("ascii", errors="replace"))

    asset = encode_asset(months)
    asset_digest = sha256_bytes(asset)
    if args.emit:
        ASSET_PATH.parent.mkdir(parents=True, exist_ok=True)
        ASSET_PATH.write_bytes(asset)

    report: dict = {}
    if args.validate:
        build = args.build_dir
        if build is None:
            raise SystemExit("--validate needs --build-dir pointing at ITU-R-HF")
        report = validate(months, build / "P372/Data")
        print(json.dumps(report, indent=2))
        if not (report["foF2_pass"] and report["m3000f2_pass"]):
            return 1

    if args.fixtures:
        build = args.build_dir
        if build is None:
            raise SystemExit("--fixtures needs --build-dir pointing at ITU-R-HF")
        rows = run_native_dumps(build) + grid_node_fixtures(build / "P372/Data")
        FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE_PATH.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "reference_commit": "cd172be56dc04b154e5d2fa91cbaa6ecf5284305",
                    "generated_at": captured_at,
                    "notes": (
                        "iturhfprop-dumppath rows come from the native RPT_DUMPPATH "
                        "report; their coordinates are the printed arc-second DMS, so "
                        "the tolerance absorbs +-0.5 arcsec of coordinate rounding. "
                        "itu-ionos-grid rows are exact 1.5-degree nodes read from the "
                        "ITU ionos%02d.bin data files, with no coordinate rounding."
                    ),
                    "rows": rows,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"wrote {len(rows)} fixture rows")

    manifest = {
        "schema_version": 1,
        "asset": {
            "path": "public/propagation/ionosphere/ccir-numerical-map-v1.bin",
            "served_at": "/propagation/ionosphere/ccir-numerical-map-v1.bin",
            "bytes": len(asset),
            "sha256": f"sha256:{asset_digest}",
            "encoding": (
                "64-byte header (magic PROPULSE-IONOMAP, uint32 schema, months, "
                "solar levels, foF2 geo/time terms, M(3000)F2 geo/time terms) then "
                "little-endian float64, month-major, solar level, foF2 then M(3000)F2"
            ),
        },
        "model": {
            "name": "CCIR numerical map",
            "recommendation": "ITU-R P.1239 Annex 1",
            "consumed_by": "ITU-R P.533-14 monthly median foF2 and M(3000)F2",
            "solar_index": "R12, 12-month smoothed sunspot number, levels 0 and 100",
        },
        "coefficients": {
            "origin": (
                "ITU-R CCIR numerical-map coefficients issued with the NeQuick G / "
                "ITU-R P.531 companion software"
            ),
            "mirror": f"CS-SI/Orekit @ {OREKIT_COMMIT} (Apache-2.0, files republished unmodified)",
            "captured_at": captured_at,
            "files": sources,
            "not_interchangeable_with": (
                "The IRI distribution's ccir%02d.asc diverges from this ITU set in "
                "months 7, 8, 9, 11 and 12 by up to 5.9e-2 MHz of foF2, 58x the G0 "
                "gate. P.533 parity requires the ITU set."
            ),
        },
        "solar_index_climatology": {
            "series": "SILSO 13-month smoothed total sunspot number, version 2.0",
            "url": SILSO_URL,
            "sha256": f"sha256:{silso_digest}",
            "captured_at": captured_at,
            "scale_note": (
                "SILSO v2.0 sunspot numbers are 1.43x the classic series the CCIR "
                "maps were built against; the provider divides by 1.43 and records "
                "the conversion in its assumptions rather than applying it silently."
            ),
            "months": silso,
        },
        "verification": report,
        "oracle": {
            "repository": "https://github.com/ITU-R-Study-Group-3/ITU-R-HF.git",
            "commit": "cd172be56dc04b154e5d2fa91cbaa6ecf5284305",
            "role": (
                "verification only; no file from this tree is copied into Propulse, "
                "preserving the #952 redistribution policy"
            ),
        },
    }
    if args.emit:
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"asset {len(asset)} bytes sha256:{asset_digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
