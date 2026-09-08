# Archive source and coverage contracts

## Scope and delivery

Issue #634 extends the daily CSV safeguards from #629 to the monthly Parquet
worker. Parent #594 tracks historical reconciliation and downstream admission.
Path aggregates are the first dataset with an explicit coverage contract. Model
algorithms, eligibility settings, source collection and pruning controls are
outside this change.

The archive is a record of observed rows **and what was known about missing
source hours when it was exported**. A matching hash proves object identity;
a row count proves a count. Neither proves upstream completeness. An aggregation
watermark establishes a processing frontier, not uninterrupted interior coverage.

## Contract surfaces

| Surface | Purpose |
| --- | --- |
| `propagation_archive_datasets` and Python `Dataset` | Agree on dataset identity, source relation, event/ingestion time, partition granularity, row schema version and coverage contract. |
| `coverage_contract` | Explicit adapter identifier. `NULL` means coverage is unassessed by this mechanism. Unknown identifiers fail closed. |
| `coverage_evidence` | Immutable evidence associated with a verified manifest, separate from the row schema. |
| Parquet `propulse.coverage.evidence` metadata | Canonical JSON evidence included in the object's SHA-256. It must equal manifest evidence. |
| Verification and receipt `checks` | Record that embedded evidence was checked; the database also reconciles against current authoritative evidence. |

`path_hourly_stats_v1` uses `spot-known-gaps-v1`. Other registered datasets keep
their existing behavior; they do not inherit a claim of coverage from this path
adapter. In particular, do not infer a raw-spot or WSPR completeness contract
from path aggregate evidence.

The v1 payload has exactly these fields:

```json
{
  "version": 1,
  "scope": "known-gaps-only",
  "range_start": "2026-08-01T00:00:00.000000Z",
  "range_end": "2026-09-01T00:00:00.000000Z",
  "gaps": [
    {
      "start_hour": "2026-08-12T03:00:00.000000Z",
      "end_hour": "2026-08-12T05:00:00.000000Z",
      "recorded_at": "2026-08-12T08:15:00.000000Z",
      "reason": "raw_expired"
    }
  ]
}
```

Partition bounds are half-open `[start, end)`. Gap bounds are inclusive whole
UTC hours. Preserve the original full overlapping gap range and its recording
time rather than clipping away provenance. Sort gaps by start hour. The bounded
snapshot rejects more than 1,000 ranges; it never silently truncates. Empty
`gaps` means **no recorded gaps**, not proof that every upstream report arrived.

## Export, reuse and recovery

1. Compare the database registry with the code adapter before exporting.
2. Capture bounded coverage evidence, export it inside Parquet, and reconcile
   row counts, bounds, source counts and evidence after export.
3. Register evidence with the manifest and verify the downloaded remote object's
   bytes and embedded metadata before verification and sealing.
4. Database lifecycle guards take the shared gap lock and obtain fresh coverage
   under READ COMMITTED. The gap writer takes the corresponding exclusive lock.
   Stale evidence cannot authorize guarded state transitions or pruning.
5. Reuse, isolated restore and replica verification reconcile current evidence.
   Passing receipts must carry the verified evidence. Database receipt guards
   close the interval between client validation and receipt insertion.

An older manifest without evidence remains historical evidence of its rows; it
cannot pass the covered dataset's new verification or recovery gate. Never add
current evidence to an old object's manifest as though it had been embedded at
export time. A newly discovered gap invalidates the old snapshot for admission;
it does not rewrite or delete the archived object. Investigate and create an
explicit reconciliation plan. Keep provenance for the original object.

A failed operation is not permission to enable pruning, overwrite a conflicting
object or fabricate zero observations. The trigger checks occur in the same
transaction as existing prune and receipt functions: rejection rolls back the
operation. Existing receipt history is not a perpetual coverage certificate;
consumers must reconcile current evidence when admitting an archive.

## Adding a source

Implement one explicit adapter with these decisions documented in its issue:

1. **Identity and provenance:** stable dataset/source identifiers, provider and
   transform versions, origin timestamps, and deduplication/correction rules.
   Distinguish repeated delivery from a revised observation.
2. **Time:** choose event or ingestion time, UTC precision, partition bounds,
   late-arrival policy and watermark meaning. Describe outages and partial hours.
3. **Rows:** define the Arrow schema and restore casts. Version incompatible
   changes; do not change an existing archive's interpretation in place.
4. **Coverage:** name the authoritative ledger and its limitations. Add a
   bounded snapshot adapter, canonical validator and database guard dispatch.
   Register the exact supported contract in both SQL and Python. Do not reuse
   the path gap contract for a source whose missingness has different semantics.
5. **Concurrency:** specify which writes can invalidate evidence and the shared
   lock or equivalent ordering protocol. Verify fresh evidence after waiting.
6. **Consumers:** update export, retry, restore, replica and each training or app
   admission point. Keep missing/unknown separate from measured zero. Explicitly
   track a consumer that has not adopted the contract; do not call it covered.
7. **Tests and rollout:** cover empty data, boundary hours, duplicates, late
   corrections, unavailable/oversized evidence, unknown versions, old objects,
   interrupted uploads and concurrent changes. Deploy the additive database
   contract before its worker. Inventory existing objects before enabling any
   destructive lifecycle setting.

Reuse the registration, Parquet metadata, verification and receipt plumbing.
Source-specific semantics belong in the coverage adapter, not in scattered
provider conditionals throughout consumers. A new contract version needs an
explicit compatibility policy and fixtures for old readers and objects.

## Future user data and interactions

User observations and interactions need a separate ownership and access contract
before joining this pipeline. Define tenant/user identity, visibility, permitted
purposes, retention/deletion propagation, audit provenance and derived-data
handling. Decide whether an interaction is an observation, feedback, preference
or annotation; do not silently treat it as a ground-truth measurement.

Public environmental measurements and private user records must not share an
archive access policy by accident. Specify how access and deletion apply to
copies, restores and derived datasets before registering user-scoped sources.
This document reserves that design boundary; it introduces no user-data
collection and does not change current account or model behavior.

## Remaining acceptance boundaries

Known-gap reconciliation cannot detect an upstream outage that was never
recorded, or all same-count historical value corrections. It cannot recover
already expired reports. Training loaders still need explicit admission rules
for unassessed, known-incomplete and reconciled evidence; this change does not
activate or certify those loaders. Parent #594 tracks those remaining proofs.
Manual recency backfill and PR #609's retention work remain separately owned.
