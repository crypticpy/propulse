# Personalized Propagation V4.2: M5 Execution Runbook

> North star: [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md)  
> Active method: [`PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md`](PERSONALIZED-PROPAGATION-V4.2-PERFORMANCE-PLAN.md)  
> Machine: Apple M5 Max, 128 GB unified memory, 18 CPU cores  
> Repository: `/Users/crypticpy/Projects/propulse`  
> Large storage: `/Volumes/Projects/PropulseML`  
> Branch: `feat/archive-multimonth-v3`

## Non-negotiable execution boundaries

- Run all data preparation, model fitting, scoring, validation, and report
  generation on the M5.
- Use the M3 only for source editing and Git transport.
- Do not acquire or transform December 2024 until the candidate protocol state
  is `candidate_frozen`.
- Do not acquire or transform any 2025 outcome until every December gate is
  recorded as passed.
- Never fit, calibrate, select a threshold, or change a policy on December or
  2025 outcomes.
- Keep the separate 6m model outside the HF model and HF gate.
- Resume an opened outcome scope only with its original attempt ID.

## Access from the M3

```bash
ssh -o BatchMode=yes -o IdentitiesOnly=yes \
  -i /Users/aiml/.ssh/id_ed25519_propulse_m5 \
  crypticpy@192.168.50.117
cd /Users/crypticpy/Projects/propulse
```

Use `rsync` for selected source or artifact transfer. Do not encode files as
base64. On the M5, `node` is `/Users/crypticpy/.local/bin/node` in non-login
SSH shells.

## Hardware contract

The source validates native `arm64`, at least 18 visible cores, an
OpenMP-enabled XGBoost build, AC power, High Power mode, and no explicit macOS
CPU or scheduler limit before M5 workflows run.

| Workload | Parallelism | Memory policy |
|---|---|---|
| Cohort and feature construction | DuckDB 18 threads | 80 GB DuckDB limit, Projects-volume spill |
| 20M training | 2 spawned fits × 9 XGBoost threads | external-memory `ExtMemQuantileDMatrix` |
| 50M training | 2 spawned fits × 9 XGBoost threads | iterator-fed in-memory `QuantileDMatrix` |
| Arrow per fit | 9 CPU threads, 4 I/O threads | 250,000-row iterator batches |
| Evaluation and gates | Benchmark-pinned XGBoost threads, Arrow 18/6 CPU/I/O | 100,000-row scoring batches |
| Serving validation | 1 XGBoost thread per API request | Manifest default; explicit deployment override only |

XGBoost has no Metal backend. The installed build is CPU/OpenMP and has no
CUDA. The 50M backend was selected by a training-only benchmark: `2.603276x`
faster end to end, `7.338326x` faster in the tree-fit stage, identical recorded
validation log loss, and a conservative two-worker projection of `72.8105`
GiB.

## Current status, 2026-07-15 13:07 CDT

The active detached job is:

```text
parent     45330  train_phase2_scale.py --scale 20000000 --workers 2
worker     45336  A4_recent_cycle F3_2024_07
worker     45337  A5_recency_weighted F1_2024_02
log        ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/training_20m_parallel.log
```

A2 F1-F3 and A4 F1-F2 are complete. The active pair reached iteration 1,400
without memory pressure. A5 F2/F3 remain queued. Monitor without restarting:

```bash
ps -p 45330,45336,45337 -o pid,etime,%cpu,rss,command
tail -n 60 ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/training_20m_parallel.log
```

The trainer writes an atomic checkpoint after each completed fold. If the
process stops, rerun the same command; completed folds are checksum-verified
and reused.

## Complete Phase 2 at 20M

After the parent exits successfully:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/benchmark_prediction_threads.py \
  --profile m5

ml/.venv/bin/python ml/src/archive_v4_2/pin_prediction_threads.py

ml/.venv/bin/python ml/src/archive_v4_2/score_phase2_scale.py \
  --profile m5 --scale 20000000 --verify-input-hashes

ml/.venv/bin/python ml/src/archive_v4_2/validate_phase2_scale.py \
  --profile m5 --scale 20000000
```

The benchmark uses only the allowed July early-stopping feature matrix, requires
bit-identical predictions at 1/6/9/12/18 threads, then pins the fastest count and
artifact SHA-256 in the tracked config. Sync and commit the config plus benchmark
artifact before scoring. The scorer writes `evaluation_20m_results.json`; validation writes
`validation_20m.json`. If `selection.advance_to_50m` is empty, stop before
December and generate the 20M report. Otherwise, at most two component models
advance.

## Build and execute 50M

```bash
ml/.venv/bin/python ml/src/archive_v4_2/build_phase2_cohorts.py \
  --profile m5 --scale 50000000

