# Atomic recency coverage guard

Issue #638 makes the existing `compute_path_recency_hourly(timestamptz, text)`
operation reject known incomplete path hours before changing derived rows.
Both the scheduled collector and the manual backfill tool already call this
operation, so neither needs a separate integration switch. PR #609's caller
and retention files remain separately owned.

## What the operation guarantees

The requested hour must be finite, closed and aligned to a whole UTC hour.
Hour alignment is independent of the caller's session timezone. The transform
identifier retains its existing validation and default.

Under READ COMMITTED, the function takes the shared `(584, 5)` transaction lock
and then reads the authoritative `path_hourly` gap ledger in a fresh statement.
A matching inclusive gap (`start_hour <= hour <= end_hour`) raises an error
before the existing delete-and-recompute logic. Unknown or unavailable ledger
state is an error, not permission to proceed. The lock remains held until the
caller transaction ends. Gap writers use the corresponding exclusive lock.

A failed guard leaves prior recency rows intact. Failures in the existing
calculation still roll back the statement's deletion and insertion. No rows are
fabricated, and missing observations are not converted to a measured zero.
The public RPC signature, defaults, owner, grants and function settings remain
unchanged. Non-READ-COMMITTED or unaligned custom callers now receive an explicit
error and must correct their transaction/hour input.

This is a **known-gap** guard. It does not prove upstream completeness, certify
all historical source rows, or establish that an archived source is safe for
training. A gap recorded after computation commits can invalidate the result;
the gap-aware serving reader remains necessary. Recomputing that hour afterward
will refuse until a separately authorized reconciliation resolves the source
coverage. Display filters are unrelated to this retention and recovery contract.

## Preserving deployed calculations

The original checked-in v2 function and the newer deployed function differ:
the latter also computes a recency quantile. Replacing either with a copied
algorithm would risk changing model inputs or breaking a fresh replay.

The additive migration recognizes the exact supported function bodies and
patches only UTC hour normalization and the pre-mutation guard. It requires the
unique expected signature and unique insertion anchors. An unrecognized body
aborts the migration for review; it is never overwritten optimistically. Tests
exercise both supported bodies and compare their calculation results and
function attributes before and after the guard.

If a later migration intentionally changes this calculation, it must preserve
the atomic guard or provide an equivalent coverage contract. Add a fixture for
that implementation and coordinate with the model owner. Do not broaden the
supported-body check just to make a deployment pass.

## Deployment and failure handling

1. Inspect the owned project's deployed signature, function body and gap-writer
   locking contract. Compare them with the reviewed migration assumptions.
2. Run the isolated PostgreSQL harness and normal repository checks; merge the
   exact reviewed change before applying its migration.
3. Apply the additive migration once. Verify the migration ledger, function
   guard, explicit UTC normalization, unchanged algorithm and service-only ACL.
   A metadata-only verification is sufficient; do not run a production backfill
   as a smoke test.
4. If the operation reports a known gap, preserve the existing rows and inspect
   the gap/source archive evidence. A retry cannot repair expired raw reports.
   Follow [archive source contracts](../designs/ARCHIVE-SOURCE-CONTRACTS.md) for
   provenance and restore requirements before reconstructing historical data.

All archive and recency pruning controls stay unchanged. This migration does not
start a backfill, deploy the inference service, enable a model, or collect a new
source. Historical reconstruction and training admission remain tracked by #594.
