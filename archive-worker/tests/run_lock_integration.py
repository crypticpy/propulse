#!/usr/bin/env python3
"""Prove two archive workers cannot process the same partition concurrently."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from propagation_archive.database import ArchiveDatabase
from propagation_archive.datasets import DATASETS


DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def _assert_disposable_local(database_url: str, confirmed: bool) -> None:
    parsed = urlparse(database_url)
    if not confirmed or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError(
            "the lock test requires --confirm-disposable-local-database and a loopback URL"
        )


def run(database_url: str) -> dict[str, object]:
    dataset = DATASETS["spot_history_v1"]
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    same_partition_rejected = False
    independent_partition_acquired = False
    with ArchiveDatabase(database_url) as first, ArchiveDatabase(database_url) as second:
        with first.partition_lock(dataset, start, start + timedelta(days=1)):
            try:
                with second.partition_lock(dataset, start, start + timedelta(days=1)):
                    pass
            except RuntimeError as error:
                if "already locked" not in str(error):
                    raise
                same_partition_rejected = True
            with second.partition_lock(
                dataset,
                start + timedelta(days=1),
                start + timedelta(days=2),
            ):
                independent_partition_acquired = True
    if not same_partition_rejected or not independent_partition_acquired:
        raise RuntimeError("archive advisory-lock concurrency contract failed")
    return {
        "status": "passed",
        "same_partition_rejected": same_partition_rejected,
        "independent_partition_acquired": independent_partition_acquired,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", default=DEFAULT_DATABASE_URL)
    parser.add_argument("--confirm-disposable-local-database", action="store_true")
    args = parser.parse_args()
    _assert_disposable_local(args.database_url, args.confirm_disposable_local_database)
    print(run(args.database_url))


if __name__ == "__main__":
    main()
