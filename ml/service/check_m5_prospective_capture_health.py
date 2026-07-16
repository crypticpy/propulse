#!/usr/bin/env python3
"""Write identity-free continuity evidence for the M5 prospective collector."""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


REQUIRED_SOURCES = ("pskreporter", "rbn", "dxcluster")
REQUIRED_AGGREGATIONS = ("band_hourly", "path_hourly")
COLLECTOR_LABEL = "org.propulse.prospective-collector"
PROSPECTIVE_WINDOW = ("2026-08-01", "2026-09-30")
SOURCE_STATUS_MAX_AGE_SECONDS = 12 * 60
SPOT_MAX_AGE_SECONDS = 30 * 60
AGGREGATION_MAX_AGE_SECONDS = 3 * 60 * 60
MAX_RECEIPT_GAP_SECONDS = 30 * 60
FRESH_SOURCE_CYCLE_MAX_AGE_SECONDS = 2 * 60
DEFAULT_SETTLE_TIMEOUT_SECONDS = 6 * 60
DEFAULT_SETTLE_POLL_SECONDS = 10
MINIMUM_WEATHER_AVAILABILITY = 0.95
MAXIMUM_CONSECUTIVE_WEATHER_STALE_SAMPLES = 2
SOLAR_SOURCE_MAX_AGE_SECONDS = {
    "kp": 15 * 60,
    "magnetic_field": 15 * 60,
    "solar_wind": 15 * 60,
    "proton_flux_10mev": 15 * 60,
    "dst": 2 * 60 * 60,
}
SOLAR_REQUIRED_SOURCES = ("kp", "magnetic_field", "solar_wind", "dst")
PIPELINE_CONTINUITY_GATES = (
    "native_arm64",
    "collector_launchd_running",
    "target_queries_succeeded",
    "pskreporter_current",
    "rbn_current",
    "dxcluster_current",
    "band_hourly_current",
    "path_hourly_current",
    "no_open_outages",
    "identity_free_receipt",
    "prospective_outcomes_unread",
)


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("timestamp lacks UTC offset")
    return parsed.astimezone(timezone.utc)


def age_seconds(now: datetime, value: str | None) -> float | None:
    parsed = parse_time(value)
    if parsed is None:
        return None
    return (now - parsed).total_seconds()


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def request_rows(
    base_url: str,
    service_key: str,
    table: str,
    params: dict[str, str],
) -> list[dict[str, Any]]:
    query = urllib.parse.urlencode(params, safe="(),.*")
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/rest/v1/{table}?{query}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if not isinstance(payload, list):
        raise RuntimeError(f"unexpected {table} response")
    return payload


def request_health_inputs(
    base_url: str,
    service_key: str,
    statuses: list[dict[str, Any]] | None = None,
) -> tuple[
    list[dict[str, Any]],
    dict[str, dict[str, Any] | None],
    list[dict[str, Any]],
    list[dict[str, Any]],
    dict[str, Any] | None,
]:
    selected_statuses = statuses if statuses is not None else request_source_statuses(
        base_url,
        service_key,
    )
    latest_spots: dict[str, dict[str, Any] | None] = {}
    for source in REQUIRED_SOURCES:
        rows = request_rows(
            base_url,
            service_key,
            "spot_history",
            {
                "select": "source,spotted_at,ingested_at,available_at",
                "source": f"eq.{source}",
                "order": "spotted_at.desc",
                "limit": "1",
            },
        )
        latest_spots[source] = rows[0] if rows else None
    solar_rows = request_rows(
        base_url,
        service_key,
        "solar_snapshots",
        {
            "select": "captured_at,source_observed_at",
            "order": "captured_at.desc",
            "limit": "1",
        },
    )
    watermarks = request_rows(
        base_url,
        service_key,
        "collector_aggregation_watermarks",
        {"select": "aggregation,hour_utc,rows_written,available_at"},
    )
    outages = request_rows(
        base_url,
        service_key,
        "collector_outages",
        {
            "select": "source,started_at",
            "source": "in.(pskreporter,rbn,dxcluster,solar,aggregator,path-aggregator)",
            "ended_at": "is.null",
        },
    )
    return (
        selected_statuses,
        latest_spots,
        watermarks,
        outages,
        solar_rows[0] if solar_rows else None,
    )


def request_source_statuses(
    base_url: str,
    service_key: str,
) -> list[dict[str, Any]]:
    return request_rows(
        base_url,
        service_key,
        "collector_source_status",
        {
            "select": "source,status,last_attempt_at,last_success_at,rows_last_run,duration_ms,error_message",
            "source": "in.(pskreporter,rbn,dxcluster,solar)",
        },
    )


