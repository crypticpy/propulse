# Propagation validation protocol — candidate 0.1.0

This package checks a proposed contract and tiny synthetic fixtures for
[#947](https://github.com/crypticpy/propulse/issues/947). It never evaluates a
production solver, reads operational/holdout data, trains, writes activation
files or establishes eligibility. **Exit 0 means consistency PASS; scientific
qualification remains BLOCKED and validated coverage remains zero.**

From the repository root, using Python 3.10 or newer and its standard library
(`npm run check:propagation-protocol` runs both commands and is part of
`npm run verify`, so the pre-push gate fails when these regressions break):

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s ml/propagation_validation -p 'test_*.py' -v
PYTHONDONTWRITEBYTECODE=1 python3 ml/propagation_validation/validate.py
```

The tests cover the independently derived negative geodesic covariance
quadratic form and corrected chordal spectrum, poles/date-line/duplicate sites
and temporal covariance, plus invalid metadata, label, state, gate, comparator,
threshold and schema mutations. These tests do not establish arbitrary-matrix
PSD or numerical reliability of a future production assimilation solver.

`protocol-v0.1.json` contains the proposed events, initial coverage rows,
SNR estimand/weights, dataset roles, replay, experimental resampling, comparator
eligibility metadata, numerical tolerances and separate workload profiles.
Each row's stable ID encodes band, mechanism, event, domain, horizon and revision;
changing those meanings requires a new ID/version. `qualification_metric` and
owned BLOCKED `preregistration` explicitly keep timing, frequency, probability
and field-strength families separate. This initial inventory is not the complete
band × jurisdiction × mechanism × station × mode × horizon matrix; #947 retains
that remaining work. Names such as `qualified_family_bands` reserve an unresolved
family domain; they never authorize a frequency, model or claim.

The initial 37 row IDs are frozen by a validator constant tied to protocol 0.1.0:
SHA-256 `83ac2525abf9f62d6fa8ec034fd9594ddd14aa54187b52e282b79cc22d5ce803`
over UTF-8 newline-joined sorted IDs, without a trailing newline. Reordering is
allowed; deletion, addition or replacement requires a reviewed protocol revision.
This pins the partial inventory denominator without claiming complete coverage.

`fixture-manifest.json` contains only two analytic matrices and three synthetic
label records. Fixture parameters are algebra examples, never fitted physical
priors. Known failed detection with only an upper SNR bound cannot become an
ordinary observed SNR/MAE label. Observation labels naturally become available
after their prediction issue; those label timestamps are different from the
as-issued **input** availability rule in the protocol.

`fixture-manifest.schema.json` is a JSON Schema 2020-12 document using a deliberately
small vocabulary. `validate.py` implements only `type` (object, array, string,
boolean, number, null), `const`, `enum`, `properties`, `required`,
`additionalProperties: false`, `items`, `minItems`, `minLength`, `minimum` and
`exclusiveMinimum`, with metadata `$schema`, `title` and `description`. Unsupported
keywords are errors; there is no general JSON Schema compliance claim, remote
resolution or coercion. The loader rejects duplicate keys, NaN, Infinity and
numeric overflow. Schema checks enforce fixture structure; protocol-specific
checks enforce candidate-state and event/gate invariants. They cannot verify
that free-text scientific statements are true, or that future data/software
matches a declared hash. Candidate contracts still require human review.

The command accepts `--protocol PATH` and `--manifest PATH` for offline consistency
checks of this same revision. It does not consume dataset paths or unlock a gate.
A future reviewed protocol must add actual rights-approved datasets, exact
comparators, family-specific metrics/thresholds/power, split hashes, feasibility
studies and independent calibration evidence; changing metadata here is not
qualification. The [design candidates](../../docs/designs/propagation/README.md)
define residual normalization, null and conditioning exclusions, and refinement
tail requirements that are still awaiting numerical implementation.

The connected-component paired bootstrap is an **experimental SNR candidate**:
common stations/dates/storms may create one giant component and make the design
infeasible. No resampling is executed here. Use development-only design review
to determine feasibility before any holdout access; never split correlated
components to manufacture sample size. No other event inherits this estimator.

For a future benchmark run, the owner must first resolve the BLOCKED review,
source, dataset, comparator, row preregistration, power, numerical and runtime
gates in a new reviewed revision; freeze development/validation/independent
station/date/storm/prospective manifests and leakage buffers without inspecting
sealed N5 months; archive as-issued contexts and predictions before labels; and
report all predetermined rows, unavailable predictions and unknown outcomes.
Insufficient data/power or a failed slice does not pass. The 20% SNR MAE target
and external paired 95% interval rule remain targets, never reported achievements.
Full repository `npm run verify` and current-head independent/Fable review are
parent-session responsibilities, separate from these focused checks.

## Pinned ITU-R HF reference build ([#952](https://github.com/crypticpy/propulse/issues/952))

`reference/` holds the reproduction recipe and the committed manifests for the
official ITU-R Study Group 3 implementation of Recommendations P.533-14 and
P.372-15 (`ITURHFProp` + `libp533` + `libp372`), pinned at tag `v14.3`, commit
`cd172be56dc04b154e5d2fa91cbaa6ecf5284305`. It exists so that the climatology
provider ([#953](https://github.com/crypticpy/propulse/issues/953)) and the
local circuit solver ([#954](https://github.com/crypticpy/propulse/issues/954))
can be checked against a fixed standard instead of against each other.

**Nothing from that repository is committed here.** No source, binary, or
coefficient file enters Propulse git; the clone and every build artifact live
in the gitignored `reference/.build/`. The upstream project ships no `LICENSE`
file — the rights statement lives in the source headers and is recorded
verbatim in `manifest.json` (`rights.licence_text_location`), which is also the
reason nothing is redistributed.

### Reproduce

```sh
scripts/propagation-reference-fetch                      # clone, verify, build, manifest
scripts/propagation-reference-fetch --golden             # + regenerate golden-v1.json
scripts/propagation-reference-fetch --golden --portable  # + WASM portability proof
```

Prerequisites: `git`, `make`, a C compiler (clang on macOS, gcc on Linux),
Python 3.10+, ~400 MB of disk; the `--portable` stage additionally needs
Emscripten and node. The build refuses to continue if the clone is not at the
pinned commit. On macOS the upstream Makefiles are driven with
`CC=clang … -dynamiclib` because they assume GNU `ld` (`-shared -z muldefs`).

Committed outputs (the only files in git):

| File                  | What it records                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`       | source commit, licence location and rights text, per-file size + sha256 for all 42 P372 coefficient files, tree digests for the other data trees, build artifact hashes, toolchain versions |
| `golden-v1.json`      | 30 circuits, their exact reference inputs (`input_sha256`), 42 reference outputs each, and the normalisation conventions                                                                    |
| `portable-proof.json` | the static/WASM port with the P372 loader removed, its parity against `golden-v1.json`, asset sizes, startup, memory and batch latency                                                      |

`golden-v1.json` is frozen: changing any case in `reference/cases.py` requires a
new `golden-v2.json`, never an in-place edit.

### Supported domain

HF **skywave only**, 2–30 MHz (the golden set exercises 3–30 MHz). Nothing
below 2 MHz is in scope — ground-wave, MF and LF belong to other work. No
ground-wave, scatter, or space path is modelled. **This is not VOACAP**: it is
the ITU-R P.533-14 method, and the two disagree by design.

Parity against these goldens is _implementation verification_ — it says a
solver reproduces the reference's own arithmetic. It is never a claim about
observed propagation accuracy, and it establishes no coverage under
`protocol-v0.1.json`.

### Normalisation conventions (read before comparing anything)

The full text lives in `golden-v1.json` under `conventions`; the load-bearing
points:

- **Bandwidth** — `Path.BW` is the receiver noise bandwidth in Hz. `PR` and
  `SNR` are both referred to it; changing it moves noise power, not field
  strength.
- **Power** — `Path.txpower` is dB(kW) (limits −30…60, i.e. a 1 W floor). `PR`
  is median _available receiver power_ in dB(W).
- **Noise** — `FaA`, `FaM`, `FaG` are P.372 component noise factors in dB above
  kT₀b with T₀ = 288 K. `FamT` is **not** the noise the SNR uses: P372
  `Noise.c` sets `FamT = min(FamTu, FamTl)` (the worse-case decile-weighted
  total), while `CircuitReliability.c` divides the signal by the plain power
  sum. The two differ by up to ~1 dB across this golden set.
- **SNR** — for ANALOG cases
  `SNR = PR − (Fsum − 204 + 10·log10(BW_Hz))` with
  `Fsum = 10·log10(10^(FaA/10) + 10^(FaM/10) + 10^(FaG/10))`.
  `test_reference.py` enforces this to 0.05 dB on every ANALOG case, so a
  consumer that reconstructs SNR from `FamT` will disagree with the reference.
  DIGITAL cases use the signal-and-interferers numerator of P.533-12 §10.2.3,
  so the identity does not hold there.
- **Field strength** — dB above 1 µV/m; `Es` below 7000 km, `El` above
  9000 km, interpolated `Ep` between. The unused branch is emitted as the
  reference's `−307` sentinel.
- **Antennas** — both ends are ISOTROPIC with 0 dB offset, so no antenna model
  leaks into the reference numbers.
- **Time** — hours are 0–23 UTC here (the reference uses 1–24); maps are
  monthly medians indexed by R12 (`SSN`), not a daily index.
- **Report buffer** — `Report.c` formats every requested column into a fixed
  `char outstr[256]`; requesting the whole `RPT_` set overflows it and aborts,
  so each case is run as two bounded passes joined on month/hour/frequency/
  distance.

### Tests

`test_reference.py` runs from the committed manifests alone and needs no clone:
it checks the pin, the hash inventory, the rights record, golden schema/count/
NaN-freedom, that every emitted column is documented, and that the documented
SNR identity actually holds in the golden numbers. The two tests that need the
native build skip with an explicit message when `reference/.build/` is absent.
