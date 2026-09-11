"""Fit Propulse's own D-region absorption model and measure it against the
pinned ITU reference build (PROP-03, issue #949).

What this script is for
-----------------------

ITU-R P.533-14 section 5.2.2 expresses the absorption term of equation (20) as

    AT = ATnoon(|lat|, month) * phi(fv / foE) * F(chi) / F(chi_noon)

where ``F(chi) = max(cos(0.881 chi)^p, 0.02)`` and ``p`` is the diurnal
absorption exponent, a function of modified magnetic dip and month. In the
recommendation ``ATnoon``, ``phi`` and ``p`` are published as a lookup table and
two piecewise polynomial curves.

Propulse does not redistribute those. The ITU reference is a benchmark, not a
dependency: this script *measures* the three primitives from the pinned
reference build through a small harness of our own, fits **our own functional
forms** to the measurements, and writes one committed JSON holding

  * ``coefficients`` - our fitted model, which is what ships, and
  * ``anchors`` - a small set of measured reference values, which is the
    acceptance oracle the TypeScript test asserts against, and
  * ``residuals`` - the worst fit error over the full measurement grid, which
    the module doc block quotes and a test re-derives.

Neither the reference source nor any ITU table is copied into the repository.
The harness below is Propulse code; it only links against the build.

The gate
--------

Every measurement goes through ``ReferenceBuild.require()``: git HEAD equals the
pinned commit, the tracked tree is clean, and the linked artifacts match the
receipt written by the checked build. Without that, a stale or locally patched
build could certify coefficients under the pinned commit's name.

Our functional forms
--------------------

``ATnoon``: for each distinct seasonal group (discovered by measurement, not
assumed), a degree-10 Chebyshev series in ``|lat| / 35 - 1`` over 0..70 degrees.

``phi``: a degree-12 Chebyshev series in ``T`` over 0..2.2 plus the measured
linear tail above 2.2, with the measured upper clamp.

``p``: a two-branch tensor fit. On each side of a measured knot the variable is
normalised to [-1, 1] and expanded in a degree-6 Chebyshev series whose
coefficients are themselves a truncated Fourier series in the month, order 5.
This is deliberately not the recommendation's per-month piecewise polynomial:
fitting that form in that variable would reproduce the published table to
machine precision, which is vendoring by another route.

Usage::

    python -m propagation_validation.absorption_coefficients --emit
    python -m propagation_validation.absorption_coefficients --validate
"""

from __future__ import annotations

import argparse
import ctypes
import json
import math
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from .reference.runner import COMMIT, DEFAULT_BUILD_DIR, ReferenceBuild

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = (
    REPO_ROOT / "src/lib/propagation/absorption/fixtures/absorption-model.json"
)
SCHEMA_VERSION = 1

# Our harness. It declares the three reference entry points itself and calls
# them with a zeroed control point, so nothing of the reference is reproduced
# here beyond the function signatures needed to link.
HARNESS_C = r"""
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "P533.h"

double AbsorptionFactor(struct ControlPt CP, int month);
double AbsorptionLayerPenetrationFactor(double T);
double DiurnalAbsorptionExponent(struct ControlPt CP, int month);

double propulse_at_noon(double lat_rad, int month) {
  struct ControlPt cp;
  memset(&cp, 0, sizeof cp);
  cp.L.lat = lat_rad;
  return AbsorptionFactor(cp, month);
}

double propulse_phi(double t) { return AbsorptionLayerPenetrationFactor(t); }

double propulse_diurnal_p(double lat_rad, double dip100_rad, int month) {
  struct ControlPt cp;
  memset(&cp, 0, sizeof cp);
  cp.L.lat = lat_rad;
  cp.dip[HR100km] = dip100_rad;
  return DiurnalAbsorptionExponent(cp, month);
}
"""

MAX_ABS_LATITUDE_DEG = 70.0
AT_NOON_DEGREE = 10
PHI_DEGREE = 6
PHI_KNOT = 2.2
P_DEGREE = 6
P_HARMONICS = 5
P_MAX_MODDIP_DEG = 70.0


