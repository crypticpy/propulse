# Tier-4: Multi-Year Archive Training (the "big model" plan)

> **2026-07-12 result:** the exposure-aware eight-month V3 experiment is
> complete. Read
> [`ARCHIVE-MULTIMONTH-V3-RESULTS.md`](ARCHIVE-MULTIMONTH-V3-RESULTS.md)
> before expanding this older strategy. The measured 20M-to-50M gain is small,
> and P.533, station holdouts, prospective collector transfer, and source-term
> gates remain open.

> **2026-07-11 correction:** the original March cross-evaluation below is
> retained as experiment history but is superseded by
> [`ARCHIVE-PROOF-V2.md`](ARCHIVE-PROOF-V2.md). V2 filters Madrigal to PSK-only,
> uses identical rows and a train-only common pair universe, defines exposure
> from the preceding hour, gives 6m its own model, removes random negative
> sampling, compares engines, and adds common-reference calibration. The full
> validated report is `ml/results/archive_v2/REPORT.html`.

> Written 2026-07-11. Context: v2–v4 experiments on our own 55-day collector
> window proved the approach (AUC 0.954 vs climatology 0.929) but hit a data
> ceiling — ice-cold cells (79% of holdout, the "be first to the opening"
> product feature) sit at PR-AUC ~0.23 because one season of one solar cycle
> can't teach seasonality or cycle dependence. The fix is not features or
> algorithms; it is 15+ years of public archive data.

## Why this works: our data becomes the exam, not the textbook

Temporal separation prevents direct row overlap, but it does not structurally
guarantee zero leakage. Our Feb-Apr 2026 data has already informed features,
targets, and model selection, so it is development validation rather than a
final test. The production experiment must reserve a future collector window
that remains unopened until the pipeline, model, and calibration are frozen.

## Data sources (all free, all public)

| Source | Coverage | Volume | What it adds |
|---|---|---|---|
| **CEDAR Madrigal "Amateur Radio Signal Report"** (cedar.openmadrigal.org, instrument 8308) | **2009-02 → ~1 month behind now**, daily HDF5 | ~150M points/day at peak | **The FT8 history that "doesn't exist" elsewhere**: PSKReporter + RBN + WSPRNet merged, geolocated (TX/RX lat/lon per spot!), SNR, mode, freq, path length. Maintained by MIT Haystack + HamSCI. Verified 2026-07-11. |
| WSPR archive (wsprnet.org dumps or **wspr.live ClickHouse**) | 2008 → now | ~10B spots | **TX power in every record** → calibrated SNR-per-watt; full solar cycles 24+25 |
| RBN archive (reversebeacon.net/raw_data, daily zips) | 2009 → now | ~450K/day | CW skimmer network, distribution-matched to 85% of our own data. **Verified: archive is CW+RTTY ONLY — FT8 exists on live telnet :7001 but is NOT in the raw archive.** |
| NASA OMNI2 (omniweb.gsfc.nasa.gov) | 1963 → now, hourly | tiny | Kp, F10.7, Bz/By/Bt, solar wind, Dst — joins everything |
| GFZ Hp30/Kp (kp.gfz-potsdam.de) | definitive Kp + 30-min resolution | tiny | sub-hour geomagnetic dynamics |
| NOAA GOES X-ray/proton archive (NCEI) | 1974 → now | small | flare/D-layer absorption history |

### Measured-ionosphere upgrades (replace our proxies with instruments)

| Source | What it adds |
|---|---|
| GIRO/DIDBase ionosondes (lgdc.uml.edu) | **Measured foF2/hmF2/MUF(3000)** from ~60+ stations, decades of history — replaces our SFI secant-law MUF proxy with ground truth near the path midpoint |
| GNSS TEC maps (Madrigal GNSS TEC, or CODE IONEX 1998→) | Measured total electron content on a global grid → per-path ionization features, same portal as the spot data |
| IGRF geomagnetic coords (pure computation, `apexpy`/`ppigrf`) | Magnetic latitude of path endpoints/midpoint + auroral-zone-crossing flag — free feature, no download; auroral paths behave categorically differently |
| Land/sea fraction along path (Natural Earth coastlines, computation) | Sea-water multi-hop reflection advantage on low bands |
| NOAA POES hemispheric power (1978→) | Auroral oval intensity history — sharper than Kp for polar paths |

