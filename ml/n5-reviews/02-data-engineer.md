I have what I need. Writing the review.

## N5 Madrigal plan — adversarial review

Numbers below are mine, derived from stated inventory facts plus assumptions I label. Nothing was downloaded or modified.

**Working assumptions** (A1) 2019-01-01→2026-07-15 = **2753 days**. (A2) spot volume grows ~3.5× across the window (FT8 adoption + cycle 25), so the "500 MB/day slim" figure is a _2026_ figure, not a mean; mean ≈ 350 MB/day. (A3) raw scales with slim → mean ≈ 3.5 GB/day, **9.6 TB total pull**, not 15 TB. (A4) single-stream Madrigal throughput 10 MB/s — **unmeasured, this is the plan's largest unknown**. (A5) ~30M kept rows/day in 2026, ~9M in 2019 → **~52 billion spot-rows** in the window. (A6) box RAM is not stated anywhere in `ml/LINUX-GPU-PROFILE.md` or the plan; every memory_limit below assumes 64 GB and must be re-derived if it is 32.

---

## Findings, ranked

### S1-1 — The cell risk set is 10–25× larger than the plan states; the 4 TB budget busts on `cells/`

- **Claim** (§5): "est. 300–600M cells over the window; measure".
- **Derivation**: at hourly grain, active TX fields per (band,hour) ≈ 200 and active RX ≈ 180 on 20m in 2025 → 36k pairs; summed over 10 HF bands with a taper ≈ 144k pairs/hour → 3.5M/day → ~**5–6 billion HF cells** over the window after halving for early years. At the plan's 15-min slot: ×2.4 → **12–14 billion**. With ~100 float32 features that is **2–5 TB** for one run's cells. The 4 TB drive cannot hold one dataset build.
- **Change**: the plan must contain an _analytic risk-set formula_ and a **stratified negative-sampling design with exposure weights** (the machinery already exists — `inclusion_weight` in `opportunity_transform.py`, `neg_keep`/`weight` in `madrigal_build_cells.py`). The artifact is the **sample**, never the full cells table. Sampling must be deterministic hash-based (`hash(tx_field,rx_field,band,hour) % 10000 < k`), not `random()` — `madrigal_build_cells.py` currently uses unseeded `random()`, so no build reproduces.
- **Verify**: P0 emits `risk_set_estimate.json` for 2024-07 with measured per-(band,hour) active-field counts and the extrapolated full-window row count; the P3 config records `neg_keep` per band and the realised sampled row count must match the prediction within 10%.

### S1-2 — "Slot = 15 min … at the collector's grain" is self-contradictory; the collector's grain is 1 hour

- **Claim** (§3.1, §3): 15-min slots, "at the collector's grain so training and serving agree".
- **Risk**: `path_hourly_stats` is `UNIQUE (hour_utc, band, mode_class, tx_field, rx_field)` — hourly. `compute_path_recency_hourly` is hourly. `pathHourly.ts` walks hours. Nothing in production can serve a 15-min statistic. A 15-min model is untrainable-to-serving and costs 2.4× the rows for it.
- **Change**: **hourly cells**. Keep the 15-min slot only _inside_ the hour as an exposure refinement ("active in ≥1 of the 4 slots"), which is where its value actually is.
- **Verify**: the feature contract lists no feature whose period is < 1 h; a contract test asserts every recency/exposure feature has a matching column in `path_recency_hourly`.

### S1-3 — Exposure is computed from the target hour → leakage, and it does not match serving

- **Claim** (§3.1–3.2): "Active TX(field,band,mode,slot) = at least one station … was decoded … **in the slot**".
- **Risk**: `madrigal_build_cells.py` joins `tx_active`/`rx_active` on `ta.hour_utc = c.hour_utc` — same hour. At serve time for hour H you cannot know who was decoded during H. `ml/ARCHIVE-PROOF-V2.md` already fixed this ("at least one transmitter … during the **preceding** hour", "uses no target-hour activity"); the plan regressed to the leaky rule.
- **Change**: exposure from H−1 only, exactly as the V2 proof. Delete the same-hour join.
- **Verify**: an ablation fitting the same config with same-hour vs prior-hour exposure — if the AUC gap is > 0.01 you have measured the leak; the gate config must name `exposure_lag_hours: 1`.

