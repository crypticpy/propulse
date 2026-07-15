# Propagation Inference Service

The service exposes the V4 path/surface contract without accepting a raw shack
snapshot. Set `PROPULSE_MODEL_BUNDLE` to an approved serving manifest, then run:

```bash
ml/.venv/bin/uvicorn app:app --app-dir ml/service --host 127.0.0.1 --port 8000
```

Browser access defaults to `http://localhost:5173` and
`http://127.0.0.1:5173`. Set `PROPULSE_ALLOWED_ORIGINS` to a comma-separated
deployment allowlist; wildcard origins are intentionally unsupported.

Endpoints are `/v1/propagation/path`, `/surface`, `/models`, and `/health`.
When recent path history is older than two hours, inference selects the physics
profile and returns an explicit stale-data OOD flag. If no approved model is
loaded, prediction endpoints return `503`; the service never fabricates spots
or probabilities.

Serving manifests may declare a profile as a checksum-verified `single` model
or a `weighted_ensemble`. Ensemble components must use the same ordered feature
contract; weights must be non-negative and sum to one. Each component is scored
and calibrated independently before the frozen probability-space blend is
applied. The `/models` response exposes each profile kind.
