# Propagation archive operations

## Safety state after migration

The migration creates a private `propagation-archives` bucket and leaves global
archive export, global pruning, every dataset archive switch, and every dataset
prune switch disabled. Applying the migration does not reduce retention or
delete historical data.

Run the local codec/schema gate before deployment:

```bash
npm run check:archive
npm run check:production-boundaries
supabase db reset
npm run check:archive-integration
```

## Phase 0 baseline

1. Deploy the migration while every control remains false.
2. Run `propagation_archive report --include-exact-rates` once per day for seven
   days. Record the Supabase provisioned-disk value separately because
   PostgreSQL cannot read the billing provision directly.
3. Run `propagation_archive inventory` and compare `database_cron` with every
   Railway scheduled job. Update the deletion inventory for any mismatch.
4. Confirm the production-boundary check passes and inspect Railway variables;
   no production URL, command, or mounted path may target the M5.

The exact-rate report deliberately scans seven-day indexed windows. Schedule
it away from collector peaks. Lightweight daily health reports may omit
`--include-exact-rates`; the weekly cost receipt requires one exact-rate report.

## Enable archive export without pruning

Use service-role SQL and retain the reason in the audit ledger:

```sql
select public.set_propagation_archive_controls(
  true, false, 'Phase 1 export deployment; pruning remains disabled'
);
select public.set_propagation_archive_dataset_controls(
  'spot_history_v1', true, false, 'Begin verified spot archive fixture'
);
```

Set `ARCHIVE_EXPORT_ENABLED=true` only on the archive worker. Do not set
`ARCHIVE_PRUNING_ENABLED` on the collector. Archive one aligned fixture, verify
its manifest is `sealed`, then restore it with a dedicated validation database
or validation-only PostgreSQL target. The restore schema is unlogged,
service-only, and rolled back after reconciliation.

Repeat for `spot_history_v1`, `wspr_observations_v1`,
`solar_snapshots_v1`, `path_hourly_stats_v1`, and
`forecast_payloads_v1`. Before any WSPR row-form retirement, also archive and
restore `wspr_path_features_v1` and `wspr_path_features_compact_v1`. A passing
receipt records each dataset restore gate.

## Pruning activation gate

Do not activate pruning merely because fixtures passed. Phase 0's seven-day
baseline must be complete, all five Phase 1 restore fixtures must pass, archive
lag and verification alerts must be live, and the plan's operational approval
must be recorded.

Enable one dataset at a time:

```sql
select public.set_propagation_archive_dataset_controls(
  'spot_history_v1', true, true, 'Approved after archive and restore gates'
);
select public.set_propagation_archive_controls(
  true, true, 'Approved bounded retention maintenance'
);
```

Only then set `ARCHIVE_PRUNING_ENABLED=true` on the collector. Each daily run
deletes at most one archive batch and one bounded batch from each reproducible
or operational class. Historical source ranges cannot be selected without a
sealed manifest.

Forecast collection uploads the exact upstream response body first to a
non-overwriting, content-addressed private object, downloads it, and verifies
its byte count and SHA-256 before recording parsed values or issuance metadata.
Postgres validates the base64 byte envelope against the same hash. Daily object
inventory treats these issuance objects as registered evidence, not orphans.

Forecast raw JSON has an additional switch because clearing the redundant hot
copy of evidence bytes is not ordinary row pruning. After its monthly payload manifest is sealed,
restored, and included in a fresh passing inventory, explicitly enable the
database control:

```sql
select public.set_propagation_forecast_compaction(
  true, 'Approved forecast payload archive transition: CHANGE-ID'
);
```

Then set `ARCHIVE_FORECAST_COMPACTION_ENABLED=true` on the collector. The
bounded compaction RPC retains hash, issue timing, parser/source metadata, the
private object locator, original byte count, and manifest foreign key while
clearing only `raw_payload`. Anonymous and authenticated roles cannot select
raw payloads or private object locators. Object deletion remains structurally
disabled until a deterministic sample specification, locked-evidence release,
and second-copy policy are implemented and approved.

