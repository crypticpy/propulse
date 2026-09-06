from __future__ import annotations

import math
import unittest
from datetime import datetime, timezone

from reference_features import (
    BAND_MHZ,
    GEOMETRY_TIME_FEATURES,
    HF_MODEL_BANDS,
    build_geometry_time_features,
    grid4_center,
    power_bin_dbm,
    solar_position,
    sun_elevation_deg,
)


def independent_great_circle(lat1, lon1, lat2, lon2):
    """Haversine distance (km) + initial bearing (deg), independent of the
    spherical-law-of-cosines implementation under test."""
    la1, lo1, la2, lo2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = la2 - la1
    dlon = lo2 - lo1
    a = math.sin(dlat / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlon / 2) ** 2
    central_angle = 2 * math.asin(min(1.0, math.sqrt(a)))
    dist_km = central_angle * 6371.0
    bearing = math.atan2(
        math.sin(dlon) * math.cos(la2),
        math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dlon),
    )
    return dist_km, math.degrees(bearing) % 360


class Grid4CenterTests(unittest.TestCase):
    def test_em12_north_texas(self):
        lat, lon = grid4_center("EM12")
        self.assertAlmostEqual(lat, 32.5)
        self.assertAlmostEqual(lon, -97.0)

    def test_jo21_netherlands(self):
        lat, lon = grid4_center("JO21")
        self.assertAlmostEqual(lat, 51.5)
        self.assertAlmostEqual(lon, 5.0)

    def test_qf56_sydney(self):
        lat, lon = grid4_center("QF56")
        self.assertAlmostEqual(lat, -33.5)
        self.assertAlmostEqual(lon, 151.0)


class GreatCircleTests(unittest.TestCase):
    def test_em12_to_jo21_distance_and_bearing(self):
        origin = grid4_center("EM12")
        target = grid4_center("JO21")
        expected_dist_km, expected_bearing_deg = independent_great_circle(
            origin[0], origin[1], target[0], target[1]
        )
        # Cross-check against the module's own formula path via the full
        # feature builder's dist_km/bearing outputs.
        features = build_geometry_time_features(
            origin_grid4="EM12",
            target_grid4="JO21",
            valid_time=datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc),
            band="20m",
            declared_power_watts=100,
        )
        self.assertAlmostEqual(features["dist_km"], expected_dist_km, delta=5.0)
        bearing_deg = math.degrees(
            math.atan2(features["bearing_sin"], features["bearing_cos"])
        ) % 360
        self.assertAlmostEqual(bearing_deg, expected_bearing_deg, delta=0.5)
        # Sanity-check against the task's approximate figures.
        self.assertTrue(7500 < features["dist_km"] < 8500)
        self.assertTrue(30 < bearing_deg < 55)


class SolarPositionTests(unittest.TestCase):
    def test_frac_hour_ignores_minutes_and_uses_the_hour_midpoint(self):
        # build_features.py line ~92: frac_hour = target_hour.dt.hour() + 0.5.
        # Training bins every row to its containing UTC hour, so this module
        # ignores valid_time's minute component entirely.
        for minute in (0, 15, 30, 45, 59):
            valid_time = datetime(2026, 9, 5, 14, minute, tzinfo=timezone.utc)
            frac_hour, _, _ = solar_position(valid_time)
            self.assertEqual(frac_hour, 14.5)

    def test_near_solar_noon_elevation_near_ninety_minus_lat(self):
        # 2026-03-20 is close to the March equinox (declination ~0). frac_hour
        # is quantized to the hour midpoint, so pick the UTC hour whose
        # midpoint lands closest to true local solar noon at this longitude.
        lat_deg = -33.5  # QF56
        lon_deg = 151.0
        ideal_frac_hour = (12 - lon_deg / 15) % 24
        hour = round(ideal_frac_hour - 0.5) % 24
        valid_time = datetime(2026, 3, 20, hour, 0, tzinfo=timezone.utc)
        frac_hour, decl_rad, eqtime = solar_position(valid_time)
        elevation = sun_elevation_deg(
            math.radians(lat_deg), math.radians(lon_deg), frac_hour, decl_rad, eqtime
        )
        self.assertAlmostEqual(elevation, 90 - abs(lat_deg), delta=2.0)


