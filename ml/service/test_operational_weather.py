from __future__ import annotations

import math
import unittest
from datetime import datetime, timedelta, timezone

import httpx

from operational_weather import (
    PostgrestOperationalWeatherProvider,
    add_derived_physics_features,
    build_operational_weather,
    kp_to_ap,
)


ISSUE = datetime(2026, 7, 15, 20, tzinfo=timezone.utc)


def row(
    at: datetime,
    *,
    kp: float,
    bz: float,
    dst: float,
    bt: float = 5.0,
    wind_speed: float = 430.0,
    temperature: float = 120_000.0,
    density: float = 4.5,
    hp60: float | None = 1.333,
    hp60_observed_at: datetime | None = None,
) -> dict:
    timestamp = at.isoformat()
    hp60_timestamp = (
        (hp60_observed_at or at).isoformat() if hp60 is not None else None
    )
    return {
        "captured_at": timestamp,
        "kp_index": kp,
        "sfi": 155.0,
        "bx_gsm": 1.0,
        "by_gsm": -2.0,
        "bz_gsm": bz,
        "bt": bt,
        "solar_wind_speed": wind_speed,
        "solar_wind_temperature": temperature,
        "solar_wind_density": density,
        "sunspot_number": 110.0,
        "proton_flux_10mev": 0.2,
        "dst_index": dst,
        "hp60": hp60,
        "source_observed_at": {
            "kp": timestamp,
            "f107": timestamp,
            "magnetic_field": timestamp,
            "solar_wind": timestamp,
            "sunspot_number": timestamp,
            "proton_flux_10mev": timestamp,
            "dst": timestamp,
            "hp60": hp60_timestamp,
        },
        "source_status": {
            "magnetic_field": {"active": True},
            "solar_wind": {"active": True},
        },
    }


class OperationalWeatherTests(unittest.TestCase):
    def test_builder_uses_causal_rows_and_derives_windows(self) -> None:
        rows = [
            row(ISSUE - timedelta(hours=3), kp=1.0, bz=-2.0, dst=-10.0),
            row(ISSUE - timedelta(hours=1), kp=2.0, bz=-8.0, dst=-30.0),
            row(ISSUE, kp=3.0, bz=-4.0, dst=-20.0),
            row(ISSUE + timedelta(minutes=1), kp=9.0, bz=-30.0, dst=-100.0),
        ]

        result = build_operational_weather(rows, ISSUE)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.values["kp"], 3.0)
        self.assertEqual(result.values["kp_delta_3h"], 2.0)
        self.assertEqual(result.values["kp_max_24h"], 3.0)
        self.assertEqual(result.values["bz_min_3h"], -8.0)
        self.assertEqual(result.values["dst_min_6h"], -30.0)
        self.assertLessEqual(result.available_at, ISSUE)
        self.assertLessEqual(result.source_watermark, ISSUE)

    def test_proton_flux_survives_goes_latency_within_the_hour(self) -> None:
        # Real cadence: the snapshot is captured ~13 min after the GOES
        # observation and requests arrive up to 15 min after capture.
        captured = ISSUE - timedelta(minutes=14)
        snapshot = row(captured, kp=3.0, bz=-2.0, dst=-10.0)
        snapshot["source_observed_at"]["proton_flux_10mev"] = (
            captured - timedelta(minutes=13)
        ).isoformat()
        stale = row(ISSUE - timedelta(hours=2), kp=3.0, bz=-2.0, dst=-10.0)
        stale["source_observed_at"]["proton_flux_10mev"] = (
            ISSUE - timedelta(minutes=61)
        ).isoformat()

        fresh = build_operational_weather([snapshot], ISSUE)
        expired = build_operational_weather([stale], ISSUE)

        assert fresh is not None and expired is not None
        self.assertEqual(fresh.values["proton_flux_10mev"], 0.2)
        self.assertNotIn("proton_flux_10mev", expired.values)

    def test_inactive_realtime_source_is_not_trusted(self) -> None:
        inactive = row(ISSUE, kp=3.0, bz=-30.0, dst=-20.0)
        inactive["source_status"]["magnetic_field"]["active"] = False

        result = build_operational_weather([inactive], ISSUE)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertNotIn("bz_gsm", result.values)
        self.assertNotIn("bt", result.values)
        self.assertEqual(result.values["kp"], 3.0)

    def test_availability_covers_latest_selected_receipt(self) -> None:
        first_receipt = ISSUE - timedelta(minutes=4)
        last_receipt = ISSUE - timedelta(minutes=1)
        rows = [
            {
                "captured_at": first_receipt.isoformat(),
                "kp_index": 3.0,
                "bx_gsm": 1.0,
                "source_observed_at": {
                    "kp": (ISSUE - timedelta(minutes=5)).isoformat(),
                    "magnetic_field": (ISSUE - timedelta(minutes=5)).isoformat(),
                },
                "source_status": {"magnetic_field": {"active": True}},
            },
            {
                "captured_at": last_receipt.isoformat(),
                "bz_gsm": -6.0,
                "source_observed_at": {
                    "magnetic_field": (ISSUE - timedelta(minutes=2)).isoformat(),
                },
                "source_status": {"magnetic_field": {"active": True}},
            },
        ]

        result = build_operational_weather(rows, ISSUE)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.values["kp"], 3.0)
        self.assertEqual(result.values["bx_gsm"], 1.0)
        self.assertEqual(result.values["bz_gsm"], -6.0)
        self.assertEqual(result.available_at, last_receipt)

    def test_hp60_restored_when_within_max_age(self) -> None:
        snapshot = row(ISSUE, kp=3.0, bz=-2.0, dst=-10.0, hp60=1.667)

        result = build_operational_weather([snapshot], ISSUE)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.values["hp60"], 1.667)

    def test_hp60_absent_when_older_than_max_age(self) -> None:
        # SOURCE_MAX_AGE_SECONDS["hp60"] is 3 hours; an index observed just
        # past that window must not be trusted as current.
        snapshot = row(
            ISSUE,
            kp=3.0,
            bz=-2.0,
            dst=-10.0,
            hp60=1.667,
            hp60_observed_at=ISSUE - timedelta(hours=3, minutes=1),
        )

        result = build_operational_weather([snapshot], ISSUE)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertNotIn("hp60", result.values)

    def test_hp60_absent_when_column_is_null(self) -> None:
        # GFZ leaves the hour's Hp60 null until it is computed; the
        # collector then records the column as null with no observed_at.
        snapshot = row(ISSUE, kp=3.0, bz=-2.0, dst=-10.0, hp60=None)

        result = build_operational_weather([snapshot], ISSUE)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertNotIn("hp60", result.values)

    def test_postgrest_lookup_is_bounded_and_cached(self) -> None:
        requests = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(200, json=[row(ISSUE, kp=3.0, bz=-4.0, dst=-20.0)])

        provider = PostgrestOperationalWeatherProvider(
            base_url="https://weather-store.test",
            service_key="secret",
            cache_seconds=60,
            client=httpx.Client(transport=httpx.MockTransport(handler)),
        )

        first = provider.lookup(issue_time=ISSUE)
        second = provider.lookup(issue_time=ISSUE)

        self.assertIs(first, second)
        self.assertEqual(len(requests), 1)
        bounds = requests[0].url.params.get_list("captured_at")
        self.assertEqual(len(bounds), 2)
        self.assertTrue(any(value.startswith("lte.") for value in bounds))
        self.assertTrue(any(value.startswith("gte.") for value in bounds))


