"""Integrity checks for the pinned ITU-R HF reference manifests and goldens.

These tests never re-run the reference and never need the clone. They check
that the committed manifest is pinned and hashed, that the golden file is
internally consistent with the frozen case set, and that the normalisation
conventions the golden file claims actually hold in its own numbers. The one
test that needs the native build skips with an explicit message when the
gitignored build directory is absent.
"""

import json
import math
import re
import unittest
from pathlib import Path

from reference.cases import GOLDEN_CASES, GOLDEN_REVISION
from reference.runner import COMMIT, REPOSITORY, TAG, ReferenceBuild, input_digest

REFERENCE_DIR = Path(__file__).resolve().parent / "reference"
MANIFEST = REFERENCE_DIR / "manifest.json"
GOLDEN = REFERENCE_DIR / "golden-v1.json"
PROOF = REFERENCE_DIR / "portable-proof.json"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
GOLDEN_BUDGET_BYTES = 200_000


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.manifest = load(MANIFEST)

    def test_source_is_pinned_to_the_contract_commit(self):
        source = self.manifest["source"]
        self.assertEqual(source["commit"], COMMIT)
        self.assertEqual(source["tag"], TAG)
        self.assertEqual(source["repository"], REPOSITORY)
        self.assertFalse(source["vendored"])

    def test_every_coefficient_file_is_hashed_and_sized(self):
        files = self.manifest["data"]["coefficient_files"]
        self.assertGreaterEqual(len(files), 12, "one noise coefficient set per month")
        paths = set()
        for entry in files:
            with self.subTest(path=entry["path"]):
                self.assertRegex(entry["sha256"], SHA256)
                self.assertGreater(entry["bytes"], 0)
                self.assertNotIn(entry["path"], paths)
                paths.add(entry["path"])
        self.assertEqual(
            self.manifest["data"]["coefficient_total_bytes"],
            sum(entry["bytes"] for entry in files),
        )

    def test_rolled_up_data_trees_are_hashed(self):
        rollups = self.manifest["data"]["other_data_trees"]
        self.assertTrue(rollups)
        for entry in rollups:
            with self.subTest(path=entry["path"]):
                self.assertRegex(entry["tree_sha256"], SHA256)
                self.assertGreater(entry["file_count"], 0)
                self.assertGreater(entry["bytes"], 0)

    def test_build_artifacts_are_hashed(self):
        artifacts = self.manifest["build"]["artifacts"]
        self.assertEqual(len(artifacts), 3, "executable plus two libraries")
        for entry in artifacts:
            with self.subTest(path=entry["path"]):
                self.assertRegex(entry["sha256"], SHA256)
                self.assertGreater(entry["bytes"], 0)

    def test_toolchain_is_recorded(self):
        toolchain = self.manifest["toolchain"]
        for key in ("platform", "machine", "python", "cc", "make", "git"):
            self.assertTrue(toolchain.get(key), key)

    def test_rights_statement_is_recorded_verbatim(self):
        rights = self.manifest["rights"]
        # The upstream repository ships no LICENSE file; recording None here is
        # a fact about the source, not an omission.
        self.assertIsNone(rights["licence_file"])
        self.assertTrue(rights["licence_text_location"].endswith(".c"))
        self.assertIn("free from any copyright assertions", rights["statement"])
        self.assertIn("NO WARRANTIES", rights["statement"])
        self.assertIn("not committed", rights["redistribution"].lower())

    def test_version_records_both_tag_and_self_report(self):
        version = self.manifest["version"]
        self.assertIn("P533 Version", version["self_reported"])
        self.assertIn("14.2", version["note"])


