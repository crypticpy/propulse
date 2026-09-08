# DX Cluster two-hour history contract — #288

The DX Cluster list already offers a 120-minute filter, but its REST client
previously fetched the default 30-minute source window. This prerequisite adds
explicit `windowMinutes=120` support only to the DX endpoint and metadata-bearing
browser client. A subsequent list-hook slice will select the request window,
retain metadata/failures and expire cached rows on the clock.

The server queries the existing retained DX sample through the inclusive
120-minute cutoff. Freshness remains 30 minutes: a 90-minute-old latest report
is returned as historical evidence with stale status and its original timestamp.
Rows beyond the requested boundary and future rows remain excluded. Existing
limits remain: 200 returned rows, at most 800 storage rows, 512 KiB body limit,
five-second storage deadline, and the existing route rate limit. This is bounded
sample history, not a complete interval total.

PSK/RBN endpoints and ordinary map choices remain 15/30/60 minutes. Their routes
reject 120 before storage access; the shared store also keeps their original
window constraint. Separate `ClusterWindowMinutes` types allow the DX client to
request 120 without widening map preferences. Browser metadata validates the
source-specific window and rejects a server that answers a two-hour request
with only a shorter interval. Legacy array-returning wrappers remain unchanged.

The existing `20260721112000_spot_history_two_hour_window.sql` migration retains
two hours and schedules pruning. It is a deployment prerequisite; this work did
not apply or modify production migrations. Public PSK six-hour/24-hour history
is not introduced, and personal PSK keeps its separate callsign-specific source.

## Verification

63 focused source/store/browser-contract tests pass, including exact cutoffs,
stale history, unchanged request caps, DX-only acceptance, PSK/RBN rejection,
malformed/duplicate parameters, and explicit browser window confirmation.
Lint/typecheck/production build and required publish checks validate the final
revision. No rendered UI changes or application/hardware servers in this slice;
the list integration will receive its own browser verification. No collector,
modeling or renderer internals changed.


## Production contract check — 2026-09-07

PR #576 merged as `ba2a0568`. The exact production deployment reached READY on
`propulse.cloud`. One anonymous request with `windowMinutes=120&limit=10` returned
HTTP 200, source `dxcluster`, status `ok`, windowMinutes 120, staleAfterSeconds
1800 and ten reports. Observation time was 20:09:00 UTC and retrieval time
20:10:28.974 UTC. This establishes the deployed query/metadata contract and an
available bounded sample, not complete two-hour history or the purge schedule.

The optional authenticated retention audit returned HTTP 401. Automatic approval
review rejected further Keychain inspection as credential probing after that
failure; inspection stopped without another credential path or mutation. The
repository migration defines a direct `spot_history_live` view, two-hour table
retention and job `spot_history_two_hour_window` at `*/15 * * * *`. Production
cron configuration remains unverified.

Final publication gates passed 426 app files / 3,713 tests, plus the normal
station harness, bridge/daemon, lint, build and bundle checks. #473 is closed as
superseded. The strict feed adapter also supports the independent bridge fix's
distinction between a failed REST request and a successful empty response.
