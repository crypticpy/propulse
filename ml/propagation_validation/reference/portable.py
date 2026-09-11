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
import hashlib
import json
import math
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
        Case, ReferenceBuild, case_inputs, input_digest, parse_report,
        render_input,
    )
else:
    from .cases import GOLDEN_CASES
    from .runner import (
        DEFAULT_BUILD_DIR, HERE, JOIN_KEYS, REPORT_PASSES, SOURCE_DIRNAME,
        Case, ReferenceBuild, case_inputs, input_digest, parse_report,
        render_input,
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


def _rss_probe() -> tuple[list[str], str, int] | None:
    """(prefix, regex, divisor) for a peak-RSS-capable `time`, or None.

    BSD/macOS `/usr/bin/time -l` prints bytes as `N  maximum resident set
    size`; GNU time `-v` prints KiB as `Maximum resident set size (kbytes): N`.
    A shell builtin `time` measures nothing, so only the binary counts.
    """
    binary = shutil.which("time", path="/usr/bin")
    if binary is None:
        return None
    for flag, pattern, divisor in (
        ("-l", r"(\d+)\s+maximum resident set size", 1024),
        ("-v", r"Maximum resident set size \(kbytes\):\s*(\d+)", 1),
    ):
        try:
            probe = subprocess.run(
                [binary, flag, "true"], capture_output=True, text=True, timeout=10
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if probe.returncode == 0 and re.search(pattern, probe.stderr):
            return [binary, flag], pattern, divisor
    return None


LIBRARY_PATH_KEYS = ("DYLD_LIBRARY_PATH", "LD_LIBRARY_PATH")


def peak_rss_kb(command: list[str], env: dict[str, str] | None = None) -> int | None:
    """Peak RSS in KiB via BSD `time -l` or GNU `time -v`; None where neither exists.

    A probe that fails to launch (for example the native executable without
    its library search path) must not be published as a measurement, so a
    nonzero exit from the measured command is an error rather than None.
    """
    probe = _rss_probe()
    if probe is None:
        return None
    prefix, pattern, divisor = probe
    # macOS SIP strips DYLD_* from the environment of protected binaries such
    # as /usr/bin/time, so a library search path handed to the wrapper never
    # reaches the measured child; re-assert it through `env`, whose explicit
    # assignments are applied when it execs the (unprotected) executable.
    library_paths = [
        f"{key}={env[key]}"
        for key in LIBRARY_PATH_KEYS
        if env is not None and key in env
    ]
    if library_paths:
        command = ["env", *library_paths, *command]
    completed = subprocess.run(
        [*prefix, *command], capture_output=True, text=True, env=env
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"RSS probe exited {completed.returncode}: {' '.join(command)}\n"
            f"{completed.stderr.strip()[-400:]}"
        )
    match = re.search(pattern, completed.stderr)
    if not match:
        return None
    return int(match.group(1)) // divisor


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


def parity_deltas(
    golden_cases: list[dict[str, Any]], wasm_outputs: dict[str, dict[str, Any]]
) -> tuple[dict[str, float], list[str]]:
    """Per-column maximum |golden - ported| and the labels that differ.

    A non-finite value on either side is an error, never a delta: NaN would
    otherwise fall out of ``max(0.0, nan)`` as 0.0 and read as exact parity.
    """
    diffs: dict[str, float] = {}
    mismatched_labels: list[str] = []
    for entry in golden_cases:
        case_id = entry["case_id"]
        reference = entry["outputs"]
        ported = wasm_outputs[case_id]
        if set(reference) != set(ported):
            raise PortableError(f"{case_id}: column sets differ")
        for key, value in reference.items():
            other = ported[key]
            if isinstance(value, str) or isinstance(other, str):
                if value != other:
                    mismatched_labels.append(f"{case_id}.{key}")
                continue
            reference_number = float(value)
            ported_number = float(other)
            if not (math.isfinite(reference_number) and math.isfinite(ported_number)):
                raise PortableError(
                    f"{case_id}.{key}: non-finite value in parity comparison "
                    f"(golden={value!r}, wasm={other!r})"
                )
            delta = abs(reference_number - ported_number)
            diffs[key] = max(diffs.get(key, 0.0), delta)
    return diffs, mismatched_labels


def golden_digest(golden: dict[str, Any]) -> str:
    """Identity of the golden the proof was compared against: its revision,
    reference commit and every case's inputs and outputs, canonically
    serialised so formatting cannot change it but any regenerated number
    does. The proof carries it and the tests check it against the committed
    golden, so a golden regenerated without --portable cannot keep a stale
    PASS (Codex round 9, PR #1090)."""
    identity = {
        "revision": golden.get("revision"),
        "reference_commit": golden.get("reference_commit"),
        "cases": golden["cases"],
    }
    canonical = json.dumps(identity, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def golden_case(entry: dict[str, Any]) -> Case:
    """The case a golden entry actually records. It is rebuilt from the
    entry's stored inputs, checked against the stored input digest, and
    checked against the frozen definition of the same id, so an edited input
    can neither run the source-defined case in its place nor publish a PASS
    bound to inputs that were never executed (Codex round 11, PR #1090)."""
    case_id = entry["case_id"]
    try:
        case = Case(**entry["inputs"])
    except TypeError as exc:
        raise PortableError(f"{case_id}: golden inputs are not a Case: {exc}") from exc
    if input_digest(case) != entry.get("input_sha256"):
        raise PortableError(f"{case_id}: golden inputs do not match input_sha256")
    frozen = {c.case_id: c for c in GOLDEN_CASES}.get(case_id)
    if frozen is None:
        raise PortableError(f"{case_id}: not in the frozen case set")
    if case_inputs(frozen) != entry["inputs"]:
        raise PortableError(f"{case_id}: golden inputs differ from the frozen case")
    return case


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
    cases_by_id = {entry["case_id"]: golden_case(entry) for entry in golden["cases"]}

    started = time.monotonic()
    wasm_outputs: dict[str, dict[str, Any]] = {}
    for entry in golden["cases"]:
        case = cases_by_id[entry["case_id"]]
        wasm_outputs[case.case_id] = run_wasm_case(
            module, case, native.data_path, workdir / case.case_id
        )
    batch_seconds = time.monotonic() - started

    # The native batch is timed on this host too, so the runtime block never
    # mixes this machine's Wasm timings with another machine's native figure
    # from the golden file (Codex round 5, PR #1090).
    native_started = time.monotonic()
    for entry in golden["cases"]:
        case = cases_by_id[entry["case_id"]]
        native.run_case(case, workdir / "native" / case.case_id)
    native_batch_seconds = time.monotonic() - native_started

    diffs, mismatched_labels = parity_deltas(golden["cases"], wasm_outputs)

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
        "golden": {
            "revision": golden.get("revision"),
            "reference_commit": golden.get("reference_commit"),
            "digest": golden_digest(golden),
        },
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
            "batch_seconds_native": round(native_batch_seconds, 4),
            "batch_seconds_native_at_golden_generation": {
                "seconds": golden.get("native_batch_seconds"),
                "generated_on": golden.get("generated_on"),
            },
            "peak_rss_kb_wasm": peak_rss_kb(node_command),
            "peak_rss_kb_native": peak_rss_kb(native_command, native.environment()),
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
