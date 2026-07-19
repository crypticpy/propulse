# Propagation Data Retention and Archive Plan

> Status, 2026-07-19: proposed implementation plan. No retention reduction or
> historical purge is authorized until the archive, verification, and restore
> gates in this document pass.
>
> North star:
> [`PERSONALIZED-PROPAGATION-V4-PLAN.md`](PERSONALIZED-PROPAGATION-V4-PLAN.md).
> Product/cloud plan:
> [`PROPAGATION-PRODUCT-CLOUD-INTEGRATION-PLAN.md`](PROPAGATION-PRODUCT-CLOUD-INTEGRATION-PLAN.md).
> Live feature contract:
> [`NOWCAST-LIVE-FEATURE-PIPELINE.md`](NOWCAST-LIVE-FEATURE-PIPELINE.md).
> FutureCast protocol:
> [`FUTURECAST-V1-PROTOCOL.md`](FUTURECAST-V1-PROTOCOL.md).

## Decision

Use Supabase Postgres as the small, queryable hot store required by the live
Propulse product. Move closed historical partitions to compressed, private
object storage before deleting them from Postgres. Preserve compact aggregates,
archive manifests, model metadata, evidence watermarks, and consent-controlled
records for their required lifetimes.

Production responsibilities are:

| Platform | Responsibility |
|---|---|
| Vercel | Browser application and authenticated same-origin API proxies |
| Railway collector | Source collection, aggregation, archive export, verified pruning, and lifecycle monitoring |
| Railway predictor | NowCast, StationCast, ReachMap, and FutureCast inference |
| Supabase Postgres | Current operational inputs, compact aggregates, manifests, user data, and consented evidence |
| Private object storage | Compressed historical observations, forecast payloads, and model bundles |
| M5 Max | Offline training, locked scoring, report generation, and optional disaster-recovery copies only |

The deployed system must not depend on the M5 being powered on, reachable, or
running a scheduled process. No Vercel, Railway, or Supabase configuration may
point at the M5.

## Goals

1. Bound Supabase database growth without weakening live predictions.
2. Preserve the evidence needed to reproduce model and research conclusions.
3. Make deletion conditional on a verified, restorable archive.
4. Reduce PostgreSQL row, index, WAL, vacuum, and backup pressure.
5. Bound object-storage growth with explicit lifecycle classes.
6. Keep identity-bearing radio observations private.
7. Produce measurable storage, archive-lag, and restore health signals.

## Non-goals

- Do not change the frozen A6 model or its calibration.
- Do not use a generic cost purge to override research consent or preregistration.
- Do not publish callsigns, precise station locations, or private user records.
- Do not make the M5 a production collector, scheduler, or serving dependency.
- Do not assume that deleting rows immediately lowers provisioned database disk.

## Current Production Snapshot

The following are approximate PostgreSQL planner estimates observed on
2026-07-19. They are suitable for prioritization, not billing reconciliation.
Exact table, TOAST, and index sizes must be captured with
`pg_total_relation_size` before and after implementation.

| Table | Approximate rows | Observed coverage | Assessment |
|---|---:|---|---|
| `spot_history` | 15,573,534 | about 3.3 days | High-growth raw data |
| `wspr_observations_rolling` | 8,442,369 | about 32 hours | Expected rolling volume, expensive schema footprint |
| `wspr_path_hourly_features` | 4,966,371 | about 47 hours | Largest structural optimization opportunity |
| `path_hourly_stats` | 237,607 | about 3.2 days | Compact enough for a medium hot window |
| `band_hourly_stats` | 14,092 | since 2026-02-10 | Small; preserve long term |
| `collector_health` | 7,065 | about 3.3 days | Short operational history only |
| `solar_snapshots` | 810 | about 3.3 days | Small and useful for outcome joins |
| `satellite_tle` | 610 | current collection | Current snapshot data |
| Forecast payloads and values | 906 | about 4 days | Small but immutable evidence |
| Propagation evidence and telemetry tables | under 2,500 combined | current beta | Small and policy controlled |

