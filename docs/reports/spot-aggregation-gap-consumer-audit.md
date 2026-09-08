# Spot aggregation gap consumer audit

Issue #584 records hours whose raw spot input expired before aggregation. The
gap-aware baseline migration exposes `band_hourly_stats_readable`, which omits
those hours without turning them into zero activity.

## Updated band consumers

- `useBandHourlyStats` supplies the active `BandConditionsPanel` and now reads
  the readable view.
- `usePropagationHeatmap` is currently unused, but now reads the same view so a
  future caller cannot silently restore the old behavior.
- `queryBandHourlyStats` is currently unused and now reads the view. Its path
  counterpart remains unchanged because no gap-filtered path relation exists.
- `eval-forecast` now evaluates against readable band truth. Its densification
  still represents a missing band within a retained aggregate hour as zero; a
  wholly known-gap hour is absent before densification. Readability excludes
  known gaps; it does not certify upstream delivery completeness.

## Remaining active follow-ups

1. `collector/src/aggregator/archivePathStats.ts` and the archive worker export
   `path_hourly_stats` without sealing applicable gap ranges into the archive
   manifest. [Issue #594](https://github.com/crypticpy/propulse/issues/594)
   coordinates archive, restore, and manual-backfill gap metadata.
2. `scripts/backfill-path-recency.mjs` invokes the path-recency compute RPC for
   every requested hour. It needs the scheduled collector's bounded,
   fail-closed gap preflight or a database RPC that rejects known gaps. This is
   also tracked in #594.
3. The diagnostic path-recency coverage and hand-check SQL reads the base path
   table. Those scripts must label or filter known gaps before their output is
   accepted as evidence.

Live `spot_history` alert polling and subscriptions consume individual events
inside the retained window. They do not densify missing rows or claim hourly
completeness, so they do not need an aggregate-gap filter.

Issue #465 is planned prediction-log and exposure-denominator work. No exposure
aggregate is active yet; its future scoring contract must carry gap availability.
