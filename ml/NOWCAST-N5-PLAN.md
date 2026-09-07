# NowCast N5 - Madrigal-trained, ionosphere-aware propagation model

v1 2026-09-06. Author: orchestrator session.
Status: reviewed by four personas (reviews and the binding decisions memo are in `ml/n5-reviews/`); tracked on GitHub Project #4 (epic + one issue per task).

Source tags on every claim of fact: [v0] the v0 draft, [ML] 01-ml-engineer.md, [DE] 02-data-engineer.md,
[HF] 03-hf-propagation.md, [SW] 04-space-weather.md, [memo] 00-DECISIONS.md (binding),
[measured 2026-09-07] the space-weather reviewer's live probes, [assumption] not sourced from any input
and to be replaced by a P0 measurement. Section references are written "sec N".

---

## 0. Decision and goal

Owner, 2026-09-06: "I'd rather us make the much better model now and knock people's socks off than puddle
with the old model. Then we can bring it online and start tuning it against all the actual data and see
how predictions hold up." [v0]

Why the old line is capped [v0]: A6 and the in-flight A7 retrain train on the WSPR archive, where one feature
("was this exact WSPR pair heard last hour") carries 49% of gain and the four grid4 pair lags carry 72%. That
is persistence on stationary beacons, and it is unservable; A7 removed it and held-out logloss went 0.159 to
0.183 on the same month. More WSPR cannot fix a wrong domain: single mode, beacons, "network detected it".

**Goal, restated to match what the label measures** [memo 10], [HF S1], [HF S14]: N5 predicts, for
`(hour, band, mode_class, tx_field, rx_field)`, the probability that the receiving field's reporter network
hears at least one transmitting station in the transmitting field, given both fields were active on that
band and mode in the previous hour. It is not a personal-station contact probability. That sentence ships
in the product copy, the model card and every report.

| Scope item  | v1 decision                                                                                                                                         | Source                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Tasks       | HF digital only, 160m-10m; FT8/FT4/WSPR as a `mode_class` categorical in one model, per-mode evaluation slices                                      | [memo 1]                     |
| CW          | v1.1 on the same pipeline. Madrigal carries RBN via `ssrc`; slim keeps `ssrc`, `smode`, `tfreq`, `snr_ref_bw`, so no re-pull                        | [memo 1]                     |
| 6m          | v2. Needs Es/TEP features, has no served recency, and the ionosphere block does not apply                                                           | [memo 1], [SW S14], [HF S10] |
| Phone       | a documented transform of the SNR head, validated against the collector's `phone` `path_hourly_stats` cells and DX cluster SSB spots. Never a model | [memo 1], [HF S8], [ML 14]   |
| Model lines | two, both deliverables                                                                                                                              | [memo 2]                     |

| Line        | Window                                        | Features                             | New live deps | Role                                                            |
| ----------- | --------------------------------------------- | ------------------------------------ | ------------- | --------------------------------------------------------------- |
| **N5-base** | full development window, newest-first (sec 2) | all except the GloTEC block          | **zero**      | the guaranteed served candidate                                 |
| **N5-iono** | GloTEC era only, 2025-01 onward               | N5-base + GloTEC control-point block | one (GloTEC)  | served instead of N5-base only if it beats it on the same gates |

Rationale [memo 2]: this resolves the archive-start skew of [SW S3] (GloTEC archive starts 2025, so approx
80% of a full-window training set carries `_missing` against 0% at serve, and XGBoost's default-direction
branch would be fit only on the cycle-25 decline). It makes the no-ionosphere ablation a real fallback,
and it survives GloTEC being withdrawn, which SWPC's experimental label makes a live possibility [SW S16].

GloTEC daily NetCDF archiving (approx 14 MB/day) starts on the box at P0 whether or not the NCEI archive path
resolves [memo 2]. SWPC retention is approx 31 days rolling, 4465 files, oldest 2026-08-07T00:25 [measured
2026-09-07], so every unarchived day is lost permanently. This is archival of a NOAA public-domain product,
not live spot ingestion, and it does not reopen the decommissioned WSPR pipeline.

**Non-goals** [v0], [memo 29]: rebuilding any live WSPR ingestion (decommissioned 2026-07-21, stays dead);
changing the P.533 engine; per-user personalisation; an opening-window forecast (GloTEC is nowcast-only and a
forecast needs a driver-forecast path, v2).

## 1. Data sources and licence ledger

Cadence, latency, archive start, licence and call from the [SW] product table unless marked; Madrigal,
OMNI, contest-calendar and RBN rows carried from [v0].

| Product                                                                       | Cadence                            | Latency at issue time                               | Archive start                                        | Licence                                                   | Call                                                                            |
| ----------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| CEDAR Madrigal kinst 8308 "Amateur Radio Signal Report" (HamSCI, PI Frissell) | per-spot                           | archive lags approx 7.5 weeks                       | 2008-04-01; day gaps exist (Mar 2026 missing 15-16)  | CEDAR rules of the road; **contributor terms unresolved** | **Ship v1** as the label source [v0]                                            |
| GOES XRS 0.1-0.8 nm                                                           | 1 min                              | 1-3 min                                             | NCEI 1986 on; GOES-16 2017 on, convention change     | NOAA PD                                                   | **Ship v1**; live half already collected                                        |
| Derived HAF (D-RAP form) at control points                                    | = XRS                              | = XRS                                               | computed                                             | n/a                                                       | **Ship v1**                                                                     |
| SWPC D-RAP grid (`text/drap_global_frequencies.txt`)                          | 1 min                              | < 1 min                                             | none                                                 | NOAA PD                                                   | **Verification reference only**                                                 |
| GOES ≥ 10 MeV protons                                                         | 5 min                              | approx 10-13 min                                    | NCEI 1986 on                                         | NOAA PD                                                   | **Ship v1**; already collected                                                  |
| GFZ Hp60                                                                      | 60 min                             | approx 1 h                                          | 1995 on                                              | CC BY 4.0                                                 | shipped; keep                                                                   |
| GFZ Hp30                                                                      | 30 min                             | approx 30-45 min                                    | 1995 on                                              | CC BY 4.0                                                 | **Ship v1**                                                                     |
| Kp, SWPC estimated 1-min                                                      | 1 min                              | approx 5 min                                        | SWPC rolling / GFZ definitive 1932 on                | PD / CC BY 4.0                                            | shipped; **fix the estimated-vs-definitive gap** [SW S6]                        |
| Kyoto Dst realtime                                                            | 60 min                             | approx 55 min [measured 2026-09-07]                 | WDC 1957 on                                          | Kyoto, acknowledge                                        | shipped; **retrain on the realtime series**                                     |
| F10.7 (Penticton via SWPC)                                                    | 3x/day at 17/20/22 UT              | same-day evening                                    | 1947 on                                              | PD / NRCan                                                | shipped; **fix `available_at`, it is a training leak**                          |
| SSN (`observed-solar-cycle-indices`)                                          | **monthly** served, daily in OMNI2 | up to approx 5 weeks                                | 1749 on                                              | PD                                                        | **Cut**: served and trained series are different variables                      |
| RTSW mag/plasma (DSCOVR/ACE)                                                  | 1 min                              | approx 5 min                                        | OMNI 1963 on                                         | PD                                                        | keep the sec 4.7 channels; cut the MHD channels                                 |
| NASA OMNI2 hourly                                                             | 1 h                                | approx 1 month lag                                  | 1963 on                                              | PD                                                        | archive source for driver channels; ae/al/au/pcn stay excluded [v0], [SW S9]    |
| **GloTEC** (tec, anomaly, hmF2, NmF2, quality_flag)                           | 10 min                             | **19-27 min** [measured 2026-09-07]                 | SWPC 31 d rolling; NCEI 2025 on, **path unverified** | NOAA PD, **experimental**                                 | **Ship v1, HF only**, N5-iono only                                              |
| IRI/CCIR climatology (anomaly denominator)                                    | static                             | none                                                | n/a                                                  | public                                                    | **Ship v1**; required by the ratio design [SW S5]                               |
| CODE final GIM (`COD0OPSFIN`, 1 h)                                            | 1 h                                | approx 3-5 d                                        | 1995 on                                              | AIUB/IGS, unverified                                      | **Cut from the feature vector**; offline reference only                         |
| CODE rapid GIM                                                                | 1 h                                | approx 1 d                                          | 1995 on                                              | as above                                                  | **Cut**: not a live twin                                                        |
| CODE predicted GIM                                                            | 1 h                                | ahead of time                                       | n/a                                                  | as above                                                  | **Cut**: extrapolation; filename still unverified                               |
| IRTAM/GAMBIT foF2, hmF2                                                       | 15 min                             | **blocked below approx 48 h** [measured 2026-09-07] | 2000-2025                                            | CC BY-NC-SA                                               | **Cut**: two independent blockers                                               |
| DIDBase station foF2                                                          | 5-15 min                           | n/a                                                 | 1930s on                                             | CC BY-NC-SA                                               | **Cut**: sparse plus NC                                                         |
| AE/AL/AU/PCN, SuperMAG SME                                                    | n/a                                | n/a                                                 | n/a                                                  | n/a                                                       | **stay excluded**: no real-time and/or redistribution restrictions              |
| RBN raw archive (daily CSV)                                                   | daily                              | n/a                                                 | 2009 on                                              | terms unstated                                            | **Cut from v1**: second pipeline plus callsign-to-grid geolocation over 7 years |
| Contest calendar (`src/lib/data/`)                                            | static                             | none                                                | n/a                                                  | in-repo                                                   | **Ship v1**; replaces the hardcoded 4-date list [HF S14]                        |

IRTAM detail so the cut is not relitigated: `gambit-coeffs?time=...&charName=foF2` returned 200 for
2026.09.05T00:00 and older and HTTP 500 "Data access level exceeds user permissions" for 2026.09.05T06:00
onward [measured 2026-09-07]. A rolling approx 48 h embargo is exactly the window a nowcast needs, and it is
additional to the NC licence problem [SW S1].

### 1.1 Licence ledger and owner actions

| Item                                                                         | Status                                                                                   | Who acts, when                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CEDAR rules of the road, acknowledge PI                                      | to confirm, not assume                                                                   | box agent records it in the P0 manifest                                                                                                                              |
| **PSKReporter / WSPRNet / RBN contributor terms for a billed product**       | **open, blocks P1**                                                                      | **owner action**: written confirmation that data reaching a monetised model via Madrigal is permitted, before P1 puts bulk data on disk [memo 7], [SW S16], [HF S16] |
| **Courtesy email to the Madrigal 8308 PI (Frissell) before a multi-TB pull** | **open, blocks P1**                                                                      | **owner action**: a heads-up on an academic mirror is cheaper than a ban [memo 7], [DE S2-7]                                                                         |
| CODE/AIUB CC BY 4.0                                                          | asserted, not confirmed; offline-only so exposure is small but non-zero                  | box agent records the assertion and does not rely on it, P2                                                                                                          |
| NOAA GloTEC / GOES / D-RAP / SWPC                                            | US Government, public domain; GloTEC additionally **experimental, no service guarantee** | design for withdrawal, sec 11 risk 1                                                                                                                                 |
| GFZ Kp/Hp                                                                    | CC BY 4.0; the collector already reads `meta.license`                                    | none                                                                                                                                                                 |
| Kyoto Dst                                                                    | acknowledge                                                                              | none                                                                                                                                                                 |
| GIRO / IRTAM / DIDBase                                                       | CC BY-NC-SA 4.0: NC blocks a billed product, SA would attach to derived artefacts        | cut, unconditional                                                                                                                                                   |

P0's single month needs neither owner action [memo 7]. P1 does not start without both.

## 2. Window, tasks, folds, holdouts, gates

