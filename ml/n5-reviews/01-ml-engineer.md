I have enough grounding. Here is the review.

---

# NOWCAST-N5 adversarial review

## S1 — Blocking

### 1. The declared training window contains every holdout

**Plan (§2):** "Window: 2019-01-01 → 2026-07-15" … "early-stopping/calibration months drawn from 2024-02, 2024-05, 2024-07, 2024-08; selection evaluation on 2024-10/11" … "Locked gates … (a) December 2024; (b) prospective 2026-05-01 → 2026-07-15."

Every early-stopping, calibration, evaluation and gate month sits inside the training range as written, and the plan never states an exclusion. This is not a hypothetical: `ml/src/archive_v4_2/phase2_core.py:validate_config` enforces disjointness structurally today —

```python
if month in training or any(value >= month for value in training):
    raise Phase2Error(f"{name} includes its future validation month")
```

— and N5 proposes no equivalent while moving from an enumerated month list (`base_training_months` = 24 explicit quarterly months) to a contiguous range. A range is the exact shape that lets this pass unnoticed at 300M rows.

**Change:** keep training months as an enumerated list in config, never a range. Port the v4.2 assertions verbatim (fold training months strictly earlier than the fold's early-stopping month; calibration/eval/gate months absent from every candidate's training set). Add a build-time invariant: the training parquet must contain zero rows with `hour_utc` in any sealed month.
**Verify:** CI assertion that `set(training) ∩ set(ES ∪ calib ∪ eval ∪ gates) == ∅`; a row-count query on the built matrix per sealed month returning 0; gate scripts refuse to score if a gate month's dataset hash appears in any training manifest.

### 2. "Locked gate (a) December 2024" was opened on 2026-07-15

`ml/results/propagation_v4_2/propagation_v4_2_phase2_scale/december_gate_result.json` records `"december_2024_read": true`, `generated_at: 2026-07-15T23:31:10Z`, 52,101,759 rows, `weighted_brier: 0.043440`, full per-bin reliability. December was scored, reported and used to justify the A6 promotion. Reusing it as N5's locked gate is scoring on an opened test.

Compounding this, the plan silently drops the four months in `phase2_core.LOCKED_MONTHS` that are _still_ sealed — 2025-01, 2025-04, 2025-07, 2025-10 (`locked_2025_read: false` everywhere in the results tree). Those cover a full seasonal cycle at solar max and are the most valuable unread data the project owns.

**Change:** demote 2024-12 to a _contaminated continuity reference_, reported next to A6/A7 and explicitly labelled as such. Promote 2025-01/04/07/10 to the locked archive gates.
**Verify:** preflight assertion in the gate script that `locked_2025_read == false` in every prior artifact before the first read; then record the read once, irreversibly.

### 3. The "prospective" 2026-05→07-15 window is neither prospective nor clean

It is archive data that exists today (Madrigal lags ~7.5 weeks; 2026-07-15 _is_ the current edge). The same wall-clock window has been mined hard on the production side: the #297/#306 recency design, the A7 Hp60/recency-v2/chain-reason deploys, and the Band Health verified-state ladder were all built and evaluated against live spot behaviour over exactly May–July 2026. Every decision about which recency statistic to use, what the exposure denominator looks like, and how the collector behaves was tuned inside it. "Never read during development" is a policy assertion no code can enforce retroactively.

**Change:** the only genuine prospective gate is a window that is in the future _at freeze time_. Declare one now (e.g. Madrigal 2026-10-01 → 2026-11-30, released ~Dec) plus the live shadow window. Reclassify 2026-05→07-15 as development data and say why in the manifest.
**Verify:** the frozen config records the gate window's start date; the gate script refuses to run if that date is not in the past _relative to the freeze timestamp recorded in the config_.

### 4. The weighted-Bernoulli target is not well-defined, and its exposure count is fictional for FT8

**Plan (§3):** "Slot = 15 min … Opportunity = active TX × active RX in the same slot … Model target: `success_rate` with `opportunities` as weight (weighted Bernoulli), exactly as v4.2."

It is _not_ exactly as v4.2. Two defects:

