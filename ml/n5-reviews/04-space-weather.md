Read the plan, the three code files, the collector's solar source list, and probed the live endpoints. Findings below; measurements are from tonight (2026-09-07 ~00:55Z) unless marked "domain knowledge".

## Findings, ranked

**S1 — BLOCKER. IRTAM live endpoint is embargoed for anonymous users.**

- Claim (§1 table): "live endpoint computes any time".
- Measured: `gambit-coeffs?time=…&charName=foF2` returns 200 for 2026.09.05T00:00 and everything older, and HTTP 500 _"Data access level exceeds user permissions"_ for 2026.09.05T06:00, 09:00, 12:00 and 2026.09.06/07. Rolling ~48 h embargo — exactly the window a nowcast needs. This is independent of, and additional to, the CC BY-NC-SA problem.
- Change: IRTAM is archive-only, full stop. Remove it from §7 serving even in the "if licensed" branch; a licence negotiation must also cover a GIRO _access level_, not just terms.
- Verify: the curl matrix above, re-run at P2.

**S2 — BLOCKER. CODE GIM has no live twin; §4's "live from GloTEC (or CODE rapid)" is a product substitution.**

- CODE rapid covers day D and posts on D+1; there is no hourly current-day CODE map. Predicted GIMs are extrapolation and miss storms by construction. So training on CODE final and serving GloTEC means training on a spherical-harmonic (deg/ord 15) fit of slant GNSS TEC and serving a Kalman assimilation into IRI with a different plasmasphere treatment. Expected difference: several TECU, systematically structured by magnetic latitude and local time — i.e. exactly the axes the model splits on. (Latency/filenames here are domain knowledge; `ftp.aiub.unibe.ch` and the switch.ch S3 mirror were both unreachable from this sandbox, so the "predicted product name unverified" note stays unverified.)
- Change: train on the product you serve. GloTEC only in the feature vector; CODE final offline only, as the validation reference.
- Verify: don't gate on TECU agreement. Gate on **prediction** agreement — feed CODE-derived values into a GloTEC-trained model on the overlap and measure the Brier delta. That number is the substitution cost.

**S3 — BLOCKER. Archive-start skew makes the ionosphere block train/serve-skewed.**

- GloTEC archive starts 2025; the window is 2019-01→2026-07. ~80% of training rows get `_missing`, 0% at serve. XGBoost's default-direction handling means the present-branch statistics are fit only on the cycle-25 declining phase — no minimum, no rise — and every production row takes that branch.
- Change: pick one and write it into the config — (a) restrict the ionosphere-bearing model to the GloTEC era and keep the long-window model as router/fallback; (b) backfill 2019-2024 from CODE final through a fitted CODE→GloTEC map, validated on the 2025-26 overlap; (c) drop the block.
- Verify: add a **missingness-parity gate** for every feature, not just these: per-feature `_missing` rate in training vs in the 14-day shadow window must agree within a stated tolerance. §8 currently scores only Brier/calibration.

**S4 — HIGH. Midpoint sampling is the wrong geometry for HF.**

- Claim (§4): `tec_mid`, `fof2_mid`, `hmf2_mid`. A path MUF is set by the **weakest control point**, not the mean; P.533 uses the two 1000-km control points for absorption, the midpoint only for ≤4000 km, and per-hop reflection points beyond. On a grey-line path the midpoint value is meaningless. And most long DX midpoints sit over data-void ocean where every one of these products relaxes to climatology.
- Change: sample at N control points along the great circle; features = `min`, `mean`, `max`, and the along-path gradient. `min(foF2)` is the physically correct MUF driver.
- Verify: on the storm slice, `min` should separate storm from quiet more strongly than `mid`; compare permutation importance for both.

**S5 — HIGH. Ionospheric features must be anomalies against a climatology computed identically offline and online.**

- Absolute foF2/TEC carry the whole product-substitution bias (S2) and the network-drift bias (S10). A ratio to climatology cancels most of it and _is_ the storm signal the P.533 prior cannot already know. GloTEC ships an `anomaly` field for this reason.
- Change: primaries = `fof2_obs/fof2_clim` per control point, `tec/tec_clim`, `hmF2 − hmF2_clim`, with the denominator from the engine's own CCIR climatology. Absolutes secondary.
- Verify: recompute the S2 parity in ratio space — residual bias should drop by ~an order of magnitude. If it doesn't, the ratio design has failed and the block should be deferred.

