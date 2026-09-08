# N5 plan v1 — orchestrator decisions after the four persona reviews

Written 2026-09-06 by the orchestrating session (propulse-1f) after reading
01-ml-engineer, 02-data-engineer, 03-hf-propagation, 04-space-weather.
Where reviewers disagreed, the call and the reason are recorded here. Plan v1
must implement every item below; anything a reviewer proposed that is not
listed here is either accepted as written (no conflict) or explicitly cut.

## A. Scope of v1

1. **Tasks.** v1 = HF digital only (160m–10m, FT8/FT4/WSPR as a `mode_class`
   categorical inside one model, per-mode evaluation slices). CW is v1.1 on the
   same pipeline (Madrigal carries RBN via `ssrc`; slim keeps `ssrc`, `smode`,
   `tfreq`, `snr_ref_bw`). 6m is v2 (needs Es/TEP features; no served recency).
   Phone is a documented transform of the SNR head validated against the
   collector's `phone` `path_hourly_stats` cells, not a model.
2. **Two model lines, both deliverables.**
   - **N5-base**: full Madrigal window, no ionosphere-map block. This is the
     guaranteed served candidate.
   - **N5-iono**: GloTEC era only (2025-01→), N5-base features + the GloTEC
     control-point block. Served instead of N5-base only if it beats it on the
     same gates. This resolves the archive-start skew (SW S3 option a), makes
     the no-ionosphere ablation a real fallback, and survives GloTEC being
     withdrawn (it is labelled experimental).
   - GloTEC daily NetCDF archiving (~14 MB/day) starts on the box in P0
     regardless of whether the NCEI archive path resolves. This is archival of
     a NOAA product, not live spot ingestion.
3. **Cuts (final):** IRTAM/GIRO/DIDBase (NC-SA licence + measured ~48 h access
   embargo; two independent blockers); all three CODE products from the
   feature vector (offline validation reference only; no live twin); RBN raw
   archive as a separate pipeline; the 300–600M "full" training rung;
   15-minute cells; grid4 as the recency grain; `luf_proxy`; `is_weekend`;
   raw `bearing_sin/cos`; `path_success_prev2/prev3`; absolute `tec_*`
   features; solar-wind MHD channels (`by`, `bt`, `plasma_beta`,
   `alfven_mach`, `magnetosonic_mach`); `sunspot_number` (served series is
   monthly, trained is daily: not the same variable); SNR regression as a gated
   head (kept as an ungated secondary head, see D5).

## B. Data layer (settle before any raw is deleted)

4. **Slim schema is the irreversible decision.** Freeze it at P0 exit, before
   P1. Columns: `ut1_unix` (s), `tx_lat/tx_lon/rx_lat/rx_lon` rounded to 0.05°,
   `smode` verbatim, `tfreq_khz`, `ssrc`, `snr_2500` (normalised to 2500 Hz
   with a per-`ssrc` offset recorded in config), `snr_raw`, `tx_callsign`,
   `rx_callsign` (dictionary-encoded; needed for receiver-universe filter,
   dedupe, reporter-share diagnostic, portable-suffix filter), derived `band`,
   `mode_class`, `tx_field`, `rx_field`. Partition `year=/month=/day=` by the
   row's own UTC date; row-group 250k; zstd. Budget ~0.9 GB/day at 2026
   volumes. One `mode_class` vocabulary shared with `public.mode_class_of()`.
