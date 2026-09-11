"""Input rendering and report parsing for the pinned ITU-R HF reference.

This module drives the *official* ITURHFProp executable built from the pinned
commit. It never re-implements the recommendation and never substitutes a
Propulse model for a reference number.

Domain: HF skywave, 1.6-30 MHz as validated by the reference itself; the
Propulse golden set restricts itself further to 3-30 MHz (see README). Nothing
here supports frequencies below 2 MHz and nothing here is VOACAP.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

REPOSITORY = "https://github.com/ITU-R-Study-Group-3/ITU-R-HF.git"
TAG = "v14.3"
COMMIT = "cd172be56dc04b154e5d2fa91cbaa6ecf5284305"

HERE = Path(__file__).resolve().parent
DEFAULT_BUILD_DIR = HERE / ".build"
SOURCE_DIRNAME = "ITU-R-HF"

# ITURHFProp Report.c assembles every requested column into a fixed
# `char outstr[256]` buffer. Asking for too many RPT_ options at once
# overflows that buffer and aborts the process (SIGTRAP on macOS), so the
# reference is driven in two bounded passes whose columns are disjoint apart
# from the join key.
REPORT_PASSES: dict[str, str] = {
    "circuit": (
        "RPT_D | RPT_DMAX | RPT_ELE | RPT_BMUF | RPT_BMUFD | RPT_OPMUF "
        "| RPT_OPMUFD | RPT_E | RPT_PR | RPT_SNR | RPT_SNRXX | RPT_BCR "
        "| RPT_OCR | RPT_OCRS"
    ),
    "noise_mode": (
        "RPT_D | RPT_NOISESOURCES | RPT_NOISETOTAL | RPT_NOISETOTALD "
        "| RPT_SNRD | RPT_GRW | RPT_ESL | RPT_DOMMODE"
    ),
}

JOIN_KEYS = ("month", "hour", "frequency", "distance")


@dataclass(frozen=True)
class Case:
    """One deterministic reference circuit.

    Hours are stored 0-23 UTC and converted to the reference's 1-24
    convention at render time. Power is watts and converted to dB(kW).
    """

    case_id: str
    label: str
    tx_lat: float
    tx_lon: float
    rx_lat: float
    rx_lon: float
    year: int
    month: int
    hour_utc: int
    sunspot_number: int
    frequency_mhz: float
    tx_power_watts: float
    bandwidth_hz: float
    required_snr_db: float
    man_made_noise: str
    path_direction: str = "SHORTPATH"
    modulation: str = "ANALOG"
    # Digital-modulation windows. The reference only uses these when
    # modulation == "DIGITAL"; leaving them at zero there collapses the
    # multimode-interference term and drives SNR to a degenerate value, so a
    # DIGITAL case must supply real windows.
    required_sir_db: float = 0.0
    amplitude_ratio_db: float = 0.0
    time_window_ms: float = 0.0
    frequency_window_hz: float = 0.0
    t0_ms: float = 0.0
    f0_hz: float = 0.0


class ReferenceError(RuntimeError):
    """Raised when the pinned reference build is missing or fails."""


def git_env() -> dict[str, str]:
    """Environment for git subprocesses with the caller's GIT_* variables removed.

    Git exports GIT_DIR (and friends) to hooks. With GIT_DIR set, ``git -C``
    and even ``git init <path>`` operate on the ambient repository instead of
    the path given, so a build run from a pre-push hook would clone into, and
    then check the cleanliness of, the developer's own repository.
    """
    return {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}


# The upstream repository commits its own build outputs, so a build on any
# host rewrites tracked files. Only the exact generated artifacts are exempt
# from the cleanliness check: the object files and dependency stubs the
# Makefiles emit next to the sources, and the three linked outputs. Makefiles
# and anything else under the Linux/ build directories are provenance and
# stay checked. The linked outputs' own provenance is their sha256 in the
# manifest, recorded by build.py from the pinned sources.
GENERATED_ARTIFACT_SUFFIXES = (".o", ".d")
GENERATED_OBJECT_DIRS = (
    "ITURHFProp/Src/ITURHFProp/",
    "P372/Src/P372/",
    "P533/Src/P533/",
)
GENERATED_ARTIFACT_PATHS = frozenset(
    {
        "ITURHFProp/Linux/ITURHFProp",
        "P533/Linux/libp533.so",
        "P372/Linux/libp372.so",
    }
)


def is_generated_artifact(relative_path: str) -> bool:
    """Only what the upstream Makefiles write: objects in the three Src
    directories and the three linked outputs. A .o or .d anywhere else (a Data
    directory, say) is not a build product and must fail the cleanliness check,
    because inventory() digests every file under Data."""
    if relative_path in GENERATED_ARTIFACT_PATHS:
        return True
    return relative_path.endswith(GENERATED_ARTIFACT_SUFFIXES) and any(
        relative_path.startswith(prefix) for prefix in GENERATED_OBJECT_DIRS
    )


def require_clean_checkout(source: Path) -> None:
    """Refuse a clone whose tracked sources, makefiles or data differ from the pin.

    HEAD alone does not prove provenance: an edited source or coefficient
    file would be compiled and then recorded as if it came from COMMIT.
    Untracked and ignored files count too: inventory() digests every file
    under the Data directories, so a locally added coefficient file would
    otherwise be attributed to COMMIT, and --untracked-files=all alone omits
    anything matched by .gitignore, .git/info/exclude or the global excludes.
    Only the rebuilt generated artifacts are exempt.
    """
    status = subprocess.check_output(
        ["git", "-C", str(source), "status", "--porcelain",
         "--untracked-files=all", "--ignored=matching"],
        text=True,
        env=git_env(),
    )
    dirty = [
        line for line in status.splitlines()
        if line.strip() and not is_generated_artifact(line[3:].strip())
    ]
    if dirty:
        raise ReferenceError(
            "reference checkout has modified or untracked files; restore the "
            f"pinned tree (git -C {source} checkout -- . && git -C {source} "
            "clean -fd) before using it:\n"
            + "\n".join(dirty)
        )


RECEIPT_FILENAME = "build-receipt.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def require_pinned_checkout(source: Path) -> None:
    """HEAD must be COMMIT and the tracked tree must be clean.

    Every consumer of the build (golden generation, the portable proof, the
    native runner) revalidates here, not only the build step: artifacts
    that merely exist could have been rebuilt from another commit or from a
    hand-edited source and would otherwise be stamped with the pinned COMMIT.
    """
    if not (source / ".git").exists():
        raise ReferenceError(f"{source} is not a git checkout of the pinned reference")
    actual = subprocess.check_output(
        ["git", "-C", str(source), "rev-parse", "HEAD"], text=True, env=git_env()
    ).strip()
    if actual != COMMIT:
        raise ReferenceError(
            f"pinned commit mismatch: checkout is at {actual}, contract pins {COMMIT}"
        )
    require_clean_checkout(source)


def validate_case(case: Case) -> None:
    if not -90.0 <= case.tx_lat <= 90.0 or not -90.0 <= case.rx_lat <= 90.0:
        raise ValueError(f"{case.case_id}: latitude outside [-90, 90]")
    if not -180.0 <= case.tx_lon <= 180.0 or not -180.0 <= case.rx_lon <= 180.0:
        raise ValueError(f"{case.case_id}: longitude outside [-180, 180]")
    if not 1900 <= case.year <= 2100:
        raise ValueError(f"{case.case_id}: year outside [1900, 2100]")
    if not 1 <= case.month <= 12:
        raise ValueError(f"{case.case_id}: month outside [1, 12]")
    if case.hour_utc not in range(24):
        raise ValueError(f"{case.case_id}: hour_utc outside [0, 23]")
    if not 1 <= case.sunspot_number <= 311:
        raise ValueError(f"{case.case_id}: R12 outside [1, 311]")
    # The reference validates 1.6-30 MHz; the Propulse golden set is 3-30 MHz
    # because PROP-35..39 own everything below 2 MHz.
    if not 3.0 <= case.frequency_mhz <= 30.0:
        raise ValueError(f"{case.case_id}: frequency outside golden domain [3, 30] MHz")
    if case.tx_power_watts < 1.0:
        raise ValueError(f"{case.case_id}: reference floor is 1 W (-30 dB(kW))")
    if not 0.005 <= case.bandwidth_hz <= 3_000_000.0:
        raise ValueError(f"{case.case_id}: bandwidth outside reference limits")
    if not -30.0 <= case.required_snr_db <= 200.0:
        raise ValueError(f"{case.case_id}: required SNR outside reference limits")
    if case.path_direction not in ("SHORTPATH", "LONGPATH"):
        raise ValueError(f"{case.case_id}: path direction must be SHORT/LONGPATH")
    if case.modulation not in ("ANALOG", "DIGITAL"):
        raise ValueError(f"{case.case_id}: modulation must be ANALOG or DIGITAL")
    if case.modulation == "DIGITAL" and (
        case.time_window_ms <= 0.0 or case.frequency_window_hz <= 0.0
    ):
        raise ValueError(
            f"{case.case_id}: DIGITAL needs non-zero time/frequency windows; "
            "zero windows make the reference SNR degenerate"
        )


def render_input(
    case: Case, data_path: Path, report_dir: Path, report_format: str
) -> str:
    """Render the exact ITURHFProp input file for one case and one pass."""
    validate_case(case)
    power_db_kw = 10.0 * math.log10(case.tx_power_watts / 1000.0)
    return f"""// Propulse reference golden case {case.case_id}