**S6 — HIGH. Four inherited estimated-vs-definitive gaps, all real, all currently unmodelled.** (`ml/src/archive_v3/build_space_weather.py` vs `collector/src/collectors/solar.ts` + `ml/service/operational_weather.py`)

- **Kp**: train = OMNI2 col 39, GFZ _definitive_, 3-h step repeated hourly, so `diff(3)` is exactly a bin difference. Serve = `planetary_k_index_1m` (SWPC _estimated_, 1-min). `kp_delta_3h` is quantized in training and a continuous difference of a noisy series at serve; `kp_max_24h` over a 1-min series is biased high vs a max over eight 3-h values. Change: quantize the estimated Kp onto 3-h UT bins before computing the lookbacks at serve. Verify: KS test of the collector's 90-day `kp_delta_3h`/`kp_max_24h` distributions against the OMNI-derived training distributions, as a gate.
- **F10.7 — training leak**: `available_at = observed + 1 h` assigns the day's Penticton flux to 00 UT, but Penticton measures at 17/20/22 UT (confirmed: `f107_cm_flux.json` carries `reporting_schedule` Noon/Afternoon at 20:00/22:00Z). Training sees up to ~20 h of future; serving has yesterday's. Change: per-channel `available_at` = 20:00 UT + publication delay. Verify: assert no row's F10.7 originates after its issue time; expect and record the importance drop.
- **SSN — different variable, not a latency gap**: train = OMNI2 col 40, _daily_ SILSO v2. Serve = `observed-solar-cycle-indices.json`, which is **monthly** (latest entry `2026-08`, ssn 76.0, today 2026-09-07) — hence the 45-day `SOURCE_MAX_AGE_SECONDS`. Daily SSN varies 2-3× within a rotation. Change: drop `sunspot_number` from the contract, or serve SILSO daily provisional and train on the same. Verify: correlation of served-monthly vs OMNI-daily over 2025-26; below ~0.9 it is not the same feature.
- **Dst**: train = Kyoto final/provisional, whose _product version changes across 2019-2026_ — a year proxy, which §11.9 explicitly forbids. Serve = Kyoto real-time (`products/kyoto-dst.json`; measured ~55 min latency, 00:00Z available at 00:55Z). Real-time minus final is largest during storms, i.e. the gate slice. Change: train on the Kyoto realtime series for the whole window. Verify: RMS(realtime − final) on the named storm days; re-score the storm gate both ways.

**S7 — HIGH. GOES X-ray: the plan understates what exists and misses two traps.**

- "Not in repo" is wrong. `collector/src/collectors/solar.ts` already fetches `goes/primary/xrays-6-hour.json`, filters `0.1-0.8nm`, and writes `xray_flux` to `solar_snapshots`. It is simply absent from `SNAPSHOT_COLUMNS`/`RAW_WEATHER_FEATURES` in `ml/service/operational_weather.py`. Cheap win.
- Trap (a), **calibration convention**: GOES-13/14/15 long-channel fluxes carry the historical SWPC ÷0.7 scaling; GOES-16+ NCEI science-quality fluxes do not. A 2019-2026 archive spans the transition. 43% flux error → `^0.75` → ~1.3× in HAF ≈ 2-3 MHz of LUF, drifting with satellite epoch.
- Trap (b), **sampling**: the collector stores the instantaneous 1-min value every 15 min, so flare peaks are missed; training on the 1-min archive and serving a 15-min point sample is a distribution mismatch that is biased low exactly during flares.
- Change: normalise the archive to one convention explicitly; use `max(flux over last 15 min)` on both sides; fetch XRS directly in the inference service (§7 already plans fetchers) rather than from the snapshot.
- Verify: plot the 2019-2026 background flux level by satellite epoch — a step at the transition is the bug.

**S8 — MEDIUM. D-region formulation is under-specified and conflates three mechanisms.**