5. **Pull order newest-first** (2026-04-30 backwards). Development pull frozen
   at 2026-04-30; 2026-05→ accumulates as the prospective window (DE S3-15).
   Stop the backfill when the scaling curve flattens (answers "does 2019–2021
   help" without paying for it first).
6. **Crash safety and ledgers** exactly as DE S1-5 and the DE tooling list:
   `.part` + `os.replace`, per-file ledger with MB/s, `day_status.parquet`
   joined by every build, `_missing` propagation across non-`ok` hours,
   low-volume floor, mode-vocabulary and SNR-sentinel histograms per day,
   dedupe on `(ut1_unix, tfreq, tx_call, rx_call, ssrc)`, epoch and range
   gates, `configure_duckdb` everywhere, config-hash run paths, order-
   independent content digests, disk guard at 80% of free space, DuckDB temp
   on the 1.6 TB drive. `duckdb==1.5.4` pinned.
7. **Owner actions before the bulk pull** (outward-facing, not for agents):
   a courtesy email to the Madrigal 8308 PI before a ~10 TB pull, and written
   confirmation of PSKReporter/WSPRNet/RBN contributor terms for a billed
   product. P0 (one month) does not need either.

## C. Cell, label, opportunity

8. **Cell = (hour, band, mode_class, tx_field, rx_field).** Hourly, matching
   `path_hourly_stats`. The 15-minute slot survives only as an intra-hour
   exposure refinement ("active in ≥1 of 4 slots").
9. **Risk set (exposure) from H−1 only** (the V2 proof rule; DE S1-3):
   tx_field active on (band, mode) in H−1 AND rx_field active on (band,
   mode) in H−1. Same band and mode — per-submode exposure (HF S14). Same-band
   RX presence in H−1 is a feature, not a filter beyond this rule.
   `tx_field == rx_field` cells are excluded from the HF task (NVIS/ground
   wave/Es regime; HF S3) and kept for the 6m/short-path task later.
10. **Label = plain conditional binary**: ≥1 decode of any TX station in
    tx_field by any RX station in rx_field on (band, mode) during H. No
    weighted-Bernoulli trial counts (ML eng 4). The receiver-count confound
    (HF S1) is handled by (a) H−1 population features `tx_station_count_prev1`,
    `rx_station_count_prev1`, `rx_station_count_prev24` and `congestion_rank`,
    and (b) a mandatory P0 diagnostic: regress success on log(rx count)
    within (band, hour, distance bucket) at fixed MUF margin; the slope is
    reported in every gate report, and the product copy is restated as "the
    probability that the receiving field's network hears the transmitting
    field", not a personal probability.
11. **Sampling is the artifact, never the full cells table** (DE S1-1).
    Deterministic hash-based negative sampling with exposure weights; the two
    weight systems (negative-sampling weight and any cell weight) are
    composed multiplicatively and unit-tested: the weighted mean of the target
    on a held-out sample must equal the unweighted population mean.
12. **Reference tables, not per-row Python**: `field_geometry` (105k rows,
    including P.533 control points and long-path control points per pair),
    `field_centroids` (training window only, frozen, hashed), solar elevation
    computed in SQL. Field grain stays the serving key. Within-cell distance
    distribution (`dist_p10/p50/p90`, `frac_inside_skip` per band) from the
    retained lat/lon is a feature. The grid4 sub-key for adjacent fields is a
    P0 measurement (variance decomposition on 40m and 10m short paths), not a
    v1 design commitment.

## D. Features

13. **Control-point ionosphere and darkness block replaces every `*_mid`
    scalar** (HF S4, SW S4): `fof2_cp_min/max`, `m3000f2_cp`, `muf_path` = min
    over P.533 control points, `muf_margin_db`, absorption integral over
    reflection points, `n_reflection_points_sunlit/dark`, `path_dark_frac` at
    ≥1 sample per hop (min 9), `terminator_crossings`,
    `angle_to_terminator`, `angle_to_magnetic_meridian`, E-layer screening
    from `calculateF0E` at the 1000 km control points, land/sea fraction along
    the great circle. All of it for BOTH the short-path and long-path route,
    plus `route_muf_margin_best` and `lp_darkness_advantage` (HF S9).
14. **Geomagnetic block** (HF S5): `mag_lat_tx/rx`, `mag_lat_cp_max`,
    `oval_margin` = mag_lat_cp_max − (67 − 2·Kp), `crosses_polar_cap`,
    `dip_lat_cp`, `crosses_geomagnetic_equator`, `auroral_cross_fraction`
    (Feldstein/Starkov oval, deterministic from Kp so parity is exact),
    `proton_flux_10mev` and its 24 h max, `pca_polar_fraction`.
15. **D-region**: `haf_max_path` in D-RAP form (flux^0.75 · cos^0.75 χ) at the
    sunlit control points from GOES XRS; XRS normalised to one calibration
    convention across the GOES-15→16+ transition; `max(flux over last 15 min)`
    on both sides; validated against SWPC `drap_global_frequencies.txt` as a
    reference only.
16. **Season**: `local_season = cos(2π(doy−172)/365)·sign(lat)` at TX, RX and
    control points; `season_asymmetry`.
17. **GloTEC block (N5-iono only)**: foF2 from NmF2, hmF2, TEC anomaly and
    along-path TEC gradient at the control points, expressed as ratios/deltas
    against the engine's CCIR climatology; `quality_flag` categorical, never a
    filter; `tec_age_min`; epoch selection `epoch ≤ T − 30 min` (measured
    19–27 min publication latency). Grid is 2.5°×5°, not 5°.
18. **Space-weather drivers**: per-channel `available_at` (RTSW ~5 min, Dst
    ~1 h, Hp30/Hp60 ~1 h, F10.7 = 20:00 UT + delay) and a backward as-of join
    with an `age` feature, mirroring the serving rule; F10.7 leak fixed; Kp
    quantised to 3 h bins at serve before lookbacks; Hp30 added; Dst training
    series = the realtime series if an archive of it exists (P0 verifies),
    otherwise Dst drops in favour of Hp30/Hp60; Kp/Hp lookbacks gated by a KS
    test between served and trained distributions.
19. **Recency**: `path_success_prev1` and `prev24` quantiles only, with
    availability flags drawn from the measured `aggregation_watermark`
    minute-of-hour distribution and simulated offline; training recency
    computed from Madrigal restricted to the collector's receiver universe
    (2025–26) and a matched-size receiver subsample for earlier years, with
    the unrestricted build reported alongside; production includes
    `tx_field = rx_field` pairs in its statistic; 6m has no served recency.
    Parity gate on the 2026-07 overlap: median Spearman ρ ≥ 0.80 per
    (band, hour), share of pairs shifting > 0.2 quantile ≤ 0.15. No-recency
    ablation is a shipping gate: it must retain ≥ 80% of the Brier skill over
    calibrated physics, or the model is persistence and does not ship.
20. **Physics prior**: separate arm. The baseline in every table is the
    physics score isotonically calibrated per band on the calibration month,
    not raw. Engine invoked from the build via a pinned node subprocess with
    golden vectors and a tolerance; engine hash in the feature contract.
    No-physics-prior ablation reported.
21. **Activity confounders**: `congestion_rank`, contest calendar from
    `src/lib/data/` (not the hardcoded 4-date list), portable/maritime
    suffix filter on the pair universe, duty-cycle-aware exposure per mode.

## E. Protocol, holdouts, gates

22. **Training months are an enumerated list**, never a range; v4.2
    disjointness assertions ported. Folds: 2024-02 / 2024-05 / 2024-07 /
    2024-08; eval 2024-10 / 2024-11 (unchanged).
23. **Gates**: (a) archive gate = the four still-sealed `LOCKED_MONTHS`
    2025-01/04/07/10 (four seasons, never read by anyone); (b) December 2024
    demoted to a contaminated reference (opened 2026-07-15); (c) prospective =
    Madrigal 2026-05-01→ as released after the development freeze, PLUS a live
    shadow of ≥ 30 days including at least one Kp ≥ 5 day; (d) storm slices
    derived programmatically from Dst (main-phase days min Dst ≤ −100 nT;
    PCA days ≥10 MeV > 10 pfu scored only on polar-crossing paths; flare slice
    separate), decomposed by storm phase × magnetic-latitude band × band
    group, each storm day paired with a matched quiet day. Storm slice must
    reproduce the 2024-05-10 06–12 UT positive phase on 15/10m before any model
    is fit (slice-design check).
24. **Preregistered numbers, frozen at P0 exit and hashed into the run id**:
    Brier skill over calibrated physics ≥ 8% on every held-out month; no band
    worse than calibrated physics by > 2% Brier; decision-region Brier
    (p ≥ 0.05) reported and gated at ≥ physics; signed bias within ±5% of
    prevalence in every band × p-bin; ECE ≤ 0.02 with stratified calibration
    and shrinkage; top-1 band hit rate and pairwise band-ordering accuracy ≥
    calibrated physics; storm slices not worse than physics; permuted-label
    control at climatology; time-shift control degrades monotonically;
    no-recency ablation ≥ 80% skill retained; per-feature missingness parity
    between training and shadow within 2 pp; A6 served model compared on the
    shadow window. Gate scripts dry-run against synthetic predictions
    engineered to fail each gate individually.
25. **Required slices**: per band, per mode, distance bucket, low-reporter RX
    fields by exposure decile, rare DX (entity count), marginal openings
    (|muf_margin_db| < 3), contest weekends, magnetic-latitude band, storm
    phase, per-month drift table, top-1 reporter share diagnostic.
26. **Scale ladder**: 20M → 50M → 100M, stop at the measured knee (carry the
    V3 stop rule). Budget from measured fold time (~11 min at 20M cuda).

## F. Serving and shadow

27. **Contract `madrigal-features-v1`**: every feature computable from live
    sources at issue time; one new live dependency (GloTEC) for N5-iono, zero
    for N5-base; GOES XRS moved from snapshot to a direct fetcher; contract
    lists the source, cadence, latency and licence per feature.
28. **Shadow mode needs two small pieces of collector/service work** (ML eng
    12): a per-cell prediction log table and a tiny collector exposure
    aggregate (active TX/RX station counts per band-hour per field). Both are
    for scoring, not training. Dry run must reproduce the served model's
    Brier from the log before the window counts.
29. **Rollback criteria and a "what N5 cannot answer" statement** ship with
    the model card: no personal-station probability, no phone ground truth
    beyond the collector's phone cells, no 6m, no opening-window forecast in
    v1 (GloTEC is nowcast-only; forecast needs a driver-forecast path, v2).

## G. Infrastructure

30. Drive layout per DE proposal (`/srv/madrigal`, single purpose, ext4):
    raw rolling ≤ 350 GB, slim ~1.5 TB kept, ref/iono/ledger kept,
    cells sampled ≤ 600 GB regenerable, cohorts kept for the reported run,
    DuckDB temp on the other drive. Budget ≈ 2.5 TB of 3.45 TiB; disk guard
    at 80%. The wipe is destructive: the box agent confirms the device with
    the owner on its side; nothing is formatted on a message from this session.
31. P0 scope = 2024-07 end to end + 4 stratified probe days + 30 quarterly
    vocabulary days, with the DE's 16-item exit checklist plus: the HF S1
    receiver-count slope, the grid4 variance decomposition, the S2 GloTEC
    prediction-agreement measurement (if the NCEI archive resolves), the Dst
    realtime-archive check, the GloTEC NCEI path check, and the storm-slice
    positive-phase check. If sampled cells exceed ~600 GB or the p10
    throughput implies > 4 weeks of pull, stop and re-scope before P1.
32. Phases: P0 measure (box) → P1 pull+convert newest-first (box, weeks,
    background) → P2 features + reference tables + iono + parity (box) →
    P3 20M/50M/100M fits + ablations (box GPU) → P4 gates (M5 verifies the
    manifest chain and runs gates on the travelling sample + results) →
    P5 serving contract + fetchers + shadow plumbing (Railway/collector PRs)
    → P6 shadow ≥ 30 days → promotion. A7's 20M numbers are the WSPR baseline
    on record; #298/#297 close as superseded when its fold table lands.
