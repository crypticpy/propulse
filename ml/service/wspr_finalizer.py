"""Bounded hourly finalizer for authorized rolling WSPR observations."""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Protocol

import duckdb
import httpx


ROOT = Path(__file__).resolve().parents[2]
LIVE = ROOT / "ml/src/propagation_live"
sys.path.insert(0, str(LIVE))

from opportunity_transform import (  # noqa: E402
    RECEIVER_SAMPLES_PER_TX_SLOT,
    TRANSFORM_VERSION,
    materialize_opportunity_cells,
    materialize_path_hour_cells,
)


HF_BANDS = {
    "160m", "80m", "60m", "40m", "30m",
    "20m", "17m", "15m", "12m", "10m",
}
PROVIDER_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_.:-]{0,63}$")
OBSERVATION_COLUMNS = (
    "slot_epoch",
    "target_hour",
    "band",
    "tx_call",
    "tx_grid4",
    "rx_call",
    "rx_grid4",
    "power_bin_dbm",
    "snr_db",
)
FEATURE_COLUMNS = (
    "target_hour",
    "band",
    "tx_grid4",
    "rx_grid4",
    "successes",
    "opportunities",
    "success_rate",
    "sampled_rows",
    "positive_rows",
)


def aware_utc(value: datetime, label: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{label} must include a UTC offset")
    return value.astimezone(timezone.utc)


class FinalizerStore(Protocol):
    def observation_pages(
        self,
        *,
        target_hour: datetime,
        band: str,
        provider: str,
        available_at: datetime,
        page_size: int,
    ) -> Iterable[list[dict[str, Any]]]: ...

    def upsert_feature_page(self, rows: list[dict[str, Any]]) -> None: ...

    def upsert_watermark(self, row: dict[str, Any]) -> None: ...


class PostgrestFinalizerStore:
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

    def headers(self, *, upsert: bool = False) -> dict[str, str]:
        headers = {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json",
        }
        if upsert:
            headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
        return headers

    def observation_pages(
        self,
        *,
        target_hour: datetime,
        band: str,
        provider: str,
        available_at: datetime,
        page_size: int,
    ) -> Iterable[list[dict[str, Any]]]:
        offset = 0
        while True:
            try:
                response = self.client.get(
                    f"{self.base_url}/rest/v1/wspr_observations_rolling",
                    headers=self.headers(),
                    params={
                        "select": ",".join(OBSERVATION_COLUMNS),
                        "source": f"eq.{provider}",
                        "target_hour": f"eq.{target_hour.isoformat()}",
                        "band": f"eq.{band}",
                        "received_at": f"lte.{available_at.isoformat()}",
                        "order": "id.asc",
                        "offset": str(offset),
                        "limit": str(page_size),
                    },
                )
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError) as error:
                raise RuntimeError("rolling WSPR observation lookup failed") from error
            if not isinstance(payload, list) or any(
                not isinstance(row, dict) for row in payload
            ):
                raise RuntimeError("rolling WSPR observation page is invalid")
            if payload:
                yield payload
            if len(payload) < page_size:
                break
            offset += page_size

    def upsert_feature_page(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        conflict = (
            "target_hour,band,tx_grid4,rx_grid4,provider,"
            "transform_version,available_at"
        )
        try:
            response = self.client.post(
                f"{self.base_url}/rest/v1/wspr_path_hourly_features",
                headers=self.headers(upsert=True),
                params={"on_conflict": conflict},
                json=rows,
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise RuntimeError("WSPR feature-page upsert failed") from error

    def upsert_watermark(self, row: dict[str, Any]) -> None:
        conflict = (
            "target_hour,band,provider,transform_version,available_at"
        )
        try:
            response = self.client.post(
                f"{self.base_url}/rest/v1/wspr_feature_watermarks",
                headers=self.headers(upsert=True),
                params={"on_conflict": conflict},
                json=row,
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise RuntimeError("WSPR feature watermark upsert failed") from error


def insert_observation_page(
    connection: duckdb.DuckDBPyConnection,
    page: list[dict[str, Any]],
    *,
    target_hour: datetime,
    band: str,
) -> None:
    rows = []
    for raw in page:
        try:
            row = tuple(raw[column] for column in OBSERVATION_COLUMNS)
        except KeyError as error:
            raise RuntimeError("rolling WSPR observation is missing a field") from error
        if str(raw["band"]) != band:
            raise RuntimeError("rolling WSPR observation band mismatch")
        row_hour = datetime.fromisoformat(
            str(raw["target_hour"]).replace("Z", "+00:00")
        )
        if aware_utc(row_hour, "observation target_hour") != target_hour:
            raise RuntimeError("rolling WSPR observation hour mismatch")
        rows.append(row)
    connection.executemany(
        "INSERT INTO wspr_source VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )


def finalize_hour(
    store: FinalizerStore,
    *,
    target_hour: datetime,
    available_at: datetime,
    source_watermark: datetime,
    band: str,
    provider: str,
    source_complete: bool,
    quality_flags: tuple[str, ...] = (),
    page_size: int = 5000,
    threads: int = 4,
) -> dict[str, Any]:
    target_hour = aware_utc(target_hour, "target_hour")
    available_at = aware_utc(available_at, "available_at")
    source_watermark = aware_utc(source_watermark, "source_watermark")
    if target_hour.minute or target_hour.second or target_hour.microsecond:
        raise ValueError("target_hour must be aligned to an hour")
    if available_at < target_hour + timedelta(hours=1):
        raise ValueError("available_at must follow the completed target hour")
    if source_watermark != target_hour + timedelta(hours=1):
        raise ValueError("source_watermark must cover the complete target hour")
    if source_watermark > available_at:
        raise ValueError("source_watermark cannot exceed available_at")
    if band not in HF_BANDS:
        raise ValueError("the V4.2 finalizer accepts HF bands only")
    if not PROVIDER_PATTERN.fullmatch(provider):
        raise ValueError("invalid approved provider identifier")
    if not source_complete:
        raise RuntimeError("source completeness must be confirmed before finalization")
    if page_size < 1 or page_size > 10_000:
        raise ValueError("page_size must be between 1 and 10,000")
    if threads < 1 or threads > (os.cpu_count() or 1):
        raise ValueError("threads must fit the visible CPU count")

    connection = duckdb.connect()
    connection.execute(f"SET threads={threads}")
    connection.execute("SET memory_limit='16GB'")
    connection.execute("SET preserve_insertion_order=false")
    connection.execute(
        """
        CREATE TABLE wspr_source (
          slot_epoch BIGINT,
          target_hour TIMESTAMPTZ,
          band VARCHAR,
          tx_call VARCHAR,
          tx_grid4 VARCHAR,
          rx_call VARCHAR,
          rx_grid4 VARCHAR,
          power_bin_dbm SMALLINT,
          snr_db FLOAT
        )
        """
    )
    observation_count = 0
    for page in store.observation_pages(
        target_hour=target_hour,
        band=band,
        provider=provider,
        available_at=available_at,
        page_size=page_size,
    ):
        insert_observation_page(
            connection,
            page,
            target_hour=target_hour,
            band=band,
        )
        observation_count += len(page)
    materialize_opportunity_cells(
        connection,
        source_relation="wspr_source",
        task="hf",
        receiver_samples=RECEIVER_SAMPLES_PER_TX_SLOT,
    )
    materialize_path_hour_cells(connection)
    cursor = connection.execute(
        """
        SELECT * FROM path_hour_cells
        ORDER BY tx_grid4, rx_grid4
        """
    )
    feature_count = 0
    while page := cursor.fetchmany(page_size):
        feature_rows = []
        for values in page:
            row = dict(zip(FEATURE_COLUMNS, values))
            for key, value in list(row.items()):
                if isinstance(value, datetime):
                    row[key] = aware_utc(value, key).isoformat()
            row.update({
                "available_at": available_at.isoformat(),
                "source_watermark": source_watermark.isoformat(),
                "provider": provider,
                "transform_version": TRANSFORM_VERSION,
                "quality_flags": list(quality_flags),
            })
            feature_rows.append(row)
        store.upsert_feature_page(feature_rows)
        feature_count += len(feature_rows)
    status = "complete" if not quality_flags else "degraded"
    watermark = {
        "target_hour": target_hour.isoformat(),
        "band": band,
        "provider": provider,
        "transform_version": TRANSFORM_VERSION,
        "status": status,
        "source_watermark": source_watermark.isoformat(),
        "available_at": available_at.isoformat(),
        "observation_count": observation_count,
        "feature_cell_count": feature_count,
        "quality_flags": list(quality_flags),
    }
    store.upsert_watermark(watermark)
    return watermark


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-hour", required=True)
    parser.add_argument("--available-at", required=True)
    parser.add_argument("--source-watermark", required=True)
    parser.add_argument("--band", choices=sorted(HF_BANDS), required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--confirm-source-complete", action="store_true")
    parser.add_argument("--quality-flag", action="append", default=[])
    parser.add_argument("--page-size", type=int, default=5000)
    parser.add_argument("--threads", type=int, default=min(4, os.cpu_count() or 1))
    args = parser.parse_args()
    store = PostgrestFinalizerStore(
        base_url=os.environ.get("PROPULSE_FEATURE_STORE_URL", ""),
        service_key=os.environ.get("PROPULSE_FEATURE_STORE_SERVICE_KEY", ""),
    )
    result = finalize_hour(
        store,
        target_hour=parse_time(args.target_hour),
        available_at=parse_time(args.available_at),
        source_watermark=parse_time(args.source_watermark),
        band=args.band,
        provider=args.provider,
        source_complete=args.confirm_source_complete,
        quality_flags=tuple(args.quality_flag),
        page_size=args.page_size,
        threads=args.threads,
    )
    print(result)


if __name__ == "__main__":
    main()