- Claim (§4): "`luf_proxy` from GOES X-ray flux and solar zenith angle". Correct form is the D-RAP/Stonehocker relation, absorption ∝ flux^0.75 · cos^0.75(χ), evaluated at the **sunlit control points** and taken as the path max/integral — not at the midpoint. It also needs splitting from PCA (≥10 MeV protons, polar cap, days-long — the proton flux is _already collected_) and auroral absorption.
- Change: three features — `haf_max_path`, `pca_polar_fraction` (proton flux × path fraction above ~60° CGM lat), `auroral_cross_fraction`.
- Verify: SWPC publishes the operational field live — `text/drap_global_frequencies.txt`, 2°×4° global MHz grid, updated every minute, confirmed 200/42 kB. Compare our computed HAF to it on quiet and flare epochs; ≤~1 MHz agreement validates the implementation. Use it as a reference, not a feature — there is no archive.

**S9 — MEDIUM. Auroral index choice.**

- AE/AL/AU/PCN correctly excluded and should stay excluded; SuperMAG SME is the same trap (no real-time, redistribution restrictions) — don't reach for it.
- Add **Hp30** alongside Hp60: same GFZ API (`index=Hp30`), same CC BY 4.0, 30-min cadence resolves substorm onset that Hp60 smooths. Note Hp30/Hp60 have their own nowcast-vs-definitive gap — the training pull and the collector hit the _same_ URL, so verify which version each gets for archival vs recent months.
- The most HF-relevant auroral quantity is geometric: path fraction inside a Kp-parameterised oval (Feldstein/Starkov form). Because it is a deterministic function of an index we already serve, offline/online parity is exact by construction. Prefer it to any new index.

**S10 — MEDIUM. Evaluating IRTAM coefficients is correct and cheap; the plan's validation doesn't test the evaluator.**

- Confirmed from a live file header: `Expansion Basis: JonesGallet_LinTrend`, `Basis Lengths: 14(temporal) x 76(spatial)`, `Earth Grid: 46 lats x 45 lons`, engine `NECTAR v0.2A_D3/1`. That is the CCIR functional form IRI's `GAMMA1` evaluates: ~150 lines given modip from IGRF. Risk is a silently wrong basis ordering producing a plausible field.
- §11.6 says "validate against DIDBase station values" — at _assimilated_ stations the fit is near-exact by construction, so that test can pass with a wrong basis. Change: two stages — (i) run the same evaluator on the IRI **CCIR** coefficient set and match PyIRI/iri2016 foF2 to <0.05 MHz (isolates the basis); (ii) then validate IRTAM at **non-assimilated** stations.
- Free bonus if it is ever built: the header lists assimilated stations per epoch, so `distance_to_nearest_assimilated_station` is an honest uncertainty feature. It also shows how thin the network is, and that it is _shrinking_: I counted **54** stations at 2019-06-15T12:00, **43** at 2025-06-15T12:00, and **39-40** across the Gannon storm (2024-05-10T00/18Z, 05-11T06Z). That downward drift across the training window is another year-proxy.
- Given S1, the evaluator buys only offline validation. Defer until licence _and_ access level are in hand.

**S11 — MEDIUM. GloTEC payload facts in the plan are wrong or assumed.** Measured from `glotec_icao_20260907T002500Z.geojson`:

- Grid is **2.5° lat × 5° lon (72×72 = 5184 points)**, not 5°. Cadence 10 min (declared in the payload).
- Publication latency **19-27 min** (directory mtime vs epoch label, e.g. `…T235500Z` posted 00:14, `…T002500Z` posted 00:47). So at issue time T the newest epoch is T−25 to T−35 min. Training must select `epoch ≤ T − 30 min`, not nearest-in-time, or it leaks up to half an hour.
- SWPC retention is **~31 days rolling** (4465 files, oldest 2026-08-07T00:25). The NCEI archive path is unverified — both `ncei.noaa.gov/data/glotec/` and `…/data/space-weather/access/` 404'd for me; find the real path before P1 budgets on "archive 2025→".
- `quality_flag` is **not** an error code. flag ≥ 3 covers **91% of Europe** but only **5% of the Southern Ocean** and 13% of the central Pacific — it tracks observation density, not badness. `anomaly` spans −8.45…+9.57, median 0.54, so it is neither a ratio nor obviously TECU.
- Change: confirm both against the NetCDF variable attributes before either becomes a feature or a filter. Carry `quality_flag` as categorical; never threshold on it.

