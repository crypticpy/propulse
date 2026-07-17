from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from run_m5_wspr_research_catchup import (
    completed_targets,
    continuous_hours,
    pending_targets,
)


LATEST = datetime(2026, 7, 16, 3, tzinfo=timezone.utc)


def receipt(path: Path, target: datetime, *, status: str = "complete") -> None:
    path.write_text(json.dumps({
        "status": status,
        "research_only": True,
        "target_hour": target.isoformat(),
    }), encoding="utf-8")


class WsprResearchCatchupTests(unittest.TestCase):
    def test_no_state_starts_only_latest_settled_hour(self) -> None:
        self.assertEqual(
            pending_targets([], latest=LATEST, maximum=24),
            [LATEST],
        )

    def test_pending_hours_are_contiguous_and_bounded(self) -> None:
        completed = [LATEST - timedelta(hours=3)]
        self.assertEqual(
            pending_targets(completed, latest=LATEST, maximum=3),
            [
                LATEST - timedelta(hours=2),
                LATEST - timedelta(hours=1),
                LATEST,
            ],
        )
        with self.assertRaisesRegex(RuntimeError, "safety bound"):
            pending_targets(completed, latest=LATEST, maximum=2)

    def test_receipts_ignore_failed_or_nonresearch_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            receipt(root / "one.json", LATEST - timedelta(hours=1))
            receipt(root / "two.json", LATEST, status="failed")
            (root / "three.json").write_text(json.dumps({
                "status": "complete",
                "research_only": False,
                "target_hour": LATEST.isoformat(),
            }), encoding="utf-8")
            self.assertEqual(
                completed_targets(root),
                [LATEST - timedelta(hours=1)],
            )

    def test_continuous_hours_stops_at_latest_gap(self) -> None:
        completed = [
            LATEST - timedelta(hours=4),
            LATEST - timedelta(hours=2),
            LATEST - timedelta(hours=1),
            LATEST,
        ]
        self.assertEqual(continuous_hours(completed), 3)


if __name__ == "__main__":
    unittest.main()