The frozen sample and identity-free aggregate contract is documented in
`docs/runbooks/PROPAGATION-ARCHIVE-RELEASE-FORMAT.md`; it explicitly does not
enable object deletion.

## Emergency stop and incident handling

Set `ARCHIVE_PRUNING_ENABLED=false` first. Then disable the database control:

```sql
select public.set_propagation_archive_controls(
  true, false, 'Emergency retention stop: INCIDENT-ID'
);
```

An upload, checksum, schema, count, bound, aggregate, watermark, read, or
restore failure is fail-closed. Leave failed objects private, preserve the
manifest and lifecycle audit, and investigate before retrying. Never overwrite
a content-addressed object or manually mark a manifest sealed.

## Operational schedules and alerts

Create five independent Railway cron services from the same Dockerfile and set
their custom Config-as-Code paths as follows:

| Service | Config path | UTC schedule | Command |
|---|---|---|---|
| archive | `/archive-worker/railway.json` | `15 * * * *` | `run-due` |
| inventory | `/archive-worker/railway.reconcile.json` | `10 3 * * *` | `reconcile` |
| restore | `/archive-worker/railway.restore.json` | `0 4 * * 0` | `restore-due` |
| health | `/archive-worker/railway.health.json` | `*/15 * * * *` | `health` |
| report | `/archive-worker/railway.report.json` | `30 4 * * 1` | `report --include-exact-rates` |

The restore service requires a genuinely separate
`ARCHIVE_VALIDATION_DATABASE_URL`; the CLI rejects the source database as its
target. It checks the latest clean manifest for every dataset and runs a signed
drill when the 30-day cadence is due. Every command is one-shot and exits after
closing its database and storage clients. A failed
inventory reconciliation is read-only: it reports missing, orphaned, and
size-mismatched objects but never deletes them. Keep the affected dataset's
prune switch off until the discrepancy is resolved and a passing reconciliation
is recorded.

The collector's guarded retention task remains a separate long-running service
loop and runs hourly with a once-per-day database guard. It cannot delete
historical rows unless both archive controls, restore gates, and the collector
environment acknowledgement agree.

For the weekly report, first capture exact rates, then run `cost-forecast` with
the current provisioned database size and disk limit from the Supabase usage
dashboard. The receipt records pinned pricing, allowances, missing inputs,
current object bytes, a 90-day ordinary-object projection, and hot-store
projections at the requested scale. Warning and critical disk thresholds are
70% and 85%. Do not use `pg_database_size` as if it were provisioned billing
disk; the command labels that fallback as an incomplete proxy.

## Locked evidence and disaster recovery

New archives always start `ordinary`. Apply a research or publication hold only
through the audited transition command and a repository-safe protocol
reference:

```bash
python -m propagation_archive set-lifecycle \
  --manifest-id MANIFEST_UUID \
  --lifecycle-class research_locked \
  --reason 'Prospective window locked before scoring' \
  --reference 'hold:PROTOCOL-WINDOW-ID'
```

Copy the immutable object to a second private store or offline Projects-drive
location, then verify the copied file byte-for-byte and record a signed receipt:

```bash
python -m propagation_archive verify-replica \
  --manifest-id MANIFEST_UUID \
  --replica-path /private/replica/part-HASH.parquet.zst \
  --target-label offline-projects-dr \
  --receipt /private/receipts/replica-MANIFEST_UUID.json
```

Only a hash of the replica locator is persisted; the private path is not stored
in Postgres. `replica-health` is critical for every locked or publication-held
manifest without a signed, read-verified second copy. Releasing a hold requires
a `release:...` reference. These optional copy/verification tasks never serve
production reads and do not make the M5 a scheduler or runtime dependency.

For the production independence drill, power the M5 off, set
`PROPULSE_CLOUD_SMOKE_URLS` to at least the Vercel application/API health URL
and Railway predictor health URL, and run `npm run check:cloud-smoke` from a
separate cloud runner. The command refuses loopback, private-network, `.local`,
`.lan`, and M5-named targets. Preserve its JSON receipt with the release
evidence.