**S12 — MEDIUM. The as-of join is a flat +1 h for every driver, and train/serve use different selection rules.**

- `build_space_weather.py` sets `available_at = observed + 1h` uniformly; `build_features.py:211` does `ON sw.available_at = g.target_hour` — an **equi**-join. Serving does something different: newest-observation-within-`SOURCE_MAX_AGE_SECONDS`, with per-source windows from 30 min to 45 days.
- Change: per-channel `available_at` (RTSW ~5 min, Dst ~1 h, Hp60 ~1 h, F10.7 ~20 h, SSN ~1 month) and a backward `join_asof` with an explicit `age` feature, mirroring the serving rule.
- Verify: replay a month of stored `solar_snapshots` through the offline builder and require per-hour vector equality. This is the "training-time feature equals serving-time feature" test the plan asserts but doesn't specify.

**S13 — MEDIUM. Is vertical TEC at a path point informative for HF? Weakly, and only conditioned.**

- foF2 ∝ √NmF2; TEC is the column integral and TEC/NmF2 (slab thickness τ) is itself the free variable. From the single live GloTEC snapshot, τ spans **268 km (p5) to 433 km (p95)** — and that is the model's own internally-consistent τ, so it is a _lower bound_ on reality (real τ runs ~200-500 km with a factor-2 diurnal/seasonal swing, inflated at the EIA crests and in storms). Assuming a fixed τ costs 8-15% in foF2 at those tails before any diurnal or storm variation — ~1 MHz at foF2 = 8 MHz, more than the 20 m/17 m boundary. TEC also includes the plasmasphere (10-50% at night), which contributes nothing to HF refraction.
- Change: GloTEC gives NmF2 and hmF2 directly — there is no reason to feed raw TEC as a primary. Keep TEC only as (a) the anomaly ratio and (b) the **along-path gradient**, which is the one thing TEC gives that NmF2 doesn't (off-great-circle propagation, EIA asymmetry) and which survives the τ ambiguity.
- Verify: ablate TEC-derived features with foF2/hmF2 retained. If TEC adds nothing, drop it — and the entire CODE dependency (S2) goes with it.

**S14 — LOW. The ionosphere block is HF-only; don't feed it to the 6 m model.** 6 m is Es/TEP-dominated; none of GloTEC/CODE/IRTAM carries foEs. Expect zero gain and added variance. State it in §4 and confirm per-task in the ablation.

**S15 — LOW. "Bit-identical offline and online" for the physics prior (§4) is not achievable as written** — TypeScript engine, Python builder. Either invoke the TS engine from the build (node subprocess, pinned commit) or specify a tolerance with golden vectors. Also version the prior inside the feature contract so an engine change fails closed rather than silently shifting a feature.

**S16 — LOW/legal. Licence ledger corrections.**

- GIRO/IRTAM/DIDBase: CC BY-NC-SA 4.0 — NC blocks a billed product and SA would attach to derived artefacts. Two independent blockers with S1. Correct call in §11.1; make it unconditional.
- CODE/AIUB: "CC BY 4.0" is asserted, not confirmed. S2/S13 push it offline-only anyway, so exposure is small but non-zero if it shapes a sold model.
- NOAA (GloTEC/GOES/D-RAP/SWPC): US Government, public domain, unrestricted — but **GloTEC is labelled experimental** (it lives under `/products/glotec/`, and SWPC gives experimental products no service guarantee). Design for withdrawal: `_missing` path plus the no-ionosphere ablation as a standing rollback, and say so in §11.
- GFZ Kp/Hp: CC BY 4.0 (the collector already reads `meta.license`).
- CEDAR/HamSCI: rules-of-the-road is the easy part; the real question for a monetized model is the underlying PSKReporter/RBN/WSPRNet contributor terms. Get that in writing **before** P1 puts 1.4 TB on disk, not after.

## Product table