Observed ingestion rates imply approximately 4.7 million raw spot rows per day,
6.3 million WSPR observation rows per day, and 2.5 million WSPR path-feature rows
per day. These rates must be recalculated from sealed archive manifests after the
pipeline is deployed.

## Data Classes

### Hot operational data

This data must remain in Postgres because the product or predictor queries it
with low latency:

- the newest solar and geomagnetic state;
- recent spot observations used by current UI and settled aggregation;
- causal WSPR H-1, H-2, H-3, and H-24 path features and their watermarks;
- current collector status and aggregation watermarks;
- active, unexpired propagation surfaces;
- current and previous model-version metadata;
- active consent and unexpired research records.

### Compact long-lived data

This data is inexpensive and valuable enough to keep queryable:

- `band_hourly_stats`;
- recent `path_hourly_stats`;
- archive manifests and restore receipts;
- `collector_outages` and source-status state;
- WSPR feature watermarks;
- propagation model versions and issuance metadata;
- aggregate, identity-free beta telemetry;
- research health and alert history.

### Cold historical data

This data does not need a row-level online query after its hot window closes:

- raw spot observations;
- raw authorized WSPR observations;
- older WSPR path features;
- older path-hour aggregates;
- older solar snapshots;
- raw official forecast payloads and older parsed forecast values;
- locked prospective and publication evidence snapshots.

Cold data uses Parquet with Zstandard compression unless the original byte
payload itself is required for evidence. Original forecast documents may be
stored as JSON or text alongside the normalized Parquet values.

### Reproducible caches

Expired `propagation_surface_cache` rows may be deleted without archival because
they can be reproduced from their request, model, and feature versions. Cache
metadata needed for an evidence record belongs in the prediction or issuance
record, not in the cache.

## Target Retention Matrix

| Data | Postgres hot retention | Cold retention | Final disposition |
|---|---|---|---|
| `spot_history` | 48 hours after event time and aggregation settlement | Full raw for 90 days by default | Keep locked research windows; otherwise retain compact aggregates and a deterministic research sample |
| `wspr_observations_rolling` | 30 hours by receipt time; never below the 27-hour causal minimum | Only authorized or locked research windows | Delete ordinary raw partitions after features and manifests pass |
| `wspr_path_hourly_features` | 30 hours | Sealed hour/band partitions where research requires them | Delete superseded row-form data after compact-store parity passes |
| `band_hourly_stats` | Indefinite | Optional annual snapshot | Retain in Postgres while small |
| `path_hourly_stats` | 120 days | Monthly partitions | Retain archive for approved research lifecycle |
| `solar_snapshots` | 120 days | Monthly partitions | Retain archive for model and forecast evaluation |
| `space_weather_forecast_payloads.raw_payload` | Metadata and hash only after archive | Original payload retained through evaluation/publication lifecycle | Apply documented research lifecycle after publication |
| `space_weather_forecast_values` | 120 days | Monthly partitions | Preserve locked issuance windows |
| `satellite_tle` | Latest set plus 7 days | None by default | Delete older reproducible copies |
| `collector_health` | 7 days | None by default | Preserve discrete outages separately |
| `collector_outages` | Indefinite | Optional annual snapshot | Retain while small |
| `collector_source_status` | Current state | None | Upsert current state |
| Aggregation/feature watermarks | Indefinite | Include in research snapshots | Retain while small |
| `propagation_surface_cache` | Until `expires_at` | None | Delete expired rows continuously |
| Model bundles | Current plus previous rollback release | Versioned private objects | Move public approved versions to open release assets; delete unreferenced internal bundles |
| Predictions, attempts, outcomes | Through each consent row's `retention_until` | Only as allowed by consent and protocol | Use the existing consent-aware pruning function |
| Aggregate beta telemetry | 365 days initially | Annual aggregate | Review after a full beta year |

The first 90-day raw archive policy is a budget, not an instruction to discard a
locked scientific window. A manifest marked `research_locked` or
`publication_hold` is exempt from lifecycle deletion until the corresponding
protocol releases it.

## What The Predictor Actually Needs

The Railway inference service does not need years of raw records in Postgres.

### NowCast

