# Improvement Backlog — path_open model

> Written 2026-07-11, after v2 bake-off showed all GBDTs converging at ~0.954 AUC
> (climatology 0.929). Convergence across engines = we are **feature-bound, not
> algorithm-bound**. Ordered by expected ROI.

## Where the remaining error lives

- Busy mid-bands (20m/40m) where climatology is already strong — need sharper
  *conditioning* (physics, finer geography) to beat pair memory there.
- Probability quality at the decision thresholds users see (≥70% "go call CQ").
- Mode blindness: "open for FT8 at −18 dB" ≠ "open for SSB". Pooled labels cap
  product accuracy regardless of AUC.
- One season, one slice of solar cycle 25 — generalization debt invisible in
  our own holdout.

## Tier 1 — features (cheap, this machine, hours)

1. **Physics-hybrid features** (likely the biggest single jump): crude foF2/MUF
   proxy per path-hour from SFI + solar zenith (Chapman-layer approximation),
   then `band_freq / MUF_est` ratio. Encodes the entire "too high a frequency
   for the ionization right now" axis in one number. We already have a full
   ITU-R P.533 engine in `src/lib/utils/` to sanity-check against.
2. **Path darkness fraction + gray-line**: sample ~9 points along the great
   circle, fraction with sun below horizon; min |sun elevation| at endpoints
   (gray-line indicator); both-dark flag. Canonical HF drivers, especially
   160m–40m (D-layer) and 10m–15m (F-layer).
3. **Neighbor-region activity (graph-lite)**: prev-hour spot counts for
   adjacent Maidenhead fields (same band, same rx side and vice versa).
   Spatial smoothing — if JN→FN is open, JO→FN likely is too. The hand-crafted
   stand-in for a GNN.
4. **Activity-weighted region centroids**: replace field-center lat/lon with
   train-window activity centroid per field (hams cluster inside 2° fields);
   sharpens distance/zenith/bearing for free.
5. **Contest-calendar flag**: activity explodes on contest weekends —
   **CQ WPX SSB (Mar 28–29) sits inside our holdout right now**, both a
   confound and an easy feature. Contest definitions already exist in
   `src/lib/data/`.
6. **Finer recency**: minutes-since-last-spot on path (capped), spots in last
   15 min of prev hour. Strongest live-product signal; needs sub-hour aggregation.

## Tier 2 — labels & targets (product-critical, ~a day)

1. **Mode-aware heads**: split cells by mode-class (CW / FT8-digital). Train
   P(open | mode). Detection floors differ by ~10–20 dB; pooling caps accuracy.
   SSB proxy = digital-open AND predicted SNR margin ≥ ~+14 dB.
2. **SNR quantile head**: LightGBM quantile objectives (p10/p50/p90) on cell
   median SNR → the "reliability" number and the SSB derivation.
3. **Tighter negatives**: require TX region active *on that band* that hour
   (not just any band) — cleaner "propagation failed" labels that match the
   product question ("if I call CQ now…"), less activity confounding.

## Tier 3 — model & training (overnight, this machine)

1. **Optuna tuning** of LightGBM on full train (30–50 trials, subsample per
   trial): expect +0.001–0.003 AUC.
2. **Low-LR long run** (lr 0.02, 5–8K trees) on full data once features settle.
3. **Stacking**: logistic meta-learner on val over {lgbm, xgb, catboost} preds
   + band; usually beats rank-blend.
4. **Monotone constraints** (LightGBM `monotone_constraints`): P(open)
   monotone ↑ in path_prev1/open_rate_7d. Better extrapolation + no bizarre
   local artifacts users would see.
5. **Rolling-origin CV** (4 weekly folds) for honest model selection — a single
   holdout fortnight (with a contest in it!) can flatter or punish unfairly.

## Tier 4 — data scale (the M5 Max / GPU-rental play)

1. **WSPR archive**: wsprnet.org publishes monthly dumps back to ~2008 —
   billions of spots **with TX power in the record**, spanning full solar
   cycles. Calibrated SNR modeling + seasonal/cycle features become learnable.
2. **RBN archive**: reversebeacon.net daily archives back to ~2009 (CW/RTTY).
3. **NASA OMNI / GFZ Kp / NOAA archives**: hourly solar-geomagnetic history to
   join both of the above; fills our xray/dst/proton gaps too.
4. Retrain at **4-char grid** granularity where data density allows (fall back
   to 2-char), directional pairs, per-mode heads. This is where the "big model"
   earns its name — and where neural approaches (TabM, FT-Transformer, learned
   pair embeddings feeding the GBDT) get their shot as ensemble diversity.

## Tier 5 — evaluation & product loop

1. **Threshold metrics**: precision when we claim ≥70/80/90% (the user-facing
   SLA), top-3-bands-now hit rate.
2. **Skill-decay test**: train weeks 1–5, eval weeks 6/7/8 separately → sets
   the retrain cadence for the collector flywheel.
3. **ITU-R P.533 head-to-head** on sampled holdout cells (Node script against
   `src/lib/utils/`) — the marketing number ("beats physics models by X%").
4. **Prediction logging in prod**: store predictions → join next hour's spots
   → live Brier dashboard. Closes the flywheel; catches drift before users do.

## Current best (for reference)

| holdout Mar 23–Apr 5 | AUC | PR-AUC | Brier | storm-AUC |
|---|---|---|---|---|
| climatology | 0.9288 | 0.6775 | 0.0585 | 0.9303 |
| v0 (no temporal feats) | 0.9297 | — | 0.0586 | — |
| v2 xgb full (`path_open_v2_full.json`) | 0.9541 | 0.7769 | 0.0479 | 0.9530 |
| v3 xgb full (`path_open_v3_full.json`, +Tier-1 feats) | 0.9543 | 0.7773 | 0.0479 | 0.9531 |

## v3 outcome + cold-start slice analysis (2026-07-11)

Tier-1 physics features (MUF ratio, darkness fraction, neighbors, contest flags,
centroids) moved the headline **+0.0002 AUC — near-flat**. They displaced solar
indices in importance (dark_frac > sfi now) but the lag features already encode
current propagation state on a 55-day window. **Conclusion: decimal-grinding on
this dataset is done; the ceiling is the data, not the model.**

Slice analysis (v2 → v3, holdout):

| slice | share | open rate | AUC | PR-AUC |
|---|---|---|---|---|
| cold (no path spots prev 1h) | 89% | 4.7% | 0.9229 → 0.9235 | 0.407 → 0.408 |
| ice-cold (none in 1h/3h/24h) | 79% | 2.4% | 0.9131 → 0.9143 | 0.228 → 0.231 |
| warm (spots prev 1h) | 11% | 64% | 0.839 → 0.839 | 0.907 → 0.908 |

Two strategic reads:

1. **Ice-cold cells are the killer feature and the weakest spot** — predicting a
   band opening *before anyone is on it* ("be first to the opening") has ~10×
   lift over random but PR-AUC only 0.23. Physics helps most exactly here
   (+0.0012 AUC, +0.0035 PR-AUC — small but the only slice where Tier 1 moved).
   More seasons/cycle coverage (Tier 4 archives) is the lever, not more features.
2. **Warm-slice discrimination (which active paths die next hour) is hard**
   (AUC 0.84) — sub-hour recency features (minutes-since-last-spot) are the
   lever there.

Next moves in order: mode-aware labels + SNR head (Tier 2, product-critical),
collector reactivation + path_hourly_stats flywheel, WSPR/RBN/OMNI archive
training on the M5 Max (Tier 4). Skip further Tier-1/3 grinding.
