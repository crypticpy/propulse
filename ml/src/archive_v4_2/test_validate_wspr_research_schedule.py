from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from validate_wspr_research_schedule import (
    coverage_launchd_gates,
    has_identity_key,
    health_launchd_gates,
    launchd_gates,
)


class WsprResearchScheduleValidationTests(unittest.TestCase):
    def test_identity_detection_is_recursive(self) -> None:
        self.assertFalse(has_identity_key({"records_by_band": {"20m": 10}}))
        self.assertTrue(has_identity_key({"nested": [{"receiver_grid4": "EM10"}]}))

    def test_launchd_contract_requires_internal_secret_free_runtime(self) -> None:
        runtime = Path.home() / "Library/Application Support/PropulseML"
        payload = {
            "Label": "org.propulse.wspr-research",
            "ProgramArguments": ["python", "runner.py", "--artifact-root", str(runtime)],
            "EnvironmentVariables": {
                "PROPULSE_WSPR_LIVE_RESEARCH_ENABLED": "true",
                "PROPULSE_ML_ARTIFACT_ROOT": str(runtime),
            },
            "StartCalendarInterval": {"Minute": 15},
            "RunAtLoad": True,
            "Umask": 0o077,
            "StandardOutPath": str(Path.home() / "Library/Logs/Propulse/out.log"),
            "StandardErrorPath": str(Path.home() / "Library/Logs/Propulse/err.log"),
        }
        self.assertTrue(all(launchd_gates(payload, runtime_root=runtime).values()))
        payload["EnvironmentVariables"]["SIGNING_SECRET"] = "bad"
        self.assertFalse(
            launchd_gates(payload, runtime_root=runtime)[
                "launchd_owner_only_and_secret_free"
            ]
        )

    def test_watchdog_contract_is_bounded_and_secret_free(self) -> None:
        runtime = Path.home() / "Library/Application Support/PropulseML"
        with tempfile.TemporaryDirectory() as temporary:
            remote_env = Path(temporary) / "remote.env"
            remote_env.write_text("configured=true\n", encoding="utf-8")
            remote_env.chmod(0o600)
            payload = {
                "Label": "org.propulse.wspr-research-health",
                "ProgramArguments": [
                    "python",
                    "health.py",
                    "--runtime-root",
                    str(runtime),
                    "--alert-output",
                    str(runtime / "live_wspr_alert.json"),
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
                "StandardOutPath": str(Path.home() / "Library/Logs/health.out"),
                "StandardErrorPath": str(Path.home() / "Library/Logs/health.err"),
            }
            self.assertTrue(
                all(
                    health_launchd_gates(
                        payload,
                        runtime_root=runtime,
                        remote_env=remote_env,
                    ).values()
                )
            )

    def test_coverage_contract_is_bounded_and_secret_free(self) -> None:
        runtime = Path.home() / "Library/Application Support/PropulseML"
        payload = {
            "Label": "org.propulse.wspr-research-coverage",
            "ProgramArguments": [
                "python",
                "coverage.py",
                "--profile",
                "m5",
                "--progress",
                str(runtime / "live_wspr_shadow_progress.json"),
                "--query-chunk-hours",
                "24",
                "--output",
                str(runtime / "live_wspr_shadow_coverage_drift.json"),
            ],
            "StartCalendarInterval": [
                {"Hour": 6, "Minute": 45},
                {"Hour": 18, "Minute": 45},
            ],
            "RunAtLoad": True,
            "Umask": 0o077,
            "StandardOutPath": str(Path.home() / "Library/Logs/coverage.out"),
            "StandardErrorPath": str(Path.home() / "Library/Logs/coverage.err"),
        }
        self.assertTrue(
            all(coverage_launchd_gates(payload, runtime_root=runtime).values())
        )


if __name__ == "__main__":
    unittest.main()
