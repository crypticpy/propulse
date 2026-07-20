# Propagation retention implementation status

Status as of 2026-07-19 on branch
`codex/propagation-data-retention-archive`. This ledger separates implemented,
locally verified controls from production observation and authorization gates.
No migration, config, or local receipt authorizes a production retention
reduction, backlog deletion, reader cutover, or row-form retirement.

| Phase | Implemented and locally verified | Production/operational gate still required |
|---|---|---|
| 0 — measure and freeze | Exact table/index/TOAST/dead-tuple report RPC; optional exact seven-day rates; database-cron and application deletion inventory; collector `ARCHIVE_PRUNING_ENABLED=false` stop; database controls default off; production-boundary and cloud/M5 checks | Deploy migrations; capture seven consecutive production reports; reconcile Railway, Vercel, Supabase, and operator schedules; record provisioned disk from the Supabase dashboard |
| 1 — archive foundation | Private bucket migration; service-only manifest, audit, restore, reconciliation, and registry schema; bounded PyArrow Parquet/ZSTD worker; TUS upload; downloaded-byte SHA/read/count/bounds/schema/watermark checks; idempotent ranges; advisory lock; isolated validation restore; signed seven-dataset local gate | Deploy the one-shot Railway services and run the required fixtures against the production private bucket and a genuinely separate validation database |
| 2 — bounded growth | Disabled 48-hour spot and 30-hour WSPR contracts; bounded indexed keyset pruning; sealed-manifest, passing-restore, fresh-inventory, late-row, and exact-count gates; expired-cache, 7-day health, 7-day TLE, and consent-aware maintenance; structured duration/error metrics | Obtain explicit deletion authority; enable controls one dataset at a time; archive and remove the real stale WSPR backlog; observe two continuous weeks within lag and prediction-availability budgets |
| 3 — partitioning | Daily spot and hourly WSPR native partitions; bounded hot-window creation and keyset backfill; audited ingest RPCs and global WSPR dedup; dual-write failure ledger; exact reconciliation; live views and reversible `legacy -> dual_write -> shadow_read -> partitioned` state machines; reader/aggregator migrations; exact sealed partition retirement; rollback suite; representative WAL-capable insert/aggregate/API/archive/drop benchmark | Capture peak and ordinary representative receipts for both datasets; observe collector latency; advance each production state machine separately; retain rollback until the observation gate passes |
| 4 — WSPR compaction | Versioned hourly PostgreSQL-array schema plus Parquet candidate schema; validated sorted equal-length arrays; row and compact writers; bounded backfill; exact cell reconciliation; stable H-1/H-2/H-3/H-24 lookup; identity-free dual-read telemetry; benchmark receipts; authenticated Railway NowCast/ReachMap load harness; gated row-form and compact-partition retirement | Run representative three-candidate and Railway cold/warm concurrency receipts; select the candidate; complete the production parity window and restore drill; enable row-form retirement only after the rollback owner signs off |
| 5 — forecast/research | NOAA response bytes are hashed before parsing and uploaded to a content-addressed private object; downloaded bytes are verified before metadata and values commit; Postgres keeps hash, byte count, issue/retrieval timing, and object locator; parsed-value archive and compaction preserve one-shot evidence; audited lifecycle holds/releases; consent tables excluded from generic archives; withdrawal/expiry integration; deterministic private-sample and permanent aggregate format; object deletion structurally disabled | Reproduce a real locked FutureCast issuance from private objects; verify withdrawal against any future permitted research export; separately approve child sample manifests before implementing object deletion |
| 6 — cost/reliability | Independent one-shot Railway configs for archive, inventory, restore-due, health, and weekly exact report; no restart loops; signed isolated restore receipts; due-dataset selection; archive/retention/restore/reconciliation alerts; predictor hit/fallback telemetry; current/10x cost receipt and alternative-tier input contract; second-copy verification | Schedule and observe the services; supply actual alternative-provider request, egress, replication, and operations inputs; collect 30 days of bounded growth and restore evidence; right-size disk through a supported Supabase operation only after reclamation stabilizes; update measured steady-state costs |

## Local evidence

- A full Supabase reset applied all migrations from an empty disposable local
  database.
- The archive-foundation SQL suite passed exact source/archive reconciliation,
  unknown-schema and unaligned-range rejection, corrupt exact-byte forecast
  rejection, hold/release, replica, inventory, late-row, bounded-prune, and
  archive-before-delete gates.
- The partition/compact SQL suite passed default legacy authority, private
  grants, bounded backfill, exact reconciliation, global WSPR dedup, reversible
  writer/read cutover, 100 shadow parity requests, ordered four-lag parity,
  compact numeric validation, and rollback.
- The research integration passed withdrawal and expiry for consented
  predictions, attempts, and outcomes, and proved those tables are absent from
  the generic archive registry.
- The real two-connection advisory-lock gate rejected the same partition while
  allowing an independent partition.
- The seven-dataset end-to-end fixture passed for spot observations, WSPR
  observations, solar snapshots, path aggregates, forecast payloads, row-form
  WSPR features, and compact WSPR features. It produced seven sealed manifests,
  seven isolated restores, seven signed receipts, and an exact clean object
  inventory.
- The WAL-capable partition smoke benchmark passed insert, aggregate,
  API-shaped read, binary archive stream, detach/drop, exact parity, and rollback
  checks against 1,000 synthetic spot rows. This is implementation evidence,
  not a production selection receipt.
- Archive worker tests: 17 passed. Collector tests: 32 passed plus TypeScript
  typecheck. ML service tests: 133 passed. The repository matrix also passed 68
  V4, 37 V4.1, 203 V4.2, 292 application/API, six bridge, and ten daemon tests,
  plus tracked-artifact checks, ESLint, production build, and bundle budgets.

## Activation order

1. Deploy every schema and config with archive, pruning, and cutover controls in
   their fail-closed defaults.
2. Complete the seven-day production baseline and schedule inventory, health,
   exact weekly reports, and signed isolated restore drills.
3. Enable archive export only; complete production fixtures and verify private
   object inventory from Railway.
4. Observe archive lag, then separately approve database pruning and the
   collector environment acknowledgement for one dataset at a time.
5. Remove the stale backlog only through bounded, reconciled operations and
   complete the two-week Phase 2 gate.
6. Capture representative Phase 3/4 benchmark and Railway load receipts. Advance
   cutover state machines one stage at a time; preserve the documented rollback
   point.
7. After 30 days of bounded growth and passing restore drills, supply actual cost
   inputs and review supported physical disk right-sizing.

The implementation is ready for deployment review. Production deployment,
credentials, scheduler creation, destructive switches, backlog removal,
candidate selection, row-form retirement, and disk right-sizing require
explicit operational authority and cannot be satisfied by local code alone.
