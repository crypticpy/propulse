# Spot aggregation recovery

Tracking: #584. This first slice protects aggregation against raw-spot expiry;
upstream delivery completeness and all-consumer coverage reporting remain open.

## Contract

Raw spot storage retains roughly two hours. Display age/density preferences do
not control ingestion, retention, or training inputs. The collector plans only
whole retained UTC hours, using the settled-hour delay, and replays the newest
retained hour on later ticks to absorb late arrivals. The legacy
`RETENTION_SPOTS` configuration no longer determines aggregation catch-up.

`compute_retained_spot_hour` is the authoritative boundary: it takes a shared
transaction advisory lock, checks the database clock, replaces the exact
band/path/region hour, and commits its progress marker in the same transaction.
Same-kind workers are serialized so overlapping replicas cannot retain obsolete
group keys. Failed rebuilds restore the previous committed rows. `prune_retained_spots` takes the matching exclusive lock before
expiring raw rows. The named cleanup job must call that function. Ingestion is
not locked by this protocol. Historical/direct aggregate RPCs are not protected;
collector recovery must always use the wrapper.

An already-truncated hour is never recomputed through the wrapper. Missing
expired ranges are stored in `collector_aggregation_gaps` with no raw reports.
The collector can still process newer safe hours, then reports that recovery
tick as degraded. Historical gaps remain durable after live health recovers.
If the gap record fails, recovery stops rather than silently losing the record.
The gap table is service-only. A gap is evidence of unavailable raw history,
not proof that the original feed had zero activity.

Path recency checks the gap ledger before processing, skips known gaps, and
replays same-hour path updates. It fails closed when gap metadata is unavailable.
This prevents newly detected expired inputs from being promoted through recency;
it does not repair or certify aggregates produced before this release.

`retained` means retention did not truncate the source hour. It does **not** mean
all upstream reports arrived. A retained zero-row result is not a completeness
certificate. Reports arriving after their hour leaves the retained window are
not recoverable here. The existing aggregate SQL is reused, not retrained or
rewritten. No WSPR ingestion or model algorithm changes are included.

## Rollout order and verification

1. Run collector tests/typecheck, repository lint/build, and the isolated SQL
   harness. The SQL harness uses synthetic compute functions to verify wrapper
   transaction/permission behavior; it does not measure production query cost.
2. Review/apply only `20260907220000_spot_aggregation_recovery.sql` to the owned
   database, with normal migration-ledger recording. Do not replay old cleanup
   migrations to repair their historical ledger discrepancy.
3. Verify the single named cleanup job invokes `prune_retained_spots`, the gap
   table is service-only, and wrapper permissions are correct. Confirm no other
   enabled raw-deletion job bypasses the advisory lock.
4. Deploy the collector revision after the schema is available. Missing wrapper
   or gap metadata must fail closed, not fall back to unguarded aggregation.
5. Verify recent job runs, band/path/region progress, recorded gaps and source
   health. Check a bounded restart and same-hour late replay without inventing
   missing historical observations. Preserve evidence separately from secrets.

If rollback is required, stop the affected aggregation jobs before changing the
collector/database contract. Do not restore an uncoordinated cleanup command
while guarded workers are running. The schema is additive and can remain while
a corrected collector is deployed; removing the gap ledger loses audit evidence.

## Remaining acceptance under #584

- Source delivery/coverage evidence to distinguish genuine zero, stale,
  incomplete and unavailable data across APIs, lists/maps and training consumers.
- Make gap metadata authoritative in historical lookup consumers as well as
  recovery. This slice does not invalidate pre-existing derived rows if a gap
  is later discovered for their hour.
- Deployed configuration and historical continuity audit, including any gaps
  produced before this guard existed and migration-ledger reconciliation.
- A bounded longer recovery/archive policy if the model owner requires reports
  beyond the live window; finalized-day archival and correction/versioning rules.
- Alerts before recoverable input expires, and explicit late-arrival cutoff
  behavior. The current guard prevents false recovery; it cannot resurrect raw
  data already deleted.

## Gap-aware readers and baselines

The reader follow-up migration supports the existing six-argument rate lookup
and the deployed seven-argument lookup with its optional rate/quantile selector.
It replaces only the installed signature and refuses ambiguous/missing contracts.
A known path gap makes the affected lag unavailable even if a derived row already
exists. It does not activate or alter a model.

The baseline follow-up excludes known band/region gap hours before building the
sample population. Counts remain live while baseline fields become null after a
new gap, until a filtered rebuild succeeds. An identical gap report preserves
its original timestamp; expanding a range legitimately invalidates the baseline.
The gap-aware band-history view omits suspect hours but preserves stored zeroes.
The API still uses its existing missing-hour presentation and bounded query.

Apply `20260907230000_spot_aggregation_recovery_baselines.sql` and verify its
permissions/view **before merging the API route change**, because main deploys
that route automatically. Verify the exact deployed function bodies against the
reviewed originals before replacing them. Both SQL harnesses use isolated
fixtures; after rollout, also verify the public history/count endpoints and the
collector's next baseline refresh. Do not force a costly historical rebuild as
part of an ordinary API smoke check.

These guards quarantine known gaps. They do not prove that every upstream spot
arrived, identify all historical gaps retrospectively, or turn a positives-only
feed into evidence of unobserved propagation opportunities.
