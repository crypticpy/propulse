# linux_gpu execution profile

The `linux_gpu` profile lets the archive V4.2 phase-2/phase-3 **candidate fits**
run on a Linux box with an NVIDIA RTX 5080 (16 GiB, CUDA). Nothing else moves:
cohort builds, scoring, gates, validation and packaging still require
`compute.required_profile` = `m5`, and only `train_phase2_scale.py` and
`train_phase3_physics.py` accept `--profile linux_gpu`.

Config: `ml/config/propagation_v4_2_phase2_scale_v2.json` →
`compute.supported_profiles = ["m5", "linux_gpu"]` and `compute.linux_gpu`.
The frozen V1 config (`propagation_v4_2_phase2_scale.json`) is untouched and
still supports only `m5`.

The fit parameters are identical on both profiles except for where the trees are
built:

| parameter | m5 | linux_gpu |
| --- | --- | --- |
| `device` | absent (CPU) | `cuda` |
| `tree_method` | `hist` | `hist` |
| `nthread` | 14 single-fit / 9 per worker × 2 | 8, one fit at a time |
| everything else | `objective`, `eval_metric`, `max_depth`, `min_child_weight`, `eta`, `subsample`, `colsample_bytree`, `lambda`, `alpha`, `max_bin`, `seed`, `num_boost_round`, `early_stopping_rounds` | identical |

Matrix backend: the M5 fits 20M through `ExtMemQuantileDMatrix` and 50M through
the benchmarked in-memory `QuantileDMatrix`. Under `linux_gpu` both scales use
the iterator-fed in-memory `QuantileDMatrix`. `max_bin` 255 quantizes to one
byte per feature per row, so the 50M × 83 ellpack is ≈ 4.2 GiB and the 20M
≈ 1.7 GiB — both fit 16 GiB VRAM with room for gradients and histograms. The
choice is explicit in `compute.linux_gpu.twenty_million_backend` /
`fifty_million_backend`, not inferred.

`backend_benchmark_decision.json` is an M5 CPU-backend artifact. The CUDA
profile does not run it and records `"backend_benchmark":
"not_applicable_cuda_profile"` in the training results instead.

## 1. Box setup

Python 3.12 and a venv outside the repo:

```bash
sudo mkdir -p /srv/propulseml && sudo chown "$USER" /srv/propulseml
python3.12 -m venv /srv/propulseml/venv
/srv/propulseml/venv/bin/pip install --upgrade pip
/srv/propulseml/venv/bin/pip install -r ml/requirements.txt
```

`ml/requirements.txt` pins `xgboost==3.3.0`. On linux x86_64 the PyPI `xgboost`
wheel **is** the CUDA build (`xgboost-cpu` is the CPU-only variant — do not
install it), so the pinned requirements line is already the CUDA wheel. If a
CPU-only build ends up installed, force the correct one:

```bash
/srv/propulseml/venv/bin/pip install --force-reinstall --no-cache-dir xgboost==3.3.0
```

Verify before anything else — the profile validator refuses to start otherwise:

```bash
nvidia-smi --query-gpu=memory.free,memory.total,name --format=csv,noheader,nounits
/srv/propulseml/venv/bin/python -c "import xgboost; print(xgboost.__version__, xgboost.build_info()['USE_CUDA'])"
# expect: 3.3.0 True
```

The RTX 5080 is Blackwell (sm_120) and needs a recent driver (R570+). Confirm
the wheel actually has a kernel for it before trusting a long run:

```bash
/srv/propulseml/venv/bin/python - <<'PY'
import numpy as np, xgboost as xgb
X = np.random.rand(10_000, 16).astype("float32")
y = (np.random.rand(10_000) > 0.5).astype("float32")
m = xgb.train({"device": "cuda", "tree_method": "hist", "objective": "binary:logistic",
               "max_bin": 255},
              xgb.QuantileDMatrix(X, y, max_bin=255), num_boost_round=5)
print("cuda fit ok", m.num_boosted_rounds())
PY
```

A `no kernel image is available for execution on the device` error means the
wheel predates sm_120 — build XGBoost from source with CUDA 12.8+ or take a
newer wheel; do not fall back to CPU on this box.

## 2. Directory layout