class DerivedPhysicsFeatureTests(unittest.TestCase):
    """Hand-computed OMNI2 row: Np=5, V=400, T=1e5, Bt=5, Bz=-3, Kp=2.33."""

    def omni_row(self) -> dict[str, float]:
        return {
            "wind_speed": 400.0,
            "density_cm3": 5.0,
            "temperature_k": 1e5,
            "bt": 5.0,
            "bz_gsm": -3.0,
            "kp": 2.33,
        }

    def test_flow_pressure_matches_omni_formula(self) -> None:
        values = self.omni_row()
        add_derived_physics_features(values)
        self.assertAlmostEqual(values["flow_pressure"], 1.6, places=9)

    def test_electric_field_matches_omni_formula(self) -> None:
        values = self.omni_row()
        add_derived_physics_features(values)
        self.assertAlmostEqual(values["electric_field"], 1.2, places=9)

    def test_plasma_beta_matches_omni_formula(self) -> None:
        values = self.omni_row()
        add_derived_physics_features(values)
        self.assertAlmostEqual(values["plasma_beta"], 1.9, places=9)

    def test_alfven_mach_matches_omni_formula(self) -> None:
        values = self.omni_row()
        add_derived_physics_features(values)
        self.assertAlmostEqual(values["alfven_mach"], 8.94427190999916, places=9)

    def test_magnetosonic_mach_matches_omni_formula(self) -> None:
        values = self.omni_row()
        add_derived_physics_features(values)
        self.assertAlmostEqual(values["magnetosonic_mach"], 5.503151456571707, places=9)

    def test_ap_matches_kp_conversion_table(self) -> None:
        values = self.omni_row()
        add_derived_physics_features(values)
        self.assertEqual(values["ap"], 9.0)

    def test_kp_to_ap_table_boundaries(self) -> None:
        self.assertEqual(kp_to_ap(0.0), 0.0)
        self.assertEqual(kp_to_ap(2.0), 7.0)
        self.assertEqual(kp_to_ap(2.67), 12.0)
        self.assertEqual(kp_to_ap(9.0), 400.0)
        # The table is undefined outside 0..9: never clamp a bad Kp onto a
        # trusted quiet/storm value.
        self.assertIsNone(kp_to_ap(-1.0))
        self.assertIsNone(kp_to_ap(9.01))
        self.assertIsNone(kp_to_ap(15.0))
        self.assertIsNone(kp_to_ap(math.nan))
        self.assertIsNone(kp_to_ap(math.inf))

    def test_out_of_range_kp_leaves_ap_absent(self) -> None:
        for kp in (-0.5, 12.0, 1e300):
            values = self.omni_row()
            values["kp"] = kp
            add_derived_physics_features(values)
            self.assertNotIn("ap", values)

    def test_nonpositive_temperature_leaves_feature_absent(self) -> None:
        # A negative upstream sentinel must not reach sqrt() or produce a
        # nonphysical plasma_beta.
        for temperature in (0.0, -1.0, -999999.0):
            values = self.omni_row()
            values["temperature_k"] = temperature
            add_derived_physics_features(values)
            self.assertNotIn("plasma_beta", values)
            self.assertNotIn("magnetosonic_mach", values)
            self.assertIn("flow_pressure", values)
            self.assertIn("alfven_mach", values)

    def test_nonpositive_wind_speed_leaves_feature_absent(self) -> None:
        for wind_speed in (0.0, -400.0):
            values = self.omni_row()
            values["wind_speed"] = wind_speed
            add_derived_physics_features(values)
            self.assertNotIn("flow_pressure", values)
            self.assertNotIn("electric_field", values)
            self.assertNotIn("alfven_mach", values)
            self.assertNotIn("magnetosonic_mach", values)
            self.assertIn("plasma_beta", values)

    def test_negative_field_magnitude_leaves_feature_absent(self) -> None:
        values = self.omni_row()
        values["bt"] = -5.0
        add_derived_physics_features(values)
        self.assertNotIn("plasma_beta", values)
        self.assertNotIn("alfven_mach", values)
        self.assertNotIn("magnetosonic_mach", values)

    def test_missing_input_leaves_derived_feature_absent(self) -> None:
        values = self.omni_row()
        del values["density_cm3"]
        add_derived_physics_features(values)
        self.assertNotIn("flow_pressure", values)
        self.assertNotIn("plasma_beta", values)
        self.assertNotIn("alfven_mach", values)
        self.assertNotIn("magnetosonic_mach", values)
        # electric_field and ap do not depend on density_cm3.
        self.assertIn("electric_field", values)
        self.assertIn("ap", values)

    def test_zero_field_magnitude_leaves_feature_absent(self) -> None:
        values = self.omni_row()
        values["bt"] = 0.0
        add_derived_physics_features(values)
        self.assertNotIn("plasma_beta", values)
        self.assertNotIn("alfven_mach", values)
        self.assertNotIn("magnetosonic_mach", values)
        # flow_pressure, electric_field, and ap do not depend on bt.
        self.assertIn("flow_pressure", values)
        self.assertIn("electric_field", values)
        self.assertIn("ap", values)

    def test_nonpositive_density_leaves_feature_absent(self) -> None:
        for density in (0.0, -1.0):
            values = self.omni_row()
            values["density_cm3"] = density
            add_derived_physics_features(values)
            self.assertNotIn("flow_pressure", values)
            self.assertNotIn("plasma_beta", values)
            self.assertNotIn("alfven_mach", values)
            self.assertNotIn("magnetosonic_mach", values)

    def test_no_derived_value_is_nan_inf_or_a_fabricated_zero(self) -> None:
        values = self.omni_row()
        values["bt"] = 0.0
        values["density_cm3"] = 0.0
        add_derived_physics_features(values)
        for name in (
            "flow_pressure",
            "electric_field",
            "plasma_beta",
            "alfven_mach",
            "magnetosonic_mach",
        ):
            self.assertTrue(name not in values or math.isfinite(values[name]))

    def test_build_operational_weather_restores_derived_physics_features(self) -> None:
        rows = [
            row(
                ISSUE,
                kp=2.33,
                bz=-3.0,
                dst=-20.0,
                bt=5.0,
                wind_speed=400.0,
                temperature=1e5,
                density=5.0,
            )
        ]

        result = build_operational_weather(rows, ISSUE)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertAlmostEqual(result.values["flow_pressure"], 1.6, places=9)
        self.assertAlmostEqual(result.values["electric_field"], 1.2, places=9)
        self.assertAlmostEqual(result.values["plasma_beta"], 1.9, places=9)
        self.assertAlmostEqual(result.values["alfven_mach"], 8.94427190999916, places=9)
        self.assertAlmostEqual(
            result.values["magnetosonic_mach"], 5.503151456571707, places=9
        )
        self.assertEqual(result.values["ap"], 9.0)


if __name__ == "__main__":
    unittest.main()