### S1-4 — The recency parity test compares populations, not statistics; it will fail as specified

- **Claim** (§7): rebuild the collector's statistic from Madrigal and compare rank distributions.
- **Risk**: `recency_quantile` is `percent_rank()` over _the heard pairs of that band-hour_. The collector sees ~380k digital spots/day; Madrigal ~37M (≈97×, per `ARCHIVE-PROOF-V2.md`). Madrigal's heard-pair set per band-hour is 20–50× larger, so `exposure` is 20–50× larger and every pair's percent_rank is taken over a different population. The ranks will not agree, and the failure will read as "parity failed → drop recency" when the real cause is a population mismatch you created.
- **Change**: compute training-time recency from a **Madrigal subset restricted to the collector's receiver universe** — Madrigal carries `rx_callsign`, so filter to the rx callsigns the collector actually ingests in the overlap window before computing `exposure`/`percent_rank`. Also: production **includes** `tx_field = rx_field` pairs (`compute_path_recency_hourly` has no such exclusion) — resolve §3.2's open "only if the collector excludes it" as _include them_. And production restricts to `160m…10m`: **6m has no served recency at all**, so the 6m task's feature list must drop every recency feature.
- **Verify**: on 2026-07-01→07-15, per (band,hour): Spearman ρ of `recency_quantile` between Madrigal-restricted and collector-served over pairs present in both; and the share of collector pairs shifting > 0.2 in quantile. Gate: median ρ ≥ 0.80, shift-share ≤ 0.15. Report the same two numbers for the _unrestricted_ Madrigal build so the population effect is measured, not asserted.

### S1-5 — Nothing in the pull/convert chain is crash-safe; every failure mode silently converts to "no activity", which the model reads as a negative

- **Claim** (§9): "checksum ledger (bytes, sha256, day-gap list)". None of it exists.
- **Risks, concretely**:
  - `madrigal_pull.py` writes `md.downloadFile(..., out)` straight to the final path and then guards with `os.path.exists(out) and getsize > 0` → **a truncated file is permanently treated as complete**. No timeout, no retry, no backoff; a `getMadfile.cgi` hang (already observed) blocks the loop forever.
  - `files[0]` after `category == 1` filter is non-deterministic if there are two default files, and one output path per `(startyear,startmonth,startday)` means **two experiments on the same UTC day silently lose one**, and a Madrigal _reprocessed_ file is never re-fetched.
  - `madrigal_convert.py` does `df.to_parquet(out)` to the final path with an `if os.path.exists(out): continue` guard → **same truncation trap**. Its "skip the newest file if mtime < 600 s" heuristic guards only `paths[-1]` by name sort, which is not the in-flight file when the downloader is on a different month.
  - If a day's `smode` encoding changes and every row fails the DIGITAL/CW filter, `pd.concat` of empty frames writes a **valid, empty parquet**, the day is marked done, and downstream reads it as _zero activity_ — i.e. an all-negative day.
  - Days where `getExperiments` returns nothing are indistinguishable from days that failed. Lag features (`path_prev1`, `path_prev24`, `path_prev3h`) `coalesce(...,0)` across a gap, so **the model learns "after an archive gap nothing works"**. March 2026 already has a known 15–16 gap.
- **Change**: (a) download to `*.part` + `os.replace`; (b) prefer direct HTTP file URLs (`/madtoc/`) with `curl -C - --limit-rate --max-time` over `madrigalWeb` — free resume and no server-side conversion — and determine in P0 whether they work; keep format `"hdf5"` either way so the server never transcodes; (c) a `day_status.parquet` with status ∈ `{ok, no_experiment, no_default_file, download_failed, verify_failed, low_volume}` that **every downstream build joins**, with `_missing` flags on any lag whose source hour is not `ok`; (d) refuse to write a converted day whose kept-row count is < 20% of the trailing 7-day median → `low_volume`; (e) record the server-reported file name and size from `getExperimentFiles` in the ledger so an upstream reprocess is detectable.
- **Verify**: kill -9 the pull and the convert mid-file; rerun; assert no `.hdf5`/`.parquet` is left in a "done" state and the ledger shows a retried attempt. Assert `day_status` has exactly 2753 rows.

