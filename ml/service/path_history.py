"""Server-authoritative recent path-history providers.

Two RPC-backed providers live here, both feeding the model's
``path_success_prev{1,2,3,24}`` / ``path_prev{1,2,3,24}_available`` inputs:

* :class:`PostgrestPathHistoryProvider` — the original grid4-grain WSPR
  opportunity-rate reader (``lookup_wspr_path_lags``). Its RPC was dropped
  with the WSPR live pipeline on 2026-07-21; the class is kept intact as the
  reference contract and must not be resurrected into service.
* :class:`PostgrestPathRecencyProvider` — #297 (NowCast N2). Reads
  ``lookup_path_recency_lags``, a FIELD-grain (2-character Maidenhead)
  network-recency statistic derived from our own PSK Reporter / RBN
  ``path_hourly_stats``. It is NOT a WSPR opportunity rate and must never be
  relabelled as one; the N3 retrain is what makes the two commensurable.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

import httpx


PATH_LAGS = (1, 2, 3, 24)
DEFAULT_PATH_TRANSFORM_VERSION = "wspr-opportunity-duckdb-v1"
DEFAULT_PATH_RECENCY_TRANSFORM_VERSION = "psk-rbn-field-recency-v2"
APPROVED_PATH_TRANSFORM_VERSIONS = (
    DEFAULT_PATH_TRANSFORM_VERSION,
    DEFAULT_PATH_RECENCY_TRANSFORM_VERSION,
)
# Selects the field-recency provider through PROPULSE_PATH_HISTORY_PROVIDER.
FIELD_RECENCY_PROVIDER_KIND = "field-recency-v2"
GRID4_PATTERN = re.compile(r"^[A-R]{2}[0-9]{2}$")
FIELD_PATTERN = re.compile(r"^[A-R]{2}$")
PROVIDER_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_.:-]{0,63}$")


def field_of(grid4: str) -> str:
    """Maidenhead field (first two characters) of a validated grid4."""

    if not GRID4_PATTERN.fullmatch(grid4):
        raise RuntimeError("path-history lookup received an invalid grid")
    return grid4[:2]


def aware_datetime(value: str | datetime) -> datetime:
    parsed = (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, str)
        else value
    )
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("path-history timestamps must include a UTC offset")
    return parsed


@dataclass(frozen=True)
class VerifiedPathHistory:
    target_grid4: str
    path_success_prev1: float
    path_success_prev2: float
    path_success_prev3: float
    path_success_prev24: float
    path_prev1_available: int
    path_prev2_available: int
    path_prev3_available: int
    path_prev24_available: int
    source_watermark: datetime
    available_at: datetime
    provider: str
    transform_version: str
    quality_flags: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not GRID4_PATTERN.fullmatch(self.target_grid4):
            raise ValueError("invalid target_grid4 in path-history snapshot")
        if not PROVIDER_PATTERN.fullmatch(self.provider):
            raise ValueError("invalid path-history provider identifier")
        if not self.transform_version or len(self.transform_version) > 128:
            raise ValueError("invalid path-history transform version")
        aware_datetime(self.source_watermark)
        aware_datetime(self.available_at)
        for lag in PATH_LAGS:
            probability = float(getattr(self, f"path_success_prev{lag}"))
            available = int(getattr(self, f"path_prev{lag}_available"))
            if probability < 0 or probability > 1:
                raise ValueError("path-history success rates must be in [0, 1]")
            if available not in (0, 1):
                raise ValueError("path-history availability must be 0 or 1")
            if available == 0 and probability != 0:
                raise ValueError("unavailable path-history values must be zero")

    def feature_values(self) -> dict[str, float | int]:
        values: dict[str, float | int] = {}
        for lag in PATH_LAGS:
            values[f"path_success_prev{lag}"] = float(
                getattr(self, f"path_success_prev{lag}")
            )
            values[f"path_prev{lag}_available"] = int(
                getattr(self, f"path_prev{lag}_available")
            )
        return values


class PathHistoryProvider(Protocol):
    name: str
    transform_version: str

    def lookup(
        self,
        *,
        issue_time: datetime,
        band: str,
        origin_grid4: str,
        target_grid4s: list[str],
    ) -> dict[str, VerifiedPathHistory]: ...


class UnavailablePathHistoryProvider:
    name = "unavailable"
    # Not DEFAULT_PATH_TRANSFORM_VERSION: that names a real, approved transform
    # for the (currently dead) RPC-backed provider. Advertising it here would
    # claim a transform this no-op provider never applies.
    transform_version = "unavailable"

    def lookup(
        self,
        *,
        issue_time: datetime,
        band: str,
        origin_grid4: str,
        target_grid4s: list[str],
    ) -> dict[str, VerifiedPathHistory]:
        return {}


class PostgrestPathHistoryProvider:
    """Call the service-role-only batched path-history RPC."""

    def __init__(
        self,
        *,
        base_url: str,
        service_key: str,
        provider: str,
        transform_version: str = DEFAULT_PATH_TRANSFORM_VERSION,
        timeout_seconds: float = 5.0,
        client: httpx.Client | None = None,
    ) -> None:
        if not base_url.strip() or not service_key.strip():
            raise RuntimeError("feature-store URL and service key are required")
        if not PROVIDER_PATTERN.fullmatch(provider):
            raise RuntimeError("approved WSPR provider identifier is invalid")
        if not transform_version or len(transform_version) > 128:
            raise RuntimeError("path transform version is invalid")
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.name = provider
        self.transform_version = transform_version
        self.client = client or httpx.Client(timeout=timeout_seconds)

    def lookup(
        self,
        *,
        issue_time: datetime,
        band: str,
        origin_grid4: str,
        target_grid4s: list[str],
    ) -> dict[str, VerifiedPathHistory]:
        if not target_grid4s or len(target_grid4s) > 4096:
            raise RuntimeError("path-history lookup requires 1 to 4096 targets")
        try:
            response = self.client.post(
                f"{self.base_url}/rest/v1/rpc/lookup_wspr_path_lags",
                headers={
                    "apikey": self.service_key,
                    "Authorization": f"Bearer {self.service_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "p_issue_time": issue_time.isoformat(),
                    "p_band": band,
                    "p_origin_grid4": origin_grid4,
                    "p_target_grids": target_grid4s,
                    "p_transform_version": self.transform_version,
                    "p_provider": self.name,
                },
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise RuntimeError("verified path-history lookup failed") from error
        if not isinstance(payload, list):
            raise RuntimeError("verified path-history lookup returned invalid JSON")
        snapshots: dict[str, VerifiedPathHistory] = {}
        for raw in payload:
            if not isinstance(raw, dict):
                raise RuntimeError("verified path-history row is invalid")
            snapshot = self._parse_snapshot(raw)
            if snapshot.target_grid4 in snapshots:
                raise RuntimeError("verified path-history lookup returned duplicate targets")
            snapshots[snapshot.target_grid4] = snapshot
        unexpected = set(snapshots).difference(target_grid4s)
        if unexpected:
            raise RuntimeError("verified path-history lookup returned unexpected targets")
        return snapshots

    @staticmethod
    def _parse_snapshot(raw: dict[str, Any]) -> VerifiedPathHistory:
        try:
            return VerifiedPathHistory(
                target_grid4=str(raw["target_grid4"]),
                path_success_prev1=float(raw["path_success_prev1"]),
                path_success_prev2=float(raw["path_success_prev2"]),
                path_success_prev3=float(raw["path_success_prev3"]),
                path_success_prev24=float(raw["path_success_prev24"]),
                path_prev1_available=int(raw["path_prev1_available"]),
                path_prev2_available=int(raw["path_prev2_available"]),
                path_prev3_available=int(raw["path_prev3_available"]),
                path_prev24_available=int(raw["path_prev24_available"]),
                source_watermark=aware_datetime(raw["source_watermark"]),
                available_at=aware_datetime(raw["available_at"]),
                provider=str(raw["provider"]),
                transform_version=str(raw["transform_version"]),
                quality_flags=tuple(map(str, raw.get("quality_flags") or ())),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError("verified path-history row failed validation") from error


class PostgrestPathRecencyProvider:
    """Call the service-role-only field-grain path-recency RPC (#297).

    The store behind ``lookup_path_recency_lags`` is keyed by 2-character
    Maidenhead FIELD, not grid4: at grid4 grain our PSK Reporter / RBN
    aggregate holds ~1.06 spots per cell-hour, too sparse to be a feature.
    Callers still speak grid4, so this provider collapses the request to the
    distinct origin/target fields and fans the answer back out, keying the
    returned snapshots by the caller's grid4 exactly like the WSPR provider
    did. Every grid4 inside one field therefore shares that field's values.

    The values are a network-recency statistic, never a WSPR opportunity
    rate. Causality (a lag counts as available only if its row was readable
    at issue time) is enforced inside the RPC, matching the watermark
    discipline of the dropped WSPR contract.
    """

    def __init__(
        self,
        *,
        base_url: str,
        service_key: str,
        provider: str,
        transform_version: str = DEFAULT_PATH_RECENCY_TRANSFORM_VERSION,
        timeout_seconds: float = 5.0,
        client: httpx.Client | None = None,
    ) -> None:
        if not base_url.strip() or not service_key.strip():
            raise RuntimeError("feature-store URL and service key are required")
        if not PROVIDER_PATTERN.fullmatch(provider):
            raise RuntimeError("approved path provider identifier is invalid")
        if not transform_version or len(transform_version) > 128:
            raise RuntimeError("path transform version is invalid")
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.name = provider
        self.transform_version = transform_version
        self.client = client or httpx.Client(timeout=timeout_seconds)

    def lookup(
        self,
        *,
        issue_time: datetime,
        band: str,
        origin_grid4: str,
        target_grid4s: list[str],
    ) -> dict[str, VerifiedPathHistory]:
        if not target_grid4s or len(target_grid4s) > 4096:
            raise RuntimeError("path-history lookup requires 1 to 4096 targets")
        origin_field = field_of(origin_grid4)
        target_fields: list[str] = []
        seen: set[str] = set()
        for grid4 in target_grid4s:
            field = field_of(grid4)
            if field not in seen:
                seen.add(field)
                target_fields.append(field)
        try:
            response = self.client.post(
                f"{self.base_url}/rest/v1/rpc/lookup_path_recency_lags",
                headers={
                    "apikey": self.service_key,
                    "Authorization": f"Bearer {self.service_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "p_issue_time": issue_time.isoformat(),
                    "p_band": band,
                    "p_origin_field": origin_field,
                    "p_target_fields": target_fields,
                    "p_transform_version": self.transform_version,
                    "p_provider": self.name,
                },
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise RuntimeError("verified path-history lookup failed") from error
        if not isinstance(payload, list):
            raise RuntimeError("verified path-history lookup returned invalid JSON")
        by_field: dict[str, dict[str, Any]] = {}
        for raw in payload:
            if not isinstance(raw, dict):
                raise RuntimeError("verified path-history row is invalid")
            field, values = self._parse_field_row(raw)
            if field in by_field:
                raise RuntimeError(
                    "verified path-history lookup returned duplicate targets"
                )
            by_field[field] = values
        if set(by_field).difference(target_fields):
            raise RuntimeError(
                "verified path-history lookup returned unexpected targets"
            )
        if set(target_fields).difference(by_field):
            raise RuntimeError(
                "verified path-history lookup omitted requested targets"
            )
        snapshots: dict[str, VerifiedPathHistory] = {}
        for grid4 in target_grid4s:
            values = by_field[field_of(grid4)]
            try:
                snapshots[grid4] = VerifiedPathHistory(target_grid4=grid4, **values)
            except (TypeError, ValueError) as error:
                raise RuntimeError(
                    "verified path-history row failed validation"
                ) from error
        return snapshots

    @staticmethod
    def _parse_field_row(raw: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        try:
            field = str(raw["target_field"])
            if not FIELD_PATTERN.fullmatch(field):
                raise ValueError("invalid target_field in path-history snapshot")
            values: dict[str, Any] = {
                "source_watermark": aware_datetime(raw["source_watermark"]),
                "available_at": aware_datetime(raw["available_at"]),
                "provider": str(raw["provider"]),
                "transform_version": str(raw["transform_version"]),
                "quality_flags": tuple(map(str, raw.get("quality_flags") or ())),
            }
            for lag in PATH_LAGS:
                values[f"path_success_prev{lag}"] = float(
                    raw[f"path_success_prev{lag}"]
                )
                values[f"path_prev{lag}_available"] = int(
                    raw[f"path_prev{lag}_available"]
                )
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError("verified path-history row failed validation") from error
        return field, values


def configured_path_provider_identity() -> str:
    """Approved provider identity for the feature-store trio.

    PROPULSE_WSPR_PROVIDER is the legacy name and still works; the neutral
    PROPULSE_PATH_PROVIDER wins when both are set.
    """

    return (
        os.environ.get("PROPULSE_PATH_PROVIDER", "").strip()
        or os.environ.get("PROPULSE_WSPR_PROVIDER", "").strip()
    )


def path_history_provider_from_environment() -> PathHistoryProvider:
    override = os.environ.get("PROPULSE_PATH_HISTORY_PROVIDER", "").strip()
    if override == "unavailable":
        return UnavailablePathHistoryProvider()
    if override and override != FIELD_RECENCY_PROVIDER_KIND:
        raise RuntimeError(
            "PROPULSE_PATH_HISTORY_PROVIDER must be 'unavailable' or "
            f"'{FIELD_RECENCY_PROVIDER_KIND}' when set"
        )
    values = {
        "base_url": os.environ.get("PROPULSE_FEATURE_STORE_URL", "").strip(),
        "service_key": os.environ.get(
            "PROPULSE_FEATURE_STORE_SERVICE_KEY", ""
        ).strip(),
        "provider": configured_path_provider_identity(),
    }
    configured = [bool(value) for value in values.values()]
    if not any(configured):
        return UnavailablePathHistoryProvider()
    if not all(configured):
        raise RuntimeError(
            "feature-store URL, service key, and approved provider must be configured together"
        )
    if override == FIELD_RECENCY_PROVIDER_KIND:
        return PostgrestPathRecencyProvider(
            **values,
            transform_version=os.environ.get(
                "PROPULSE_PATH_TRANSFORM_VERSION",
                DEFAULT_PATH_RECENCY_TRANSFORM_VERSION,
            ).strip(),
        )
    return PostgrestPathHistoryProvider(
        **values,
        transform_version=os.environ.get(
            "PROPULSE_PATH_TRANSFORM_VERSION",
            DEFAULT_PATH_TRANSFORM_VERSION,
        ).strip(),
    )
