"""Portable-runtime proof: static Wasm build of the pinned reference core.

The pinned reference is a three-layer dynamic-loading program: ITURHFProp
dlopen()s libp533.so, which dlopen()s libp372.so. Wasm has neither dlopen nor
common symbols, so this module stages *patched copies* of the pinned sources
into the gitignored build directory (the clone itself is never modified) and
applies exactly three mechanical transforms:

1. `dlopen(...)`/`dlsym(hLib, "X")` become direct references to the statically
   linked symbols. This is the "P372 platform-loader replaced by a static
   path" the contract asks for.
2. The tentative (common) declarations of the `dll*` function pointers in the
   upstream headers become `extern`, with one generated definition unit,
   because `wasm-ld` rejects common symbols.
3. Five identical helpers (degrees/minutes/seconds/hrs/mns) defined in both
   P533 and ITURHFProp become `static` in the P533 copy. The upstream
   Makefiles hide this clash behind `-z muldefs`, which wasm-ld has no
   equivalent for.

Every transform is anchored and asserted: if upstream text ever differs, the
stage step fails rather than silently producing a different program.

    python3 -m ml.propagation_validation.reference.portable
"""

from __future__ import annotations

import argparse
import json
import platform
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from reference.cases import GOLDEN_CASES  # type: ignore
    from reference.runner import (  # type: ignore
        DEFAULT_BUILD_DIR, HERE, JOIN_KEYS, REPORT_PASSES, SOURCE_DIRNAME,
        ReferenceBuild, parse_report, render_input,
    )
else:
    from .cases import GOLDEN_CASES
    from .runner import (
        DEFAULT_BUILD_DIR, HERE, JOIN_KEYS, REPORT_PASSES, SOURCE_DIRNAME,
        ReferenceBuild, parse_report, render_input,
    )

PROOF_PATH = HERE / "portable-proof.json"

MODULE_SOURCES = {
    "P372": ("InitializeNoise", "Noise", "NoiseMemory"),
    "P533": (
        "Between7000kmand9000km", "ELayerScreeningFrequency", "Magfit",
        "MedianSkywaveFieldStrengthShort", "ReadIonParameters",
        "CalculateCPParameters", "Geometry", "MUFBasic", "P533",
        "MUFOperational", "ReadP1239", "CircuitReliability", "InitializePath",
        "MedianAvailableReceiverPower", "ReadType13", "InputDump",
        "MedianSkywaveFieldStrengthLong", "MUFVariability", "PathMemory",
        "ValidatePath",
    ),
    "ITURHFProp": (
        "DumpPathData", "ITURHFProp", "ReadInputConfiguration", "Report",
        "ValidateITURHFP", "prop06_globals",
    ),
}
SOURCE_ROOTS = {
    "P372": "P372/Src/P372",
    "P533": "P533/Src/P533",
    "ITURHFProp": "ITURHFProp/Src/ITURHFProp",
}
EXTERN_HEADERS = (
    "P372/Noise.h", "P533/Noise.h", "ITURHFProp/Noise.h",
    "ITURHFProp/ITURHFProp.h",
)
SHARED_HELPERS = ("degrees", "minutes", "seconds", "hrs", "mns")
LINUX_BLOCK = re.compile(
    r"(#elif\s+(?:defined\(__linux__\)\s*\|\|\s*defined\(__APPLE__\)"
    r"|__linux__\s*\|\|\s*__APPLE__)\s*\n)(.*?)(^#endif)",
    re.S | re.M,
)
DLOPEN = re.compile(r'dlopen\("[^"]*",\s*RTLD_NOW\)')
DLSYM = re.compile(r'dlsym\(\s*\(?[A-Za-z_]*\)?hLib,\s*"(\w+)"\)')

# One month of coefficients is everything a single-month circuit needs.
MONTH_ASSETS = ("ionos{month:02d}.bin", "COEFF{month:02d}W.txt")
SHARED_ASSETS = ("P1239-3 Decile Factors.txt",)

CFLAGS = ["-D__linux__=1", "-std=gnu99", "-O2"]
LDFLAGS = [
    "-O2", "-sNODERAWFS=1", "-sALLOW_MEMORY_GROWTH=1", "-sEXIT_RUNTIME=1",
    "-sENVIRONMENT=node",
    # The upstream main() puts several KB of structs and 256-byte path
    # buffers on the stack; emscripten's 64 KB default traps immediately.
    "-sSTACK_SIZE=16MB", "-sINITIAL_MEMORY=64MB",
]


