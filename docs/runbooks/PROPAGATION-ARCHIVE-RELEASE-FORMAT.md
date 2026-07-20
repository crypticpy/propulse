# Propagation permanent aggregate and deterministic sample format

This specification is frozen before ordinary object deletion is implemented.
It does not authorize deletion: `object_deletion_enabled` is constrained false
in the database until a later reviewed migration implements and validates this
contract.

## Version and scope

The version identifier is `propagation-ordinary-sample-v1`. It applies only to
ordinary public-source spot and authorized WSPR observation archives after 90
days. It never overrides `research_locked`, `publication_hold`, withdrawal,
`retention_until`, provider terms, or a preregistered evidence window.

The deterministic sample remains private and service-role-only. Callsigns,
grid pairs, observation identifiers, and row-level timestamps are never part of
an open release.

## Frozen sample rule

For each canonical source row, compute:

```text
digest = SHA256(
  "propagation-ordinary-sample-v1\0" ||
  dataset_name || "\0" ||
  canonical_observation_key
)
```

Interpret the first eight digest bytes as an unsigned big-endian 64-bit
integer. Keep the row when that integer is less than
`floor(2^64 / 1000)`. The fixed rate is therefore approximately 0.1%. There is
no run-specific seed and no outcome-dependent stratum, so the sample cannot be
retuned after viewing results.

Canonical observation keys are:

- WSPR: the existing lowercase `observation_key_sha256` value;
- spot history: UTF-8 fields joined with NUL bytes in this exact order:
  source, UTC `spotted_at` rendered with six fractional digits and `Z`, uppercase
  TX callsign, uppercase RX callsign, and frequency in integer Hz.

Rows with an invalid or incomplete canonical key fail the lifecycle job and
remain in the full object. The sampled Parquet schema is the same versioned raw
schema as its source manifest. A sample manifest records the parent manifest,
algorithm version, input rows, sampled rows, input SHA-256, sample SHA-256, and
the exact threshold.

## Permanent identity-free aggregate

Each closed UTC hour produces rows keyed by:

```text
(dataset, hour_utc, provider, band, mode_class, tx_field2, rx_field2)
```

Values are row count, unique transmitter count, unique receiver count, median
and mean SNR where available, minimum/maximum source time, source watermark,
transform version, and quality flags. No callsign, grid4/grid6, station ID,
user ID, precise coordinate, source-row ID, or free text is allowed.

An open aggregate release additionally suppresses any cell with fewer than
five unique transmitters or five unique receivers and removes the unique-count
fields after suppression. Private permanent aggregates may retain those counts
but remain service-role-only.

## Lifecycle gate

Before deleting an ordinary full object, a future implementation must prove:

1. the parent archive is sealed, restored, and freshly inventoried;
2. its database source disposition is complete;
3. aggregate and deterministic-sample child manifests are sealed and restored;
4. child input counts and parent SHA-256 reconcile exactly;
5. no active hold covers the parent;
6. the provider terms permit the intended retention and release;
7. the lifecycle audit records the request before storage deletion and a
   post-delete missing-object verification afterward.

Bucket-wide age rules are prohibited. Until all seven conditions exist in
executable code and tests, the full private objects remain retained.
