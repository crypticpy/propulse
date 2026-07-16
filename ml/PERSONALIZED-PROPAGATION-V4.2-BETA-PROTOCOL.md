# Personalized Propagation V4.2: Alpha and Beta Protocol

> Status: preregistered before real research consent, attempts, or outcomes are
> enabled. This protocol is subordinate to
> [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md)
> and the frozen A6 archive decision in
> [`PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md`](PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md).
> Collection remains disabled until every preflight gate below passes.

## Decision question

For an operator who explicitly attempts a supported path, does the deterministic
StationCast equipment adjustment improve calibration or decision utility over
the same frozen A6 core probability without hiding geographic, equipment, mode,
source-freshness, or selection-bias failures?

The experiment evaluates the frozen A6 core and the deterministic
`station-chain-v1` adapter. It does not authorize fitting learned StationCast
residuals, FutureCast, 6m, unsupported modes, or an alternative propagation
core.

## Preflight gates

All gates are required before enabling either outcome flag or the research
receipt secret:

1. The frozen A6 archive decision and Phase 3 bundle hashes remain unchanged.
2. The first-party prospective collector has at least 24 continuous healthy
   hours with all required sources current and nonempty settled band/path
   aggregates.
3. The permitted WSPR receipt-time shadow has at least 720 expected hours, at
   least 99% completion, all ten HF bands per completed hour, and no unresolved
   integrity error.
4. Subscriber-facing recent-path data has written authorization or comes from
   a documented self-operated source. Research-only WSPR access is insufficient.
5. A controlled full-M5 outage has been detected by the off-M5 monitor and the
   same incident has closed only after genuine publisher recovery.
6. Consent, attempt, outcome, retention, aggregate-export, RLS, and service-role
   migrations pass rollback and deployed-state validation.
7. The model service and product API expose the same receipt schema and secret;
   both independent outcome flags remain false until an explicit beta release.
8. The System Health reader may remain hidden; enabling it is not a substitute
   for any model or beta gate.

## Population and recruitment

- Participants must explicitly opt in to `attempt_outcome_training`; the other
  permitted uses remain independently selectable.
- Capability classes are persisted only for participants who separately select
  `derived_equipment_training`. Without that selection the four capability
  columns remain null, not inferred as `unknown`; the capability-stratified
  analysis uses and reports this consented subset separately.
- A prediction view is never a failed attempt. An explicit attempt must precede
  every outcome.
- Recruitment targets broad coverage rather than convenience sampling. The
  achieved sample is reported by HF band, supported mode, Maidenhead field
  (the first two grid characters), and the server-derived capability classes
  below.
- The beta cannot satisfy its capability-cell gate unless enough participants
  independently select the derived-equipment use. Missing that consent blocks
  the personalization claim rather than silently weakening the gate.
- Public cells require at least five distinct participants and 20 valid binary
  outcomes. Smaller cells are combined into `other` or withheld.
- No participant may contribute more than 10% of the primary weighted sample.
  Excess observations remain in the audit count but are capped for scoring.

## Privacy-bounded capability classes

The signed receipt stores only server-derived classes, not radios, amplifiers,
feed-line parts, antenna models, exact gain values, exact noise values, or the
raw virtual shack:

| Dimension | Classes |
|---|---|
| Path EIRP | `unknown`, `lt_1w`, `1_5w`, `5_25w`, `25_100w`, `100_500w`, `ge_500w` |
| Passive loss | `unknown`, `lt_1db`, `1_3db`, `3_6db`, `ge_6db` |
| Directional gain | `unknown`, `lt_0dbi`, `0_3dbi`, `3_6dbi`, `6_10dbi`, `ge_10dbi` |
| Receiver evidence | `unknown`, `relative`, `catalog`, `measured` |
| Server support | `true`, `false` |

Only receipts with server support `true`, complete verified NowCast history,
and no OOD flag can enter the paired StationCast-versus-core beta estimand.

Exact origin and target grid4 remain private account-bound research records.
Only k-anonymous Maidenhead-field aggregates may enter reports or open data.

## Evidence grades

| Tier | Stored grades | Interpretation |
|---|---|---|
| A | `bridge`, `wsjtx` | Objective software/decoder evidence tied to the attempt window |
| B | `rig`, `logbook` | Structured device or log evidence with weaker outcome observability |
| C | `manual` | Explicit operator label; retained for sensitivity analysis |

`not_attempted` and `unknown` are workflow evidence but not binary outcomes.
Receive/contact success maps to 1; receive/contact failure maps to 0. The
primary analysis is WSPR `receive_success` versus `receive_failure`, matching
the frozen core estimand. Contact outcomes and non-WSPR modes are separate
secondary analyses; they cannot support a calibrated QSO or mode-specific
claim until their own heads pass a new preregistered evaluation.

## Alpha gate

Alpha is a safety and instrumentation study, not a model promotion test. It
requires:

- at least 10 participants;
- at least 200 valid binary outcomes;
- at least 50 Tier-A outcomes;
- at least seven calendar days;
- at least three HF bands and three capability strata with reportable cells;
- zero privacy, consent, receipt-integrity, stale-profile, or equipment-math
  stop events; and
- publication of missingness, withdrawal, unknown, not-attempted, API-error,
  and evidence-grade counts.

Passing alpha permits the preregistered beta. It does not support a public
accuracy or personalization claim.

## Beta gate

The primary beta analysis opens only after all of the following exist:

- at least 50 participants and 30 calendar days;
- at least 2,000 valid primary WSPR reception outcomes after the
  per-participant cap;
