# Known-gap safety for path archives

Tracking: #594, following #584. This is a partial safety contract for the
collector's daily CSV archives. The archive worker's monthly Parquet manifests,
restore receipts and training admission are separate contracts.

## Evidence and deletion boundary

New daily manifests explicitly identify their manifest format and include a
`knownGapSnapshot`: the completed UTC day, version, scope `known-gaps-only`,
and ordered applicable `path_hourly` gap ranges with their original inclusive
boundaries, reason and recorded timestamp. Original ranges preserve provenance,
including a range that crosses a day boundary. Empty ranges mean no *recorded*
gap at observation time, not complete upstream delivery.

The service-only snapshot RPC returns at most 1,000 ranges and refuses overflow.
The collector requires matching snapshots before and after its export, verifies
the data object, then downloads and verifies the newly written manifest. Legacy
manifests remain intact; they cannot authorize the new guarded prune operation.
They are not automatically re-exported or relabeled as covered.

The guarded prune RPC takes the gap writer's `(584,5)` transaction lock, obtains
a fresh READ COMMITTED snapshot, compares it to the manifest and only then calls
the existing row-count/delete guard. Missing, malformed or changed coverage
fails closed. A concurrent gap writer that commits before prune is observed;
one that arrives later waits until the prune transaction completes. Unsupported
transaction isolation is rejected. No pruning flag is enabled by this release.

## Limits and rollout

This protocol protects against changes to the known-gap ledger through deletion.
It does not make paged aggregate reads an atomic source snapshot. Same-count
historical mutations can evade the existing row-count guard. Do not enable
pruning in a workflow that can rewrite archived source days until those writers
participate in a coordinated archive lock or authoritative content verification.

A gap discovered after a day is pruned can make its saved snapshot stale. Restore
and training admission must reconcile current gap metadata, preserve coverage
provenance and label unknown historical coverage. Neither the CSV hash nor a
separate Parquet restore receipt proves that source hours were complete.

Apply and verify only the additive archive coverage migration before deploying
the collector that calls it. Confirm both RPCs are service-only and use synthetic
SQL tests for deletion behavior. Do not invoke production prune RPCs as smoke
tests. Missing schema fails closed; there is no fallback to the legacy prune RPC.
Leave existing controls unchanged and inspect archive job health after rollout.

## Coordinated follow-ups

- PR #609 owns the backfill CLI and recency retention. The standalone
  `scripts/lib/path-recency-gap-preflight.mjs` provides a bounded, fail-closed
  helper for that owner to integrate before each compute call. It is not wired
  into the CLI by this slice. Dry runs must report known gaps without computing;
  live runs must skip/reject them. Client preflight alone is not atomic with a
  later gap write, so serving guards remain necessary.
- Preserve coverage in the archive worker's monthly Parquet export/restore and
  training admission. Do not assume it consumes the daily CSV manifests.
- Define immutable coverage revisions or reconciled sidecars for late discovery,
  and audit legacy manifests without inventing completeness or backfills.
- Require independent reconstruction proof for derived recency pruning; a shared
  age window or enabled stats-prune flag is not such proof.
