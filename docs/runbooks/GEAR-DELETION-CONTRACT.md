# Shack gear deletion contract (GEAR04 / #326)

Owner-scoped soft deletes for legacy shack gear tables (`user_radios`,
`antennas`, `feedlines`, `accessories`, `station_presets`, `inline_components`,
`station_chains`, `custom_radios`).

## Identity

- **Deletion intent key:** `{table}:{recordId}` where `recordId` is
  `instance_id` for `user_radios` and `id` for all other tables.
- **Server tombstone:** non-null `deleted_at` on the owning user's row.
- **Resurrection:** blocked server-side by `reject_gear_tombstone_resurrection`
  (an upsert or restore cannot clear `deleted_at` once set).

## Sync behaviour

1. Local remove enqueues a `pendingGearDeletions` intent with the signed-in
   `ownerId`.
2. Push applies `deleted_at` before survivor upserts. A zero-row update is
   verified with a follow-up read; if the row is gone for that owner, the intent
   is acked (ack-on-absent).
3. Pull merges active rows only; tombstoned server rows remove matching local
   inventory and ack pending intents for the pulling user.

## Retention

- Tombstones are retained for **90 days** after `deleted_at`.
- `pg_cron` job `gear_tombstone_90d_prune` runs daily at **03:30 UTC** and
  hard-deletes rows with `deleted_at < now() - interval '90 days'`
  (`prune_gear_deletion_tombstones()`).
- After purge, delta sync cannot replay the tombstone; clients rely on
  ack-on-absent and the local acknowledged-deletion registry (same 90-day
  window) to avoid resurrecting deleted gear.

## Settings backup restore

Restoring a backup must **not** silently un-delete gear that is tombstoned or
already purged on the server.

- Before apply, the client queries server tombstones and consults local
  `pendingGearDeletions` plus `acknowledgedGearDeletions` (90-day client
  retention aligned with server prune).
- Matching backup items are **skipped** and reported in the import result; they
  are not written into local inventory and never flip `deleted_at` back to null.

Migration: `20260910230000_gear_deletion_tombstones.sql` (tombstones),
`20260912180000_gear_tombstone_prune.sql` (retention cron).