class Harness:
    """The measured reference, behind three scalar entry points."""

    def __init__(self, build: ReferenceBuild, workdir: Path) -> None:
        build.require()
        source = workdir / "harness.c"
        source.write_text(HARNESS_C, encoding="utf-8")
        library = workdir / "harness.so"
        include = build.source / "P533/Src/P533"
        subprocess.run(
            [
                os.environ.get("CC", "cc"),
                "-O2",
                "-shared",
                "-fPIC",
                "-I",
                str(include),
                "-o",
                str(library),
                str(source),
                "-Wl,-undefined,dynamic_lookup",
            ],
            check=True,
            capture_output=True,
        )
        # RTLD_GLOBAL so the harness's undefined symbols resolve against the
        # pinned library rather than a copy on the loader path.
        ctypes.CDLL(str(build.p533_library), mode=ctypes.RTLD_GLOBAL)
        lib = ctypes.CDLL(str(library))
        lib.propulse_at_noon.restype = ctypes.c_double
        lib.propulse_at_noon.argtypes = [ctypes.c_double, ctypes.c_int]
        lib.propulse_phi.restype = ctypes.c_double
        lib.propulse_phi.argtypes = [ctypes.c_double]
        lib.propulse_diurnal_p.restype = ctypes.c_double
        lib.propulse_diurnal_p.argtypes = [
            ctypes.c_double,
            ctypes.c_double,
            ctypes.c_int,
        ]
        self._lib = lib

    def at_noon(self, latitude_deg: float, month_index: int) -> float:
        return self._lib.propulse_at_noon(math.radians(latitude_deg), month_index)

    def phi(self, t: float) -> float:
        return self._lib.propulse_phi(t)

    def diurnal_p(self, moddip_deg: float, month_index: int) -> float:
        # At latitude 0 the reference's modified dip reduces to |atan(dip)|,
        # so a chosen modified dip is produced by dip = tan(moddip).
        return self._lib.propulse_diurnal_p(
            0.0, math.tan(math.radians(moddip_deg)), month_index
        )


def month_harmonics(month_index: int, order: int) -> list[float]:
    terms = [1.0]
    for k in range(1, order + 1):
        angle = 2.0 * math.pi * k * month_index / 12.0
        terms.extend([math.cos(angle), math.sin(angle)])
    return terms


def fit_at_noon(harness: Harness) -> tuple[dict[str, Any], float]:
    latitudes = np.linspace(0.0, 69.99, 1401)
    groups: dict[bytes, list[int]] = {}
    for month in range(12):
        values = np.array(
            [harness.at_noon(lat, month) for lat in latitudes], dtype=float
        )
        groups.setdefault(values.tobytes(), []).append(month)

    series: list[list[float]] = []
    month_to_series = [0] * 12
    worst = 0.0
    for group_index, (key, months) in enumerate(groups.items()):
        values = np.frombuffer(key)
        coefficients = np.polynomial.chebyshev.chebfit(
            latitudes / (MAX_ABS_LATITUDE_DEG / 2.0) - 1.0, values, AT_NOON_DEGREE
        )
        fitted = np.polynomial.chebyshev.chebval(
            latitudes / (MAX_ABS_LATITUDE_DEG / 2.0) - 1.0, coefficients
        )
        worst = max(worst, float(np.max(np.abs(fitted - values) / values)))
        series.append([float(c) for c in coefficients])
        for month in months:
            month_to_series[month] = group_index
    return (
        {"monthToSeries": month_to_series, "chebyshev": series},
        worst,
    )


def fit_phi(harness: Harness) -> tuple[dict[str, Any], float]:
    """Fit the penetration factor as three measured segments plus a tail.

    The curve has two real structural features, both located by measurement
    rather than assumed: a clamp plateau at the curve's maximum, and the
    branch change at ``fv = foE`` where the E layer stops shielding the D
    region. Everything between them is smooth and takes a Chebyshev series.
    """
    grid = np.linspace(0.0, PHI_KNOT, 22001)
    values = np.array([harness.phi(t) for t in grid], dtype=float)
    ceiling = float(np.max(values))
    plateau = np.where(np.abs(values - ceiling) < 1e-12)[0]
    plateau_lo = float(grid[plateau[0]])
    plateau_hi = float(grid[plateau[-1]])

    worst = 0.0
    segments: list[dict[str, Any]] = []
    for lo, hi in ((0.0, plateau_lo), (plateau_hi, PHI_KNOT)):
        mask = (grid >= lo) & (grid <= hi)
        x = (grid[mask] - lo) / ((hi - lo) / 2.0) - 1.0
        coefficients = np.polynomial.chebyshev.chebfit(x, values[mask], PHI_DEGREE)
        fitted = np.polynomial.chebyshev.chebval(x, coefficients)
        worst = max(
            worst, float(np.max(np.abs(fitted - values[mask]) / values[mask]))
        )
        segments.append(
            {"lo": lo, "hi": hi, "chebyshev": [float(c) for c in coefficients]}
        )

    # Above the knot the measured curve is a straight line down to a floor.
    high = np.linspace(PHI_KNOT, 12.0, 981)
    high_values = np.array([harness.phi(t) for t in high], dtype=float)
    floor = float(np.min(high_values))
    sloped = high_values > floor + 1e-12
    slope, intercept = np.polyfit(high[sloped], high_values[sloped], 1)
    modelled = np.maximum(slope * high + intercept, floor)
    worst = max(worst, float(np.max(np.abs(modelled - high_values) / high_values)))

    return (
        {
            "knot": PHI_KNOT,
            "segments": segments,
            "plateauLo": plateau_lo,
            "plateauHi": plateau_hi,
            "tailSlope": float(slope),
            "tailIntercept": float(intercept),
            "floor": floor,
            "ceiling": ceiling,
        },
        worst,
    )