class DarkFracTests(unittest.TestCase):
    def test_all_daylight_near_pole_summer_solstice(self):
        # High northern-latitude grid squares near the June solstice: the sun
        # never sets, so all 3 sample points (tx, mid, rx) should be daylight.
        features = build_geometry_time_features(
            origin_grid4="IR99",
            target_grid4="JR99",
            valid_time=datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc),
            band="20m",
            declared_power_watts=100,
        )
        self.assertEqual(features["dark_frac"], 0.0)

    def test_all_night_near_pole_winter_solstice(self):
        features = build_geometry_time_features(
            origin_grid4="IR99",
            target_grid4="JR99",
            valid_time=datetime(2026, 12, 21, 12, 0, tzinfo=timezone.utc),
            band="20m",
            declared_power_watts=100,
        )
        self.assertEqual(features["dark_frac"], 1.0)

    def test_dark_frac_matches_the_three_point_mean(self):
        # ml/src/archive_v3/build_features.py lines ~154-161: dark_frac is
        # the mean of exactly 3 booleans (tx/mid/rx elevation < 0) -- verify
        # the built dark_frac equals that formula applied to the built
        # sun_elev_tx/mid/rx values, independent of how they were computed.
        features = build_geometry_time_features(
            origin_grid4="EM12",
            target_grid4="JO21",
            valid_time=datetime(2026, 9, 5, 3, 0, tzinfo=timezone.utc),
            band="20m",
            declared_power_watts=100,
        )
        expected = (
            float(features["sun_elev_tx"] < 0)
            + float(features["sun_elev_mid"] < 0)
            + float(features["sun_elev_rx"] < 0)
        ) / 3
        self.assertEqual(features["dark_frac"], expected)


class MiscFeatureTests(unittest.TestCase):
    def test_is_weekend_saturday_and_sunday(self):
        saturday = build_geometry_time_features(
            origin_grid4="EM12",
            target_grid4="JO21",
            valid_time=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc),  # Saturday
            band="20m",
            declared_power_watts=100,
        )
        sunday = build_geometry_time_features(
            origin_grid4="EM12",
            target_grid4="JO21",
            valid_time=datetime(2026, 9, 6, 12, 0, tzinfo=timezone.utc),  # Sunday
            band="20m",
            declared_power_watts=100,
        )
        monday = build_geometry_time_features(
            origin_grid4="EM12",
            target_grid4="JO21",
            valid_time=datetime(2026, 9, 7, 12, 0, tzinfo=timezone.utc),  # Monday
            band="20m",
            declared_power_watts=100,
        )
        self.assertEqual(saturday["is_weekend"], 1.0)
        self.assertEqual(sunday["is_weekend"], 1.0)
        self.assertEqual(monday["is_weekend"], 0.0)

    def test_power_bin_dbm_5_watts(self):
        # 10*log10(5*1000) ~= 36.99 dBm -> nearest 5 dBm bin is 35.
        self.assertEqual(power_bin_dbm(5), 35)

    def test_power_bin_dbm_exact_half_boundary_rounds_up(self):
        # 32.5 dBm is exactly the boundary between the 30 and 35 dBm bins.
        # DuckDB's round() (ml/src/archive_v3/build_bronze.py:66) rounds half
        # away from zero, giving 35 here; Python's round-half-to-even would
        # give 30. Solve watts so that 10*log10(watts*1000) == 32.5 exactly.
        watts = 10 ** (32.5 / 10) / 1000
        self.assertAlmostEqual(10 * math.log10(watts * 1000), 32.5, places=9)
        self.assertEqual(power_bin_dbm(watts), 35)

    def test_band_mhz_uses_the_v3_table(self):
        self.assertEqual(BAND_MHZ["20m"], 14.1)
        self.assertEqual(BAND_MHZ["15m"], 21.1)
        self.assertEqual(BAND_MHZ["10m"], 28.1)

    def test_unsupported_band_raises(self):
        with self.assertRaises(ValueError):
            build_geometry_time_features(
                origin_grid4="EM12",
                target_grid4="JO21",
                valid_time=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc),
                band="6m",
                declared_power_watts=100,
            )


class OneHotAndFullFeatureSetTests(unittest.TestCase):
    def test_one_hot_correctness(self):
        features = build_geometry_time_features(
            origin_grid4="EM12",
            target_grid4="JO21",
            valid_time=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc),
            band="20m",
            declared_power_watts=100,
        )
        for name in HF_MODEL_BANDS:
            expected = 1.0 if name == "20m" else 0.0
            self.assertEqual(features[f"band_{name}"], expected, name)

    def test_full_feature_set_has_exactly_geometry_and_one_hots(self):
        features = build_geometry_time_features(
            origin_grid4="EM12",
            target_grid4="JO21",
            valid_time=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc),
            band="20m",
            declared_power_watts=100,
        )
        expected_keys = set(GEOMETRY_TIME_FEATURES) | {
            f"band_{name}" for name in HF_MODEL_BANDS
        }
        self.assertEqual(set(features.keys()), expected_keys)
        self.assertEqual(len(features), 33)


if __name__ == "__main__":
    unittest.main()
