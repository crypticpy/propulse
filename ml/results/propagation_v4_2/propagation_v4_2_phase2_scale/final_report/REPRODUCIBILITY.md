# Propulse NowCast V4.2 Reproducibility Guide

## Environment

The large workflow is frozen to an Apple M5 Max with 128 GiB unified memory,
native ARM64 Python, XGBoost 3.3 with LLVM OpenMP, AC power, and High Power mode.
The runtime guard rejects the wrong architecture, core topology, memory budget,
power state, OpenMP build, or active macOS CPU limit.

Use [`PERSONALIZED-PROPAGATION-V4.2-M5-RUNBOOK.md`](../../../../PERSONALIZED-PROPAGATION-V4.2-M5-RUNBOOK.md)
for exact cohort, training, scoring, packaging, gate, and report commands. Large
data, models, caches, and spill files belong under `/Volumes/Projects/PropulseML`.

## Parallel Execution Contract

- DuckDB cohort builds: 18 threads, 80 GB limit, external SSD spill.
- 20M fits: two spawned workers, nine XGBoost and four Arrow I/O threads each,
  external-memory QuantileDMatrix.
- 50M fits: two spawned workers, nine XGBoost and four Arrow I/O threads each,
  iterator-fed in-memory QuantileDMatrix.
- Batch scoring: benchmark-selected 18 XGBoost, 18 Arrow CPU, and six Arrow I/O
  threads with 100,000-row batches.
- API serving: one XGBoost thread per request by manifest default.

XGBoost has no Metal tree-training backend. A rented NVIDIA GPU is not required
for this result and would need a separate reproducibility benchmark before use.

## Final Evidence Inputs

- `ml/results/propagation_v4_2/propagation_v4_2_phase1_5m/evaluation_results.json`: `2545e90622eee8b56f7e4652eae9c51a46d73cc82b1ff5882efe1994d44bca95`
- `ml/results/propagation_v4_2/propagation_v4_2_phase1_5m/conditional_results.json`: `77bbbcbeca13b99c70e25a23b5d91403a4bf9f45ef23fd48c9bd19b7ac39719c`
- `ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/evaluation_20m_results.json`: `025448137bd7a8297dc98a789355e1f85f26b393e364b71ba09d03b023bb31ec`
- `ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/evaluation_50m_results.json`: `235b55c42ef9d364880777f4406079eb87816525b827c489d197c1ba9ad83c30`
- `ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/training_50m_results.json`: `b05b16f7f8ee706570e122603ffd8e06a120e9fe1bcb40586d971ef6ebd6ca38`
- `ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/backend_benchmark_decision.json`: `aabf90a893a5118f182edc16c6556cadd9d18858a44623881db466c9e618b7d3`
- `ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/prediction_thread_benchmark.json`: `3a7c70abebd228e73856b7b7b3d6c5074acd15cc52f84f7f1b50a6a3621434fc`
- `ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/phase3_candidate_validation.json`: `fcdb7a3d57788f4885ff2124ccd82fda11567e9e8b61b9d126e702b826947a5f`
- `ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_gate_result.json`: `9278d8cc706ba85072be3a05664c761b4b0c43d2c465c6140ad68c0261dccf64`
- `ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/archive_gate_result.json`: `fab36516662aa5af4d834fa1add7429757dc31e2194c89ff41812f7362c2a082`

`FINAL_REPORT_EVIDENCE.json` records this inventory again and drives every chart,
table, metric, and quantitative statement in `REPORT.html`.
