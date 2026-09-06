"""B2 stays a like-for-like V3 baseline under the V2 feature contract.

The V2 datasets rename the original grid4 path lags to ``wspr_*`` and reuse the
``path_*`` names for the new recency-quantile statistic. The frozen V3 booster
must keep consuming the original semantics, so scoring aliases the ``wspr_*``
columns back onto the ``path_*`` names for B2 only.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from feature_contract import PATH_FEATURES, WSPR_PATH_FEATURES  # noqa: E402
from phase2_core import Phase2Error  # noqa: E402
from score_phase2_scale import b2_columns  # noqa: E402


def columns(*, with_wspr: bool) -> dict[str, np.ndarray]:
    values = {"distance_km": np.array([1.0, 2.0])}
    for index, name in enumerate(PATH_FEATURES):
        values[name] = np.array([float(index), float(index)])
    if with_wspr:
        for index, name in enumerate(WSPR_PATH_FEATURES):
            values[name] = np.array([100.0 + index, 100.0 + index])
    return values


class B2ColumnAliasingTest(unittest.TestCase):
    def test_v1_scoring_is_untouched(self) -> None:
        source = columns(with_wspr=False)
        self.assertIs(b2_columns(source), source)
        self.assertIs(b2_columns(source, False), source)

    def test_v2_scoring_aliases_wspr_onto_the_path_names(self) -> None:
        source = columns(with_wspr=True)
        aliased = b2_columns(source, True)
        for path_name, wspr_name in zip(PATH_FEATURES, WSPR_PATH_FEATURES):
            with self.subTest(feature=path_name):
                np.testing.assert_array_equal(
                    aliased[path_name], source[wspr_name]
                )

    def test_v2_aliasing_does_not_mutate_the_candidate_columns(self) -> None:
        source = columns(with_wspr=True)
        before = {name: value.copy() for name, value in source.items()}
        b2_columns(source, True)
        for name, value in before.items():
            with self.subTest(feature=name):
                np.testing.assert_array_equal(source[name], value)

    def test_v2_aliasing_keeps_non_path_columns(self) -> None:
        aliased = b2_columns(columns(with_wspr=True), True)
        self.assertIn("distance_km", aliased)

    def test_missing_wspr_columns_are_a_hard_error(self) -> None:
        with self.assertRaises(Phase2Error):
            b2_columns(columns(with_wspr=False), True)


if __name__ == "__main__":
    unittest.main()
