from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

import httpx

from path_history import (
    ARCHIVE_V4_FEATURES_V2,
    DEFAULT_PATH_RECENCY_STATISTIC,
    DEFAULT_PATH_RECENCY_TRANSFORM_VERSION,
    DEFAULT_PATH_TRANSFORM_VERSION,
    PostgrestPathHistoryProvider,
    PostgrestPathRecencyProvider,
    UnavailablePathHistoryProvider,
    VerifiedPathHistory,
    configured_path_statistic,
    path_history_contract_mismatch,
    path_history_provider_from_environment,
)

FULL_TRIO_ENVIRONMENT = {
    "PROPULSE_FEATURE_STORE_URL": "https://feature.test",
    "PROPULSE_FEATURE_STORE_SERVICE_KEY": "service-secret",
    "PROPULSE_WSPR_PROVIDER": "approved-fixture",
}


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


def recency_row(target_field: str = "IO", **overrides) -> dict:
    """One lookup_path_recency_lags row: field-keyed, not grid4-keyed."""

    row = {
        "target_field": target_field,
        "path_success_prev1": 0.02,
        "path_success_prev2": 0.0,
        "path_success_prev3": 0.05,
        "path_success_prev24": 0.01,
        "path_prev1_available": 1,
        # Lag 2 was not readable at issue time -> flag 0 and value 0.
        "path_prev2_available": 0,
        "path_prev3_available": 1,
        "path_prev24_available": 1,
        "source_watermark": "2026-07-16T01:00:00Z",
        "available_at": "2026-07-16T01:00:00Z",
        "provider": "approved-fixture",
        "transform_version": DEFAULT_PATH_RECENCY_TRANSFORM_VERSION,
        "quality_flags": [],
    }
    row.update(overrides)
    return row