```
/srv/propulseml/
├── venv/                                              # python 3.12 + CUDA xgboost
├── data/processed/archive_v4_2/                       # cohorts + samples (rsynced)
│   ├── propagation_v4_2_phase2_scale_v2/{20m,50m}/
│   └── propagation_v4_2_phase1_5m/                    # early-stopping + calibration samples
├── models/archive_v4_2/propagation_v4_2_phase2_scale_v2/{20m,50m}/   # written by the fits
└── tmp/propagation_v4_2_phase2_scale_v2/              # xgboost scratch
```

The repo checkout on the box is a plain `git clone` of this branch. Do **not**
create `ml/data/processed`, `ml/data/raw`, `ml/data/bronze` or `ml/models` as
symlinks there: on the box those trees are resolved through the profile root by
`m5_runtime.artifact_path`, and `ensure_model_root` creates
`ml/models/archive_v4_2 -> /srv/propulseml/models/archive_v4_2` on its own.

Manifests record M5 paths (`ml/data/processed/...`, which is a symlink into
`/Volumes/Projects/PropulseML` on the M5). Under `linux_gpu` each recorded path
is remapped onto the profile root — `ml/data/processed/X` →
`/srv/propulseml/data/processed/X`, and an absolute
`/Volumes/Projects/PropulseML/X` → `/srv/propulseml/X` — and the file must exist
there or the run stops with `artifact is missing`. Use
`--data-root-override /other/root` if the box stores the data somewhere other
than the configured `external_root`; every root is rebased onto it.

## 3. Copy the inputs from the M5

Run these **on the M5** (`<box-user>@<box-host>` is the SSH target). The 20M
cohorts and the shared 5M samples:

```bash
rsync -aP --info=progress2 \
  /Volumes/Projects/PropulseML/data/processed/archive_v4_2/propagation_v4_2_phase2_scale_v2/20m/ \
  <box-user>@<box-host>:/srv/propulseml/data/processed/archive_v4_2/propagation_v4_2_phase2_scale_v2/20m/

rsync -aP --info=progress2 \
  /Volumes/Projects/PropulseML/data/processed/archive_v4_2/propagation_v4_2_phase1_5m/ \
  <box-user>@<box-host>:/srv/propulseml/data/processed/archive_v4_2/propagation_v4_2_phase1_5m/
```

Later, for the 50M fits:

```bash
rsync -aP --info=progress2 \
  /Volumes/Projects/PropulseML/data/processed/archive_v4_2/propagation_v4_2_phase2_scale_v2/50m/ \
  <box-user>@<box-host>:/srv/propulseml/data/processed/archive_v4_2/propagation_v4_2_phase2_scale_v2/50m/
```

The manifest is the source of truth for what a fit reads. To copy exactly the
files it names (and nothing else), drive rsync from the manifest:

```bash
python3 - <<'PY' > /tmp/cohort-files.txt
import json
m = json.load(open("ml/data/manifests/propagation_v4_2_phase2_v2_20m_cohorts.json"))
paths = [i["path"] for c in m["cohorts"].values() for i in c.values()]
paths += [i["path"] for i in m["early_stopping"].values()]
paths.append(m["calibration"]["path"])
print("\n".join(p.removeprefix("ml/data/processed/") for p in sorted(set(paths))))
PY

rsync -aP --files-from=/tmp/cohort-files.txt \
  /Volumes/Projects/PropulseML/data/processed/ \
  <box-user>@<box-host>:/srv/propulseml/data/processed/
```

`.gitignore` excludes `ml/data/` wholesale, including every cohort manifest
under `ml/data/manifests/` — some of those manifests are tracked anyway
because they were force-added (`git add -f`), but that is an exception, not
the rule, and it is easy to assume a manifest is tracked when it is not. As of
this writing `propagation_v4_2_phase2_v2_20m_cohorts.json` and
`..._50m_cohorts.json` are **not** force-added, so `git pull` alone will not
put them on the box. Check before relying on either path:

```bash
git ls-files ml/data/manifests/propagation_v4_2_phase2_v2_20m_cohorts.json
# empty output => not tracked => rsync it; a printed path => git pull is enough
```

Rsync whenever the check comes back empty:

```bash
rsync -aP ml/data/manifests/propagation_v4_2_phase2_v2_20m_cohorts.json \
  <box-user>@<box-host>:<repo>/ml/data/manifests/
```