class GoldenTests(unittest.TestCase):
    def setUp(self):
        self.golden = load(GOLDEN)
        self.cases = self.golden["cases"]

    def test_file_stays_within_its_size_budget(self):
        self.assertLess(GOLDEN.stat().st_size, GOLDEN_BUDGET_BYTES)

    def test_header_is_pinned_to_the_same_commit(self):
        self.assertEqual(self.golden["reference_commit"], COMMIT)
        self.assertEqual(self.golden["revision"], GOLDEN_REVISION)
        self.assertEqual(self.golden["schema_version"], 1)

    def test_case_set_matches_the_frozen_definitions(self):
        self.assertEqual(self.golden["case_count"], len(self.cases))
        self.assertGreaterEqual(len(self.cases), 20)
        self.assertEqual(
            [entry["case_id"] for entry in self.cases],
            [case.case_id for case in GOLDEN_CASES],
        )
        for entry, case in zip(self.cases, GOLDEN_CASES):
            with self.subTest(case=case.case_id):
                self.assertEqual(entry["inputs"]["frequency_mhz"], case.frequency_mhz)
                self.assertEqual(entry["inputs"]["month"], case.month)
                self.assertEqual(entry["inputs"]["hour_utc"], case.hour_utc)
                self.assertEqual(entry["input_sha256"], input_digest(case))

    def test_no_output_is_nan_or_infinite(self):
        for entry in self.cases:
            for key, value in entry["outputs"].items():
                with self.subTest(case=entry["case_id"], key=key):
                    if isinstance(value, str):
                        self.assertTrue(value)
                        continue
                    self.assertFalse(math.isnan(value))
                    self.assertFalse(math.isinf(value))

    def test_every_output_column_is_documented(self):
        documented = set(self.golden["output_fields"])
        for entry in self.cases:
            with self.subTest(case=entry["case_id"]):
                self.assertEqual(set(entry["outputs"]) - documented, set())

    def test_conventions_cover_the_ambiguous_quantities(self):
        conventions = self.golden["conventions"]
        for key in (
            "bandwidth", "noise", "power", "snr", "field_strength", "antennas",
            "time", "reliability", "modes", "domain",
        ):
            self.assertIn(key, conventions)
            self.assertGreater(len(conventions[key]), 40, key)
        self.assertIn("not VOACAP", conventions["domain"])
        self.assertIn("2 MHz", conventions["domain"])

    def test_reported_month_and_hour_round_trip_the_as_issued_inputs(self):
        for entry in self.cases:
            with self.subTest(case=entry["case_id"]):
                self.assertEqual(entry["outputs"]["month"], entry["inputs"]["month"])
                self.assertEqual(entry["outputs"]["hour"], entry["inputs"]["hour_utc"])
                self.assertAlmostEqual(
                    entry["outputs"]["frequency"],
                    entry["inputs"]["frequency_mhz"],
                    places=2,
                )

    def test_analog_snr_matches_the_documented_noise_normalisation(self):
        """SNR = PR - (power-sum of FaA/FaM/FaG - 204 + 10log10(BW)).

        This is the identity CircuitReliability.c line 166 implements. It is
        the check that stops a consumer from reconstructing SNR out of FamT,
        which is a different (worse-case decile) quantity.
        """
        checked = 0
        for entry in self.cases:
            if entry["inputs"]["modulation"] != "ANALOG":
                continue
            outputs = entry["outputs"]
            power_sum = 10.0 * math.log10(
                sum(10.0 ** (outputs[key] / 10.0) for key in ("FaA", "FaM", "FaG"))
            )
            noise = power_sum - 204.0 + 10.0 * math.log10(
                entry["inputs"]["bandwidth_hz"]
            )
            with self.subTest(case=entry["case_id"]):
                self.assertAlmostEqual(
                    outputs["SNR"], outputs["PR"] - noise, delta=0.05
                )
            checked += 1
        self.assertGreaterEqual(checked, 20)

    def test_famt_is_not_the_noise_used_for_snr(self):
        """At least one case must show the two differ, or the warning is stale."""
        worst = 0.0
        for entry in self.cases:
            outputs = entry["outputs"]
            power_sum = 10.0 * math.log10(
                sum(10.0 ** (outputs[key] / 10.0) for key in ("FaA", "FaM", "FaG"))
            )
            worst = max(worst, abs(power_sum - outputs["FamT"]))
        self.assertGreater(worst, 0.1)

    def test_digital_cases_carry_real_time_and_frequency_windows(self):
        digital = [e for e in self.cases if e["inputs"]["modulation"] == "DIGITAL"]
        self.assertTrue(digital)
        for entry in digital:
            with self.subTest(case=entry["case_id"]):
                self.assertGreater(entry["inputs"]["time_window_ms"], 0.0)
                self.assertGreater(entry["inputs"]["frequency_window_hz"], 0.0)

    def test_geometry_and_frequency_coverage(self):
        distances = [entry["outputs"]["distance"] for entry in self.cases]
        frequencies = [entry["inputs"]["frequency_mhz"] for entry in self.cases]
        latitudes = [abs(entry["inputs"]["tx_lat"]) for entry in self.cases]
        self.assertLess(min(distances), 500.0, "an NVIS-scale circuit")
        self.assertGreater(max(distances), 14_000.0, "a near-antipodal circuit")
        self.assertTrue(any(d > 7000.0 for d in distances), "a long path")
        self.assertGreaterEqual(min(frequencies), 3.0)
        self.assertLessEqual(max(frequencies), 30.0)
        self.assertGreater(max(latitudes), 55.0, "an auroral-latitude circuit")
        self.assertTrue(
            any(entry["inputs"]["rx_lat"] < -20.0 for entry in self.cases),
            "a southern-hemisphere circuit",
        )
        self.assertGreaterEqual(len({e["inputs"]["month"] for e in self.cases}), 4)
        self.assertGreaterEqual(len({e["inputs"]["hour_utc"] for e in self.cases}), 12)
        self.assertGreaterEqual(
            len({e["inputs"]["sunspot_number"] for e in self.cases}), 4
        )
        self.assertTrue(
            any(e["inputs"]["path_direction"] == "LONGPATH" for e in self.cases)
        )