**(a) The denominator is ambiguous by an order of magnitude.** In V3/v4.2 `opportunities` was a **station-cartesian** count — the audit was 8,003,944,014 HF opportunities over 273,137,641 rows (~29 per row), and December's A6 gate shows 1,680,857,829 opportunity-weight over 52,101,759 rows (~32 per row). N5 aggregates to `(hour, band, mode, tx_field, rx_field)` from 15-minute slots; if `opportunities` counts _slots_, it is bounded at 4 and the "weighted Bernoulli" degenerates into a near-unweighted binary label with weights in {1,2,3,4}. Every gate number inherited from the WSPR line becomes incomparable. The plan does not say which.

**(b) FT8's cycle makes the trial count unobservable.** FT8 is a 15 s cycle; a 15-minute slot is up to 60 transmit periods. PSKReporter clients batch-upload with per-(callsign, band) dedup inside the flush interval, so one Madrigal record is not one Bernoulli trial. Counting station-pairs within a slot as "opportunities" assumes every active TX transmitted every cycle and every active RX listened on that band for the whole slot — neither holds (odd/even alternation, band-hopping, WSJT-X reports only the band it is tuned to). You are weighting by a quantity you cannot observe.

**Change:** either define opportunity at the native cycle for digital (15 s FT8 / 7.5 s FT4 / 120 s WSPR) and derive per-station cycle counts from observed decoded cycles as a lower bound; or drop the weighted-Bernoulli framing and model the plain conditional binary "at least one decode this hour given both fields active" — which is what `madrigal_build_cells.py` actually does (`open ∈ {0,1}`) — and stop describing it as an attempt probability.
**Verify:** on the P0 month, report the distribution of `opportunities` per row under both definitions and the implied per-cycle success rate; re-run the aggregate-vs-unaggregated binomial equivalence check the V3 plan required (it has never been run on a PSK feed); sanity-check that the implied attempts/hour for a single station is physically possible.

### 5. `madrigal_build_cells.py` does not implement §3, and the difference _is_ the selection bias

**Plan (§3):** "Reuse the exposure-aware construction from `ml/ARCHIVE-MULTIMONTH-V3-PLAN.md` and `madrigal_build_cells.py`."

The script's opportunity set is `tx_active` × `rx_active` joined on `hour_utc` only — activity on **any** band — then `CROSS JOIN` over all 11 bands. §3 instead conditions on activity _on that band and mode_. That is a much stronger conditioning and it induces exactly the bias that matters: an RX field only appears on 10m when 10m is already open enough for someone there to have heard something on 10m. You end up training and scoring `P(open | someone already heard something on this band from this field)`, which approaches 1 by construction on the high bands and is not the question the user asks ("should I try 10m?"). The March-proof headline numbers (PR-AUC 0.9564, Brier 0.0935) belong to the _loose_ definition and will not carry over.

**Change:** condition RX exposure on the RX station being on the air at all in the slot (any band), and carry "was anyone listening on this band there" as a **feature plus an explicit uncertainty channel**, not as a filter. TX exposure conditioned on decoded-somewhere-on-that-band is unavoidable; state it.
**Verify:** build both variants for one month; report prevalence and per-band Brier for each. If the band-conditioned variant has prevalence > 0.5 on 20m, the label is measuring reporter presence, not propagation — that is the tell.

---

## S2 — Serious

### 6. Weighted Brier on cells is the wrong primary, and the December artifact proves it

**Plan (§6):** "Metrics: weighted Brier (primary)."

In the December A6 gate, **1,153,023,574 of 1,680,857,829 opportunity-weight (68.6%)** sits in the 0.00–0.05 prediction bin where the observed rate is 0.0050. A weighted-Brier gate is therefore ~70% a test of "does the model correctly say nothing is happening on 160m to VK at 1800Z". You can win the gate comfortably and ship something useless.

Worse, the reported `expected_calibration_error: 0.0096` launders a **monotone systematic over-prediction across every actionable bin**:

| mean pred | observed | relative |
| --------- | -------- | -------- |
| 0.00655   | 0.00497  | ×1.32    |
| 0.0731    | 0.0602   | ×1.22    |
| 0.1232    | 0.1050   | ×1.17    |
| 0.1742    | 0.1515   | ×1.15    |
| 0.2235    | 0.1962   | ×1.14    |
| 0.2744    | 0.2455   | ×1.12    |

