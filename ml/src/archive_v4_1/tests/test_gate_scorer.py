from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from protocol import ProtocolError  # noqa: E402
from score_november_gate import ROOT, projection_columns, repository_input  # noqa: E402


class GateScorerTests(unittest.TestCase):
    def test_projection_deduplicates_feature_and_audit_columns(self) -> None:
        columns = projection_columns(
            ["dist_km", "solar_flux"],
            ("target_hour", "dist_km", "opportunities"),
        )
        self.assertEqual(
            columns,
            ["dist_km", "solar_flux", "target_hour", "opportunities"],
        )

    def test_relative_input_becomes_absolute_repository_path(self) -> None:
        value = repository_input(Path("ml/data/example.parquet"))
        self.assertEqual(value, ROOT / "ml/data/example.parquet")

    def test_external_target_is_rejected_before_streaming(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ProtocolError, "repository path"):
                repository_input(Path(directory) / "gate.parquet")


if __name__ == "__main__":
    unittest.main()
