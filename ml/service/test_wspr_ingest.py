from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

import httpx

from wspr_ingest import (
    PostgrestObservationStore,
    ingest_observations,
    normalize_observation,
    power_bin_dbm,
)


RECEIPT = datetime(2026, 7, 16, 1, 5, tzinfo=timezone.utc)


def raw_observation(source_id="spot-1"):
    return {
        "source_id": source_id,
        "event_time": "2026-07-16T00:59:30Z",
        "band": "20M",
        "tx_call": " k1abc ",
        "tx_grid": "em10aa",
        "rx_call": "g4xyz",
        "rx_grid": "io91bb",
        "tx_power_dbm": 7.5,
        "snr_db": -21,
    }


class FakeStore:
    def __init__(self):
        self.pages = []

    def insert_observation_page(self, rows):
        self.pages.append(rows)


class WsprIngestTests(unittest.TestCase):
    def test_postgrest_store_uses_server_authoritative_cutover_rpc(self):
        requests = []

        def handler(request):
            requests.append(request)
            return httpx.Response(200, json=1)

        client = httpx.Client(transport=httpx.MockTransport(handler))
        store = PostgrestObservationStore(
            base_url="https://example.supabase.co",
            service_key="secret",
            client=client,
        )
        store.insert_observation_page([{"source": "approved-fixture"}])
        self.assertEqual(
            requests[0].url.path,
            "/rest/v1/rpc/ingest_wspr_observation_rows",
        )
        self.assertEqual(
            requests[0].read(),
            b'{"p_rows":[{"source":"approved-fixture"}]}',
        )
        client.close()

    def test_normalization_matches_archive_slot_grid_and_power_contract(self):
        row = normalize_observation(
            raw_observation(),
            provider="approved-fixture",
            received_at=RECEIPT,
            ingest_version="fixture-v1",
        )
        self.assertEqual(row["band"], "20m")
        self.assertEqual(row["tx_call"], "K1ABC")
        self.assertEqual(row["tx_grid4"], "EM10")
        self.assertEqual(row["rx_grid4"], "IO91")
        self.assertEqual(row["power_bin_dbm"], 10)
        self.assertEqual(row["slot_epoch"] % 120, 0)
        self.assertEqual(row["target_hour"], "2026-07-16T00:00:00+00:00")
        self.assertEqual(len(row["observation_key_sha256"]), 64)

    def test_natural_key_is_idempotent_across_receipt_retries(self):
        first = normalize_observation(
            raw_observation(),
            provider="approved-fixture",
            received_at=RECEIPT,
            ingest_version="fixture-v1",
        )
        second = normalize_observation(
            raw_observation(),
            provider="approved-fixture",
            received_at=RECEIPT + timedelta(minutes=1),
            ingest_version="fixture-v1",
        )
        self.assertEqual(
            first["observation_key_sha256"],
            second["observation_key_sha256"],
        )
        self.assertNotEqual(first["received_at"], second["received_at"])

    def test_ingest_is_bounded_into_pages(self):
        store = FakeStore()
        result = ingest_observations(
            store,
            [raw_observation(f"spot-{index}") for index in range(5)],
            provider="approved-fixture",
            received_at=RECEIPT,
            ingest_version="fixture-v1",
            page_size=2,
        )
        self.assertEqual(result, {"normalized_rows": 5})
        self.assertEqual([len(page) for page in store.pages], [2, 2, 1])

    def test_invalid_time_and_ranges_fail_before_write(self):
        for change in (
            {"event_time": "2026-07-14T00:00:00Z"},
            {"snr_db": -81},
            {"snr_db": float("nan")},
            {"tx_power_dbm": float("inf")},
            {"source_id": "x" * 257},
            {"tx_grid": "BAD"},
            {"band": "6m"},
        ):
            raw = {**raw_observation(), **change}
            with self.assertRaises((ValueError, KeyError)):
                normalize_observation(
                    raw,
                    provider="approved-fixture",
                    received_at=RECEIPT,
                    ingest_version="fixture-v1",
                )

    def test_power_bins_round_half_away_from_zero_like_duckdb(self):
        self.assertEqual(power_bin_dbm(2.5), 5)
        self.assertEqual(power_bin_dbm(-2.5), -5)


if __name__ == "__main__":
    unittest.main()
