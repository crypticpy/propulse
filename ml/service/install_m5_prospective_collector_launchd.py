#!/usr/bin/env python3
"""Install the first-party prospective capture and health LaunchAgents."""

from __future__ import annotations

import argparse
import os
import plistlib
import subprocess
from pathlib import Path
from typing import Any


LABEL = "org.propulse.prospective-collector"
HEALTH_LABEL = "org.propulse.prospective-collector-health"
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT_ROOT = Path.home() / "Library/Application Support/PropulseML"


def collector_payload(
    *, env_file: Path, stdout_path: Path, stderr_path: Path
) -> dict[str, Any]:
    return {
        "Label": LABEL,
        "ProgramArguments": [
            "/bin/zsh",
            str(ROOT / "ml/service/run_m5_prospective_collector.sh"),
        ],
        "WorkingDirectory": str(ROOT),
        "EnvironmentVariables": {"PROPULSE_ENV_FILE": str(env_file)},
        "KeepAlive": True,
        "RunAtLoad": True,
        "ProcessType": "Background",
        "ThrottleInterval": 60,
        "Umask": 0o077,
        "StandardOutPath": str(stdout_path),
        "StandardErrorPath": str(stderr_path),
    }


def health_payload(
    *,
    artifact_root: Path,
    env_file: Path,
    stdout_path: Path,
    stderr_path: Path,
) -> dict[str, Any]:
    return {
        "Label": HEALTH_LABEL,
        "ProgramArguments": [
            "/bin/zsh",
            str(ROOT / "ml/service/run_m5_prospective_collector_health.sh"),
        ],
        "WorkingDirectory": str(ROOT),
        "EnvironmentVariables": {
            "PROPULSE_ENV_FILE": str(env_file),
            "PROPULSE_ML_ARTIFACT_ROOT": str(artifact_root),
        },
        "StartCalendarInterval": [
            {"Minute": 2},
            {"Minute": 17},
            {"Minute": 32},
            {"Minute": 47},
        ],
        "RunAtLoad": True,
        "ProcessType": "Background",
        "ThrottleInterval": 60,
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
    parser.add_argument("--acknowledge-public-upstream-capture", action="store_true")
    parser.add_argument("--artifact-root", type=Path, default=DEFAULT_ARTIFACT_ROOT)
    args = parser.parse_args()
    if not args.acknowledge_public_upstream_capture:
        raise RuntimeError("launchd changes require the public-upstream acknowledgement")

    artifact_root = args.artifact_root.expanduser().resolve()
    try:
        artifact_root.relative_to(Path.home().resolve())
    except ValueError as error:
        raise RuntimeError("collector runtime must stay on the internal home volume") from error

    uid = os.getuid()
    domain = f"gui/{uid}"
    launch_dir = Path.home() / "Library/LaunchAgents"
    target = launch_dir / f"{LABEL}.plist"
    health_target = launch_dir / f"{HEALTH_LABEL}.plist"
    if args.uninstall:
        for launchd_target in (health_target, target):
            bootout(domain, launchd_target)
            launchd_target.unlink(missing_ok=True)
            print(launchd_target)
        return

    env_file = ROOT / ".env.local"
    collector = ROOT / "collector/dist/index.js"
    python = ROOT / "ml/.venv/bin/python"
    if not env_file.is_file() or not collector.is_file() or not python.is_file():
        raise RuntimeError("owner-only credentials and built native runtimes are required")
    details = env_file.stat()
    if env_file.is_symlink() or details.st_uid != uid or details.st_mode & 0o077:
        raise RuntimeError(".env.local must be a non-symlink owner-only file")

    artifact_root.mkdir(parents=True, exist_ok=True)
    os.chmod(artifact_root, 0o700)
    logs = Path.home() / "Library/Logs/Propulse"
    logs.mkdir(parents=True, exist_ok=True)
    os.chmod(logs, 0o700)
    launch_dir.mkdir(parents=True, exist_ok=True)

    write_plist(
        target,
        collector_payload(
            env_file=env_file,
            stdout_path=logs / "prospective-collector.stdout.log",
            stderr_path=logs / "prospective-collector.stderr.log",
        ),
    )
    write_plist(
        health_target,
        health_payload(
            artifact_root=artifact_root,
            env_file=env_file,
            stdout_path=logs / "prospective-collector-health.stdout.log",
            stderr_path=logs / "prospective-collector-health.stderr.log",
        ),
    )
    for launchd_target in (health_target, target):
        bootout(domain, launchd_target)
    subprocess.run(["/bin/launchctl", "bootstrap", domain, str(target)], check=True)
    try:
        subprocess.run(
            ["/bin/launchctl", "bootstrap", domain, str(health_target)],
            check=True,
        )
    except subprocess.CalledProcessError:
        bootout(domain, target)
        raise
    print(target)
    print(health_target)


if __name__ == "__main__":
    main()