class PortableProofTests(unittest.TestCase):
    def setUp(self):
        if not PROOF.exists():
            self.skipTest("portable-proof.json absent")
        self.proof = load(PROOF)

    def test_proof_records_exact_parity(self):
        self.assertEqual(self.proof["result"], "PASS")
        self.assertEqual(self.proof["parity"]["max_abs_diff_overall"], 0.0)
        self.assertEqual(self.proof["parity"]["label_mismatches"], [])
        self.assertEqual(self.proof["parity"]["cases"], load(GOLDEN)["case_count"])

    def test_proof_records_the_loader_removal(self):
        transforms = self.proof["transforms"]
        self.assertGreater(transforms["dlopen"], 0)
        self.assertGreater(transforms["dlsym"], 0)

    def test_proof_records_measurable_budgets(self):
        runtime = self.proof["runtime"]
        self.assertGreater(runtime["code_asset_bytes"]["total"], 0)
        self.assertGreater(runtime["startup_seconds_min"], 0.0)
        self.assertGreater(runtime["batch_seconds_wasm"], 0.0)
        self.assertGreater(
            self.proof["data_assets"]["single_month_total_bytes"], 1_000_000
        )

    def test_proof_states_the_verification_claim_not_an_accuracy_claim(self):
        self.assertIn("Implementation verification", self.proof["claim"])


class NativeBuildTests(unittest.TestCase):
    """Only these need the gitignored clone; everything above runs without it."""

    def setUp(self):
        self.build = ReferenceBuild.default()
        if not self.build.available():
            self.skipTest(
                "pinned ITU-R HF build absent; run scripts/propagation-reference-fetch "
                "to reproduce it (nothing in this repository ships it)"
            )

    def test_built_artifacts_match_the_manifest_hashes(self):
        import hashlib

        manifest = load(MANIFEST)
        source = self.build.source
        for entry in manifest["build"]["artifacts"]:
            path = source / entry["path"]
            with self.subTest(path=entry["path"]):
                self.assertTrue(path.exists())
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                self.assertEqual(digest, entry["sha256"])

    def test_self_reported_version_matches_the_manifest(self):
        self.assertEqual(
            self.build.version(), load(MANIFEST)["version"]["self_reported"]
        )


