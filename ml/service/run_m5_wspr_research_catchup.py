#!/usr/bin/env python3
"""Run missing settled WSPR research hours and maintain aggregate health."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from wspr_live_connector import aware_utc, latest_settled_hour
from wspr_scheduler import write_json_atomic


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT_ROOT = Path("/Volumes/Projects/PropulseML")


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"{path.name} is not a JSON object")
    return value


def completed_targets(receipt_dir: Path) -> list[datetime]:
    targets = []
    if not receipt_dir.exists():
        return targets
    for path in sorted(receipt_dir.glob("*.json")):
        value = read_json(path)
        if value.get("status") != "complete" or value.get("research_only") is not True:
            continue
        targets.append(aware_utc(str(value["target_hour"]), "receipt target_hour"))
    return sorted(set(targets))


def pending_targets(
    completed: list[datetime],
    *,
    latest: datetime,
    maximum: int,
) -> list[datetime]:
    if maximum < 1 or maximum > 24:
        raise ValueError("maximum catch-up hours must be between 1 and 24")
    latest = aware_utc(latest, "latest target hour")
    if not completed:
        return [latest]
    start = completed[-1] + timedelta(hours=1)
    if start > latest:
        return []
    count = int((latest - start).total_seconds() // 3600) + 1
    if count > maximum:
        raise RuntimeError("WSPR catch-up gap exceeds the configured safety bound")
    return [start + timedelta(hours=index) for index in range(count)]


def continuous_hours(completed: list[datetime]) -> int:
    if not completed:
        return 0
    unique = sorted(set(completed), reverse=True)
    count = 1
    for newer, older in zip(unique, unique[1:]):
        if newer - older != timedelta(hours=1):
            break
        count += 1
    return count


def write_health(
    path: Path,
    *,
    status: str,
    completed: list[datetime],
    latest: datetime,
    previous_failures: int,
    failed_target: datetime | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    last = completed[-1] if completed else None
    value = {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "status": status,
        "research_only": True,
        "latest_settled_target_hour": latest.isoformat(),
        "last_completed_target_hour": last.isoformat() if last else None,
        "continuous_completed_hours": continuous_hours(completed),
        "freshness_seconds": (
            max(0, int((now - (last + timedelta(hours=1))).total_seconds()))
            if last
            else None
        ),
        "consecutive_failures": 0 if status == "healthy" else previous_failures + 1,
        "failed_target_hour": failed_target.isoformat() if failed_target else None,
    }
    write_json_atomic(path, value)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--artifact-root",
        type=Path,
        default=Path(os.environ.get("PROPULSE_ML_ARTIFACT_ROOT", DEFAULT_ARTIFACT_ROOT)),
    )
    parser.add_argument(
        "--runner",
        type=Path,
        default=ROOT / "ml/service/run_m5_wspr_research_hour.sh",
    )
    parser.add_argument("--settlement-minutes", type=int, default=10)
    parser.add_argument("--max-catchup-hours", type=int, default=24)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if os.environ.get("PROPULSE_WSPR_LIVE_RESEARCH_ENABLED") != "true":
        raise RuntimeError("research catch-up requires explicit enablement")
    args.artifact_root.mkdir(parents=True, exist_ok=True)
    receipt_dir = args.artifact_root / "live_wspr_receipts"
    health_path = args.artifact_root / "live_wspr_health.json"
    lock_path = args.artifact_root / "live_wspr_catchup.lock"
    with lock_path.open("w", encoding="utf-8") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("another WSPR research catch-up is active") from error
        latest = latest_settled_hour(
            datetime.now(timezone.utc),
            timedelta(minutes=args.settlement_minutes),
        )
        completed = completed_targets(receipt_dir)
        pending = pending_targets(
            completed,
            latest=latest,
            maximum=args.max_catchup_hours,
        )
        if args.dry_run:
            print(json.dumps({
                "latest_settled_target_hour": latest.isoformat(),
                "pending_target_hours": [value.isoformat() for value in pending],
                "continuous_completed_hours": continuous_hours(completed),
            }, indent=2))
            return
        previous = read_json(health_path) if health_path.exists() else {}
        previous_failures = int(previous.get("consecutive_failures", 0))
        for target in pending:
            environment = {
                **os.environ,
                "PROPULSE_WSPR_LIVE_RESEARCH_ENABLED": "true",
                "PROPULSE_WSPR_TARGET_HOUR": target.isoformat(),
                "PROPULSE_ML_ARTIFACT_ROOT": str(args.artifact_root),
            }
            try:
                subprocess.run([str(args.runner)], env=environment, check=True)
            except (OSError, subprocess.CalledProcessError):
                write_health(
                    health_path,
                    status="failed",
                    completed=completed_targets(receipt_dir),
                    latest=latest,
                    previous_failures=previous_failures,
                    failed_target=target,
                )
                raise
            completed = completed_targets(receipt_dir)
            if target not in completed:
                write_health(
                    health_path,
                    status="failed",
                    completed=completed,
                    latest=latest,
                    previous_failures=previous_failures,
                    failed_target=target,
                )
                raise RuntimeError("WSPR runner returned without a completed receipt")
        write_health(
            health_path,
            status="healthy",
            completed=completed,
            latest=latest,
            previous_failures=previous_failures,
        )
        print(health_path.read_text(encoding="utf-8"), end="")


if __name__ == "__main__":
    main()
