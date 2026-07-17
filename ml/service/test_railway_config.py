from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class RailwayConfigTests(unittest.TestCase):
    def test_manifest_uses_supported_runtime_types(self):
        config = json.loads(
            (ROOT / "railway.json").read_text(encoding="utf-8")
        )

        self.assertEqual(config["build"]["builder"], "DOCKERFILE")
        self.assertEqual(
            config["build"]["dockerfilePath"],
            "ml/service/Dockerfile",
        )
        self.assertEqual(
            config["deploy"]["healthcheckPath"],
            "/v1/propagation/health",
        )
        self.assertIs(type(config["deploy"]["healthcheckTimeout"]), int)
        self.assertIs(type(config["deploy"]["overlapSeconds"]), int)
        self.assertIs(type(config["deploy"]["drainingSeconds"]), int)


if __name__ == "__main__":
    unittest.main()
