#!/usr/bin/env python3
"""Install or remove the internal M5 WSPR research launchd job."""

from __future__ import annotations

import argparse
import os
import plistlib
import subprocess
import sys
from pathlib import Path
from typing import Any


LABEL = "org.propulse.wspr-research"
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT_ROOT = Path.home() / "Library/Application Support/PropulseML"


def launchd_payload(
    *,
    python: Path,
    artifact_root: Path,
    stdout_path: Path,
    stderr_path: Path,
) -> dict[str, Any]:
    return {
        "Label": LABEL,
        "ProgramArguments": [
            str(python),
            str(ROOT / "ml/service/run_m5_wspr_research_catchup.py"),
            "--artifact-root",
            str(artifact_root),
            "--max-catchup-hours",
            "24",
        ],
        "WorkingDirectory": str(ROOT),
        "EnvironmentVariables": {
            "PROPULSE_WSPR_LIVE_RESEARCH_ENABLED": "true",
            "PROPULSE_ML_ARTIFACT_ROOT": str(artifact_root),
        },
        "StartCalendarInterval": {"Minute": 15},
        "RunAtLoad": True,
        "ProcessType": "Interactive",
        "ThrottleInterval": 300,
        "Umask": 0o077,
        "StandardOutPath": str(stdout_path),
        "StandardErrorPath": str(stderr_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--install", action="store_true")
    action.add_argument("--uninstall", action="store_true")
    parser.add_argument("--acknowledge-research-only", action="store_true")
    parser.add_argument(
        "--artifact-root",
        type=Path,
        default=DEFAULT_ARTIFACT_ROOT,
    )
    args = parser.parse_args()
    if not args.acknowledge_research_only:
        raise RuntimeError("launchd changes require the research-only acknowledgement")
    args.artifact_root = args.artifact_root.expanduser().resolve()
    try:
        args.artifact_root.relative_to(Path.home().resolve())
    except ValueError as error:
        raise RuntimeError("launchd runtime must stay on the internal home volume") from error
    uid = os.getuid()
    domain = f"gui/{uid}"
    target = Path.home() / "Library/LaunchAgents" / f"{LABEL}.plist"
    if args.uninstall:
        subprocess.run(
            ["/bin/launchctl", "bootout", domain, str(target)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        target.unlink(missing_ok=True)
        print(target)
        return
    env_file = ROOT / ".env.local"
    secret_file = args.artifact_root / "secrets/wspr_completion_secret"
    if not env_file.is_file() or not secret_file.is_file():
        raise RuntimeError("ignored target credentials and the signing secret are required")
    for protected in (env_file, secret_file):
        details = protected.stat()
        if protected.is_symlink() or details.st_uid != uid or details.st_mode & 0o077:
            raise RuntimeError(f"{protected.name} must be a non-symlink owner-only file")
    args.artifact_root.mkdir(parents=True, exist_ok=True)
    os.chmod(args.artifact_root, 0o700)
    os.chmod(secret_file.parent, 0o700)
    logs = Path.home() / "Library/Logs/Propulse"
    logs.mkdir(parents=True, exist_ok=True)
    os.chmod(logs, 0o700)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = launchd_payload(
        python=Path(sys.executable),
        artifact_root=args.artifact_root,
        stdout_path=logs / "wspr-research.stdout.log",
        stderr_path=logs / "wspr-research.stderr.log",
    )
    temporary = target.with_suffix(".plist.tmp")
    temporary.write_bytes(plistlib.dumps(payload, sort_keys=True))
    os.chmod(temporary, 0o600)
    temporary.replace(target)
    subprocess.run(
        ["/bin/launchctl", "bootout", domain, str(target)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    subprocess.run(["/bin/launchctl", "bootstrap", domain, str(target)], check=True)
    print(target)


if __name__ == "__main__":
    main()
