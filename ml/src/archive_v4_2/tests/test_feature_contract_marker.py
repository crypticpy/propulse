from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from feature_contract import (  # noqa: E402
    CORE_FEATURE_CONTRACT_V1,
    CORE_FEATURE_CONTRACT_V2,
    contract_marker,
)


class ContractMarkerTests(unittest.TestCase):
    def test_missing_marker_returns_none(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(contract_marker(Path(directory)))

    def test_reads_and_strips_the_stamped_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "_CONTRACT").write_text(
                f"{CORE_FEATURE_CONTRACT_V2}\n", encoding="ascii"
            )
            self.assertEqual(contract_marker(root), CORE_FEATURE_CONTRACT_V2)

    def test_a_v1_marker_reads_back_as_v1(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "_CONTRACT").write_text(
                f"{CORE_FEATURE_CONTRACT_V1}\n", encoding="ascii"
            )
            self.assertEqual(contract_marker(root), CORE_FEATURE_CONTRACT_V1)


if __name__ == "__main__":
    unittest.main()
