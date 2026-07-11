"""v4: mode-aware path_open (XGBoost) + SNR quantile head (LightGBM p10/50/90).

Reports per-mode-class metrics; SNR head evaluated on holdout positives with
pinball loss, p50 MAE, and p10-p90 empirical coverage.
"""

import time

import lightgbm as lgb
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    average_precision_score, brier_score_loss, log_loss,
    mean_absolute_error, mean_pinball_loss, roc_auc_score,
)

CELLS = "ml/data/processed/train_cells_v4.parquet"
VAL_START = pd.Timestamp("2026-03-16", tz="UTC")
HOLDOUT_START = pd.Timestamp("2026-03-23", tz="UTC")

NUM_FEATS = [
    "hod_sin", "hod_cos", "dist_km", "bearing_sin", "bearing_cos",
    "sun_elev_tx", "sun_elev_rx", "sun_elev_mid",
    "kp", "sfi", "bz", "by", "bt", "wind_speed", "log_xray", "dst", "log_proton",
    "kp_delta_3h", "kp_max_24h", "bz_min_3h", "log_xray_max_6h",
    "lg_path_prev1", "lg_path_prev3h", "lg_path_prev24", "lg_rev_path_prev1",
    "lg_xmode_path_prev1",
    "lg_tx_band_prev1", "lg_rx_band_prev1", "lg_tx_nbr_prev1", "lg_rx_nbr_prev1",
    "path_open_rate_7d",
    "dark_frac", "min_abs_elev_ends", "path_min_elev", "path_max_elev",
    "band_mhz", "muf_proxy", "freq_muf_ratio", "is_weekend", "is_contest",
]
CAT_FEATS = ["band", "tx_field", "rx_field", "mode_class"]
FEATS = NUM_FEATS + CAT_FEATS

t0 = time.time()
df = pd.read_parquet(CELLS)
df["hour_utc"] = pd.to_datetime(df["hour_utc"], utc=True)
df["log_xray"] = np.log10(df["xray"].clip(lower=1e-9))
df["log_proton"] = np.log10(df["proton"].clip(lower=1e-3))
df["log_xray_max_6h"] = np.log10(df["xray_max_6h"].clip(lower=1e-9))
for c in ["path_prev1", "path_prev3h", "path_prev24", "rev_path_prev1",
          "xmode_path_prev1", "tx_band_prev1", "rx_band_prev1",
          "tx_nbr_prev1", "rx_nbr_prev1"]:
    df[f"lg_{c}"] = np.log1p(df[c])
df["path_open_rate_7d"] = df["path_open_rate_7d"].fillna(0.0)
for c in CAT_FEATS:
    df[c] = df[c].astype("category")

train = df[df.hour_utc < VAL_START]
val = df[(df.hour_utc >= VAL_START) & (df.hour_utc < HOLDOUT_START)]
hold = df[df.hour_utc >= HOLDOUT_START].copy()
print(f"[{time.time()-t0:.0f}s] train {len(train):,} | val {len(val):,} | "
      f"holdout {len(hold):,} (open {hold['open'].mean():.3f})", flush=True)

# ------------------------------------------------------------ path_open head
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
              early_stopping_rounds=100, verbose_eval=100)
print(f"[{time.time()-t0:.0f}s] path_open best_iter={m.best_iteration}", flush=True)
m.save_model("ml/models/path_open_v4_full.json")

p = m.predict(dho, iteration_range=(0, m.best_iteration + 1))
y = hold["open"].to_numpy()


def report(tag, mask):
    yy, pp = y[mask], np.clip(p[mask], 1e-6, 1 - 1e-6)
    print(f"  {tag:>18}: AUC {roc_auc_score(yy, pp):.4f} | "
          f"PR-AUC {average_precision_score(yy, pp):.4f} | "
          f"Brier {brier_score_loss(yy, pp):.4f} | "
          f"LogLoss {log_loss(yy, pp):.4f} (n={mask.sum():,}, open {yy.mean():.3f})",
          flush=True)


print("\n=== v4 path_open holdout ===", flush=True)
report("all", np.ones(len(y), bool))
mc = hold["mode_class"].to_numpy()
report("cw", mc == "cw")
report("digital", mc == "digital")
storm = hold["kp"].to_numpy() >= 4
report("storm (kp>=4)", storm)
cold = hold["path_prev1"].to_numpy() == 0
report("cold", cold)
report("ice-cold", cold & (hold["path_prev3h"].to_numpy() == 0)
       & (hold["path_prev24"].to_numpy() == 0))

print("\n=== precision at thresholds ===", flush=True)
for thr in (0.5, 0.7, 0.8, 0.9):
    mask = p >= thr
    if mask.sum():
        print(f"  claim >= {thr:.0%}: actual open {y[mask].mean():.1%} "
              f"({mask.sum():,} cells)", flush=True)

# ---------------------------------------------------------------- SNR head
print("\n=== SNR quantile head (positives only) ===", flush=True)
tr_pos = train[(train["open"] == 1) & train["median_snr"].notna()]
va_pos = val[(val["open"] == 1) & val["median_snr"].notna()]
ho_pos = hold[(hold["open"] == 1) & hold["median_snr"].notna()]
print(f"positives: train {len(tr_pos):,} | val {len(va_pos):,} | "
      f"holdout {len(ho_pos):,}", flush=True)

snr_models = {}
preds = {}
for alpha in (0.1, 0.5, 0.9):
    dtr_q = lgb.Dataset(tr_pos[FEATS], tr_pos["median_snr"])
    dva_q = lgb.Dataset(va_pos[FEATS], va_pos["median_snr"], reference=dtr_q)
    mq = lgb.train(
        {"objective": "quantile", "alpha": alpha, "metric": "quantile",
         "learning_rate": 0.05, "num_leaves": 255, "min_data_in_leaf": 100,
         "feature_fraction": 0.9, "verbose": -1},
        dtr_q, num_boost_round=1500, valid_sets=[dva_q],
        callbacks=[lgb.early_stopping(75, verbose=False)],
    )
    snr_models[alpha] = mq
    preds[alpha] = mq.predict(ho_pos[FEATS], num_iteration=mq.best_iteration)
    mq.save_model(f"ml/models/snr_q{int(alpha*100)}_v4.txt")
    pin = mean_pinball_loss(ho_pos["median_snr"], preds[alpha], alpha=alpha)
    print(f"  q{int(alpha*100):02d}: best_iter={mq.best_iteration}, "
          f"holdout pinball {pin:.3f}", flush=True)

mae = mean_absolute_error(ho_pos["median_snr"], preds[0.5])
cover = ((ho_pos["median_snr"] >= preds[0.1]) & (ho_pos["median_snr"] <= preds[0.9])).mean()
base_mae = mean_absolute_error(
    ho_pos["median_snr"],
    np.full(len(ho_pos), tr_pos["median_snr"].median()),
)
print(f"\n  p50 MAE {mae:.2f} dB (constant-median baseline {base_mae:.2f} dB)", flush=True)
print(f"  p10-p90 empirical coverage: {cover:.1%} (target 80%)", flush=True)
for m_cls, g in ho_pos.assign(p50=preds[0.5]).groupby("mode_class", observed=True):
    print(f"  {m_cls}: p50 MAE {mean_absolute_error(g['median_snr'], g['p50']):.2f} dB "
          f"(n={len(g):,})", flush=True)
print("\ndone", flush=True)
