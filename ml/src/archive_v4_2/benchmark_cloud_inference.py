from __future__ import annotations

import json
import math
import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import httpx


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * fraction) - 1)
    return ordered[index]


def summary(values: list[float]) -> dict[str, float]:
    return {
        "median_ms": round(statistics.median(values), 3),
        "p95_ms": round(percentile(values, 0.95), 3),
        "max_ms": round(max(values), 3),
        "requests_per_second": round(1000 / statistics.mean(values), 3),
    }


def station() -> dict:
    conducted = 25.0
    passive_loss = 1.0
    gain_dbi = 7.1
    power_at_antenna = conducted * 10 ** (-passive_loss / 10)
    eirp = power_at_antenna * 10 ** (gain_dbi / 10)
    return {
        "featureContract": "station-chain-v1",
        "chainFingerprint": "benchmark:representative",
        "band": "20m",
        "frequencyMHz": 14.15,
        "mode": "WSPR",
        "requestedPowerWatts": 25,
        "conductedPowerWatts": conducted,
        "powerAtAntennaWatts": power_at_antenna,
        "eirpWatts": eirp,
        "erpWatts": eirp / 10 ** (2.15 / 10),
        "totalPassiveLossDb": passive_loss,
        "feedlineLossDb": 0.8,
        "inlineLossDb": 0.2,
        "amplifierGainDb": 0,
        "antennaGainTowardPathDbi": gain_dbi,
        "targetBearingDeg": 90,
        "takeoffAngleDeg": None,
        "receiverNoiseFloorDbm": -135,
        "receiverEvidence": "independent_test",
        "receiverEvidenceIsRelative": True,
        "localSystemNoiseFloorDbm": None,
        "modeBandwidthHz": 6,
        "modeSnrThresholdDb": -28,
        "supported": True,
        "warningCodes": [],
        "assumptions": ["local_noise_not_measured"],
    }


def grid4s(count: int) -> list[str]:
    values = []
    for first in "ABCDEFGHIJKLMNOPQR":
        for second in "ABCDEFGHIJKLMNOPQR":
            for third in "0123456789":
                for fourth in "0123456789":
                    values.append(f"{first}{second}{third}{fourth}")
                    if len(values) == count:
                        return values
    raise ValueError("requested too many grid cells")


def common() -> dict:
    observed_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    return {
        "origin_grid4": "EM10",
        "issue_time": observed_at,
        "valid_time": observed_at,
        "band": "20m",
        "mode": "WSPR",
        "declared_power_watts": 25,
        "station": station(),
    }


def feature(target: str) -> dict:
    return {
        "target_grid4": target,
        "values": {
            "band_mhz": 14.1,
            "dist_km": 7900,
            "sun_elev_mid": 20,
        },
    }


def timed_post(client: httpx.Client, path: str, payload: dict) -> tuple[float, int]:
    started = time.perf_counter()
    response = client.post(path, json=payload)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.raise_for_status()
    return elapsed_ms, len(response.content)


def main() -> None:
    base_url = os.environ["PROPULSE_INFERENCE_URL"].rstrip("/")
    token = os.environ["PROPULSE_SERVICE_TOKEN"]
    headers = {"Authorization": f"Bearer {token}"}
    limits = httpx.Limits(max_connections=12, max_keepalive_connections=12)
    results: dict[str, object] = {
        "measured_at": datetime.now(timezone.utc).isoformat(),
        "service_url": base_url,
        "method": {
            "path_sequential_requests": 30,
            "concurrency_requests_per_level": 24,
            "concurrency_levels": [1, 2, 4],
            "surface_cells": [144, 288, 4096],
            "surface_repetitions_per_size": 10,
            "http_connection_reuse": True,
        },
    }
    with httpx.Client(
        base_url=base_url,
        headers=headers,
        timeout=120,
        limits=limits,
    ) as client:
        health_started = time.perf_counter()
        health = client.get("/v1/propagation/health")
        health_ms = (time.perf_counter() - health_started) * 1000
        health.raise_for_status()
        results["health"] = {
            "latency_ms": round(health_ms, 3),
            "model_version": health.json().get("model_version"),
        }

        path_payload = {**common(), "features": feature("IO91")}
        for _ in range(3):
            timed_post(client, "/v1/propagation/path", path_payload)

        sequential = [
            timed_post(client, "/v1/propagation/path", path_payload)[0]
            for _ in range(30)
        ]
        results["path_sequential"] = summary(sequential)

        concurrency_results = {}
        for workers in (1, 2, 4):
            started = time.perf_counter()
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = [
                    executor.submit(
                        timed_post,
                        client,
                        "/v1/propagation/path",
                        path_payload,
                    )
                    for _ in range(24)
                ]
                latencies = [future.result()[0] for future in futures]
            wall_seconds = time.perf_counter() - started
            concurrency_results[str(workers)] = {
                **summary(latencies),
                "wall_requests_per_second": round(24 / wall_seconds, 3),
            }
        results["path_concurrency"] = concurrency_results

        surface_results = {}
        for count in (144, 288, 4096):
            payload = {
                **common(),
                "cells": [feature(target) for target in grid4s(count)],
            }
            samples = [
                timed_post(client, "/v1/propagation/surface", payload)
                for _ in range(10)
            ]
            latencies = [sample[0] for sample in samples]
            response_bytes = samples[-1][1]
            surface_results[str(count)] = {
                **summary(latencies),
                "response_bytes": response_bytes,
                "median_cells_per_second": round(
                    count / (statistics.median(latencies) / 1000),
                    3,
                ),
            }
        results["surface"] = surface_results

    print(json.dumps(results, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
