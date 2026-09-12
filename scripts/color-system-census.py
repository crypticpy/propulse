#!/usr/bin/env python3
"""Inventory lexical color candidates in a commit, never accessibility violations.

Example: python3 scripts/color-system-census.py --out /tmp/color-census
Only tracked source at --ref is scanned; local edits are deliberately ignored.
"""

import argparse
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile

ROOTS = ("src", "public", ".design-sync", "tailwind.config.js", "index.html")
EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".svg", ".glsl", ".frag", ".vert", ".html"}
EXCLUDED = re.compile(
    r"(^|/)(?:test|tests|__tests__|__snapshots__|fixtures|generated|node_modules|dist)(/|$)"
    r"|\.(?:test|spec)\.|\.snap$|\.generated\."
)
LIMITS = [
    "Lexical candidates, not violations, independent elements, computed styles, or proof of accessibility.",
    "Detectors overlap intentionally, including a hex value inside an arbitrary utility.",
    "Full-line comments are omitted; inline and multiline comment fragments may remain.",
    "Dynamic/concatenated classes, shader vectors, API colors, and some named CSS colors may be missed.",
    "Token declarations include geometry and typography; control matches include references and defaults.",
    "Ownership uses path heuristics; data colors in feature components need domain review.",
    "Binary/non-source assets are listed without decoding; previews are separate from production.",
    "PR conflicts use only the optional supplied snapshot; refresh before editing.",
]

COLOR_PREFIX = (
    r"""(?:bg|text|border(?:-[trblxyse])?|divide|ring(?:-offset)?|outline|fill|stroke|from"""
    r"""|via|to|shadow|placeholder|decoration|caret|accent)"""
)
COLOR_VALUE = (
    r"""(?:su-[a-z][\w-]*|hc-[a-z][\w-]*|deep-space|nebula-blue|void-black|void|panel"""
    r"""|space-900|excellent|fair|poor|sunspot-blue|feedline-teal|caution-yellow|signal-green"""
    r"""|good|caution-amber|alert-red|cosmic-cyan|aurora-purple|plasma-orange|(?:red|orange"""
    r"""|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink"""
    r"""|rose|slate|gray|zinc|neutral|stone)-\d{2,3}|white|black|transparent|current|inherit"""
    r"""|\[(?:#[0-9A-Fa-f]+|(?:rgb|hsl|oklch|color|var)[^\]\n]*)\])"""
)

# A candidate may match several detectors. Keep the output deliberately lexical.
PATTERNS = {
    "color_utility": re.compile(
        r"(?<![\w-])" + COLOR_PREFIX + "-" + COLOR_VALUE
        + r"(?:/(?:\d+|\[[^\]\n]+\]))?"
    ),
    "hex_literal": re.compile(
        r"""(?<![\w])#(?:[\da-fA-F]{8}|[\da-fA-F]{6}|[\da-fA-F]{4}|[\da-fA-F]{3})(?![\w])"""
    ),
    "color_function": re.compile(
        r"""\b(?:rgba?|hsla?|oklch|oklab|color-mix|linear-gradient"""
        r"""|radial-gradient)\([^\n;]{0,180}"""
    ),
    "color_binding": re.compile(
        r"""\b(?:color|backgroundColor|background|borderColor|fillStyle|strokeStyle|fill"""
        r"""|stroke)\s*[:=]\s*[^,;\n]{1,120}"""
    ),
    "token_declaration": re.compile(
        r"""(?:["']?(--[\w-]+)["']?\s*:|setProperty\(\s*["'](--[\w-]+)["'])"""
    ),
    "named_color_value": re.compile(
        r"""\b(?:color|background(?:Color)?|borderColor|fill|stroke)\s*[:=]\s*["']?(?:white|black"""
        r"""|transparent|currentColor|inherit|red|orange|yellow|green|blue|purple|pink|cyan"""
        r"""|magenta)\b"""
    ),
    "tone_recipe": re.compile(
        r"""\bsu-(?:tone-[\w${}-]+|button--[\w${}-]+|badge|notice)\b"""
    ),
    "opacity_or_motion": re.compile(
        r"""\b(?:opacity-(?:\d+|\[[^\]\n]+\])|animate-pulse)\b"""
    ),
    "color_control_candidate": re.compile(
        r"""\b(?:type\s*=\s*["']color["']|ColorPicker|ColorField|PalettePicker"""
        r"""|set(?:[A-Za-z]*(?:Color|Colour|Accent|Saturation|Palette|Theme|Opacity)|HighViz)\w*"""
        r"""|(?:colorBlindMode|customPrimary|customSecondary|saturation|highViz|isHighViz"""
        r"""|spotColorMode|visualStyle|colorMode|colourMode|waterfallPalette|sdrSpectrumColor"""
        r"""|sdrSpectrumFillColor|sdrPassbandColor|heatmapColor|bucketColors))(?!\w)"""
    ),
}