| Decision                   | Value                                                                                                                                                                               | Source               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Pull order                 | **newest-first**, 2026-04-30 backwards                                                                                                                                              | [memo 5], [DE S2-7]  |
| Development pull frozen at | 2026-04-30                                                                                                                                                                          | [memo 5], [DE S3-15] |
| Prospective accumulation   | 2026-05-01 on, released by Madrigal after the protocol freeze                                                                                                                       | [memo 5], [ML 3]     |
| Backfill stop rule         | stop when the cohort scaling curve flattens; answers "does 2019-2021 help" without paying for the data first                                                                        | [memo 5]             |
| Contaminated, never a gate | 2026-02 to 2026-04 (V2 proof) and 2026-05 to 2026-07-15 (the #297/#306 recency design, A7 Hp60/recency-v2/chain-reason deploys and the Band Health ladder were all tuned inside it) | [v0], [ML 3]         |

The v0 window statement "2019-01-01 to 2026-07-15" is retired: it contained every early-stopping,
calibration, evaluation and gate month with no stated exclusion, the exact shape that lets a leak pass
unnoticed at 300M rows [ML 1].

| Task        | Bands                                    | Modes                                             | Recency                                             | Ionosphere block                           |
| ----------- | ---------------------------------------- | ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| `hf` (v1)   | 160m 80m 60m 40m 30m 20m 17m 15m 12m 10m | `mode_class` in {ft8, ft4, wspr}, per-mode slices | `prev1`, `prev24`                                   | N5-iono only                               |
| `cw` (v1.1) | same                                     | rbn skimmer                                       | deferred                                            | deferred                                   |
| `6m` (v2)   | 6m                                       | digital                                           | **none**; production serves no 6m recency [DE S1-4] | **none**; no product carries foEs [SW S14] |

One `mode_class` vocabulary shared with `public.mode_class_of()`; do not create a third copy alongside
`build_dataset_v4.py` [DE S2-9]. `tx_field == rx_field` cells are excluded from the HF task (NVIS, ground
wave and Es are a different regime and a large EU row share) and kept for the 6m/short-path task
[memo 9], [HF S3].

### 2.1 Training months and disjointness

Training months are an **enumerated list in config, never a range** [memo 22], [ML 1]. Port the v4.2
assertion verbatim from `ml/src/archive_v4_2/phase2_core.py:validate_config`:

```
if month in training or any(value >= month for value in training):
    raise Phase2Error(f"{name} includes its future validation month")
```

Folds (early stopping / calibration): 2024-02, 2024-05, 2024-07, 2024-08. Selection evaluation:
2024-10, 2024-11 [memo 22], [v0]. Build-time invariants [ML 1]: (i) `set(training) & set(ES | calib | eval
| gates) == {}` asserted in CI; (ii) a row-count query per sealed month on the built matrix returns 0;
(iii) gate scripts refuse to score if a gate month's dataset hash appears in any training manifest.

### 2.2 Gates

| Gate              | Definition                                                                                                                                                                                                                                                                                                                                               | Why                                                                                                                                | Source                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| (a) Archive       | the four still-sealed `LOCKED_MONTHS` **2025-01, 2025-04, 2025-07, 2025-10**; `locked_2025_read == false` in every prior artifact; four seasons at solar max                                                                                                                                                                                             | December 2024 was opened                                                                                                           | [memo 23a], [ML 2]           |
| (b) December 2024 | **demoted to a contaminated continuity reference**, reported next to A6/A7 and labelled                                                                                                                                                                                                                                                                  | `december_gate_result.json` records `december_2024_read: true`, `2026-07-15T23:31:10Z`, 52,101,759 rows, `weighted_brier 0.043440` | [memo 23b], [ML 2]           |
| (c) Prospective   | Madrigal 2026-05-01 on **as released after the freeze**, PLUS a live shadow ≥ 30 days including ≥ 1 Kp ≥ 5 day                                                                                                                                                                                                                                           | the only genuinely prospective window is one in the future at freeze time                                                          | [memo 23c], [ML 3], [ML 12]  |
| (d) Storm         | **programmatic from Dst**: main-phase days `min(Dst) ≤ -100 nT` (≤ -200 severe); PCA days `≥ 10 MeV proton flux > 10 pfu` scored **only on polar-crossing paths**; flare slice separate. Decomposed by phase × mag-lat band × band group; each storm day paired with a matched quiet day (same month +/-3 weeks in an adjacent year, F10.7 within +/-10) | Kp ≥ 7 is 5-10 days in the window, and "storm" is at least four conditions with opposite signs                                     | [memo 23d], [HF S6], [ML 17] |

**Slice-design check, before any model is fit** [memo 23], [HF S6]: the storm slice must reproduce the
2024-05-10 06-12 UT positive phase on 15m/10m, that is mid-latitude cells above the monthly median before
the collapse. If a slice cannot reproduce a known physical effect, no model result from it means anything.

Named anchors, used only to check that the programmatic rule fires [HF]: 2024-05-10/11 Gannon G5 Kp 9 Dst
approx -412 nT with S1-S2 protons from 05-09 (reference superstorm, positive then deep negative phase);
2024-10-10/11 G4 Kp 9- Dst approx -335 nT with S3 protons from 10-09 (storm and PCA in one event);
2025-11-12/13 G4 Kp 8.667 Dst approx -217 nT (recent, dense FT8); 2025-01-01 G4 (winter hemisphere);
2025-06-01/02 G4 (NH summer negative phase, worst case for high bands); 2023-04-23/24 G4 Dst approx -213 nT
(equinox); 2023-03-23/24 Dst approx -163 nT (the smaller 2023 event); 2021-11-04 G3 Dst approx -105 nT
(rising phase at low F10.7, tests storm-vs-flux separation). Flare anchors 2024-05-14 (X8.7) and 2024-10-03
(X9.0) go in a **separate `flare` slice**: minutes not days, sunlit hemisphere only.

## 3. Cell, label, opportunity

| Element                          | v1 definition                                                                                                                                                      | Why, and what it replaces                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cell**                         | `(hour_utc, band, mode_class, tx_field, rx_field)`, hourly, matching `path_hourly_stats` `UNIQUE (hour_utc, band, mode_class, tx_field, rx_field)` [memo 8]        | Nothing in production serves a sub-hourly statistic: `compute_path_recency_hourly` is hourly and `pathHourly.ts` walks hours [DE S1-2]. The 15-minute slot survives only as an intra-hour exposure refinement, "active in ≥ 1 of 4 slots" [memo 8]. Contract test: no feature has a period below 1 h, and every recency/exposure feature has a matching column in `path_recency_hourly`                                                                                           |
| **Risk set**                     | `tx_field` AND `rx_field` both active on the **same** `(band, mode_class)` in **H-1 only**, the V2 proof rule; config `exposure_lag_hours: 1` [memo 9]             | `madrigal_build_cells.py` joins activity on `ta.hour_utc = c.hour_utc`, the target hour: a leak that does not match serving. `ARCHIVE-PROOF-V2.md` already fixed this ("during the preceding hour", "uses no target-hour activity") and v0 regressed to the leaky rule [DE S1-3]. Same band and submode, since a station monitoring 14.074 is not a receiver for 14.200 [HF S14]. Diagnostic ablation: same-hour against prior-hour exposure, AUC gap > 0.01 is the measured leak |
| **Exposure grain**               | per mode, not per wall-clock slot                                                                                                                                  | Duty cycle differs: WSPR uses approx 20% of 2-min slots against FT8's alternating 15 s slots [memo 21], [HF S14]                                                                                                                                                                                                                                                                                                                                                                  |
| **Same-band RX presence in H-1** | a **feature**, not a further filter [memo 9]                                                                                                                       | The compromise between [ML 5] (band-conditioned exposure pushes prevalence toward 1 on high bands and answers the wrong question) and [DE S1-3] (same-hour exposure leaks)                                                                                                                                                                                                                                                                                                        |
| **Label**                        | plain conditional binary: `open = 1` if ≥ 1 decode of any TX station in `tx_field` by any RX station in `rx_field` on `(band, mode_class)` during hour H [memo 10] | No weighted-Bernoulli trial counts. v4.2's `opportunities` was a station-cartesian count (8,003,944,014 HF opportunities over 273,137,641 rows, approx 29 per row; December's A6 gate 1,680,857,829 weight over 52,101,759 rows, approx 32 per row) whereas an hourly cell from 15-min slots bounds it at 4 [ML 4a]; and FT8's 15 s cycle with PSKReporter's batched per-(callsign, band) dedup makes the trial count unobservable [ML 4b]                                        |

