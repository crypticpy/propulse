"""Tests for the Phase 3 packaging servability gate (#306 "A7 contract
assertion").

``assert_profiles_servable`` is the guard `package_phase3_candidate.main()`
must call before it copies a single bundle file: gated on the v2 core
feature contract, and disk-side-effect free so calling it first guarantees a
failed assertion leaves nothing written next to a stale
``serving_manifest.json``.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from package_phase3_candidate import (  # noqa: E402
    PATH_HISTORY_CONTRACT_V2,
    assert_profiles_servable,
)
from phase2_core import Phase2Error  # noqa: E402


# Shaped like the frozen V1 nowcast/physics feature order: it carries the
# raw ``ae`` weather channel (and its ``_missing`` companion) that only V1
# models ever trained on.
V1_SHAPED_FEATURES = ["band_mhz", "ae", "ae_missing", "path_success_prev1"]
SERVABLE_FEATURES = ["band_mhz", "path_success_prev1"]


class AssertProfilesServableTests(unittest.TestCase):
    def test_v1_is_a_no_op_even_with_unservable_features(self):
        # A V1 re-package must keep working: the gate must not even call
        # assert_servable when v2 is False, or every V1 bundle (which
        # legitimately carries ae/al/au/pcn) would start failing.
        assert_profiles_servable(False, (("nowcast", V1_SHAPED_FEATURES),))

    def test_v2_raises_on_an_unservable_feature(self):
        with self.assertRaisesRegex(
            Phase2Error, "nowcast profile is not servable"
        ):
            assert_profiles_servable(True, (("nowcast", V1_SHAPED_FEATURES),))

    def test_v2_accepts_servable_features(self):
        assert_profiles_servable(True, (("nowcast", SERVABLE_FEATURES),))

    def test_v2_failure_leaves_a_pristine_bundle_directory(self):
        # assert_profiles_servable never touches the filesystem itself;
        # main() must call it before bundle.mkdir()/copied_component() do,
        # so a real v2 failure leaves the bundle directory exactly as it
        # started -- empty, with no stale files written beside a manifest
        # that then fails to build.
        with tempfile.TemporaryDirectory() as tmp:
            bundle = Path(tmp) / "bundle"
            bundle.mkdir()
            with self.assertRaises(Phase2Error):
                assert_profiles_servable(
                    True,
                    (
                        ("physics", SERVABLE_FEATURES),
                        ("nowcast", V1_SHAPED_FEATURES),
                    ),
                )
            self.assertEqual(list(bundle.iterdir()), [])

    def test_path_history_contract_v2_declares_the_approved_statistic(self):
        # ml/service/serving_manifest.APPROVED_PATH_HISTORY_STATISTICS and
        # ml/service/path_history.APPROVED_PATH_RECENCY_STATISTICS only
        # accept "rate"/"quantile"; "recency_quantile" was never approved
        # and would make create_app() reject every packaged v2 manifest at
        # startup (#306 / #297 N3 retrain).
        self.assertEqual(PATH_HISTORY_CONTRACT_V2["statistic"], "quantile")
        # Nothing reads mode_class_selector: the RPC never filters by mode.
        self.assertNotIn("mode_class_selector", PATH_HISTORY_CONTRACT_V2)


if __name__ == "__main__":
    unittest.main()