class PortableError(RuntimeError):
    pass


def _extern_block(text: str, path: str, must_contain: str | None = None) -> str:
    match = LINUX_BLOCK.search(text)
    if not match:
        raise PortableError(f"{path}: no POSIX branch found to patch")
    if must_contain and must_contain not in match.group(2):
        raise PortableError(f"{path}: unexpected POSIX branch contents")
    patched = []
    for line in match.group(2).splitlines(True):
        stripped = line.strip()
        if stripped and not stripped.startswith(("#", "//")) and stripped.endswith(";"):
            patched.append("\textern " + stripped + "\n")
        else:
            patched.append(line)
    return text[: match.start(2)] + "".join(patched) + text[match.end(2) :]


def _declarations(text: str) -> list[str]:
    match = LINUX_BLOCK.search(text)
    assert match is not None
    return [
        line.strip()
        for line in match.group(2).splitlines()
        if line.strip()
        and not line.strip().startswith(("#", "//"))
        and line.strip().endswith(";")
    ]


def stage(source: Path, staging: Path) -> dict[str, int]:
    """Copy the pinned sources and apply the three anchored transforms."""
    if staging.exists():
        shutil.rmtree(staging)
    counts = {"dlopen": 0, "dlsym": 0, "extern": 0, "static": 0}
    declarations: list[str] = []
    for module, root in SOURCE_ROOTS.items():
        target = staging / module
        target.mkdir(parents=True, exist_ok=True)
        for path in sorted((source / root).glob("*.[ch]")):
            text = path.read_bytes().decode("utf-8", "replace")
            if path.suffix == ".c":
                text, hits = DLOPEN.subn("(void *)1", text)
                counts["dlopen"] += hits
                text, hits = DLSYM.subn(r"(void *)\1", text)
                counts["dlsym"] += hits
            (target / path.name).write_text(text, encoding="utf-8")

    for relative in EXTERN_HEADERS:
        path = staging / relative
        text = path.read_text()
        declarations.extend(_declarations(text))
        path.write_text(_extern_block(text, relative))

    itur = staging / "ITURHFProp/ITURHFProp.c"
    text = itur.read_text()
    declarations.extend(_declarations(text))
    text = _extern_block(text, "ITURHFProp/ITURHFProp.c", "dllP533Version")
    anchor = '#include "ITURHFProp.h"'
    if anchor not in text:
        raise PortableError("ITURHFProp.c: include anchor missing")
    text = text.replace(
        anchor,
        anchor + "\n\n// PROP-06 static-link shim: defined in P533, absent from"
        " P533.h\nextern char const * P533CompileTime(void);\n",
        1,
    )
    itur.write_text(text)

    unique: list[str] = []
    seen_hlib = False
    for declaration in declarations:
        if "hLib;" in declaration:
            if seen_hlib:
                continue
            seen_hlib = True
            declaration = "void * hLib;"
        if declaration not in unique:
            unique.append(declaration)
    counts["extern"] = len(unique)
    (staging / "ITURHFProp/prop06_globals.c").write_text(
        "// PROP-06 static-link shim: the single definition of the globals the\n"
        "// upstream headers declare tentatively (Wasm has no common symbols).\n"
        "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n"
        '#include <time.h>\n#include "Common.h"\n#include "P533.h"\n'
        '#include "ITURHFProp.h"\n\n' + "\n".join(sorted(unique)) + "\n",
        encoding="utf-8",
    )

    helpers = staging / "P533/MedianSkywaveFieldStrengthLong.c"
    text = helpers.read_text()
    for name in SHARED_HELPERS:
        text, hits = re.subn(
            rf"^int {name}\(double (coord|time)\)",
            rf"static int {name}(double \1)",
            text,
            flags=re.M,
        )
        if hits != 2:  # one prototype, one definition
            raise PortableError(
                f"MedianSkywaveFieldStrengthLong.c: expected 2 {name} sites, got {hits}"
            )
        counts["static"] += hits
    helpers.write_text(text)
    return counts


