#!/usr/bin/env python3
"""Portable integration fixtures for the read-only color census CLI."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("color-system-census.py").resolve()


class ColorCensusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="color-census-fixture-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo with spaces"
        self.repo.mkdir()
        self.git("init", "-q")
        files = {
            "src/nested/Badge.tsx": 'const cls = active\n ? "hover:bg-caution-amber/20 text-su-text"\n : "bg-su-panel";\n',
            "src/styles/theme.css": ':root { --su-info: #123456; color: rgb(1, 2, 3); }\n',
            "src/control.tsx": '<input type="color" />\n',
            "src/nested/Badge.test.tsx": '"bg-alert-red/20"',
            "src/test/setup.ts": '"bg-alert-red/20"',
            "src/generated/colors.ts": '"bg-alert-red/20"',
            "src/colors.generated.ts": '"bg-alert-red/20"',
            "src/__snapshots__/badge.snap": '"bg-alert-red/20"',
            "src/node_modules/vendor.ts": '"bg-alert-red/20"',
            "src/lib/themes/contrast.test.ts": 'function compositeOnSurface() {} // snippet',
            ".design-sync/previews/Badge.tsx": '<span className="bg-alert-red/20" />',
            "public/logo.svg": '<svg fill="#abcdef" />',
            "public/image.bin": "not a source file",
            "unrelated/file.ts": '"bg-alert-red/20"',
        }
        for name, contents in files.items():
            self.write(name, contents)
        self.git("add", "-f", ".")
        self.git("-c", "user.name=Census Fixture", "-c", "user.email=census@example.invalid",
                 "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture")
        self.sha = self.git("rev-parse", "HEAD").strip()
        self.write("src/untracked.tsx", '"bg-alert-red/20"')
        self.write("src/nested/Badge.tsx", '"bg-alert-red/99"')

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args], text=True)

    def write(self, name, contents):
        target = self.repo / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(contents)

    def run_census(self, out, *args, cwd=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--out", str(out), *args],
            cwd=cwd or self.repo, text=True, capture_output=True,
        )

    def test_committed_sources_and_separate_preview_scope(self):
        out = self.root / "output with spaces"
        result = self.run_census(out)
        self.assertEqual(result.returncode, 0, result.stderr)
        inventory = json.loads((out / "inventory.json").read_text())
        summary, rows = inventory["summary"], inventory["occurrences"]
        self.assertEqual(summary["ref"], self.sha)
        self.assertEqual(summary["production_files_scanned"], 4)
        self.assertEqual(summary["design_preview_files_scanned"], 1)
        paths = {row["path"] for row in rows}
        self.assertEqual(paths, {"src/nested/Badge.tsx", "src/styles/theme.css", "src/control.tsx",
                                 "public/logo.svg", ".design-sync/previews/Badge.tsx"})
        self.assertTrue(all(row["status"] == "candidate-not-violation" for row in rows))
        self.assertNotIn("violations", summary)
        self.assertTrue(any(row["value"] == "bg-caution-amber/20" and row["line"] == 2 for row in rows))
        self.assertFalse(any("bg-alert-red/99" in row["value"] for row in rows))
        self.assertTrue(all(row["scope"] == "design-preview" for row in rows if row["path"].startswith(".design-sync/")))
        self.assertIn("public/image.bin", summary["non_source_assets"])
        tests = json.loads((out / "theme-tests.json").read_text())
        self.assertEqual(len(tests), 1)
        self.assertTrue(tests[0]["copied_compositor"])
        self.assertEqual(json.loads((out / "conflicts.json").read_text()), {})

    def test_explicit_repo_ref_conflicts_and_deterministic_output(self):
        prs = self.root / "prs.json"
        prs.write_text(json.dumps([{"number": 7, "title": "badge", "url": "https://example.invalid/7",
                                   "headRefOid": "abc", "files": [{"path": "src/nested/Badge.tsx"}]}]))
        outputs = [self.root / "one", self.root / "two"]
        for out in outputs:
            result = self.run_census(out, "--repo", str(self.repo), "--ref", self.sha, "--prs", str(prs), cwd=self.root)
            self.assertEqual(result.returncode, 0, result.stderr)
        for file in outputs[0].iterdir():
            self.assertEqual(file.read_bytes(), (outputs[1] / file.name).read_bytes())
        inventory = json.loads((outputs[0] / "inventory.json").read_text())
        badge = next(file for file in inventory["files"] if file["path"].endswith("Badge.tsx") and file["scope"] == "production")
        self.assertEqual(badge["open_prs"][0]["number"], 7)

    def test_ref_must_resolve_to_commit_and_out_is_required(self):
        blob = self.git("rev-parse", "HEAD:src/control.tsx").strip()
        for ref in ("--output=unexpected", "missing-ref", blob):
            out = self.root / "invalid"
            result = self.run_census(out, "--ref=" + ref)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(out.exists())
        result = subprocess.run([sys.executable, str(SCRIPT)], cwd=self.repo, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--out", result.stderr)

    def test_repository_without_scannable_roots(self):
        self.git("rm", "-rf", "--cached", ".")
        self.git("-c", "user.name=Census Fixture", "-c", "user.email=census@example.invalid",
                 "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "commit", "-qm", "empty tree")
        out = self.root / "empty"
        result = self.run_census(out)
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads((out / "inventory.json").read_text())["summary"]
        self.assertEqual(summary["candidate_occurrences"], 0)


if __name__ == "__main__":
    unittest.main()
