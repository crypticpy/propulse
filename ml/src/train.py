"""Train the path_open LightGBM classifier and evaluate vs baselines.

Split: train < 2026-03-16, early-stop val 2026-03-16..23, holdout >= 2026-03-23.
Holdout is never downsampled, so its metrics reflect the true base rate.

Baselines:
  - climatology: weighted train open-rate per (pair, band, hour-of-day),
    falling back to (band, hod), then global
  - persistence: same cell's label 24h earlier (falls back to climatology);
    evaluated on holdout hours with a complete lookback
"""

import time

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

CELLS = "ml/data/processed/train_cells.parquet"
MODEL_OUT = "ml/models/path_open_v0.txt"

VAL_START = pd.Timestamp("2026-03-16", tz="UTC")
HOLDOUT_START = pd.Timestamp("2026-03-23", tz="UTC")

NUM_FEATS = [
    "hod_sin", "hod_cos", "dist_km", "bearing_sin", "bearing_cos",
    "sun_elev_tx", "sun_elev_rx", "sun_elev_mid",
    "kp", "sfi", "bz", "by", "bt", "wind_speed", "log_xray", "dst", "log_proton",
]
CAT_FEATS = ["band", "tx_field", "rx_field"]

t0 = time.time()
df = pd.read_parquet(CELLS)
print(f"[{time.time()-t0:.0f}s] loaded {df.shape}")

df["hour_utc"] = pd.to_datetime(df["hour_utc"], utc=True)
df["log_xray"] = np.log10(df["xray"].clip(lower=1e-9))
df["log_proton"] = np.log10(df["proton"].clip(lower=1e-3))
for c in CAT_FEATS:
    df[c] = df[c].astype("category")

train = df[df.hour_utc < VAL_START]
val = df[(df.hour_utc >= VAL_START) & (df.hour_utc < HOLDOUT_START)]
hold = df[df.hour_utc >= HOLDOUT_START]
print(f"train {len(train):,} | val {len(val):,} | holdout {len(hold):,} "
      f"(holdout open rate {hold['open'].mean():.3f})")

FEATS = NUM_FEATS + CAT_FEATS
dtrain = lgb.Dataset(train[FEATS], train["open"], weight=train["weight"])
dval = lgb.Dataset(val[FEATS], val["open"], weight=val["weight"], reference=dtrain)

params = {
    "objective": "binary",
    "metric": ["auc", "binary_logloss"],
    "learning_rate": 0.05,
    "num_leaves": 127,
    "min_data_in_leaf": 200,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "verbose": -1,
}
model = lgb.train(
    params, dtrain, num_boost_round=2000,
    valid_sets=[dval], valid_names=["val"],
    callbacks=[lgb.early_stopping(100, verbose=True), lgb.log_evaluation(50)],
)
print(f"[{time.time()-t0:.0f}s] trained, best_iter={model.best_iteration}")

import os
os.makedirs("ml/models", exist_ok=True)
model.save_model(MODEL_OUT)
print(f"saved {MODEL_OUT}")

# ------------------------------------------------------------------ baselines
hod = df["hour_utc"].dt.hour
train_hod = hod[train.index]

def wmean(g, w):
    return np.average(g, weights=w)

clim_key = ["tx_field", "rx_field", "band"]
t = train.assign(hod=train_hod)
grp = t.groupby(clim_key + ["hod"], observed=True).apply(
    lambda g: wmean(g["open"], g["weight"]), include_groups=False
).rename("p_pair")
grp_band = t.groupby(["band", "hod"], observed=True).apply(
    lambda g: wmean(g["open"], g["weight"]), include_groups=False
).rename("p_band")
p_global = wmean(t["open"], t["weight"])

h = hold.assign(hod=hod[hold.index])
h = h.merge(grp.reset_index(), on=clim_key + ["hod"], how="left")
h = h.merge(grp_band.reset_index(), on=["band", "hod"], how="left")
h["p_clim"] = h["p_pair"].fillna(h["p_band"]).fillna(p_global)

h["p_model"] = model.predict(h[FEATS], num_iteration=model.best_iteration)

# persistence: same cell 24h earlier
key = ["tx_field", "rx_field", "band"]
lag = df[key + ["hour_utc", "open"]].copy()
lag["hour_utc"] = lag["hour_utc"] + pd.Timedelta(hours=24)
lag = lag.rename(columns={"open": "open_prev"})
h = h.merge(lag, on=key + ["hour_utc"], how="left")
# only score persistence where lookback lands in complete (non-downsampled) data
h_pers = h[h["hour_utc"] >= HOLDOUT_START + pd.Timedelta(hours=24)].copy()
h_pers["p_pers"] = h_pers["open_prev"].fillna(h_pers["p_clim"])
# soften hard 0/1 for logloss sanity
h_pers["p_pers"] = h_pers["p_pers"].clip(0.02, 0.98)

def report(name, y, p):
    print(f"{name:>14}: AUC {roc_auc_score(y, p):.4f} | "
          f"Brier {brier_score_loss(y, p):.4f} | LogLoss {log_loss(y, p):.4f}")

print("\n=== HOLDOUT (full, unsampled) ===")
report("model", h["open"], h["p_model"])
report("climatology", h["open"], h["p_clim"])
report("persistence", h_pers["open"], h_pers["p_pers"])
report("model*", h_pers["open"], h_pers["p_model"])  # same rows as persistence

print("\n=== per-band AUC (model / climatology) ===")
for band, g in h.groupby("band", observed=True):
    if g["open"].nunique() < 2:
        continue
    print(f"  {band:>5}: {roc_auc_score(g['open'], g['p_model']):.4f} / "
          f"{roc_auc_score(g['open'], g['p_clim']):.4f}  (n={len(g):,}, open {g['open'].mean():.2f})")

print("\n=== calibration (model, holdout deciles) ===")
h["bin"] = pd.qcut(h["p_model"], 10, duplicates="drop")
print(h.groupby("bin", observed=True).agg(pred=("p_model", "mean"), actual=("open", "mean"), n=("open", "size")).to_string())

print("\n=== top feature importance (gain) ===")
imp = sorted(zip(FEATS, model.feature_importance("gain")), key=lambda x: -x[1])
for f, v in imp[:15]:
    print(f"  {f:>14}: {v:,.0f}")

print("\ndone")