- latest fresh solar/geomagnetic snapshot;
- current model bundle and manifest;
- causal WSPR features for H-1, H-2, H-3, and H-24 when an authorized source is
  available;
- current station and path inputs supplied through the authenticated request;
- physics fallback when live features are missing or stale.

### StationCast and ReachMap

- NowCast inputs;
- server-authoritative equipment and location parameters needed for the request;
- short-lived computed surfaces, which may expire and be recomputed.

### FutureCast

- issued official forecast values available at prediction time;
- the matching raw issuance hash and immutable archive locator;
- current/frozen FutureCast model version;
- later observations used only by the separately controlled scorer.

The long archive is an offline training and evaluation asset. It belongs in
partitioned object storage and is streamed by Polars, DuckDB, or Arrow during
training rather than loaded into the serving database.

## Archive Layout

Use a private bucket named `propagation-archives`. Keep the object naming
independent of the storage vendor so the archive can later move to S3-compatible
storage without changing its logical contract.

```text
propagation-archives/
  <dataset>/
    schema=<schema_version>/
      year=<YYYY>/
        month=<MM>/
          day=<DD>/
            hour=<HH>/part-<content_sha256>.parquet.zst
```

Daily partitions are appropriate for ordinary spots and slow environmental
data. Hourly partitions are appropriate for WSPR volume and causal feature
evidence. Original forecast payloads use their issuance time and payload hash.

No user ID, email address, private equipment record, precise private location,
or service credential may appear in an object name.

## Archive Manifest Contract

Add a small service-role-only `propagation_archive_manifests` table containing:

| Field | Purpose |
|---|---|
| `id` | Stable manifest identifier |
| `dataset` | Versioned logical dataset name |
| `schema_version` | Reader compatibility boundary |
| `range_start`, `range_end` | Half-open archived source interval |
| `time_basis` | Event, receipt, issue, or capture time |
| `object_bucket`, `object_path` | Private object locator |
| `row_count` | Source/export reconciliation |
| `min_source_time`, `max_source_time` | Partition bounds validation |
| `source_counts` | Per-provider counts where applicable |
| `content_sha256` | Hash of uploaded bytes |
| `uncompressed_bytes`, `object_bytes` | Compression and cost accounting |
| `exporter_commit` | Exact implementation revision |
| `quality_flags` | Explicit exceptions or warnings |
| `lifecycle_class` | `ordinary`, `research_locked`, or `publication_hold` |
| `status` | `uploading`, `verified`, `sealed`, `restored`, or `failed` |
| `verified_at`, `sealed_at` | Deletion eligibility timestamps |

Use a uniqueness constraint over dataset, schema version, and time range. This
makes retries idempotent and prevents two objects from silently representing the
same partition.

## Archive-Before-Delete Protocol

For each closed partition, the Railway archive worker must:

1. Confirm aggregation and feature watermarks cover the entire source range.
2. Export through a bounded cursor or server-side stream.
3. Write a temporary Parquet object with an explicit schema.
4. Calculate row counts, source counts, time bounds, bytes, and SHA-256.
5. Upload to the private bucket using a non-overwriting content-addressed path.
6. Verify remote size and hash. For multipart objects, verify the reassembled
   bytes rather than assuming an ETag is a content hash.
7. Insert or update the manifest to `verified`.
8. Run a Parquet read test and required aggregate reconciliation.
9. Mark the manifest `sealed` only after all validation passes.
10. Delete only rows fully covered by a sealed manifest and older than the hot
    retention cutoff.
11. Delete in indexed keyset batches until time partitioning is deployed.
12. Record deleted counts and require them to match the eligible source count.

Any upload, hash, schema, count, watermark, or read failure stops deletion. An
archive job must be safe to restart after every step.

## PostgreSQL Design

### Time partitioning

Migrate the highest-volume tables to native range partitioning:

1. `spot_history` by `spotted_at`, daily partitions;
2. `wspr_observations_rolling` by `received_at`, hourly partitions;
3. the replacement WSPR hot feature store by `target_hour`, hourly partitions;
4. optionally `path_hourly_stats` by `hour`, monthly partitions.

