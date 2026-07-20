"""Source-agnostic normalization for an authorized WSPR connector."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Iterable, Protocol

import httpx


HF_BANDS = {
    "160m", "80m", "60m", "40m", "30m",
    "20m", "17m", "15m", "12m", "10m",
}
GRID4_PATTERN = re.compile(r"^[A-R]{2}[0-9]{2}$")
PROVIDER_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_.:-]{0,63}$")


class ObservationStore(Protocol):
    def insert_observation_page(self, rows: list[dict[str, Any]]) -> None: ...


class PostgrestObservationStore:
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

    def insert_observation_page(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        try:
            response = self.client.post(
                f"{self.base_url}/rest/v1/rpc/ingest_wspr_observation_rows",
                headers={
                    "apikey": self.service_key,
                    "Authorization": f"Bearer {self.service_key}",
                    "Content-Type": "application/json",
                },
                json={"p_rows": rows},
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise RuntimeError("rolling WSPR observation ingest failed") from error


def parse_time(value: str | datetime, label: str) -> datetime:
    parsed = (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, str)
        else value
    )
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{label} must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def power_bin_dbm(value: float) -> int:
    return int(
        (Decimal(str(value)) / Decimal("5")).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
        * 5
    )


def normalized_grid4(value: Any, label: str) -> str:
    grid = str(value).strip().upper()[:4]
    if not GRID4_PATTERN.fullmatch(grid):
        raise ValueError(f"{label} must contain a valid Maidenhead grid4")
    return grid


def normalized_call(value: Any, label: str) -> str:
    call = str(value).strip().upper()
    if not 3 <= len(call) <= 20:
        raise ValueError(f"{label} length must be between 3 and 20")
    return call


def observation_key(
    *,
    source: str,
    source_id: str | None,
    event_time: datetime,
    band: str,
    tx_call: str,
    tx_grid4: str,
    rx_call: str,
    rx_grid4: str,
    power_bin: int,
    snr_db: float,
) -> str:
    identity: list[Any] = [source, source_id] if source_id else [
        source,
        event_time.isoformat(),
        band,
        tx_call,
        tx_grid4,
        rx_call,
        rx_grid4,
        power_bin,
        snr_db,
    ]
    payload = json.dumps(identity, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def normalize_observation(
    raw: dict[str, Any],
    *,
    provider: str,
    received_at: datetime,
    ingest_version: str,
    maximum_lateness: timedelta = timedelta(hours=30),
) -> dict[str, Any]:
    if not PROVIDER_PATTERN.fullmatch(provider):
        raise ValueError("invalid approved provider identifier")
    if not ingest_version or len(ingest_version) > 128:
        raise ValueError("invalid ingest version")
    receipt = parse_time(received_at, "received_at")
    event = parse_time(str(raw["event_time"]), "event_time")
    if event > receipt + timedelta(minutes=5):
        raise ValueError("event_time is implausibly later than receipt")
    if event < receipt - maximum_lateness:
        raise ValueError("event_time exceeds the bounded late-arrival window")
    band = str(raw["band"]).strip().lower()
    if band not in HF_BANDS:
        raise ValueError("unsupported HF band")
    tx_call = normalized_call(raw["tx_call"], "tx_call")
    rx_call = normalized_call(raw["rx_call"], "rx_call")
    tx_grid4 = normalized_grid4(raw["tx_grid"], "tx_grid")
    rx_grid4 = normalized_grid4(raw["rx_grid"], "rx_grid")
    tx_power_dbm = float(raw["tx_power_dbm"])
    snr_db = float(raw["snr_db"])
    if not math.isfinite(tx_power_dbm) or not math.isfinite(snr_db):
        raise ValueError("WSPR numeric values must be finite")
    if not -10 <= tx_power_dbm <= 70:
        raise ValueError("tx_power_dbm is outside the archive contract")
    if not -80 <= snr_db <= 40:
        raise ValueError("snr_db is outside the archive contract")
    power_bin = power_bin_dbm(tx_power_dbm)
    source_id_raw = raw.get("source_id")
    source_id = str(source_id_raw).strip() if source_id_raw is not None else None
    if source_id == "":
        source_id = None
    if source_id is not None and len(source_id) > 256:
        raise ValueError("source_id exceeds 256 characters")
    epoch = int(event.timestamp())
    target_hour = event.replace(minute=0, second=0, microsecond=0)
    return {
        "source": provider,
        "source_id": source_id,
        "observation_key_sha256": observation_key(
            source=provider,
            source_id=source_id,
            event_time=event,
            band=band,
            tx_call=tx_call,
            tx_grid4=tx_grid4,
            rx_call=rx_call,
            rx_grid4=rx_grid4,
            power_bin=power_bin,
            snr_db=snr_db,
        ),
        "event_time": event.isoformat(),
        "received_at": receipt.isoformat(),
        "slot_epoch": (epoch // 120) * 120,
        "target_hour": target_hour.isoformat(),
        "band": band,
        "tx_call": tx_call,
        "tx_grid4": tx_grid4,
        "rx_call": rx_call,
        "rx_grid4": rx_grid4,
        "power_bin_dbm": power_bin,
        "snr_db": snr_db,
        "mode": "WSPR",
        "ingest_version": ingest_version,
    }


def ingest_observations(
    store: ObservationStore,
    raw_rows: Iterable[dict[str, Any]],
    *,
    provider: str,
    received_at: datetime,
    ingest_version: str,
    page_size: int = 1000,
) -> dict[str, int]:
    if page_size < 1 or page_size > 10_000:
        raise ValueError("page_size must be between 1 and 10,000")
    page = []
    normalized_count = 0
    for raw in raw_rows:
        page.append(normalize_observation(
            raw,
            provider=provider,
            received_at=received_at,
            ingest_version=ingest_version,
        ))
        normalized_count += 1
        if len(page) == page_size:
            store.insert_observation_page(page)
            page = []
    if page:
        store.insert_observation_page(page)
    return {"normalized_rows": normalized_count}


def jsonl_rows(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"JSONL row {line_number} is not an object")
            yield value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-jsonl", type=Path, required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--received-at", required=True)
    parser.add_argument("--ingest-version", required=True)
    parser.add_argument("--page-size", type=int, default=1000)
    args = parser.parse_args()
    store = PostgrestObservationStore(
        base_url=os.environ.get("PROPULSE_FEATURE_STORE_URL", ""),
        service_key=os.environ.get("PROPULSE_FEATURE_STORE_SERVICE_KEY", ""),
    )
    print(ingest_observations(
        store,
        jsonl_rows(args.input_jsonl),
        provider=args.provider,
        received_at=parse_time(args.received_at, "received_at"),
        ingest_version=args.ingest_version,
        page_size=args.page_size,
    ))


if __name__ == "__main__":
    main()
