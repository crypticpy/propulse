# Propulse NowCast V4.2 Model Card

## Model

- Version: `propagation_v4_2_phase2_scale-phase3-candidate-50000000`
- Open core: calibrated identity-free WSPR path probability
- Engine: XGBoost 3.3 histogram trees, native ARM64/OpenMP
- Policy: 70% A4 recent-cycle plus 30% A5 recency-weighted probability
- Core features: 91 geometry, solar illumination, prior-completed-hour space
  weather, band, availability, missingness, and lagged path-evidence values
- Serving fallback: frozen physics profile when freshness is stale or missing

## Intended Use

NowCast estimates the probability of at least one WSPR decode for a declared HF
path, band, issue time, power, and available live context. ReachMap may batch the
core over a world grid. StationCast may apply the user's private deterministic
station envelope at inference. The open core must not receive callsigns, station
identity, exact private home locations, or raw virtual-shack records.

## Evidence

| Scope | Relative Brier improvement vs frozen V3/B2 |
|---|---:|
| October-November 2024 development | 2.354% |
| Untouched December 2024 | 2.038% |
| Locked 2025 quarterly archive | 2.134% |

The candidate improves in `4/4`
locked 2025 months and passes every preregistered December and archive gate.
Offline and service predictions match exactly in Phase 3 validation.

## Not Approved

- No guaranteed-contact or causal propagation claim.
- No FutureCast claim until genuine issued-forecast history exists.
- No learned StationCast residual until consent, sample-size, and selection-bias
  gates pass.
- No 6m claim from this HF model; 6m remains a separate mechanism track.
- No prospective claim before the frozen 2026-08-01 to 2026-09-30 evaluation.

## Limitations

WSPR outcomes depend on receiver deployment, listening and reporting behavior,
interference, mode, and local noise as well as propagation. Locked tests compare
against frozen V3/B2. Pinned P.533 remains a bounded development baseline and
was not recomputed across the full locked archive. Use confidence, freshness,
OOD flags, assumptions, and fallback provenance with every prediction.

## Distribution

The public manifest and checksums are tracked in Git. The approximately 252 MiB
serving bundle should be published through a versioned model release registry or
Git LFS, not committed as an ordinary GitHub blob. License and release tags must
be finalized before public binary distribution.
