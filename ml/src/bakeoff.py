"""Algorithm bake-off on the v2 feature set.

Stage 1: LightGBM (v0 params), LightGBM-deep, XGBoost, CatBoost — trained on a
         subsample of train for speed, early-stopped on val, scored on the full
         holdout.
Stage 2: best model by val AUC retrained on FULL train.
Stage 3: isotonic calibration (fit on val) + rank-average blend of all models.
Report: AUC, PR-AUC, Brier, Brier Skill Score vs climatology, logloss —
        overall, storm hours (kp>=4), and per-band.
"""

import time

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import (
    average_precision_score, brier_score_loss, log_loss, roc_auc_score,
)

CELLS = "ml/data/processed/train_cells_v2.parquet"
VAL_START = pd.Timestamp("2026-03-16", tz="UTC")
HOLDOUT_START = pd.Timestamp("2026-03-23", tz="UTC")
SUBSAMPLE = 6_000_000

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


def log(msg):
    print(f"[{time.time() - t0:6.0f}s] {msg}", flush=True)


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
log(f"loaded+prepped {df.shape}")

train = df[df.hour_utc < VAL_START]
val = df[(df.hour_utc >= VAL_START) & (df.hour_utc < HOLDOUT_START)]
hold = df[df.hour_utc >= HOLDOUT_START].copy()
sub = train.sample(n=min(SUBSAMPLE, len(train)), random_state=7)
log(f"train {len(train):,} (sub {len(sub):,}) | val {len(val):,} | holdout {len(hold):,}")

y_hold = hold["open"].to_numpy()
kp_hold = hold["kp"].to_numpy()
results = {}


