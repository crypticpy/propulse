from __future__ import annotations

import unittest
from pathlib import Path

from install_m5_wspr_research_launchd import (
    COVERAGE_LABEL,
    HEALTH_LABEL,
    LABEL,
    MAX_RUNTIME_BYTES,
    coverage_launchd_payload,
    health_launchd_payload,
    launchd_payload,
)


class WsprLaunchdTests(unittest.TestCase):
    def test_payload_is_hourly_explicit_and_contains_no_secret(self) -> None:
        artifact_root = Path(
            "/Users/test/Library/Application Support/PropulseML"
        )
        payload = launchd_payload(
            python=Path("/repo/ml/.venv/bin/python"),
            artifact_root=artifact_root,
            stdout_path=Path("/Users/test/Library/Logs/Propulse/out.log"),
            stderr_path=Path("/Users/test/Library/Logs/Propulse/err.log"),
        )

        self.assertEqual(payload["Label"], LABEL)
        self.assertEqual(payload["StartCalendarInterval"], {"Minute": 15})
        self.assertTrue(payload["RunAtLoad"])
        self.assertEqual(payload["ProcessType"], "Interactive")
        self.assertEqual(payload["Umask"], 0o077)
        self.assertEqual(
            payload["ProgramArguments"][2:4],
            ["--artifact-root", str(artifact_root)],
        )
        self.assertEqual(
            payload["EnvironmentVariables"]["PROPULSE_ML_ARTIFACT_ROOT"],
            str(artifact_root),
        )
        self.assertEqual(
            payload["EnvironmentVariables"][
                "PROPULSE_WSPR_LIVE_RESEARCH_ENABLED"
            ],
            "true",
        )
        self.assertNotIn("SECRET", repr(payload).upper())

    def test_health_payload_runs_between_ingests_and_notifies_locally(self) -> None:
        artifact_root = Path.home() / "Library/Application Support/PropulseML"
        payload = health_launchd_payload(
            python=Path("/repo/ml/.venv/bin/python"),
            artifact_root=artifact_root,
            stdout_path=Path.home() / "Library/Logs/Propulse/health.out.log",
            stderr_path=Path.home() / "Library/Logs/Propulse/health.err.log",
        )

        self.assertEqual(payload["Label"], HEALTH_LABEL)
        self.assertEqual(
            payload["StartCalendarInterval"],
            [{"Minute": 0}, {"Minute": 30}],
        )
        self.assertTrue(payload["RunAtLoad"])
        self.assertEqual(payload["Umask"], 0o077)
        self.assertIn("--notify-local", payload["ProgramArguments"])
        self.assertIn("7200", payload["ProgramArguments"])
        self.assertIn(str(MAX_RUNTIME_BYTES), payload["ProgramArguments"])
        self.assertIn("--remote-env-file", payload["ProgramArguments"])
        self.assertIn(str(Path(__file__).resolve().parents[2] / ".env.local"), payload["ProgramArguments"])
        self.assertNotIn("EnvironmentVariables", payload)
        self.assertNotIn("SECRET", repr(payload).upper())

    def test_coverage_payload_is_twice_daily_bounded_and_secret_free(self) -> None:
        artifact_root = Path.home() / "Library/Application Support/PropulseML"
        payload = coverage_launchd_payload(
            python=Path("/repo/ml/.venv/bin/python"),
            artifact_root=artifact_root,
            stdout_path=Path.home() / "Library/Logs/Propulse/coverage.out.log",
            stderr_path=Path.home() / "Library/Logs/Propulse/coverage.err.log",
        )

        self.assertEqual(payload["Label"], COVERAGE_LABEL)
        self.assertEqual(
            payload["StartCalendarInterval"],
            [{"Hour": 6, "Minute": 45}, {"Hour": 18, "Minute": 45}],
        )
        self.assertTrue(payload["RunAtLoad"])
        self.assertEqual(payload["Umask"], 0o077)
        self.assertIn("--query-chunk-hours", payload["ProgramArguments"])
        self.assertIn("24", payload["ProgramArguments"])
        self.assertIn(
            str(artifact_root / "live_wspr_shadow_progress.json"),
            payload["ProgramArguments"],
        )
        self.assertIn(
            str(artifact_root / "live_wspr_shadow_coverage_drift.json"),
            payload["ProgramArguments"],
        )
        self.assertNotIn("EnvironmentVariables", payload)
        self.assertNotIn("SECRET", repr(payload).upper())


if __name__ == "__main__":
    unittest.main()