| Product                                              | Cadence            | Latency at issue time         | Archive start                                       | Licence                   | Call                                              |
| ---------------------------------------------------- | ------------------ | ----------------------------- | --------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| GOES XRS 0.1–0.8 nm                                  | 1 min              | 1–3 min                       | NCEI 1986→ (GOES-16 2017→; convention change, S7)   | NOAA PD                   | **Ship v1** (live half already collected)         |
| Derived HAF (D-RAP form) at control points           | = XRS              | = XRS                         | computed                                            | n/a                       | **Ship v1**                                       |
| SWPC D-RAP grid (`text/drap_global_frequencies.txt`) | 1 min              | <1 min                        | none                                                | NOAA PD                   | **Verification reference only**                   |
| GOES ≥10 MeV protons                                 | 5 min              | ~10–13 min                    | NCEI 1986→                                          | NOAA PD                   | **Ship v1** (already collected)                   |
| GFZ Hp60                                             | 60 min             | ~1 h                          | 1995→                                               | CC BY 4.0                 | Already shipped; keep                             |
| GFZ Hp30                                             | 30 min             | ~30–45 min                    | 1995→                                               | CC BY 4.0                 | **Ship v1**                                       |
| Kp — SWPC estimated 1-min                            | 1 min              | ~5 min                        | SWPC rolling / GFZ definitive 1932→                 | PD / CC BY 4.0            | Shipped; **fix product gap (S6)**                 |
| Kyoto Dst realtime                                   | 60 min             | ~55 min (measured)            | WDC 1957→                                           | Kyoto, acknowledge        | Shipped; **retrain on realtime series**           |
| F10.7 (Penticton via SWPC)                           | 3×/day 17/20/22 UT | same-day evening              | 1947→                                               | PD / NRCan                | Shipped; **fix `available_at` (leak)**            |
| SSN (`observed-solar-cycle-indices`)                 | **monthly**        | up to ~5 weeks                | 1749→                                               | PD                        | **Drop or replace with SILSO daily**              |
| RTSW mag/plasma (DSCOVR/ACE)                         | 1 min              | ~5 min                        | OMNI 1963→                                          | PD                        | Shipped; keep                                     |
| **GloTEC** (tec, anomaly, hmF2, NmF2, qflag)         | 10 min             | **19–27 min (measured)**      | SWPC 31 d rolling; NCEI 2025→ (**path unverified**) | NOAA PD, **experimental** | **Ship v1, HF only**, gated on S3                 |
| IRI/CCIR climatology (anomaly denominator)           | static             | none                          | n/a                                                 | public                    | **Ship v1** (required by S5)                      |
| CODE final GIM (`COD0OPSFIN`, 1 h)                   | 1 h                | ~3–5 d                        | 1995→                                               | AIUB/IGS, verify          | **Defer — offline validation only**               |
| CODE rapid GIM                                       | 1 h                | ~1 d                          | 1995→                                               | as above                  | **Defer — not a live twin**                       |
| CODE predicted GIM                                   | 1 h                | ahead of time                 | –                                                   | as above                  | **Defer — climatological; name still unverified** |
| IRTAM/GAMBIT foF2, hmF2                              | 15 min             | **blocked <~48 h (measured)** | 2000→2025                                           | CC BY-NC-SA               | **Defer — two independent blockers**              |
| DIDBase station foF2                                 | 5–15 min           | –                             | 1930s→                                              | CC BY-NC-SA               | **Defer — sparse + NC**                           |
| AE/AL/AU/PCN, SuperMAG SME                           | –                  | –                             | –                                                   | –                         | **Stay excluded**                                 |

**Minimal v1 ionospheric set I would ship:** GloTEC foF2 (from NmF2), hmF2, and TEC anomaly + along-path gradient, sampled at P.533 control points, expressed as ratios/deltas against the engine's own climatology; plus GOES-XRS-derived HAF at the sunlit control points, the proton/polar PCA feature, and the Kp-derived auroral-oval-crossing fraction. That is **one** new live dependency (GloTEC), one already in the collector (GOES XRS), and zero licence exposure. Everything else — IRTAM, DIDBase, all three CODE products — defers to offline validation.

Files: `ml/NOWCAST-N5-PLAN.md`, `ml/src/archive_v3/build_space_weather.py`, `ml/src/archive_v3/build_features.py` (line 211, the equi-join), `ml/service/operational_weather.py`, `ml/src/archive_v4_2/feature_contract.py`, `collector/src/collectors/solar.ts`.
