# Archive V3 Release Checklist

## Complete

- [x] Frozen JSON configs, seeds, months, and temporal splits.
- [x] Resumable downloader and reproducible source-to-report pipeline.
- [x] Raw-source URLs, request parameters, sizes, hashes, and terms notes.
- [x] Exact opportunity-weight and feature-row reconciliation.
- [x] Rolling-origin tests before opening the locked archive month.
- [x] HF and independent 6m results with calibration and slice metrics.
- [x] 70/70 HF and 66/66 6m validation checks.
- [x] Self-contained animated report with no network dependencies.
- [x] Data card, model card, methodology, and scale/no-scale decision.

## Required before publishing weights or product probabilities

- [ ] Choose and add an explicit repository/model open-source license.
- [ ] Confirm WSPR terms for any derived-data or weight distribution.
- [ ] Implement a trusted P.533/VOACAP baseline and hybrid comparison.
- [ ] Evaluate unseen stations using private, fold-isolated callsign metadata.
- [ ] Run the unopened 2026-08 through 2026-09 collector transfer test.
- [ ] Set product calibration/error thresholds by band and distance.
- [ ] Add inference parity tests for the production scorer/export format.
- [ ] Document intended serving latency, monitoring, drift, and rollback.
- [ ] Decide whether fitted tree binaries are weights, build artifacts, or a
  separate versioned release.

## Decision

Publish the research code and aggregate evidence after selecting a license. Do
not publish model weights or present probabilities in-product yet. Do not start
an all-years or rented-GPU run until the open gates above are resolved.
