"""Server-side geometry/time feature builder for the reference-surface endpoint.

Pure functions, no FastAPI imports. This is a Python port of the training-code
geometry/time feature definitions in ``ml/src/archive_v3/build_features.py``
(the served model's actual feature lineage -- ``build_bronze.py`` lines ~60-90
compute the grid4-square coordinates and ``power_bin_dbm``;
``build_features.py`` lines ~85-161 compute the cyclical hod/doy encodings,
solar position/elevation, ``dark_frac``, and ``min_abs_elev_ends``;
``build_features.py`` lines ~266-303 compute the great-circle geometry and the
``BAND_MHZ`` table). ``ml/src/build_dataset_v4.py`` is a different, unrelated
lineage and does not define these 33 feature names.

The client builder ``src/lib/propagation/coreFeatureBuilder.ts`` implements the
same contract for browser-side requests and matches this module formula for
formula: grid4 centre, great-circle distance/bearing/midpoint, solar
elevation, the 3-point ``dark_frac``, ``min_abs_elev_ends``, the ``BAND_MHZ``
table, ``hod_sin``/``hod_cos``, ``doy_sin``/``doy_cos``, ``is_weekend``, and
``power_bin_dbm`` all agree. There is no known formula disagreement between
the client and this module.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

EARTH_RADIUS_KM = 6371.0

# ml/src/archive_v3/build_features.py:23-34 (BAND_MHZ). Includes 6m, which the
# served physics/nowcast bundles do not carry a one-hot for.
BAND_MHZ: dict[str, float] = {
    "160m": 1.9,
    "80m": 3.6,
    "60m": 5.35,
    "40m": 7.1,
    "30m": 10.12,
    "20m": 14.1,
    "17m": 18.1,
    "15m": 21.1,
    "12m": 24.9,
    "10m": 28.1,
    "6m": 50.3,
}

# The 10 HF bands the served physics/nowcast bundles carry a `band_<name>`
# one-hot for (6m excluded). Order matches
# src/lib/propagation/coreFeatureBuilder.ts HF_MODEL_BANDS.
HF_MODEL_BANDS: tuple[str, ...] = (
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

# The 23 geometry/time feature names, in the served feature contract's order.
GEOMETRY_TIME_FEATURES: tuple[str, ...] = (
    "band_mhz",
    "power_bin_dbm",
    "hod_sin",
    "hod_cos",
    "doy_sin",
    "doy_cos",
    "is_weekend",
    "dist_km",
    "bearing_sin",
    "bearing_cos",
    "tx_lat_sin",
    "tx_lat_cos",
    "tx_lon_sin",
    "tx_lon_cos",
    "rx_lat_sin",
    "rx_lat_cos",
    "mid_lat_sin",
    "mid_lat_cos",
    "sun_elev_tx",
    "sun_elev_rx",
    "sun_elev_mid",
    "dark_frac",
    "min_abs_elev_ends",
)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def grid4_center(grid4: str) -> tuple[float, float]:
    """Geometric centre (lat_deg, lon_deg) of a Maidenhead grid4 square.

    Field letters (chars 0-1) select a 20deg-lon x 10deg-lat field; digits
    (chars 2-3) select a 2deg-lon x 1deg-lat square within that field. This
    is the grid4-square centre, not a field centre or activity centroid (the
    training data optionally substitutes activity centroids for 2-char field
    centres; grid4 squares here always use the geometric centre).
    """
    field_lon = ord(grid4[0]) - ord("A")
    field_lat = ord(grid4[1]) - ord("A")
    square_lon = int(grid4[2])
    square_lat = int(grid4[3])
    lon = field_lon * 20 - 180 + square_lon * 2 + 1
    lat = field_lat * 10 - 90 + square_lat * 1 + 0.5
    return lat, lon


def great_circle_geometry(
    origin_lat_deg: float,
    origin_lon_deg: float,
    target_lat_deg: float,
    target_lon_deg: float,
) -> dict[str, float]:
    """Great-circle distance, forward bearing, and midpoint (radians throughout).

    Mirrors ml/src/archive_v3/build_features.py lines ~266-293 (the `geometry`
    CTE and its `dist_km`/`bearing_sin`/`bearing_cos`/`mid_lat`/`mid_lon`
    projections).
    """
    la1 = math.radians(origin_lat_deg)
    lo1 = math.radians(origin_lon_deg)
    la2 = math.radians(target_lat_deg)
    lo2 = math.radians(target_lon_deg)
    dlon = lo2 - lo1
    central_angle_rad = math.acos(
        clamp(
            math.sin(la1) * math.sin(la2) + math.cos(la1) * math.cos(la2) * math.cos(dlon),
            -1.0,
            1.0,
        )
    )
    bearing_rad = math.atan2(
        math.sin(dlon) * math.cos(la2),
        math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dlon),
    )
    bx = math.cos(la2) * math.cos(dlon)
    by_ = math.cos(la2) * math.sin(dlon)
    mid_lat_rad = math.atan2(
        math.sin(la1) + math.sin(la2),
        math.sqrt((math.cos(la1) + bx) ** 2 + by_**2),
    )
    mid_lon_rad = lo1 + math.atan2(by_, math.cos(la1) + bx)
    return {
        "la1": la1,
        "lo1": lo1,
        "la2": la2,
        "lo2": lo2,
        "central_angle_rad": central_angle_rad,
        "dist_km": central_angle_rad * EARTH_RADIUS_KM,
        "bearing_rad": bearing_rad,
        "mid_lat_rad": mid_lat_rad,
        "mid_lon_rad": mid_lon_rad,
    }


def solar_position(valid_time_utc: datetime) -> tuple[float, float, float]:
    """(frac_hour, declination_rad, equation_of_time_minutes) at valid_time_utc.

    Mirrors ml/src/archive_v3/build_features.py lines ~89-128 (NOAA
    solar-position approximation). Training binned every row to its
    containing UTC hour and used the hour's mid-point as `frac_hour`
    (`target_hour.dt.hour() + 0.5`, build_features.py line ~92); this module
    matches that exactly and ignores `valid_time_utc`'s minute component.
    """
    doy = valid_time_utc.timetuple().tm_yday
    frac_hour = valid_time_utc.hour + 0.5
    gamma = 2 * math.pi / 365 * (doy - 1 + (frac_hour - 12) / 24)
    declination_rad = (
        0.006918
        - 0.399912 * math.cos(gamma)
        + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2 * gamma)
        + 0.000907 * math.sin(2 * gamma)
        - 0.002697 * math.cos(3 * gamma)
        + 0.00148 * math.sin(3 * gamma)
    )
    equation_of_time_minutes = 229.18 * (
        0.000075
        + 0.001868 * math.cos(gamma)
        - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2 * gamma)
        - 0.040849 * math.sin(2 * gamma)
    )
    return frac_hour, declination_rad, equation_of_time_minutes


def sun_elevation_deg(
    lat_rad: float,
    lon_rad: float,
    frac_hour: float,
    declination_rad: float,
    equation_of_time_minutes: float,
) -> float:
    """Solar elevation angle in degrees at (lat_rad, lon_rad).

    Mirrors ml/src/archive_v3/build_features.py lines ~130-146
    (`sun_elevation`).
    """
    true_solar_time = frac_hour * 60 + equation_of_time_minutes + 4 * math.degrees(lon_rad)
    hour_angle_rad = math.radians(true_solar_time / 4 - 180)
    sine = clamp(
        math.sin(lat_rad) * math.sin(declination_rad)
        + math.cos(lat_rad) * math.cos(declination_rad) * math.cos(hour_angle_rad),
        -1.0,
        1.0,
    )
    return math.degrees(math.asin(sine))


def power_bin_dbm(declared_power_watts: float) -> float:
    """Rounds declared power (watts) to the nearest 5 dBm bin.

    Mirrors ml/src/archive_v3/build_bronze.py line 66:
    ``round(tx_power_dbm / 5.0) * 5.0`` where dBm = 10*log10(watts*1000).
    DuckDB's ``round()`` rounds half away from zero (round-half-up for the
    positive dBm values seen in practice); ``math.floor(x + 0.5)`` matches
    that instead of Python's round-half-to-even ``round()``.
    """
    dbm = 10 * math.log10(declared_power_watts * 1000)
    return math.floor(dbm / 5 + 0.5) * 5


def build_geometry_time_features(
    *,
    origin_grid4: str,
    target_grid4: str,
    valid_time: datetime,
    band: str,
    declared_power_watts: float,
) -> dict[str, float]:
    """Builds the 23 geometry/time features plus the 10 band one-hots.

    Raises ValueError for an unsupported band. `valid_time` must be
    timezone-aware; it is converted to UTC before extracting day-of-year,
    hour, and weekday (`frac_hour` uses the hour only -- see `solar_position`).
    """
    if band not in HF_MODEL_BANDS:
        raise ValueError(f"unsupported band: {band}")
    origin_lat, origin_lon = grid4_center(origin_grid4)
    target_lat, target_lon = grid4_center(target_grid4)
    geometry = great_circle_geometry(origin_lat, origin_lon, target_lat, target_lon)

    valid_time_utc = valid_time.astimezone(timezone.utc)
    frac_hour, declination_rad, equation_of_time_minutes = solar_position(valid_time_utc)

    sun_elev_tx = sun_elevation_deg(
        geometry["la1"], geometry["lo1"], frac_hour, declination_rad, equation_of_time_minutes
    )
    sun_elev_rx = sun_elevation_deg(
        geometry["la2"], geometry["lo2"], frac_hour, declination_rad, equation_of_time_minutes
    )
    sun_elev_mid = sun_elevation_deg(
        geometry["mid_lat_rad"],
        geometry["mid_lon_rad"],
        frac_hour,
        declination_rad,
        equation_of_time_minutes,
    )
    # ml/src/archive_v3/build_features.py lines ~154-161: dark_frac is the
    # mean of 3 booleans (tx/mid/rx elevation < 0), not a great-circle slerp.
    dark_frac = (
        float(sun_elev_tx < 0) + float(sun_elev_mid < 0) + float(sun_elev_rx < 0)
    ) / 3
    min_abs_elev_ends = min(abs(sun_elev_tx), abs(sun_elev_rx))

    doy = valid_time_utc.timetuple().tm_yday
    doy_angle = 2 * math.pi * (doy - 1) / 365
    hod_angle = 2 * math.pi * frac_hour / 24

    values: dict[str, float] = {
        "band_mhz": BAND_MHZ[band],
        "power_bin_dbm": power_bin_dbm(declared_power_watts),
        "hod_sin": math.sin(hod_angle),
        "hod_cos": math.cos(hod_angle),
        "doy_sin": math.sin(doy_angle),
        "doy_cos": math.cos(doy_angle),
        "is_weekend": 1.0 if valid_time_utc.weekday() >= 5 else 0.0,
        "dist_km": geometry["dist_km"],
        "bearing_sin": math.sin(geometry["bearing_rad"]),
        "bearing_cos": math.cos(geometry["bearing_rad"]),
        "tx_lat_sin": math.sin(geometry["la1"]),
        "tx_lat_cos": math.cos(geometry["la1"]),
        "tx_lon_sin": math.sin(geometry["lo1"]),
        "tx_lon_cos": math.cos(geometry["lo1"]),
        "rx_lat_sin": math.sin(geometry["la2"]),
        "rx_lat_cos": math.cos(geometry["la2"]),
        "mid_lat_sin": math.sin(geometry["mid_lat_rad"]),
        "mid_lat_cos": math.cos(geometry["mid_lat_rad"]),
        "sun_elev_tx": sun_elev_tx,
        "sun_elev_rx": sun_elev_rx,
        "sun_elev_mid": sun_elev_mid,
        "dark_frac": dark_frac,
        "min_abs_elev_ends": min_abs_elev_ends,
    }
    for name in HF_MODEL_BANDS:
        values[f"band_{name}"] = 1.0 if name == band else 0.0
    return values