def fresh_source_cycle(
    now: datetime,
    statuses: list[dict[str, Any]],
    maximum_age_seconds: int = FRESH_SOURCE_CYCLE_MAX_AGE_SECONDS,
) -> bool:
    by_source = {str(row.get("source")): row for row in statuses}
    return all(
        (age := age_seconds(now, by_source.get(source, {}).get("last_success_at")))
        is not None
        and 0 <= age <= maximum_age_seconds
        for source in (*REQUIRED_SOURCES, "solar")
    )


def launchd_running(label: str = COLLECTOR_LABEL) -> bool:
    result = subprocess.run(
        ["/bin/launchctl", "print", f"gui/{os.getuid()}/{label}"],
        check=False,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0 and "state = running" in result.stdout


def source_snapshot(
    now: datetime,
    statuses: list[dict[str, Any]],
    latest_spots: dict[str, dict[str, Any] | None],
) -> tuple[dict[str, dict[str, Any]], dict[str, bool]]:
    by_source = {str(row.get("source")): row for row in statuses}
    state: dict[str, dict[str, Any]] = {}
    gates: dict[str, bool] = {}
    for source in REQUIRED_SOURCES:
        row = by_source.get(source, {})
        spot = latest_spots.get(source) or {}
        success_age = age_seconds(now, row.get("last_success_at"))
        spot_age = age_seconds(now, spot.get("spotted_at"))
        attempt_age = age_seconds(now, row.get("last_attempt_at"))
        source_ok = (
            row.get("status") == "ok"
            and success_age is not None
            and 0 <= success_age <= SOURCE_STATUS_MAX_AGE_SECONDS
            and spot_age is not None
            and -60 <= spot_age <= SPOT_MAX_AGE_SECONDS
        )
        state[source] = {
            "status": row.get("status"),
            "last_attempt_at": row.get("last_attempt_at"),
            "last_success_at": row.get("last_success_at"),
            "attempt_age_seconds": attempt_age,
            "success_age_seconds": success_age,
            "rows_last_run": row.get("rows_last_run"),
            "duration_ms": row.get("duration_ms"),
            "error_present": bool(row.get("error_message")),
            "latest_spotted_at": spot.get("spotted_at"),
            "latest_ingested_at": spot.get("ingested_at"),
            "latest_available_at": spot.get("available_at"),
            "latest_spot_age_seconds": spot_age,
        }
        gates[f"{source}_current"] = source_ok
    return state, gates


def aggregation_snapshot(
    now: datetime,
    watermarks: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, bool]]:
    by_name = {str(row.get("aggregation")): row for row in watermarks}
    state: dict[str, dict[str, Any]] = {}
    gates: dict[str, bool] = {}
    for aggregation in REQUIRED_AGGREGATIONS:
        row = by_name.get(aggregation, {})
        hour = parse_time(row.get("hour_utc"))
        available = parse_time(row.get("available_at"))
        hour_age = (now - hour).total_seconds() if hour else None
        watermark_last = bool(
            hour
            and available
            and hour + timedelta(hours=1) <= available <= now + timedelta(minutes=1)
        )
        current = bool(
            watermark_last
            and hour_age is not None
            and 0 <= hour_age <= AGGREGATION_MAX_AGE_SECONDS
            and isinstance(row.get("rows_written"), int)
            and row["rows_written"] > 0
        )
        state[aggregation] = {
            "hour_utc": row.get("hour_utc"),
            "rows_written": row.get("rows_written"),
            "available_at": row.get("available_at"),
            "hour_age_seconds": hour_age,
            "watermark_last": watermark_last,
        }
        gates[f"{aggregation}_current"] = current
    return state, gates