**The receiver-count confound.** P(≥ 1 of N receivers decodes) rises with N; an EU field with 40 receivers
has approx 13 dB more effective sensitivity than a 2-receiver African field at identical propagation, and
reporter density varies > 10× by region and grows yearly [HF S1]. Handled two ways [memo 10]: (i) the H-1
population features of sec 4.9, so residual population effects are absorbed rather than smeared into the
target; (ii) a mandatory P0 diagnostic regressing success on `log(rx_station_count)` within (band, hour,
distance bucket) at fixed MUF margin, whose slope is reported in every gate report. The label is not
reformulated as a rate over receivers ([HF S1]'s fix) because that reintroduces the denominator [ML 4] rules
out; the call and its cost are in sec 13.

### 3.1 Sampling and reference tables

| Item               | Decision                                                                                                                                                                                     | Source                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Risk-set size      | approx 5-6 billion HF cells hourly over a full 2019-2026 window, approx 12-14 billion at 15-min slots, 2-5 TB for one build at approx 100 float32 features                                   | [DE S1-1]; [assumption] until P0 measures |
| The artifact       | **the sample, never the full cells table**                                                                                                                                                   | [memo 11], [DE S1-1]                      |
| Sampler            | **deterministic hash-based**, `hash(tx_field, rx_field, band, hour) % 10000 < k`. The current code uses unseeded `random()`, so no build reproduces                                          | [DE S1-1]                                 |
| Weight composition | negative-sampling weight and any cell weight compose **multiplicatively**, unit-tested: the weighted mean of the target on a held-out sample equals the unweighted population mean           | [memo 11], [HF S15]                       |
| P0 artifact        | `risk_set_estimate.json`: measured per-(band, hour) active-field counts for 2024-07, extrapolated full-window row count, chosen `neg_keep` per band, predicted `cells/` and `cohorts/` bytes | [DE checklist 9]                          |
| P3 check           | realised sampled row count matches the P0 prediction within 10%                                                                                                                              | [DE S1-1]                                 |

Reference tables replace per-row Python; the current builder maps centroids with a Python call per row,
which is hours at 600M rows and impossible at 5B [DE S3-13], [memo 12].

| Table                         | Rows                   | Contents                                                                                                                                                                |
| ----------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref/field_geometry.parquet`  | 324^2 = 104,976        | short-path and long-path distance, P.533 control points and long-path control points per pair, mid lat/lon, magnetic latitude, dip latitude, angle to magnetic meridian |
| `ref/field_solar.parquet`     | 324 × 366 × 24 = 2.85M | solar elevation, computed in SQL                                                                                                                                        |
| `ref/field_centroids.parquet` | 324                    | activity centroids **from the training window only**, frozen and hashed; currently computed from all data, which leaks the holdout and drifts over 7.5 years [DE S2-12] |

Within-cell distance distribution from the retained lat/lon (`dist_p10/p50/p90`, `frac_inside_skip` per
band) is a feature, not a diagnostic [memo 12], [HF S3]. Field grain stays the serving key; the **grid4
sub-key for adjacent fields is a P0 measurement, not a v1 commitment** [memo 12] - variance decomposition of
decode rate within (field-pair, band, hour) by true great-circle distance quartile on 40m and 10m short
paths, where above 15-20% explained variance disqualifies field grain there [HF S3].

## 4. Features

Rules for every row below [v0], [memo 13], [memo 17], [HF S4], [HF S9], [SW S3], [SW S4], [SW S5].
Servable-only by construction: anything the collector or the inference service cannot fetch live is not a
feature. Every observational feature carries a `_missing` companion and, where age matters, an `_age_min`
companion. Ionospheric quantities are **ratios or deltas against the engine's own CCIR climatology**,
computed identically offline and online, absolutes secondary. Every sample point is a **P.533 control point,
never the midpoint**, and every geometry block is computed for **both the short-path and the long-path
route**. Dropped features are in the sec 12 cut table with reasons.

### 4.1 Geometry and time

| Feature                            | Definition                                                                                                                | Source at train       | Source at serve      | Latency / availability | Licence                                   | base | iono |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------- | ---------------------- | ----------------------------------------- | ---- | ---- |
| `band`, `band_mhz`                 | categorical + centre frequency                                                                                            | slim `tfreq_khz`      | request              | none                   | n/a                                       | y    | y    |
| `mode_class`                       | ft8 / ft4 / wspr                                                                                                          | slim `smode`          | request              | none                   | n/a                                       | y    | y    |
| `dist_sp`                          | great-circle distance between centroids                                                                                   | `ref/field_geometry`  | same table           | static                 | n/a                                       | y    | y    |
| `dist_lp`                          | 40008 - `dist_sp`                                                                                                         | `ref/field_geometry`  | same                 | static                 | n/a                                       | y    | y    |
| `dist_p10/p50/p90`, `dist_iqr`     | empirical endpoint distance distribution from retained lat/lon                                                            | slim                  | precomputed per pair | static                 | n/a                                       | y    | y    |
| `frac_inside_skip`                 | share of plausible endpoint pairs shorter than the band's skip distance                                                   | slim + engine         | precomputed          | static                 | n/a                                       | y    | y    |
| `n_hops_sp/lp`                     | from `hopElevationAngle` / `calculateReflectionPoints` at actual hmF2, not `ceil(dist/3500)` [HF S16]                     | engine                | engine               | none                   | in-repo                                   | y    | y    |
| `lat_tx/rx`, `lon_tx/rx` encodings | centroid encodings                                                                                                        | `ref/field_centroids` | same                 | static                 | n/a                                       | y    | y    |
| `hour_utc` sin/cos                 | cyclic                                                                                                                    | derived               | derived              | none                   | n/a                                       | y    | y    |
| `angle_to_terminator`              | path angle to the solar terminator                                                                                        | derived               | derived              | none                   | n/a                                       | y    | y    |
| `angle_to_magnetic_meridian`       | path angle to the magnetic meridian (IGRF)                                                                                | `ref/field_geometry`  | same                 | static                 | public                                    | y    | y    |
| `land_sea_frac_sp/lp`              | land/sea fraction along the great circle; approx 3 dB per ground reflection, approx 12 dB over a 4-hop 160m path [HF S16] | static raster         | static raster        | static                 | raster licence checked at P2 [assumption] | y    | y    |

### 4.2 Control-point ionosphere and darkness

Replaces every `*_mid` scalar [memo 13]. P.533 sets path MUF at the d/2 control point for d ≤ 4000 km and at
the **minimum** of two control points 2000 km inside each terminal beyond that, with E-layer screening at
1000 km from each end. The midpoint overstates MUF on long E-W paths and erases the day/night asymmetry that
is the whole diurnal story; `build_features.py` today computes `dark_frac` from 3 samples, one per 6000 km on
a 12,000 km path [HF S4].

| Feature                               | Definition                                                                                                                   | Source at train                                        | Source at serve | Latency / availability | Licence           | base | iono |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------- | ---------------------- | ----------------- | ---- | ---- |
| `fof2_cp_min`, `fof2_cp_max`          | min/max foF2 over control points                                                                                             | engine CCIR (base), GloTEC ratio × CCIR (iono)         | same            | sec 4.6                | in-repo / NOAA PD | y    | y    |
| `m3000f2_cp`                          | M(3000)F2 **used directly**, not back-derived from hmF2                                                                      | engine / GloTEC                                        | same            | as above               | as above          | y    | y    |
| `muf_path`                            | min over P.533 control points                                                                                                | derived                                                | derived         | as above               | n/a               | y    | y    |
| `muf_margin_db`                       | 20*log10(`muf_path` / `band_mhz`)                                                                                            | derived                                                | derived         | as above               | n/a               | y    | y    |
| `absorption_sum`                      | sum of cos^0.75(chi) / (f + f_H)^2 over the actual reflection points                                                         | `calculateDLayerAbsorption`, `getAbsorptionAtLocation` | same            | none                   | in-repo           | y    | y    |
| `n_reflection_points_sunlit`, `_dark` | counts at the reflection points                                                                                              | derived                                                | derived         | none                   | n/a               | y    | y    |
| `path_dark_frac`                      | ≥ 1 sample per hop, minimum 9                                                                                                | derived                                                | derived         | none                   | n/a               | y    | y    |
| `terminator_crossings`                | count                                                                                                                        | derived                                                | derived         | none                   | n/a               | y    | y    |
| `e_muf_2000_cp`                       | E-layer screening, approx 3.6 × foE from `calculateF0E` at the 1000 km control points; deterministic in zenith angle and SSN | engine                                                 | engine          | none                   | in-repo           | y    | y    |
| `sun_elev_tx`, `sun_elev_rx`          | endpoint solar elevation                                                                                                     | `ref/field_solar`                                      | same            | static                 | n/a               | y    | y    |
| `route_muf_margin_best`               | max(short path, long path)                                                                                                   | derived                                                | derived         | none                   | n/a               | y    | y    |
| `lp_darkness_advantage`               | long-path minus short-path darkness fraction                                                                                 | derived                                                | derived         | none                   | n/a               | y    | y    |

Two verifications [HF S4], [HF S9]: plot the mid-only model's residual against the path's absolute longitude
extent, where a systematic sign flip with E-W extent shows the midpoint was doing the damage; and on 20m
12-16 UT EU to VK/ZL cells, correlate the short-path-only model's positive residual with long-path darkness
fraction, where a clean correlation means the model was paying for long path with the pair memorisation
that killed A6/A7.

### 4.3 Geomagnetic

Every storm effect on HF is organised in geomagnetic, not geographic, latitude. Without this block the
storm slice is unlearnable and its gate is decorative [HF S5], [memo 14].

| Feature                        | Definition                                                                                                                          | Source at train      | Source at serve         | Latency / availability | Licence   | base | iono |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------- | ---------------------- | --------- | ---- | ---- |
| `mag_lat_tx`, `mag_lat_rx`     | IGRF/CGM magnetic latitude                                                                                                          | `ref/field_geometry` | same                    | static                 | public    | y    | y    |
| `mag_lat_cp_max`               | max control-point magnetic latitude                                                                                                 | `ref/field_geometry` | same                    | static                 | public    | y    | y    |
| `oval_margin`                  | `mag_lat_cp_max` - (67 - 2*Kp)                                                                                                      | derived from Kp      | derived from Kp         | Kp rule, sec 4.7       | CC BY 4.0 | y    | y    |
| `auroral_cross_fraction`       | path fraction inside the Feldstein/Starkov oval; **deterministic in Kp, so offline/online parity is exact by construction** [SW S9] | derived              | derived                 | Kp rule                | CC BY 4.0 | y    | y    |
| `crosses_polar_cap`            | min absolute magnetic latitude along path > 75                                                                                      | `ref/field_geometry` | same                    | static                 | public    | y    | y    |
| `dip_lat_cp`                   | dip latitude at control points                                                                                                      | `ref/field_geometry` | same                    | static                 | public    | y    | y    |
| `crosses_geomagnetic_equator`  | boolean                                                                                                                             | `ref/field_geometry` | same                    | static                 | public    | y    | y    |
| `proton_flux_10mev`, `_max24h` | GOES ≥ 10 MeV protons; meaningful only through the polar-cap interaction                                                            | NCEI archive         | SWPC, already collected | approx 10-13 min       | NOAA PD   | y    | y    |
| `pca_polar_fraction`           | proton flux × path fraction above approx 60 deg CGM latitude                                                                        | derived              | derived                 | as protons             | NOAA PD   | y    | y    |

Verification [HF S5]: on 2024-05-10/11 slice residuals by control-point magnetic latitude band (below 40,
40-60, above 60). A geographic-only model is biased in opposite directions in the outer bands, and fine on average.

### 4.4 D-region

| Feature          | Definition                                                                            | Source at train            | Source at serve             | Latency / availability | Licence | base | iono |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------------- | --------------------------- | ---------------------- | ------- | ---- | ---- |
| `haf_max_path`   | D-RAP form, flux^0.75 * cos^0.75(chi), at the **sunlit control points**, path max     | NCEI GOES XRS 1-min        | SWPC XRS **direct fetcher** | 1-3 min                | NOAA PD | y    | y    |
| `xray_max_15min` | `max(flux over last 15 min)` on **both** sides                                        | archive                    | fetcher                     | 1-3 min                | NOAA PD | y    | y    |
| `xray_flux_norm` | XRS normalised to **one** calibration convention across the GOES-15 to 16+ transition | archive, per-epoch scaling | fetcher                     | 1-3 min                | NOAA PD | y    | y    |

Three traps [memo 15], [SW S7]:

| Trap              | Detail                                                                                                                                                                                                                                      | Handling                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Calibration step  | GOES-13/14/15 long-channel fluxes carry the historical SWPC divide-by-0.7 scaling, GOES-16+ NCEI science-quality fluxes do not; a 43% flux error through ^0.75 is approx 1.3× in HAF, roughly 2-3 MHz of LUF, drifting with satellite epoch | one convention; acceptance check is the 2019-2026 background-flux-by-satellite-epoch plot, where a step at the transition is the bug |
| Sampling mismatch | the collector stores an instantaneous 1-min value every 15 min, so flare peaks are missed; training on the 1-min archive while serving a point sample is biased low exactly during flares                                                   | 15-min max on **both** sides                                                                                                         |
| Availability      | XRS is already fetched by `collector/src/collectors/solar.ts` into `solar_snapshots` but is absent from `SNAPSHOT_COLUMNS`/`RAW_WEATHER_FEATURES` in `ml/service/operational_weather.py`, so v0's "not in repo" was wrong                   | direct fetcher in the inference service                                                                                              |

`drap_global_frequencies.txt` (2 deg × 4 deg grid, 1-min, confirmed 200 and 42 kB) validates HAF to approx
1 MHz as a **reference only, never a feature**: there is no archive [SW S8].

### 4.5 Season

| Feature                 | Definition                                                               | Source  | base | iono |
| ----------------------- | ------------------------------------------------------------------------ | ------- | ---- | ---- |
| `local_season_tx/rx/cp` | cos(2*pi*(doy - 172)/365) * sign(lat) at TX, RX and control points       | derived | y    | y    |
| `season_asymmetry`      | `local_season_tx` - `local_season_rx`, the transequatorial seasonal term | derived | y    | y    |

June is NH summer and SH winter, so a global doy sinusoid encodes June identically for W and VK and the winter
anomaly, the summer negative phase and the Es season cancel [memo 16], [HF S11]. Verification: residual on 20m
N-S transequatorial paths against month, where a hemispheric sign flip is the tell.

### 4.6 GloTEC block, N5-iono only

| Feature                         | Definition                                                                                                                       | Source at train       | Source at serve | Latency / availability   | Licence               | base | iono |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------- | ------------------------ | --------------------- | ---- | ---- |
| `fof2_cp_ratio`                 | foF2 from NmF2 at control points / engine CCIR climatology                                                                       | GloTEC NetCDF archive | GloTEC          | **`epoch ≤ T - 30 min`** | NOAA PD, experimental | n    | y    |
| `hmf2_cp_delta`                 | hmF2 minus CCIR hmF2 at control points                                                                                           | as above              | as above        | as above                 | as above              | n    | y    |
| `tec_anomaly_cp`                | GloTEC `anomaly` at control points                                                                                               | as above              | as above        | as above                 | as above              | n    | y    |
| `tec_gradient_along_path`       | horizontal TEC gradient along the path; the one thing TEC gives that NmF2 does not (off-great-circle propagation, EIA asymmetry) | as above              | as above        | as above                 | as above              | n    | y    |
| `quality_flag_cp`               | **categorical, never a filter**                                                                                                  | as above              | as above        | as above                 | as above              | n    | y    |
| `tec_age_min`, `glotec_missing` | epoch age and availability                                                                                                       | as above              | as above        | as above                 | as above              | n    | y    |

Facts corrected against v0 [measured 2026-09-07], [SW S11]:

| v0 claim                        | Measured                                                                                                                     | Consequence                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| "5 deg grid"                    | **2.5 deg lat × 5 deg lon, 72 × 72 = 5184 points**                                                                           | grid code sized correctly                                           |
| "GeoJSON every 10 min, 2.4 MB"  | cadence 10 min confirmed; **345 MB/day as GeoJSON against 14 MB/day as NetCDF** for the same information                     | archive the NetCDF, never the GeoJSON [DE S2-11]                    |
| nearest-in-time epoch           | **publication latency 19-27 min** (`...T235500Z` posted 00:14, `...T002500Z` posted 00:47)                                   | select `epoch ≤ T - 30 min` or leak up to half an hour              |
| `quality_flag` is an error code | flag ≥ 3 covers **91% of Europe but 5% of the Southern Ocean and 13% of the central Pacific**; it tracks observation density | carry as categorical, never threshold                               |
| "archive at NCEI 2025 onward"   | `ncei.noaa.gov/data/glotec/` and `.../data/space-weather/access/` both 404'd                                                 | **NCEI path check is a P0 item**; SWPC retention is 31 days rolling |
| `anomaly` semantics             | spans -8.45 to +9.57, median 0.54; neither a ratio nor obviously TECU                                                        | confirm against NetCDF variable attributes before it is a feature   |

Absolute `tec_*` is cut: vertical TEC is a column integral dominated by the topside, slab thickness spans
**268 km (p5) to 433 km (p95)** in GloTEC's own internally-consistent field [measured 2026-09-07] and
decouples from foF2 during storms, the plasmasphere contributes 10-50% at night and nothing to HF
refraction, and `tec` and `NmF2` come from the same assimilation [SW S13], [HF drop list], [memo 3].

### 4.7 Space-weather drivers

Per-channel `available_at` with a **backward as-of join and an explicit `age` feature**, mirroring the
serving rule [memo 18], [SW S12]. Today `build_space_weather.py` sets `available_at = observed + 1h`
uniformly and `build_features.py:211` does an equi-join, while serving does
newest-observation-within-`SOURCE_MAX_AGE_SECONDS` with per-source windows from 30 min to 45 days.

| Feature                                                                                    | Definition                                                         | Source at train                                                                                          | Source at serve      | `available_at` rule                                  | Licence            | base | iono |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------- | ------------------ | ---- | ---- |
| `bz`, `wind_speed`, `density`                                                              | RTSW mag/plasma                                                    | OMNI2 hourly                                                                                             | DSCOVR/ACE RTSW      | observed + approx 5 min                              | PD                 | y    | y    |
| `kp`, `kp_delta_3h`, `kp_max_24h`                                                          | **Kp quantised to 3 h UT bins at serve before any lookback**       | OMNI2 col 39, GFZ definitive                                                                             | SWPC estimated 1-min | observed + approx 5 min, then binned                 | PD / CC BY 4.0     | y    | y    |
| `ap`, `ap_integral_24h`                                                                    | planetary ap and its 24 h integral                                 | OMNI2                                                                                                    | SWPC                 | as Kp                                                | PD                 | y    | y    |
| `hp60`, `hp30`                                                                             | GFZ Hp; Hp30 resolves substorm onset that Hp60 smooths             | GFZ API                                                                                                  | GFZ API              | observed + approx 1 h / approx 30-45 min             | CC BY 4.0          | y    | y    |
| `dst`, `dst_min_24h`, `dst_rate_3h`, `time_since_ssc`, `time_since_dst_min`, `storm_phase` | phase in {quiet, initial, main, recovery}, derived from Dst not Kp | **Kyoto realtime series if an archive exists (P0 verifies); otherwise Dst drops in favour of Hp30/Hp60** | Kyoto realtime       | observed + approx 55 min                             | Kyoto, acknowledge | y    | y    |
| `f107`                                                                                     | Penticton flux                                                     | OMNI2                                                                                                    | SWPC                 | **20:00 UT + publication delay**, not observed + 1 h | PD / NRCan         | y    | y    |

Three defects in the current pipeline that this fixes [SW S6]:

| Defect                          | Detail                                                                                                                                                                                                                                                                                          | Fix                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kp product gap**              | training uses the GFZ definitive 3 h step repeated hourly so `diff(3)` is exactly a bin difference, while serving uses a noisy 1-min estimated series, so `kp_delta_3h` becomes a continuous difference and `kp_max_24h` over a 1-min series is biased high against a max over eight 3 h values | quantise at serve before the lookbacks, gated by a KS test between the collector's 90-day distributions and the OMNI-derived training distributions [memo 18] |
| **F10.7 training leak**         | `available_at = observed + 1 h` assigns the day's flux to 00 UT, but Penticton measures at 17/20/22 UT (`f107_cm_flux.json` carries `reporting_schedule` Noon/Afternoon at 20:00/22:00Z), so training sees up to approx 20 h of future                                                          | corrected `available_at`; assert no row's F10.7 originates after its issue time; record the expected importance drop                                          |
| **SSN is a different variable** | training uses OMNI2 col 40 daily SILSO v2, serving uses `observed-solar-cycle-indices.json` which is monthly (latest 2026-08, ssn 76.0, on 2026-09-07), hence the 45-day `SOURCE_MAX_AGE_SECONDS`; daily SSN varies 2-3× within a rotation                                                      | cut, not patched                                                                                                                                              |

Block verification [SW S12]: replay a month of stored `solar_snapshots` through the offline builder and
require **per-hour vector equality**. That is the "training feature equals serving feature" test v0 asserted
but never specified.

### 4.8 Recency

| Feature                 | Definition                                        | Source at train                                                                                                                                                           | Source at serve                                | Availability rule                                                               | base | iono |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- | ---- | ---- |
| `path_success_prev1_q`  | quantile rank of the path's H-1 success statistic | Madrigal **restricted to the collector's receiver universe** (2025-26) and a matched-size receiver subsample for earlier years; the unrestricted build reported alongside | `path_recency_hourly` from `path_hourly_stats` | simulated from the measured `aggregation_watermark` minute-of-hour distribution | y    | y    |
| `path_success_prev24_q` | same at H-24                                      | as above                                                                                                                                                                  | as above                                       | as above                                                                        | y    | y    |
| `*_available`           | availability flags                                | simulated                                                                                                                                                                 | RPC returns them                               | as above                                                                        | y    | y    |

`prev2`/`prev3` are cut: approx 0.9-correlated with `prev1` on an hourly grid, each another serving
dependency and another route into the persistence trap [memo 3], [HF drop list]. The receiver-universe
restriction fixes the population mismatch: `recency_quantile` is `percent_rank()` over that band-hour's heard
pairs, and the collector sees approx 380k digital spots/day against Madrigal's approx 37M (approx 97×), so an
unrestricted rebuild ranks over a 20-50× larger population and parity fails for a reason we created
[DE S1-4]. Production **includes** `tx_field == rx_field` pairs (`compute_path_recency_hourly` has no
exclusion), so the training statistic does too [memo 19]; 6m has no served recency at all. Availability is a
function of minute-within-hour: `pathHourly.ts` uses `settledPreviousHour(now, settleMinutes=20)` so hour H
is not computed before H+1:20, then `pathRecency.ts` runs on its own tick chained to the `path_hourly`
watermark [DE S3-16]. Model it as a 30-day measured distribution, reproduced offline within 2 pp per bucket.

**Parity gate on the 2026-07 overlap** [memo 19]: median Spearman rho ≥ 0.80 per (band, hour) and share of
pairs shifting > 0.2 quantile ≤ 0.15, both reported for the restricted and the unrestricted build.
**No-recency ablation is a shipping gate** [memo 19], [ML 8]: ≥ 80% of the Brier skill over calibrated
physics must be retained, or the model is persistence and does not ship.

### 4.9 Population and activity confounders

| Feature                   | Definition                                                                                   | Source at train | Source at serve                      | Latency | base | iono |
| ------------------------- | -------------------------------------------------------------------------------------------- | --------------- | ------------------------------------ | ------- | ---- | ---- |
| `tx_station_count_prev1`  | distinct TX stations active in `tx_field` on (band, mode) in H-1                             | slim            | collector exposure aggregate (sec 8) | H-1     | y    | y    |
| `rx_station_count_prev1`  | distinct reporters active in `rx_field` on (band, mode) in H-1                               | slim            | as above                             | H-1     | y    | y    |
| `rx_station_count_prev24` | same at H-24                                                                                 | slim            | as above                             | H-24    | y    | y    |
| `congestion_rank`         | spots per active receiver in the RX field within (band, hour), rank-normalised               | slim            | collector aggregate                  | H-1     | y    | y    |
| `contest_flag`            | the real contest calendar in `src/lib/data/`, replacing the hardcoded 4-date `CONTEST_DATES` | static          | static                               | none    | y    | y    |

Portable/maritime suffix filter on the pair universe: `/P`, `/MM` and DXpedition calls geolocate to their
home field in the collector's `call_field` majority vote and inject phantom long paths, so slash-suffixed
calls are filtered out on both sides [memo 21], [HF S14]. Diagnostic, not a feature [ML 9]: per
`(rx_field, band)`, the fraction of positives attributable to the single most active reporter; above approx
0.8 for a material share of positives that mass is a reporter-availability model and is reported as such,
with cells above threshold down-weighted or excluded, and every metric reported by exposure decile.

### 4.10 Physics prior

**Separate arm, not a feature block by default** [memo 20], [ML 10], [HF S12].

| Item                      | Decision                                                                                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline in every table   | the physics score **isotonically calibrated per band on the calibration month**, never raw; a boosted model handed the raw score spends its first trees learning a monotone per-band recalibration, which alone produces most of the headline gain [HF S12] |
| Invocation from the build | a pinned node subprocess with golden vectors and a stated tolerance; "bit-identical offline and online" is unachievable between a TypeScript engine and a Python builder [memo 20], [SW S15]                                                                |
| Contract                  | engine content hash in the feature contract; inference asserts a match and **falls back to the no-physics model** rather than serving a silent mismatch [ML 10]                                                                                             |
| Degradation               | `physics_missing` flag; physics dropped on approx 5% of training rows                                                                                                                                                                                       |
| Ablation                  | no-physics-prior reported alongside no-ionosphere and no-recency [memo 20]                                                                                                                                                                                  |
| Independence              | as a separate arm, physics stays an independent safety net; stacked, the model becomes unavailable whenever physics is, turning two independent paths into one shared point of failure [ML 10]                                                              |

Sanity check before the arm is taken seriously [HF S12]: fit a 1-feature isotonic model on the physics score
alone and put its Brier in the table. If N5's gain over that is small, N5 is a calibrator, not a nowcast.

## 5. Model and training

| Item            | Decision                                                                                                                                                                                                                                                  | Source                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Learner         | XGBoost `hist` on CUDA, binary logistic                                                                                                                                                                                                                   | [v0], LINUX-GPU-PROFILE.md |
| Profile         | `linux_gpu`, `device: cuda`, `nthread: 8`, `--workers 1` (the single GPU is the serialisation point)                                                                                                                                                      | LINUX-GPU-PROFILE.md       |
| Matrix backend  | iterator-fed in-memory `QuantileDMatrix` at 20M and 50M; `max_bin` 255 gives one byte per feature per row, so the 50M × 83 ellpack is approx 4.2 GiB and 20M approx 1.7 GiB                                                                               | LINUX-GPU-PROFILE.md       |
| VRAM ceiling    | 100M × approx 100 features is approx 10 GB, at the edge of 16 GiB with gradients and histograms; 300M+ needs `ExtMemQuantileDMatrix` on GPU at 2-3× slower                                                                                                | [DE S3-14]                 |
| Target          | plain conditional binary, sec 3                                                                                                                                                                                                                           | [memo 10]                  |
| Task split      | one HF model with `mode_class` categorical, plus per-mode calibration/offset heads on that mode's own rows                                                                                                                                                | [memo 1], [ML 13]          |
| Calibration     | **stratified on band × light-state × geomagnetic regime with shrinkage to a global fit for thin cells**; raw scores preserved; production recalibration driven by the shadow scorer, not a one-shot fit                                                   | [ML 16]                    |
| Secondary heads | `median_snr` regression and `p_decode`/`p_qso`, **ungated**; SNR regression as a gated head is cut                                                                                                                                                        | [memo 3], [HF S7]          |
| SNR thresholds  | imported from `src/lib/utils/signal.ts` `MODE_PARAMETERS` under a contract test asserting equality, one source of truth; all SNR normalised to 2500 Hz at convert time with a per-`ssrc` offset in config (RBN CW is 500 Hz-referenced, approx 7 dB away) | [HF S7]                    |
| Candidates      | v4.2 set (long-natural, recent-cycle, recency-weighted, blend) plus the three ablation arms; each records its enumerated month list and rows-per-month                                                                                                    | [v0], [memo 20]            |

**Scale ladder: 20M, 50M, 100M, stop at the measured knee. The 300-600M rung is cut** [memo 26], [ML 11],
[DE S3-14].

| Rung | Fold time                           | 15 candidates × 4 folds | Source                          |
| ---- | ----------------------------------- | ----------------------- | ------------------------------- |
| 20M  | approx 11 min, measured on the 5080 | approx 11 h             | LINUX-GPU-PROFILE.md, [memo 26] |
| 50M  | scaled                              | approx 27 h             | [assumption] until measured     |
| 100M | approx 55 min                       | approx 55 h             | [DE S3-14], [assumption]        |

Ablations roughly double each rung [DE S3-14]. Stop rule, verbatim from V3: **if 20M to 50M gains less than
1% relative on the gate metric, stop scaling.** The measured WSPR-line gain was 0.2828% against a
preregistered `minimum_20m_to_50m_relative_improvement_for_100m = 0.01`, so the 100M decision failed its own
gate and was taken anyway [ML 11]. The threshold goes into config as a decision and the curve carries
day-block bootstrap intervals. Confound to report, not argue about: sampling 20M rows from 90 months against
24 changes rows-per-month approx 4×, so candidate selection is confounded with per-month density, and
**rows-per-month per candidate is a reported column** [ML 11].

## 6. Evaluation protocol, frozen before any fit

Weighted Brier over all cells is **secondary**, not primary [ML 6]. In the December A6 gate, 1,153,023,574
of 1,680,857,829 opportunity-weight (68.6%) sits in the 0.00-0.05 prediction bin where the observed rate is
0.0050, so a weighted-Brier gate is approx 70% a test of "does the model correctly say nothing is happening
on 160m to VK at 1800Z". Worse, the reported `expected_calibration_error: 0.0096` launders a monotone
systematic over-prediction across every actionable bin:

| mean prediction | 0.00655 | 0.0731 | 0.1232 | 0.1742 | 0.2235 | 0.2744 |
| --------------- | ------- | ------ | ------ | ------ | ------ | ------ |
| observed        | 0.00497 | 0.0602 | 0.1050 | 0.1515 | 0.1962 | 0.2455 |
| relative        | 1.32×   | 1.22×  | 1.17×  | 1.15×  | 1.14×  | 1.12×  |

### 6.1 Preregistered gates

Frozen at P0 exit and hashed into the run id; gate scripts read only `ml/config/nowcast_n5.json`
[memo 24], [DE S1-6], [ML 18].

| #   | Gate                            | Threshold                                               | Baseline it is measured against                                 | Slice(s)                                                                | Source               |
| --- | ------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------- |
| G1  | Brier skill                     | ≥ 8%                                                    | calibrated physics (per-band isotonic on the calibration month) | every held-out month                                                    | [memo 24], [DE S1-6] |
| G2  | Per-band no-regression          | no band worse by > 2% Brier                             | calibrated physics                                              | each of 10 HF bands                                                     | [memo 24], [DE S1-6] |
| G3  | Decision-region Brier           | ≥ baseline                                              | calibrated physics                                              | cells with p ≥ 0.05                                                     | [memo 24], [ML 6]    |
| G4  | Signed bias                     | within +/-5% of prevalence                              | observed prevalence                                             | every band × p-bin                                                      | [memo 24], [ML 6]    |
| G5  | ECE                             | ≤ 0.02                                                  | n/a                                                             | overall, with stratified calibration and shrinkage                      | [memo 24], [ML 16]   |
| G6  | Top-1 band hit rate             | ≥ baseline                                              | calibrated physics                                              | per band-hour                                                           | [memo 24], [HF S13]  |
| G7  | Pairwise band-ordering accuracy | ≥ baseline                                              | calibrated physics                                              | per band-hour                                                           | [memo 24], [HF S13]  |
| G8  | Storm slices                    | not worse                                               | calibrated physics                                              | phase × mag-lat band × band group, each paired with a matched quiet day | [memo 24], [HF S6]   |
| G9  | No-recency ablation             | ≥ 80% skill retained                                    | the full model's skill over calibrated physics                  | overall                                                                 | [memo 24], [ML 8]    |
| G10 | Missingness parity              | within 2 pp per feature                                 | training against the shadow window                              | every feature                                                           | [memo 24], [SW S3]   |
| G11 | A6 comparison                   | reported; N5 must win on Brier and calibration          | A6 as served                                                    | shadow window                                                           | [memo 24], [v0]      |
| G12 | Recency parity                  | median Spearman rho ≥ 0.80; quantile-shift share ≤ 0.15 | the collector-served statistic                                  | per (band, hour) on the 2026-07 overlap                                 | [memo 19], [DE S1-4] |
| G13 | Kp distribution parity          | KS test passes                                          | collector 90-day against OMNI-derived training                  | `kp_delta_3h`, `kp_max_24h`                                             | [memo 18], [SW S6]   |

Reference points in the repo used to sanity-check the thresholds [DE S1-6], [ML 18]: December A6
`weighted_brier 0.043440`, `ECE 0.0096`, `weighted_prevalence 0.0994`; V3 climatology reference `0.077440`;
A7 20M held-out logloss 0.183; V2 dense nowcast Brier 0.0935 against sparse 0.1173; physics-only PR-AUC
0.9197. Every gate script is **dry-run against synthetic predictions engineered to fail each gate
individually** before any real result is scored [memo 24], [DE S1-6].

### 6.2 Controls

All five run on the full pipeline. A control that misbehaves is a pipeline bug and the run stops.

| Control          | Construction                                                                  | Expected result                                                                               | Source                |
| ---------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------- |
| Permuted label   | target permuted within (band, hour)                                           | every gate fails; the model scores at climatology                                             | [memo 24], [ML add-1] |
| Time shift       | all recency and space-weather features shifted one further hour into the past | skill degrades **monotonically**; a step change is a causality bug in the join                | [memo 24], [ML add-2] |
| No-recency       | recency block removed                                                         | ≥ 80% of Brier skill over calibrated physics retained, else no ship (G9)                      | [memo 19], [ML 8]     |
| No-physics-prior | physics arm removed                                                           | reported; if the full model's gain over calibrated physics alone is small, N5 is a calibrator | [memo 20], [HF S12]   |
| No-ionosphere    | GloTEC block removed, that is N5-base                                         | N5-iono ships only if it beats N5-base on the same gates                                      | [memo 2]              |

### 6.3 Required slices

Each carries its own no-regression clause and a stated reportability minimum [memo 25], [ML 7].

| Slice                                                                   | Why it would embarrass the model                                                                                                                                             | Source             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Per band                                                                | band-specific regression hides in the aggregate                                                                                                                              | [v0]               |
| Per mode                                                                | v0 asserted per-mode heads and never sliced the gate by mode                                                                                                                 | [ML 7e]            |
| Distance bucket                                                         | hop-count boundaries at 3500/7000/10500 km                                                                                                                                   | [HF S3]            |
| Low-reporter RX fields by exposure decile                               | directly tests whether the model learned reporter counts instead of propagation                                                                                              | [ML 7a]            |
| Rare DX by entity count (Africa, Pacific, South America, 1-2 reporters) | where the user actually looks                                                                                                                                                | [ML 7b]            |
| Marginal openings, absolute `muf_margin_db` < 3                         | grey line, band edges, Es                                                                                                                                                    | [ML 7c], [memo 25] |
| Contest weekends                                                        | activity explodes and reporter behaviour changes                                                                                                                             | [ML 7d]            |
| Magnetic-latitude band                                                  | geographic-only models are biased in opposite directions in the outer bands                                                                                                  | [HF S5]            |
| Storm phase                                                             | four conditions with opposite signs                                                                                                                                          | [HF S6]            |
| Per-month drift table (rows, prevalence)                                | FT8 volume grew approx 10× over 2019-2026; without it "year as a feature is forbidden" is unenforceable, because the model reconstructs the year from the joint distribution | [ML add-3]         |
| Top-1 reporter share diagnostic                                         | above approx 0.8 the positives are a reporter-availability model                                                                                                             | [ML 9]             |
| Cold cells (pairs unseen in training)                                   | memorisation check                                                                                                                                                           | [v0]               |

**Decision utility** [ML add-4], [HF S13]: per band-hour, the top-10 target fields by predicted p and the
observed hit rate of that top-10 against the physics top-10. That is the HamClock tile and the claim the
product makes. Per-prediction uncertainty is emitted so the wall's agree/split/disagree logic does not claim
DISAGREE on a two-observation cell. Every report artifact lands under `ml/results/nowcast_n5/` with input
hashes, as the v4.2 tooling already does [v0].

## 7. Serving contract

Contract name **`madrigal-features-v1`**; the service fails closed on mismatch as today [v0], [memo 27].

| Property              | Value                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Feature admissibility | every feature computable from live sources at issue time                                   |
| New live dependencies | **one** (GloTEC) for N5-iono; **zero** for N5-base                                         |
| GOES XRS              | moved from the `solar_snapshots` snapshot to a **direct fetcher** in the inference service |
| Per-feature metadata  | source, cadence, latency, licence, all listed in the contract                              |
| Period floor          | no feature with a period below 1 h [DE S1-2]                                               |
| Engine coupling       | physics engine content hash recorded; mismatch falls back to the no-physics model [ML 10]  |
| Health endpoint       | each feed's age, `_missing` rate, and the contract hash                                    |
| Staleness             | `_missing` on staleness; GloTEC selects `epoch ≤ T - 30 min`                               |
| Provider status       | stays `unavailable` until the shadow window passes (sec 15)                                |

Fetchers required in the inference service: GloTEC (N5-iono only), GOES XRS, GOES protons, GFZ Hp30/Hp60,
Kyoto Dst realtime, SWPC Kp with 3 h binning applied before lookbacks, and F10.7 with the corrected
`available_at`.

## 8. Shadow mode

Two pieces of collector/service work land before the window starts [memo 28], [ML 12]. Both are for
scoring, not training.

| Piece                        | What                                                                                                                                          | Why                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prediction log table         | written by the inference service: `issue_time`, cell key, `model_id`, `p`, feature-availability flags, contract hash; retained approx 90 days | nothing today logs a per-cell probability. The Band Health ladder (`20260830100000_band_health_ladder.sql`, `collector/src/verdict/ladder.ts`, `verdict_feedback`) is a band-level verdict state machine plus user thumbs; `inferenceMonitor.ts` is an uptime check; `propagation_predictions` is the account-bound consent table |
| Collector exposure aggregate | per (hour, band, mode, field): active-TX flag, active-RX flag, distinct reporters                                                             | `path_hourly_stats` has one row per **heard** pair, positives only, no denominator, so a scorer over it computes recall and nothing else. Brier is not computable without this                                                                                                                                                    |

| Shadow parameter                 | Value                                                                                                                                                      | Source              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Length                           | ≥ 30 days                                                                                                                                                  | [memo 23c], [ML 12] |
| Storm requirement                | ≥ 1 Kp ≥ 5 day, or the storm arm is declared untested                                                                                                      | [memo 23c], [ML 12] |
| Scoring                          | N5 and the served model on the **identical cell set at the same issue time with the same feature availability**, paired by hour with a day-block bootstrap | [ML 12]             |
| Dry run before the window counts | the scorer must first **reproduce the served model's Brier over a past week**; if it cannot, it is a demo                                                  | [memo 28], [ML 12]  |
| Promotion gate                   | N5 beats the served model on Brier and calibration, no band or mode worse than calibrated physics, G10 holds                                               | [v0], [memo 24]     |
| On promotion                     | `PROPULSE_MODEL_BUNDLE` flips; A6/A7 stay as rollback                                                                                                      | [v0]                |

## 9. Infrastructure

`/srv/madrigal`, the 4 TB drive, single purpose, ext4 [memo 30], [DE].

```
/srv/madrigal/
|- raw/year=YYYY/month=MM/rsdYYYY-MM-DD.hdf5     ROLLING, delete after verified convert
|- ledger/
|  |- pull_ledger.jsonl      one line per (day, attempt): status, server file + size, bytes, sha256, MB/s, timestamps
|  |- convert_ledger.jsonl   rows in/out, drop reasons, smode x ssrc histogram, snr histogram, ts range, dup rate
|  |- day_status.parquet     one row per day, joined by EVERY downstream build
|- slim/year=YYYY/month=MM/day=DD/part.parquet   KEEP, the only expensive-to-reacquire layer
|- ref/    field_geometry.parquet | field_solar.parquet | field_centroids.parquet   KEEP, frozen, hashed
|- iono/   glotec (from NetCDF, never GeoJSON) | code (offline reference only) | goes | omni   KEEP
|- cells/run=<cfg-hash>/task=hf/year=/month=/part.parquet    REGENERABLE, sampled
|- cohorts/run=<cfg-hash>/{20m,50m,100m}/                    KEEP for the reported run
|- models/ + results/                                        KEEP, travels to the M5
(DuckDB temp_directory -> the OTHER 1.6 TB drive, reserve 600 GB)
```

| Layer                  | Size                                                                                                    | Keep or regenerate                         | Source               |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------- |
| `raw/`                 | ≤ 350 GB peak, 2-month rolling                                                                          | regenerate; the full pull is approx 9.6 TB | [DE A3], [memo 30]   |
| `slim/`                | approx 1.5 TB (0.9 GB/day at 2026 volumes)                                                              | **keep**                                   | [memo 4], [memo 30]  |
| `ref/`                 | approx 35 MB                                                                                            | keep                                       | [DE]                 |
| `iono/`                | approx 10 GB: CODE approx 1.5 GB, GloTEC approx 0.7 GB from NetCDF, GOES approx 30 MB, OMNI approx 2 MB | keep                                       | [DE S2-11]           |
| `cells/`               | ≤ 600 GB sampled                                                                                        | regenerable; delete after cohorts          | [memo 30], [DE S1-1] |
| `cohorts/`             | 80-150 GB                                                                                               | keep for the reported run                  | [DE]                 |
| `models/` + `results/` | < 5 GB                                                                                                  | keep; travels to the M5                    | [DE]                 |
| **Total**              | **approx 2.5 TB of approx 3.45 TiB usable** (4 TB minus the ext4 5% reserve)                            |                                            | [memo 30]            |

Disk guard refuses any step whose estimated output exceeds free space × 0.8; `collector/src/dbSizeGuard.ts` is
the existing pattern [DE], [memo 6]. **The wipe is destructive: the box agent confirms the device with the
owner on its side, and nothing is formatted on a message from this session** [memo 30].

### 9.1 Tooling that must exist before P1 starts

| #   | Module                                             | Responsibility                                                                                                                                                                                |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ml/src/madrigal/pull.py`                          | resume (`.part` + `os.replace`), timeout, exponential backoff with jitter, ≤ 2 streams, ≤ 1 metadata request/s, per-file ledger line, server-file identity recorded                           |
| 2   | `ml/src/madrigal/verify_day.py`                    | h5 open, row count, `ut1_unix` range against partition date, `smode` × `ssrc` histogram, SNR histogram, geo-drop counts, low-volume floor                                                     |
| 3   | `ml/src/madrigal/day_status.py` + `require_days()` | status in {ok, no_experiment, no_default_file, download_failed, verify_failed, low_volume}; `_missing` propagation for any lag spanning a non-`ok` hour                                       |
| 4   | `ml/src/madrigal/n5_paths.py`                      | run-scoped, **config-hash-derived** paths mirroring `archive_v4_2/run_paths.py`; madrigal scripts ported onto `archive_v3/common.py` and `configure_duckdb`                                   |
| 5   | `ml/src/madrigal/digest.py`                        | order-independent content digest (`bit_xor(hash(row))` + row count + per-column null counts and min/max/mean); byte-level parquet sha256 is unstable because `preserve_insertion_order=false` |
| 6   | `ml/src/madrigal/iono_grid.py`                     | per-product `(lat_order, lon_range, scale_exponent)`, sun-fixed temporal interpolation, and the **subsolar self-test**                                                                        |
| 7   | `ml/src/madrigal/risk_set.py`                      | analytic risk-set estimator + deterministic hash-based negative sampler with exposure weights                                                                                                 |
| 8   | `disk_guard` preflight                             | refuse steps whose estimated output exceeds free × 0.8                                                                                                                                        |
| 9   | `ml/requirements-madrigal.txt`                     | pinned `madrigalWeb`, `h5py`, `netCDF4` on top of **`duckdb==1.5.4`**, hard-required by `opportunity_transform.py`                                                                            |

All tooling items are [DE tooling list] and [memo 6]. The subsolar test is the cheapest correctness
assertion in the programme: on 3 quiet days the grid's TEC maximum must lie within 15 deg of the subsolar
point and the minimum in the winter polar night, catching lat/lon swap, sign flip, longitude convention and
the IONEX exponent in one assertion, identically for every gridded product [DE S2-11].

### 9.2 Machine roles and M5 verification

The box (RTX 5080 16 GiB plus the 4 TB drive) runs pull, convert, cells, features, ionosphere and
all GPU fits. The M5 runs coordination, reports, service tests, gate scripts against frozen artifacts, and
manifest-chain verification; nothing on the M5 runs for hours. Railway and collector PRs carry the serving
contract, fetchers, prediction log and exposure aggregate.

M5 verification cannot be size + sha256, because approx 1 TB never leaves the box [DE S2-12]. The box emits
(i) a content digest per partition, (ii) a fixed-seed 10k-row sample as a small parquet that **does** travel,
(iii) a recompute proof, one randomly chosen day re-derived from raw whose digest matches the ledger. The M5
verifies the chain and runs the gate scripts against the travelling sample.

### 9.3 Slim schema, the irreversible decision

Frozen at P0 exit, before P1. Deleting raw before this is settled is the one unrecoverable mistake in the
programme [memo 4], [HF S2].

| Column                                       | Type / rounding                                                   | Why it must survive the convert                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ut1_unix`                                   | seconds                                                           | the current converter truncates to `hour_utc`, which makes the intra-hour exposure refinement impossible     |
| `tx_lat/tx_lon/rx_lat/rx_lon`                | rounded to 0.05 deg (approx 5 km, far below any grid4)            | the grid4 variance decomposition and within-cell distance distribution cannot be computed from 2-char fields |
| `smode`                                      | verbatim                                                          | the current converter collapses everything to digital/cw, so per-mode heads and thresholds are undefined     |
| `tfreq_khz`                                  | integer                                                           | subband, 60m channel, 10m FM/beacon separation                                                               |
| `ssrc`                                       | dictionary                                                        | source identity, receiver-universe filter, SNR reference bandwidth                                           |
| `snr_2500`                                   | float32, normalised to 2500 Hz with a per-`ssrc` offset in config | RBN CW is 500 Hz-referenced, approx 7 dB from FT8/WSPR                                                       |
| `snr_raw`                                    | float32, range-gated (`build_bronze.py` uses -80 to 40)           | the fill/sentinel value must be identified, not inherited                                                    |
| `tx_callsign`, `rx_callsign`                 | dictionary-encoded                                                | receiver-universe filter, dedupe, reporter-share diagnostic, portable-suffix filter                          |
| `band`, `mode_class`, `tx_field`, `rx_field` | derived                                                           | serving keys                                                                                                 |

Partition `year=/month=/day=` **by the row's own UTC date**, not filename day, because late-arriving reports
in a merged feed land in the adjacent day's file [DE S2-10]. Row-group 250k, zstd, approx 0.9 GB/day at 2026
volumes [memo 4]. Integrity rules baked into the convert [memo 6], [DE S1-5], [DE S2-10]: `.part` +
`os.replace` on every write (today's code writes the final path then guards on existence, so a truncated file
is permanently "complete"); per-day dedupe on `(ut1_unix, tfreq, tx_call, rx_call, ssrc)` with the dup rate
recorded, since a year-varying dup rate silently drifts every count feature; an epoch gate
(`BETWEEN 1230768000 AND 1893456000`) plus the SNR range gate; a low-volume floor at 20% of the trailing
7-day median; a per-day `smode` × `ssrc` × band histogram failing above 2% unknown share or a > 5 pp move;
every DuckDB connection through `archive_v3.common.configure_duckdb`; `CHUNK` sized from `nproc` and RAM
rather than the hardcoded 20,000,000; a 324-entry field lookup indexed by `fi*18+fj` in place of the encoder;
and streaming through `pyarrow.ParquetWriter` instead of `pd.concat` [DE S2-8].

## 10. Phases

One GitHub epic on Project #4 with one sub-issue per bounded task; the per-phase breakdown below is the source for those issues.

### P0 - Measure

| Field     | Value                                                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner     | box agent                                                                                                                                                                                    |
| Inputs    | box access, the sec 9.1 tooling, `ml/requirements-madrigal.txt`                                                                                                                              |
| Scope     | 2024-07 end to end, **plus 4 stratified probe days** (2019-06-15, 2021-06-15, 2023-06-15, 2025-06-15), **plus 30 quarterly vocabulary days** [memo 31]                                       |
| Budget    | approx 100 GB of pull (vocabulary days plus 31 days of 2024-07); at the unmeasured 10 MB/s [DE A4] a few days, but the point of P0 is to replace A4 with a measurement                       |
| Stop rule | **if sampled `cells/` exceeds approx 600 GB, or the p10 throughput implies a P1 pull beyond 4 weeks, stop and re-scope the window before P1.** Newest-first makes re-scoping cheap [memo 31] |

Exit checklist: the 16 data-engineer items [DE], items 1-16, plus the six additions of [memo 31], items 17-22.

| #   | Artifact                                                                               | Passing condition                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ledger/pull_ledger.jsonl`, 31 days + 4 probes + 30 vocabulary days                    | every line has status, server file name + size, bytes, sha256, **MB/s**; ≥ 1 deliberate kill -9 retried cleanly; median and p10 MB/s recorded                                                                                          |
| 2   | `throughput_budget.json`                                                               | P1 wall clock derived from #1's p10, with the newest-first day order enumerated                                                                                                                                                        |
| 3   | `madrigal_endpoint_decision.json`                                                      | whether direct `/madtoc/` HTTP URLs work (then `curl -C -`) or `getMadfile.cgi` is required; the observed hang reproduced or ruled out **from the box**, not a sandbox                                                                 |
| 4   | `ledger/convert_ledger.jsonl`                                                          | per-day rows in/out, drop reasons, `smode` × `ssrc` × band histogram, SNR histogram, dup rate, ts range; peak RSS < 4 GB/worker; < 90 s per day-file                                                                                   |
| 5   | `mode_vocabulary.json`, 30 quarterly days 2019-2026                                    | every `smode`/`ssrc` value over the window enumerated and classified; unknown share < 2% on every probe day                                                                                                                            |
| 6   | `snr_semantics.json`                                                                   | fill/sentinel value identified per `ssrc`; reference-bandwidth offsets fixed in config                                                                                                                                                 |
| 7   | `schema_frozen.json`                                                                   | slim column names, types, encodings and partitioning (`year=/month=/day=` on the **row's own** date), row-group 250k, zstd; digest recipe fixed                                                                                        |
| 8   | `ledger/day_status.parquet`                                                            | 31 + 4 rows, every status exercised at least once in a fault-injection test                                                                                                                                                            |
| 9   | `risk_set_estimate.json`                                                               | measured active-field counts per (band, hour) for 2024-07; extrapolated full-window cell count; chosen `neg_keep` per band; predicted `cells/` and `cohorts/` bytes                                                                    |
| 10  | `ref/field_geometry.parquet`, `ref/field_solar.parquet`, `ref/field_centroids.parquet` | built and hashed; centroids from the training window only; the 2024-07 cell build contains **zero** per-row Python                                                                                                                     |
| 11  | `iono/` for 2024-07 (GOES; GloTEC N/A pre-2025; CODE as offline reference)             | subsolar test passes for every gridded product; `tec_age_min`/`_missing` semantics unit-tested                                                                                                                                         |
| 12  | `recency_parity_2024_07.json`                                                          | Madrigal-restricted-to-collector-receivers recency rebuilt; Spearman rho and quantile-shift share reported **both** restricted and unrestricted (the gate itself runs in P2 on the 2026-07 overlap)                                    |
| 13  | `gates.json`                                                                           | every number in sec 6.1 filled in and hashed into the run id; gate scripts dry-run against synthetic predictions engineered to fail each gate individually                                                                             |
| 14  | `run_manifest_2024_07.json` + travelling 10k-row sample                                | content digests per partition; one randomly chosen day re-derived from raw with a matching digest; the M5 verifies the chain and runs the gates against the sample                                                                     |
| 15  | one fit on 2024-07 cells                                                               | completes on the 5080; records `training_profile`, VRAM, wall clock; beats P.533 on the month directionally (a smoke test, not a gate)                                                                                                 |
| 16  | `box_inventory.json`                                                                   | RAM, cores, free space on both drives, driver version, `xgboost.build_info()['USE_CUDA']`, `duckdb.__version__ == 1.5.4`. Every memory limit in P1-P4 derives from these, and they are currently unstated anywhere [DE A6]             |
| 17  | `receiver_count_slope.json`                                                            | success regressed on `log(rx_station_count)` within (band, hour, distance bucket) at fixed MUF margin; slope and interval recorded and carried into every gate report [HF S1]                                                          |
| 18  | `grid4_variance_decomposition.json`                                                    | decode-rate variance within (field-pair, band, hour) decomposed by true great-circle distance quartile on 40m and 10m short paths; above 15-20% explained variance disqualifies field grain there and reopens the two-tier key [HF S3] |
| 19  | `glotec_prediction_agreement.json`                                                     | if the NCEI archive path resolves, feed CODE-derived values into a GloTEC-trained model on the overlap and measure the **Brier delta**, which is the substitution cost. Do not gate on TECU agreement [SW S2]                          |
| 20  | `dst_realtime_archive_check.json`                                                      | whether an archive of the Kyoto **realtime** series exists for the window; if not, Dst drops in favour of Hp30/Hp60 [memo 18], [SW S6]                                                                                                 |
| 21  | `glotec_ncei_path_check.json`                                                          | the real NCEI archive path found, or recorded unavailable; both candidate paths 404'd [measured 2026-09-07]                                                                                                                            |
| 22  | `storm_slice_design_check.json`                                                        | the storm slice reproduces the 2024-05-10 06-12 UT positive phase on 15m/10m before any model is fit [memo 23], [HF S6]                                                                                                                |

### P1 - Pull and convert, newest-first

| Field              | Value                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner              | box agent, background, weeks                                                                                                                                                                                                                                                                                                 |
| Inputs             | frozen `schema_frozen.json`, `throughput_budget.json`, **both owner actions from sec 1.1 completed**                                                                                                                                                                                                                         |
| Budget             | pull: 9.6 TB at 10 MB/s is 268 h = approx 11.2 days continuous, approx 22 days at 5 MB/s, approx 5.6 days at 20 MB/s; realistic with server latency and retries **2-5 weeks** [DE S2-7], all [assumption] until P0's p10 replaces A4. Convert: approx 60 s per day-file × 8 shards, approx 5.7 h for a full window [DE S2-8] |
| Exit artifacts     | `pull_ledger.jsonl` and `day_status.parquet` covering every day pulled, with a gap list; `slim/` written and digest-verified; raw deleted only after a verified convert                                                                                                                                                      |
| Passing conditions | `day_status` row count equals the day count of the pulled range; kill -9 fault injection leaves nothing in a false "done" state; no day marked `ok` below the low-volume floor                                                                                                                                               |
| Stop rule          | stop the backfill when the P3 cohort scaling curve flattens; do not pull 2019-2021 on faith [memo 5]                                                                                                                                                                                                                         |

### P2 - Features, reference tables, ionosphere, parity

| Field              | Value                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner              | box agent                                                                                                                                                                                                                                                                                                                               |
| Inputs             | `slim/`, `ref/`, `iono/`, the 2026-07 collector overlap                                                                                                                                                                                                                                                                                 |
| Budget             | 10-30 min per month from a cold cache, so approx 15-45 h for 90 months and less for a truncated window [DE S3-13], [assumption]                                                                                                                                                                                                         |
| Exit artifacts     | feature tables with tested `_missing` semantics; `recency_parity_2026_07.json`; `watermark_distribution.json` (minute-of-hour of each hour's `path_hourly` watermark advance, over 30 days); `solar_snapshot_replay.json` (per-hour vector equality); subsolar results per product; the IRTAM curl matrix re-run to confirm the embargo |
| Passing conditions | G12 passes; the offline availability simulator matches the measured watermark distribution within 2 pp per hour bucket; solar replay is exactly equal per hour; no feature has a period below 1 h                                                                                                                                       |
| Stop rule          | if G12 fails on the **restricted** build, recency is served `unavailable` and the model must clear its gates without it, so G9 becomes the whole story                                                                                                                                                                                  |

### P3 - Fits and ablations

| Field              | Value                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner              | box agent, GPU                                                                                                                                                                                                                |
| Inputs             | frozen `gates.json`, cohorts at 20M / 50M / 100M                                                                                                                                                                              |
| Budget             | 20M approx 11 min/fold measured (approx 11 h for 15 candidates × 4 folds); 50M approx 27 h; 100M approx 55 h; ablations roughly double each rung [LINUX-GPU-PROFILE.md], [DE S3-14]                                           |
| Exit artifacts     | `training_{20,50,100}m_results.json` with `training_profile`, `training_backend`, VRAM and wall clock per fold; the scaling curve with day-block bootstrap intervals; rows-per-month per candidate; all five sec 6.2 controls |
| Passing conditions | permuted-label control scores at climatology; time-shift control degrades monotonically; the curve is reported before the next rung is authorised                                                                             |
| Stop rule          | **stop at the measured knee.** If 20M to 50M gains less than 1% relative, do not fit 100M; spend the compute on the ionosphere block and the label [memo 26], [ML 11]                                                         |

### P4 - Gates

| Field              | Value                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner              | M5 orchestrator                                                                                                                                                                        |
| Inputs             | the box's manifest chain, the travelling 10k-row sample, `training_*_results.json`, `gates.json`                                                                                       |
| Exit artifacts     | a gate report per sec 6.1 with every sec 6.3 slice; the archive gate read **once, irreversibly**, after a preflight assertion that `locked_2025_read == false` in every prior artifact |
| Passing conditions | every gate passes on the archive gate months, or the run is reported failed and no promotion is proposed                                                                               |
| Stop rule          | **a gate is never lowered.** A failed gate ends the run; the next step is a design change, not a threshold change                                                                      |

### P5 - Serving contract, fetchers, shadow plumbing

| Field              | Value                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner              | Railway / collector PRs, one babysat PR at a time                                                                                                                                                                                                                              |
| Inputs             | the packaged bundle, `madrigal-features-v1`                                                                                                                                                                                                                                    |
| Exit artifacts     | the contract file with source/cadence/latency/licence per feature; GloTEC, XRS, proton, Hp30 and Dst-realtime fetchers with cache, age and `_missing`; the prediction log table; the collector exposure aggregate; a health endpoint reporting feed ages and the contract hash |
| Passing conditions | a service test that mutates the engine hash asserts the fallback fires; the shadow scorer **reproduces the served model's Brier over a past week**; provider still reports `unavailable`                                                                                       |
| Stop rule          | if the dry run cannot reproduce the served model's Brier, the shadow window does not start                                                                                                                                                                                     |

### P6 - Shadow and promotion

| Field              | Value                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner              | M5 orchestrator runs it; promotion is an owner action                                                                                                 |
| Inputs             | ≥ 30 days of shadow logs including ≥ 1 Kp ≥ 5 day                                                                                                     |
| Exit artifacts     | a paired day-block bootstrap comparison against the served model on identical cell sets; the G10 missingness parity table; the model card with sec 14 |
| Passing conditions | sec 8's promotion gate                                                                                                                                |
| Stop rule          | if no Kp ≥ 5 day occurs, either extend the window or ship with the storm arm declared untested in the model card                                      |

On promotion `PROPULSE_MODEL_BUNDLE` flips, A6/A7 stay as rollback, and #298/#297 close as superseded once
A7's fold table lands. A7's 20M numbers stay on record as the WSPR baseline [memo 32].

## 11. Risks and how they are handled

| #   | Risk                                                                                                                                                                                                      | Handling                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **GloTEC experimental withdrawal.** SWPC gives experimental products no service guarantee [SW S16]                                                                                                        | N5-base is the guaranteed served line with zero new live dependencies. Withdrawal degrades N5-iono to `_missing` and the standing no-ionosphere ablation is the rollback path, already measured [memo 2]                                    |
| 2   | **CEDAR throughput unknown.** 10 MB/s is [DE A4], explicitly unmeasured, and it sets the P1 critical path (11 days at 10 MB/s, 22 at 5)                                                                   | P0 measures median and p10 MB/s per file; P1 quotes the p10. Newest-first means a slow pull still yields a usable dataset. The P0 stop rule is 4 weeks                                                                                      |
| 3   | **The cells-size bust.** v0 estimated 300-600M cells; the analytic risk set is approx 5-6 billion hourly and approx 12-14 billion at 15-min slots, that is 2-5 TB for one build on a 4 TB drive [DE S1-1] | Hourly cells only; the artifact is a deterministic hash-sampled cohort; `risk_set_estimate.json` is a P0 exit item with a hard 600 GB stop; disk guard at 80% of free space                                                                 |
| 4   | **The receiver-count confound.** P(≥ 1 of N decodes) rises with N; reporter density varies > 10× by region and grows yearly [HF S1]                                                                       | H-1 population features; the P0 slope diagnostic in every gate report; the low-reporter-decile and rare-DX slices; the product claim restated as network detection                                                                          |
| 5   | **The persistence trap (the A6/A7 diagnosis).** One WSPR pair lag carried 49% of gain, four carried 72%, and removing them moved held-out logloss 0.159 to 0.183 [v0]                                     | `prev1` and `prev24` only, as ranks with availability flags; `prev2`/`prev3` cut; training recency computed at collector receiver density; the no-recency ablation is a **shipping gate** at ≥ 80% skill retained (G9)                      |
| 6   | **The Dst product-version year proxy.** Kyoto final/provisional product versions change across 2019-2026, which is a year proxy, and year as a feature is forbidden [SW S6], [v0]                         | Train on the Kyoto **realtime** series if an archive exists (P0 item 20); otherwise drop Dst for Hp30/Hp60. Report RMS(realtime minus final) on the named storm days and re-score the storm gate both ways                                  |
| 7   | **Contributor-terms legal risk.** PSKReporter/WSPRNet/RBN data reaching a billed product via Madrigal has terms nobody has confirmed [SW S16], [HF S16]                                                   | Owner action, in writing, **before P1 puts bulk data on disk**. P0's single month does not need it. If the answer is no, the programme stops at P0 having spent almost nothing                                                              |
| 8   | Madrigal throttling or gaps                                                                                                                                                                               | Sequential polite pulls, ≤ 2 streams, ≤ 1 metadata request/s, identifying USER/EMAIL/AFFIL, the PI courtesy email, a gap ledger, nothing assumed complete; March 2026 already has a known 15-16 gap [v0], [DE S2-7]                         |
| 9   | Silent conversion failures reading as all-negative days                                                                                                                                                   | `day_status.parquet` joined by every build, `_missing` propagation across non-`ok` hours, the low-volume floor, the mode-vocabulary histogram gate. Without these, "after an archive gap nothing works" becomes a learned feature [DE S1-5] |
| 10  | Collector sees approx 1% of PSKReporter                                                                                                                                                                   | Rank statistics only; training statistic restricted to the collector's receiver universe; G12; and if parity fails, recency is served `unavailable` and G9 carries the model [v0], [DE S1-4]                                                |
| 11  | Detection is not reachability                                                                                                                                                                             | Exposure from H-1, absence never a negative by itself, and the network-detection sentence in every report [v0]                                                                                                                              |
| 12  | Leakage                                                                                                                                                                                                   | Enumerated training months with ported v4.2 assertions; zero rows from sealed months in the built matrix; latency simulation; permuted-label and time-shift controls; centroids and rank statistics computed train-only [ML 1], [HF S15]    |
| 13  | Ionosphere grid bugs (lat order, longitude convention, IONEX exponent, GeoJSON lon/lat swap)                                                                                                              | One `iono_grid.py` with declared `(lat_order, lon_range, scale_exponent)` per product, sun-fixed temporal interpolation, and the subsolar self-test run identically for every product [DE S2-11]                                            |
| 14  | Storm behaviour                                                                                                                                                                                           | Programmatic Dst-derived slices by phase × mag-lat band × band group, matched quiet days, and the slice-design check that must reproduce the 2024-05-10 positive phase before any fit [memo 23d], [HF S6]                                   |
| 15  | Reporter drift over years                                                                                                                                                                                 | Year as a feature is forbidden; rank features; the cold-cell slice; and the per-month rows/prevalence drift table that makes the prohibition enforceable [v0], [ML add-3]                                                                   |
| 16  | GOES calibration step across the GOES-15 to 16+ transition                                                                                                                                                | One normalisation convention declared explicitly; the background-flux-by-satellite-epoch plot is the acceptance check [SW S7]                                                                                                               |
| 17  | Reporter identity surviving field aggregation                                                                                                                                                             | Top-1 reporter share per `(rx_field, band)`; down-weight or exclude above threshold; every metric reported by exposure decile [ML 9]                                                                                                        |
| 18  | Physics engine coupling                                                                                                                                                                                   | Physics as a separate arm; engine hash in the contract; fall back to the no-physics model on mismatch, so two independent paths stay independent [memo 20], [ML 10]                                                                         |

## 12. Cut in v1, with reason

Nothing below is dropped silently.

| Cut                                                                                   | Reason                                                                                                                                                                                                                                                                           | Returns when                                                                                              | Source                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| IRTAM / GIRO / DIDBase entirely                                                       | Two independent blockers: CC BY-NC-SA against a billed product, and a measured approx 48 h anonymous-access embargo that is exactly the nowcast window                                                                                                                           | a licence **and** an access level are both in hand, and even then the value is offline-only               | [memo 3], [SW S1], [SW S16]             |
| All three CODE products from the feature vector                                       | No live twin: rapid covers day D and posts D+1, predicted GIMs are extrapolation that miss storms by construction, and training on a spherical-harmonic fit while serving a Kalman assimilation is a substitution of several TECU structured by magnetic latitude and local time | kept as an offline validation reference; returns only if the P0 prediction-agreement Brier delta is small | [memo 3], [SW S2]                       |
| RBN raw archive as a separate pipeline                                                | A second pipeline plus 7 years of callsign-to-grid geolocation for 6,166 spots/day against 379,518 digital                                                                                                                                                                       | v1.1 uses Madrigal's own RBN via `ssrc`, which needs no new pipeline                                      | [memo 3], [DE cuts], [ML cuts]          |
| The 300-600M "full" training rung                                                     | The measured 20M to 50M gain on the WSPR line was 0.2828% against a 1% preregistered threshold, so the curve was already flat and the 100M decision failed its own gate; 300M+ also needs external-memory GPU matrices at 2-3× slower                                            | never on this evidence; a new rung needs a new measured knee                                              | [memo 3], [ML 11], [DE S3-14]           |
| 15-minute cells                                                                       | Nothing in production can serve a sub-hourly statistic, and it costs 2.4× the rows                                                                                                                                                                                               | survives as an intra-hour exposure refinement                                                             | [memo 3], [DE S1-2]                     |
| grid4 as the recency grain                                                            | 324^2 = 105k field pairs against approx 10^9 grid4 pairs                                                                                                                                                                                                                         | never for recency; the grid4 sub-key stays a P0 measurement                                               | [memo 3], [DE cuts]                     |
| `luf_proxy`                                                                           | A two-input analytic formula over X-ray flux and zenith angle, both already features, with a hand-tuned constant in the served contract                                                                                                                                          | replaced by `haf_max_path` in D-RAP form at the sunlit control points                                     | [memo 3], [ML cuts], [SW S8]            |
| `is_weekend`                                                                          | An activity confounder dressed as physics; it teaches the model that Saturday propagates better, then is wrong on a Tuesday DXpedition                                                                                                                                           | replaced by `congestion_rank` and the real contest calendar                                               | [memo 3], [HF drop list]                |
| Raw `bearing_sin` / `bearing_cos`                                                     | No propagation meaning, and bearing plus distance is approximately the field-pair identity, that is a leak                                                                                                                                                                       | replaced by `angle_to_terminator` and `angle_to_magnetic_meridian`                                        | [memo 3], [HF drop list]                |
| `path_success_prev2` / `prev3`                                                        | approx 0.9-correlated with `prev1` on an hourly grid; each is another serving dependency and another route into the persistence trap                                                                                                                                             | never                                                                                                     | [memo 3], [HF drop list]                |
| Absolute `tec_*` (`tec_mid`, `tec_tx`, `tec_rx`)                                      | Column integral dominated by the topside; slab thickness 268-433 km in GloTEC's own field and decoupled from foF2 during storms; plasmasphere is 10-50% at night and contributes nothing to HF; redundant with NmF2 from the same assimilation                                   | only `tec_anomaly_cp` and `tec_gradient_along_path` survive                                               | [memo 3], [SW S13], [HF drop list]      |
| Solar-wind MHD channels `by`, `bt`, `plasma_beta`, `alfven_mach`, `magnetosonic_mach` | Reach HF only through geomagnetic activity, which Kp/Hp/ap/Dst already summarise; five more channels to keep healthy                                                                                                                                                             | never                                                                                                     | [memo 3], [HF drop list]                |
| `sunspot_number`                                                                      | Served monthly, trained daily: not the same variable, and daily SSN varies 2-3× within a rotation                                                                                                                                                                                | if SILSO daily provisional is both served and trained                                                     | [memo 3], [SW S6]                       |
| SNR regression as a **gated** head                                                    | Doubles the gated surface for output no UI consumes today                                                                                                                                                                                                                        | kept as an **ungated secondary head** feeding the phone transform                                         | [memo 3], [ML cuts]                     |
| Weighted-Bernoulli target with `opportunities` weights                                | The denominator is ambiguous by an order of magnitude between v4.2's station-cartesian count and a slot count bounded at 4, and FT8's 15 s cycle with batched dedup makes the trial count unobservable                                                                           | never in this form; a native-cycle definition would need its own P0 measurement                           | [memo 10], [ML 4]                       |
| Cross-fitted station effects (V3 candidate M3)                                        | Retained as a **diagnostic and exclusion rule** (top-1 reporter share) rather than a model arm, to keep the candidate set at v4.2 size                                                                                                                                           | if the diagnostic shows a material positives mass above approx 0.8                                        | [ML 9]                                  |
| Phone as a modelled task                                                              | No source carries it, and being open about a made-up margin does not make it scorable                                                                                                                                                                                            | it is a documented SNR transform validated against the collector's phone cells and DX cluster SSB spots   | [memo 1], [ML 14], [HF S8]              |
| 6m as a v1 deliverable                                                                | Es-driven; no product carries foEs; the ionosphere block would add variance and no gain; no served recency                                                                                                                                                                       | v2, with `es_range_flag`, `dip_lat` and TEP features                                                      | [memo 1], [ML cuts], [SW S14], [HF S10] |
| Pulling 2019-2020 before it is justified                                              | Newest-first makes "does 2019-2021 help" a decision taken after seeing the scaling curve                                                                                                                                                                                         | when the curve says it helps                                                                              | [memo 5], [DE cuts]                     |

### 12.1 Open questions that remain open

| Question                                                                                                                  | Who answers it        | When |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---- |
| Does an archive of the Kyoto **realtime** Dst series exist for 2019-2026? If not, Dst drops entirely                      | box agent, P0 item 20 | P0   |
| Where is the real NCEI GloTEC archive path, if any?                                                                       | box agent, P0 item 21 | P0   |
| Does within-cell distance explain > 15-20% of variance on 40m/10m short paths, that is does field grain survive there?    | box agent, P0 item 18 | P0   |
| What is the measured CEDAR throughput p10?                                                                                | box agent, P0 item 1  | P0   |
| What is the box's RAM? Every memory limit in P1-P4 currently assumes 64 GB [DE A6]                                        | box agent, P0 item 16 | P0   |
| Is the land/sea raster's licence compatible with a billed product? [assumption], added by analogy with the sec 1.1 ledger | box agent             | P2   |
| Does N5-iono beat N5-base on the same gates, that is does the ionosphere block earn its live dependency?                  | M5                    | P4   |

## 13. Reviewer disagreements and the calls made

| Conflict                   | The disagreement                                                                                                                                                                                                  | The call                                                                                                                                                                                                             | Cost accepted                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Grain**                  | [HF S3] wants a two-tier key (grid4 for same/adjacent fields) because a field is 10 deg × 20 deg and within-cell endpoint spread is comparable to a hop; [DE] wants field only because grid4 is approx 10^9 pairs | Field grain is the serving key and stays; grid4 enters only as a P0 variance measurement, plus the within-cell distance distribution as features                                                                     | If the measurement disqualifies field grain on 40m/10m short paths, v1 ships knowing it and the two-tier key becomes a scoped follow-up               |
| **Label**                  | [HF S1] wants a rate over receivers so numerator and denominator both scale with population; [ML 4] shows the denominator is unobservable for FT8                                                                 | Plain conditional binary, with population as features and a mandatory slope diagnostic                                                                                                                               | The label retains a receiver-count component; it is measured, reported in every gate report, and stated in the product copy rather than modelled away |
| **Ionosphere product**     | [v0] trains on CODE final and serves GloTEC or CODE rapid; [SW S2] calls that a product substitution; [SW S3] shows the archive-start skew makes a full-window GloTEC model 80% `_missing`                        | Train on the product you serve: GloTEC only, in an era-restricted second line (N5-iono), with N5-base guaranteed                                                                                                     | N5-iono trains on 2025 onward only, the cycle-25 decline, which is why it must beat N5-base on the same gates to be served                            |
| **Recency lags**           | [v0] wants `prev{1,2,3,24}`; [HF drop list] wants `prev1` and `prev24` only; [ML 8] wants sparsity-simulated training                                                                                             | `prev1` and `prev24` only, on a receiver-universe-restricted training statistic, with measured availability simulation and a shipping gate on the ablation                                                           | Less recency signal, which given the 72%-of-gain persistence pathology is the point                                                                   |
| **SNR heads**              | [HF S7] wants `p_decode` and `p_qso` heads with `MODE_PARAMETERS` thresholds; [ML cuts] wants no SNR regression in v1 unless a UI consumes it                                                                     | Keep them as **ungated secondary heads** with thresholds imported under a contract test; they do not gate promotion                                                                                                  | Extra training and scoring surface for output only the phone transform consumes today                                                                 |
| **Seasonal holdout**       | [HF S15] notes v0's prospective window is 2.5 months of NH late spring and summer, so a model tuned to pass it is tuned to summer; [ML 2] shows the four sealed 2025 `LOCKED_MONTHS` cover four seasons           | Archive gate = 2025-01/04/07/10, four seasons, still sealed; prospective gate = Madrigal 2026-05 on as released after the freeze, plus a ≥ 30-day live shadow                                                        | The prospective arm is still seasonally narrow at first; the four-season archive gate carries the seasonal claim                                      |
| **Storm slice definition** | [v0] and [ML 17] argue Kp 7 against Kp 5; [HF S6] argues Kp is the wrong variable because storm is four conditions with opposite signs                                                                            | Neither threshold: slices derived programmatically from Dst, PCA days from proton flux on polar-crossing paths only, a separate flare slice, decomposed by phase × mag-lat band × band group with matched quiet days | More slices, each thinner; reportability minimums are declared per slice and a slice that cannot reach them is reported untested rather than passed   |

## 14. What N5 cannot answer, and rollback

N5 answers one question [memo 10], [memo 29]: **given that both fields were active on this band and mode in
the previous hour, will the receiving field's reporter network hear at least one transmitting station in the
transmitting field during this hour?** It does not answer, and the UI must not imply that it answers:

| Not answered                                  | Why                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whether **you specifically** will be heard    | The label has no power, antenna or local-noise term; between fields, ERP times RX system varies by approx 40 dB [HF S14]                                         |
| Whether a **QSO** will happen                 | The label is a one-way decode at approximately 50% decode probability; a QSO needs the reverse path and QSB margin [HF S7]                                       |
| Phone conditions with ground truth            | No phone source exists; phone is a documented SNR transform validated against the collector's phone cells and DX cluster SSB spots [memo 29], [HF S8]            |
| 6m                                            | Es and TEP dominated; no product carries foEs; no served recency [memo 29]                                                                                       |
| **When a band will open**                     | GloTEC is nowcast-only; a forecast needs a driver-forecast path (v2), and every N5 feature must be computable from live values at issue time [memo 29], [HF S13] |
| Anything on a path where the network is blind | Low-reporter RX fields are a required slice precisely because this is where the model is least trustworthy [ML 7a]                                               |

Rollback is automatic, not a judgement call [memo 29], [ML add-5]:

| Trigger                                                                                                 | Action                                                                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Shadow-window Brier or calibration worse than the served model                                          | do not promote                                                                 |
| Any band or mode worse than calibrated physics in the shadow window                                     | do not promote                                                                 |
| Post-promotion: rolling 7-day shadow Brier worse than A6 for 3 consecutive days [assumption]            | revert `PROPULSE_MODEL_BUNDLE` to A6                                           |
| Post-promotion: G10 missingness parity breaches 2 pp on any feature for 24 h ([assumption] on the 24 h) | revert to A6 and open an incident                                              |
| GloTEC withdrawn or unavailable > 6 h [assumption]                                                      | N5-iono falls back to N5-base; if N5-base is not the served line, revert to A6 |
| Physics engine hash mismatch at inference                                                               | fall back to the no-physics model; never serve a silent mismatch               |
| Recency parity (G12) breaks in production monitoring                                                    | serve recency as `unavailable`; the no-recency arm must still clear its gates  |

A6 and A7 stay packaged and deployable throughout. A7's 20M numbers remain the WSPR baseline on record.

## 15. Process

| Rule             | Detail                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Orchestration    | The Fable session orchestrates: briefs, calls, and the integration edits                                                                                                                                                                                                                                                                         |
| Implementation   | Opus and Sonnet sub-agents implement, on the box for pull/convert/features/fits, on the M5 for gates and reports, and as Railway/collector PRs for serving                                                                                                                                                                                       |
| PRs              | **One babysat PR at a time.** No parallel babysits                                                                                                                                                                                                                                                                                               |
| Plan of record   | This file, `ml/NOWCAST-N5-PLAN.md`, and `ml/n5-reviews/` are the plan of record. Changes go through a PR and are reflected on the epic                                                                                                                                                                                                           |
| Runbook          | Sec 9 and sec 10 of this file are the runbook; per-task commands live in the task issues                                                                                                                                                                                                                                                         |
| Issues           | GitHub Project #4: one epic, one issue per bounded task (P0-P6 plus bug fixes and owner actions), sub-issues of the epic. Any agent (Claude, Codex, Grok, Cursor) or human may claim a task: set the board's Agent field, move Status to Claimed, one task per agent at a time, post exit artifacts in a comment and move to In review when done |
| GPU coordination | **No GPU job starts on the box without posting to the aethersdr-fb peer.** The 5080 is shared                                                                                                                                                                                                                                                    |
| The drive wipe   | Destructive; the box agent confirms the device with the owner on its side, and nothing is formatted on a message from this session                                                                                                                                                                                                               |
| Gates            | **Gates are never lowered.** A failed gate ends the run; the next step is a design change                                                                                                                                                                                                                                                        |
| WSPR             | The live WSPR pipeline is never rebuilt. Decommissioned 2026-07-21, stays dead                                                                                                                                                                                                                                                                   |
| Provider status  | The inference provider stays `unavailable` until the shadow window passes                                                                                                                                                                                                                                                                        |
| Owner actions    | Two, both blocking P1 and neither delegable: contributor terms in writing, and the courtesy email to the Madrigal 8308 PI                                                                                                                                                                                                                        |