Climate/weather data is NOT useful for the HF F-layer model (ionosphere ≠
troposphere). It becomes relevant later for the VHF/6m sporadic-E + tropo
model (ERA5 reanalysis, open, 1940→) and possibly low-band QRN noise
priors (thunderstorm/CAPE climatology). Skip for now.

WSPR is a high-value source because messages include TX power, but
`SNR - TX power dBm` is a normalized link measurement rather than calibrated
propagation truth: antenna gain, feedline loss, receiver calibration, and local
noise remain unobserved. Station effects must be modeled. The 2008–2025 span covers two solar minima and two
maxima — SFI from 65 to 250. Seasonality (day-of-year), cycle phase, and
storm recovery dynamics all become learnable, which is exactly what the
ice-cold slice needs.

## Pipeline (reuses what we already built)

Everything below is the v4 pipeline with a different loader; the DuckDB
lessons (equi-joins only, TEMP VIEWs, RANGE window frames) carry over as-is.

1. **Ingest** (`archive/ingest_wspr.py`, `archive/ingest_rbn.py`):
   stream monthly/daily dumps → the same slim Parquet schema as
   `convert_spots.py` (hour_utc, band, mode_class, tx/rx_field, snr,
   callsigns) + `tx_power_dbm` for WSPR. Keep 4-char grid too (below).
   ~2–4 TB raw → ~100–200 GB Parquet. Disk, not RAM, is the constraint.
   **Preferred WSPR route (2026-07-11): wspr.live** — the full WSPR history
   is a public ClickHouse DB (`http://db1.wspr.live/?query=...`, table
   `wspr.rx`, partitioned by month). Push the path-hour GROUP BY into their
   server and download pre-aggregated cells month by month instead of raw
   dumps — ~100× less transfer, lands directly in our training schema.
   Fall back to raw dumps only if we need sub-hour recency features.
   Note: PSKReporter (FT8) has NO historical archive — live MQTT only
   (mqtt.pskreporter.info) — which is why the collector flywheel must run;
   digital path data is only collectible forward.
2. **Solar join** (`archive/solar_history.py`): OMNI2 hourly + GFZ Kp + GOES
   → one `solar_hourly.parquet` (1976→2026). Fills the xray/dst/proton gaps
   our own snapshots had.
3. **Cell construction**: same `build_dataset_v4.py` logic with two upgrades:
   - **Adaptive grid resolution**: 4-char squares where a pair has ≥N
     lifetime spots, else fall back to 2-char fields. Dense regions (EU↔NA)
     get ~10× sharper geography.
   - **day_of_year + cycle-phase features** (sin/cos of solar cycle position,
     SFI 81-day smoothed) — impossible on 55 days, trivial on 17 years.
4. **Training** (M5 Max, 128 GB): do not begin with a 1–3B-row materialization.
   Build deterministic learning curves at 5M, 20M, 50M, and 100M rows first.
   Use DuckDB for aggregation, Polars/Arrow at the model boundary, and
   `QuantileDMatrix` when the quantized representation fits. XGBoost external
   memory pages features but not all labels/runtime state, so row capacity must
   be benchmarked rather than inferred from unified memory alone.
   - Rolling-origin evaluation: train ≤2020 → test 2021; train ≤2022 →
     test 2023; etc. Gives honest skill-decay + retrain-cadence numbers.
   - Final: train 2008–2025, test on **our Feb–Apr 2026 cells**.
