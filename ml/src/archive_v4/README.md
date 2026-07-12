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
