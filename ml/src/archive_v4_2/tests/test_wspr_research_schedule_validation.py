from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from ml.src.archive_v4_2.validate_wspr_research_schedule import (
    coverage_launchd_gates,
    health_launchd_gates,
)


class WsprResearchScheduleValidationTests(unittest.TestCase):
    def test_coverage_schedule_rejects_unbounded_queries(self) -> None:
        runtime_root = Path.home() / "Library/Application Support/PropulseML"
        payload = {
            "Label": "org.propulse.wspr-research-coverage",
            "ProgramArguments": [
                "/native/python",
                "/repo/analyze_wspr_shadow_coverage.py",
                "--profile",
                "m5",
                "--progress",
                str(runtime_root / "live_wspr_shadow_progress.json"),
                "--query-chunk-hours",
                "720",
                "--output",
                str(runtime_root / "live_wspr_shadow_coverage_drift.json"),
            ],
            "StartCalendarInterval": [
                {"Hour": 6, "Minute": 45},
                {"Hour": 18, "Minute": 45},
            ],
            "RunAtLoad": True,
            "Umask": 0o077,
            "StandardOutPath": str(Path.home() / "Library/Logs/out.log"),
            "StandardErrorPath": str(Path.home() / "Library/Logs/err.log"),
        }

        gates = coverage_launchd_gates(payload, runtime_root=runtime_root)

        self.assertFalse(gates["coverage_runtime_and_query_bound_exact"])

    def test_watchdog_requires_the_owner_only_remote_environment(self) -> None:
        runtime_root = (
            Path.home() / "Library/Application Support/PropulseML"
        )
        with tempfile.TemporaryDirectory() as temporary:
            remote_env = Path(temporary) / "remote.env"
            remote_env.write_text("configured=true\n", encoding="utf-8")
            remote_env.chmod(0o600)
            payload = {
                "Label": "org.propulse.wspr-research-health",
                "ProgramArguments": [
                    "/native/python",
                    "/repo/check_m5_wspr_research_health.py",
                    "--runtime-root",
                    str(runtime_root),
                    "--alert-output",
                    str(runtime_root / "live_wspr_alert.json"),
                    "--stale-seconds",
                    "7200",
                    "--max-runtime-bytes",
                    str(2 * 1024**3),
                    "--notify-local",
                    "--remote-env-file",
                    str(remote_env),
                ],
                "StartCalendarInterval": [{"Minute": 0}, {"Minute": 30}],
                "RunAtLoad": True,
                "Umask": 0o077,
                "StandardOutPath": str(Path.home() / "Library/Logs/out.log"),
                "StandardErrorPath": str(Path.home() / "Library/Logs/err.log"),
            }

            gates = health_launchd_gates(
                payload,
                runtime_root=runtime_root,
                remote_env=remote_env,
            )

            self.assertTrue(all(gates.values()))
            remote_env.chmod(0o644)
            gates = health_launchd_gates(
                payload,
                runtime_root=runtime_root,
                remote_env=remote_env,
            )
            self.assertFalse(gates["watchdog_thresholds_and_runtime_exact"])


if __name__ == "__main__":
    unittest.main()
