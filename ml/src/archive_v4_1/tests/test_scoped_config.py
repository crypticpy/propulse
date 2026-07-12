from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

import protocol  # noqa: E402
from scoped_config import transform_config  # noqa: E402


class ScopedConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = protocol.load_json(protocol.DEFAULT_CONFIG)
        self.manifest = protocol.load_json(protocol.DEFAULT_MANIFEST)

    def test_development_config_contains_only_new_development_months(self) -> None:
        value = transform_config(
            self.config,
            self.manifest,
            "calibration-development",
        )
        self.assertEqual(value["months"], ["2024-02", "2024-05", "2024-08"])
        self.assertEqual(value["validation"]["months"], value["months"])
        self.assertEqual(value["train"]["months"], [])
        self.assertEqual(value["test"]["months"], [])

    def test_gate_config_cannot_exist_without_freezes(self) -> None:
        with self.assertRaises(protocol.ProtocolError):
            transform_config(self.config, self.manifest, "november-gate")

    def test_locked_config_cannot_exist_without_approval(self) -> None:
        with self.assertRaises(protocol.ProtocolError):
            transform_config(self.config, self.manifest, "locked-archive")
        approved = json.loads(json.dumps(self.manifest))
        approved["development_gates_passed"] = True
        value = transform_config(self.config, approved, "locked-archive")
        self.assertEqual(value["months"], ["2025-01", "2025-04", "2025-07", "2025-10"])
        self.assertEqual(value["test"]["months"], value["months"])


if __name__ == "__main__":
    unittest.main()
