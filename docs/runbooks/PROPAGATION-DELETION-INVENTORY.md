# Propagation deletion inventory

This inventory is the Phase 0 source of truth. Re-run
`python -m propagation_archive inventory` after every database or scheduler
change and reconcile its database-cron output with Railway's configured jobs.

| Path | Owner | Data affected | Safety contract |
|---|---|---|---|
| `collector/src/aggregator/prune.ts` | Railway collector | Archived historical rows, expired surfaces, health, TLE, consent-expired research rows | Environment switch plus database RPC; no direct table deletes |
| `prune_propagation_archive_manifest` | PostgreSQL | One manifest-covered historical range | Sealed manifest, elapsed hot window, restore gate, two controls, keyset batch at most 50,000 |
| `run_propagation_retention_maintenance` | PostgreSQL | One archive batch plus reproducible/operational rows | Explicit environment acknowledgement and database control |
| `prune_wspr_observations` | PostgreSQL compatibility RPC | WSPR observations | Selects only a sealed manifest and delegates one 10,000-row batch |
| `prune_expired_propagation_research_data` | PostgreSQL | Consented predictions, attempts, outcomes | Existing consent/withdrawal policy and bounded participant batch |
| `api/propagation/research-retention.ts` | Vercel cron (`17 5 * * *`) | Consented predictions, attempts, outcomes | Authenticated cron wrapper around the consent-aware bounded RPC; no generic purge |
| `run_propagation_forecast_payload_compaction` | PostgreSQL via Railway collector | Raw forecast JSON only | Separate environment/database switches, sealed/restored manifest, exact source rows, and fresh object inventory; metadata and locator retained |
| `drop_sealed_propagation_hot_partition` | PostgreSQL via archive operations | One daily spot or hourly WSPR native partition | Partitioned authority, elapsed retention, exact sealed/restored manifest, fresh inventory, exact child row count |
| `drop_sealed_wspr_compact_partition` | PostgreSQL via archive operations | One compact WSPR feature hour | Compact authority plus the same exact archive, restore, inventory, retention, and row-count gates |
| Supabase `cron.job` | Supabase | Deployment-specific | Captured dynamically by the inventory and storage-report RPCs |
| Object lifecycle deletion | None | Cold objects | Structurally disabled; no bucket age rule or delete command exists |

The old direct collector deletion of `spot_history`, `solar_snapshots`,
`collector_health`, and `satellite_tle` has been removed. The former unbounded
WSPR RPC has been replaced in the archive-foundation migration. No generic
cost purge is authorized for consent-controlled research tables.
