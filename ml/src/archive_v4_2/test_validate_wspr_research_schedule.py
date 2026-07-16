from __future__ import annotations

import unittest
from pathlib import Path

from validate_wspr_research_schedule import has_identity_key, launchd_gates


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


if __name__ == "__main__":
    unittest.main()