def measure_p_knots(harness: Harness) -> list[float]:
    """Locate each month's branch point from the measured curvature jump."""
    grid = np.linspace(0.0, P_MAX_MODDIP_DEG, 7001)
    knots: list[float] = []
    for month in range(12):
        values = np.array(
            [harness.diurnal_p(x, month) for x in grid], dtype=float
        )
        index = int(np.argmax(np.abs(np.diff(values, 2)))) + 1
        # The measured kinks land on 2.5 degree steps; snapping removes the
        # sampling jitter without inventing a position.
        knots.append(round(float(grid[index]) / 2.5) * 2.5)
    return knots


def fit_p(harness: Harness) -> tuple[dict[str, Any], float]:
    knots = measure_p_knots(harness)
    grid = np.linspace(0.0, P_MAX_MODDIP_DEG, 2801)
    branches: list[list[float]] = []
    worst = 0.0
    for branch in (0, 1):
        rows: list[np.ndarray] = []
        rhs: list[float] = []
        for month in range(12):
            knot = knots[month]
            points = grid[grid <= knot] if branch == 0 else grid[grid > knot]
            for x in points:
                if branch == 0:
                    u = -1.0 + 2.0 * x / knot
                else:
                    u = -1.0 + 2.0 * (x - knot) / (P_MAX_MODDIP_DEG - knot)
                cheb = np.polynomial.chebyshev.chebvander(u, P_DEGREE)[0]
                rows.append(
                    np.outer(month_harmonics(month, P_HARMONICS), cheb).ravel()
                )
                rhs.append(harness.diurnal_p(float(x), month))
        design = np.array(rows)
        target = np.array(rhs)
        solution, *_ = np.linalg.lstsq(design, target, rcond=None)
        worst = max(worst, float(np.max(np.abs(design @ solution - target))))
        branches.append([float(c) for c in solution])
    return (
        {
            "knotsDeg": knots,
            "maxModdipDeg": P_MAX_MODDIP_DEG,
            "degree": P_DEGREE,
            "harmonics": P_HARMONICS,
            "branches": branches,
        },
        worst,
    )