nohup caffeinate -dimsu ml/.venv/bin/python \
  ml/src/archive_v4_2/train_phase2_scale.py \
  --profile m5 --scale 50000000 --workers 2 \
  > ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/training_50m.log 2>&1 &

ml/.venv/bin/python ml/src/archive_v4_2/score_phase2_scale.py \
  --profile m5 --scale 50000000 --verify-input-hashes

ml/.venv/bin/python ml/src/archive_v4_2/validate_phase2_scale.py \
  --profile m5 --scale 50000000
```

Only the frozen final rolling fold is trained at 50M. Cohort construction
verifies exact 20M-within-50M nestedness. The scorer applies the preregistered
final selection rule and emits a conservative 100M decision. Do not run 100M
unless every coded gate passes and the Phase 2 report establishes an unresolved
rare-regime or variance reason; more rows alone are not a reason.

## Generate and verify the Phase 2 report

```bash
ml/.venv/bin/python ml/src/archive_v4_2/generate_phase2_report.py --profile m5

/Users/crypticpy/.local/bin/node ml/src/archive_v4/package_report.mjs \
  --input ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/REPORT.artifact.json \
  --output ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/REPORT.html
```

The report must show the 5M→20M→50M curve, B2 deltas, both evaluation months,
paired uncertainty, band/distance safety, reliability, early-stopping
sensitivity, feature gain, cohort checksums, and both M5 backend/thread benchmarks. A
successful portable-builder receipt must report browser verification at 1,440
px and 390 px.

## Phase 3 package and contract validation

Only continue when `evaluation_50m_results.json` has a non-null
`final_candidate_selection`:

```bash
ml/.venv/bin/python ml/src/archive_v4_2/package_phase3_candidate.py --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/validate_phase3_candidate.py --profile m5
ml/.venv/bin/python ml/src/archive_v4_2/run_synthetic_gate_report.py
ml/.venv/bin/python ml/src/archive_v4_2/freeze_phase3_candidate.py --profile m5
```

The freeze requires:

- passing 50M validation;
- manifest-default one-thread serving validation with no ambient override;
- offline/service parity within `1e-12`;
- fresh NowCast and stale physics-fallback boundary checks at 7,200 seconds;
- explicit missingness and reduced fallback confidence;
- end-to-end API p95 below 50 ms for a path and 3,000 ms for 4,096 cells;
- peak validation RSS at or below 32 GiB and bundle at or below 256 MiB;
- public-manifest privacy scan;
- a real Phase 2 HTML report; and
- a passed synthetic browser report receipt.

Confirm before opening outcomes:

```bash
ml/.venv/bin/python - <<'PY'
import json
p = "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/outcome_protocol_manifest.json"
value = json.load(open(p))
print(value["protocol_state"], value["outcome_access"])
PY
```

Expected state: `candidate_frozen`; every outcome-access value must be `false`.

## Public source inventory

| Source | Role | URL |
|---|---|---|
| WSPRnet monthly archive | Immutable decode outcomes and exposure reconstruction | <https://www.wsprnet.org/archive/> |
| NASA SPDF OMNI2 | Definitive historical hourly solar-wind, F10.7, and geomagnetic inputs | <https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/> |
| OMNI documentation | Provenance, field definitions, and acknowledgement | <https://omniweb.gsfc.nasa.gov/html/ow_data.html> |
| GFZ Hp60 | Lagged high-cadence geomagnetic input, CC BY 4.0 | <https://kp.gfz.de/en/hp30-hp60/data> |
| NOAA SWPC JSON | Operational live-source parity after archive approval | <https://services.swpc.noaa.gov/json/> |
| ITU-R P.533 | Physics fallback/baseline reference | <https://www.itu.int/rec/R-REC-P.533> |

Raw third-party archives remain under ignored `ml/data/raw` storage. Source
manifests retain URL, retrieval time, byte count, SHA-256, role, and license or
acknowledgement note.

## Open and score December exactly once

Opening the scope mutates the protocol before download. Preserve the printed
attempt ID.

```bash
ATTEMPT="december-$(date -u +%Y%m%dT%H%M%SZ)"
ml/.venv/bin/python ml/src/archive_v4_2/open_outcome_scope.py \
  --scope december --attempt-id "$ATTEMPT"

