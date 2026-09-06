# B24 band history contract

The wall's six-hour history reads existing `band_hourly_stats` through
`GET /api/spots/band-history`. It does not read the two-hour live spot window,
change aggregation, or write model/training data.

The response contains six completed UTC hours: `windowStart` inclusive,
`windowEnd` exclusive, `scope: global`, `fetchedAt`, and per-band rows containing
`hour`, `band`, `count`, `sources` and `modes`. Counts are raw stored report counts,
not deduplicated observations or contact confirmations. `fetchedAt` is read time,
not the age of an individual radio report. The current partial hour belongs to
the separately labeled live activity panel, not the completed-hour totals.

Missing hour/band rows remain unknown. An explicit stored zero is zero. The UI
must label partial coverage and show gaps, never use an empty response as proof
of zero activity. Current regional/path scopes cannot be reconstructed from this
global table. The endpoint rejects query parameters rather than silently returning
global history under a requested regional label. Scoped history would need a
separate contract based on suitable aggregates.

The handler uses the existing public aggregate storage configuration and rate
limiter, a fixed field projection, six-hour bounds, a 100-row cap (at most 72
supported band/hour rows), a 128 KiB response limit and a five-second timeout
covering headers and body. Invalid, duplicate, out-of-window or potentially
truncated payloads fail explicitly. Failure responses are not cached. The
portable route registry and deployment route share the same handler.

Verification: handler tests cover query bounds, scope rejection, malformed rows,
duplicates, current-hour exclusion, zero versus missing, upstream errors, method
handling, empty responses and stalled request/body timeouts. Lint and production
build passed before submission. This is a prerequisite slice for HW-70, not its
report/UI completion; B24 #232 stays open.
