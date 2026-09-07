# Browser spot feed contract — #288

New `fetchPSKReporterFeed`, `fetchRBNFeed` and `fetchClusterFeed` APIs return
`{ spots, metadata }`. Metadata retains source state, original newest observation,
server snapshot time, freshness duration and declared history window. A caller
can explicitly request 15/30/60 minutes; the response must confirm that window.
A legacy endpoint cannot silently satisfy a 60-minute request with its old
30-minute behavior.

Versioned metadata validates source identity, status, timestamps, freshness
seconds and window. Unavailable envelopes and transport/HTTP errors reject the
feed request, so a query consumer can retain its previous snapshot with an error
state rather than replace it with a fabricated empty success. Stale reports are
kept with their original times. Invalid or mismatched metadata rejects.

Existing array-returning functions remain available. Legacy JSON arrays,
PSK XML, RBN HamQTH and cluster CSV can still be read without an explicit window;
metadata is unknown when source timestamps/coverage cannot be established. The
legacy cluster wrapper retains its existing empty-array fallback; new evidence
consumers must use the feed API to distinguish failures. DX rows with malformed
time/frequency no longer become current reports through a Date-now fallback.

This client-only slice does not wire map or report consumers yet. Subsequent
#288 work must select age against the current clock, preserve feed errors/stale
state, and label loaded/capped samples honestly. No 3D, modeling, collector,
database or hardware code changes.

## Validation

Forty-three focused client/recovery tests pass across three files, including:

- All three feeds preserve stale reports and timestamp/window metadata.
- Every supported window is requested and verified; wrong-source, mismatched,
  malformed and missing window confirmations reject.
- Unavailable HTTP-200, transport and HTTP failures reject for feed consumers.
- Legacy arrays retain unknown metadata rather than invented fetch/observation times.
- Invalid DX times/frequencies cannot fabricate a current observation.
- Existing legacy parser/recovery tests continue to pass.

Typecheck, lint and production build pass. Tests use synthetic responses and
original observation times, with no provider traffic or production state writes.
No visible UI changes in this slice; renderer/control acceptance follows when
the new contract is consumed.


## CSV review follow-up

The legacy CSV path now validates positive decimal frequency, hour/minute ranges
and actual calendar dates before including a row. Unknown timestamps are skipped
rather than replaced with now; valid time-only reports use UTC day rollover.
Mixed valid/invalid CSV and midnight rollover regressions bring focused client
coverage to 45 tests. JSON frequencies also require a scalar number/string.