ml/.venv/bin/python ml/src/archive_v4_2/prepare_locked_gate.py \
  --scope december --attempt-id "$ATTEMPT" --profile m5

ml/.venv/bin/python ml/src/archive_v4_2/score_locked_gate.py \
  --scope december --attempt-id "$ATTEMPT" --profile m5 \
  --dataset 2024-12=ml/data/processed/archive_v4_2_december/dataset_propagation_v4_2_phase2_scale_december_gate_hf.parquet/part-000.parquet \
  --integrity-audit ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_integrity_audit.json

ml/.venv/bin/python ml/src/archive_v4_2/generate_gate_report.py \
  --result ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_gate_result.json \
  --output-dir ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_report \
  --profile m5

/Users/crypticpy/.local/bin/node ml/src/archive_v4/package_report.mjs \
  --input ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_report/REPORT.artifact.json \
  --output ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_report/REPORT.html
```

If any command fails after opening, correct the operational error and resume
with the same `$ATTEMPT`. Never call the opener again.

The December scorer requires all ten gates: integrity, at least 1% overall
relative Brier improvement and paired-day upper 95% below zero, at least 75%
qualified-day wins, no supported-week collapse above 2%, supported-band
regression at or below 2%, three short-path tolerances, calibration, fallback,
parity/privacy, and efficiency.

## Open and score the four 2025 months

Run this section only when the protocol state is `december_passed`.

```bash
ATTEMPT="archive-$(date -u +%Y%m%dT%H%M%SZ)"
ml/.venv/bin/python ml/src/archive_v4_2/open_outcome_scope.py \
  --scope archive --attempt-id "$ATTEMPT"

ml/.venv/bin/python ml/src/archive_v4_2/prepare_locked_gate.py \
  --scope archive --attempt-id "$ATTEMPT" --profile m5

ml/.venv/bin/python ml/src/archive_v4_2/score_locked_gate.py \
  --scope archive --attempt-id "$ATTEMPT" --profile m5 \
  --dataset 2025-01=ml/data/processed/archive_v4_2_archive/dataset_propagation_v4_2_phase2_scale_archive_gate_hf.parquet/part-000.parquet \
  --dataset 2025-04=ml/data/processed/archive_v4_2_archive/dataset_propagation_v4_2_phase2_scale_archive_gate_hf.parquet/part-001.parquet \
  --dataset 2025-07=ml/data/processed/archive_v4_2_archive/dataset_propagation_v4_2_phase2_scale_archive_gate_hf.parquet/part-002.parquet \
  --dataset 2025-10=ml/data/processed/archive_v4_2_archive/dataset_propagation_v4_2_phase2_scale_archive_gate_hf.parquet/part-003.parquet \
  --integrity-audit ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_integrity_audit.json

ml/.venv/bin/python ml/src/archive_v4_2/generate_gate_report.py \
  --result ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_gate_result.json \
  --output-dir ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_report \
  --profile m5

/Users/crypticpy/.local/bin/node ml/src/archive_v4/package_report.mjs \
  --input ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_report/REPORT.artifact.json \
  --output ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_report/REPORT.html
```

The archive requires at least 1% aggregate improvement, paired-day upper 95%
below zero, point improvement in at least three of four months, no supported
band regression above 3%, calibration limits, and all operational contracts.
Publish every month and every failure.

## Product and prospective phase

Archive approval permits shadow integration, not an immediate performance
claim. ReachMap consumes the identity-free core surface; StationCast applies
the existing private virtual-shack chain at inference. The locked prospective
window is 2026-08-01 through 2026-09-30, which is future-dated as of this
runbook. Keep the core in shadow mode until opt-in alpha/beta evidence and the
prospective protocol are complete.

## Recovery checks

```bash
# Source/test contract on M5
ml/.venv/bin/python -m unittest discover -s ml/src/archive_v4_2/tests -p 'test_*.py'

# Repository/source synchronization on M3
git status --short
git log -1 --oneline
git ls-remote origin refs/heads/feat/archive-multimonth-v3

# M5 storage and memory
df -h /Volumes/Projects
vm_stat
```

Do not delete a partial outcome namespace after it opens. The download,
bronze, opportunity, feature, audit, training, and scoring stages are designed
to resume from immutable completed artifacts.
