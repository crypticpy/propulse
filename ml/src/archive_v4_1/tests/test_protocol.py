from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

import protocol  # noqa: E402


class ProtocolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = protocol.load_json(protocol.DEFAULT_CONFIG)
        self.manifest = protocol.load_json(protocol.DEFAULT_MANIFEST)

    def test_development_scope_is_exact_and_excludes_gate(self) -> None:
        allowed = self.config["data_roles"]["new_calibration_sources"]
        self.assertEqual(
            protocol.authorize_scope(
                self.config,
                self.manifest,
                "calibration-development",
                allowed,
            ),
            allowed,
        )
        with self.assertRaises(protocol.ProtocolError):
            protocol.authorize_scope(
                self.config,
                self.manifest,
                "calibration-development",
                [*allowed, "2024-11"],
            )

    def test_reserved_month_is_always_denied(self) -> None:
        with self.assertRaisesRegex(protocol.ProtocolError, "reserved"):
            protocol.authorize_scope(
                self.config,
                self.manifest,
                "inventory-new-sources",
                ["2024-12"],
            )

    def test_gate_requires_all_freezes(self) -> None:
        blocked = json.loads(json.dumps(self.manifest))
        blocked["frozen_artifacts"].pop("candidate_freeze", None)
        blocked["frozen_artifacts"].pop("scorer_freeze", None)
        with self.assertRaisesRegex(protocol.ProtocolError, "candidate freeze"):
            protocol.authorize_scope(
                self.config,
                blocked,
                "november-gate",
                ["2024-11"],
            )
        ready = json.loads(json.dumps(self.manifest))
        ready["frozen_artifacts"] = {
            "candidate_freeze": {"sha256": "a" * 64},
            "b2_freeze": {"sha256": "b" * 64},
            "scorer_freeze": {"sha256": "c" * 64},
        }
        self.assertEqual(
            protocol.authorize_scope(
                self.config,
                ready,
                "november-gate",
                ["2024-11"],
            ),
            ["2024-11"],
        )

    def test_locked_archive_requires_development_approval(self) -> None:
        months = self.config["data_roles"]["locked_archive_test"]
        with self.assertRaisesRegex(protocol.ProtocolError, "development gates"):
            protocol.authorize_scope(
                self.config,
                self.manifest,
                "locked-archive",
                months,
            )
        approved = json.loads(json.dumps(self.manifest))
        approved["development_gates_passed"] = True
        self.assertEqual(
            protocol.authorize_scope(
                self.config,
                approved,
                "locked-archive",
                months,
            ),
            months,
        )

    def test_one_shot_marks_access_before_scoring_and_cannot_reopen(self) -> None:
        ready = json.loads(json.dumps(self.manifest))
        ready["frozen_artifacts"] = {
            "candidate_freeze": {"sha256": "a" * 64},
            "b2_freeze": {"sha256": "b" * 64},
            "scorer_freeze": {"sha256": "c" * 64},
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            protocol.atomic_write_json(path, ready)
            opened = protocol.begin_one_shot(
                path,
                "november-gate",
                ["2024-11"],
                "attempt-1",
            )
            self.assertTrue(opened["november_gate_opened"])
            self.assertTrue(opened["outcome_access"]["2024-11"])
            protocol.resume_one_shot(opened, "november-gate", "attempt-1")
            with self.assertRaises(protocol.ProtocolError):
                protocol.begin_one_shot(
                    path,
                    "november-gate",
                    ["2024-11"],
                    "attempt-2",
                )
            with self.assertRaises(protocol.ProtocolError):
                protocol.resume_one_shot(opened, "november-gate", "attempt-2")

    def test_candidate_state_requires_every_pre_gate_freeze(self) -> None:
        ready = json.loads(json.dumps(self.manifest))
        ready["protocol_state"] = "development_opened"
        required = {
            "b2_freeze",
            "development_data_audit_v2",
            "calibration_input_inventory",
            "calibration_predictions",
            "calibration_selection",
            "selected_calibrator",
            "candidate_environment",
            "split_manifest",
            "serving_candidate",
            "candidate_validation",
            "synthetic_report_validation",
            "b0_climatology",
            "candidate_freeze",
            "scorer_freeze",
        }
        ready["frozen_artifacts"] = {
            name: {"path": name, "bytes": 1, "sha256": name.ljust(64, "0")[:64]}
            for name in required
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            incomplete = json.loads(json.dumps(ready))
            del incomplete["frozen_artifacts"]["scorer_freeze"]
            protocol.atomic_write_json(path, incomplete)
            with self.assertRaisesRegex(protocol.ProtocolError, "incomplete"):
                protocol.mark_candidate_frozen(path)
            protocol.atomic_write_json(path, ready)
            frozen = protocol.mark_candidate_frozen(path)
            self.assertEqual(frozen["protocol_state"], "candidate_frozen")
            self.assertEqual(frozen["phase_status"]["phase_2"], "ready")
            events = len(frozen["protocol_events"])
            repeated = protocol.mark_candidate_frozen(path)
            self.assertEqual(len(repeated["protocol_events"]), events)


if __name__ == "__main__":
    unittest.main()