def solar_snapshot(
    now: datetime,
    statuses: list[dict[str, Any]],
    snapshot: dict[str, Any] | None,
) -> tuple[dict[str, Any], bool]:
    status = next(
        (row for row in statuses if row.get("source") == "solar"),
        {},
    )
    value = snapshot or {}
    observed = value.get("source_observed_at")
    observed = observed if isinstance(observed, dict) else {}
    success_age = age_seconds(now, status.get("last_success_at"))
    captured_age = age_seconds(now, value.get("captured_at"))
    observed_ages = {
        source: age_seconds(now, observed.get(source))
        for source in SOLAR_SOURCE_MAX_AGE_SECONDS
    }
    source_current = {
        source: bool(
            age is not None
            and -60 <= age <= SOLAR_SOURCE_MAX_AGE_SECONDS[source]
        )
        for source, age in observed_ages.items()
    }
    # Match the serving contract: proton flux retains its 15-minute causal
    # limit but is optional and becomes a missing feature when NOAA publishes
    # it late. Critical Kp, magnetic-field, wind, and Dst inputs must be fresh.
    upstream_current = all(source_current[source] for source in SOLAR_REQUIRED_SOURCES)
    current = bool(
        status.get("status") == "ok"
        and success_age is not None
        and 0 <= success_age <= SOURCE_STATUS_MAX_AGE_SECONDS
        and captured_age is not None
        and 0 <= captured_age <= SOURCE_STATUS_MAX_AGE_SECONDS
        and upstream_current
    )
    return {
        "status": status.get("status"),
        "last_attempt_at": status.get("last_attempt_at"),
        "last_success_at": status.get("last_success_at"),
        "success_age_seconds": success_age,
        "rows_last_run": status.get("rows_last_run"),
        "duration_ms": status.get("duration_ms"),
        "error_present": bool(status.get("error_message")),
        "latest_captured_at": value.get("captured_at"),
        "capture_age_seconds": captured_age,
        "source_observed_at": {
            source: observed.get(source) for source in SOLAR_SOURCE_MAX_AGE_SECONDS
        },
        "source_age_seconds": observed_ages,
        "source_current": source_current,
        "required_sources": list(SOLAR_REQUIRED_SOURCES),
    }, current


def contiguous_healthy_hours(
    receipts: list[dict[str, Any]],
    now: datetime,
    current_healthy: bool,
) -> tuple[float, int, bool]:
    points: list[tuple[datetime, bool]] = []
    for receipt in receipts:
        try:
            generated = parse_time(str(receipt.get("generated_at")))
        except (TypeError, ValueError):
            continue
        if generated is not None and generated <= now:
            points.append((generated, bool(receipt.get("instant_healthy"))))
    points.append((now, current_healthy))
    points.sort(key=lambda item: item[0])
    if not points[-1][1]:
        return 0.0, 0, False

    start = points[-1][0]
    count = 1
    no_gap = True
    for index in range(len(points) - 2, -1, -1):
        point, healthy = points[index]
        later = points[index + 1][0]
        gap = (later - point).total_seconds()
        if not healthy or gap > MAX_RECEIPT_GAP_SECONDS:
            no_gap = gap <= MAX_RECEIPT_GAP_SECONDS
            break
        start = point
        count += 1
    return max(0.0, (now - start).total_seconds() / 3600), count, no_gap


def receipt_pipeline_healthy(receipt: dict[str, Any]) -> bool:
    if isinstance(receipt.get("pipeline_healthy"), bool):
        return bool(receipt["pipeline_healthy"])
    gates = receipt.get("gates")
    return bool(
        isinstance(gates, dict)
        and all(gates.get(name) is True for name in PIPELINE_CONTINUITY_GATES)
    )


def pipeline_continuity(
    receipts: list[dict[str, Any]],
    now: datetime,
    *,
    current_pipeline_healthy: bool,
    current_weather_healthy: bool,
    weather_window_hours: float = 24.0,
) -> dict[str, Any]:
    points: list[tuple[datetime, bool, bool]] = []
    for receipt in receipts:
        try:
            generated = parse_time(str(receipt.get("generated_at")))
        except (TypeError, ValueError):
            continue
        gates = receipt.get("gates")
        weather_healthy = bool(
            isinstance(gates, dict)
            and gates.get("solar_weather_current") is True
        )
        if generated is not None and generated <= now:
            points.append(
                (generated, receipt_pipeline_healthy(receipt), weather_healthy)
            )
    points.append((now, current_pipeline_healthy, current_weather_healthy))
    points.sort(key=lambda item: item[0])
    if not points[-1][1]:
        return {
            "hours": 0.0,
            "healthy_receipts": 0,
            "tail_has_no_gap": False,
            "weather_sample_receipts": 0,
            "weather_current_receipts": 0,
            "weather_availability": 0.0,
            "maximum_consecutive_weather_stale_samples": 0,
        }

    start_index = len(points) - 1
    no_gap = True
    for index in range(len(points) - 2, -1, -1):
        point, pipeline_healthy, _weather_healthy = points[index]
        later = points[index + 1][0]
        gap = (later - point).total_seconds()
        if not pipeline_healthy or gap > MAX_RECEIPT_GAP_SECONDS:
            no_gap = gap <= MAX_RECEIPT_GAP_SECONDS
            break
        start_index = index
    tail = points[start_index:]
    weather_cutoff = now - timedelta(hours=weather_window_hours)
    weather_tail = [point for point in tail if point[0] >= weather_cutoff]
    weather_current = sum(
        1 for _time, _pipeline, weather in weather_tail if weather
    )
    maximum_stale_run = 0
    stale_run = 0
    for _time, _pipeline, weather in weather_tail:
        stale_run = 0 if weather else stale_run + 1
        maximum_stale_run = max(maximum_stale_run, stale_run)
    return {
        "hours": max(0.0, (now - tail[0][0]).total_seconds() / 3600),
        "healthy_receipts": len(tail),
        "tail_has_no_gap": no_gap,
        "weather_sample_receipts": len(weather_tail),
        "weather_current_receipts": weather_current,
        "weather_availability": weather_current / len(weather_tail),
        "maximum_consecutive_weather_stale_samples": maximum_stale_run,
    }