if __name__ == "__main__":
    unittest.main()


class CleanCheckoutTests(unittest.TestCase):
    """A modified tracked file in the clone must stop the build (Codex, PR #1090)."""

    def test_modified_tracked_file_is_rejected(self):
        import subprocess
        import tempfile
        from reference.runner import git_env, require_clean_checkout

        # This runs under the pre-push hook, where git exports GIT_DIR. With it
        # set, ``git init <path>`` ignores the path and re-initialises the
        # developer's repository (core.bare=true bricked every worktree on
        # 2026-09-11). Every git call here uses the scrubbed environment.
        env = git_env()
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            subprocess.run(["git", "init", "-q", str(repo)], check=True, env=env)
            (repo / "COEFF.txt").write_text("1 2 3\n")
            subprocess.run(["git", "-C", str(repo), "add", "COEFF.txt"], check=True, env=env)
            subprocess.run(
                ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t",
                 "commit", "-q", "-m", "pin"], check=True, env=env)
            require_clean_checkout(repo)  # clean: no error
            (repo / "build.o").write_bytes(b"\0")  # untracked build product is fine
            require_clean_checkout(repo)
            # Upstream commits its build outputs; rebuilding them is not a
            # provenance change.
            for rel in ("P533/Src/P533/P533.o", "P533/Linux/libp533.so",
                        "ITURHFProp/Linux/ITURHFProp"):
                (repo / rel).parent.mkdir(parents=True, exist_ok=True)
                (repo / rel).write_bytes(b"\0")
            subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True, env=env)
            subprocess.run(
                ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t",
                 "commit", "-q", "-m", "products"], check=True, env=env)
            for rel in ("P533/Src/P533/P533.o", "P533/Linux/libp533.so",
                        "ITURHFProp/Linux/ITURHFProp"):
                (repo / rel).write_bytes(b"\1")
            require_clean_checkout(repo)
            # A Makefile under a build directory is provenance, not a product.
            (repo / "P533/Linux/Makefile").write_text("all:\n")
            subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True, env=env)
            subprocess.run(
                ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t",
                 "commit", "-q", "-m", "makefile"], check=True, env=env)
            (repo / "P533/Linux/Makefile").write_text("all: ; touch x\n")
            with self.assertRaisesRegex(RuntimeError, "P533/Linux/Makefile"):
                require_clean_checkout(repo)
            subprocess.run(["git", "-C", str(repo), "checkout", "--", "P533/Linux/Makefile"],
                           check=True, env=env)
            require_clean_checkout(repo)
            (repo / "COEFF.txt").write_text("1 2 4\n")
            with self.assertRaisesRegex(RuntimeError, "COEFF.txt"):
                require_clean_checkout(repo)

    def test_require_revalidates_head_and_cleanliness_when_artifacts_exist(self):
        import subprocess
        import tempfile
        from reference.runner import git_env, require_pinned_checkout

        env = git_env()
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "ITU-R-HF"
            repo.mkdir()
            subprocess.run(["git", "init", "-q", str(repo)], check=True, env=env)
            for rel in ("ITURHFProp/Linux/ITURHFProp", "P533/Linux/libp533.so",
                        "P372/Linux/libp372.so", "P372/Data/keep"):
                (repo / rel).parent.mkdir(parents=True, exist_ok=True)
                (repo / rel).write_bytes(b"\0")
            subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True, env=env)
            subprocess.run(
                ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t",
                 "commit", "-q", "-m", "not the pin"], check=True, env=env)
            build = ReferenceBuild(repo)
            self.assertTrue(build.available())
            with self.assertRaisesRegex(RuntimeError, "pinned commit mismatch"):
                build.require()
            with self.assertRaisesRegex(RuntimeError, "pinned commit mismatch"):
                require_pinned_checkout(repo)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(RuntimeError, "not a git checkout"):
                require_pinned_checkout(Path(tmp))


