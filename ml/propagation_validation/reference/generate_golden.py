"""Generate `golden-v1.json` from the pinned native reference build.

Every value in the golden file is produced by the official ITURHFProp
executable. Nothing here is a Propulse estimate, a fit or an interpolation.
Reference parity against this file is *implementation verification*, never a
claim about observed propagation accuracy.

    python3 -m ml.propagation_validation.reference.generate_golden
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from reference.cases import GOLDEN_CASES, GOLDEN_REVISION  # type: ignore
    from reference.runner import (  # type: ignore
        COMMIT, DEFAULT_BUILD_DIR, HERE, REPORT_PASSES, SOURCE_DIRNAME,
        ReferenceBuild, input_digest,
    )
else:
    from .cases import GOLDEN_CASES, GOLDEN_REVISION
    from .runner import (
        COMMIT, DEFAULT_BUILD_DIR, HERE, REPORT_PASSES, SOURCE_DIRNAME,
        ReferenceBuild, input_digest,
    )

GOLDEN_PATH = HERE / "golden-v1.json"
GOLDEN_SCHEMA_VERSION = 1

# Every output key the two report passes can produce, with its meaning and
# unit. `test_reference.py` requires each recorded key to appear here, so an
# unexplained column can never enter the golden file.
OUTPUT_FIELDS: dict[str, str] = {
    "month": "calendar month 1-12 (as issued)",
    "hour": "UTC hour 0-23 (reference emits 1-24; normalised on read)",
    "frequency": "MHz",
    "distance": "great-circle path length, km",
    "dmax": "maximum hop length for the controlling mode, km",
    "ptick": "slant range, km",
    "ele": "elevation angle, degrees",
    "BMUF": "basic MUF, MHz (50% of days)",
    "MUF50": "basic MUF median decile, MHz",
    "MUF90": "basic MUF lower decile, MHz",
    "MUF10": "basic MUF upper decile, MHz",
    "OPMUF": "operational MUF, MHz",
    "OPMUF90": "operational MUF lower decile, MHz",
    "OPMUF10": "operational MUF upper decile, MHz",
    "Ep": "median field strength, dB(1 uV/m); Es, El or interpolated Ei by distance",
    "Es": "short-path (<9000 km) field strength, dB(1 uV/m); -307 is the reference's not-computed sentinel",
    "El": "long-path (>7000 km) field strength, dB(1 uV/m); -307 is the reference's not-computed sentinel",
    "PR": "median available receiver power, dB(W) in the stated bandwidth",
    "Grw": "receiving antenna gain in the direction of incidence, dBi",
    "FaA": "atmospheric noise figure, dB above kT0b",
    "FaM": "man-made noise figure, dB above kT0b",
    "FaG": "galactic noise figure, dB above kT0b",
    "FamT": "worse-case combined noise figure, dB above kT0b: min(FamTu, FamTl); not the value used for SNR",
    "DuT": "upper decile of total noise, dB",
    "DlT": "lower decile of total noise, dB",
    "SNR": "monthly median signal-to-noise ratio, dB in the stated bandwidth",
    "SNRXXp": "signal-to-noise ratio exceeded for SNRXXp% of the month, dB",
    "DuSN": "upper decile of SNR, dB",
    "DlSN": "lower decile of SNR, dB",
    "BCR": "basic circuit reliability, percent",
    "OCR": "overall circuit reliability without scattering, percent (DIGITAL only)",
    "OCRs": "overall circuit reliability with scattering, percent (DIGITAL only)",
    "probocc": "probability of scatter occurrence, percent",
    "DMidx": "dominant mode label (e.g. 1F2); NONE for paths >= 7000 km",
    "DMele": "dominant-mode elevation angle, degrees",
    "DMtau": "dominant-mode time delay, ms",
    "DMLb": "dominant-mode basic transmission loss, dB",
    "DMFprob": "dominant-mode probability that the mode is supported, 0-1",
    "DMhr": "dominant-mode mirror reflection height, km",
    "DMPrw": "dominant-mode received power, dB(W)",
    "DMGrw": "dominant-mode receive antenna gain, dBi",
    "DMEw": "dominant-mode field strength, dB(1 uV/m)",
    "DMBMUF": "dominant-mode basic MUF, MHz",
}

# The conventions a consumer must adopt before any comparison is meaningful.
# These are read out of the reference itself (README of the pinned commit plus
# the source), not assumed.
CONVENTIONS: dict[str, str] = {
    "bandwidth": (
        "Path.BW is the receiver noise bandwidth in Hz (reference limits "
        "0.005 to 3000000). PR and SNR are both referred to this bandwidth; "
        "changing it moves the noise power, not the field strength."
    ),
    "noise": (
        "FaA, FaM and FaG are ITU-R P.372 component noise factors in dB above "
        "kT0b (T0 = 288 K). Man-made noise is selected by category (CITY, "
        "RESIDENTIAL, RURAL, QUIETRURAL, QUIET, NOISY) or as an explicit "
        "100-200 dB value. FamT (RPT_NOISETOTAL) is NOT the quantity the SNR "
        "uses: P372 Noise.c sets FamT = min(FamTu, FamTl), the worse case of "
        "the two lognormal decile-weighted totals, while CircuitReliability.c "
        "line 166 divides the signal by the plain power sum "
        "10*log10(10^(FaA/10) + 10^(FaM/10) + 10^(FaG/10)). The two differ by "
        "up to ~1 dB in this golden set. Any consumer reconstructing SNR must "
        "use the power sum, not FamT."
    ),
    "power": (
        "Path.txpower is dB(kW), limits -30 to 60, i.e. a 1 W floor. The "
        "generator takes watts and converts with 10*log10(W/1000). PR is "
        "median available receiver power in dB(W)."
    ),
    "snr": (
        "For ANALOG cases SNR = PR - (Fsum - 204 + 10*log10(BW_Hz)) where "
        "Fsum = 10*log10(10^(FaA/10) + 10^(FaM/10) + 10^(FaG/10)); "
        "test_reference.py enforces this to 0.05 dB on every ANALOG case. "
        "For DIGITAL cases the numerator is not PR but the "
        "signal-and-interferers value of P.533-12 10.2.3, so the identity "
        "does not hold and the difference is the multimode interference "
        "term. Path.SNRXXp is the percentage of the month for which SNRXX is "
        "exceeded (90 throughout this set)."
    ),
    "field_strength": (
        "Field strength is dB above 1 uV/m. Below 7000 km the reference uses "
        "Es, above 9000 km El, and between the two an interpolation reported "
        "as Ep. The unused branch is emitted as the sentinel -307."
    ),
    "antennas": (
        "Both ends are ISOTROPIC with 0 dB gain offset and TX2RX orientation, "
        "so no antenna model leaks into the reference numbers."
    ),
    "time": (
        "Path.hour is 1-24 in the reference and 0-23 UTC here; Path.month is "
        "the calendar month and the ionospheric maps are monthly medians "
        "indexed by R12 (Path.SSN, 1-311), not by a daily index."
    ),
    "reliability": (
        "BCR is basic circuit reliability in percent. OCR/OCRs are only "
        "computed for Path.Modulation DIGITAL and are emitted as 0 for "
        "ANALOG; a DIGITAL case with zero time/frequency windows collapses "
        "the multimode interference term and produces a degenerate SNR, so "
        "DIGITAL cases here carry real windows."
    ),
    "modes": (
        "RPT_DOMMODE (dominant mode) is only meaningful for paths shorter "
        "than 7000 km; longer paths report DMidx NONE because the long-path "
        "method has no single dominant mode."
    ),
    "report_buffer": (
        "ITURHFProp Report.c formats every requested column into a fixed "
        "char outstr[256]. Requesting the full RPT_ set overflows it and "
        "aborts the process, so the golden runs use two bounded passes."
    ),
    "domain": (
        "HF skywave only. The reference validates 1.6-30 MHz; this golden set "
        "uses 3-30 MHz. Nothing below 2 MHz is supported and no ground-wave, "
        "scatter or space path is modelled here. This is not VOACAP."
    ),
}


def generate(build_dir: Path, workdir: Path) -> dict[str, Any]:
    source = build_dir / SOURCE_DIRNAME
    reference = ReferenceBuild(source)
    reference.require()
    cases: list[dict[str, Any]] = []
    started = time.monotonic()
    for case in GOLDEN_CASES:
        outputs = reference.run_case(case, workdir / case.case_id)
        unknown = sorted(set(outputs) - set(OUTPUT_FIELDS))
        if unknown:
            raise RuntimeError(f"{case.case_id}: undocumented columns {unknown}")
        cases.append(
            {
                "case_id": case.case_id,
                "label": case.label,
                "inputs": asdict(case),
                "input_sha256": input_digest(case),
                "outputs": outputs,
            }
        )
    elapsed = time.monotonic() - started
    return {
        "schema_version": GOLDEN_SCHEMA_VERSION,
        "revision": GOLDEN_REVISION,
        "reference_commit": COMMIT,
        "reference_version": reference.version(),
        "generated_on": {
            "platform": platform.platform(),
            "machine": platform.machine(),
        },
        "report_passes": REPORT_PASSES,
        "conventions": CONVENTIONS,
        "output_fields": OUTPUT_FIELDS,
        "case_count": len(cases),
        "native_batch_seconds": round(elapsed, 4),
        "cases": cases,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-dir", type=Path, default=DEFAULT_BUILD_DIR)
    parser.add_argument("--output", type=Path, default=GOLDEN_PATH)
    args = parser.parse_args(argv)
    build_dir = args.build_dir.resolve()
    workdir = build_dir / "golden-inputs"
    golden = generate(build_dir, workdir)
    args.output.write_text(
        json.dumps(golden, indent=1, sort_keys=False) + "\n", encoding="utf-8"
    )
    size = args.output.stat().st_size
    print(f"wrote {args.output} ({size} bytes, {golden['case_count']} cases)")
    print(f"native batch: {golden['native_batch_seconds']} s")
    print(f"per-case input files under {workdir}")
    if size > 200_000:
        print("WARNING: golden file exceeds the 200 KB budget", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
