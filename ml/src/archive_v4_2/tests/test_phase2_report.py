from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from generate_phase2_report import (  # noqa: E402
    ensure_open_scope,
    selection_by_name,
    variant,
)


class Phase2ReportTests(unittest.TestCase):
    def test_candidate_variant_matches_scoring_schema(self) -> None:
        self.assertEqual(variant("A4_recent_cycle"), "A4_recent_cycle:calibrated")
        self.assertEqual(variant("A6_recent_recency_blend"), "A6_recent_recency_blend")

    def test_closed_scope_is_rejected(self) -> None:
        ensure_open_scope(
            {"december_2024_read": False, "locked_2025_read": False}, "open"
        )
        with self.assertRaises(RuntimeError):
            ensure_open_scope(
                {"december_2024_read": True, "locked_2025_read": False},
                "closed",
            )

    def test_selection_lookup_is_stable(self) -> None:
        value = {"selection": {"rows": [{"candidate": "A4", "score": 1}]}}
        self.assertEqual(selection_by_name(value)["A4"]["score"], 1)


if __name__ == "__main__":
    unittest.main()