5. **GPU rental only if step 4 shows data appetite**: rent a single A100/H100
   spot instance (~$1–2/hr) for `device=cuda` XGBoost + TabM/FT-Transformer
   ensemble diversity. Days of compute, not weeks. The neural nets get their
   shot here — learned (tx_field, rx_field) pair embeddings are the one thing
   trees can't represent compactly.

## What to expect

- Headline AUC on our-own-2026 test will *drop* vs 0.954 (no more
  pair-memory shortcuts) — that is honest generalization, not regression.
- The wins to look for: **ice-cold PR-AUC** (0.23 → target 0.35+),
  storm-time skill (more storms in 17 years than in 55 days), and stable
  per-band skill on 10m/12m (cycle-dependent bands our window barely saw).
- Deliverable model stays the same shape: GBT → JSON dump → Edge Function.
  Archive training changes the weights, not the serving architecture.

## Pipeline validation — DONE (2026-07-11, March 2026 slice)

Pulled all 29 available March 2026 days from Madrigal (Mar 15–16 missing on
their side; ~160 GB HDF5 → 3.15B usable digital rows after convert). Scripts:
`madrigal_pull.py` → `madrigal_convert.py` → `madrigal_build_cells.py` →
`madrigal_train_eval.py` (+ `madrigal_validate.py` for the raw cross-check).

**Raw cross-check vs our collector (Mar 1):** our PSKReporter polling captured
~1% of the feed (1.4M vs 136.9M digital spots/day); 99.5% of our cells appear
in Madrigal's; Madrigal sees 4.2× more open cells → our constructed negatives
contain false negatives. Madrigal is PSKReporter+WSPRNet only (no RBN CW).

**Cross-eval** (identical March-only digital cell construction from each
source; train ≤Mar 19, holdout Mar 24–31, weighted metrics):

| train → eval | AUC | PR-AUC | Brier | cold AUC | cold PR-AUC |
|---|---|---|---|---|---|
| madrigal → madrigal | **0.9688** | **0.8671** | 0.0401 | **0.9268** | **0.4181** |
| ours → madrigal | 0.9559 | 0.8326 | 0.0528 | 0.8937 | 0.3258 |
| madrigal → ours | 0.9539 | 0.7991 | 0.0559 | 0.9209 | 0.4147 |
| ours → ours | 0.9620 | 0.8273 | 0.0486 | 0.9379 | 0.4840 |

Reading: each model wins its home holdout (label-distribution match), but the
Madrigal eval column is the truthful exam — its labels miss far fewer real
openings ("eval on ours" scores correct open-predictions as false positives
when our sparse feed missed the spots). On that exam the Madrigal-trained
model wins **+0.013 AUC / +0.035 PR-AUC overall and +0.033 AUC / +0.092
PR-AUC on cold cells** — the "be first to the opening" slice — despite
training on 2 fewer days. Pair universe also grew 1,940 → 10,939 pairs at
the same ≥300-spot gate (5.6× path coverage).

**Historical verdict:** this established feasibility, but it did not isolate
PSK label density because Madrigal PSK and WSPR labels were pooled and the
candidate universes differed. Archive-first training is supported more cleanly
by V2; use the V2 report for quantitative decisions.
The 112 GB raw HDF5 was removed after conversion and V2 validation because it
is publicly redownloadable. Source-tagged slim Parquet remains at
`ml/data/processed/madrigal/` (~14 GB); historical models remain under
`ml/models/`.

## Order of operations

1. Reactivate collector with `path_hourly_stats` flywheel (done, this repo)
   so live 2026 data accrues while archive work proceeds.
2. Pull one month of Madrigal amateur-radio HDF5 + one month of wspr.live
   aggregates + OMNI2 first; validate the pipeline end-to-end on that slice
   before committing to the full 2009+ pull. Madrigal covers the FT8/digital
   history nothing else has — prioritize it over raw WSPR dumps.
3. Scale to full archive + RBN on the M5 Max; GPU rental only if learning
   curves are still climbing at the 128 GB ceiling.
