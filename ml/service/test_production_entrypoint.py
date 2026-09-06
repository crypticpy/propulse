from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from production_entrypoint import (
    bounded_integer,
    prepare_bundle_environment,
    uvicorn_arguments,
    validate_manifest_path_history_contract,
    validate_production_environment,
)


VALID_ENVIRONMENT = {
    "PROPULSE_SERVICE_TOKEN": "s" * 32,
    "PROPULSE_ALLOWED_ORIGINS": "https://app.propulse.test",
    "PROPULSE_INFERENCE_MODE": "shadow",
    "PROPULSE_FEATURE_STORE_URL": "https://project.supabase.co/rest/v1/rpc",
    "PROPULSE_FEATURE_STORE_SERVICE_KEY": "f" * 32,
    "PROPULSE_WSPR_PROVIDER": "wspr-live-v1",
    "PROPULSE_PATH_TRANSFORM_VERSION": "wspr-opportunity-duckdb-v1",
    "PROPULSE_WEATHER_STORE_URL": "https://project.supabase.co/rest/v1",
    "PROPULSE_WEATHER_STORE_SERVICE_KEY": "w" * 32,
}

class ProductionEntrypointTests(unittest.TestCase):
    def test_uses_railway_port_and_one_worker_by_default(self):
        with patch.dict(os.environ, {"PORT": "4123"}, clear=True):
            arguments = uvicorn_arguments()
        self.assertEqual(arguments[arguments.index("--port") + 1], "4123")
        self.assertEqual(arguments[arguments.index("--workers") + 1], "1")

    def test_allows_bounded_worker_override(self):
        with patch.dict(
            os.environ,
            {"PORT": "8000", "PROPULSE_UVICORN_WORKERS": "4"},
            clear=True,
        ):
            arguments = uvicorn_arguments()
        self.assertEqual(arguments[arguments.index("--workers") + 1], "4")

    def test_rejects_unbounded_or_non_numeric_values(self):
        with patch.dict(
            os.environ,
            {"PROPULSE_UVICORN_WORKERS": "5"},
            clear=True,
        ):
            with self.assertRaisesRegex(RuntimeError, "between 1 and 4"):
                uvicorn_arguments()
        with patch.dict(os.environ, {"PORT": "invalid"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "must be an integer"):
                uvicorn_arguments()
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(bounded_integer("EXAMPLE", 2, 1, 3), 2)

    def test_accepts_exact_private_production_configuration(self):
        with patch.dict(os.environ, VALID_ENVIRONMENT, clear=True):
            validate_production_environment()
            self.assertEqual(os.environ["PROPULSE_WEATHER_CACHE_SECONDS"], "60")

    def test_rejects_missing_auth_wildcard_origin_and_wrong_transform(self):
        for updates, message in (
            ({"PROPULSE_SERVICE_TOKEN": ""}, "SERVICE_TOKEN"),
            ({"PROPULSE_ALLOWED_ORIGINS": "https://*.example.com"}, "exact HTTPS"),
            ({"PROPULSE_PATH_TRANSFORM_VERSION": "unapproved"}, "not approved"),
            ({"PROPULSE_XGBOOST_THREADS": "2"}, "must equal one"),
        ):
            environment = {**VALID_ENVIRONMENT, **updates}
            with self.subTest(updates=updates):
                with patch.dict(os.environ, environment, clear=True):
                    with self.assertRaisesRegex(RuntimeError, message):
                        validate_production_environment()

    def test_feature_store_trio_is_optional_when_entirely_unset(self):
        environment = {
            **VALID_ENVIRONMENT,
            "PROPULSE_FEATURE_STORE_URL": "",
            "PROPULSE_FEATURE_STORE_SERVICE_KEY": "",
            "PROPULSE_WSPR_PROVIDER": "",
            "PROPULSE_PATH_TRANSFORM_VERSION": "",
        }
        with patch.dict(os.environ, environment, clear=True):
            validate_production_environment()

    def test_partial_feature_store_trio_fails_closed(self):
        for missing in (
            "PROPULSE_FEATURE_STORE_URL",
            "PROPULSE_FEATURE_STORE_SERVICE_KEY",
            "PROPULSE_WSPR_PROVIDER",
        ):
            environment = {**VALID_ENVIRONMENT, missing: ""}
            with self.subTest(missing=missing):
                with patch.dict(os.environ, environment, clear=True):
                    with self.assertRaisesRegex(RuntimeError, "configured together"):
                        validate_production_environment()

    def test_explicit_unavailable_override_skips_trio_and_transform_checks(self):
        environment = {
            **VALID_ENVIRONMENT,
            "PROPULSE_FEATURE_STORE_URL": "",
            "PROPULSE_FEATURE_STORE_SERVICE_KEY": "",
            "PROPULSE_WSPR_PROVIDER": "",
            "PROPULSE_PATH_TRANSFORM_VERSION": "",
            "PROPULSE_PATH_HISTORY_PROVIDER": "unavailable",
        }
        with patch.dict(os.environ, environment, clear=True):
            validate_production_environment()

    def test_explicit_unavailable_override_wins_even_with_full_trio(self):
        environment = {
            **VALID_ENVIRONMENT,
            "PROPULSE_PATH_TRANSFORM_VERSION": "unapproved",
            "PROPULSE_PATH_HISTORY_PROVIDER": "unavailable",
        }
        with patch.dict(os.environ, environment, clear=True):
            validate_production_environment()

    def test_unrecognized_override_value_is_rejected(self):
        environment = {
            **VALID_ENVIRONMENT,
            "PROPULSE_PATH_HISTORY_PROVIDER": "sometimes",
        }
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaisesRegex(RuntimeError, "unavailable"):
                validate_production_environment()

    def test_rejects_untrusted_data_urls(self):
        environment = {
            **VALID_ENVIRONMENT,
            "PROPULSE_WEATHER_STORE_URL": "http://project.supabase.co/rest/v1",
        }
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaisesRegex(RuntimeError, "absolute HTTPS"):
                validate_production_environment()

    def test_passes_bounded_part_count_to_bundle_downloader(self):
        manifest = Path("/tmp/fixture-serving-manifest.json")
        with tempfile.TemporaryDirectory() as temporary:
            environment = {
                "PROPULSE_MODEL_BUNDLE_URL": "https://storage.example/bundle.tar.zst",
                "PROPULSE_MODEL_BUNDLE_SHA256": "a" * 64,
                "PROPULSE_MODEL_BUNDLE_AUTH_TOKEN": "private-token",
                "PROPULSE_MODEL_BUNDLE_PART_COUNT": "2",
                "PROPULSE_MODEL_CACHE_DIR": temporary,
            }
            with (
                patch.dict(os.environ, environment, clear=True),
                patch(
                    "production_entrypoint.prepare_model_bundle",
                    return_value=manifest,
                ) as prepare,
            ):
                result = prepare_bundle_environment()
        self.assertEqual(result, manifest)
        self.assertEqual(prepare.call_args.kwargs["part_count"], 2)

    def test_rejects_unbounded_bundle_part_count(self):
        environment = {
            "PROPULSE_MODEL_BUNDLE_URL": "https://storage.example/bundle.tar.zst",
            "PROPULSE_MODEL_BUNDLE_SHA256": "a" * 64,
            "PROPULSE_MODEL_BUNDLE_PART_COUNT": "65",
        }
        with patch.dict(os.environ, environment, clear=True):
            with self.assertRaisesRegex(RuntimeError, "between 1 and 64"):
                prepare_bundle_environment()


V2_FIELD_RECENCY_ENVIRONMENT = {
    "PROPULSE_FEATURE_STORE_URL": "https://feature.test",
    "PROPULSE_FEATURE_STORE_SERVICE_KEY": "f" * 32,
    "PROPULSE_PATH_PROVIDER": "approved-fixture",
    "PROPULSE_PATH_HISTORY_PROVIDER": "field-recency-v2",
    "PROPULSE_PATH_TRANSFORM_VERSION": "psk-rbn-field-recency-v2",
    "PROPULSE_PATH_RECENCY_STATISTIC": "quantile",
}


def write_manifest(
    directory: Path,
    *,
    core_feature_contract: str,
    path_history_contract: dict | None = None,
) -> Path:
    manifest: dict = {"core_feature_contract": core_feature_contract}
    if path_history_contract is not None:
        manifest["path_history_contract"] = path_history_contract
    manifest_path = directory / "serving_manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path


class ManifestPathHistoryContractTests(unittest.TestCase):
    """#306 "A7 contract assertion" checked by the production entrypoint
    before uvicorn execs, mirroring app.py's create_app() startup check."""

    def test_v1_manifest_is_unconstrained_regardless_of_environment(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest_path = write_manifest(
                Path(temporary), core_feature_contract="archive-v4-features-v1"
            )
            with patch.dict(os.environ, {}, clear=True):
                validate_manifest_path_history_contract(manifest_path)

    def test_v2_manifest_allows_the_unavailable_provider(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest_path = write_manifest(
                Path(temporary),
                core_feature_contract="archive-v4-features-v2",
                path_history_contract={
                    "provider_kind": "field-recency-v2",
                    "transform_version": "psk-rbn-field-recency-v2",
                    "statistic": "quantile",
                },
            )
            with patch.dict(
                os.environ,
                {"PROPULSE_PATH_HISTORY_PROVIDER": "unavailable"},
                clear=True,
            ):
                validate_manifest_path_history_contract(manifest_path)

    def test_v2_manifest_allows_a_matching_field_recency_provider(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest_path = write_manifest(
                Path(temporary),
                core_feature_contract="archive-v4-features-v2",
                path_history_contract={
                    "provider_kind": "field-recency-v2",
                    "transform_version": "psk-rbn-field-recency-v2",
                    "statistic": "quantile",
                },
            )
            with patch.dict(
                os.environ, V2_FIELD_RECENCY_ENVIRONMENT, clear=True
            ):
                validate_manifest_path_history_contract(manifest_path)

    def test_v2_manifest_rejects_a_mismatched_transform_version(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest_path = write_manifest(
                Path(temporary),
                core_feature_contract="archive-v4-features-v2",
                path_history_contract={
                    "provider_kind": "field-recency-v2",
                    "transform_version": "some-other-transform",
                    "statistic": "quantile",
                },
            )
            with patch.dict(
                os.environ, V2_FIELD_RECENCY_ENVIRONMENT, clear=True
            ):
                with self.assertRaisesRegex(RuntimeError, "transform_version"):
                    validate_manifest_path_history_contract(manifest_path)

    def test_v2_manifest_rejects_a_mismatched_statistic(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest_path = write_manifest(
                Path(temporary),
                core_feature_contract="archive-v4-features-v2",
                path_history_contract={
                    "provider_kind": "field-recency-v2",
                    "transform_version": "psk-rbn-field-recency-v2",
                    "statistic": "rate",
                },
            )
            with patch.dict(
                os.environ, V2_FIELD_RECENCY_ENVIRONMENT, clear=True
            ):
                with self.assertRaisesRegex(RuntimeError, "statistic"):
                    validate_manifest_path_history_contract(manifest_path)

    def test_v2_manifest_rejects_the_legacy_wspr_provider(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest_path = write_manifest(
                Path(temporary),
                core_feature_contract="archive-v4-features-v2",
                path_history_contract={
                    "provider_kind": "field-recency-v2",
                    "transform_version": "psk-rbn-field-recency-v2",
                    "statistic": "quantile",
                },
            )
            environment = {
                "PROPULSE_FEATURE_STORE_URL": "https://feature.test",
                "PROPULSE_FEATURE_STORE_SERVICE_KEY": "f" * 32,
                "PROPULSE_WSPR_PROVIDER": "approved-fixture",
                "PROPULSE_PATH_TRANSFORM_VERSION": "wspr-opportunity-duckdb-v1",
            }
            with patch.dict(os.environ, environment, clear=True):
                with self.assertRaisesRegex(RuntimeError, "field-recency-v2"):
                    validate_manifest_path_history_contract(manifest_path)


if __name__ == "__main__":
    unittest.main()