The served model over-promises by 12–32% relative, everywhere a user would act on it, and the headline ECE is 0.0096.

**Change:** primary = Brier skill restricted to the decision region (cells where physics or the model puts p ∈ [0.1, 0.9]), plus reliability-in-the-large per band with a **signed** bias term, plus a decision metric matching the UI (precision/recall at the "worth calling CQ" threshold, and top-k target-field ranking per band-hour). Keep weighted Brier as secondary.
**Verify:** recompute the existing December artifact restricted to the decision region and publish how much of the 0.4352 skill survives. Do this before writing any gate number.

### 7. The slice that would embarrass the model is not in the gate list

**Plan (§6):** slices by band, mode, distance, day/night, storm, cold cells.

Missing, in rough order of how badly they would hurt: (a) **low-reporter-count RX fields**, sliced by the RX field's exposure decile — this directly tests whether the model learned "how many reporters live there" instead of propagation; (b) **rare-but-wanted DX** (Africa, Pacific, South America RX fields with 1–2 reporters) — where the user actually looks; (c) **marginal openings**, true hourly rate in [0.1, 0.5] — grey-line, band edges, Es; (d) **contest weekends**, where activity explodes and reporter behaviour changes; (e) **per mode** — the plan asserts per-mode heads and never slices the gate by mode.

**Change:** add all five as required report slices with their own no-regression clause and a stated reportability minimum.
**Verify:** they are groupbys on the existing scoring path; cost is negligible and the absence is the risk.

### 8. The recency feature is the leak the plan says it removed, at coarser grain

**Plan (§0):** the whole motivation is that the WSPR path lags carried 72% of gain and were unservable persistence. **Plan (§4):** `path_recency_quantile_prev{1,2,3,24}` at field grain.

Look at what production actually serves (`supabase/migrations/20260906230000_path_recency_quantile.sql`): `recency_rate = 1 / exposure` where `exposure` is the count of distinct TX fields that RX field heard this hour, and `recency_quantile = percent_rank() OVER (PARTITION BY band ORDER BY recency_rate)`. Two consequences the plan does not address:

- The value is a deterministic monotone function of the **RX field's breadth** — identical for every TX field that RX field heard. It carries almost no path-specific information; what carries information is **whether the row exists at all**, and rows exist only for heard pairs. The availability flag _is_ a lagged label. Rank-normalising the value does not touch that.
- At Madrigal density essentially every plausible pair is "heard" in the previous hour, so the training-time availability flag is near-constant 1, while the collector at ~1% of the feed produces a near-constant 0. The §7 parity test as written ("compare the rank statistic distributions and per-cell agreement") compares only rows that exist on both sides — it is structurally incapable of detecting this.

**Change:** (a) the parity gate must compare the **availability rate and the joint (available, value) distribution over the full candidate cell set**, not the intersection; (b) train with the collector's sparsity simulated — seeded per-hour masking that drops pairs a 1%-density network would not have observed, so the model sees serving-time availability; (c) promote the no-recency ablation from diagnostic to **gate**: if N5 does not beat physics without recency, it does not ship.
**Verify:** publish availability rate per band-hour for Madrigal vs collector over the overlap; require agreement within a declared tolerance or the masking simulation to be in force.

### 9. Reporter identity survives field aggregation and the plan drops V3's answer

In a sparse region, a `(tx_field, rx_field)` pair's label is often produced by _one_ skimmer or one PSKReporter station. Its uptime, antenna, and firmware are baked into the label, and the model reaches them through geometry. The V3 protocol had a named remedy — cross-fitted station effects estimated _inside each fold_ (candidate `M3`, "Station observation model") — and N5 drops it without comment.

**Change:** retain it at minimum as a diagnostic and an exclusion rule: per `(rx_field, band)`, compute the fraction of positives attributable to the single most active reporter; down-weight or exclude cells above a threshold; report every metric by exposure decile.
**Verify:** on one month, if top-1-reporter share exceeds ~0.8 for a material fraction of positives, that mass is a reporter-availability model and must be reported as such.

