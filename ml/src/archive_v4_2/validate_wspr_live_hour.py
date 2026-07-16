#!/usr/bin/env python3
"""Validate one real research WSPR hour against the deployed private store."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx


ROOT = Path(__file__).resolve().parents[3]
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(SERVICE))

from path_history import PostgrestPathHistoryProvider  # noqa: E402
from wspr_finalizer import HF_BANDS, TRANSFORM_VERSION  # noqa: E402
from wspr_scheduler import CompletionManifest, aware_utc  # noqa: E402


DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/wspr_live_hour_validation.json"
)
INVALIDATION_REASON = "observation_pagination_truncated"


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


class TargetReader:
    def __init__(self, *, base_url: str, service_key: str) -> None:
        if not base_url.strip() or not service_key.strip():
            raise RuntimeError("feature-store URL and service key are required")
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=30)
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        }
        self.request_count = 0

    def rows(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        self.request_count += 1
        response = self.client.get(
            f"{self.base_url}/rest/v1/{table}",
            headers=self.headers,
            params=params,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
            raise RuntimeError(f"{table} returned invalid JSON")
        return payload

    def exact_count(self, table: str, params: dict[str, str]) -> int:
        self.request_count += 1
        response = self.client.get(
            f"{self.base_url}/rest/v1/{table}",
            headers={
                **self.headers,
                "Prefer": "count=exact",
                "Range": "0-0",
            },
            params={"select": "id", **params},
        )
        response.raise_for_status()
        content_range = response.headers.get("content-range", "")
        try:
            return int(content_range.rsplit("/", 1)[1])
        except (IndexError, ValueError) as error:
            raise RuntimeError(f"{table} did not return an exact count") from error


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_time(value: Any) -> str:
    return aware_utc(str(value), "target timestamp").isoformat()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    started = time.perf_counter()
    manifest_payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    manifest = CompletionManifest.from_json(
        manifest_payload,
        signing_secret=os.environ.get("PROPULSE_WSPR_COMPLETION_SECRET", ""),
    )
    base_url = os.environ.get("PROPULSE_FEATURE_STORE_URL", "")
    service_key = os.environ.get("PROPULSE_FEATURE_STORE_SERVICE_KEY", "")
    target = TargetReader(base_url=base_url, service_key=service_key)
    target_iso = manifest.target_hour.isoformat()
    watermarks = target.rows(
        "wspr_feature_watermarks",
        {
            "select": (
                "band,status,source_watermark,available_at,observation_count,"
                "feature_cell_count,quality_flags"
            ),
            "provider": f"eq.{manifest.provider}",
            "target_hour": f"eq.{target_iso}",
            "order": "available_at.asc,band.asc",
        },
    )
    versions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in watermarks:
        versions[canonical_time(row.get("available_at"))].append(row)
    corrected = versions.get(manifest.available_at.isoformat(), [])
    failed_versions = [
        rows for available_at, rows in versions.items()
        if available_at != manifest.available_at.isoformat()
    ]

    observation_counts = {
        band: target.exact_count(
            "wspr_observations_rolling",
            {
                "source": f"eq.{manifest.provider}",
                "target_hour": f"eq.{target_iso}",
                "band": f"eq.{band}",
                "received_at": f"lte.{manifest.available_at.isoformat()}",
            },
        )
        for band in sorted(HF_BANDS)
    }
    feature_counts = {
        band: target.exact_count(
            "wspr_path_hourly_features",
            {
                "provider": f"eq.{manifest.provider}",
                "target_hour": f"eq.{target_iso}",
                "band": f"eq.{band}",
                "available_at": f"eq.{manifest.available_at.isoformat()}",
            },
        )
        for band in sorted(HF_BANDS)
    }
    watermark_by_band = {str(row.get("band")): row for row in corrected}
    lag_provider = PostgrestPathHistoryProvider(
        base_url=base_url,
        service_key=service_key,
        provider=manifest.provider,
        transform_version=TRANSFORM_VERSION,
    )
    incomplete_lags = lag_provider.lookup(
        issue_time=manifest.target_hour + timedelta(hours=2),
        band="20m",
        origin_grid4="EM10",
        target_grid4s=["IO91"],
    )
    target.request_count += 1

    gates = {
        "signed_manifest_v2_accepted": manifest_payload.get("schema_version") == 2,
        "exact_failed_and_corrected_versions": (
            len(versions) == 2
            and len(corrected) == len(HF_BANDS)
            and len(failed_versions) == 1
            and len(failed_versions[0]) == len(HF_BANDS)
        ),
        "truncated_version_all_band_invalidated": (
            len(failed_versions) == 1
            and all(
                row.get("status") == "failed"
                and row.get("quality_flags") == [INVALIDATION_REASON]
                for row in failed_versions[0]
            )
        ),
        "corrected_version_all_band_complete": (
            set(watermark_by_band) == HF_BANDS
            and all(
                row.get("status") == "complete" and not row.get("quality_flags")
                for row in corrected
            )
        ),
        "stored_observation_counts_match_manifest": (
            observation_counts == manifest.source_records_by_band
        ),
        "watermark_observation_counts_match_manifest": all(
            int(watermark_by_band.get(band, {}).get("observation_count", -1))
            == expected
            for band, expected in manifest.source_records_by_band.items()
        ),
        "feature_counts_match_watermarks": all(
            feature_counts[band]
            == int(watermark_by_band.get(band, {}).get("feature_cell_count", -1))
            for band in HF_BANDS
        ),
        "source_total_matches_exact_target_count": (
            sum(observation_counts.values()) == manifest.source_record_count
        ),
        "incomplete_four_lag_window_fails_closed": incomplete_lags == {},
        "locked_outcomes_unread": True,
    }
    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "real_wspr_live_hour_target_validation",
        "decision": "pass" if all(gates.values()) else "fail",
        "locked_outcomes_read": False,
        "provider": manifest.provider,
        "research_only": True,
        "target_hour": target_iso,
        "source_checkpoint_sha256": manifest.source_checkpoint_sha256,
        "completion_manifest_sha256": sha256(args.manifest),
        "source_record_count": manifest.source_record_count,
        "records_by_band": manifest.source_records_by_band,
        "feature_cell_count": sum(feature_counts.values()),
        "feature_cells_by_band": feature_counts,
        "watermark_versions": {
            "failed": len(failed_versions),
            "corrected": 1 if corrected else 0,
        },
        "execution": {
            "target_requests": target.request_count,
            "validation_wall_seconds": time.perf_counter() - started,
        },
        "gates": gates,
    }
    atomic_write(args.output, output)
    print(json.dumps(output, indent=2))
    if output["decision"] != "pass":
        raise SystemExit("real WSPR live-hour target validation failed")


if __name__ == "__main__":
    main()
