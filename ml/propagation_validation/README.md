# Propagation validation protocol — candidate 0.1.0

This package checks a proposed contract and tiny synthetic fixtures for
[#947](https://github.com/crypticpy/propulse/issues/947). It never evaluates a
production solver, reads operational/holdout data, trains, writes activation
files or establishes eligibility. **Exit 0 means consistency PASS; scientific
qualification remains BLOCKED and validated coverage remains zero.**

From the repository root, using Python 3.10 or newer and its standard library:

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
