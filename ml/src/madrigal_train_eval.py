"""Train identical XGBoost models on Madrigal-built and ours-built March
cells, then cross-evaluate: each model on each holdout. Answers two questions:

1. Does 97x denser spot data (cleaner labels) train a better model?
2. Do our sparse labels mislead evaluation (model looks worse than it is)?

Holdout = Mar 24-31. All metrics sample-weighted (negatives are downsampled
with compensating weights in both datasets).
"""

import time

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    average_precision_score, brier_score_loss, roc_auc_score,
)

SOURCES = ("madrigal", "ours")
CELLS = "ml/data/processed/train_cells_mar_{src}.parquet"
VAL_START = pd.Timestamp("2026-03-20", tz="UTC")
HOLD_START = pd.Timestamp("2026-03-24", tz="UTC")

NUM_FEATS = [
    "hod_sin", "hod_cos", "dist_km", "bearing_sin", "bearing_cos",
    "sun_elev_tx", "sun_elev_rx", "sun_elev_mid",
    "kp", "sfi", "bz", "by", "bt", "wind_speed", "log_xray", "dst", "log_proton",
    "kp_delta_3h", "kp_max_24h", "bz_min_3h", "log_xray_max_6h",
    "lg_path_prev1", "lg_path_prev3h", "lg_path_prev24", "lg_rev_path_prev1",
    "lg_tx_band_prev1", "lg_rx_band_prev1", "lg_tx_nbr_prev1", "lg_rx_nbr_prev1",
    "path_open_rate_7d",
    "dark_frac", "min_abs_elev_ends", "path_min_elev", "path_max_elev",
    "band_mhz", "muf_proxy", "freq_muf_ratio", "is_weekend", "is_contest",
]
CAT_FEATS = ["band", "tx_field", "rx_field"]
FEATS = NUM_FEATS + CAT_FEATS

t0 = time.time()


def log(msg):
    print(f"[{time.time() - t0:6.0f}s] {msg}", flush=True)


def prep(src):
    df = pd.read_parquet(CELLS.format(src=src))
    df["hour_utc"] = pd.to_datetime(df["hour_utc"], utc=True)
    df["log_xray"] = np.log10(df["xray"].clip(lower=1e-9))
    df["log_proton"] = np.log10(df["proton"].clip(lower=1e-3))
    df["log_xray_max_6h"] = np.log10(df["xray_max_6h"].clip(lower=1e-9))
    for c in ["path_prev1", "path_prev3h", "path_prev24", "rev_path_prev1",
              "tx_band_prev1", "rx_band_prev1", "tx_nbr_prev1", "rx_nbr_prev1"]:
        df[f"lg_{c}"] = np.log1p(df[c])
    df["path_open_rate_7d"] = df["path_open_rate_7d"].fillna(0.0)
    return df


data = {src: prep(src) for src in SOURCES}

# Harmonize categorical codes across BOTH datasets so a model trained on one
# scores correctly on the other (xgboost consumes pandas category codes).
for c in CAT_FEATS:
    union = sorted(set().union(*(set(data[s][c].unique()) for s in SOURCES)))
    cat_type = pd.CategoricalDtype(categories=union)
    for s in SOURCES:
        data[s][c] = data[s][c].astype(cat_type)

splits = {}
for s in SOURCES:
    df = data[s]
    splits[s] = {
        "train": df[df.hour_utc < VAL_START],
        "val": df[(df.hour_utc >= VAL_START) & (df.hour_utc < HOLD_START)],
        "hold": df[df.hour_utc >= HOLD_START],
    }
    w_open = np.average(splits[s]["hold"]["open"], weights=splits[s]["hold"]["weight"])
    log(f"{s}: train {len(splits[s]['train']):,} | val {len(splits[s]['val']):,} | "
        f"hold {len(splits[s]['hold']):,} (weighted open {w_open:.3f})")

params = {
    "objective": "binary:logistic", "eval_metric": "auc", "tree_method": "hist",
    "max_depth": 0, "max_leaves": 256, "grow_policy": "lossguide",
    "eta": 0.05, "subsample": 0.8, "colsample_bytree": 0.8, "lambda": 5.0,
}

models = {}
for s in SOURCES:
    tr, va = splits[s]["train"], splits[s]["val"]
    dtr = xgb.DMatrix(tr[FEATS], tr["open"], weight=tr["weight"],
                      enable_categorical=True)
    dva = xgb.DMatrix(va[FEATS], va["open"], weight=va["weight"],
                      enable_categorical=True)
    m = xgb.train(params, dtr, 2000, evals=[(dva, "val")],
                  early_stopping_rounds=100, verbose_eval=200)
    m.save_model(f"ml/models/path_open_mar_{s}.json")
    models[s] = m
    log(f"trained on {s}: best_iter={m.best_iteration}")

print("\n=== cross-evaluation (holdout Mar 24-31, weighted) ===", flush=True)
for train_src in SOURCES:
    for eval_src in SOURCES:
        h = splits[eval_src]["hold"]
        dho = xgb.DMatrix(h[FEATS], enable_categorical=True)
        p = models[train_src].predict(
            dho, iteration_range=(0, models[train_src].best_iteration + 1))
        y, w = h["open"].to_numpy(), h["weight"].to_numpy()
        auc = roc_auc_score(y, p, sample_weight=w)
        pr = average_precision_score(y, p, sample_weight=w)
        brier = brier_score_loss(y, np.clip(p, 1e-6, 1 - 1e-6), sample_weight=w)
        cold = h["path_prev1"].to_numpy() == 0
        auc_c = roc_auc_score(y[cold], p[cold], sample_weight=w[cold])
        pr_c = average_precision_score(y[cold], p[cold], sample_weight=w[cold])
        print(f"  train={train_src:8s} eval={eval_src:8s}: "
              f"AUC {auc:.4f} | PR-AUC {pr:.4f} | Brier {brier:.4f} | "
              f"cold AUC {auc_c:.4f} PR {pr_c:.4f}", flush=True)

print("\ndone", flush=True)
