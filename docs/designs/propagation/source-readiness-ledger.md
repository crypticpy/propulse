# Source, ownership and readiness ledger — candidate 0.1

Inspected 10 September 2026. Foundation base:
`c9d0bfb34dced85fbb03955b011108c8d2031cd8`. Issue states below are dated
observations, not claims that lanes are free. The parent session inspected live
GitHub issue bodies and open PR file lists; the initial overlap check found no
open PR touching the two new directories. Recheck before review/merge. No raw
private snapshots are part of the protocol.

| Boundary | Existing owner / inspected state | Reuse and prerequisite |
| --- | --- | --- |
| NowCast programme | [#294](https://github.com/crypticpy/propulse/issues/294), open | Separate detection event; no SNR/QSO reinterpretation |
| N5 programme | [#427](https://github.com/crypticpy/propulse/issues/427), open | Preserve pause/source decisions, frozen cuts, sealed data, engine hashes and owner-only promotion; this slice is not N5 authorization |
| F10.7 availability leak | [#450](https://github.com/crypticpy/propulse/issues/450), open | No training/serving edit; consumer must use approved available-at contract |
| SSN variable mismatch | [#451](https://github.com/crypticpy/propulse/issues/451), open | Preserve feature exclusion; do not reintroduce daily/smoothed equivalence |
| Backward as-of join/age | [#453](https://github.com/crypticpy/propulse/issues/453), open | No competing source latency implementation |
| Features/engine-hash fallback | [#463](https://github.com/crypticpy/propulse/issues/463), open | Exact N5 contract stays read-only |
| GloTEC/space-weather fetchers | [#464](https://github.com/crypticpy/propulse/issues/464), open | Reuse owner; actual source rights, fields, QC and latency remain unverified here |
| Prediction/exposure logging | [#465](https://github.com/crypticpy/propulse/issues/465), open | Reuse schema ownership; no duplicate logging table |
| Shadow scoring | [#466](https://github.com/crypticpy/propulse/issues/466), open | No replacement N5 scoring or threshold changes |
| Shadow paired comparison | [#467](https://github.com/crypticpy/propulse/issues/467), open | No sealed month access or recycled holdouts |
| Promotion/rollback | [#468](https://github.com/crypticpy/propulse/issues/468), open | No activation edits |
| Propagation UI/design family | [#906](https://github.com/crypticpy/propulse/issues/906), open | Design authority retained; this slice has no UI implementation |
| Satellite orbits | [#994](https://github.com/crypticpy/propulse/issues/994), open | First orbit PR #1029 already merged in foundation base; reuse it and leave remaining UI to that task |

The following source blobs were reconciled against the foundation base. This
identifies unchanged boundaries; it does not certify physics accuracy or imply
that every audit defect was reproduced or already fixed.

| Path | Git blob |
| --- | --- |
| `src/lib/utils/signal.ts` | `64e08251ff98bf8f2d44047d1b5727acd591a327` |
| `src/lib/utils/ionosphere.ts` | `0ada247b344940f00f766f4581ec00f50abd54a6` |
| `src/lib/utils/rayTrace.ts` | `d50c29996c4f55cb901efd7f66ee3c4010530a79` |
| `src/lib/utils/noiseModel.ts` | `1d14f35394b389ddc96957aa825f8ff4364e3655` |
| `collector/src/transforms/bands.ts` | `e134e6c78f8b6868099fff7a2f646ac7da2780ae` |

The all-band input reports that the collector band transform and radio normalizers
reject frequencies outside existing HF ranges. The transform blob matches the
input's cited blob. This is an ingestion prerequisite, not permission to broaden
frozen N5 filters. Full audit-to-current-main defect reconciliation remains owned
by #947 and its independently reproduced-defect successor; no production defect
is declared fixed by this PR. M12's invalid spherical covariance is a design defect
corrected only in these candidates and analytic fixtures.

| Proposed source/asset | Current qualification | Responsible delivery boundary / evidence needed |
| --- | --- | --- |
| ITU-R HF source/coefficients/noise | BLOCKED; pin inherited from design, assets not inspected | PROP-06 reference owner: actual source version, notices, redistribution rights, asset SHA-256, native build/test vectors, static-link/browser portability |
| VOACAP external comparator | BLOCKED; no eligible version/build established | PROP-23 benchmark owner: pin code/assets/build, matched inputs, valid domain, independent output provenance |
| GloTEC | BLOCKED; no actual product schema inspected | #464: exact fields/units/quality meaning, license, observation/publication/capture times and age policy; TEC/QC is not direct foF2 or measurement variance |
| IRTAM/GIRO/DIDBase | Disabled by existing N5 source decision | Existing owner must resolve rights/latency in a separately accepted change; optional adapter may remain disabled |
| Radio spots / activity archives | Activity evidence only in this slice | #465 / benchmark owner: exposure denominators, receiver availability, station characterization, failed/unknown label handling, selection identifiability |
| Characterized physical SNR corpus | BLOCKED; no eligible dataset established | #947 / PROP-23: independent uncensored SNR labels for included exposures, station/noise/power metadata, sampling population and rights |
| Ground/IRI/FIRI/geomagnetic packs | BLOCKED; source names are design proposals | All-band asset and LF/160 m owners: exact algorithm/flags, profile/collision origins, units, altitude/domain, provenance/rights and interpolation fixtures |
| DEM/weather/refractivity packs | BLOCKED; map data is not radio-profile validation | Terrain/weather owners: vertical datum/resolution, void/error policy, real model-level schema, issued archive completeness, local pack license/hash |
| Satellite/lunar/relay context | Geometry infrastructure only, no family qualification here | #994 and space-family owners: ephemeris/frame/time/age error, offline coverage, transponder/relay configuration and rights |
| Decoder/scatter response data | BLOCKED; no measured response/cross-section inspected | Station and mechanism owners: versioned experiment, exposure, duration/spread, parameter uncertainty and independent evidence |

Every acquired source needs owner, exact schema/version, variables/units, spatial
and temporal support, uncertainty meaning, access and redistribution evidence,
measurement/issue/publication/capture timestamps, archive completeness, SHA-256,
retention and offline packing policy. Publicly reachable is not synonymous with
licensed, as-issued or qualified. Unknown fields/rights remain unknown.

Named delivery roles above reserve responsibility; they are not fabricated agent
assignments or evidence a task has been claimed. The #946 orchestrator must assign
new family leaves before their blocked prerequisites can be discharged. All gates
in protocol 0.1.0 remain BLOCKED. Scientific second-opinion and current-head Fable
approval are pending; validator success cannot discharge either.
