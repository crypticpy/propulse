"""The base manifest generator must carry sidecar blocks through --emit (#1102).

Lives in a ``test_*.py`` module so ``check:propagation-protocol`` discovers it;
``ionosphere_coefficients.py`` keeps its own in-module suites for the
reference-build gate, which need the ``python -m unittest <module>`` form.
"""

from __future__ import annotations

import unittest

try:
    from .ionosphere_coefficients import carry_over_sidecar_blocks
except ImportError:  # unittest discover runs from inside the package directory
    from ionosphere_coefficients import (  # type: ignore[no-redef]
        carry_over_sidecar_blocks,
    )


class SidecarManifestBlockTests(unittest.TestCase):
    """``--emit`` must not drop the blocks other generators own (#1102).

    The failure this guards is order-dependent: running the decile generator
    and then refreshing the CCIR asset used to leave ``manifest.decile_factors``
    undefined, and ``decileLoader.ts`` imports it at compile time.
    """

    def test_decile_factors_survive_a_base_regeneration(self):
        existing = {
            "schema_version": 1,
            "asset": {"sha256": "sha256:old"},
            "decile_factors": {"asset": {"sha256": "sha256:deciles"}},
        }
        fresh = {"schema_version": 1, "asset": {"sha256": "sha256:new"}}
        merged = carry_over_sidecar_blocks(existing, fresh)
        self.assertEqual(merged["asset"], {"sha256": "sha256:new"})
        self.assertEqual(
            merged["decile_factors"], {"asset": {"sha256": "sha256:deciles"}}
        )
        self.assertNotIn("decile_factors", fresh)

    def test_a_fresh_tree_writes_the_manifest_unchanged(self):
        fresh = {"schema_version": 1, "asset": {"sha256": "sha256:new"}}
        self.assertEqual(carry_over_sidecar_blocks(None, fresh), fresh)
        self.assertEqual(carry_over_sidecar_blocks({}, fresh), fresh)
        self.assertNotIn(
            "decile_factors",
            carry_over_sidecar_blocks({"asset": {}}, fresh),
        )
