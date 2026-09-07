## Findings, ranked

**S1 — The success label is a max over the RX population, so "propagation" is confounded with receiver count.**

- _Plan claim:_ §3.3 "Success = at least one decode of that TX field by that RX field in the slot"; §11.4 claims detection≠reachability is handled by exposure-aware opportunities.
- _Physics/statistics:_ exposure fixes _whether anyone was listening_, not _how many_. P(≥1 of N receivers decodes) rises with N; an EU field with 40 PSKReporter receivers has an effective sensitivity ~10·log10(40/2) ≈ 13 dB better than a 2-receiver African field at identical propagation. Reporter density varies by >10× between EU/NA and everywhere else, and grows year over year. This is _the_ network-detection-vs-propagation confusion in the plan, and §3.6's rank-within-(band,hour) fix applies only to recency features, not to the label.
- _Change:_ make the label a rate over receivers, not an OR: `successes = #(distinct RX stations in field that decoded ≥1 TX station in field)`, `opportunities = #(RX stations active on that band/submode/slot) × #(TX stations active)`, or the pairwise station-cross-product capped. Keep the field aggregate as the serving grain but the numerator/denominator must both scale with population. Add `rx_station_count` and `tx_station_count` as features anyway so residual population effects are absorbed, not smeared into the target.
- _Verify:_ on one Madrigal month, regress current `success_rate` on log(receiver count) within (band, hour, distance bucket) at fixed physics-MUF margin. If the slope is significantly positive (it will be), the current label is a receiver-count estimator.

**S2 — The slim parquet schema, not the plan, is the irreversible decision, and it currently throws away the three things you need most.**

- _Plan claim:_ §9 "raw deleted after convert"; §3 "Slot = 15 min"; §3 grain question "build cells at both field and grid4"; §5 per-mode heads.
- _Reality in `ml/src/madrigal_convert.py`:_ it truncates `ut1_unix` to `hour_utc` (no 15-min slot possible), keeps only 2-char fields (no grid4, no lat/lon → the field-vs-grid4 experiment cannot be run), collapses `smode` to `digital`/`cw` (FT8, FT4, WSPR, JS8, Q65, MSK144 all become one class — so per-mode heads and per-mode SNR thresholds are undefined), and drops `tfreq` (no subband, no 60 m channel, no 10 m FM/beacon separation). Re-pulling is ~15 TB.
- _Change:_ freeze a new slim schema in P0 _before_ P1: `ut1_unix` (second resolution), `tx_lat/tx_lon/rx_lat/rx_lon` rounded to 0.05° (~5 km, ≪ any grid4), `smode` verbatim, `tfreq` kHz, `ssrc`, `sn`, plus derived `band`/`mode_class`. Cost is roughly +60% on 500 MB/day; still under the 4 TB budget. Deleting raw before this is settled is the one unrecoverable mistake in the plan.
- _Verify:_ convert one day both ways, diff row counts and column sizes, confirm ≤0.9 GB/day.

**S3 — Field-grain cells cannot express the skip zone or the hop count, which is most of what an operator asks about.**

- _Plan claim:_ §3 cells keyed on 2-char fields; §12 leaves grain "to settle with data".
- _Physics:_ a field is 10° lat × 20° lon = ~1112 km × 1570 km at 45°N (2224 km at the equator). One F2 hop is 2000–3500 km (hmF2-dependent: ~3200 km at hmF2 250, ~4100 km at 400). So the _within-cell_ endpoint uncertainty (±500–1100 km, 1σ) is comparable to a hop. Consequences: (a) `ceil(dist/3500)` flips hop count for any path near 3500/7000/10500 km, and each extra hop is another D-region traverse plus a ground reflection (~1 dB over seawater, ~4 dB over dry ground — 12 dB across 4 hops on 160 m); (b) the 10 m/6 m skip zone (0–1500 km) is entirely inside one field, so same-field and adjacent-field cells average "dead in the skip zone" with "loud one-hop" and the model learns a mush; (c) 40/80 m short paths mix NVIS (needs foF2 > f, high angle) with one-hop DX (needs the opposite). Activity centroids (`field_centroids.parquet`) fix the mean, not the variance.
- _Change:_ two-tier grain. Keep field as the serving key, but (i) build the cell key at grid4 whenever `tx_field == rx_field` or the fields are adjacent, and (ii) for every field-pair cell carry the _empirical_ endpoint distance distribution from the retained lat/lon: `dist_p10/p50/p90`, `dist_iqr`, and `frac_inside_skip` = share of the cell's plausible endpoint pairs shorter than the band's estimated skip distance. Also exclude or task-split `tx_field == rx_field` — those are ground-wave/NVIS/Es, a different physics regime, and they're a large row share in EU.
- _Verify:_ one month, one band pair (40 m and 10 m), decompose decode-rate variance within (field-pair, band, hour) by true great-circle distance quartile. If within-cell distance explains >15–20% of variance on 10 m/40 m short paths, field grain is disqualified there; on >5000 km paths it will explain almost nothing (which is the argument for keeping field grain for DX).