Once a partition is sealed and outside retention, detach or drop it rather than
issuing millions of row deletes. Build and validate each migration with dual
writes or a bounded cutover; do not block collectors for a long table rewrite.

### Interim bounded deletion

Before partitioning, pruning must use an indexed primary-key/time keyset and a
bounded batch size. The current WSPR pruning function performs one unbounded
`DELETE`; replace it before attempting the existing backlog. Log duration,
deleted rows, remaining eligible estimate, and Postgres error code per batch.

### WSPR feature compaction

The current table creates one UUID and several text/index values for each
hour/band/transmitting-grid/receiving-grid combination. NowCast only needs four
recent lag partitions.

Replace it with a versioned compact representation keyed approximately by:

```text
(target_hour, band, tx_grid4, provider, transform_version, available_at)
```

The value contains sorted receiving grid identifiers and their success rates,
counts, and quality flags using compact arrays or a versioned binary payload.
Evaluate two candidates before migration:

1. compact Postgres arrays suitable for one indexed lookup per transmitting
   grid and band;
2. immutable hour/band Parquet objects with a small Postgres partition index and
   bounded Railway memory cache.

Select the candidate using measured lookup p50/p95, cold-start latency, object
requests, compressed bytes per path, build time, and failure behavior. Keep the
existing RPC response contract stable. Dual-read old and new stores and require
exact parity on frozen test fixtures before deleting row-form features.

## Object Lifecycle

Moving everything to object storage forever merely moves the cost curve. Apply
these lifecycle rules:

- `ordinary`: retain full raw objects for 90 days, then retain compact hourly
  aggregates and a deterministic, documented research sample;
- `research_locked`: retain full objects until the protocol evaluation and
  audit are complete;
- `publication_hold`: retain the exact cited evidence for the documented open
  research preservation period;
- `reproducible`: delete after its short operational window if the source,
  transform, and checksum-bound inputs can recreate it;
- `model_release`: keep current, previous rollback, and publicly cited bundles.

Lifecycle deletion requires a manifest state transition and an audit record.
Bucket-wide age rules alone must not delete locked evidence.

Supabase Storage objects are not included in database backups. Keep a second
checksum-verified copy of locked or publication evidence in another private
object store or offline Projects-drive archive. That copy is disaster recovery,
not a production runtime dependency.

## Privacy and Research Boundaries

- Treat public-source callsigns and grid pairs as identity-bearing data.
- Keep raw observation archives private and service-role-only.
- Do not place raw records in Git, reports, screenshots, or public model assets.
- Prefer identity-free aggregates for permanent retention and open research.
- Preserve provider attribution, retrieval time, source terms, and transform
  version in every manifest.
- Apply `prune_expired_propagation_research_data` to consented prediction,
  attempt, and outcome records. Do not replace it with generic table retention.
- Withdrawal and `retention_until` take precedence over archive convenience.
- Document any deterministic research sample algorithm before first use so it
  cannot be tuned after viewing outcomes.

## Scheduling and Failure Isolation

Run these as independent Railway jobs or guarded collector tasks:

| Job | Initial schedule | Failure behavior |
|---|---|---|
| Close aggregate watermarks | Existing hourly cadence | Leaves partition open |
| Archive WSPR partitions | Hourly, after settlement | No WSPR deletion |
| Archive spot partitions | Daily | No spot deletion |
| Archive forecast issuances | On collection plus daily reconciliation | Preserve Postgres payload |
| Verified retention prune | Daily | Delete sealed ranges only |
| Expired cache prune | Hourly | Cache grows temporarily |
| Consent-aware research prune | Daily | Preserve user evidence temporarily |
| Archive inventory reconciliation | Daily | Alert and suspend affected lifecycle deletion |
| Restore drill | Monthly | Open incident; do not delete affected dataset partitions |
| Storage report | Weekly | Alert operations |

Use an advisory lock or lease row so overlapping Railway replicas cannot archive
or prune the same range concurrently.

## Monitoring and Budgets

Publish identity-free operational metrics for:

- Postgres data, TOAST, and index bytes by high-volume table;
- estimated and exact row counts where practical;
- rows ingested, archived, and deleted per dataset;
- oldest unarchived closed partition;
- oldest hot row and retention-lag hours;
- object bytes by dataset and lifecycle class;
- compression ratio and archive throughput;
- failed archive, hash, restore, and prune attempts;
- unsealed manifest count and age;
- Postgres dead tuples, autovacuum age, and disk headroom;
- predictor WSPR feature hit rate and fallback rate;
- restore-drill age and result.

Initial alert thresholds:

| Signal | Warning | Critical |
|---|---:|---:|
| Closed partition archive lag | 6 hours | 24 hours |
| Retention prune lag | 12 hours | 48 hours |
| Unsealed upload age | 2 hours | 6 hours |
| Restore drill age | 35 days | 45 days |
| Database provisioned disk | 70% | 85% |
| Archive object verification failures | 1 | 3 consecutive |
| WSPR hot history | over 33 hours | over 48 hours |
| Raw spot hot history | over 60 hours | over 72 hours |

## Cost Model

As of 2026-07-19, Supabase documents an 8 GB database-disk allowance and a
100 GB file-storage allowance on Pro. Published overage prices are approximately
`$0.125/GB-month` for database disk and `$0.0213/GB-month` for object storage.
Object storage is therefore materially cheaper for cold records, while Postgres
also pays index, TOAST, WAL, vacuum, and backup overhead.

References:

- Supabase pricing: <https://supabase.com/pricing>
- Storage pricing: <https://supabase.com/docs/guides/storage/pricing>
- Database disk usage: <https://supabase.com/docs/guides/platform/manage-your-usage/disk-size>
- Database size: <https://supabase.com/docs/guides/platform/database-size>
- Data deletion: <https://supabase.com/docs/guides/database/postgres/data-deletion>
- Disk behavior after deletion: <https://supabase.com/docs/guides/troubleshooting/disk-size-not-shrinking-after-deleting-data-135390>
- Backups: <https://supabase.com/docs/guides/platform/backups>
- Supabase Cron: <https://supabase.com/docs/guides/cron>

Deleting data makes space reusable inside PostgreSQL but does not normally
shrink already provisioned disk. After cleanup and vacuum/repack analysis, use a
supported Supabase database upgrade or migration to right-size the physical disk
if it has already expanded. Measure first; never run `VACUUM FULL` blindly on a
production high-write table.

## Implementation Phases

### Phase 0: Measure and freeze unsafe deletion

- [ ] Capture exact table, index, TOAST, dead-tuple, and provisioned-disk sizes.
- [ ] Record ingestion rates and oldest/newest timestamps for seven days.
- [ ] Inventory every scheduled deletion path and database cron job.
- [ ] Add an emergency `ARCHIVE_PRUNING_ENABLED=false` switch.
- [ ] Require archive sealing for new historical deletes.
- [ ] Confirm no production endpoint or job targets the M5.

**Exit gate:** complete baseline report and no unidentified deletion path.

### Phase 1: Archive foundation

- [ ] Create the private `propagation-archives` bucket.
- [ ] Add the manifest table, service-role policies, constraints, and lifecycle
  audit table.
- [ ] Implement streaming Parquet/Zstandard export with bounded memory.
- [ ] Implement remote hash, row-count, schema, and read verification.
- [ ] Implement idempotent Railway scheduling and advisory locking.
- [ ] Add a restore command and restore into an isolated validation schema.
- [ ] Complete one spot, WSPR, solar, path, and forecast restore fixture.

**Exit gate:** five dataset fixtures archive, verify, restore, and reconcile
without manual file repair.

### Phase 2: Stop uncontrolled growth

- [ ] Change raw spot hot retention from 7 days to 48 hours only after spot
  archives are sealed.
- [ ] Replace unbounded WSPR observation deletion with bounded keyset batches.
- [ ] Add explicit 30-hour WSPR observation and feature retention.
- [ ] Archive and safely remove the current stale WSPR backlog.
- [ ] Prune expired propagation surfaces.
- [ ] Keep health at 7 days and reduce TLE history to 7 days.
- [ ] Reconcile deleted counts against manifest eligibility after every run.