### S1-6 — There are no gate numbers, so the plan cannot fail

- **Claim** (§6): "≥ x% Brier over physics … no band regression > y% … ECE ≤ z … (fixed numbers to be set in the review)".
- **Change**: x, y, z are filled in and frozen **as a P0 exit condition**, before any archive-scale fit exists to argue with. Reference points already in the repo: A7 20M held-out logloss 0.183, the V2 dense-nowcast Brier 0.0935 vs sparse 0.1173, physics-only PR-AUC 0.9197. Proposal to argue with: Brier ≥ 8% better than P.533 on every held-out month; no band worse than physics by > 2% Brier; ECE ≤ 0.02; storm slice not worse than physics at all.
- **Verify**: `gates.json` is hashed into the run id and the dry-run of the gate scripts (P3 exit) runs against synthetic predictions that are engineered to fail each gate individually.

### S2-7 — P1's wall clock is never estimated; at the stated volume it is the critical path and it is weeks

- **Derivation**: 9.6 TB (A3) at 10 MB/s (A4) = **268 h ≈ 11.2 days continuous**. At 5 MB/s → 22 days; at 20 MB/s → 5.6 days. Add per-file server-side latency and retries: **realistic 2–5 weeks**. LAN (2.5 GbE = 312 MB/s) and disk are irrelevant; CEDAR is the bottleneck.
- **Change**: (a) **pull newest-first** (2026-07 backwards). The pull becomes useful in week 1, the scaling-curve experiment can start before it finishes, and it can be _stopped_ when the cohort curve flattens — which also resolves §12's open question about 2019–2021 without paying for the data first. (b) Cap concurrency at 2 streams; ≤1 metadata request/s; keep the identifying USER/EMAIL/AFFIL. (c) **Email the PI (Frissell) before starting a ~10 TB pull.** A polite heads-up is cheaper than a ban, and this is an academic mirror. (d) Budget ~9–11 hours per month-batch, not "one month at a time" as if it were an afternoon.
- **Verify**: P0's ledger contains per-file MB/s with start/finish timestamps; the P1 issue quotes a budget computed from the P0 median and p10, not from A4.

### S2-8 — The convert step will OOM or crawl at 8-way parallelism, and the field encoder is a Python loop over 60M elements per day

- **Risk**: `CHUNK = 20_000_000` on a compound HDF5 dtype reads all columns: at ~280 B/row that is **5.6 GB resident per chunk per worker**. `to_field` does `np.array([chr(c//256)+chr(c%256) for c in codes])` — a Python-level loop over 20M elements, run twice per chunk (~30–60 s/chunk of pure interpreter). `parts` accumulates every chunk then `pd.concat` → peak ≈ 2× the day's frame, with callsigns as object dtype.
- **Change**: `CHUNK` → 2M and sized from `nproc`/RAM, not hardcoded; replace the field encoder with a 324-entry lookup indexed by `fi*18+fj`; stream chunks through `pyarrow.ParquetWriter` (row groups of 250k, matching `build_bronze.py`) instead of concat; dictionary-encode callsigns (or drop them and keep only `unique_tx`/`unique_rx` counts — callsigns are the dominant cost in the 500 MB/day figure and are only needed for the S1-4 receiver-universe filter and for dedupe).
- **Verify**: convert 2024-07-01 with `/usr/bin/time -v`; assert peak RSS < 4 GB/worker and wall < 90 s/day-file; 8 shards × 2753 days at 60 s = **5.7 h total**, which is the number P1's convert budget should use.

### S2-9 — Schema evolution over 18 years is unmonitored; unknown modes are dropped into a log line

