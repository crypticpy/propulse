# Archive V4 Execution

V4 reuses the audited V3 DuckDB/Polars transformations under an isolated
`archive_v4` namespace. The wrapper applies machine-specific resource limits.

```bash
# Validate the frozen config and inspect remote object sizes without reading rows
npm run check:v4-preregistration
ml/.venv/bin/python ml/src/archive_v4/inventory_remote.py

# Run one resumable stage on this 36 GB M3
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py download --profile local-m3
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py bronze --profile local-m3

# Run the complete data-preparation sequence on the 128 GB M5
ml/.venv/bin/python ml/src/archive_v4/run_pipeline.py prepare --profile m5
```

`prepare` does not train or score a model. V4 intentionally does not invoke the
V3 trainer because that trainer reads the test split during its normal run. A
separate V4 validation-only trainer and explicit locked scorer enforce the new
test protocol.

Environment overrides:

- `PROPULSE_ML_DATA_ROOT`
- `PROPULSE_ML_MODEL_ROOT`
- `PROPULSE_ML_TEMP_ROOT`
- `PROPULSE_DUCKDB_THREADS`
- `PROPULSE_DUCKDB_MEMORY_LIMIT`
- `PROPULSE_ARCHIVE_NAMESPACE`

## FutureCast V1

FutureCast is a separate direct-horizon experiment, not a recursive extension
of frozen NowCast A6. The preregistered method is
[`ml/FUTURECAST-V1-PROTOCOL.md`](../../FUTURECAST-V1-PROTOCOL.md), with frozen
parameters in [`ml/config/futurecast_v1.json`](../../config/futurecast_v1.json).

The M5-only pipeline is:

1. `export_futurecast_sources.py`: read-only server-cursor export of immutable
   NOAA forecast values and identity-free WSPR aggregate features;
2. `build_futurecast_examples.py`: Polars +3/+6/+12/+24-hour examples with
   legal issue-time history, geometry, weather ages, chronological splits, and
   duplicate/leakage gates;
3. `train_futurecast.py`: eight external-memory XGBoost fits using two fresh
   spawn children with nine threads each, train-only climatology, and guarded
   isotonic calibration;
4. `build_futurecast_p533.py`: deterministic paired P.533 diagnostic driven by
   the same issued F10.7 values, with gate labels unread during generation;
5. `score_futurecast_gate.py`: 250,000-row streamed one-shot scoring against
   persistence, climatology, and weather-only baselines, plus issue-day
   bootstrap, calibration, supported-band, integrity, resource, and
   production-evidence gates.

Synthetic lineage is immutable and can never authorize release. The complete
90-day M5 engineering proof, metrics, limitations, five charts, and three audit
tables are in the
[FutureCast synthetic report](../../results/propagation_v4/futurecast_v1_synthetic_e2e/REPORT.html).
Genuine training remains withheld until the collector records the first 90
consecutive common legal issuance days and all valid-time WSPR outcomes mature.