def git(repo, *args):
    """Run Git without a shell and return stdout."""
    return subprocess.check_output(["git", "-C", str(repo), *args])


def resolve_commit(repo, ref):
    if ref.startswith("-"):
        raise ValueError("--ref must name a commit, not an option")
    return git(repo, "rev-parse", "--verify", "--end-of-options", ref + "^{commit}").decode().strip()


def read_sources(repo, sha):
    """Stream a restricted archive; never unpack or load binary assets into RAM."""
    available = set(git(repo, "ls-tree", "--name-only", sha).decode().splitlines())
    roots = [root for root in ROOTS if root in available]
    sources, excluded, assets, theme_tests = {}, [], [], []
    if not roots:
        return sources, excluded, assets, theme_tests
    with tempfile.TemporaryFile() as errors:
        command = ["git", "-C", str(repo), "archive", sha, "--", *roots]
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors) as process:
            with tarfile.open(fileobj=process.stdout, mode="r|*") as archive:
                for member in archive:
                    if not member.isfile():
                        continue
                    path = member.name
                    if EXCLUDED.search(path):
                        excluded.append(path)
                        if path.startswith("src/lib/themes/") and ".test." in path:
                            source = archive.extractfile(member).read().decode("utf8", errors="replace")
                            theme_tests.append({
                                "path": path,
                                "lines": len(source.splitlines()),
                                "copied_compositor": "function compositeOnSurface" in source,
                                "source_snippets": "snippet" in source,
                            })
                        continue
                    if Path(path).suffix not in EXTENSIONS:
                        assets.append(path)
                        continue
                    sources[path] = archive.extractfile(member).read().decode("utf8", errors="replace")
            if process.wait():
                errors.seek(0)
                raise ValueError(errors.read().decode("utf8", errors="replace"))
    return sources, sorted(excluded), sorted(assets), sorted(theme_tests, key=lambda item: item["path"])


def ownership(path, kind):
    if "hamclock" in path.lower() or "/wall/" in path:
        return "wall-independent", "wall namespace", "retain wall tokens and registered adapters"
    if path.startswith("src/lib/themes/"):
        return "station-theme", "src/lib/themes", "src/lib/themes"
    if path.startswith("src/components/station-ui/"):
        return "shared-ui", "station-ui", "lib/themes treatments and existing station-ui primitives"
    if kind == "color_control_candidate":
        return "appearance-controls", path, "lib/appearance definitions; retain feature persistence"
    if path.startswith("src/stores/"):
        return "persisted-appearance", path, "lib/appearance definitions and existing store"
    if path.startswith("src/styles/"):
        return "shared-style", path, "station styles or registered decorative palette"
    if path.startswith("public/"):
        return "static-asset", path, "asset owner; preserve intentional identity"
    if any(part in path for part in ("/lib/map/", "/lib/sdr/", "/lib/utils/spot", "/lib/widgets/heatmap", "/lib/data/rank")):
        return "domain-palette", path, "lib/colors/palettes with explicit domain context"
    if path.startswith("src/components/ui/"):
        return "legacy-shared-ui", path, "station-ui adapters and lib/themes treatments"
    if kind == "token_declaration":
        return "local-token-definition", path, "lib/themes or registered scoped namespace"
    if path in ("tailwind.config.js", "index.html"):
        return "startup-build-alias", path, "canonical tokens with checked fallbacks"
    return "feature-ui", path, "theme treatments for chrome; domain palette for encoded data"


def read_conflicts(path):
    if path is None:
        return {}
    conflicts = {}
    for pr in json.loads(path.read_text()):
        details = {key: pr.get(key) for key in ("number", "url", "title", "headRefOid")}
        for file in pr.get("files", []):
            conflicts.setdefault(file["path"], []).append(details)
    return {path: sorted(items, key=lambda item: item["number"]) for path, items in sorted(conflicts.items())}