// {case.label}
PathName "{case.case_id}"
PathTXName "TX"
Path.L_tx.lat {case.tx_lat}
Path.L_tx.lng {case.tx_lon}
TXAntFilePath "ISOTROPIC"
TXGOS 0.0
TXBearing 0.0
PathRXName "RX"
Path.L_rx.lat {case.rx_lat}
Path.L_rx.lng {case.rx_lon}
RXAntFilePath "ISOTROPIC"
RXGOS 0.0
RXBearing 0.0
AntennaOrientation "TX2RX"
Path.year {case.year}
Path.month {case.month}
Path.hour {case.hour_utc + 1}
Path.SSN {case.sunspot_number}
Path.frequency {case.frequency_mhz:.6f}
Path.txpower {power_db_kw:.8f}
Path.BW {case.bandwidth_hz}
Path.SNRr {case.required_snr_db}
Path.SNRXXp 90
Path.ManMadeNoise "{case.man_made_noise}"
Path.Modulation "{case.modulation}"
Path.SIRr {case.required_sir_db}
Path.A {case.amplitude_ratio_db}
Path.TW {case.time_window_ms}
Path.FW {case.frequency_window_hz}
Path.T0 {case.t0_ms}
Path.F0 {case.f0_hz}
Path.SorL "{case.path_direction}"
RptFilePath "{report_dir}/"
RptFileFormat "{report_format}"
LL.lat {case.rx_lat}
LL.lng {case.rx_lon}
LR.lat {case.rx_lat}
LR.lng {case.rx_lon}
UL.lat {case.rx_lat}
UL.lng {case.rx_lon}
UR.lat {case.rx_lat}
UR.lng {case.rx_lon}
latinc 1.0
lnginc 1.0
DataFilePath "{data_path}/"
"""


def _portable_input_text(case: Case, report_format: str) -> str:
    """Machine-independent rendering used only for the input hash.

    The real input file embeds absolute paths to the gitignored clone, which
    differ per machine. Hashing this placeholder form keeps the manifest
    reproducible across checkouts.
    """
    return render_input(case, Path("<DATA>"), Path("<RPT>"), report_format)


def input_digest(case: Case) -> str:
    joined = "\n".join(
        _portable_input_text(case, REPORT_PASSES[name])
        for name in sorted(REPORT_PASSES)
    )
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def _coerce(column: str, raw: str) -> Any:
    raw = raw.strip()
    if column in ("month", "hour"):
        return int(raw)
    try:
        return float(raw)
    except ValueError:
        return raw


def parse_report(path: Path) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ReferenceError(f"reference produced no rows: {path}")
    parsed: list[dict[str, Any]] = []
    for row in rows:
        record = {
            column: _coerce(column, value)
            for column, value in row.items()
            if column is not None and value is not None
        }
        # The reference emits hours in 1-24; restore 0-23 UTC.
        if "hour" in record:
            record["hour"] = record["hour"] - 1
        parsed.append(record)
    return parsed


class ReferenceBuild:
    """Locates the artifacts of a completed native build."""

    def __init__(self, source: Path) -> None:
        self.source = Path(source).resolve()
        self.executable = self.source / "ITURHFProp/Linux/ITURHFProp"
        self.p533_library = self.source / "P533/Linux/libp533.so"
        self.p372_library = self.source / "P372/Linux/libp372.so"
        self.data_path = self.source / "P372/Data"
        self._verified = False

    @classmethod
    def default(cls, build_dir: Path | None = None) -> "ReferenceBuild":
        root = Path(build_dir) if build_dir else DEFAULT_BUILD_DIR
        return cls(root / SOURCE_DIRNAME)

    @property
    def artifacts(self) -> tuple[Path, Path, Path]:
        return (self.executable, self.p533_library, self.p372_library)

    @property
    def receipt_path(self) -> Path:
        """Written by build.py right after the checked build; gitignored."""
        return self.source.parent / RECEIPT_FILENAME

    def artifact_digests(self) -> list[dict[str, Any]]:
        return [
            {
                "path": path.relative_to(self.source).as_posix(),
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for path in self.artifacts
        ]

    def write_build_receipt(self) -> Path:
        """Record what the checked build step produced, so consumers can tell
        a binary that came from it apart from one replaced afterwards."""
        self.receipt_path.write_text(
            json.dumps(
                {"commit": COMMIT, "artifacts": self.artifact_digests()},
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        return self.receipt_path

    def require_build_receipt(self) -> None:
        """The linked outputs are exempt from the git cleanliness check (the
        build rewrites them), so their provenance is the receipt build.py wrote
        from the checked build. A missing receipt or a digest mismatch means
        the artifacts were replaced or rebuilt outside that step."""
        if not self.receipt_path.exists():
            raise ReferenceError(
                f"no build receipt at {self.receipt_path}; run "
                "scripts/propagation-reference-fetch so the artifacts come from "
                "the checked build"
            )
        receipt = json.loads(self.receipt_path.read_text(encoding="utf-8"))
        if receipt.get("commit") != COMMIT:
            raise ReferenceError(
                f"build receipt is for commit {receipt.get('commit')}, contract "
                f"pins {COMMIT}; rebuild"
            )
        recorded = {entry["path"]: entry["sha256"] for entry in receipt.get("artifacts", [])}
        for entry in self.artifact_digests():
            expected = recorded.get(entry["path"])
            if expected != entry["sha256"]:
                raise ReferenceError(
                    f"{entry['path']} does not match the build receipt "
                    f"(receipt {expected}, on disk {entry['sha256']}); the "
                    "artifact was replaced or rebuilt outside the checked build"
                )

    def available(self) -> bool:
        return all(
            path.exists()
            for path in (
                self.executable,
                self.p533_library,
                self.p372_library,
                self.data_path,
            )
        )

    def require(self) -> None:
        """Validate provenance once per instance: pinned commit, clean tree,
        artifacts matching the build receipt. Every pass calls this, so the
        checks (git status plus three hashes) are cached after they succeed;
        timed loops therefore measure the solver, not the validation, and a
        checkout edited mid-process is caught by the next process."""
        if self._verified:
            return
        if not self.available():
            raise ReferenceError(
                "pinned ITU-R HF build is absent; run "
                "scripts/propagation-reference-fetch first"
            )
        require_pinned_checkout(self.source)
        self.require_build_receipt()
        self._verified = True

    def environment(self) -> dict[str, str]:
        env = dict(os.environ)
        libraries = f"{self.p533_library.parent}:{self.p372_library.parent}"
        env["DYLD_LIBRARY_PATH"] = libraries
        env["LD_LIBRARY_PATH"] = libraries
        return env

    def version(self) -> str:
        self.require()
        result = subprocess.run(
            [str(self.executable), "-v", "unused"],
            env=self.environment(),
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()

    def run_pass(self, case: Case, report_format: str, workdir: Path) -> dict[str, Any]:
        self.require()
        workdir.mkdir(parents=True, exist_ok=True)
        input_path = workdir / f"{case.case_id}.in"
        report_path = workdir / f"{case.case_id}.csv"
        input_path.write_text(
            render_input(case, self.data_path, workdir, report_format),
            encoding="utf-8",
        )
        completed = subprocess.run(
            [str(self.executable), "-s", "-c", str(input_path), str(report_path)],
            env=self.environment(),
            capture_output=True,
            text=True,
        )
        if completed.returncode:
            raise ReferenceError(
                f"ITURHFProp failed for {case.case_id} "
                f"({completed.returncode}): {completed.stdout.strip()} "
                f"{completed.stderr.strip()}"
            )
        rows = parse_report(report_path)
        if len(rows) != 1:
            raise ReferenceError(
                f"{case.case_id}: expected one row, got {len(rows)}"
            )
        return rows[0]

    def run_case(self, case: Case, workdir: Path) -> dict[str, Any]:
        """Run both report passes and merge them on the shared join keys."""
        merged: dict[str, Any] = {}
        for name in sorted(REPORT_PASSES):
            row = self.run_pass(
                case, REPORT_PASSES[name], workdir / name
            )
            for key in JOIN_KEYS:
                if key in merged and key in row and merged[key] != row[key]:
                    raise ReferenceError(
                        f"{case.case_id}: pass disagreement on {key}: "
                        f"{merged[key]} != {row[key]}"
                    )
            merged.update(row)
        return merged


def case_inputs(case: Case) -> dict[str, Any]:
    """The as-issued inputs recorded alongside every golden output."""
    return asdict(case)
