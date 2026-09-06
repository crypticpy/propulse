#!/usr/bin/env python3
"""Fail-closed Railway entrypoint for the Propulse inference service."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from model_bundle import prepare_model_bundle, verify_bundle_directory
from path_history import (
    DEFAULT_PATH_RECENCY_TRANSFORM_VERSION,
    DEFAULT_PATH_TRANSFORM_VERSION,
    FIELD_RECENCY_PROVIDER_KIND,
    configured_path_provider_identity,
)


def bounded_integer(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, str(default))
    try:
        value = int(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer") from error
    if value < minimum or value > maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}")
    return value


def required_environment(name: str, minimum_length: int = 1) -> str:
    value = os.environ.get(name, "").strip()
    if len(value) < minimum_length:
        raise RuntimeError(f"{name} is required")
    return value


def require_https_url(name: str) -> str:
    value = required_environment(name)
    parsed = urlparse(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise RuntimeError(f"{name} must be an absolute HTTPS URL")
    return value


FEATURE_STORE_ENVIRONMENT_NAMES = (
    "PROPULSE_FEATURE_STORE_URL",
    "PROPULSE_FEATURE_STORE_SERVICE_KEY",
    # Provider identity: PROPULSE_PATH_PROVIDER, or the legacy
    # PROPULSE_WSPR_PROVIDER name, resolved by
    # path_history.configured_path_provider_identity().
    "PROPULSE_PATH_PROVIDER",
)


def validate_path_history_environment() -> None:
    """Validate the optional feature-store trio as an all-or-none group.

    An explicit PROPULSE_PATH_HISTORY_PROVIDER=unavailable override forces
    the unavailable provider (and skips the trio/transform checks below)
    even when the trio is still present, so the dead provider can be turned
    off on Railway without deleting variables first. That override is the
    production steady state and #297 does not change it.

    PROPULSE_PATH_HISTORY_PROVIDER=field-recency-v2 selects the #297
    field-grain recency provider instead; it requires the full trio and the
    matching approved transform version.
    """
    override = os.environ.get("PROPULSE_PATH_HISTORY_PROVIDER", "").strip()
    if override and override not in {"unavailable", FIELD_RECENCY_PROVIDER_KIND}:
        raise RuntimeError(
            "PROPULSE_PATH_HISTORY_PROVIDER must be 'unavailable' or "
            f"'{FIELD_RECENCY_PROVIDER_KIND}' when set"
        )
    if override == "unavailable":
        return
    configured = [
        bool(os.environ.get("PROPULSE_FEATURE_STORE_URL", "").strip()),
        bool(os.environ.get("PROPULSE_FEATURE_STORE_SERVICE_KEY", "").strip()),
        bool(configured_path_provider_identity()),
    ]
    if not any(configured) and not override:
        return
    if not all(configured):
        raise RuntimeError(
            "PROPULSE_FEATURE_STORE_URL, PROPULSE_FEATURE_STORE_SERVICE_KEY, and "
            "PROPULSE_PATH_PROVIDER (or the legacy PROPULSE_WSPR_PROVIDER) "
            "must be configured together"
        )
    require_https_url("PROPULSE_FEATURE_STORE_URL")
    required_environment("PROPULSE_FEATURE_STORE_SERVICE_KEY", 32)
    transform = required_environment("PROPULSE_PATH_TRANSFORM_VERSION")
    approved = (
        DEFAULT_PATH_RECENCY_TRANSFORM_VERSION
        if override == FIELD_RECENCY_PROVIDER_KIND
        else DEFAULT_PATH_TRANSFORM_VERSION
    )
    if transform != approved:
        raise RuntimeError("PROPULSE_PATH_TRANSFORM_VERSION is not approved")


def validate_production_environment() -> None:
    required_environment("PROPULSE_SERVICE_TOKEN", 32)
    origins = required_environment("PROPULSE_ALLOWED_ORIGINS").split(",")
    for origin in origins:
        parsed = urlparse(origin.strip())
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.params
            or parsed.query
            or parsed.fragment
            or "*" in origin
        ):
            raise RuntimeError(
                "PROPULSE_ALLOWED_ORIGINS must contain exact HTTPS origins"
            )
    mode = required_environment("PROPULSE_INFERENCE_MODE")
    if mode not in {"shadow", "active"}:
        raise RuntimeError(
            "production PROPULSE_INFERENCE_MODE must be shadow or active"
        )
    validate_path_history_environment()
    require_https_url("PROPULSE_WEATHER_STORE_URL")
    required_environment("PROPULSE_WEATHER_STORE_SERVICE_KEY", 32)
    weather_cache = bounded_integer(
        "PROPULSE_WEATHER_CACHE_SECONDS",
        60,
        5,
        300,
    )
    os.environ["PROPULSE_WEATHER_CACHE_SECONDS"] = str(weather_cache)
    if os.environ.get("PROPULSE_XGBOOST_THREADS", "1") != "1":
        raise RuntimeError("production XGBoost prediction threads must equal one")
    bounded_integer("PROPULSE_UVICORN_WORKERS", 1, 1, 4)


def prepare_bundle_environment() -> Path:
    configured = os.environ.get("PROPULSE_MODEL_BUNDLE", "").strip()
    if configured:
        manifest_path = Path(configured).resolve()
        verify_bundle_directory(manifest_path)
        return manifest_path
    url = os.environ.get("PROPULSE_MODEL_BUNDLE_URL", "").strip()
    expected_sha = os.environ.get("PROPULSE_MODEL_BUNDLE_SHA256", "").strip()
    if not url or not expected_sha:
        raise RuntimeError(
            "PROPULSE_MODEL_BUNDLE or the URL/SHA-256 pair is required"
        )
    cache_root = Path(
        os.environ.get(
            "PROPULSE_MODEL_CACHE_DIR",
            "/tmp/propulse-model-bundles",
        )
    ).resolve()
    manifest_path = prepare_model_bundle(
        url=url,
        expected_sha256=expected_sha,
        bearer_token=os.environ.get("PROPULSE_MODEL_BUNDLE_AUTH_TOKEN", ""),
        cache_root=cache_root,
        part_count=bounded_integer(
            "PROPULSE_MODEL_BUNDLE_PART_COUNT",
            1,
            1,
            64,
        ),
        max_bytes=bounded_integer(
            "PROPULSE_MODEL_BUNDLE_MAX_BYTES",
            512 * 1024 * 1024,
            1,
            1024 * 1024 * 1024,
        ),
    )
    os.environ["PROPULSE_MODEL_BUNDLE"] = str(manifest_path)
    return manifest_path


def uvicorn_arguments() -> list[str]:
    port = bounded_integer("PORT", 8000, 1, 65535)
    workers = bounded_integer("PROPULSE_UVICORN_WORKERS", 1, 1, 4)
    return [
        "uvicorn",
        "app:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(port),
        "--workers",
        str(workers),
        "--no-access-log",
    ]


def main() -> None:
    validate_production_environment()
    manifest_path = prepare_bundle_environment()
    os.environ["PROPULSE_MODEL_BUNDLE"] = str(manifest_path)
    os.execvp("uvicorn", uvicorn_arguments())


if __name__ == "__main__":
    main()