def scan(sources, conflicts):
    occurrences, files = [], []
    for path, source in sorted(sources.items()):
        scope = "design-preview" if path.startswith(".design-sync/") else "production"
        hits = []
        for line_number, line in enumerate(source.splitlines(), 1):
            if re.match(r"^\s*(?://|/\*|\*|<!--)", line):
                continue
            for kind, pattern in PATTERNS.items():
                for match in pattern.finditer(line):
                    family, current, proposed = ownership(path, kind)
                    hits.append({
                        "path": path, "line": line_number, "column": match.start() + 1,
                        "scope": scope, "kind": kind, "value": match.group(), "family": family,
                        "current_owner": current, "proposed_authority": proposed,
                        "status": "candidate-not-violation", "source": line.strip()[:300],
                        "open_prs": [pr["number"] for pr in conflicts.get(path, [])],
                    })
        occurrences.extend(hits)
        if hits:
            files.append({
                "path": path, "scope": scope, "occurrences": len(hits),
                "kinds": dict(sorted(Counter(row["kind"] for row in hits).items())),
                "families": sorted({row["family"] for row in hits}),
                "open_prs": conflicts.get(path, []),
            })
    return occurrences, files


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def census(repo, ref, out, prs=None):
    sha = resolve_commit(repo, ref)
    sources, excluded, assets, tests = read_sources(repo, sha)
    conflicts = read_conflicts(prs)
    occurrences, files = scan(sources, conflicts)
    summary = {
        "ref": sha,
        "production_files_scanned": sum(not path.startswith(".design-sync/") for path in sources),
        "design_preview_files_scanned": sum(path.startswith(".design-sync/") for path in sources),
        "candidate_files": len(files), "candidate_occurrences": len(occurrences),
        "by_scope": dict(sorted(Counter(row["scope"] for row in occurrences).items())),
        "by_kind": dict(sorted(Counter(row["kind"] for row in occurrences).items())),
        "by_family": dict(sorted(Counter(row["family"] for row in occurrences).items())),
        "excluded_test_generated_paths": excluded, "non_source_assets": assets, "limits": LIMITS,
    }
    out.mkdir(parents=True, exist_ok=True)
    write_json(out / "inventory.json", {"summary": summary, "files": files, "occurrences": occurrences})
    write_json(out / "controls.json", [row for row in occurrences if row["kind"] == "color_control_candidate"])
    write_json(out / "conflicts.json", {path: items for path, items in conflicts.items() if path in sources or path.startswith("src/lib/themes/")})
    write_json(out / "theme-tests.json", tests)
    markdown = ["# Color candidate census", "", f"Pinned source: `{sha}`.", "",
                f"{len(occurrences)} overlapping candidates in {len(files)} files. **Not violation counts.**",
                "", "Production and design-preview records are separated by `scope` in inventory.json.",
                "", "## Detection limits", ""]
    markdown.extend("- " + limit for limit in LIMITS)
    markdown.extend(["", "## File ledger", "", "| File | Scope | Occurrences | Family | Open PRs |", "| --- | --- | ---: | --- | --- |"])
    for file in files:
        numbers = ", ".join("#" + str(pr["number"]) for pr in file["open_prs"])
        markdown.append(f"| `{file['path']}` | {file['scope']} | {file['occurrences']} | {', '.join(file['families'])} | {numbers} |")
    (out / "README.md").write_text("\n".join(markdown) + "\n")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="Git checkout (default: current directory)")
    parser.add_argument("--ref", default="HEAD", help="Commit or ref to scan (default: HEAD)")
    parser.add_argument("--out", required=True, type=Path, help="Directory for generated inventory files")
    parser.add_argument("--prs", type=Path, help="Optional cached PR JSON containing files, number, title, URL, headRefOid")
    args = parser.parse_args()
    try:
        summary = census(args.repo, args.ref, args.out, args.prs)
    except (ValueError, OSError, subprocess.CalledProcessError, tarfile.TarError) as error:
        parser.exit(1, f"color census: {error}\n")
    print(json.dumps({key: summary[key] for key in ("ref", "production_files_scanned", "design_preview_files_scanned", "candidate_occurrences", "by_scope")}, indent=2))


if __name__ == "__main__":
    main()