- **Risk**: `DIGITAL` is a hardcoded set of fixed-width byte strings. FT4 appears 2019-04, FST4/FST4W 2020, Q65 and VarAC 2021; `ssrc` values changed too. Anything unmatched increments `dropped_mode` and prints to stdout — not to a manifest, not gated. A padding or case change in `smode` silently zeroes a year.
- **Change**: emit a per-day `smode × ssrc × band` value-count histogram into `convert_ledger.jsonl`; fail the day if the unknown-mode share exceeds 2% or moves > 5 pp from the trailing 7-day value. Keep a single `mode_class` vocabulary shared with `public.mode_class_of()` (`20260906140000_three_way_mode_class.sql` already warns that `build_dataset_v4.py` must be hand-synced — do not create a third copy).
- **Verify**: a `mode_vocabulary.json` covering the full window, generated in P0 from a stratified sample of one day per quarter (30 files ≈ 100 GB, ~3 h at A4) _before_ P1 commits to 2753 days.

### S2-10 — Silent numeric corruption: SNR sentinels, cross-mode SNR scales, day-boundary bleed, duplicates

- `snr`: `c["sn"].astype("float32")` with **no range gate**. `build_bronze.py` filters `snr_db BETWEEN -80 AND 40`; the Madrigal path has no equivalent. A CEDAR fill value (`-32767`, `1e30`, or similar) destroys `median_snr`, `p90_snr` and every `workable_rate_<mode>` threshold in §3.5. → add the range gate + an out-of-range counter; P0 emits the SNR histogram per `ssrc` (I could not confirm the fill value without touching data).
- **SNR reference bandwidth**: RBN CW SNR is 500 Hz-referenced, FT8/WSPR are 2500 Hz-referenced — ~7 dB apart. Pooling them into one `median_snr` regression head is physically wrong. → normalise to 2500 Hz per source, record the offset in config.
- **Day-boundary bleed**: rows are partitioned by _filename_ day but carry their own `ut1_unix`. Late-arriving reports in a merged feed land in the adjacent day's file → duplicate rows once you glob all days. → repartition on the row's own UTC date (hive `year=/month=/day=`) and assert every row falls in its partition.
- **Duplicates**: no dedupe anywhere. PSKReporter can deliver a report twice, and the Madrigal merge unions feeds. → dedupe on `(ut1_unix, tfreq, tx_call, rx_call, ssrc)` per day and record the dup rate; a year-varying dup rate silently drifts every count feature.
- `hour_utc = (ut1_unix // 3600) * 3600` has no epoch sanity gate (`build_bronze.py` has `BETWEEN 1230768000 AND 1893456000`). → add it.
- **Lon/lat edges**: `to_field` handles `lon > 180` but not `lon < -180`; `lat = 90` and `lon = 180` clip into the last field, which is correct but undocumented. Low severity; assert the clip counts are ~0.
- **Timezone**: the madrigal scripts each hand-roll `SET TimeZone='UTC'`; `madrigal_convert.py` writes tz-aware timestamps. Any script that forgets it silently shifts month boundaries by the box's local offset. → route every DuckDB connection through `archive_v3.common.configure_duckdb`.
- **Verify**: one `validate_day.py` that runs all of the above as assertions and writes its counts into the ledger; P0 runs it on 31 days and on 4 stratified days from 2019/2021/2023/2025.

### S2-11 — Ionosphere joins: three classic bugs, all catchable with one physical test

