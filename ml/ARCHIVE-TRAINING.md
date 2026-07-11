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
| WSPR archive (wsprnet.org/drupal/downloads) | 2008 → now, monthly CSV dumps | ~10B spots total, ~50–500M/month | **TX power in every record** → calibrated SNR-per-watt; full solar cycles 24+25; all bands incl. LF/MF |
| RBN archive (reversebeacon.net, daily zips) | 2009 → now | ~100–200M/yr | CW skimmer network — same source as 85% of our own data, so distribution-matched |
| NASA OMNI2 (omniweb.gsfc.nasa.gov) | 1963 → now, hourly | tiny | Kp, F10.7, Bz/By/Bt, solar wind, Dst — joins everything |
| GFZ Hp30/Kp (kp.gfz-potsdam.de) | definitive Kp + 30-min resolution | tiny | sub-hour geomagnetic dynamics |
| NOAA GOES X-ray archive | 2010 → now | small | flare/D-layer absorption history |

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
2. Download WSPR 2014–2025 (one cycle) + OMNI2 first — ~300 GB, one weekend
   of downloads; validate the pipeline end-to-end on one year before
   committing to the full 2008+ pull.
3. Scale to full archive + RBN on the M5 Max; GPU rental only if learning
   curves are still climbing at the 128 GB ceiling.
