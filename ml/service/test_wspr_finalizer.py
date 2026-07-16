from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

import httpx

from wspr_finalizer import (
    TRANSFORM_VERSION,
    PostgrestFinalizerStore,
    finalize_hour,
)


TARGET = datetime(2026, 7, 15, 20, tzinfo=timezone.utc)


class FakeStore:
    def __init__(self):
        self.features = []
        self.watermarks = []
        self.events = []

    def observation_pages(self, **kwargs):
        self.events.append("read")
        rows = []
        grids = ["EM10", "FN31", "QF56", "DM79", "GG66", "PL05"]
        receivers = ["IO91", "JN18", "PM95", "FK68", "JO62", "AA00"]
        for index in range(6):
            rows.append({
                "slot_epoch": 1000,
                "target_hour": TARGET.isoformat(),
                "band": "20m",
                "tx_call": f"TX{index}",
                "tx_grid4": grids[index],
                "rx_call": f"RX{index}",
                "rx_grid4": receivers[index],
                "power_bin_dbm": 7,
                "snr_db": -20 + index,
            })
        yield rows[:3]
        yield rows[3:]

    def upsert_feature_page(self, rows):
        self.events.append("features")
        self.features.extend(rows)

    def upsert_watermark(self, row):
        self.events.append("watermark")
        self.watermarks.append(row)


class WsprFinalizerTests(unittest.TestCase):
    def test_postgrest_lookup_filters_the_requested_band(self):
        requests = []

        def handler(request):
            requests.append(request)
            return httpx.Response(200, json=[])

        store = PostgrestFinalizerStore(
            base_url="https://feature-store.test",
            service_key="secret",
            client=httpx.Client(transport=httpx.MockTransport(handler)),
        )
        pages = list(store.observation_pages(
            target_hour=TARGET,
            band="20m",
            provider="approved-fixture",
            available_at=TARGET + timedelta(hours=1),
            page_size=100,
        ))
        self.assertEqual(pages, [])
        self.assertEqual(requests[0].url.params["band"], "eq.20m")

    def test_finalizer_streams_pages_and_commits_watermark_last(self):
        store = FakeStore()
        result = finalize_hour(
            store,
            target_hour=TARGET,
            available_at=TARGET + timedelta(hours=1, minutes=5),
            source_watermark=TARGET + timedelta(hours=1),
            band="20m",
            provider="approved-fixture",
            source_complete=True,
            page_size=3,
            threads=2,
        )
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["observation_count"], 6)
        self.assertGreater(result["feature_cell_count"], 6)
        self.assertEqual(result["transform_version"], TRANSFORM_VERSION)
        self.assertEqual(store.events[-1], "watermark")
        self.assertEqual(len(store.watermarks), 1)
        self.assertEqual(len(store.features), result["feature_cell_count"])
        self.assertTrue(all(row["provider"] == "approved-fixture" for row in store.features))

    def test_finalizer_refuses_unconfirmed_source_before_io(self):
        store = FakeStore()
        with self.assertRaisesRegex(RuntimeError, "completeness"):
            finalize_hour(
                store,
                target_hour=TARGET,
                available_at=TARGET + timedelta(hours=1),
                source_watermark=TARGET + timedelta(hours=1),
                band="20m",
                provider="approved-fixture",
                source_complete=False,
            )
        self.assertEqual(store.events, [])

    def test_quality_flag_writes_degraded_watermark(self):
        store = FakeStore()
        result = finalize_hour(
            store,
            target_hour=TARGET,
            available_at=TARGET + timedelta(hours=1),
            source_watermark=TARGET + timedelta(hours=1),
            band="20m",
            provider="approved-fixture",
            source_complete=True,
            quality_flags=("coverage_low",),
            page_size=10,
            threads=2,
        )
        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["quality_flags"], ["coverage_low"])

    def test_finalizer_refuses_partial_hour_watermark_before_io(self):
        store = FakeStore()
        with self.assertRaisesRegex(ValueError, "complete target hour"):
            finalize_hour(
                store,
                target_hour=TARGET,
                available_at=TARGET + timedelta(hours=1),
                source_watermark=TARGET + timedelta(minutes=59),
                band="20m",
                provider="approved-fixture",
                source_complete=True,
            )
        self.assertEqual(store.events, [])


if __name__ == "__main__":
    unittest.main()