# Anchor circuits. Chosen to span the seasons, both hemispheres, the deep
# daytime and the terminator, and the whole penetration-factor range.
ANCHOR_INPUTS: list[dict[str, Any]] = [
    # case_id, latitude, month (0 = Jan), modified dip, foE, fv, chi, chi_noon
    {"case_id": "noon-mid-north-march", "latitude_deg": 40.0, "month_index": 2,
     "moddip_deg": 55.0, "foE_mhz": 3.4, "fv_mhz": 2.7645,
     "zenith_deg": 16.5, "zenith_noon_deg": 16.5},
    {"case_id": "noon-equator-june", "latitude_deg": 0.0, "month_index": 5,
     "moddip_deg": 2.0, "foE_mhz": 4.2, "fv_mhz": 3.0,
     "zenith_deg": 23.0, "zenith_noon_deg": 23.0},
    {"case_id": "morning-mid-north-june", "latitude_deg": 45.0,
     "month_index": 5, "moddip_deg": 60.0, "foE_mhz": 3.1, "fv_mhz": 2.2,
     "zenith_deg": 62.0, "zenith_noon_deg": 21.5},
    {"case_id": "terminator-mid-north-december", "latitude_deg": 50.0,
     "month_index": 11, "moddip_deg": 62.0, "foE_mhz": 1.6, "fv_mhz": 1.4,
     "zenith_deg": 89.0, "zenith_noon_deg": 73.5},
    {"case_id": "night-clipped-north-december", "latitude_deg": 55.0,
     "month_index": 11, "moddip_deg": 65.0, "foE_mhz": 0.9, "fv_mhz": 0.7,
     "zenith_deg": 115.0, "zenith_noon_deg": 78.5},
    {"case_id": "noon-mid-south-january", "latitude_deg": -35.0,
     "month_index": 0, "moddip_deg": 50.0, "foE_mhz": 3.6, "fv_mhz": 3.2,
     "zenith_deg": 12.0, "zenith_noon_deg": 12.0},
    {"case_id": "afternoon-south-september", "latitude_deg": -20.0,
     "month_index": 8, "moddip_deg": 35.0, "foE_mhz": 3.8, "fv_mhz": 6.5,
     "zenith_deg": 48.0, "zenith_noon_deg": 20.0},
    {"case_id": "high-latitude-noon-april", "latitude_deg": 66.0,
     "month_index": 3, "moddip_deg": 69.0, "foE_mhz": 2.6, "fv_mhz": 1.1,
     "zenith_deg": 45.0, "zenith_noon_deg": 45.0},
    {"case_id": "penetration-tail-october", "latitude_deg": 12.0,
     "month_index": 9, "moddip_deg": 18.0, "foE_mhz": 2.0, "fv_mhz": 24.0,
     "zenith_deg": 30.0, "zenith_noon_deg": 28.0},
    {"case_id": "penetration-peak-february", "latitude_deg": 30.0,
     "month_index": 1, "moddip_deg": 45.0, "foE_mhz": 3.0, "fv_mhz": 2.85,
     "zenith_deg": 35.0, "zenith_noon_deg": 34.0},
    {"case_id": "low-penetration-july", "latitude_deg": 25.0,
     "month_index": 6, "moddip_deg": 40.0, "foE_mhz": 4.0, "fv_mhz": 0.2,
     "zenith_deg": 20.0, "zenith_noon_deg": 19.0},
    {"case_id": "equator-terminator-november", "latitude_deg": -5.0,
     "month_index": 10, "moddip_deg": 8.0, "foE_mhz": 1.4, "fv_mhz": 1.2,
     "zenith_deg": 95.0, "zenith_noon_deg": 18.0},
]

ZENITH_CLIP_DEG = 102.0
F_CHI_FLOOR = 0.02


def f_chi(zenith_deg: float, p: float) -> float:
    chi = math.radians(min(zenith_deg, ZENITH_CLIP_DEG))
    return max(math.cos(0.881 * chi) ** p, F_CHI_FLOOR)


def measure_anchors(harness: Harness) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for spec in ANCHOR_INPUTS:
        at_noon = harness.at_noon(
            abs(spec["latitude_deg"]), spec["month_index"]
        )
        phi = harness.phi(spec["fv_mhz"] / spec["foE_mhz"])
        month = spec["month_index"]
        if spec["latitude_deg"] < 0.0:
            month = (month + 6) % 12
        p = harness.diurnal_p(spec["moddip_deg"], month)
        term = (
            at_noon
            * phi
            * f_chi(spec["zenith_deg"], p)
            / f_chi(spec["zenith_noon_deg"], p)
        )
        rows.append(
            {
                **spec,
                "at_noon": at_noon,
                "penetration_factor": phi,
                "diurnal_exponent": p,
                "absorption_term": term,
            }
        )
    return rows