class ParityDeltaTests(unittest.TestCase):
    def test_non_finite_values_are_an_error_not_exact_parity(self):
        from reference.portable import PortableError, parity_deltas

        golden = [{"case_id": "c1", "outputs": {"snr_db": 12.5, "mode": "1F2"}}]
        diffs, labels = parity_deltas(golden, {"c1": {"snr_db": 12.0, "mode": "1F2"}})
        self.assertEqual((diffs, labels), ({"snr_db": 0.5}, []))
        for bad in (math.nan, math.inf, -math.inf):
            with self.assertRaisesRegex(PortableError, "non-finite"):
                parity_deltas(golden, {"c1": {"snr_db": bad, "mode": "1F2"}})
        with self.assertRaisesRegex(PortableError, "non-finite"):
            parity_deltas(
                [{"case_id": "c1", "outputs": {"snr_db": math.nan, "mode": "1F2"}}],
                {"c1": {"snr_db": 12.0, "mode": "1F2"}},
            )
        _, labels = parity_deltas(golden, {"c1": {"snr_db": 12.5, "mode": "2F2"}})
        self.assertEqual(labels, ["c1.mode"])


class PeakRssTests(unittest.TestCase):
    def test_probe_is_a_measurement_or_none_never_a_crash(self):
        from reference.portable import _rss_probe, peak_rss_kb

        probe = _rss_probe()
        value = peak_rss_kb(["true"])
        if probe is None:
            self.assertIsNone(value)
        else:
            self.assertIsInstance(value, int)
            self.assertGreater(value, 0)
        with self.assertRaisesRegex(RuntimeError, "RSS probe exited"):
            if probe is None:
                raise RuntimeError("RSS probe exited (no time binary on this host)")
            peak_rss_kb(["false"])

    def test_library_search_path_reaches_the_measured_child(self):
        # macOS SIP strips DYLD_* across the protected time(1) wrapper; the
        # committed proof once recorded a 1.5 MB "native" figure that was the
        # executable failing to load libp533.so. The path must reach the child.
        import os
        import sys
        from reference.portable import _rss_probe, peak_rss_kb

        if _rss_probe() is None:
            self.skipTest("no time binary on this host")
        env = dict(os.environ, DYLD_LIBRARY_PATH="/nonexistent/lib",
                   LD_LIBRARY_PATH="/nonexistent/lib")
        child = [sys.executable, "-c",
                 "import os, sys; sys.exit(0 if os.environ.get('DYLD_LIBRARY_PATH')"
                 " == '/nonexistent/lib' and os.environ.get('LD_LIBRARY_PATH')"
                 " == '/nonexistent/lib' else 7)"]
        self.assertGreater(peak_rss_kb(child, env), 0)


class BuildReceiptTests(unittest.TestCase):
    def test_artifacts_must_match_the_checked_build_receipt(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "ITU-R-HF"
            for rel in ("ITURHFProp/Linux/ITURHFProp", "P533/Linux/libp533.so",
                        "P372/Linux/libp372.so", "P372/Data/keep"):
                (source / rel).parent.mkdir(parents=True, exist_ok=True)
                (source / rel).write_bytes(b"\0")
            build = ReferenceBuild(source)
            with self.assertRaisesRegex(RuntimeError, "no build receipt"):
                build.require_build_receipt()
            receipt = build.write_build_receipt()
            self.assertEqual(receipt.name, "build-receipt.json")
            self.assertEqual(receipt.parent, source.resolve().parent)
            build.require_build_receipt()  # fresh from the checked build
            (source / "P533/Linux/libp533.so").write_bytes(b"\1")
            with self.assertRaisesRegex(RuntimeError, "libp533.so does not match"):
                build.require_build_receipt()
            build.write_build_receipt()
            build.require_build_receipt()
            text = receipt.read_text(encoding="utf-8").replace(COMMIT, "0" * 40)
            receipt.write_text(text, encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "receipt is for commit"):
                build.require_build_receipt()