def evaluate(name, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    storm = kp_hold >= 4
    row = {
        "auc": roc_auc_score(y_hold, p),
        "pr_auc": average_precision_score(y_hold, p),
        "brier": brier_score_loss(y_hold, p),
        "logloss": log_loss(y_hold, p),
        "auc_storm": roc_auc_score(y_hold[storm], p[storm]) if storm.sum() else float("nan"),
    }
    results[name] = (row, p)
    log(f"{name:>16}: AUC {row['auc']:.4f} | PR-AUC {row['pr_auc']:.4f} | "
        f"Brier {row['brier']:.4f} | storm-AUC {row['auc_storm']:.4f}")
    return p


# ------------------------------------------------------------------ baselines
hod = df["hour_utc"].dt.hour
t = train.assign(hod=hod[train.index])
clim = t.groupby(["tx_field", "rx_field", "band", "hod"], observed=True).apply(
    lambda g: np.average(g["open"], weights=g["weight"]), include_groups=False
).rename("p_pair").reset_index()
clim_band = t.groupby(["band", "hod"], observed=True).apply(
    lambda g: np.average(g["open"], weights=g["weight"]), include_groups=False
).rename("p_band").reset_index()
p_global = np.average(t["open"], weights=t["weight"])
h = hold.assign(hod=hod[hold.index])
h = h.merge(clim, on=["tx_field", "rx_field", "band", "hod"], how="left")
h = h.merge(clim_band, on=["band", "hod"], how="left")
p_clim = h["p_pair"].fillna(h["p_band"]).fillna(p_global).to_numpy()
evaluate("climatology", p_clim)
evaluate("prev1h-rule", np.where(hold["path_prev1"] > 0, 0.93, 0.05))
brier_clim = results["climatology"][0]["brier"]

# ------------------------------------------------------------------- models
def run_lgb(name, params, tr, rounds=2000):
    dtr = lgb.Dataset(tr[FEATS], tr["open"], weight=tr["weight"])
    dva = lgb.Dataset(val[FEATS], val["open"], weight=val["weight"], reference=dtr)
    m = lgb.train(
        {**params, "objective": "binary", "metric": "auc", "verbose": -1},
        dtr, num_boost_round=rounds, valid_sets=[dva],
        callbacks=[lgb.early_stopping(100, verbose=False)],
    )
    log(f"{name}: best_iter={m.best_iteration}, "
        f"val AUC {m.best_score['valid_0']['auc']:.4f}")
    evaluate(name, m.predict(hold[FEATS], num_iteration=m.best_iteration))
    return m


base_params = {
    "learning_rate": 0.05, "num_leaves": 127, "min_data_in_leaf": 200,
    "feature_fraction": 0.9, "bagging_fraction": 0.8, "bagging_freq": 1,
}
deep_params = {
    "learning_rate": 0.04, "num_leaves": 511, "min_data_in_leaf": 100,
    "feature_fraction": 0.8, "bagging_fraction": 0.8, "bagging_freq": 1,
    "lambda_l2": 5.0,
}

m_base = run_lgb("lgbm-base(sub)", base_params, sub)
m_deep = run_lgb("lgbm-deep(sub)", deep_params, sub)

# XGBoost
import xgboost as xgb_

dtr = xgb_.DMatrix(sub[FEATS], sub["open"], weight=sub["weight"], enable_categorical=True)
dva = xgb_.DMatrix(val[FEATS], val["open"], weight=val["weight"], enable_categorical=True)
dho = xgb_.DMatrix(hold[FEATS], enable_categorical=True)
xgb_params = {
    "objective": "binary:logistic", "eval_metric": "auc", "tree_method": "hist",
    "max_depth": 0, "max_leaves": 256, "grow_policy": "lossguide",
    "eta": 0.05, "subsample": 0.8, "colsample_bytree": 0.8, "lambda": 5.0,
}
mx = xgb_.train(xgb_params, dtr, 2000, evals=[(dva, "val")],
                early_stopping_rounds=100, verbose_eval=False)
log(f"xgboost: best_iter={mx.best_iteration}")
evaluate("xgboost(sub)", mx.predict(dho, iteration_range=(0, mx.best_iteration + 1)))

# CatBoost
from catboost import CatBoostClassifier, Pool

cb_sub = sub[FEATS].copy()
cb_val = val[FEATS].copy()
cb_hold = hold[FEATS].copy()
for c in CAT_FEATS:
    for d in (cb_sub, cb_val, cb_hold):
        d[c] = d[c].astype(str)
mc = CatBoostClassifier(
    iterations=2000, learning_rate=0.08, depth=8, l2_leaf_reg=5,
    eval_metric="AUC", od_wait=100, verbose=False, thread_count=10,
)
mc.fit(Pool(cb_sub, sub["open"], weight=sub["weight"], cat_features=CAT_FEATS),
       eval_set=Pool(cb_val, val["open"], weight=val["weight"], cat_features=CAT_FEATS))
log(f"catboost: best_iter={mc.get_best_iteration()}")
evaluate("catboost(sub)", mc.predict_proba(cb_hold)[:, 1])

# --------------------------------------------- stage 2: winner on full train
model_names = [n for n in results if "(sub)" in n]
best = max(model_names, key=lambda n: results[n][0]["auc"])
log(f"bake-off winner: {best} — retraining on full train")
if best.startswith("lgbm"):
    params = deep_params if "deep" in best else base_params
    m_full = run_lgb("winner(full)", params, train)
    m_full.save_model("ml/models/path_open_v2_full.txt")
elif best.startswith("xgboost"):
    dtr_f = xgb_.DMatrix(train[FEATS], train["open"], weight=train["weight"],
                         enable_categorical=True)
    m_full = xgb_.train(xgb_params, dtr_f, 2000, evals=[(dva, "val")],
                        early_stopping_rounds=100, verbose_eval=False)
    evaluate("winner(full)", m_full.predict(dho, iteration_range=(0, m_full.best_iteration + 1)))
    m_full.save_model("ml/models/path_open_v2_full.json")
else:
    cb_tr = train[FEATS].copy()
    for c in CAT_FEATS:
        cb_tr[c] = cb_tr[c].astype(str)
    m_full = CatBoostClassifier(
        iterations=2000, learning_rate=0.08, depth=8, l2_leaf_reg=5,
        eval_metric="AUC", od_wait=100, verbose=False, thread_count=10)
    m_full.fit(Pool(cb_tr, train["open"], weight=train["weight"], cat_features=CAT_FEATS),
               eval_set=Pool(cb_val, val["open"], weight=val["weight"], cat_features=CAT_FEATS))
    evaluate("winner(full)", m_full.predict_proba(cb_hold)[:, 1])
    m_full.save_model("ml/models/path_open_v2_full.cbm")

# ------------------------------- stage 3: calibration + blend, final report
def predict_val(name):
    if name.startswith("lgbm-base"):
        return m_base.predict(val[FEATS], num_iteration=m_base.best_iteration)
    if name.startswith("lgbm-deep"):
        return m_deep.predict(val[FEATS], num_iteration=m_deep.best_iteration)
    if name.startswith("xgboost"):
        return mx.predict(dva, iteration_range=(0, mx.best_iteration + 1))
    return mc.predict_proba(cb_val)[:, 1]


if best.startswith("lgbm"):
    p_val_win = m_full.predict(val[FEATS], num_iteration=m_full.best_iteration)
elif best.startswith("xgboost"):
    p_val_win = m_full.predict(dva, iteration_range=(0, m_full.best_iteration + 1))
else:
    p_val_win = m_full.predict_proba(cb_val)[:, 1]
iso = IsotonicRegression(out_of_bounds="clip")
iso.fit(p_val_win, val["open"], sample_weight=val["weight"])
evaluate("winner+isotonic", iso.predict(results["winner(full)"][1]))

ranks = np.mean(
    [pd.Series(results[n][1]).rank(pct=True).to_numpy() for n in model_names], axis=0
)
evaluate("rank-blend(sub)", ranks)

print("\n=== SUMMARY (holdout, Brier Skill Score vs climatology) ===", flush=True)
for name, (row, p) in sorted(results.items(), key=lambda kv: -kv[1][0]["auc"]):
    bss = 1 - row["brier"] / brier_clim
    print(f"{name:>16}: AUC {row['auc']:.4f} | PR-AUC {row['pr_auc']:.4f} | "
          f"Brier {row['brier']:.4f} | BSS {bss:+.3f} | storm-AUC {row['auc_storm']:.4f}",
          flush=True)

print("\n=== winner(full) per-band AUC ===", flush=True)
p_win = results["winner(full)"][1]
for band, g in hold.assign(p=p_win).groupby("band", observed=True):
    if g["open"].nunique() < 2:
        continue
    print(f"  {band:>5}: {roc_auc_score(g['open'], g['p']):.4f} (n={len(g):,})", flush=True)

print("\n=== winner(full) top features (gain) ===", flush=True)
if best.startswith("lgbm"):
    imp = sorted(zip(FEATS, m_full.feature_importance("gain")), key=lambda x: -x[1])
    for f, v in imp[:20]:
        print(f"  {f:>18}: {v:,.0f}", flush=True)
log("bake-off complete")