### 10. Physics-prior stacking: the plan names the risk and does not solve it

**Plan (§4, §12):** "the fallback path becomes a feature the model can down-weight" / "Whether a physics-prior feature creates a dependency we regret."

Three concrete problems beyond retraining: (i) the engine already consumes SFI/Kp, so the stacked feature is largely a nonlinear function of features already in the matrix — it buys little and couples you to engine bugs; (ii) **the fallback inverts** — physics is today an _independent_ safety net when the model is unavailable, but with stacking the model becomes unavailable whenever physics is, turning two independent paths into one shared point of failure; (iii) "bit-identical offline and online" needs enforcement, not a harness reference.

**Change:** ship the physics prior as a **separate arm** (V3's `M4`), gated on measured incremental skill over the no-physics model. If it wins: pin the engine by content hash into the bundle manifest, assert at inference that the hash matches training, and fail _to the no-physics model_ on mismatch rather than serving a silent mismatch. Add a `physics_missing` flag and drop physics on ~5% of training rows so degradation is graceful.
**Verify:** ablation table with/without on identical folds; a service test that mutates the engine hash and asserts the fallback fires.

### 11. The scale ladder contradicts the only measurement that exists

**Plan (§5):** "Scale ladder: 20M selection → 100M → full (est. 300–600M cells over the window; measure)."

The measured 20M→50M relative Brier improvement on the WSPR line was **0.2828%**, against a preregistered `minimum_20m_to_50m_relative_improvement_for_100m = 0.01`. The learning curve was already flat and the 100M decision **failed its own gate**. N5 proposes going ~10× further on a denser but structurally similar dataset with no new evidence and no stated reason why it would differ. (There is a plausible reason — multi-mode/multi-source label diversity and ionosphere features that need volume to exploit — but that is a hypothesis, not a finding, and the plan does not state it.)

Separately, 20M-row selection cannot predict full-scale ranking when the candidates differ in _training-month composition_: sampling 20M rows from 90 months versus 24 months changes rows-per-month ~4×, so candidate selection is confounded with per-month density.

**Change:** carry the V3 stop rule forward verbatim — 5M/20M/50M curve first, stop scaling if 20M→50M is under 1% relative, and spend that compute on the ionosphere block and the label instead. Write the number into the config as a decision, not a plan step. Report rows-per-month per candidate so the confound is visible.
**Verify:** the curve, with day-block bootstrap intervals, before any 100M run is authorised.

### 12. Shadow mode as designed cannot be scored

**Plan (§8):** "store its predictions per cell and score them when the collector's spots for that hour resolve (the Band Health self-scoring ladder already does this for the served model)."

Both halves are false against the repo:

- The Band Health ladder (`supabase/migrations/20260830100000_band_health_ladder.sql`, `collector/src/verdict/ladder.ts`, `verdict_feedback`) is a **band-level** verdict state machine plus user thumbs-up/down — it logs no per-cell model probability and scores nothing. `collector/src/collectors/inferenceMonitor.ts` is a health-endpoint uptime check. `propagation_predictions` is the account-bound research/consent table, not a shadow log.
- The only durable spot data is `path_hourly_stats` / `band_hourly_stats`, and `path_hourly_stats` has **one row per heard pair** (`UNIQUE (hour_utc, band, mode_class, tx_field, rx_field)`, columns `spot_count/unique_tx/unique_rx/…`) — positives only, no exposure denominator. `spot_history` is a 2-hour sliding window. A shadow scorer over this can compute recall and nothing else. **Brier is not computable.**

**Change, in order:** (i) add a prediction-log table written by the inference service (issue_time, cell key, model_id, p, feature-availability flags, contract hash), retained ~90 days; (ii) add an **exposure aggregate** to the collector — per (hour, band, mode, field): active-TX flag, active-RX flag, distinct reporters — so a shadow hour's candidate cell set is reconstructible; (iii) score N5 and the served model on the identical cell set at the same issue time with the same feature availability, paired by hour with a day-block bootstrap. Also raise "≥14 days" to ≥30 days _and_ require at least one Kp≥5 day, or state that the storm arm is untested.
**Verify:** the shadow scorer must first reproduce the **served** model's Brier over a past week as a dry run. If it cannot, it is a demo.

---

## S3 — Worth fixing

### 13. Per-mode heads: the data already answers half the question

CW/RBN, WSPR and FT8 differ in **observation process**, not just physics — RBN skimmers are always-on wideband decoders (~−15..−20 dB) with enormous clumped coverage; WSPR is −28 dB on 2-min slots from stationary beacons; FT8 is operator-driven with duty cycle. A single `mode` feature must carry detection threshold, duty cycle and population simultaneously.

**Change:** one shared propagation trunk fit on **digital only** (the homogeneous mass), then per-mode calibration/offset heads on that mode's own rows — this is arm 3 of the V3 station-observation comparison ("shared propagation score plus source-specific detection/calibration heads"), specified and never run. Do not fit CW as a co-equal target until RBN geolocation error is measured; RBN spots carry no grid and callsign→grid backfill over 2019–2026 is a large unbudgeted error source that the plan covers in one clause.
**Verify:** run the three-arm comparison on one month; report the per-mode calibration slope of the shared model. Slopes differing by more than ~15% justify separate heads.

### 14. Phone served as "digital + margin, stated openly" is a fabricated probability

**Plan (§2).** Being open about a made-up number does not make it scorable. Either derive the margin from measured SNR distributions on shared paths, or serve phone from physics only and label it. **Rule:** if you cannot score it, do not serve a probability for it.

### 15. The grain question is posed without the measurement that decides it

**Plan (§3, §12):** "build cells at both field (2-char) and grid4 for one quarter and measure the gain."

A field is 20°×10° — multiple hop counts, and near the poles wildly different geomagnetic latitude. The measurement to run first is not "does grid4 help" but **how much within-field label heterogeneity exists**: variance of hourly success rate across grid4 sub-cells inside the same field pair. Large heterogeneity means the field-grain model is fitting a mixture and its calibration will stay geography-dependent no matter how much data you add.
**Verify:** intra-field variance decomposition per band and distance bucket. It is a groupby, not a training run — do it before P3.

### 16. Calibration is one line and it is the thing users feel

**Plan (§5):** "isotonic/Platt calibration selected on the calibration month as today."

Isotonic on a single solar-max month will not transfer to a quiet month or a storm; per-band isotonic on 6m/12m will overfit thin positives; and the December artifact shows the current setup ships a consistent 12–32% relative over-prediction (§6 above). The V3 plan already specified stratified calibration with shrinkage to a global fit for sparse bands; N5 drops it.

**Change:** fit calibration stratified on band × light-state × geomagnetic regime with shrinkage to global for thin cells; preserve raw scores; add a production recalibration path driven by the shadow scorer rather than a one-shot fit.
**Verify:** calibration-transfer test — fit on 2024-08, evaluate reliability separately on a quiet month and a storm month; report slope and intercept for each.

### 17. "Storm-slice Brier not worse than physics" is an alibi, not a gate

**Plan (§2, §6).** Kp≥7 is perhaps 5–10 days across the whole window; the model will have near-zero storm training mass, and the physics engine's own storm behaviour is unvalidated, so "not worse than physics" can be satisfied by two bad models agreeing.
**Change:** widen the disturbed slice to Kp≥5 (many more days, still operationally meaningful), declare a minimum row count for reportability, and set the gate as "no worse than the **served** model" plus a reliability-slope bound.
**Verify:** count Kp≥5 hours in the window _before_ freezing the gate; if the slice cannot reach reportability, say so in the plan instead of discovering it at gate time.

### 18. Gate numbers left as x/y/z

**Plan (§6):** "Gates (fixed numbers to be set in the review)." A protocol whose thresholds are chosen after the pipeline exists is not preregistered. Set them now from artifacts that exist: December A6 (`weighted_brier 0.043440`, `ECE 0.0096`, `weighted_prevalence 0.0994`) and the V3 climatology reference (`0.077440`). Freeze in `ml/config/nowcast_n5.json` with a hash; the gate script reads only that file.

### 19. Volume and availability assertions with no measurement behind them

**Plan (§1, §5, §9):** "~5.5 GB/day raw → ~500 MB/day slim"; "~330 KB/day" CODE; "est. 300–600M cells"; "~1.4 TB for the window". Only the 5080 benchmark (20M rows / ~11 min) has a source. For scale: the V3 HF feature matrix was 33.93 GB for _eight months at grid4, WSPR only_. A 90-month multi-mode matrix plus `cells/` plus a rolling 2-month `raw/` (~330 GB) on a 4 TB drive is tight, and the plan does not make P0 re-plan on the projection.
Also: Madrigal 8308 carries decodes, not a receiver-listening indicator — §3's "active RX on that band/mode" is inferred purely from decodes. Confirm on the P0 month rather than assuming.
**Change:** P0's exit criterion includes an extrapolated total-bytes budget for slim+cells+features with a stated action if it exceeds 60% of the drive.

---

## What I would add that the plan lacks

1. **A permuted-label negative control.** Fit the full pipeline with the target permuted within (band, hour) and confirm every gate fails. Cheapest leak detector that exists; catches the fold bugs reviews miss.
2. **A time-shift control.** Score with all recency and space-weather features shifted one further hour into the past. Skill should degrade smoothly; a step change means a causality bug in the join.
3. **A per-month rows/prevalence drift table.** FT8 volume grew ~10× over 2019–2026 alongside reporter counts. Without this, §11.9's "year as a feature is forbidden" is unenforceable — the model reconstructs the year from the joint distribution.
4. **A decision-utility number.** Nothing in §6 tells the owner what a user gains. Add: per band-hour, the top-10 target fields by predicted p, and the observed hit rate of that top-10 versus physics' top-10. That is the HamClock tile; it is the claim the product makes.
5. **Post-promotion rollback criteria.** §8 says A6/A7 stay as rollback but never says what triggers it.
6. **A written statement of what N5 cannot answer** — power, antenna, local noise, whether _you specifically_ will be heard — so the UI does not overclaim a network-detection probability as a contact probability.

## What I would cut

- **IRTAM entirely.** CC BY-NC-SA against a billing product, plus implementing a Jones–Gallet coefficient evaluator, plus a parity study, for untested value. GloTEC gives hmF2/NmF2 live and archived from 2025. Drop it from P2; revisit only if the CODE/GloTEC arm shows ionosphere features matter.
- **RBN in the first cut.** Seven years of callsign→grid geolocation, a different detection process, non-comparable SNR, unstated terms. That is a project, not a feature block. Digital-only first.
- **6m as a v1 deliverable.** 6m is Es-driven and nothing in the feature list (TEC, foF2, X-ray) predicts sporadic-E. The March proof got PR-AUC 0.7061 physics-only. Either add foEs — which is exactly the thing GIRO licensing blocks — or defer 6m and say so.
- **`luf_proxy`.** A two-input analytic formula over X-ray flux and zenith angle, both already features. Feed the raw X-ray flux plus 1h/6h maxima and let the tree derive it; that removes a hand-tuned constant from the served contract.
- **`median_snr` / `p90_snr` regression heads in v1**, unless a UI surface consumes them. They double the training and scoring surface for output nothing displays.

---

## What the plan gets right — do not lose these

1. **The diagnosis.** WSPR beacons are the wrong domain, and the persistence-lag pathology (49%/72% of gain on unservable features) is named honestly rather than buried. Moving to PSKReporter-shaped labels is correct.
2. **Servable-only by construction**, with `_missing` companions and a fail-closed feature contract. This is the discipline that caught `ae/al/au/pcn` in `feature_contract.py` and it works.
3. **Rank/quantile statistics** for anything reporter-population-dependent, with a mandatory parity gate before serving — the right instinct even though the gate as specified is too weak (§8 above).
4. **"Missing spots are never negatives by themselves"** and the explicit framing as a conditional network-detection probability, not contact probability. Keep that sentence in every report.
5. **Preregistered ablations** (no-ionosphere, no-recency) as required rather than optional.
6. **Physics engine as floor and as a reference on every table.**
7. **P0-before-scale**, byte/row ledgers, input hashes on every artifact, gap lists — the v4.2 manifest discipline carried forward intact.
8. **Storm days reported separately at all**, even if the gate needs strengthening.
9. **Refusing to rebuild live WSPR ingestion.**