def compile_and_link(staging: Path, output: Path) -> tuple[list[str], float]:
    objects = staging / "obj"
    if objects.exists():
        shutil.rmtree(objects)
    objects.mkdir(parents=True)
    started = time.monotonic()
    for module, names in MODULE_SOURCES.items():
        include = staging / module
        for name in names:
            command = [
                "emcc", *CFLAGS, "-I", str(include), "-c",
                str(include / f"{name}.c"), "-o", str(objects / f"{module}_{name}.o"),
            ]
            completed = subprocess.run(command, capture_output=True, text=True)
            if completed.returncode:
                raise PortableError(f"emcc failed on {name}:\n{completed.stderr}")
    link = ["emcc", *LDFLAGS, *sorted(str(p) for p in objects.glob("*.o")),
            "-o", str(output)]
    completed = subprocess.run(link, capture_output=True, text=True)
    if completed.returncode:
        raise PortableError(f"wasm link failed:\n{completed.stderr}")
    return link, round(time.monotonic() - started, 3)


def _run_wasm(module: Path, input_path: Path, report_path: Path) -> None:
    completed = subprocess.run(
        ["node", str(module), "-s", "-c", str(input_path), str(report_path)],
        capture_output=True, text=True,
    )
    if completed.returncode:
        raise PortableError(
            f"wasm run failed ({completed.returncode}): "
            f"{completed.stdout[-400:]} {completed.stderr[-400:]}"
        )


def run_wasm_case(module: Path, case, data_path: Path, workdir: Path) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for name in sorted(REPORT_PASSES):
        directory = workdir / name
        directory.mkdir(parents=True, exist_ok=True)
        input_path = directory / f"{case.case_id}.in"
        report_path = directory / f"{case.case_id}.csv"
        input_path.write_text(
            render_input(case, data_path, directory, REPORT_PASSES[name]),
            encoding="utf-8",
        )
        _run_wasm(module, input_path, report_path)
        rows = parse_report(report_path)
        if len(rows) != 1:
            raise PortableError(f"{case.case_id}: wasm produced {len(rows)} rows")
        for key in JOIN_KEYS:
            if key in merged and key in rows[0] and merged[key] != rows[0][key]:
                raise PortableError(f"{case.case_id}: wasm pass disagreement on {key}")
        merged.update(rows[0])
    return merged


def peak_rss_kb(command: list[str]) -> int | None:
    """macOS/BSD `/usr/bin/time -l` peak RSS in KiB; None where unavailable."""
    completed = subprocess.run(
        ["/usr/bin/time", "-l", *command], capture_output=True, text=True
    )
    match = re.search(r"(\d+)\s+maximum resident set size", completed.stderr)
    if not match:
        return None
    return int(match.group(1)) // 1024


def asset_budget(source: Path) -> dict[str, Any]:
    data = source / "P372/Data"
    shared = sum((data / name).stat().st_size for name in SHARED_ASSETS)
    months = {}
    for month in sorted({case.month for case in GOLDEN_CASES}):
        months[month] = sum(
            (data / template.format(month=month)).stat().st_size
            for template in MONTH_ASSETS
        )
    per_month = max(months.values())
    all_months = sum(
        sum((data / t.format(month=m)).stat().st_size for t in MONTH_ASSETS)
        for m in range(1, 13)
    )
    return {
        "shared_bytes": shared,
        "per_month_bytes": per_month,
        "single_month_total_bytes": shared + per_month,
        "twelve_month_total_bytes": shared + all_months,
        "months_used_by_golden": sorted(months),
        "files_per_month": [*MONTH_ASSETS, *SHARED_ASSETS],
        "note": (
            "Verified by running a golden case against a pruned data directory "
            "holding only these files. The .BIN noise coefficients are not "
            "read; the reference reads the .txt form."
        ),
    }


