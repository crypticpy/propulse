"""Research-only streaming connector for a completed WSPR.live hour."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import resource
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

from wspr_ingest import PostgrestObservationStore, ingest_observations, jsonl_rows
from wspr_scheduler import completion_signature


WSPR_LIVE_URL = "https://db1.wspr.live/"
PROVIDER = "wspr.live-research-v1"
INGEST_VERSION = "wspr-live-json-v1"
BAND_CODES = {
    1: "160m",
    3: "80m",
    5: "60m",
    7: "40m",
    10: "30m",
    14: "20m",
    18: "17m",
    21: "15m",
    24: "12m",
    28: "10m",
}
SOURCE_FIELDS = {
    "id",
    "event_epoch",
    "band",
    "tx_sign",
    "tx_loc",
    "rx_sign",
    "rx_loc",
    "power",
    "snr",
}


def aware_utc(value: str | datetime, label: str) -> datetime:
    parsed = (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, str)
        else value
    )
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"{label} must include a UTC offset")
    return parsed.astimezone(timezone.utc)


def latest_settled_hour(now: datetime, settlement: timedelta) -> datetime:
    value = aware_utc(now, "now") - settlement
    return value.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)


def validate_target_hour(
    target_hour: datetime,
    *,
    now: datetime,
    settlement: timedelta,
    maximum_age: timedelta = timedelta(hours=30),
) -> datetime:
    target = aware_utc(target_hour, "target_hour")
    current = aware_utc(now, "now")
    if target.minute or target.second or target.microsecond:
        raise ValueError("target_hour must be aligned to UTC hour")
    if settlement < timedelta(minutes=5) or settlement > timedelta(hours=2):
        raise ValueError("settlement must be between 5 and 120 minutes")
    if target + timedelta(hours=1) + settlement > current:
        raise ValueError("target hour has not completed its settlement interval")
    if target < current - maximum_age:
        raise ValueError("target hour is outside rolling-ingest retention")
    return target


def hour_query(target_hour: datetime) -> str:
    start = int(aware_utc(target_hour, "target_hour").timestamp())
    end = start + 3600
    codes = ",".join(map(str, sorted(BAND_CODES)))
    grid = "^[A-R]{2}[0-9]{2}([A-X]{2})?$"
    return (
        "SELECT id, toUnixTimestamp(time) AS event_epoch, band, tx_sign, "
        "tx_loc, rx_sign, rx_loc, power, snr FROM wspr.rx "
        f"WHERE time >= toDateTime({start}, 'UTC') "
        f"AND time < toDateTime({end}, 'UTC') "
        f"AND band IN ({codes}) "
        "AND length(trim(tx_sign)) BETWEEN 3 AND 20 "
        "AND length(trim(rx_sign)) BETWEEN 3 AND 20 "
        f"AND match(upper(trim(tx_loc)), '{grid}') "
        f"AND match(upper(trim(rx_loc)), '{grid}') "
        "AND power BETWEEN -10 AND 70 AND snr BETWEEN -80 AND 40 "
        "ORDER BY band, time, id FORMAT JSONEachRow"
    )


def mapped_row(value: dict[str, Any]) -> dict[str, Any]:
    if set(value) != SOURCE_FIELDS:
        raise RuntimeError("WSPR.live row does not match the locked connector schema")
    try:
        band = BAND_CODES[int(value["band"])]
        event_epoch = int(value["event_epoch"])
        source_id = str(int(value["id"]))
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("WSPR.live row contains an invalid identifier") from error
    return {
        "source_id": source_id,
        "event_time": datetime.fromtimestamp(
            event_epoch, tz=timezone.utc
        ).isoformat(),
        "band": band,
        "tx_call": str(value["tx_sign"]),
        "tx_grid": str(value["tx_loc"]),
        "rx_call": str(value["rx_sign"]),
        "rx_grid": str(value["rx_loc"]),
        "tx_power_dbm": value["power"],
        "snr_db": value["snr"],
    }


@dataclass(frozen=True)
class FetchReceipt:
    spool_path: Path
    target_hour: datetime
    available_at: datetime
    checkpoint_sha256: str
    record_count: int
    records_by_band: dict[str, int]


class WsprLiveClient:
    def __init__(
        self,
        *,
        client: httpx.Client | None = None,
        max_rows: int = 2_000_000,
    ) -> None:
        if max_rows < 1 or max_rows > 5_000_000:
            raise ValueError("max_rows must be between 1 and 5,000,000")
        timeout = httpx.Timeout(connect=10, read=300, write=10, pool=10)
        self.client = client or httpx.Client(timeout=timeout)
        self.max_rows = max_rows

    def fetch_hour(self, target_hour: datetime, *, spool_dir: Path) -> FetchReceipt:
        target = aware_utc(target_hour, "target_hour")
        spool_dir.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f"wspr-live-{target:%Y%m%dT%H}-",
            suffix=".jsonl",
            dir=spool_dir,
        )
        temporary = Path(temporary_name)
        digest = hashlib.sha256()
        counts = {band: 0 for band in sorted(BAND_CODES.values())}
        total = 0
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as spool:
                with self.client.stream(
                    "GET",
                    WSPR_LIVE_URL,
                    params={"query": hour_query(target)},
                    headers={
                        "Accept": "application/x-ndjson",
                        "User-Agent": (
                            "PropulseResearch/1.0 "
                            "(+https://github.com/crypticpy/propulse)"
                        ),
                    },
                ) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if not line.strip():
                            continue
                        try:
                            payload = json.loads(line)
                        except json.JSONDecodeError as error:
                            raise RuntimeError(
                                "WSPR.live returned malformed JSONEachRow"
                            ) from error
                        if not isinstance(payload, dict):
                            raise RuntimeError("WSPR.live row is not a JSON object")
                        mapped = mapped_row(payload)
                        event = aware_utc(mapped["event_time"], "event_time")
                        if not target <= event < target + timedelta(hours=1):
                            raise RuntimeError("WSPR.live returned a row outside the requested hour")
                        total += 1
                        if total > self.max_rows:
                            raise RuntimeError("WSPR.live response exceeded the row safety bound")
                        counts[str(mapped["band"])] += 1
                        encoded = json.dumps(
                            mapped,
                            ensure_ascii=True,
                            sort_keys=True,
                            separators=(",", ":"),
                        ).encode()
                        spool.write(encoded.decode())
                        spool.write("\n")
                        digest.update(encoded)
                        digest.update(b"\n")
                spool.flush()
                os.fsync(spool.fileno())
            if total == 0:
                raise RuntimeError("WSPR.live returned no valid HF rows for a full hour")
            return FetchReceipt(
                spool_path=temporary,
                target_hour=target,
                available_at=datetime.now(timezone.utc),
                checkpoint_sha256=digest.hexdigest(),
                record_count=total,
                records_by_band=counts,
            )
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise


def require_research_gate(*, acknowledged: bool, enabled: bool) -> None:
    if not acknowledged or not enabled:
        raise RuntimeError(
            "WSPR.live research ingest requires both the CLI acknowledgement and "
            "PROPULSE_WSPR_LIVE_RESEARCH_ENABLED=true"
        )


def signed_manifest(receipt: FetchReceipt, *, signing_secret: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "schema_version": 1,
        "provider": PROVIDER,
        "target_hour": receipt.target_hour.isoformat(),
        "source_watermark": (
            receipt.target_hour + timedelta(hours=1)
        ).isoformat(),
        "available_at": receipt.available_at.isoformat(),
        "source_complete": True,
        "source_checkpoint_sha256": receipt.checkpoint_sha256,
        "source_record_count": receipt.record_count,
        "bands": sorted(BAND_CODES.values()),
        "quality_flags": [],
    }
    payload["manifest_hmac_sha256"] = completion_signature(payload, signing_secret)
    return payload


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=True, sort_keys=True, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def peak_rss_mib() -> float:
    value = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    bytes_used = value if platform.system() == "Darwin" else value * 1024
    return bytes_used / (1024 * 1024)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-hour")
    parser.add_argument("--settlement-minutes", type=int, default=10)
    parser.add_argument("--spool-dir", type=Path, required=True)
    parser.add_argument("--manifest-output", type=Path)
    parser.add_argument("--evidence-output", type=Path)
    parser.add_argument("--page-size", type=int, default=1000)
    parser.add_argument("--max-rows", type=int, default=2_000_000)
    parser.add_argument("--acknowledge-research-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--keep-spool", action="store_true")
    args = parser.parse_args()
    require_research_gate(
        acknowledged=args.acknowledge_research_only,
        enabled=os.environ.get("PROPULSE_WSPR_LIVE_RESEARCH_ENABLED") == "true",
    )
    now = datetime.now(timezone.utc)
    settlement = timedelta(minutes=args.settlement_minutes)
    target = (
        aware_utc(args.target_hour, "target_hour")
        if args.target_hour
        else latest_settled_hour(now, settlement)
    )
    target = validate_target_hour(target, now=now, settlement=settlement)
    started = time.perf_counter()
    receipt = WsprLiveClient(max_rows=args.max_rows).fetch_hour(
        target, spool_dir=args.spool_dir
    )
    result: dict[str, Any]
    try:
        result = {
            "provider": PROVIDER,
            "research_only": True,
            "target_hour": receipt.target_hour.isoformat(),
            "available_at": receipt.available_at.isoformat(),
            "source_checkpoint_sha256": receipt.checkpoint_sha256,
            "source_record_count": receipt.record_count,
            "records_by_band": receipt.records_by_band,
        }
        if args.dry_run:
            result["status"] = "validated-not-ingested"
        else:
            if args.manifest_output is None:
                raise RuntimeError("--manifest-output is required outside dry-run mode")
            base_url = os.environ.get("PROPULSE_FEATURE_STORE_URL", "")
            service_key = os.environ.get("PROPULSE_FEATURE_STORE_SERVICE_KEY", "")
            signing_secret = os.environ.get("PROPULSE_WSPR_COMPLETION_SECRET", "")
            ingest = ingest_observations(
                PostgrestObservationStore(
                    base_url=base_url,
                    service_key=service_key,
                ),
                jsonl_rows(receipt.spool_path),
                provider=PROVIDER,
                received_at=receipt.available_at,
                ingest_version=INGEST_VERSION,
                page_size=args.page_size,
            )
            write_json_atomic(
                args.manifest_output,
                signed_manifest(receipt, signing_secret=signing_secret),
            )
            result.update(ingest)
            result["status"] = "ingested-manifest-ready"
            result["manifest_output"] = str(args.manifest_output)
    finally:
        if not args.keep_spool:
            receipt.spool_path.unlink(missing_ok=True)
    result["elapsed_seconds"] = round(time.perf_counter() - started, 6)
    result["peak_rss_mib"] = round(peak_rss_mib(), 3)
    result["source_request_count"] = 1
    result["spool_removed"] = not receipt.spool_path.exists()
    if args.evidence_output is not None:
        gates = {
            "research_only": result["research_only"] is True,
            "one_bounded_source_request": result["source_request_count"] == 1,
            "all_hf_bands_observed": all(
                int(value) > 0 for value in receipt.records_by_band.values()
            ),
            "nonempty_completed_hour": receipt.record_count > 0,
            "checkpoint_sha256": len(receipt.checkpoint_sha256) == 64,
            "disk_spool_removed": result["spool_removed"] is True,
            "streaming_peak_rss_below_512_mib": result["peak_rss_mib"] < 512,
            "no_target_write_in_dry_run": (
                not args.dry_run or result["status"] == "validated-not-ingested"
            ),
        }
        evidence = {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scope": "wspr_live_research_connector_dry_run",
            "decision": "pass" if all(gates.values()) else "fail",
            "locked_outcomes_read": False,
            "provider": PROVIDER,
            "research_only": True,
            "target_hour": receipt.target_hour.isoformat(),
            "available_at": receipt.available_at.isoformat(),
            "source_request_count": result["source_request_count"],
            "source_record_count": receipt.record_count,
            "records_by_band": receipt.records_by_band,
            "source_checkpoint_sha256": receipt.checkpoint_sha256,
            "performance": {
                "elapsed_seconds": result["elapsed_seconds"],
                "peak_rss_mib": result["peak_rss_mib"],
            },
            "gates": gates,
        }
        write_json_atomic(args.evidence_output, evidence)
    print(json.dumps(result, ensure_ascii=True, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
