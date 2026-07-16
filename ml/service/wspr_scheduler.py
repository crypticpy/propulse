"""Completion-manifest scheduler for the production WSPR hourly finalizer."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import hmac
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Protocol

import httpx

from wspr_finalizer import (
    HF_BANDS,
    PROVIDER_PATTERN,
    PostgrestFinalizerStore,
    finalize_hour,
)


SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def completion_signature(payload: dict[str, Any], secret: str) -> str:
    if len(secret) < 16:
        raise ValueError("completion-manifest signing secret is too short")
    unsigned = {key: value for key, value in payload.items() if key != "manifest_hmac_sha256"}
    canonical = json.dumps(unsigned, sort_keys=True, separators=(",", ":"))
    return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


def aware_utc(value: str | datetime, label: str) -> datetime:
    parsed = (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, str)
        else value
    )
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{label} must include a UTC offset")
    return parsed.astimezone(timezone.utc)


@dataclass(frozen=True)
class CompletionManifest:
    provider: str
    target_hour: datetime
    source_watermark: datetime
    available_at: datetime
    source_checkpoint_sha256: str
    source_record_count: int
    bands: tuple[str, ...]
    quality_flags: tuple[str, ...]

    @classmethod
    def from_json(
        cls, payload: dict[str, Any], *, signing_secret: str
    ) -> "CompletionManifest":
        allowed = {
            "schema_version",
            "provider",
            "target_hour",
            "source_watermark",
            "available_at",
            "source_complete",
            "source_checkpoint_sha256",
            "source_record_count",
            "bands",
            "quality_flags",
            "manifest_hmac_sha256",
        }
        if set(payload) != allowed:
            raise ValueError("completion manifest fields do not match version 1")
        if payload["schema_version"] != 1 or payload["source_complete"] is not True:
            raise ValueError("completion manifest must explicitly confirm version 1 completeness")
        signature = str(payload["manifest_hmac_sha256"])
        expected_signature = completion_signature(payload, signing_secret)
        if not SHA256_PATTERN.fullmatch(signature) or not hmac.compare_digest(
            signature, expected_signature
        ):
            raise ValueError("completion manifest signature is invalid")
        provider = str(payload["provider"])
        if not PROVIDER_PATTERN.fullmatch(provider):
            raise ValueError("completion manifest provider is invalid")
        checkpoint = str(payload["source_checkpoint_sha256"])
        if not SHA256_PATTERN.fullmatch(checkpoint):
            raise ValueError("completion manifest checkpoint hash is invalid")
        record_count = int(payload["source_record_count"])
        if record_count < 0:
            raise ValueError("completion manifest record count cannot be negative")
        bands = tuple(map(str, payload["bands"]))
        if len(bands) != len(set(bands)) or set(bands) != HF_BANDS:
            raise ValueError("completion manifest must cover each HF band exactly once")
        quality_flags = tuple(map(str, payload["quality_flags"]))
        if any(not value or len(value) > 128 for value in quality_flags):
            raise ValueError("completion manifest quality flag is invalid")
        target_hour = aware_utc(str(payload["target_hour"]), "target_hour")
        source_watermark = aware_utc(
            str(payload["source_watermark"]), "source_watermark"
        )
        available_at = aware_utc(str(payload["available_at"]), "available_at")
        if target_hour.minute or target_hour.second or target_hour.microsecond:
            raise ValueError("completion manifest target hour is not aligned")
        if source_watermark != target_hour + timedelta(hours=1):
            raise ValueError("completion manifest does not cover the full target hour")
        if available_at < source_watermark:
            raise ValueError("completion manifest was available before its watermark")
        return cls(
            provider=provider,
            target_hour=target_hour,
            source_watermark=source_watermark,
            available_at=available_at,
            source_checkpoint_sha256=checkpoint,
            source_record_count=record_count,
            bands=tuple(sorted(bands)),
            quality_flags=quality_flags,
        )


class Pruner(Protocol):
    def prune(self, *, older_than_hours: int) -> int: ...


class PostgrestPruner:
    def __init__(
        self,
        *,
        base_url: str,
        service_key: str,
        timeout_seconds: float = 30.0,
        client: httpx.Client | None = None,
    ) -> None:
        if not base_url.strip() or not service_key.strip():
            raise RuntimeError("feature-store URL and service key are required")
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.client = client or httpx.Client(timeout=timeout_seconds)

    def prune(self, *, older_than_hours: int) -> int:
        if older_than_hours < 27:
            raise ValueError("rolling WSPR retention cannot be shorter than 27 hours")
        try:
            response = self.client.post(
                f"{self.base_url}/rest/v1/rpc/prune_wspr_observations",
                headers={
                    "apikey": self.service_key,
                    "Authorization": f"Bearer {self.service_key}",
                    "Content-Type": "application/json",
                },
                json={"older_than": f"{older_than_hours} hours"},
            )
            response.raise_for_status()
            value = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise RuntimeError("rolling WSPR prune failed") from error
        if not isinstance(value, int) or value < 0:
            raise RuntimeError("rolling WSPR prune returned an invalid row count")
        return value


Finalizer = Callable[[CompletionManifest, str, int], dict[str, Any]]


def run_completed_hour(
    manifest: CompletionManifest,
    *,
    finalizer: Finalizer,
    pruner: Pruner,
    workers: int,
    threads_per_band: int,
    retention_hours: int = 30,
) -> dict[str, Any]:
    visible_cpus = os.cpu_count() or 1
    if workers < 1 or threads_per_band < 1:
        raise ValueError("workers and per-band threads must be positive")
    if workers * threads_per_band > visible_cpus:
        raise ValueError("finalizer concurrency would oversubscribe visible CPUs")
    if retention_hours < 27:
        raise ValueError("rolling WSPR retention cannot be shorter than 27 hours")
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            band: executor.submit(finalizer, manifest, band, threads_per_band)
            for band in manifest.bands
        }
        watermarks = {band: futures[band].result() for band in manifest.bands}
    expected_status = "degraded" if manifest.quality_flags else "complete"
    if any(
        value.get("band") != band
        or value.get("status") != expected_status
        or value.get("provider") != manifest.provider
        for band, value in watermarks.items()
    ):
        raise RuntimeError("hourly finalizer returned an inconsistent watermark")
    pruned_rows = pruner.prune(older_than_hours=retention_hours)
    return {
        "provider": manifest.provider,
        "target_hour": manifest.target_hour.isoformat(),
        "source_checkpoint_sha256": manifest.source_checkpoint_sha256,
        "source_record_count": manifest.source_record_count,
        "bands_finalized": len(watermarks),
        "status": expected_status,
        "feature_cells": sum(
            int(value.get("feature_cell_count", 0)) for value in watermarks.values()
        ),
        "observations_by_band": {
            band: int(value.get("observation_count", 0))
            for band, value in watermarks.items()
        },
        "pruned_observations": pruned_rows,
        "workers": workers,
        "threads_per_band": threads_per_band,
        "maximum_compute_threads": workers * threads_per_band,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--completion-manifest", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--threads-per-band", type=int, default=4)
    parser.add_argument("--page-size", type=int, default=5000)
    parser.add_argument("--retention-hours", type=int, default=30)
    parser.add_argument(
        "--lock-file",
        type=Path,
        default=Path("/tmp/propulse-wspr-finalizer.lock"),
    )
    args = parser.parse_args()
    payload = json.loads(args.completion_manifest.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("completion manifest must be a JSON object")
    signing_secret = os.environ.get("PROPULSE_WSPR_COMPLETION_SECRET", "")
    manifest = CompletionManifest.from_json(payload, signing_secret=signing_secret)
    base_url = os.environ.get("PROPULSE_FEATURE_STORE_URL", "")
    service_key = os.environ.get("PROPULSE_FEATURE_STORE_SERVICE_KEY", "")
    if not base_url or not service_key:
        raise RuntimeError("feature-store URL and service key are required")

    def finalizer(item: CompletionManifest, band: str, threads: int) -> dict[str, Any]:
        return finalize_hour(
            PostgrestFinalizerStore(base_url=base_url, service_key=service_key),
            target_hour=item.target_hour,
            available_at=item.available_at,
            source_watermark=item.source_watermark,
            band=band,
            provider=item.provider,
            source_complete=True,
            quality_flags=item.quality_flags,
            page_size=args.page_size,
            threads=threads,
        )

    args.lock_file.parent.mkdir(parents=True, exist_ok=True)
    with args.lock_file.open("w", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("another WSPR finalizer run is active") from error
        result = run_completed_hour(
            manifest,
            finalizer=finalizer,
            pruner=PostgrestPruner(base_url=base_url, service_key=service_key),
            workers=args.workers,
            threads_per_band=args.threads_per_band,
            retention_hours=args.retention_hours,
        )
    result["completion_manifest_sha256"] = hashlib.sha256(
        args.completion_manifest.read_bytes()
    ).hexdigest()
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
