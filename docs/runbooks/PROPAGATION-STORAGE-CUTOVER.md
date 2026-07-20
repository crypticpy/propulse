# Propagation partition and WSPR compaction cutover

This runbook covers Phases 3 and 4 of the retention plan. The migrations create
inactive native-range shadow stores for spots and WSPR observations and an
inactive PostgreSQL-array WSPR feature candidate. Every control starts in
`legacy`; creating the schema does not switch a reader, stop a legacy writer,
or authorize retirement. Candidate activation remains conditional on measured
production receipts.

## Rollback-only benchmarks

The archive worker exposes two bounded benchmarks. Both enforce a row cap and
a 48-hour range cap, verify parity, and roll the transaction back. Partition
benchmarks use temporary tables by default. A selection-quality partition
receipt requires `--representative`, which uses ordinary rollback-only tables
to measure real WAL; rollback does not erase generated WAL. Receipts contain no
callsigns or raw observations.

```bash
PYTHONPATH=archive-worker python -m propagation_archive benchmark-partition \
  --dataset spot \
  --range-start 2026-07-17T00:00:00Z \
  --range-end 2026-07-19T00:00:00Z \
  --max-rows 5000000 \
  --repetitions 30 \
  --representative \
  --receipt /private/receipts/spot-partition.json

PYTHONPATH=archive-worker python -m propagation_archive benchmark-partition \
  --dataset wspr \
  --range-start 2026-07-18T00:00:00Z \
  --range-end 2026-07-19T00:00:00Z \
  --max-rows 5000000 \
  --repetitions 30 \
  --representative \
  --receipt /private/receipts/wspr-partition.json

PYTHONPATH=archive-worker python -m propagation_archive benchmark-wspr \
  --range-start 2026-07-18T00:00:00Z \
  --range-end 2026-07-19T00:00:00Z \
  --max-rows 5000000 \
  --repetitions 30 \
  --receipt /private/receipts/wspr-compaction.json
```

The WSPR receipt compares the existing row store with parallel PostgreSQL
arrays and immutable hour/band Parquet plus a Railway memory cache. It records
exact cell parity, build time, p50/p95, bytes per path, object requests, and
missing/corrupt-object behavior. `recommendation_eligible` remains false below
100,000 path cells or 25 lookup groups; small local fixtures are codec tests,
not selection evidence.

Partition receipts record insert, settled aggregate, API-shaped read, binary
archive stream, partition detach/drop, and WAL metrics. A non-representative
temporary-table receipt has `wal_bytes: null` and cannot satisfy the production
cutover gate.

## Candidate selection gate

Select a candidate only after receipts cover peak and ordinary hours, all HF
bands, at least one Railway cold start, and the current concurrency target.
Record the following in the PR that freezes the schema:

- row, index, and compressed bytes per path;
- build and dual-write duration;
- lookup p50/p95 and cold-start p95;
- object requests and bounded cache memory;
- exact H-1/H-2/H-3/H-24 response parity;
- behavior for a missing object, corrupt hash, stale watermark, and cache miss;
- rollback owner and the last safe rollback point.

No result from a tiny fixture may be used to select a candidate.

Run the authenticated Railway concurrency check for both serving products with
request bodies appropriate for the production account. Request bodies and the
bearer token are never written to the receipt:

```bash
export PROPULSE_LOAD_TEST_TARGETS='[
  {"name":"nowcast","url":"https://PREDICTOR/nowcast","body":{}},
  {"name":"reachmap","url":"https://PREDICTOR/reach-map","body":{}}
]'
export PROPULSE_LOAD_TEST_BEARER_TOKEN='REDACTED'
export PROPULSE_LOAD_TEST_CONCURRENCY=8
export PROPULSE_LOAD_TEST_REQUESTS=100
npm run check:propagation-load > /private/receipts/railway-serving-load.json
```

The harness requires Railway's environment and service identity variables,
public HTTPS endpoints, at least 25 requests per target, fully consumes bounded
response bodies, and records status counts and end-to-end p50/p95. A failed or
timed-out request makes the receipt fail. Retain a passing receipt with the WSPR
reader-gate record; do not activate compact reads from a local or M5 result.

The current versioned serving implementation is `postgres_arrays_v1`. A
representative receipt may record `parquet_cache_v1` as the winner, but that
result intentionally cannot activate the array cutover. Keep row form
authoritative and ship a separately reviewed Parquet/cache serving migration if
Parquet wins. The database refuses to reinterpret one candidate as the other.

## Partitioned-table cutover

1. Apply migrations `20260719003000` through `20260719004200`. They freeze
   daily `spot_history_partitioned_v1`, hourly
   `wspr_observations_partitioned_v1`, and hourly
   `wspr_path_hourly_compact_v1` schemas.
2. Pre-create the bounded hot window with
   `ensure_propagation_hot_partitions` and `ensure_wspr_compact_partitions`.
   Keep the legacy writers and readers authoritative.
3. Backfill the required hot window through an indexed keyset cursor. Reconcile
   count, min/max time, provider counts, and duplicate keys per partition.
4. Enable dual write for one collector replica. A failed shadow write must
   alert but must not interrupt the authoritative legacy write during the
   observation stage.
5. Compare insert latency, settled aggregations, archive exports, API reads,
   predictor lookups, and WAL growth.
6. Record exact reader receipts and advance only through
   `legacy -> dual_write -> shadow_read -> partitioned` for raw hot stores and
   `legacy -> dual_write -> shadow_read -> compact` for WSPR features. The
   transition RPCs reject skipped stages, unresolved shadow writes, missing
   backfill, missing parity, or missing load evidence.
7. Disable the legacy writer only after the read observation window passes.
8. Drop a legacy range only when its archive manifest is sealed, restored,
   present in a fresh passing inventory, outside hot retention, and exactly
   reconciled.

Rollback means switching the reader flag back, re-enabling the legacy writer,
and replaying the bounded shadow-write ledger. The UI/API uses
`spot_history_live`; the collector and finalizer use audited ingest RPCs; the
predictor retains the stable `lookup_wspr_path_lags` contract. Never attempt a
blocking in-place rewrite of the high-volume source tables.

Run the transactional state-machine suite after every migration edit:

```bash
supabase db reset
npm run check:storage-cutovers
```

It proves default legacy authority, grants, bounded backfill, exact
reconciliation, global WSPR dedup, writer/read rollback, ordered four-lag
parity, compact numeric validation, and fail-closed transitions. Its synthetic
benchmark receipts prove gate mechanics only; they are not production
selection evidence.

## Compact WSPR dual read

Keep `lookup_wspr_path_lags` as the public service-role contract. The selected
implementation belongs behind that RPC or an equivalently versioned RPC. For
every frozen fixture and shadow request, compare the complete ordered response:
target grid, four probabilities, four availability flags, source watermark,
availability time, provider, transform version, and quality flags. Any mismatch
keeps the old reader authoritative and prevents row-form feature deletion.

The row-form archive and restore drill must remain usable through the rollback
window. `enable_wspr_row_form_retirement` additionally requires an exact sealed
and restored row-form manifest plus a fresh object inventory. Compact hourly
partitions and partitioned raw hot ranges can be dropped only through their
specialized retirement RPCs, which recheck authority, retention, exact range,
restore, inventory, and child row count in one transaction.
