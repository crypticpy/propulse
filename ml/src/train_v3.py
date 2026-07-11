"""Train the bake-off winner config (XGBoost lossguide) on the v3 feature set,
full train data, and report holdout metrics vs the v2 winner numbers.
"""

import time

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    average_precision_score, brier_score_loss, log_loss, roc_auc_score,
)

CELLS = "ml/data/processed/train_cells_v3.parquet"
MODEL_OUT = "ml/models/path_open_v3_full.json"
VAL_START = pd.Timestamp("2026-03-16", tz="UTC")
HOLDOUT_START = pd.Timestamp("2026-03-23", tz="UTC")

NUM_FEATS = [
    "hod_sin", "hod_cos", "dist_km", "bearing_sin", "bearing_cos",
    "sun_elev_tx", "sun_elev_rx", "sun_elev_mid",
    "kp", "sfi", "bz", "by", "bt", "wind_speed", "log_xray", "dst", "log_proton",
    "kp_delta_3h", "kp_max_24h", "bz_min_3h", "log_xray_max_6h",
    "lg_path_prev1", "lg_path_prev3h", "lg_path_prev24", "lg_rev_path_prev1",
    "lg_tx_band_prev1", "lg_rx_band_prev1", "path_open_rate_7d",
    # v3 additions
    "lg_tx_nbr_prev1", "lg_rx_nbr_prev1",
    "dark_frac", "min_abs_elev_ends", "path_min_elev", "path_max_elev",
    "band_mhz", "muf_proxy", "freq_muf_ratio",
    "is_weekend", "is_contest",
]
CAT_FEATS = ["band", "tx_field", "rx_field"]
FEATS = NUM_FEATS + CAT_FEATS

t0 = time.time()
df = pd.read_parquet(CELLS)
df["hour_utc"] = pd.to_datetime(df["hour_utc"], utc=True)
df["log_xray"] = np.log10(df["xray"].clip(lower=1e-9))
df["log_proton"] = np.log10(df["proton"].clip(lower=1e-3))
df["log_xray_max_6h"] = np.log10(df["xray_max_6h"].clip(lower=1e-9))
for c in ["path_prev1", "path_prev3h", "path_prev24", "rev_path_prev1",
          "tx_band_prev1", "rx_band_prev1", "tx_nbr_prev1", "rx_nbr_prev1"]:
    df[f"lg_{c}"] = np.log1p(df[c])
df["path_open_rate_7d"] = df["path_open_rate_7d"].fillna(0.0)
for c in CAT_FEATS:
    df[c] = df[c].astype("category")

train = df[df.hour_utc < VAL_START]
val = df[(df.hour_utc >= VAL_START) & (df.hour_utc < HOLDOUT_START)]
hold = df[df.hour_utc >= HOLDOUT_START].copy()
print(f"[{time.time()-t0:.0f}s] train {len(train):,} | val {len(val):,} | "
      f"holdout {len(hold):,}", flush=True)

dtr = xgb.DMatrix(train[FEATS], train["open"], weight=train["weight"],
                  enable_categorical=True)
dva = xgb.DMatrix(val[FEATS], val["open"], weight=val["weight"],
                  enable_categorical=True)
dho = xgb.DMatrix(hold[FEATS], enable_categorical=True)
params = {
    "objective": "binary:logistic", "eval_metric": "auc", "tree_method": "hist",
    "max_depth": 0, "max_leaves": 256, "grow_policy": "lossguide",
    "eta": 0.05, "subsample": 0.8, "colsample_bytree": 0.8, "lambda": 5.0,
}
m = xgb.train(params, dtr, 2000, evals=[(dva, "val")],
              early_stopping_rounds=100, verbose_eval=50)
print(f"[{time.time()-t0:.0f}s] best_iter={m.best_iteration}", flush=True)
m.save_model(MODEL_OUT)
print(f"saved {MODEL_OUT}", flush=True)

p = m.predict(dho, iteration_range=(0, m.best_iteration + 1))
y = hold["open"].to_numpy()
storm = hold["kp"].to_numpy() >= 4
pc = np.clip(p, 1e-6, 1 - 1e-6)
print(f"\n=== v3 holdout ===", flush=True)
print(f"AUC {roc_auc_score(y, pc):.4f} | PR-AUC {average_precision_score(y, pc):.4f} | "
      f"Brier {brier_score_loss(y, pc):.4f} | LogLoss {log_loss(y, pc):.4f} | "
      f"storm-AUC {roc_auc_score(y[storm], pc[storm]):.4f}", flush=True)
print("(v2 winner:  AUC 0.9541 | PR-AUC 0.7769 | Brier 0.0479 | LogLoss 0.1589 | "
      "storm-AUC 0.9530)", flush=True)

print("\n=== per-band AUC (v3 / v2) ===", flush=True)
V2_BAND = {"10m": 0.9324, "12m": 0.9351, "15m": 0.9146, "160m": 0.9845,
           "17m": 0.9273, "20m": 0.9050, "30m": 0.9374, "40m": 0.9362,
           "60m": 0.9854, "80m": 0.9764}
for band, g in hold.assign(p=p).groupby("band", observed=True):
    if g["open"].nunique() < 2:
        continue
    auc = roc_auc_score(g["open"], g["p"])
    prev = V2_BAND.get(str(band))
    delta = f" ({auc - prev:+.4f})" if prev else ""
    print(f"  {band:>5}: {auc:.4f}{delta}", flush=True)

print("\n=== precision at thresholds ===", flush=True)
for thr in (0.5, 0.7, 0.8, 0.9):
    mask = p >= thr
    if mask.sum():
        print(f"  claim >= {thr:.0%}: actual open {y[mask].mean():.1%} "
              f"({mask.sum():,} cells)", flush=True)

print("\n=== top features (gain) ===", flush=True)
for f, v in sorted(m.get_score(importance_type="gain").items(), key=lambda kv: -kv[1])[:22]:
    print(f"  {f:>20}: {v:,.0f}", flush=True)
print("\ndone", flush=True)
