# Tier-4: Multi-Year Archive Training (the "big model" plan)

> Written 2026-07-11. Context: v2–v4 experiments on our own 55-day collector
> window proved the approach (AUC 0.954 vs climatology 0.929) but hit a data
> ceiling — ice-cold cells (79% of holdout, the "be first to the opening"
> product feature) sit at PR-AUC ~0.23 because one season of one solar cycle
> can't teach seasonality or cycle dependence. The fix is not features or
> algorithms; it is 15+ years of public archive data.

## Why this works: our data becomes the exam, not the textbook

The single most valuable property of this plan: **train on archives through
2025, hold out our own Feb–Apr 2026 collector data as the final test set.**
Zero leakage is structurally guaranteed (different networks, different years),
and the score answers the exact question that matters: "does a model trained
on history predict *our* product's data feed?" If archive-trained beats
own-data-trained on that test, every conclusion transfers to prod.

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

WSPR is the crown jewel: reporters log TX power, so SNR becomes a physical
quantity (`snr_per_watt`), and 2008–2025 spans two solar minima and two
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
4. **Training** (M5 Max, 128 GB): dataset lands at ~1–3B cells. Strategy:
   - XGBoost `hist` on CPU handles ~500M rows in 128 GB; sample negatives
     harder (keep-rate ~0.1 with weights) or use `QuantileDMatrix`.
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

## Order of operations

1. Reactivate collector with `path_hourly_stats` flywheel (done, this repo)
   so live 2026 data accrues while archive work proceeds.
2. Pull one month of Madrigal amateur-radio HDF5 + one month of wspr.live
   aggregates + OMNI2 first; validate the pipeline end-to-end on that slice
   before committing to the full 2009+ pull. Madrigal covers the FT8/digital
   history nothing else has — prioritize it over raw WSPR dumps.
3. Scale to full archive + RBN on the M5 Max; GPU rental only if learning
   curves are still climbing at the 128 GB ceiling.