- at least 1,000 Tier-A outcomes;
- at least five supported HF bands with 100 valid outcomes each;
- at least four broad geographic cells and three capability cells, each with
  at least five participants and 100 valid outcomes; and
- no active stop condition.

The primary WSPR-reception estimand is the paired weighted Brier delta
`StationCast - core`; negative is better. A deterministic StationCast claim
requires all of:

1. at least 1% relative Brier improvement over the frozen core;
2. an operator-cluster bootstrap upper 95% bound below zero;
3. ECE and high-confidence maximum-gap degradation no worse than `0.002`;
4. no supported band, geography, capability, evidence tier, or task regression
   above 3% relative Brier where the reportability minimum is met; and
5. the Tier-A-only and all-grade sensitivity analyses agree in direction.

Report log loss, PR-AUC, ROC-AUC, calibration bins, abstention/OOD coverage,
attempt-to-outcome attrition, missingness, and separately reportable
receive/contact and mode cells. These are secondary metrics and cannot rescue
a failed primary gate.

## Selection bias

Selection bias is not dismissed by a significant aggregate result. The report
must compare achieved recruitment and attrition across band, mode, broad
geography, capability class, evidence tier, task, and source-freshness state.
It must publish the largest participant share, effective participant count,
unknown/not-attempted rate, withdrawal rate, and the effect of:

- the 10% participant cap;
- Tier A only;
- Tiers A+B;
- all evidence grades;
- receive-only versus contact-only outcomes; and
- complete verified NowCast history versus any excluded fallback/OOD record.

No causal claim about equipment is permitted because operators choose their
equipment, paths, operating times, modes, and whether to report an outcome.

## Stop conditions

Collection stops and both outcome flags return to false on any of:

- raw shack inventory, exact coordinates, credentials, callsigns, or user IDs
  entering public telemetry, aggregate exports, issues, or reports;
- an outcome accepted without current versioned consent, an unexpired signed
  receipt, subject binding, and explicit attempt;
- a stale, partial, future, mismatched, or quality-flagged history state labeled
  `nowcast`;
- a station-chain invariant violation or unsupported equipment/band treated as
  supported;
- withdrawal failing to stop collection and delete the participant's retained
  prediction/attempt/outcome rows;
- aggregate export returning a cell below five participants or 20 outcomes;
- systematic high-confidence overprediction with a gap above 0.10 after at
  least 200 valid outcomes; or
- material geographic degradation above the frozen 3% gate in two consecutive
  weekly reads after the reportability minimum is reached.

Operational interruptions may pause collection without invalidating prior
evidence. Protocol, privacy, receipt, or outcome-integrity violations invalidate
the affected beta attempt and require a new versioned protocol decision.

## Retention and publication

- Account-bound prediction, attempt, and outcome rows have a maximum retention
  of 24 months from consent and are deleted immediately on withdrawal.
- An automated service-role retention job deletes expired rows and records only
  aggregate deletion counts.
- The service-role beta aggregate is a privacy-bounded monitoring export, not
  the promotion scorer. The frozen M5 scorer applies the participant cap,
  operator-cluster bootstrap, and secondary sensitivity analyses without
  publishing participant-level rows.
- Active consent is rechecked at every attempt and outcome write.
- Withdrawal cannot retract already published aggregate statistics, but the
  participant is excluded from future fits and unpublished analyses.
- Open artifacts contain source, configuration, schema, metric, and aggregate
  evidence only. Raw operator records and third-party source rows are never
  published.

## Frozen analysis implementation

The machine-readable thresholds are frozen in
`config/propagation_v4_2_beta_protocol.json`. The M5 implementation has four
separate responsibilities:

1. `export_stationcast_beta_private.py` streams active, consented database rows
   into owner-only Parquet on the Projects volume. It replaces the account ID
   with an HMAC participant key before writing, coarsens origin to Maidenhead
   field, and never exports exact grid4 or raw station inventory.
2. `generate_stationcast_beta_operations_receipt.py` makes a read-only aggregate
   database audit of attempts, binary outcomes, unknown/not-attempted outcomes,
   open attempts, OOD/fallback exclusions, withdrawals, and retention deletion.
   It also verifies a signed aggregate API-telemetry receipt against
   `config/propagation_v4_2_beta_api_telemetry.schema.json`.
3. `score_stationcast_beta.py` uses Polars streaming input, applies the frozen
   primary filter and participant cap, computes paired probabilistic metrics,
   runs the operator-cluster bootstrap, and withholds subthreshold cells. A real
   decision fails closed when the operational receipt is missing, synthetic,
   malformed, or withheld.
4. `run_synthetic_stationcast_beta.py` exercises the exact scorer on native
   ARM64 with all visible Polars threads. Its receipt always writes
   `release_approved: false`, even when every synthetic gate passes.

The synthetic dry run is an implementation proof only. Its fixture metrics are
not evidence about operator equipment, propagation, or expected beta effect
size, and they may not be quoted as real model performance.

## Frozen prospective window

The 2026-08-01 through 2026-09-30 NowCast evaluation remains immutable and
unread until the window closes. Beta monitoring may enforce safety and data
integrity, but it may not tune A6, StationCast, thresholds, calibration, feature
selection, or the prospective scorer from that window.

## Learned StationCast and future modes

Passing this beta supports only the deterministic adapter tested here. Learned
StationCast residuals require a new preregistered train/validation/untouched
split and a new model version. FutureCast still requires 90 genuine issued-
forecast days and positive held-out horizon skill. The separate 6m decision
remains withheld until its mechanism-specific locked and prospective gates pass.
