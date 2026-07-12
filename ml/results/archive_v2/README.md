# Archive Proof V2 Results

Primary deliverable: [`REPORT.html`](REPORT.html), a self-contained technical
report with five visualizations, metric cards, audit tables, methodology,
limitations, and source details. It requires no server or network connection.

Supporting artifacts:

- `artifact.json`: canonical report input used to build `REPORT.html`.
- `dataset_manifest.json`: source inventory, filters, split boundaries, row
  counts, class rates, versions, and input inventory hash.
- `hf_results.json`: engine bakeoff, model metrics, calibration bins, per-band
  results, day-block bootstrap, and label agreement.
- `6m_results.json`: independent 6m bakeoff and model metrics.
- `validation.json`: automated data, split, model, and artifact checks.

Reproduce locally:

```bash
ml/.venv/bin/python ml/src/archive_v2/build_proof_dataset.py
ml/.venv/bin/python ml/src/archive_v2/train_proof.py --task hf
ml/.venv/bin/python ml/src/archive_v2/train_proof.py --task 6m
ml/.venv/bin/python ml/src/archive_v2/generate_report.py --deliver
ml/.venv/bin/python ml/src/archive_v2/validate_proof.py
```

The large Parquet datasets and model files are derived artifacts under ignored
`ml/data/` and `ml/models/` paths. The committed JSON metrics and manifest are
enough to audit the conclusions and rebuild the portable report.