**S4 — Midpoint ionosphere instead of control points. This is the plan's central physics error.**

- _Plan claim:_ §4 "sun elevation at TX/RX/midpoint", `fof2_mid`, `hmf2_mid`, `tec_mid`, `muf_ratio` from foF2_mid; §4 `luf_proxy` from "GOES X-ray and solar zenith angle".
- _Physics:_ P.533 does not use the midpoint. Path MUF for d ≤ 4000 km is set at the d/2 control point; for d > 4000 km it is the **minimum** of the MUFs at two control points 2000 km inside each terminal (with E-layer screening checked at 1000 km from each end). On a long E–W path the midpoint can be in full sun while a control point sits at the terminator with half the foF2 — midpoint foF2 systematically overstates MUF and erases the day/night asymmetry that is the whole diurnal story. Likewise D-region absorption is a _sum along the path_ at each hop's 60–90 km traverse, weighted ~cos^0.75χ/(f+f_H)²; one `sun_elev_mid` is meaningless for a 3-hop path spanning a terminator. `dark_frac` in `build_features.py` is computed from **3 samples** (tx/mid/rx) — for a 12,000 km path that is one sample per 6000 km.
- _Change:_ the repo already has the right primitives (`calculateReflectionPoints`, `calculateM3000F2`, `calculateDLayerAbsorption`, `getAbsorptionAtLocation`, `hopElevationAngle`, `calculateLUF`). Emit: `fof2_cp_min`, `fof2_cp_max`, `m3000f2_cp` (use M(3000)F2 directly from the map product — it's the observable; hmF2 is derived from it, so `calculateM3000F2(hmF2)` runs the relation backwards), `muf_path = min over control points`, `muf_margin_db = 20·log10(muf_path/band_mhz)`, `absorption_sum` over the actual reflection points, `n_reflection_points_sunlit/dark`, and `path_dark_frac` at ≥1 sample per hop (min 9). Keep `sun_elev_tx/rx` (terminator/antenna) and add `terminator_crossings`.
- _Verify:_ fit mid-only vs control-point features on one month; separately, plot the mid-only model's residual against |Δlon| of the path — a systematic sign flip with E–W extent is the diagnostic that the midpoint is doing the damage.

**S5 — No magnetic coordinates, no auroral oval, no PCA. The storm slice is therefore unlearnable.**

- _Plan claim:_ §4 drivers = Kp/ap/Dst/Hp60/F10.7/Bz…; §2 storm slice gated on Kp ≥ 7; §11.7 "physics as floor".
- _Physics:_ every storm effect on HF is organised in **geomagnetic** latitude. The north magnetic pole is in the Canadian arctic, so a Chicago–Oslo path crosses ~10–15° more magnetic latitude than a same-geographic-latitude Siberian path. The oval's equatorward boundary moves as roughly Λ ≈ 67° − 2·Kp; the moment a control point is inside it, auroral absorption kills the path at all HF within minutes, independent of foF2. Separately, **polar cap absorption** from an SEP event is driven by ≥10 MeV proton flux, not Kp: a Kp = 3 day with a 100 pfu proton event closes every polar path for two days and the model has no input that says so (the collector's `proton_flux_10mev` exists in the solar table and the plan's feature list never mentions it). And TEP on 6 m and the equatorial anomaly crests are ±10–25° _dip_ latitude constructs.
- _Change:_ add `mag_lat_tx/rx` and `mag_lat_cp_max` (IGRF/CGM), `oval_margin = mag_lat_cp_max − (67 − 2·Kp)`, `crosses_polar_cap` (min |mag lat| along path > 75°), `dip_lat_cp`, `crosses_geomagnetic_equator`; add `proton_flux_10mev` and its 24 h max, meaningful only through the polar-cap interaction.
- _Verify:_ on 2024-05-10/11, slice residuals by control-point magnetic latitude band (<40 / 40–60 / >60). Geographic-only models will be biased in opposite directions in the two outer bands and look "fine" on average.

**S6 — "Storm" is treated as one condition; it is at least four, with opposite signs.**

- _Plan claim:_ §2(c) storm slice = named Kp ≥ 7 days scored together; gate = "Brier not worse than physics".
- _Physics:_ (1) initial/positive phase, first ~0–6 h after SSC: foF2 _rises_ at mid-latitudes, especially in the afternoon sector and the winter hemisphere — 20/15/10 m can beat quiet conditions; (2) main/negative phase, ~6–48 h: composition-driven F2 depletion of 30–50%, strongly **summer-hemisphere** weighted, bands close top-down; (3) auroral absorption: minutes-scale, latitude-gated, band-independent; (4) PCA: days-long, polar-only, proton-driven. Averaging these into one slice and one gate will pass a model that is wrong in both directions.
- _Change:_ define phase from Dst/SYM-H, not Kp: `dst_min_24h`, `dst_rate_3h`, `time_since_ssc`, `time_since_dst_min`, `ap_integral_24h`, and a derived `storm_phase ∈ {quiet, initial, main, recovery}`. Score the storm slice as phase × mag-lat band × band group, and pair every storm day with a matched quiet day (same season, same F10.7 ±10) so the slice does not conflate storm with season.
- _Verify:_ the positive-phase claim is directly testable in your own data — on 2024-05-10 06–12 UT, mid-latitude 15/10 m cells should show _above_-monthly-median success before collapsing. If your storm slice can't reproduce that, the slice design is wrong before any model is fit.

**S7 — The "workable" SNR thresholds are inconsistent in reference bandwidth, inconsistent with the app's own engine, and measure decode not QSO.**

- _Plan claim:_ §3.5 FT8 −20, FT4 −17, WSPR −28, "CW +3 per RBN convention".
- _Physics:_ WSJT-X SNR (hence PSKReporter and WSPRNet) is referenced to **2500 Hz**. RBN/CW Skimmer reports in a ~500 Hz noise bandwidth — ~7 dB offset. Putting both into one `median_snr` column and one threshold table biases the CW head and any cross-source SNR regression by that 7 dB. Second, `src/lib/utils/signal.ts` `MODE_PARAMETERS` (which the wall's `EngineComparisonStrip` compares against, per `hamclock-wall-spec.md` §1536ff) uses FT8 −21, CW −8, RTTY −5, SSB +3 in 2500 Hz ref. The plan's CW +3 is 11 dB from the engine's −8; a model head trained at one threshold and displayed against another will generate systematic "DISAGREE" verdicts that are pure artifact. Third, a decode threshold is ~50% decode probability one-way; a QSO needs the reverse path and QSB margin — `recommendations.ts` already uses `minSNR + 6` for "optimal" and `isSignalDecodable` uses `minSNR − 3`.
- _Change:_ (a) normalise all SNR to 2500 Hz at convert time with a per-`ssrc` offset, carry `ssrc` and `snr_ref_bw`; (b) import thresholds from `MODE_PARAMETERS` into the ML config with a contract test asserting equality — one source of truth; (c) emit two heads: `p_decode` (at threshold) and `p_qso` (threshold + 3 dB, and where the data supports it, reciprocal within the slot).
- _Verify:_ histogram `sn` by `ssrc` on one Madrigal day; the CW/RBN mode of the distribution should sit ~7 dB above the PSK mode at comparable geometry. If it does, the offset is real and currently unhandled.

**S8 — SSB is served as "digital + margin" with the margin unstated, and there is a free ground truth being ignored.**

- _Plan claim:_ §2 "phone served from digital + margin, stated openly".
- _Physics:_ the margin is derivable, not arbitrary: SSB +3 vs FT8 −21 in the same 2500 Hz reference = 24 dB, minus a typical 3–7 dB power advantage of SSB operations over FT8 → "SSB workable ≈ FT8 median SNR ≥ roughly +3 dB in this cell", which the plan's own `median_snr`/`p90_snr` per cell already gives you as a transform, no separate model needed.
- _Change:_ define phone as a documented transform of the SNR head, and validate it against **DX cluster spots**, which the collector already ingests and which are human SSB/CW QSOs — the only phone ground truth that exists. The plan never mentions using them.
- _Verify:_ for cells with cluster SSB spots in the window, compute the FT8 median SNR; the SSB-spotted cells should concentrate above the derived cut. That's a one-query check and it turns an asserted margin into a measured one.

**S9 — Long path is invisible, so LP decodes will be repaired by pair memorisation.**

- _Plan claim:_ §4 geometry = distance, bearing, endpoints, midpoint (short path only).
- _Physics:_ on 20 m grey line and 40 m at the right hours, a meaningful share of decodes between far-separated fields arrive **long path** — physics says the SP circuit is closed, the network says decoded, and the only way the model can reconcile that is by learning the field pair. That is the exact memorisation failure that killed A6/A7.
- _Change:_ compute both solutions and give the model both: `dist_lp = 40008 − dist_sp`, and the darkness/absorption/control-point blocks for **both** routes, plus `route_muf_margin_best = max(sp, lp)` and `lp_darkness_advantage`. Also `crosses_polar_cap` doubles as the proxy for skewed paths where great-circle geometry fails outright.
- _Verify:_ on 20 m 12–16 UT EU↔VK/ZL cells, correlate the SP-only model's positive residual with the LP darkness fraction. A clean correlation means the model is currently paying for LP with memorisation.

**S10 — Sporadic-E is absent, and it is most of 6 m and much of summer 10 m.**

- _Plan claim:_ §2 6 m is a separate task "because 6 m physics is different"; Es appears nowhere in §4.
- _Physics:_ mid-latitude Es peaks May–Aug (NH) / Nov–Jan (SH), supports 500–2300 km single-hop and 2000–4500 km multi-hop on 6 m/10 m, and is uncorrelated with F10.7 and Kp. A 6 m model without an Es representation is a seasonal climatology with a MUF term that is closed 90% of the time.
- _Change:_ three cheap things: (a) signed-season feature (below) so doy is hemisphere-aware; (b) `dip_lat` (Es occurrence is organised by magnetic latitude, with a mid-latitude maximum and an equatorial type); (c) an explicit `es_range_flag` = distance in the single-hop-Es window (900–2300 km) combined with `muf_margin_db < 0` — that conjunction _is_ the Es label, and letting the model see it as a feature rather than rediscovering it costs nothing. Also state that TEP (afternoon/evening, ±10–25° dip lat, symmetric about the magnetic equator) is a distinct 6 m mode requiring `crosses_geomagnetic_equator` + `dip_lat_symmetry`.
- _Verify:_ June 2024 6 m, plot success rate vs distance — the Es hop peak at ~1200–1800 km will be obvious, and a model with only `muf_ratio` will miss it entirely.

**S11 — Season is encoded globally, so the winter anomaly and the summer negative phase cancel out.**

- _Plan claim:_ `doy_sin`/`doy_cos` in `build_features.py`, `day-of-year` in §4.
- _Physics:_ June is NH summer and SH winter. Mid-latitude midday foF2 is _higher_ in winter (winter anomaly); 160/80 m absorption is lower in the winter hemisphere; storm negative phase is a summer-hemisphere effect. A global doy sinusoid encodes June identically for W and VK; a tree can learn doy × lat but must spend many splits on it.
- _Change:_ `local_season = cos(2π(doy − 172)/365) · sign(lat)` at TX, RX, and control points, plus `season_asymmetry = local_season_tx − local_season_rx` (the transequatorial seasonal term).
- _Verify:_ residual of the current model on 20 m N–S transequatorial paths vs month; a sign flip between hemispheres is the tell.

**S12 — The gate measures gain over _raw_ physics, which will report a recalibration as a physics win.**

- _Plan claim:_ §4 physics prior as a stacking feature; §6 "≥ x% Brier over physics on every held-out month", references include "P.533 physics".
- _Reason:_ the P.533 output is a circuit reliability for assumed power/antennas/required SNR; the label is a network detection rate. They live on different scales. A gradient-boosted model handed the physics score will spend its first trees learning a monotone per-band recalibration of it, and that alone will produce most of the headline Brier gain. That is not new knowledge.
- _Change:_ the physics baseline in every table must be **isotonically calibrated per band on the calibration month**, not raw. Report gain over calibrated physics as the primary number, raw physics as a footnote. Also run the no-physics-prior ablation, not just no-ionosphere/no-recency — otherwise you cannot tell whether the model added anything beyond wrapping the engine.
- _Verify:_ fit a 1-feature isotonic model on the physics score alone and put its Brier in the table. If N5's gain over _that_ is small, you have a calibrator, not a nowcast.

**S13 — Product outputs the plan does not target: band ranking, opening windows, confidence, SNR margin.**

- _Plan claim:_ §6 metrics = Brier/logloss/PR-AUC/ECE + slices; goal = per-cell probability.
- _Reason:_ the operator question is an **ordering** ("which band now"), a **window** ("when does 15 open to JA"), and a **margin** ("how much above threshold"), not a probability. Per-band calibration does not imply correct cross-band ranking — a model can be perfectly calibrated on each of 9 bands and still rank them wrong at every hour. The wall spec's `EngineComparisonStrip` and the Best-band report are judged on exactly the ranking.
- _Change:_ (a) add to §6 a listwise band-ranking metric — top-1 agreement with the observed best band, and pairwise-ordering accuracy — and gate on it; (b) require that every N5 feature be computable from **forecast** driver values, or the model can never produce the opening window. This is a hard constraint on the ionosphere block: GloTEC is nowcast-only. CODE publishes 1-/2-day predicted GIMs — the plan flags the filename as unverified; make verifying it a P2 exit criterion, because the forward capability depends on it and the whole "when will it open" product line is downstream. (c) emit per-prediction uncertainty (binomial interval from `opportunities`, or quantile heads on the SNR regression) — the wall's agree/split/disagree logic needs it to avoid claiming DISAGREE on a two-opportunity cell. (d) make the **SNR margin in dB** the primary surfaced number and the probability secondary; "40 m: +6 dB over FT8 threshold, 12 dB under SSB" is the answer an operator can act on.

**S14 — Unmodelled activity confounders that the plan lists but does not feature-ise.**

- Power and antenna are nowhere in the data; between fields, ERP × RX-system varies by ~40 dB. The plan's goal sentence — "the probability that _a station_ operating there is workable" — is not what the label measures ("the probability that the _aggregate_ of field X was heard by the _aggregate_ of field Y"). Either fix the label per S1 or restate the product claim, because the wall presents this number as personal.
- FT8 subband congestion: in a contest hour, 50 signals in 2.5 kHz reduce decode rate through mutual interference, not propagation. Add `congestion_rank` = spots per active receiver in the RX field within (band, hour), and replace `madrigal_build_cells.py`'s hardcoded 4-date `CONTEST_DATES` with the real contest calendar already in `src/lib/data/`.
- Duty cycle differs by mode: WSPR ~20% of 2-min slots, FT8 alternating 15 s slots. "Opportunity" must count _transmission_ opportunities, not wall-clock slots, or WSPR and FT8 exposure are incomparable.
- Portable/maritime callsigns (`/P`, `/MM`, DXpeditions) geolocate to their home field in the collector's `call_field` majority vote and inject phantom long paths; filter `/`-suffixed calls or exclude them from the pair universe.
- Exposure must be per (band, **submode**), not per band: a station monitoring 14.074 is not a receiver for 14.200.

**S15 — Two multiplicative weight systems and a seasonal holdout.**

- `madrigal_build_cells.py` downsamples negatives with a compensating `weight`, and the plan weights the Bernoulli by `opportunities`. How these compose is unstated; getting it wrong silently invalidates every Brier number in §6. State the composition and unit-test it (weighted mean of the target must equal the unweighted population mean on a held-out sample).
- The sealed prospective gate (2026-05-01 → 07-15) is 2.5 months of NH late-spring/summer — Es season, high absorption, summer negative-phase storms. A model tuned to pass it is tuned to summer. Either add a second sealed window in a different season or state the gate is seasonal. Also: with Dec 2024 as a locked gate and Nov 2024/Jan 2025 in training, confirm that the pair universe, centroids, and any rank-normalisation statistics are computed **train-only** — those are the leak paths, not the 24 h lag.

**S16 — Smaller physics notes.**

- `fof2_proxy = 0.9·(180 + 1.44·SFI)^0.25·cosχ^0.25` in `madrigal_build_cells.py` is a Chapman form appropriate to the **E** layer; F2 does not follow Chapman and night foF2 is 2–4 MHz absolutely, not a fixed 42% of noon (which is what the `clip(0.03, 1)` floor produces — accidentally near-right at mid-latitudes, wrong at high latitude and in winter). When measured foF2 is missing, fall back to `_missing` + the engine's `calculateF0F2`, never to this proxy silently.
- `ceil(dist/3500)` fixes the max hop at a 300 km reflection height. Use `hopElevationAngle`/`calculateReflectionPoints` with the actual hmF2.
- foE is missing and free: the engine has `calculateF0E`. Daytime E-layer screening caps 40/30 m and carries many daytime 20 m short paths; `e_muf_2000 ≈ 3.6·foE` at the 1000 km control points is the correct screening test and it is a deterministic function of zenith angle and SSN.
- Ground conductivity along the path is absent: seawater vs dry ground is ~3 dB per ground reflection, ~12 dB across a 4-hop 160 m path — the entire difference between working JA and hearing nothing. A static land/sea raster fraction along the great circle is cheap.
- Licence ledger: PSKReporter's own terms are not in §1 (only RBN's "unstated" and GIRO's NC). PSKReporter data reaching a billed product via Madrigal deserves the same line as GIRO.

## Three features I would insist on

1. **Control-point ionosphere block** — `fof2_cp_min`, `m3000f2_cp` (used directly, not back-derived from hmF2), `muf_path = min over P.533 control points`, `muf_margin_db`, and the absorption integral `Σ cos^0.75χ/(f+f_H)²` over the actual reflection points with `n_reflection_points_sunlit/dark`. Replaces every `*_mid` scalar. This is the difference between a model that knows P.533 and one that memorises pairs.
2. **Geomagnetic geometry** — `mag_lat_tx/rx`, `mag_lat_cp_max`, `oval_margin` (control-point mag lat minus the Kp-derived boundary), `crosses_polar_cap`, `dip_lat_cp`, `crosses_geomagnetic_equator`; plus `proton_flux_10mev` which is meaningless except through the polar-cap interaction. Without this the storm slice cannot be learned and its gate is decorative.
3. **Within-cell distance distribution + both route solutions** — `dist_p10/p50/p90` from retained lat/lon, `skip_distance_ratio` per band, `frac_inside_skip`, and the full darkness/absorption block computed for the long-path route as well as short. This is what makes field-grain cells survivable and it is the only fix for LP-driven memorisation.

(If a fourth: signed season `cos(2π(doy−172)/365)·sign(lat)` at TX/RX/control points. Nearly free, and it is the winter anomaly, the summer negative phase, and the Es season in one column.)

## Three I would drop

1. **`tec_mid` / `tec_tx` / `tec_rx`.** Vertical TEC is the full-column integral, dominated by the topside above hmF2; slab thickness varies ~2× diurnally and **decouples from foF2 precisely during storms**, i.e. exactly when you need it. Once foF2 and hmF2/M(3000)F2 are in, TEC is a correlated lower-information channel and three more live fetchers to keep healthy. If GloTEC is the source, `tec` and `NmF2` come from the same assimilation and it is redundant by construction. Keep at most `tec_gradient_along_path` (horizontal gradients cause skew and are genuinely not in foF2).
2. **`path_success_prev2` and `prev3`.** On an hourly grid they are ~0.9-correlated with `prev1`; each adds a serving dependency, a latency-simulation assumption, and another route back to the persistence trap that capped A6 (one lag at 49% of gain, four at 72%). Keep `prev1` and `prev24` as ranks with availability flags, drop 2 and 3.
3. **`is_weekend`, and raw `bearing_sin`/`bearing_cos`.** Weekend is an activity confounder dressed as physics — it will teach the model that Saturday propagates better and then be wrong on a Tuesday DXpedition; if you want the confounder, use congestion and population ranks explicitly. Raw compass bearing has no propagation meaning (the physics cares about the path's angle to the terminator and to the magnetic meridian, not to true north) and bearing + distance ≈ the field-pair identity, i.e. it is a leak. Replace with `angle_to_terminator` and `angle_to_magnetic_meridian`.

(Next on the chopping block if slots allow: `by`, `bt`, `plasma_beta`, `alfven_mach`, `magnetosonic_mach` — solar-wind MHD parameters reach HF only through geomagnetic activity, which Kp/Hp60/ap/Dst already summarise, and they are five more channels to serve.)

## Storm days

Derive the list programmatically from the OMNI Dst series you already have — don't hardcode it. Rule: **main-phase days** = `min(Dst) ≤ −100 nT` (with ≤ −200 nT flagged as severe); **PCA days** = `≥10 MeV proton flux > 10 pfu` scored separately and only on polar-crossing paths; each storm day paired with a matched quiet day (same month ±3 weeks in an adjacent year, F10.7 within ±10) so the slice does not confound storm with season.

Named anchors inside the 2019-01 → 2026-07 window, for sanity-checking that the rule fires:

| Date (UT)     | What                                                                                      | Why it's in the slice                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2024-05-10/11 | Gannon, G5, Kp 9, Dst ≈ −412 nT, with an S1–S2 proton event from 05-09                    | The reference superstorm; positive phase on 05-10 morning then deep negative phase              |
| 2024-10-10/11 | G4, Kp 9−, Dst ≈ −335 nT, preceded by S3 protons from 10-09 (X1.8 on 10-08)               | Storm **and** PCA in one event — the case that separates Kp-driven from proton-driven closure   |
| 2025-11-12/13 | G4, Kp 8.667 (9−), Dst ≈ −217 nT, SYM-H ≈ −254 nT, consecutive X-class CMEs from AR 14274 | Recent, well-documented, and inside the training window with dense FT8 coverage                 |
| 2025-01-01    | G4 threshold reached, from CMEs launched 2024-12-29                                       | Winter-hemisphere storm — pairs against the summer ones for the hemispheric negative-phase test |
| 2025-06-01/02 | G4 watch/storm                                                                            | NH summer negative phase, the worst case for high-band closure                                  |
| 2023-04-23/24 | G4, Kp 8+, Dst ≈ −213 nT                                                                  | Equinox storm; equinox storms behave differently from solstice ones                             |
| 2023-03-23/24 | G4, Dst ≈ −163 nT (the plan's "2023-03-24")                                               | Fine to keep, but it is the smaller of the two 2023 events — 04-23 is the better anchor         |
| 2021-11-04    | G3, Dst ≈ −105 nT                                                                         | Rising-phase, low-F10.7 storm — tests whether the model separates storm from solar-flux level   |

Flare/LUF anchors for the D-region side (different mechanism, minutes not days, sunlit hemisphere only): 2024-05-14 (X8.7), 2024-10-03 (X9.0). These should be a separate `flare` slice, not folded into the geomagnetic storm slice.

Anything in 2026 must come from the Dst series in-window — I would not name 2026 dates from memory, and the programmatic rule makes it unnecessary.

Sources: [SWPC G4 alert 2025-01-01](https://www.spaceweather.gov/news/g4-severe-geomagnetic-storm-alert-threshold-reached-1241-et), [12 November 2025 storm analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC12986641/), [SWPC G4 watch 1–2 June 2025](https://www.spaceweather.gov/news/upgrade-g4-watch-1-2-june), [May 2024 solar storms](https://en.wikipedia.org/wiki/May_2024_solar_storms), [2024 solar storms](https://en.wikipedia.org/wiki/2024_solar_storms), [SWPC S3 radiation storm, Oct 2024](https://www.spaceweather.gov/news/s3-strong-solar-radiation-storm-progress)