def recency_provider(handler) -> PostgrestPathRecencyProvider:
    return PostgrestPathRecencyProvider(
        base_url="https://feature.test",
        service_key="service-secret",
        provider="approved-fixture",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


class PathRecencyProviderTests(unittest.TestCase):
    """#297: field-grain recency provider (never a WSPR opportunity rate)."""

    def test_collapses_grid4_targets_to_fields_and_fans_results_back(self):
        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(
                request.url.path,
                "/rest/v1/rpc/lookup_path_recency_lags",
            )
            seen.update(json.loads(request.content))
            return httpx.Response(
                200,
                json=[recency_row("IO"), recency_row("FN", path_success_prev1=0.5)],
            )

        result = recency_provider(handler).lookup(
            issue_time=ISSUE_TIME,
            band="20m",
            origin_grid4="EM10",
            target_grid4s=["IO91", "IO83", "FN31"],
        )

        self.assertEqual(seen["p_origin_field"], "EM")
        self.assertEqual(seen["p_target_fields"], ["IO", "FN"])
        self.assertEqual(
            seen["p_transform_version"], DEFAULT_PATH_RECENCY_TRANSFORM_VERSION
        )
        self.assertEqual(set(result), {"IO91", "IO83", "FN31"})
        # Every grid4 inside a field shares that field's row.
        self.assertEqual(result["IO91"].path_success_prev1, 0.02)
        self.assertEqual(result["IO83"].path_success_prev1, 0.02)
        self.assertEqual(result["FN31"].path_success_prev1, 0.5)
        self.assertEqual(result["IO83"].target_grid4, "IO83")

    def test_per_lag_availability_flags_survive_the_mapping(self):
        result = recency_provider(
            lambda request: httpx.Response(200, json=[recency_row()])
        ).lookup(
            issue_time=ISSUE_TIME,
            band="20m",
            origin_grid4="EM10",
            target_grid4s=["IO91"],
        )
        values = result["IO91"].feature_values()
        self.assertEqual(values["path_prev1_available"], 1)
        self.assertEqual(values["path_prev2_available"], 0)
        self.assertEqual(values["path_success_prev2"], 0.0)
        self.assertEqual(values["path_success_prev3"], 0.05)

    def test_rejects_omitted_unexpected_and_acausal_rows(self):
        cases = (
            # Requested IO and FN, got only IO.
            ([recency_row("IO")], ["IO91", "FN31"]),
            # Never requested FN.
            ([recency_row("IO"), recency_row("FN")], ["IO91"]),
            # Duplicate field.
            ([recency_row("IO"), recency_row("IO")], ["IO91"]),
            # A lag flagged unavailable may not carry a value.
            (
                [recency_row("IO", path_prev2_available=0, path_success_prev2=0.3)],
                ["IO91"],
            ),
            # Naive timestamps are not accepted.
            ([recency_row("IO", available_at="2026-07-16T01:00:00")], ["IO91"]),
            # A grid4-shaped key is not a field.
            ([recency_row("IO91")], ["IO91"]),
        )
        for payload, targets in cases:
            with self.subTest(payload=payload, targets=targets):
                provider = recency_provider(
                    lambda request, body=payload: httpx.Response(200, json=body)
                )
                with self.assertRaises(RuntimeError):
                    provider.lookup(
                        issue_time=ISSUE_TIME,
                        band="20m",
                        origin_grid4="EM10",
                        target_grid4s=targets,
                    )

    def test_network_failure_is_sanitized(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("private upstream detail", request=request)

        with self.assertRaisesRegex(RuntimeError, "lookup failed") as raised:
            recency_provider(handler).lookup(
                issue_time=ISSUE_TIME,
                band="20m",
                origin_grid4="EM10",
                target_grid4s=["IO91"],
            )
        self.assertNotIn("private upstream detail", str(raised.exception))

    def test_override_selects_the_recency_provider_without_touching_unavailable(self):
        with patch.dict(
            "os.environ",
            {
                **FULL_TRIO_ENVIRONMENT,
                "PROPULSE_PATH_HISTORY_PROVIDER": "field-recency-v2",
            },
            clear=False,
        ):
            provider = path_history_provider_from_environment()
        self.assertIsInstance(provider, PostgrestPathRecencyProvider)
        self.assertEqual(provider.name, "approved-fixture")
        self.assertEqual(
            provider.transform_version, DEFAULT_PATH_RECENCY_TRANSFORM_VERSION
        )

        # The steady state on Railway is unchanged by #297.
        with patch.dict(
            "os.environ",
            {
                **FULL_TRIO_ENVIRONMENT,
                "PROPULSE_PATH_HISTORY_PROVIDER": "unavailable",
            },
            clear=False,
        ):
            self.assertIsInstance(
                path_history_provider_from_environment(),
                UnavailablePathHistoryProvider,
            )

    def test_explicit_recency_selection_without_the_trio_fails_closed(self):
        # An explicit selection must never degrade silently to physics.
        blank = {name: "" for name in FULL_TRIO_ENVIRONMENT}
        with patch.dict(
            "os.environ",
            {
                **blank,
                "PROPULSE_PATH_PROVIDER": "",
                "PROPULSE_PATH_HISTORY_PROVIDER": "field-recency-v2",
            },
            clear=False,
        ):
            with self.assertRaises(RuntimeError):
                path_history_provider_from_environment()

    def test_neutral_provider_variable_wins_over_the_legacy_wspr_name(self):
        with patch.dict(
            "os.environ",
            {
                **FULL_TRIO_ENVIRONMENT,
                "PROPULSE_PATH_PROVIDER": "collector-recency",
                "PROPULSE_PATH_HISTORY_PROVIDER": "field-recency-v2",
            },
            clear=False,
        ):
            provider = path_history_provider_from_environment()
        self.assertEqual(provider.name, "collector-recency")

    def test_statistic_defaults_to_rate_and_is_sent_on_the_rpc_body(self):
        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen.update(json.loads(request.content))
            return httpx.Response(200, json=[recency_row()])

        provider = recency_provider(handler)
        self.assertEqual(provider.statistic, DEFAULT_PATH_RECENCY_STATISTIC)
        self.assertEqual(provider.statistic, "rate")
        provider.lookup(
            issue_time=ISSUE_TIME,
            band="20m",
            origin_grid4="EM10",
            target_grid4s=["IO91"],
        )
        self.assertEqual(seen["p_statistic"], "rate")

    def test_quantile_statistic_is_sent_on_the_rpc_body(self):
        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen.update(json.loads(request.content))
            return httpx.Response(200, json=[recency_row()])

        provider = PostgrestPathRecencyProvider(
            base_url="https://feature.test",
            service_key="service-secret",
            provider="approved-fixture",
            statistic="quantile",
            client=httpx.Client(transport=httpx.MockTransport(handler)),
        )
        provider.lookup(
            issue_time=ISSUE_TIME,
            band="20m",
            origin_grid4="EM10",
            target_grid4s=["IO91"],
        )
        self.assertEqual(seen["p_statistic"], "quantile")

    def test_invalid_statistic_is_rejected_at_construction(self):
        with self.assertRaisesRegex(RuntimeError, "statistic"):
            PostgrestPathRecencyProvider(
                base_url="https://feature.test",
                service_key="service-secret",
                provider="approved-fixture",
                statistic="opportunity",
            )

    def test_configured_path_statistic_reads_the_environment(self):
        with patch.dict(
            "os.environ",
            {"PROPULSE_PATH_RECENCY_STATISTIC": ""},
            clear=False,
        ):
            self.assertEqual(configured_path_statistic(), "rate")
        with patch.dict(
            "os.environ",
            {"PROPULSE_PATH_RECENCY_STATISTIC": "quantile"},
            clear=False,
        ):
            self.assertEqual(configured_path_statistic(), "quantile")

    def test_environment_selects_the_configured_statistic(self):
        with patch.dict(
            "os.environ",
            {
                **FULL_TRIO_ENVIRONMENT,
                "PROPULSE_PATH_HISTORY_PROVIDER": "field-recency-v2",
                "PROPULSE_PATH_RECENCY_STATISTIC": "quantile",
            },
            clear=False,
        ):
            provider = path_history_provider_from_environment()
        self.assertIsInstance(provider, PostgrestPathRecencyProvider)
        self.assertEqual(provider.statistic, "quantile")

    def test_environment_rejects_an_invalid_statistic(self):
        with patch.dict(
            "os.environ",
            {
                **FULL_TRIO_ENVIRONMENT,
                "PROPULSE_PATH_HISTORY_PROVIDER": "field-recency-v2",
                "PROPULSE_PATH_RECENCY_STATISTIC": "opportunity",
            },
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "statistic"):
                path_history_provider_from_environment()


class PathHistoryContractMismatchTests(unittest.TestCase):
    """#306 "A7 contract assertion" fail-closed check for service startup."""

    def matching_provider(self) -> PostgrestPathRecencyProvider:
        return PostgrestPathRecencyProvider(
            base_url="https://feature.test",
            service_key="service-secret",
            provider="approved-fixture",
            transform_version="psk-rbn-field-recency-v2",
            statistic="quantile",
        )

    def test_v1_contract_never_constrains_the_provider(self):
        self.assertIsNone(
            path_history_contract_mismatch(
                "archive-v4-features-v1",
                None,
                provider=UnavailablePathHistoryProvider(),
            )
        )
        self.assertIsNone(
            path_history_contract_mismatch(
                "archive-v4-features-v1",
                None,
                provider=self.matching_provider(),
            )
        )

    def test_v2_accepts_the_unavailable_provider(self):
        self.assertIsNone(
            path_history_contract_mismatch(
                ARCHIVE_V4_FEATURES_V2,
                None,
                provider=UnavailablePathHistoryProvider(),
            )
        )

    def test_v2_accepts_a_matching_field_recency_provider(self):
        contract = {
            "provider_kind": "field-recency-v2",
            "transform_version": "psk-rbn-field-recency-v2",
            "statistic": "quantile",
        }
        self.assertIsNone(
            path_history_contract_mismatch(
                ARCHIVE_V4_FEATURES_V2,
                contract,
                provider=self.matching_provider(),
            )
        )

    def test_v2_rejects_the_legacy_wspr_provider(self):
        legacy = PostgrestPathHistoryProvider(
            base_url="https://feature.test",
            service_key="service-secret",
            provider="approved-fixture",
        )
        mismatch = path_history_contract_mismatch(
            ARCHIVE_V4_FEATURES_V2,
            {
                "provider_kind": "field-recency-v2",
                "transform_version": "psk-rbn-field-recency-v2",
                "statistic": "quantile",
            },
            provider=legacy,
        )
        self.assertIsNotNone(mismatch)

    def test_v2_rejects_mismatched_transform_version_or_statistic(self):
        contract = {
            "provider_kind": "field-recency-v2",
            "transform_version": "psk-rbn-field-recency-v2",
            "statistic": "quantile",
        }
        for overrides in (
            {"transform_version": "some-other-transform"},
            {"statistic": "rate"},
        ):
            provider = PostgrestPathRecencyProvider(
                base_url="https://feature.test",
                service_key="service-secret",
                provider="approved-fixture",
                transform_version=overrides.get(
                    "transform_version", "psk-rbn-field-recency-v2"
                ),
                statistic=overrides.get("statistic", "quantile"),
            )
            with self.subTest(overrides=overrides):
                mismatch = path_history_contract_mismatch(
                    ARCHIVE_V4_FEATURES_V2,
                    contract,
                    provider=provider,
                )
                self.assertIsNotNone(mismatch)

    def test_v2_rejects_a_manifest_missing_or_mismatched_provider_kind(self):
        provider = self.matching_provider()
        for contract in (
            None,
            {},
            {
                "provider_kind": "wspr-live-v1",
                "transform_version": "psk-rbn-field-recency-v2",
                "statistic": "quantile",
            },
        ):
            with self.subTest(contract=contract):
                mismatch = path_history_contract_mismatch(
                    ARCHIVE_V4_FEATURES_V2,
                    contract,
                    provider=provider,
                )
                self.assertIsNotNone(mismatch)


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

    def test_full_trio_returns_postgrest_provider(self):
        with patch.dict(
            "os.environ",
            {**FULL_TRIO_ENVIRONMENT, "PROPULSE_PATH_HISTORY_PROVIDER": ""},
            clear=False,
        ):
            provider = path_history_provider_from_environment()
        self.assertIsInstance(provider, PostgrestPathHistoryProvider)
        self.assertEqual(provider.name, "approved-fixture")

    def test_explicit_unavailable_override_wins_even_with_full_trio(self):
        with patch.dict(
            "os.environ",
            {
                **FULL_TRIO_ENVIRONMENT,
                "PROPULSE_PATH_HISTORY_PROVIDER": "unavailable",
            },
            clear=False,
        ):
            provider = path_history_provider_from_environment()
        self.assertIsInstance(provider, UnavailablePathHistoryProvider)

    def test_unrecognized_override_value_is_rejected(self):
        with patch.dict(
            "os.environ",
            {
                "PROPULSE_FEATURE_STORE_URL": "",
                "PROPULSE_FEATURE_STORE_SERVICE_KEY": "",
                "PROPULSE_WSPR_PROVIDER": "",
                "PROPULSE_PATH_HISTORY_PROVIDER": "sometimes",
            },
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "unavailable"):
                path_history_provider_from_environment()


if __name__ == "__main__":
    unittest.main()