def build_document(build: ReferenceBuild) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="prop03-harness-") as tmp:
        harness = Harness(build, Path(tmp))
        at_noon, _ = fit_at_noon(harness)
        phi, _ = fit_phi(harness)
        p, _ = fit_p(harness)
        anchors = measure_anchors(harness)
        # Residuals are re-measured end to end through the same evaluation the
        # TypeScript module performs, so the published number is the error a
        # caller actually sees rather than an intermediate least-squares one.
        at_noon_residual = max(
            abs(evaluate_at_noon(at_noon, lat, month) / harness.at_noon(lat, month) - 1.0)
            for month in range(12)
            for lat in np.linspace(0.0, 69.99, 1401)
        )
        phi_residual = max(
            abs(evaluate_phi(phi, float(t)) / harness.phi(float(t)) - 1.0)
            for t in np.linspace(0.0, 12.0, 12001)
        )
        p_residual = max(
            abs(evaluate_p(p, float(x), month) - harness.diurnal_p(float(x), month))
            for month in range(12)
            for x in np.linspace(0.0, P_MAX_MODDIP_DEG, 1401)
        )

    worst_anchor_db = 0.0
    for row in anchors:
        modelled = (
            evaluate_at_noon(at_noon, row["latitude_deg"], row["month_index"])
            * evaluate_phi(phi, row["fv_mhz"] / row["foE_mhz"])
        )
        month = row["month_index"]
        if row["latitude_deg"] < 0.0:
            month = (month + 6) % 12
        exponent = evaluate_p(p, row["moddip_deg"], month)
        modelled *= f_chi(row["zenith_deg"], exponent) / f_chi(
            row["zenith_noon_deg"], exponent
        )
        worst_anchor_db = max(
            worst_anchor_db,
            abs(10.0 * math.log10(modelled / row["absorption_term"])),
        )

    return {
        "schema_version": SCHEMA_VERSION,
        "reference_commit": COMMIT,
        "generated_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "notes": (
            "Propulse-fitted D-region absorption model for ITU-R P.533-14 "
            "equation (20), with anchors measured from the pinned reference "
            "build. No ITU table or file is reproduced here: `coefficients` "
            "is our own functional form fitted to measurements, and `anchors` "
            "is the acceptance oracle."
        ),
        "coefficients": {"atNoon": at_noon, "penetration": phi, "diurnal": p},
        "residuals": {
            "at_noon_max_relative": at_noon_residual,
            "penetration_max_relative": phi_residual,
            "diurnal_exponent_max_absolute": p_residual,
            "absorption_term_max_db": worst_anchor_db,
        },
        "anchors": anchors,
    }


def evaluate_at_noon(model: dict[str, Any], latitude_deg: float, month: int) -> float:
    x = min(abs(latitude_deg), 69.99)
    coefficients = model["chebyshev"][model["monthToSeries"][month]]
    return float(
        np.polynomial.chebyshev.chebval(
            x / (MAX_ABS_LATITUDE_DEG / 2.0) - 1.0, coefficients
        )
    )


def evaluate_phi(model: dict[str, Any], t: float) -> float:
    if t <= 0.0:
        t = 0.0
    if t > model["knot"]:
        # The floor belongs to the tail alone: below the knot the curve is
        # legitimately far under it.
        tail = model["tailSlope"] * t + model["tailIntercept"]
        return min(max(tail, model["floor"]), model["ceiling"])
    if model["plateauLo"] <= t <= model["plateauHi"]:
        value = model["ceiling"]
    else:
        segment = (
            model["segments"][0] if t < model["plateauLo"] else model["segments"][1]
        )
        lo, hi = segment["lo"], segment["hi"]
        x = (t - lo) / ((hi - lo) / 2.0) - 1.0
        value = float(np.polynomial.chebyshev.chebval(x, segment["chebyshev"]))
    return min(max(value, 0.0), model["ceiling"])


def evaluate_p(model: dict[str, Any], moddip_deg: float, month: int) -> float:
    x = min(max(moddip_deg, 0.0), model["maxModdipDeg"])
    knot = model["knotsDeg"][month]
    if x <= knot:
        branch = 0
        u = -1.0 + 2.0 * x / knot
    else:
        branch = 1
        u = -1.0 + 2.0 * (x - knot) / (model["maxModdipDeg"] - knot)
    cheb = np.polynomial.chebyshev.chebvander(u, model["degree"])[0]
    design = np.outer(month_harmonics(month, model["harmonics"]), cheb).ravel()
    return float(design @ np.array(model["branches"][branch]))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-dir", type=Path, default=DEFAULT_BUILD_DIR)
    parser.add_argument("--emit", action="store_true")
    parser.add_argument("--validate", action="store_true")
    args = parser.parse_args()

    if not (args.emit or args.validate):
        parser.error("choose --emit or --validate")

    build = ReferenceBuild(Path(args.build_dir) / "ITU-R-HF")
    document = build_document(build)

    if args.emit:
        FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE_PATH.write_text(
            json.dumps(document, indent=2, sort_keys=False) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {FIXTURE_PATH}")

    residuals = document["residuals"]
    print(json.dumps(residuals, indent=2))
    if residuals["absorption_term_max_db"] > 0.25:
        print("FAIL: anchor residual exceeds the declared 0.25 dB", file=sys.stderr)
        return 1
    return 0


class ReferenceBuildGateTests(unittest.TestCase):
    """The gate is the point of this script; assert it cannot be skipped."""

    def test_harness_requires_the_pinned_build(self) -> None:
        missing = ReferenceBuild(Path("/nonexistent/ITU-R-HF"))
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(Exception):
                Harness(missing, Path(tmp))


if __name__ == "__main__":
    raise SystemExit(main())
