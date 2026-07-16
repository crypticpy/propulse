from __future__ import annotations

import unittest
from pathlib import Path

from install_m5_wspr_research_launchd import LABEL, launchd_payload


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


if __name__ == "__main__":
    unittest.main()
