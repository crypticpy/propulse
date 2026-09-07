# Cluster bridge ingestion — issue #288

This slice follows PR #475 and fixes dropped bridge reports. React can batch multiple transport messages into one `lastMessage` render; a second cluster observer also previously replaced shared history with its own shorter buffer. Both failures were reproduced by regression tests before the change.

Every report now enters through `useBridge.onMessage`. Default consumers atomically merge into the current shared cluster snapshot, deduplicate the bridge report ID, preserve newest-first order, and enforce age and row bounds. Independently filtered consumers keep their own bounded buffer. REST publication rechecks current ownership so a stale render cannot overwrite a newly arrived bridge report. Invalid identities, frequencies, dates, and optional field types are rejected before source promotion.

## Validation

- Both original ingestion regressions failed against PR #475 and pass with this change.
- Sixteen focused hook/history/validation tests pass.
- Full app suite: 391 files / 3,420 tests pass. ESLint and the production typecheck/build pass.
- A disposable Chromium context at 1920×1080 used the real, unmodified WebSocket hook with Playwright-intercepted bridge sockets. A mocked cluster-status handshake established readiness before reports were sent. Two initial reports survived; opening the report added a consumer without erasing history; the third report and a duplicated fourth report left exactly four rows. An invalid negative-frequency report was ignored. The report showed BRIDGE and Escape restored opener focus. No page errors occurred.
- Browser session: owner `hamclock-cluster-ingest`, local profile, port 5181, session `85ffa339-1651-4f51-bdee-d895ccd3a12a`. Bridge sockets were mocked without connecting to a service; no radio command or real hardware verification was involved.

This addresses the shared-history finding on PR #475 in the serialized follow-up stack. It does not establish real bridge/network throughput or physical display performance.
