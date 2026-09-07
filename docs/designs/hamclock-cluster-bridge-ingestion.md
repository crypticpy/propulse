# HamClock cluster bridge ingestion follow-through

This bounded #288 follow-through carries the remaining shared bridge behavior
from #505 onto current main without importing its obsolete stacked base.

## Behavior

- `useDXCluster` consumes `cluster.spot` through `useBridge.onMessage`, so React
  batching cannot collapse multiple transport reports into one `lastMessage`.
- Every observer atomically merges into the existing bridge-backed `dxStore.spots` snapshot.
  Report IDs deduplicate, timestamps sort newest first, the configured age and
  10–200 row bounds apply, and a new observer cannot replace existing history.
  The first eligible bridge report replaces REST rows rather than relabeling
  them; an already-expired first packet leaves the working REST source intact.
- The pure bridge adapter validates required strings, optional transport text,
  positive finite frequency, and a parseable timestamp before conversion.
- Bridge reports tolerate at most 60 seconds of future clock skew through
  ingestion, shared merging, hook filtering, and the passive wall tile. REST rendering
  retains a zero-tolerance upper bound.
- A ten-second, enabled-only expiry pass removes aged bridge rows while the
  source is quiet. Late REST results cannot overwrite a newer bridge snapshot;
  cached or successfully empty REST results publish after fallback.
- The shared snapshot remains a source-domain value. No view runtime,
  preference, selection/follow, renderer, or persisted store schema changed.

## Verification

- `npx vitest run src/lib/hamclock/clusterBridge.test.ts src/hooks/useDXCluster.test.ts src/hooks/useDXCluster.ingestion.test.tsx src/components/map/hamclock/wall/tiles/tiles.test.tsx`
  — 4 files, 55 tests passed.
- Isolated browser smoke at `http://127.0.0.1:5197/map?__clusterFixture=1`
  rendered the actual HamClock cluster tile and report with a fresh row and a
  row 60 seconds in the future; invalid and expired fixture rows were absent.
  The report contained 2 rows, paging controls stayed bounded, and the browser
  console had no errors. The temporary fixture was removed after the check.
- `npm test` — station harness 24/24; Vitest 424 files, 3647 tests passed.
- `npm run lint` and `npm run build` passed.
- Physical bridge acceptance remains a follow-up; validation did not start
  radio or bridge hardware.
