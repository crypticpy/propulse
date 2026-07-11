"""Finish the crashed bake-off stage 3: isotonic calibration + final report
for the saved full-train XGBoost winner. Avoids re-running the ~1h bake-off.
"""

import time

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import (
    average_precision_score, brier_score_loss, log_loss, roc_auc_score,
)

CELLS = "ml/data/processed/train_cells_v2.parquet"
MODEL = "ml/models/path_open_v2_full.json"
VAL_START = pd.Timestamp("2026-03-16", tz="UTC")
HOLDOUT_START = pd.Timestamp("2026-03-23", tz="UTC")

NUM_FEATS = [
    "hod_sin", "hod_cos", "dist_km", "bearing_sin", "bearing_cos",
    "sun_elev_tx", "sun_elev_rx", "sun_elev_mid",
    "kp", "sfi", "bz", "by", "bt", "wind_speed", "log_xray", "dst", "log_proton",
    "kp_delta_3h", "kp_max_24h", "bz_min_3h", "log_xray_max_6h",
    "lg_path_prev1", "lg_path_prev3h", "lg_path_prev24", "lg_rev_path_prev1",
    "lg_tx_band_prev1", "lg_rx_band_prev1", "path_open_rate_7d",
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
          "tx_band_prev1", "rx_band_prev1"]:
    df[f"lg_{c}"] = np.log1p(df[c])
df["path_open_rate_7d"] = df["path_open_rate_7d"].fillna(0.0)
for c in CAT_FEATS:
    df[c] = df[c].astype("category")

val = df[(df.hour_utc >= VAL_START) & (df.hour_utc < HOLDOUT_START)]
hold = df[df.hour_utc >= HOLDOUT_START].copy()
print(f"[{time.time()-t0:.0f}s] prepped: val {len(val):,} | holdout {len(hold):,}", flush=True)

m = xgb.Booster()
m.load_model(MODEL)
dva = xgb.DMatrix(val[FEATS], enable_categorical=True)
dho = xgb.DMatrix(hold[FEATS], enable_categorical=True)
p_val = m.predict(dva)
p_hold = m.predict(dho)
print(f"[{time.time()-t0:.0f}s] predictions done", flush=True)

iso = IsotonicRegression(out_of_bounds="clip")
iso.fit(p_val, val["open"], sample_weight=val["weight"])
p_cal = iso.predict(p_hold)
joblib.dump(iso, "ml/models/path_open_v2_isotonic.joblib")

y = hold["open"].to_numpy()
storm = hold["kp"].to_numpy() >= 4


def report(name, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    print(f"{name:>16}: AUC {roc_auc_score(y, p):.4f} | "
          f"PR-AUC {average_precision_score(y, p):.4f} | "
          f"Brier {brier_score_loss(y, p):.4f} | LogLoss {log_loss(y, p):.4f} | "
          f"storm-AUC {roc_auc_score(y[storm], p[storm]):.4f}", flush=True)


print("\n=== winner(full) holdout ===", flush=True)
report("raw", p_hold)
report("isotonic", p_cal)

print("\n=== precision at user-facing thresholds (calibrated) ===", flush=True)
for thr in (0.5, 0.7, 0.8, 0.9):
    mask = p_cal >= thr
    if mask.sum():
        print(f"  claim >= {thr:.0%}: actual open {y[mask].mean():.1%} "
              f"({mask.sum():,} cells, {mask.mean():.1%} of holdout)", flush=True)

print("\n=== calibration deciles (isotonic) ===", flush=True)
hb = pd.DataFrame({"p": p_cal, "y": y})
hb["bin"] = pd.qcut(hb["p"], 10, duplicates="drop")
print(hb.groupby("bin", observed=True).agg(pred=("p", "mean"), actual=("y", "mean"),
                                           n=("y", "size")).to_string(), flush=True)

print("\n=== per-band AUC (raw) ===", flush=True)
for band, g in hold.assign(p=p_hold).groupby("band", observed=True):
    if g["open"].nunique() < 2:
        continue
    print(f"  {band:>5}: {roc_auc_score(g['open'], g['p']):.4f} "
          f"(n={len(g):,}, open {g['open'].mean():.2f})", flush=True)

print("\n=== top features (gain) ===", flush=True)
gains = m.get_score(importance_type="gain")
for f, v in sorted(gains.items(), key=lambda kv: -kv[1])[:20]:
    print(f"  {f:>18}: {v:,.0f}", flush=True)
print("\ndone", flush=True)
