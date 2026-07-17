#!/usr/bin/env python3
"""Install or remove the leakage-safe M5 forecast archive schedule."""

from __future__ import annotations

import argparse
import os
import plistlib
import subprocess
from pathlib import Path
from typing import Any


LABEL = "org.propulse.forecast-archive"
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT_ROOT = Path.home() / "Library/Application Support/PropulseML"


def launchd_payload(
    *,
    artifact_root: Path,
    env_file: Path,
    stdout_path: Path,
    stderr_path: Path,
) -> dict[str, Any]:
    return {
        "Label": LABEL,
        "ProgramArguments": [
            "/bin/zsh",
            str(ROOT / "ml/service/run_m5_forecast_archive.sh"),
        ],
        "WorkingDirectory": str(ROOT),
        "EnvironmentVariables": {
            "PROPULSE_ENV_FILE": str(env_file),
            "PROPULSE_ML_ARTIFACT_ROOT": str(artifact_root),
        },
        "StartInterval": 6 * 60 * 60,
        "RunAtLoad": True,
        "ProcessType": "Background",
        "ThrottleInterval": 300,
        "Umask": 0o077,
        "StandardOutPath": str(stdout_path),
        "StandardErrorPath": str(stderr_path),
    }


def write_plist(path: Path, payload: dict[str, Any]) -> None:
    temporary = path.with_suffix(".plist.tmp")
    temporary.write_bytes(plistlib.dumps(payload, sort_keys=True))
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def bootout(domain: str, target: Path) -> None:
    subprocess.run(
        ["/bin/launchctl", "bootout", domain, str(target)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--install", action="store_true")
    action.add_argument("--uninstall", action="store_true")
    parser.add_argument("--acknowledge-noaa-archive", action="store_true")
    parser.add_argument("--artifact-root", type=Path, default=DEFAULT_ARTIFACT_ROOT)
    args = parser.parse_args()
    if not args.acknowledge_noaa_archive:
        raise RuntimeError("launchd changes require the NOAA archive acknowledgement")
    artifact_root = args.artifact_root.expanduser().resolve()
    try:
        artifact_root.relative_to(Path.home().resolve())
    except ValueError as error:
        raise RuntimeError("forecast runtime must stay on the internal home volume") from error
    uid = os.getuid()
    domain = f"gui/{uid}"
    target = Path.home() / "Library/LaunchAgents" / f"{LABEL}.plist"
    if args.uninstall:
        bootout(domain, target)
        target.unlink(missing_ok=True)
        print(target)
        return
    env_file = ROOT / ".env.local"
    collector = ROOT / "collector/dist/forecastArchive.js"
    if not env_file.is_file() or not collector.is_file():
        raise RuntimeError("owner-only target credentials and built forecast collector are required")
    details = env_file.stat()
    if env_file.is_symlink() or details.st_uid != uid or details.st_mode & 0o077:
        raise RuntimeError(".env.local must be a non-symlink owner-only file")
    artifact_root.mkdir(parents=True, exist_ok=True)
    os.chmod(artifact_root, 0o700)
    logs = Path.home() / "Library/Logs/Propulse"
    logs.mkdir(parents=True, exist_ok=True)
    os.chmod(logs, 0o700)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = launchd_payload(
        artifact_root=artifact_root,
        env_file=env_file,
        stdout_path=logs / "forecast-archive.stdout.log",
        stderr_path=logs / "forecast-archive.stderr.log",
    )
    bootout(domain, target)
    write_plist(target, payload)
    subprocess.run(["/bin/launchctl", "bootstrap", domain, str(target)], check=True)
    print(target)


if __name__ == "__main__":
    main()
