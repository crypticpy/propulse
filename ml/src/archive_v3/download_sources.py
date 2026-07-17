"""Download immutable WSPR archives with restart-safe HTTP range requests."""

from __future__ import annotations

import argparse
import shutil
import urllib.request
from pathlib import Path

from common import ensure_directories, load_config, wspr_raw_path


WSPR_URL = "https://www.wsprnet.org/archive/wsprspots-{month}.csv.gz"


def download_resumable(url: str, destination: Path, force: bool = False) -> None:
    if destination.exists() and not force:
        print(f"skip {destination}: exists", flush=True)
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".part")
    if force:
        destination.unlink(missing_ok=True)
        partial.unlink(missing_ok=True)
    offset = partial.stat().st_size if partial.exists() else 0
    headers = {"User-Agent": "Propulse-Archive-V3/1.0"}
    if offset:
        headers["Range"] = f"bytes={offset}-"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=120) as response:
        resumed = offset > 0 and response.status == 206
        mode = "ab" if resumed else "wb"
        response_bytes = response.headers.get("Content-Length")
        expected_bytes = (
            (offset if resumed else 0) + int(response_bytes)
            if response_bytes is not None
            else None
        )
        with partial.open(mode) as handle:
            shutil.copyfileobj(response, handle, length=8 * 1024 * 1024)
    if expected_bytes is not None and partial.stat().st_size != expected_bytes:
        raise IOError(
            f"incomplete download for {url}: "
            f"expected {expected_bytes}, received {partial.stat().st_size}"
        )
    partial.replace(destination)
    print(f"downloaded {destination} ({destination.stat().st_size:,} bytes)", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    config = load_config(args.config)
    ensure_directories()
    for month in config["months"]:
        download_resumable(
            WSPR_URL.format(month=month),
            wspr_raw_path(month),
            force=args.force,
        )


if __name__ == "__main__":
    main()
