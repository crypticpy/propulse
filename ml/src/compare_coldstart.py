"""Compare v2 vs v3 on cold-start holdout cells (path_prev1 == 0):
the slice where lag features are silent and physics has to carry the load.
"""

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

HOLDOUT_START = pd.Timestamp("2026-03-23", tz="UTC")

BASE_FEATS = [
    "hod_sin", "hod_cos", "dist_km", "bearing_sin", "bearing_cos",
    "sun_elev_tx", "sun_elev_rx", "sun_elev_mid",
    "kp", "sfi", "bz", "by", "bt", "wind_speed", "log_xray", "dst", "log_proton",
    "kp_delta_3h", "kp_max_24h", "bz_min_3h", "log_xray_max_6h",
    "lg_path_prev1", "lg_path_prev3h", "lg_path_prev24", "lg_rev_path_prev1",
    "lg_tx_band_prev1", "lg_rx_band_prev1", "path_open_rate_7d",
]
V3_EXTRA = [
    "lg_tx_nbr_prev1", "lg_rx_nbr_prev1",
    "dark_frac", "min_abs_elev_ends", "path_min_elev", "path_max_elev",
    "band_mhz", "muf_proxy", "freq_muf_ratio", "is_weekend", "is_contest",
]
CAT_FEATS = ["band", "tx_field", "rx_field"]
RAW_LOGS = ["path_prev1", "path_prev3h", "path_prev24", "rev_path_prev1",
            "tx_band_prev1", "rx_band_prev1"]


def prep(path, extra_logs=()):
    df = pd.read_parquet(path)
    df["hour_utc"] = pd.to_datetime(df["hour_utc"], utc=True)
    df = df[df.hour_utc >= HOLDOUT_START].copy()
    df["log_xray"] = np.log10(df["xray"].clip(lower=1e-9))
    df["log_proton"] = np.log10(df["proton"].clip(lower=1e-3))
    df["log_xray_max_6h"] = np.log10(df["xray_max_6h"].clip(lower=1e-9))
    for c in list(RAW_LOGS) + list(extra_logs):
        df[f"lg_{c}"] = np.log1p(df[c])
    df["path_open_rate_7d"] = df["path_open_rate_7d"].fillna(0.0)
    for c in CAT_FEATS:
        df[c] = df[c].astype("category")
    return df.sort_values(["hour_utc", "band", "tx_field", "rx_field"]).reset_index(drop=True)


h2 = prep("ml/data/processed/train_cells_v2.parquet")
h3 = prep("ml/data/processed/train_cells_v3.parquet", extra_logs=["tx_nbr_prev1", "rx_nbr_prev1"])
assert len(h2) == len(h3), (len(h2), len(h3))

m2 = xgb.Booster(); m2.load_model("ml/models/path_open_v2_full.json")
m3 = xgb.Booster(); m3.load_model("ml/models/path_open_v3_full.json")
p2 = m2.predict(xgb.DMatrix(h2[BASE_FEATS + CAT_FEATS], enable_categorical=True))
p3 = m3.predict(xgb.DMatrix(h3[BASE_FEATS + V3_EXTRA + CAT_FEATS], enable_categorical=True))
y = h3["open"].to_numpy()


def row(name, mask):
    print(f"\n--- {name}: {mask.sum():,} cells, open rate {y[mask].mean():.3f} ---", flush=True)
    for label, p in (("v2", p2), ("v3", p3)):
        print(f"  {label}: AUC {roc_auc_score(y[mask], p[mask]):.4f} | "
              f"PR-AUC {average_precision_score(y[mask], p[mask]):.4f} | "
              f"Brier {brier_score_loss(y[mask], p[mask]):.4f}", flush=True)


cold = h3["path_prev1"].to_numpy() == 0
colder = cold & (h3["path_prev3h"].to_numpy() == 0) & (h3["path_prev24"].to_numpy() == 0)
row("all holdout", np.ones(len(y), bool))
row("cold (no spots prev 1h)", cold)
row("ice-cold (none in 1h/3h/24h)", colder)
row("warm (spots prev 1h)", ~cold)