**Exit gate:** two continuous weeks within retention and archive-lag budgets,
with no prediction availability regression.

### Phase 3: Partition high-volume tables

- [ ] Design daily spot and hourly WSPR partitioned replacements.
- [ ] Benchmark insert, aggregate, API, archive, and drop performance.
- [ ] Backfill only the required hot window.
- [ ] Dual-write and reconcile during cutover.
- [ ] Switch readers and aggregators through a reversible deployment.
- [ ] Drop only sealed, out-of-retention legacy ranges.

**Exit gate:** partition drops replace high-volume delete loops and collector
latency remains within its current service budget.

### Phase 4: Compact WSPR live features

- [ ] Benchmark compact Postgres and Parquet/cache candidates.
- [ ] Freeze a versioned compact schema and migration fixture.
- [ ] Build the new feature writer and causal lookup reader.
- [ ] Dual-read H-1/H-2/H-3/H-24 and require response parity.
- [ ] Load-test NowCast and ReachMap concurrency on Railway.
- [ ] Retire row-form features only after rollback and restore drills pass.

**Exit gate:** exact feature parity, lower bytes per path, and acceptable cold and
warm p95 latency.

### Phase 5: Forecast and research lifecycle

- [ ] Move raw forecast payload bytes to content-addressed private objects.
- [ ] Keep issued metadata, SHA-256, timing, and object URI in Postgres.
- [ ] Archive parsed values after 120 days without breaking the one-shot scorer.
- [ ] Enforce `ordinary`, `research_locked`, and `publication_hold` lifecycle
  classes.
- [ ] Verify consent withdrawal and expiry across database and any permitted
  research exports.
- [ ] Document the permanent aggregate and deterministic-sample release format.

**Exit gate:** a locked FutureCast issuance window can be reproduced entirely
from manifests and objects without querying deleted hot rows.

### Phase 6: Cost and reliability operations

- [ ] Publish the weekly storage and retention report.
- [ ] Add budget alerts for database and object storage growth.
- [ ] Automate monthly restore drills and retain signed receipts.
- [ ] Compare Supabase Storage with an S3-compatible archive tier using actual
  request, egress, replication, and operational costs.
- [ ] Right-size provisioned database disk after reclaimed space is stable.
- [ ] Update this document with measured steady-state costs.

**Exit gate:** 30 days of bounded database growth, passing restore drills, and a
documented monthly cost forecast at current and 10x ingestion volume.

## Verification Matrix

| Risk | Required test |
|---|---|
| Partial export | Source and archive counts, bounds, and aggregates reconcile |
| Corrupt upload | Downloaded-byte SHA-256 and Parquet read pass |
| Duplicate job | Unique range constraint and idempotent retry pass |
| Premature deletion | Unsealed range deletion is rejected |
| Late observations | Settlement watermark prevents early closure |
| Schema drift | Unknown schema/version fails closed |
| Restore failure | Monthly isolated restore and query fixtures pass |
| Serving regression | NowCast/ReachMap feature parity and load tests pass |
| Research loss | Locked lifecycle class blocks object and row deletion |
| Consent violation | Withdrawal/expiry tests cover every derived participant row |
| Replica race | Advisory-lock concurrency test produces one archive |
| M5 dependency | Cloud smoke test passes while M5 is offline |

## Expected Result

Reducing ordinary spot history from seven days to two days changes the projected
steady-state spot table from roughly 33 million rows to roughly 9.4 million at
the observed rate, a reduction of about 72 percent. A 30-hour WSPR observation
window still represents roughly 7.9 million raw rows, so retention alone is not
enough: partitioning and compact WSPR feature storage are required.

The first implementation target is a steady state near 20 million high-volume
hot rows before WSPR compaction, rather than more than 40 million under the
existing policy. The compact WSPR design should reduce that further while
preserving the exact causal feature contract used by A6.

## Immediate Next Action

Implement Phase 0 and Phase 1 without changing retention. Only after verified
archive and restore receipts exist should Phase 2 reduce the live windows or
remove the current backlog. All production jobs deploy to Railway and Supabase;
the M5 remains available for offline training, locked evaluation, reports, and
an optional second archive copy.