def load_receipts(receipt_dir: Path) -> list[dict[str, Any]]:
    receipts: list[dict[str, Any]] = []
    for path in sorted(receipt_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if payload.get("schema_version") == 1:
            receipts.append(payload)
    return receipts


def notify_transition(state_path: Path, healthy: bool) -> None:
    prior: bool | None = None
    if state_path.exists():
        try:
            prior = bool(json.loads(state_path.read_text(encoding="utf-8"))["healthy"])
        except (OSError, KeyError, json.JSONDecodeError):
            prior = None
    atomic_write(
        state_path,
        {"healthy": healthy, "updated_at": datetime.now(timezone.utc).isoformat()},
    )
    if prior is None or prior == healthy:
        return
    message = "Prospective capture recovered" if healthy else "Prospective capture is stale"
    subprocess.run(
        [
            "/usr/bin/osascript",
            "-e",
            f'display notification "{message}" with title "Propulse ML"',
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipt-dir", type=Path, required=True)
    parser.add_argument("--status-output", type=Path, required=True)
    parser.add_argument("--state-output", type=Path, required=True)
    parser.add_argument("--minimum-continuity-hours", type=float, default=24.0)
    parser.add_argument(
        "--settle-timeout-seconds",
        type=float,
        default=DEFAULT_SETTLE_TIMEOUT_SECONDS,
    )
    parser.add_argument(
        "--settle-poll-seconds",
        type=float,
        default=DEFAULT_SETTLE_POLL_SECONDS,
    )
    parser.add_argument("--notify-local", action="store_true")
    args = parser.parse_args()

    if args.settle_timeout_seconds < 0 or args.settle_poll_seconds <= 0:
        raise RuntimeError("settle timing must be positive")
    base_url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_key:
        raise RuntimeError("Supabase service environment is required")

    query_ok = True
    query_error_type: str | None = None
    statuses: list[dict[str, Any]] = []
    latest_spots: dict[str, dict[str, Any] | None] = {}
    watermarks: list[dict[str, Any]] = []
    outages: list[dict[str, Any]] = []
    latest_solar: dict[str, Any] | None = None
    settle_started = time.monotonic()
    source_status_queries = 0
    process_running = launchd_running()
    while True:
        now = datetime.now(timezone.utc)
        try:
            statuses = request_source_statuses(base_url, service_key)
            source_status_queries += 1
        except Exception as error:  # Keep a receipt during target/network failure.
            query_ok = False
            query_error_type = type(error).__name__
            break
        elapsed = time.monotonic() - settle_started
        remaining = args.settle_timeout_seconds - elapsed
        if (
            fresh_source_cycle(now, statuses)
            or not process_running
            or remaining <= 0
        ):
            break
        time.sleep(min(args.settle_poll_seconds, remaining))

    if query_ok:
        try:
            (
                statuses,
                latest_spots,
                watermarks,
                outages,
                latest_solar,
            ) = request_health_inputs(base_url, service_key, statuses)
        except Exception as error:
            query_ok = False
            query_error_type = type(error).__name__

    now = datetime.now(timezone.utc)
    settle_wait_seconds = max(0.0, time.monotonic() - settle_started)

    source_state, source_gates = source_snapshot(now, statuses, latest_spots)
    solar_state, solar_current = solar_snapshot(now, statuses, latest_solar)
    source_state["solar"] = solar_state
    source_gates["solar_weather_current"] = solar_current
    aggregation_state, aggregation_gates = aggregation_snapshot(now, watermarks)
    native_arm64 = platform.machine() == "arm64"
    gates = {
        "native_arm64": native_arm64,
        "collector_launchd_running": process_running,
        "target_queries_succeeded": query_ok,
        **source_gates,
        **aggregation_gates,
        "no_open_outages": len(outages) == 0,
        "identity_free_receipt": True,
        "prospective_outcomes_unread": True,
    }
    operational_gate_names = {
        "native_arm64",
        "collector_launchd_running",
        "target_queries_succeeded",
        "pskreporter_current",
        "rbn_current",
        "dxcluster_current",
        "solar_weather_current",
        "no_open_outages",
        "identity_free_receipt",
        "prospective_outcomes_unread",
    }
    operational_healthy = all(gates[name] for name in operational_gate_names)
    pipeline_healthy = all(gates[name] for name in PIPELINE_CONTINUITY_GATES)
    instant_healthy = all(gates.values())
    prior_receipts = load_receipts(args.receipt_dir)
    continuity = pipeline_continuity(
        prior_receipts,
        now,
        current_pipeline_healthy=pipeline_healthy,
        current_weather_healthy=solar_current,
        weather_window_hours=args.minimum_continuity_hours,
    )
    gates["minimum_continuity_reached"] = (
        continuity["hours"] >= args.minimum_continuity_hours
        and continuity["tail_has_no_gap"]
    )
    gates["weather_availability_at_least_95_percent"] = (
        continuity["weather_availability"] >= MINIMUM_WEATHER_AVAILABILITY
    )
    gates["weather_stale_run_within_limit"] = (
        continuity["maximum_consecutive_weather_stale_samples"]
        <= MAXIMUM_CONSECUTIVE_WEATHER_STALE_SAMPLES
    )
    ready = all(gates.values())
    open_outage_sources = sorted(
        str(row.get("source")) for row in outages if row.get("source")
    )
    payload = {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "host_role": "M5 prospective capture",
        "architecture": platform.machine(),
        "schedule": {
            "source_poll_seconds": {
                "pskreporter": 300,
                "rbn": 300,
                "dxcluster": 120,
            },
            "aggregation_poll_seconds": 300,
            "aggregation_settle_minutes": 20,
            "health_minutes": [2, 17, 32, 47],
            "fresh_source_cycle_max_age_seconds": (
                FRESH_SOURCE_CYCLE_MAX_AGE_SECONDS
            ),
            "settle_timeout_seconds": args.settle_timeout_seconds,
            "settle_wait_seconds": settle_wait_seconds,
            "settle_source_status_queries": source_status_queries,
        },
        "prospective_window": {
            "start": PROSPECTIVE_WINDOW[0],
            "end": PROSPECTIVE_WINDOW[1],
            "outcomes_read": False,
        },
        "source_state": source_state,
        "aggregation_state": aggregation_state,
        "open_outage_sources": open_outage_sources,
        "query_error_type": query_error_type,
        "operational_healthy": operational_healthy,
        "pipeline_healthy": pipeline_healthy,
        "instant_healthy": instant_healthy,
        "continuity": {
            **continuity,
            "basis": "gap_free_pipeline_with_measured_weather_availability",
            "maximum_allowed_gap_seconds": MAX_RECEIPT_GAP_SECONDS,
            "minimum_hours": args.minimum_continuity_hours,
            "minimum_weather_availability": MINIMUM_WEATHER_AVAILABILITY,
            "weather_sample_window_hours": args.minimum_continuity_hours,
            "maximum_allowed_consecutive_weather_stale_samples": (
                MAXIMUM_CONSECUTIVE_WEATHER_STALE_SAMPLES
            ),
        },
        "gates": gates,
        "prospective_capture_ready": ready,
        "privacy": {
            "callsigns_or_grids_in_receipt": False,
            "user_station_data_collected": False,
            "raw_upstream_rows_redistributed": False,
        },
    }
    args.receipt_dir.mkdir(parents=True, exist_ok=True)
    receipt_path = args.receipt_dir / now.strftime("%Y%m%dT%H%M%SZ.json")
    atomic_write(receipt_path, payload)
    atomic_write(args.status_output, payload)
    if args.notify_local:
        notify_transition(args.state_output, operational_healthy)
    print(json.dumps({
        "operational_healthy": operational_healthy,
        "pipeline_healthy": pipeline_healthy,
        "instant_healthy": instant_healthy,
        "continuity_hours": continuity["hours"],
        "prospective_capture_ready": ready,
        "receipt": str(receipt_path),
    }))
    raise SystemExit(0 if operational_healthy else 1)


if __name__ == "__main__":
    main()
