# Propagation archive worker

This Railway one-shot worker implements the archive-before-delete contract in
`ml/PROPAGATION-DATA-RETENTION-AND-ARCHIVE-PLAN.md`. It never deletes source
rows. It exports one aligned partition through a server-side PostgreSQL cursor,
writes bounded Arrow batches into Parquet with Zstandard compression, uploads
to the private `propagation-archives` bucket, downloads and hashes the remote
bytes, reads the Parquet file, reconciles counts/bounds/aggregates, and only
then asks PostgreSQL to seal the manifest.

The separate collector retention job can delete a bounded batch only when all
of these controls agree:

1. Railway has `ARCHIVE_PRUNING_ENABLED=true`.
2. `propagation_archive_controls.pruning_enabled` is true.
3. The dataset's `prune_enabled` control is true.
4. A sealed manifest covers the complete source range.
5. The hot-retention interval has elapsed.
6. A passing isolated restore receipt exists for that dataset.

All switches default to false. See
`docs/runbooks/PROPAGATION-ARCHIVE-OPERATIONS.md` for activation and rollback.

## Commands

```bash
PYTHONPATH=archive-worker python -m propagation_archive self-test
PYTHONPATH=archive-worker python -m propagation_archive inventory
PYTHONPATH=archive-worker python -m propagation_archive reconcile
PYTHONPATH=archive-worker python -m propagation_archive health
PYTHONPATH=archive-worker python -m propagation_archive report --include-exact-rates
PYTHONPATH=archive-worker python -m propagation_archive benchmark-partition --help
PYTHONPATH=archive-worker python -m propagation_archive benchmark-wspr --help
PYTHONPATH=archive-worker python -m propagation_archive set-lifecycle --help
PYTHONPATH=archive-worker python -m propagation_archive verify-replica --help
PYTHONPATH=archive-worker python -m propagation_archive replica-health
PYTHONPATH=archive-worker python -m propagation_archive restore-due --help
PYTHONPATH=archive-worker python -m propagation_archive archive \
  --dataset spot_history_v1 \
  --range-start 2026-07-01T00:00:00Z \
  --range-end 2026-07-02T00:00:00Z
PYTHONPATH=archive-worker python -m propagation_archive restore \
  --manifest-id 00000000-0000-0000-0000-000000000000 \
  --validation-target-label isolated-validation
```

Production archive commands require `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ARCHIVE_EXPORT_ENABLED=true`, and a full commit in
`RAILWAY_GIT_COMMIT_SHA`. Restore also requires
`ARCHIVE_VALIDATION_DATABASE_URL` and an `ARCHIVE_RECEIPT_HMAC_KEY` of at least
32 bytes; unsigned CLI restore receipts are rejected. Put secrets in Railway
variables, never command-line arguments or Git.

After `supabase db reset`, the disposable local integration gate exercises the
five required foundation datasets plus the row-form and compact WSPR feature
stores through export, immutable object verification, manifest sealing,
isolated restore, signed receipt creation, and inventory reconciliation:

```bash
npm run check:archive-integration
```

The command refuses non-loopback database URLs and a missing explicit
disposable-database acknowledgement. It intentionally leaves fixture manifests
in the local database, so reset the local stack before running it again.

Partition and WSPR compact-store selection is measurement-gated. The benchmark
commands create temporary candidates and always roll back; see
`docs/runbooks/PROPAGATION-STORAGE-CUTOVER.md` before using a receipt to make a
schema choice.

Railway cron services use the independent config files `railway.json`,
`railway.reconcile.json`, `railway.restore.json`, `railway.health.json`, and
`railway.report.json`.
Set each file as that service's custom Config-as-Code path. Scheduled restores
require a separate validation database and signed receipts; source and
validation database identities are rejected when they match.

The weekly cost receipt requires a recent exact-rate storage report and the
provisioned-disk values copied from the Supabase usage dashboard:

```bash
PYTHONPATH=archive-worker python -m propagation_archive report --include-exact-rates
PYTHONPATH=archive-worker python -m propagation_archive cost-forecast \
  --scale-factor 10 \
  --provisioned-database-gib 16 \
  --database-disk-limit-gib 20 \
  --alternative-storage-usd-per-gib-month 0.01 \
  --alternative-requests-usd-month 4.50 \
  --alternative-egress-usd-month 0 \
  --alternative-replication-usd-month 3.00 \
  --alternative-operations-usd-month 25.00 \
  --receipt /private/receipts/weekly-cost.json
```

Pricing inputs are pinned and disclosed in every database receipt; the result
is an operational forecast, not live billing truth.
