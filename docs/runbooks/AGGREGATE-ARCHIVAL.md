# Aggregate archival and DB growth guard

Lightweight, collector-hosted archival for `path_hourly_stats` plus a
database-size watchdog. Shipped 2026-08-29 (migration
`20260829234500_db_growth_guard_and_aggregate_archive.sql`, collector jobs
`db-size` and `path-archive`).

## Why this exists

Measured 2026-08-29: database 671 MB total, of which `path_hourly_stats` was
557 MB / 3.07M rows, growing ~75–80K rows/day (~430 MB/month, ~5 GB/year) with
**no retention of any kind**. The table is an append-only ML training
aggregate; the only live readers (NowCast/FutureCast hourly readers) use a
≤7-day window, and the late-spot aggregator catch-up is bounded to 7 days.
History older than that only matters for offline model training, so it belongs
in cheap object storage, not the hot database. `collector_health` (38 MB /
300K rows) is ops telemetry with no readers at all.

The heavyweight `archive-worker/` pipeline (sealed manifests, restore gates,
separate validation DB, five Railway cron services) remains **dormant and
untouched** — it was built for row-level spot data that no longer accumulates.
This path reuses its core safety idea (exports always run; deletes are gated
and verified) at a fraction of the operational weight.

## The three pieces

### 1. `collector_health` 30-day window (pg_cron)

Cron job `collector_health_30d_window` (`20 3 * * *`) deletes
`collector_health` rows older than 30 days. Same pattern as
`spot_history_two_hour_window`. No flags, no collector involvement.

### 2. DB size guard (collector job `db-size`)

Every `POLL_DB_SIZE_GUARD` (default 6 h) the collector calls the
service-role-only RPC `db_size_report()` and compares total database bytes
against `DB_SIZE_BUDGET_MB` (default 3072).

- Within budget → `db-size` reports `ok` and stays fresh on `/health`.
- Over budget → it reports `over-budget` **without refreshing freshness**, so
  `/health` degrades after the staleness window and Railway alerting catches
  it. The health message names the top three tables by size.

This is the "catch it if it starts over-accumulating" tripwire: it fires no
matter *which* table is responsible.

### 3. `path_hourly_stats` day archival (collector job `path-archive`)

Every `POLL_PATH_ARCHIVE` (default 1 h) the collector archives up to
`ARCHIVE_PATH_STATS_MAX_DAYS_PER_RUN` (default 2) complete UTC days that are
older than `ARCHIVE_PATH_STATS_HOT_DAYS` (default 90). The cap counts only
days that needed real work (an export and/or a prune); already-sealed days
needing neither are skipped for free, so exports keep advancing past the
sealed backlog while pruning is disabled. Per day:

1. **Export** — page all rows for the day (keyset on `id`, 1000/page) into a
   CSV, gzip it, and upload to the private `propagation-archives` bucket at
   `aggregates/path_hourly_stats/v1/year=YYYY/month=MM/path_hourly_stats-<day>.csv.gz`.
2. **Verify** — download the object back and compare SHA-256 against the
   uploaded bytes, then gunzip and recount rows. Any mismatch throws; nothing
   downstream runs.
3. **Seal** — only after verification, write
   `path_hourly_stats-<day>.manifest.json` beside it (`rowCount`, `sha256`,
   `sizeBytes`, `columns`, `exportedAt`). A sealed day is never re-exported.
4. **Prune (gated)** — only when `ARCHIVE_PATH_STATS_PRUNE=true`. The
   collector first re-downloads the archived object and checks it still
   hashes to the manifest's SHA-256, then calls the RPC
   `prune_archived_path_hourly_stats(day, manifest.rowCount)`. The function
   re-counts live rows inside the database and **refuses to delete unless
   the live count exactly equals the manifest count** (rows added after
   archiving, a partial prior delete, or a wrong manifest all abort), and
   after deleting it verifies the deleted row count too — a mismatch from a
   concurrent write raises and rolls the whole delete back. It runs with a
   function-level 120 s statement timeout (a full day is ~80K rows) and is
   executable by `service_role` only.

Export and prune are decoupled: with the flag off (the default), archives
still accumulate in storage and the hot table keeps everything — turning the
flag on later prunes already-sealed days with no re-export.

## Environment variables (Railway collector service)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DB_SIZE_BUDGET_MB` | `3072` | `/health` degrades when the DB exceeds this |
| `POLL_DB_SIZE_GUARD` | `21600` (s) | db-size check interval |
| `ARCHIVE_PATH_STATS_HOT_DAYS` | `90` | days kept in the hot table |
| `ARCHIVE_PATH_STATS_PRUNE` | `false` | **fail-closed** delete gate; only the literal string `true` enables |
| `ARCHIVE_PATH_STATS_MAX_DAYS_PER_RUN` | `2` | archive pass day cap |
| `POLL_PATH_ARCHIVE` | `3600` (s) | archive pass interval |

Nothing needs to be set for the safe default behavior (guard on, exports on,
deletes off).

## Arming deletion

1. Confirm archives are sealing: list
   `propagation-archives/aggregates/path_hourly_stats/v1/` and spot-check a
   manifest against its `.csv.gz` (see restore below).
2. Set `ARCHIVE_PATH_STATS_PRUNE=true` on the Railway collector service and
   redeploy.
3. Watch the collector logs for `Pruned archived path_hourly_stats day` lines
   and `/health` for a healthy `path-archive` source.

To pause deletion at any time, unset the variable or set it to anything other
than `true`. Exports continue unaffected.

Timeline note: data starts 2026-07-16, so with the default 90-day hot window
the first archivable day arrives ~2026-10-14. Steady state for the hot table
is ~90 days ≈ 1.2–1.3 GB; tighten `ARCHIVE_PATH_STATS_HOT_DAYS` if that is too
much (live readers only need 7).

## Restoring a day for training

Archives are plain gzipped CSV with a header row (12 columns, listed in the
manifest). To pull a day locally:

```bash
# via supabase-js/service key, or the dashboard — bucket is private
# then:
gunzip path_hourly_stats-2026-07-16.csv.gz
# verify against the manifest:
shasum -a 256 <original .csv.gz>   # must equal manifest.sha256
```

For bulk training loads, DuckDB reads the gzipped CSVs directly:

```sql
SELECT * FROM read_csv_auto('path_hourly_stats-*.csv.gz');
```

Re-inserting into Postgres is a plain `\copy` per file if ever needed; the
CSV column order matches the table.

## Failure modes

- **Upload/verify/seal fails** → the pass throws, the `path-archive` health
  source reports `error`, and the day is retried next pass. No manifest means
  no prune, ever. A stale unsealed object left by an interrupted run (object
  exists, no manifest) is overwritten and re-verified automatically on the
  next pass — only a manifest seals a day. A corrupt or wrong-shape manifest
  is likewise treated as unsealed: the day is re-exported, re-verified, and
  re-sealed.
- **Archived object corrupted after sealing** → the pre-prune hash check
  fails and nothing is deleted; the hot rows remain the copy of record until
  the archive is repaired (delete the bad object + manifest and let the day
  re-export).
- **Prune RPC count mismatch** → the RPC raises and deletes nothing; the day
  stays hot and sealed. Investigate whether rows were backfilled after
  sealing (should be impossible: the aggregator catch-up window is 7 days,
  the hot window 90).
- **DB over budget** → `db-size` goes stale on `/health`. Check the message
  for the offending tables; if it is `path_hourly_stats`, shorten the hot
  window or raise `ARCHIVE_PATH_STATS_MAX_DAYS_PER_RUN` temporarily to catch
  up.
