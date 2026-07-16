"""Invalidate one exact all-band WSPR watermark version after an audit failure."""

from __future__ import annotations

import argparse
import json
import os

from wspr_finalizer import PostgrestFinalizerStore, parse_time


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target-hour", required=True)
    parser.add_argument("--available-at", required=True)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--reason", required=True)
    args = parser.parse_args()
    invalidated = PostgrestFinalizerStore(
        base_url=os.environ.get("PROPULSE_FEATURE_STORE_URL", ""),
        service_key=os.environ.get("PROPULSE_FEATURE_STORE_SERVICE_KEY", ""),
    ).invalidate_watermark_version(
        target_hour=parse_time(args.target_hour),
        available_at=parse_time(args.available_at),
        provider=args.provider,
        reason=args.reason,
    )
    print(json.dumps({
        "provider": args.provider,
        "target_hour": args.target_hour,
        "available_at": args.available_at,
        "status": "failed",
        "reason": args.reason,
        "watermarks_invalidated": invalidated,
    }, indent=2))


if __name__ == "__main__":
    main()
