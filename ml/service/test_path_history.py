from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import httpx

from path_history import (
    DEFAULT_PATH_TRANSFORM_VERSION,
    PostgrestPathHistoryProvider,
    UnavailablePathHistoryProvider,
    VerifiedPathHistory,
    path_history_provider_from_environment,
)


ISSUE_TIME = datetime(2026, 7, 16, 1, tzinfo=timezone.utc)


def response_row(target: str = "IO91") -> dict:
    return {
        "target_grid4": target,
        "path_success_prev1": 0.1,
        "path_success_prev2": 0.2,
        "path_success_prev3": 0.0,
        "path_success_prev24": 0.4,
        "path_prev1_available": 1,
        "path_prev2_available": 1,
        "path_prev3_available": 0,
        "path_prev24_available": 1,
        "source_watermark": "2026-07-16T00:59:00Z",
        "available_at": "2026-07-16T01:00:00Z",
        "provider": "approved-fixture",
        "transform_version": DEFAULT_PATH_TRANSFORM_VERSION,
        "quality_flags": [],
    }


class PathHistoryTests(unittest.TestCase):
    def test_postgrest_provider_uses_service_rpc_and_parses_snapshot(self):
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(
                request.url.path,
                "/rest/v1/rpc/lookup_wspr_path_lags",
            )
            self.assertEqual(request.headers["apikey"], "service-secret")
            body = json.loads(request.content)
            self.assertEqual(body["p_target_grids"], ["IO91"])
            self.assertEqual(
                body["p_transform_version"], DEFAULT_PATH_TRANSFORM_VERSION
            )
            return httpx.Response(200, json=[response_row()])

        provider = PostgrestPathHistoryProvider(
            base_url="https://feature.test",
            service_key="service-secret",
            provider="approved-fixture",
            client=httpx.Client(transport=httpx.MockTransport(handler)),
        )
        result = provider.lookup(
            issue_time=ISSUE_TIME,
            band="20m",
            origin_grid4="EM10",
            target_grid4s=["IO91"],
        )
        self.assertEqual(result["IO91"].path_success_prev2, 0.2)
        self.assertEqual(result["IO91"].path_prev3_available, 0)
        self.assertEqual(
            result["IO91"].feature_values()["path_success_prev24"], 0.4
        )

    def test_provider_rejects_unexpected_and_invalid_rows(self):
        for row in (
            response_row("FN31"),
            {**response_row(), "path_success_prev3": 0.5},
        ):
            client = httpx.Client(
                transport=httpx.MockTransport(
                    lambda request, value=row: httpx.Response(200, json=[value])
                )
            )
            provider = PostgrestPathHistoryProvider(
                base_url="https://feature.test",
                service_key="service-secret",
                provider="approved-fixture",
                client=client,
            )
            with self.assertRaises(RuntimeError):
                provider.lookup(
                    issue_time=ISSUE_TIME,
                    band="20m",
                    origin_grid4="EM10",
                    target_grid4s=["IO91"],
                )

    def test_network_failure_is_sanitized(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("private upstream detail", request=request)

        provider = PostgrestPathHistoryProvider(
            base_url="https://feature.test",
            service_key="service-secret",
            provider="approved-fixture",
            client=httpx.Client(transport=httpx.MockTransport(handler)),
        )
        with self.assertRaisesRegex(RuntimeError, "lookup failed") as raised:
            provider.lookup(
                issue_time=ISSUE_TIME,
                band="20m",
                origin_grid4="EM10",
                target_grid4s=["IO91"],
            )
        self.assertNotIn("private upstream detail", str(raised.exception))

    def test_snapshot_rejects_naive_time(self):
        row = response_row()
        row["source_watermark"] = "2026-07-16T00:59:00"
        with self.assertRaises(ValueError):
            VerifiedPathHistory(
                target_grid4=row["target_grid4"],
                path_success_prev1=row["path_success_prev1"],
                path_success_prev2=row["path_success_prev2"],
                path_success_prev3=row["path_success_prev3"],
                path_success_prev24=row["path_success_prev24"],
                path_prev1_available=row["path_prev1_available"],
                path_prev2_available=row["path_prev2_available"],
                path_prev3_available=row["path_prev3_available"],
                path_prev24_available=row["path_prev24_available"],
                source_watermark=datetime.fromisoformat(row["source_watermark"]),
                available_at=ISSUE_TIME,
                provider=row["provider"],
                transform_version=row["transform_version"],
            )

    def test_environment_configuration_is_all_or_nothing(self):
        keys = {
            "PROPULSE_FEATURE_STORE_URL": "",
            "PROPULSE_FEATURE_STORE_SERVICE_KEY": "",
            "PROPULSE_WSPR_PROVIDER": "",
        }
        with patch.dict("os.environ", keys, clear=False):
            self.assertIsInstance(
                path_history_provider_from_environment(),
                UnavailablePathHistoryProvider,
            )
        keys["PROPULSE_FEATURE_STORE_URL"] = "https://feature.test"
        with patch.dict("os.environ", keys, clear=False):
            with self.assertRaisesRegex(RuntimeError, "configured together"):
                path_history_provider_from_environment()


if __name__ == "__main__":
    unittest.main()
