from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

import httpx

from operational_weather import (
    PostgrestOperationalWeatherProvider,
    build_operational_weather,
)


ISSUE = datetime(2026, 7, 15, 20, tzinfo=timezone.utc)


def row(at: datetime, *, kp: float, bz: float, dst: float) -> dict:
    timestamp = at.isoformat()
    return {
        "captured_at": timestamp,
        "kp_index": kp,
        "sfi": 155.0,
        "bx_gsm": 1.0,
        "by_gsm": -2.0,
        "bz_gsm": bz,
        "bt": 5.0,
        "solar_wind_speed": 430.0,
        "solar_wind_temperature": 120_000.0,
        "solar_wind_density": 4.5,
        "sunspot_number": 110.0,
        "proton_flux_10mev": 0.2,
        "dst_index": dst,
        "source_observed_at": {
            "kp": timestamp,
            "f107": timestamp,
            "magnetic_field": timestamp,
            "solar_wind": timestamp,
            "sunspot_number": timestamp,
            "proton_flux_10mev": timestamp,
            "dst": timestamp,
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


if __name__ == "__main__":
    unittest.main()