- **IONEX orientation**: CODE GIM latitude runs **+87.5 → −87.5 descending**, longitude −180 → +180, and TEC values are integers scaled by the header `EXPONENT` (usually 10⁻¹ TECU). Assuming ascending latitude flips hemispheres; ignoring the exponent gives a 10× error. The map at 24:00 UT duplicates the next day's 00:00.
- **Interpolation frame**: interpolating GIM TEC linearly in UT between hourly maps is the documented wrong way — interpolate in the **sun-fixed frame** (rotate longitude by the elapsed UT), otherwise you get errors of order 1–2 TECU near the terminator, which is precisely where `sun_elev_mid` and `dark_frac` carry the model's signal.
- **GeoJSON**: coordinates are `[lon, lat]`, and NOAA products vary between 0…360 and −180…180. The lat/lon swap is the single most common bug in this class.
- **Product mismatch train vs serve**: §4 trains on CODE **final** (weeks of latency) and serves CODE **rapid** or GloTEC. That is an unmeasured distribution shift on a headline new feature block.
- **Change**: one `iono_grid.py` with an explicit `(lat_order, lon_range, scale_exponent)` declared per product; sun-fixed temporal interpolation; a `tec_product` categorical feature plus `tec_age_min` and `_missing`; and a measured final-vs-rapid delta over a 30-day overlap that becomes a gate.
- **Verify**: the **subsolar test** — on 3 quiet days, assert the grid's TEC maximum lies within 15° of the subsolar point and the minimum in the winter polar night. This catches lat/lon swap, sign flip, longitude convention and the exponent in one assertion. Run it for CODE, GloTEC and IRTAM (if kept) identically.
- **Sizing** (favourable): CODE 2753 × 25 epochs × 5183 points ≈ 357M rows → **~1.5 GB zstd**. GloTEC as daily NetCDF (14 MB/day) → **8.4 GB for 2025-07→2026-07**; the 2.4 MB/10-min GeoJSON is 345 MB/day (**207 GB**) for the same information — take the NetCDF, never keep the GeoJSON.

### S2-12 — Reproducibility: paths are not config-derived, artifacts are hashed by bytes, and the M5 cannot verify a 1 TB dataset

- The madrigal scripts hardcode relative paths (`ml/data/raw/madrigal`) with no `PROPULSE_ML_DATA_ROOT` support — they cannot write to `/srv/madrigal` at all. `archive_v3/common.py` already supports it; `run_paths.py` already models run-scoped paths. → port the madrigal scripts onto `common.py` and add an `n5_paths.py` mirroring `run_paths.py`.
- Output paths are derived from `run_id`, not from a hash of the config subset that affects the artifact. Change a threshold, rerun, and you **silently overwrite a same-named artifact**. → `run=<sha256(canonical config subset)[:12]>` in the path.
- Byte-level `sha256` of parquet is not stable across reruns: DuckDB's parallel scan does not fix row order (`preserve_insertion_order=false` is set everywhere). → hash a **content digest**: `bit_xor(hash(row))` + row count + per-column null counts + min/max/mean, which is order-independent.
- **M5 verification of a box-built dataset**: today the mechanism is size + sha256 in the results JSON (per `LINUX-GPU-PROFILE.md` §5), which works for models but cannot work for ~1 TB that never leaves the box. → the box emits a manifest with (i) the content digest per partition, (ii) a fixed-seed 10k-row sample written as a small parquet that _does_ travel to the M5, (iii) a **recompute proof**: one randomly chosen day re-derived from raw whose digest must match the ledger. The M5 verifies the manifest chain and runs the gate scripts against the travelling sample. Also note `opportunity_transform.py` hard-fails unless DuckDB is exactly 1.5.x — the box venv must pin `duckdb==1.5.4`.
- `field_centroids.parquet` is computed from all data in `madrigal_build_cells.py` → **leaks the holdout** and drifts over 7.5 years. → compute from the training window only, freeze, hash.

### S3-13 — The cell builder as written cannot scale past one month

- `.df()` pulls the whole cells table into pandas for geometry; `df["tx_field"].map(lambda f: centers[f][0])` is a Python call per row. At 600M rows that is hours; at 5B it is impossible. `memory_limit='24GB'`, `threads=10` are M3-era constants.
- **Change**: precompute two tiny reference tables and join them in SQL — `field_geometry` is 324² = **104,976 rows** (dist, bearing sin/cos, mid lat/lon) and `field_solar` is 324 × 366 × 24 = **2.85M rows** (sun elevation). Every per-row numpy block in `madrigal_build_cells.py` collapses to two joins, the build becomes pure SQL, per-month partitioned, and restartable. Set `temp_directory` on the **1.6 TB drive**, not the 4 TB one, so spill I/O does not contend with slim reads. Keep DuckDB over polars: multi-key joins + range windows out-of-core is where polars' streaming engine is still weakest, and `configure_duckdb` already exists.
- **Verify**: build 2024-07 twice from a cold cache; digests identical; wall clock recorded. Budget from measurement, but expect 10–30 min/month → **15–45 h for 90 months**.

