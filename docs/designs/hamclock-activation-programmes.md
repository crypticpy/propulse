# Additional activation programme contracts — #285

Read-only source audit, 2026-09-06. WWBOTA is implemented in this slice; CANParks remains the next adapter.

## WWBOTA

Official documentation: [API](https://api.wwbota.net/) and its linked [OpenAPI schema](https://api.wwbota.net/openapi.json), version 1.12.0 at inspection. `GET /spots/?age=2`, with `Accept: application/json`, returned a successful empty array during the live check. The schema describes `freq` in MHz, `call`, `spotter`, `mode`, `time`, `type`, `id`, and a `references` array. Each bunker reference includes its reference/name, latitude, `long` longitude and locator. One report can cover several references. Types are Live, QRT and Test.

Adapter requirements: convert MHz explicitly, emit one programme/reference identity per bunker, let newer QRT suppress an older Live report, ignore Test, bound payload/rows/time and validate each reference. A successful empty feed is valid; no invented live example is needed. Synthetic tests can follow the published schema.

## WWBOTA implementation evidence

The bounded aggregate now includes the official feed. The wall report, rail counts and compact sidebar expose the new programme. Per-reference QRT handling, multi-reference locations, stale/future/Test rejection and precise 1 Hz frequency conversion are covered by normalizer tests. The shared normalizer previously rounded to 100 Hz; it now retains 1 Hz.

Local browser validation passed 24 programme/theme/resolution combinations (four programmes, three themes, 1080p/4K), with synthetic WWBOTA reports and populated cluster rows. Explicit report/tile tuning preserved 7.074125 MHz; Escape focus return and pinned programme retention passed. Hardware transports were blocked. [1080p report](../images/hamclock-activations/wwbota-1080p.png). Managed session: owner `hamclock-wwbota`, id `22352321-eed2-4b4b-a37c-950328f366e4`, local profile, port 5181, isolated worktree `.worktrees/hamclock-wwbota`. Physical/deployed acceptance is pending.

## CANParks

Official [home page](https://canparks.ca/) links its public client `home-20260830-v32.js`. That client reads `https://api.canparks.ca/spots?limit=8&fresh=1` every 60 seconds, expects `{ ok, generated_at, spots }`, and expires rows after 30 minutes or an earlier explicit `expires_at`.

A read-only live check returned kHz frequencies, activator/spotter callsigns, CANParks reference/name, coordinates, created/expiry timestamps, and source labels. Several rows were explicitly imported POTA observations mapped to CANParks references. Preserve that provenance visibly rather than claiming independent native observations. The complete spotting page's documented/public read behaviour should determine the adapter's limit; do not silently call an eight-row homepage sample a complete programme feed.

Before adding this programme, extend the canonical per-spot expiry/provenance contract and use its 30-minute window in wall facts/filtering. Keep programme counts distinct from unique operators across programmes.