def prove(build_dir: Path, golden: dict[str, Any]) -> dict[str, Any]:
    source = build_dir / SOURCE_DIRNAME
    native = ReferenceBuild(source)
    native.require()
    staging = build_dir / "wasm"
    counts = stage(source, staging)
    module = staging / "iturhfprop.cjs"
    link, build_seconds = compile_and_link(staging, module)

    workdir = build_dir / "wasm-runs"
    if workdir.exists():
        shutil.rmtree(workdir)
    cases_by_id = {case.case_id: case for case in GOLDEN_CASES}

    started = time.monotonic()
    wasm_outputs: dict[str, dict[str, Any]] = {}
    for entry in golden["cases"]:
        case = cases_by_id[entry["case_id"]]
        wasm_outputs[case.case_id] = run_wasm_case(
            module, case, native.data_path, workdir / case.case_id
        )
    batch_seconds = time.monotonic() - started

    diffs: dict[str, float] = {}
    mismatched_labels: list[str] = []
    for entry in golden["cases"]:
        reference = entry["outputs"]
        ported = wasm_outputs[entry["case_id"]]
        if set(reference) != set(ported):
            raise PortableError(f"{entry['case_id']}: column sets differ")
        for key, value in reference.items():
            other = ported[key]
            if isinstance(value, str) or isinstance(other, str):
                if value != other:
                    mismatched_labels.append(f"{entry['case_id']}.{key}")
                continue
            delta = abs(float(value) - float(other))
            diffs[key] = max(diffs.get(key, 0.0), delta)

    single = golden["cases"][0]["case_id"]
    single_input = workdir / single / "circuit" / f"{single}.in"
    single_report = workdir / single / "circuit" / f"{single}.probe.csv"
    node_command = ["node", str(module), "-s", "-c", str(single_input),
                    str(single_report)]
    native_command = [str(native.executable), "-s", "-c",
                      str(single_input), str(single_report)]

    startup = []
    for _ in range(5):
        mark = time.monotonic()
        _run_wasm(module, single_input, single_report)
        startup.append(time.monotonic() - mark)

    wasm_bytes = (staging / "iturhfprop.wasm").stat().st_size
    glue_bytes = module.stat().st_size

    return {
        "schema_version": 1,
        "result": "PASS" if not mismatched_labels and max(diffs.values()) == 0.0
        else "MISMATCH",
        "claim": (
            "Implementation verification only: the ported build reproduces the "
            "native reference's own numbers. It says nothing about how well "
            "ITU-R P.533 matches observed propagation."
        ),
        "measured_on": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "node": subprocess.run(
                ["node", "--version"], capture_output=True, text=True
            ).stdout.strip(),
            "emcc": subprocess.run(
                ["emcc", "--version"], capture_output=True, text=True
            ).stdout.splitlines()[0].strip(),
        },
        "transforms": counts,
        "link_command": [
            # recorded machine-independently so the committed proof does not
            # bake in whoever's checkout produced it
            arg.replace(str(build_dir), "<BUILD>") for arg in link
        ],
        "build_seconds": build_seconds,
        "parity": {
            "cases": len(golden["cases"]),
            "max_abs_diff_by_output": {k: diffs[k] for k in sorted(diffs)},
            "max_abs_diff_overall": max(diffs.values()) if diffs else None,
            "label_mismatches": mismatched_labels,
        },
        "runtime": {
            "code_asset_bytes": {
                "wasm": wasm_bytes,
                "js_glue": glue_bytes,
                "total": wasm_bytes + glue_bytes,
            },
            "startup_seconds_min": round(min(startup), 4),
            "startup_seconds_median": round(sorted(startup)[len(startup) // 2], 4),
            "batch_seconds_wasm": round(batch_seconds, 4),
            "batch_cases": len(golden["cases"]),
            "batch_seconds_native": golden.get("native_batch_seconds"),
            "peak_rss_kb_wasm": peak_rss_kb(node_command),
            "peak_rss_kb_native": peak_rss_kb(native_command),
            "note": (
                "Each case is two process launches (two bounded report passes), "
                "so batch numbers include 2N process starts, not just solver "
                "time. A library-mode embedding would not pay that."
            ),
        },
        "data_assets": asset_budget(source),
        "blockers": [
            "NODERAWFS was used so the ported build reads the same coefficient "
            "files from disk. A browser build must instead ship or fetch them; "
            "that is a data problem, not a code problem.",
            "The proof covers the CLI wrapper (ITURHFProp) as well as the "
            "solver. A browser embedding should export P533() directly and "
            "skip the file-based input/report layer.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-dir", type=Path, default=DEFAULT_BUILD_DIR)
    parser.add_argument("--golden", type=Path, default=HERE / "golden-v1.json")
    parser.add_argument("--output", type=Path, default=PROOF_PATH)
    args = parser.parse_args(argv)
    golden = json.loads(args.golden.read_text())
    proof = prove(args.build_dir.resolve(), golden)
    args.output.write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.output}")
    print(f"result: {proof['result']}")
    print(f"max abs diff: {proof['parity']['max_abs_diff_overall']}")
    print(f"code asset: {proof['runtime']['code_asset_bytes']['total']} bytes")
    print(
        "data asset (one month): "
        f"{proof['data_assets']['single_month_total_bytes']} bytes"
    )
    return 0 if proof["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