### S3-14 — The training ladder's top rung does not fit the GPU

- `LINUX-GPU-PROFILE.md` measures 50M × 83 features ≈ 4.2 GiB ellpack at `max_bin=255`. Scaling: 100M × 100 features ≈ **10 GB**, at the edge of 16 GB with gradients and histograms. 300–600M requires `ExtMemQuantileDMatrix` on GPU (2–3× slower) and NVMe bandwidth.
- **Cost**: 20M ≈ 11 min/fold (measured). 100M ≈ 55 min/fold. ~15 candidates × 4 folds = 60 fits → **55 h of GPU per rung**, plus ablations (no-ionosphere, no-recency) which the plan correctly requires and which double it.
- **Change**: **cut the "full" rung.** Fit 20M / 50M / 100M, plot the gate metric vs rows, and stop at the knee. If 50M→100M gains less than the gate's own noise band, 300M is a week of GPU for nothing.

### S3-15 — Sealed-holdout timing is worse than it needs to be

- §2 seals 2026-05-01→2026-07-15 (2.5 months, one day after the contaminated Feb–Apr window) — but Madrigal lags 7.5 weeks and this programme is 5–8 weeks of work. Freeze the _development_ pull at 2026-04-30 and let 2026-05 → 2026-09 accumulate naturally: you get a genuinely prospective gate that grows while you work, on data that did not exist when the protocol was frozen. Strictly stronger evidence for the same effort.

### S3-16 — Serving-latency simulation needs a number, and the number is derivable today

