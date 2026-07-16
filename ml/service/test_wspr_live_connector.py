from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs

import httpx

from wspr_live_connector import (
    BAND_CODES,
    PROVIDER,
    WsprLiveClient,
    hour_query,
    latest_settled_hour,
    require_research_gate,
    signed_manifest,
    validate_target_hour,
)
from wspr_scheduler import CompletionManifest


TARGET = datetime(2026, 7, 15, 20, tzinfo=timezone.utc)


def source_row(*, identifier: int = 10, band: int = 14) -> dict:
    return {
        "id": identifier,
        "event_epoch": int((TARGET + timedelta(minutes=5)).timestamp()),
        "band": band,
        "tx_sign": "K1ABC",
        "tx_loc": "EM10aa",
        "rx_sign": "G4XYZ",
        "rx_loc": "IO91bb",
        "power": 10,
        "snr": -21,
    }


class WsprLiveConnectorTests(unittest.TestCase):
    def test_query_is_one_exact_hour_and_archive_filtered(self) -> None:
        query = hour_query(TARGET)

        self.assertIn(str(int(TARGET.timestamp())), query)
        self.assertIn(str(int((TARGET + timedelta(hours=1)).timestamp())), query)
        self.assertIn("band IN (1,3,5,7,10,14,18,21,24,28)", query)
        self.assertIn("power BETWEEN -10 AND 70", query)
        self.assertIn("FORMAT JSONEachRow", query)

    def test_streams_to_disk_with_deterministic_checkpoint(self) -> None:
        requests = []
        content = "\n".join(
            json.dumps(source_row(identifier=index, band=code))
            for index, code in enumerate((1, 14, 28), start=1)
        )

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(200, text=f"{content}\n")

        client = WsprLiveClient(
            client=httpx.Client(transport=httpx.MockTransport(handler))
        )
        with tempfile.TemporaryDirectory() as directory:
            receipt = client.fetch_hour(TARGET, spool_dir=Path(directory))
            lines = receipt.spool_path.read_text(encoding="utf-8").splitlines()

        self.assertEqual(len(requests), 1)
        query = parse_qs(requests[0].url.query.decode())["query"][0]
        self.assertEqual(query, hour_query(TARGET))
        self.assertEqual(receipt.record_count, 3)
        self.assertEqual(receipt.records_by_band["160m"], 1)
        self.assertEqual(receipt.records_by_band["20m"], 1)
        self.assertEqual(receipt.records_by_band["10m"], 1)
        self.assertEqual(json.loads(lines[1])["source_id"], "2")
        self.assertEqual(len(receipt.checkpoint_sha256), 64)

    def test_bad_or_empty_response_does_not_leave_a_spool(self) -> None:
        for body in ("", "not-json\n"):
            client = WsprLiveClient(
                client=httpx.Client(
                    transport=httpx.MockTransport(
                        lambda request, value=body: httpx.Response(200, text=value)
                    )
                )
            )
            with tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(RuntimeError):
                    client.fetch_hour(TARGET, spool_dir=Path(directory))
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_research_gate_and_hour_settlement_fail_closed(self) -> None:
        with self.assertRaises(RuntimeError):
            require_research_gate(acknowledged=False, enabled=True)
        with self.assertRaises(RuntimeError):
            require_research_gate(acknowledged=True, enabled=False)
        require_research_gate(acknowledged=True, enabled=True)
        now = TARGET + timedelta(hours=1, minutes=9)
        with self.assertRaises(ValueError):
            validate_target_hour(
                TARGET,
                now=now,
                settlement=timedelta(minutes=10),
            )
        self.assertEqual(
            latest_settled_hour(
                TARGET + timedelta(hours=2, minutes=11),
                timedelta(minutes=10),
            ),
            TARGET + timedelta(hours=1),
        )

    def test_signed_manifest_matches_scheduler_contract(self) -> None:
        content = json.dumps(source_row()) + "\n"
        client = WsprLiveClient(
            client=httpx.Client(
                transport=httpx.MockTransport(
                    lambda request: httpx.Response(200, text=content)
                )
            )
        )
        with tempfile.TemporaryDirectory() as directory:
            receipt = client.fetch_hour(TARGET, spool_dir=Path(directory))
        payload = signed_manifest(receipt, signing_secret="x" * 32)

        manifest = CompletionManifest.from_json(payload, signing_secret="x" * 32)

        self.assertEqual(manifest.provider, PROVIDER)
        self.assertEqual(set(manifest.bands), set(BAND_CODES.values()))
        self.assertEqual(manifest.source_record_count, 1)


if __name__ == "__main__":
    unittest.main()
