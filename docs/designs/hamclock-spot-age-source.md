# Stored spot history windows — #288 source slice

All three stored-feed endpoints (`dxcluster`, `pskreporter`, `rbn`) now accept
`windowMinutes=15|30|60`. Omission keeps the existing 30-minute request. Empty,
malformed, duplicate and unsupported values—including 360/1440—return 400 with
`no-store` before contacting storage. Responses add `meta.windowMinutes` while
preserving each endpoint's existing spot shape and metadata version.

Requested history is separate from freshness. The query covers both the requested
window and the 30-minute freshness lookback, and returned validated rows are sorted newest-first and filtered against
the inclusive cutoff and request time. A 45-minute-old report requested with a
60-minute window is retained with its original timestamp and `status: stale`;
it is not promoted to current evidence. Freshness remains 30 minutes after the
newest validated returned observation. This describes available observations,
not a heartbeat or proof of collector health. Empty results keep the existing
stale state; missing/failed storage remains unavailable.

The existing API cap of 200 reports, storage overfetch cap of 800, 512 KiB response
bound, five-second deadline, source/grid/band/mode filters, read-only storage
request and endpoint rate limits remain. These are newest retained sample rows,
not complete interval counts. The repository's two-hour retention migration
(`20260721112000_spot_history_two_hour_window.sql`) supports a one-hour query;
this change does not apply migrations or alter collection/retention. A deployed
backend must already have that migration for the promised retained window.

## Consumer contract

- Use `meta.windowMinutes` and original observation timestamps to describe the
  loaded snapshot. Respect stale/unavailable metadata independently of selection.
- Apply the selected age against the current clock on the client as cached rows
  age. A response describes its `fetchedAt` snapshot; cache delivery does not
  refresh observation time.
- Counts are loaded/capped sample counts. Do not label them complete 15/30/60-minute
  totals or infer personal PSK reception from the global sampled feed.
- Global 6h/24h selections are not supported. The separate personal PSK station
  contract can support those windows in its own map/report scope.

Client hooks, the Settings age selector and personal PSK map integration follow
in separate #288 slices. This source-only PR does not close the issue and changes
no renderer, model, collector or database schema.

## Verification

`NODE_OPTIONS=--no-experimental-webstorage npx vitest run api/_lib/spotStore.test.ts api/spots/spotRoutes.test.ts`:
24 tests pass. Coverage includes all three endpoints and allowed/default windows,
strict rejection before storage, requested query cutoff, sorting, inclusive
boundaries, caps, future/out-of-window filtering, retained stale history and
unchanged source freshness, existing source/filter shapes, unavailable storage,
and oversized responses. `npx tsc -b` passes. Fixtures use synthetic storage
responses and fixed clocks; they do not read or modify production data.


## Review corrections

A 15-minute request now retains a 30-minute storage lookback for freshness
assessment, then trims its displayed rows to 15 minutes. A latest observation at
20 minutes therefore yields an empty selected window with its valid freshness
state and original observedAt. A storage-side upper timestamp filter excludes
future observations before sorting/limiting can let them starve valid reports.
Two added regressions cover these cases (26 focused API tests total).
The query uses PostgREST's documented [logical filter syntax](https://docs.postgrest.org/en/stable/references/api/tables_views.html#logical-operators).