The 50M work-set is derived from the frozen 20M evaluation, so
`ml/results/propagation_v4_2/propagation_v4_2_phase2_scale_v2/evaluation_20m_results.json`
(scored on the M5, committed to the repo) must be present on the box before
`--scale 50000000` will start.

## 4. Train

On the box, from the repo root:

```bash
V=/srv/propulseml/venv/bin/python
C=ml/config/propagation_v4_2_phase2_scale_v2.json

# 20M, all candidates and folds, one GPU fit at a time
$V ml/src/archive_v4_2/train_phase2_scale.py --config $C --profile linux_gpu \
  --scale 20000000 --workers 1

# a single candidate/fold (resume, or a timed first fit)
$V ml/src/archive_v4_2/train_phase2_scale.py --config $C --profile linux_gpu \
  --scale 20000000 --candidate A4_recent_cycle --fold F3_2024_07 --workers 1

# 50M, after the 20M evaluation has selected the components on the M5
$V ml/src/archive_v4_2/train_phase2_scale.py --config $C --profile linux_gpu \
  --scale 50000000 --workers 1

# phase 3 physics component (V2 contract only)
$V ml/src/archive_v4_2/train_phase3_physics.py --config $C --profile linux_gpu

# data somewhere other than the configured root
$V ml/src/archive_v4_2/train_phase2_scale.py --config $C --profile linux_gpu \
  --scale 20000000 --workers 1 --data-root-override /mnt/ml
```

`--workers` must stay 1 (`compute.linux_gpu.parallel_fit_workers`); the single
GPU is the serialization point, and a second worker would contend for VRAM.

Results are written to the repository path `ml/results/propagation_v4_2/
propagation_v4_2_phase2_scale_v2/training_{20,50}m_results.json` and models to
`/srv/propulseml/models/archive_v4_2/propagation_v4_2_phase2_scale_v2/{20m,50m}/`
under exactly the file names an M5 run produces, so the artifacts drop straight
back into place. Each fold records `training_profile`, `training_backend`
(`cuda_hist`), `execution.device`, `execution.tree_method` and the full runtime
snapshot (GPU name, free/total VRAM, cores, RAM, free disk).

## 5. Copy the outputs back to the M5

Run these **on the M5**:

```bash
rsync -aP <box-user>@<box-host>:<repo>/ml/results/propagation_v4_2/propagation_v4_2_phase2_scale_v2/training_20m_results.json \
  ml/results/propagation_v4_2/propagation_v4_2_phase2_scale_v2/

rsync -aP <box-user>@<box-host>:<repo>/ml/results/propagation_v4_2/propagation_v4_2_phase2_scale_v2/training_50m_results.json \
  ml/results/propagation_v4_2/propagation_v4_2_phase2_scale_v2/

rsync -aP <box-user>@<box-host>:/srv/propulseml/models/archive_v4_2/propagation_v4_2_phase2_scale_v2/20m/ \
  /Volumes/Projects/PropulseML/models/archive_v4_2/propagation_v4_2_phase2_scale_v2/20m/

rsync -aP <box-user>@<box-host>:/srv/propulseml/models/archive_v4_2/propagation_v4_2_phase2_scale_v2/50m/ \
  /Volumes/Projects/PropulseML/models/archive_v4_2/propagation_v4_2_phase2_scale_v2/50m/
```

The results JSON records each model's size and SHA-256 against its
repository-relative path, so the M5 scoring and validation steps verify the
transfer for free — a truncated rsync fails as `artifact size changed` or
`artifact hash changed`.

Scoring, gates, packaging and every validator continue to run on the M5 with
`--profile m5`.

## 6. Validating a linux_gpu-trained result

`validate_phase2_scale.py` reads the trained-on profile from the training
results (`training_profile`, `m5` when absent) and derives its expected matrix
backend with `matrix_backend(config, scale, training_profile)`, so a 20M run
fitted on the box is checked against `streamed_in_memory_quantile` rather than
the M5's `external_memory_quantile`. The validation output also records an
always-passing `"matrix backend profile amendment"` check whose `detail`
carries `training_profile`, `backend`, `m5_backend` and `differs_from_m5`, so a
linux_gpu-trained result is auditable against what the M5 would have produced
without failing the gate over an intentional backend difference. No manual
step is needed here beyond running `validate_phase2_scale.py --profile m5`
as usual on the M5 once the results and models are copied back.