- §4 says "hour H becomes available at H+1h+Δ; Δ from collector logs". Concretely: `pathHourly.ts` uses `settledPreviousHour(now, settleMinutes=20)`, so hour H is not computed before **H+1:20**, then `pathRecency.ts` runs on its own tick chained to the `path_hourly` watermark. So at an issue time early in hour H+1, `prev1` is **unavailable**, and later in the hour it is available — availability is a function of minute-within-hour, not a constant.
- **Change**: model it as an availability _distribution_, measured from the `aggregation_watermark` table (minute-of-hour at which each hour's watermark advanced, over 30 days), and simulate that exact distribution offline. The served RPC already returns availability flags, so train/serve agree only if the offline simulation reproduces the distribution.
- **Verify**: histogram of watermark-advance minute-of-hour committed as a P2 artifact; the offline simulator's realised availability rate matches it within 2 pp per hour bucket.

---

## What I would cut

| Cut                                          | Why                                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IRTAM / GIRO entirely**                    | CC BY-NC-SA against a billing product, _plus_ you must implement a Jones–Gallet coefficient evaluator and validate it against DIDBase. GloTEC gives NmF2→foF2 directly. Two blockers, one substitute. |
| **RBN raw archive**                          | A whole second pipeline (daily CSV, callsign→grid geolocation) for a mode that is 6,166 spots/day vs 379,518 digital in production. Revisit after N5 ships.                                           |
| **`phone` mode**                             | No source has it. "Served from digital + margin" is a UI decision, not a modelling one — drop it from the data plan.                                                                                  |
| **The 300–600M training rung**               | S3-14. Stop at the measured knee.                                                                                                                                                                     |
| **15-min slots**                             | S1-2. Hourly, with 15-min only as intra-hour exposure.                                                                                                                                                |
| **grid4 grain for recency**                  | 324² = 105k field pairs vs ~10⁹ grid4 pairs. Keep §3's one-quarter measurement as a _read-only_ experiment; do not let it into the recency design.                                                    |
| **Pulling 2019–2020 before it is justified** | Newest-first ordering (S2-7) makes §12's "does 2019–2021 help?" a decision you make _after_ seeing the scaling curve, not a 3-week download you commit to first.                                      |

---

## Proposed layout — `/srv/madrigal` (the 4 TB drive, single-purpose, ext4)

```
/srv/madrigal/
├── raw/year=YYYY/month=MM/rsdYYYY-MM-DD.hdf5   ROLLING, delete after verified convert   ≤ 350 GB peak (2 mo)
├── ledger/
│   ├── pull_ledger.jsonl        one line per (day,attempt): status, server file+size, bytes, sha256, MB/s, timestamps
│   ├── convert_ledger.jsonl     rows in/out, drop reasons, smode×ssrc histogram, snr histogram, ts range, dup rate
│   └── day_status.parquet       2753 rows, joined by EVERY downstream build              < 1 MB
├── slim/year=YYYY/month=MM/day=DD/part.parquet  KEEP — 10 TB of re-pull to regenerate    0.9–1.1 TB
├── ref/                                          KEEP — tiny, frozen, hashed              ~35 MB
│   ├── field_geometry.parquet   324² = 104,976 rows
│   ├── field_solar.parquet      324 × 366 × 24 = 2.85M rows
│   └── field_centroids.parquet  training-window only
├── iono/                                         KEEP                                     ~10 GB
│   ├── code/year=YYYY/gim.parquet      357M rows                                          ~1.5 GB
│   ├── glotec/year=YYYY/glotec.parquet 2025-07→2026-07, from NetCDF not GeoJSON           ~0.7 GB
│   ├── goes/xray_1m.parquet            3.9M rows                                          ~30 MB
│   └── omni/omni2_hourly.parquet       66k rows                                           ~2 MB
├── cells/run=<cfg-hash>/task={hf,6m}/year=/month=/part.parquet  REGENERABLE, delete after cohorts  250–400 GB
├── cohorts/run=<cfg-hash>/{20m,50m,100m}/        KEEP for the reported run                80–150 GB
├── models/ + results/                            KEEP, travels to the M5                  < 5 GB
└── (DuckDB temp_directory → the OTHER 1.6 TB drive, reserve 600 GB)
```

**Budget**: 350 + 1,050 + 10 + 400 + 150 ≈ **1.96 TB** of ~3.45 TiB usable (4 TB − ext4 5% reserve). ~1.5 TB headroom — comfortable **only** because `cells/` is sampled (S1-1). Build the full risk set and you need 2–5 TB for `cells/` alone and the drive dies mid-run.

**Keep vs regenerate**: `raw` regenerate (never keep — 9.6 TB). `slim` **keep** (the only expensive-to-reacquire layer). `ref`, `iono`, `ledger` keep (tiny, and `ledger` is the provenance record). `cells` regenerate (hours). `cohorts` keep for the reported run only. Add a **disk guard** that refuses to start any step whose estimated output exceeds free space × 0.8 — the collector already has `dbSizeGuard.ts` as the pattern.

---

## Tooling that must exist before P1 starts

1. `ml/src/madrigal/pull.py` — resume (`.part` + `os.replace`), timeout, exponential backoff + jitter, ≤2 streams, rate limit, per-file ledger line, server-file identity recorded.
2. `ml/src/madrigal/verify_day.py` — h5 open, row count, `ut1_unix` range vs partition date, `smode`×`ssrc` histogram, SNR histogram, geo-drop counts, low-volume floor.
3. `ml/src/madrigal/day_status.py` + a `require_days()` helper every build calls; `_missing` propagation for lags spanning non-`ok` hours.
4. `ml/src/madrigal/n5_paths.py` — run-scoped, config-hash-derived paths, mirroring `archive_v4_2/run_paths.py`; madrigal scripts ported onto `archive_v3/common.py` path resolution + `configure_duckdb`.
5. `ml/src/madrigal/digest.py` — order-independent content digest (`bit_xor(hash(row))` + counts + per-column stats), used everywhere instead of file `sha256`.
6. `ml/src/madrigal/iono_grid.py` — per-product `(lat_order, lon_range, scale_exponent)`, sun-fixed interpolation, and the subsolar self-test.
7. `ml/src/madrigal/risk_set.py` — analytic risk-set estimator + deterministic hash-based negative sampler with exposure weights.
8. `disk_guard` preflight.
9. `ml/requirements-madrigal.txt` pinned: `madrigalWeb`, `h5py`, `netCDF4`, on top of `duckdb==1.5.4` (hard-required by `opportunity_transform.py`).

---

## P0 exit checklist — exact artifacts before P1 is allowed to start

Scope: 2024-07 end to end, plus 4 stratified probe days (2019-06-15, 2021-06-15, 2023-06-15, 2025-06-15) and one day per quarter for the mode vocabulary.

| #   | Artifact                                                                               | Passing condition                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ledger/pull_ledger.jsonl` — 31 days + 4 probes + 30 vocabulary days                   | Every line has status, server file name + size, bytes, sha256, **MB/s**; ≥1 deliberate kill -9 retried cleanly; median and p10 MB/s recorded                                                      |
| 2   | `throughput_budget.json`                                                               | P1 wall clock derived from #1's p10, with the newest-first day order enumerated                                                                                                                   |
| 3   | `madrigal_endpoint_decision.json`                                                      | Whether direct `/madtoc/` HTTP URLs work (→ `curl -C -`) or `getMadfile.cgi` is required; the observed hang reproduced or ruled out from the box (not a sandbox)                                  |
| 4   | `ledger/convert_ledger.jsonl`                                                          | Per-day rows in/out, drop reasons, `smode`×`ssrc`×band histogram, SNR histogram, dup rate, ts range; peak RSS < 4 GB/worker; < 90 s/day-file                                                      |
| 5   | `mode_vocabulary.json` (30 quarterly days, 2019→2026)                                  | Every `smode`/`ssrc` value over the window enumerated and classified; unknown share < 2% on every probe day                                                                                       |
| 6   | `snr_semantics.json`                                                                   | Fill/sentinel value identified per `ssrc`; reference-bandwidth offsets fixed in config                                                                                                            |
| 7   | `schema_frozen.json`                                                                   | Slim parquet column names/types/encodings + partitioning (`year=/month=/day=` on the **row's own** date), row-group 250k, zstd; digest recipe fixed                                               |
| 8   | `ledger/day_status.parquet`                                                            | 31+4 rows, all statuses exercised at least once in a fault-injection test                                                                                                                         |
| 9   | `risk_set_estimate.json`                                                               | Measured active-field counts per (band,hour) for 2024-07; extrapolated full-window cell count; chosen `neg_keep` per band; predicted `cells/` and `cohorts/` bytes                                |
| 10  | `ref/field_geometry.parquet`, `ref/field_solar.parquet`, `ref/field_centroids.parquet` | Built, hashed; centroids from the training window only; cell build for 2024-07 contains **zero** per-row Python                                                                                   |
| 11  | `iono/` for 2024-07 (CODE + GOES; GloTEC N/A pre-2025)                                 | Subsolar test passes for every product; `tec_age_min`/`_missing` semantics unit-tested; CODE final-vs-rapid delta measured on a 30-day overlap                                                    |
| 12  | `recency_parity_2024_07.json`                                                          | Madrigal-restricted-to-collector-receivers recency rebuilt; Spearman ρ and quantile-shift share reported **both** restricted and unrestricted (the gate itself runs in P2 on the 2026-07 overlap) |
| 13  | `gates.json`                                                                           | x, y, z filled in as numbers, hashed into the run id; gate scripts dry-run against synthetic predictions engineered to fail each gate individually                                                |
| 14  | `run_manifest_2024_07.json` + travelling 10k-row sample                                | Content digests for every partition; one randomly chosen day re-derived from raw with a matching digest; the M5 verifies the chain and runs the gate scripts against the sample                   |
| 15  | One fit on 2024-07 cells                                                               | Completes on the 5080; records `training_profile`, VRAM, wall clock; beats P.533 on the month (directionally — this is a smoke test, not a gate)                                                  |
| 16  | `box_inventory.json`                                                                   | RAM, cores, free space on both drives, driver version, `xgboost.build_info()['USE_CUDA']`, `duckdb.__version__ == 1.5.4` — the numbers every memory limit in P1–P4 is derived from                |

If #9 shows the sampled `cells/` exceeding ~600 GB, or #1's p10 implies a P1 pull beyond 4 weeks, stop and re-scope the window (newest-first makes that a cheap decision) rather than starting P1.
