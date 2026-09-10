# Map animation batching evidence

Captured 2026-09-05 on Chrome 152 / ANGLE Metal / Apple M5 Max, 1280 × 800,
one disposable browser tab, managed local-profile server, Auto display quality.
Synthetic station EM38, Tokyo target PM95, both paths (4 short / 10 long hops),
ionosphere highlights enabled, 200 fixture cluster reports. Solar and ancillary
feeds remained live. Other user Chrome tabs were running; these are bounded
regression measurements, not an isolated machine performance benchmark.

## Same-fixture comparison

| Scene | R3F subscribers before | After | Draw calls before / after | Triangles before / after |
| --- | ---: | ---: | ---: | ---: |
| All paths | 104 | 38 | 160 / 160 | 109,424 / 109,424 |
| Isolated target | 88 | 22 | 145 / 145 | 102,720 / 102,720 |

Median requestAnimationFrame interval stayed approximately 16.7 ms in each
120-frame sample. P95 ranged from 17.2 to 17.6 ms. This demonstrates reduced
subscription overhead and preserved scene work, not a proven frame-rate gain.
Isolate removes the live scene work (15 draw calls and 6,704 triangles here),
while retaining both target paths and their bounce highlights.

A separate feed-refresh check exercised four newly arriving animated traces.
The shared subscription count stayed at 38, and isolation removed those traces
and reduced the count to 22. Static hydration intentionally does not replay
existing reports as arriving traces.

## Implementation and checks

Each ray path and animated trace collection owns one R3F frame subscription.
Child callbacks register for the mounted lifetime and use their latest committed
props. Disabled marker animations unregister, including reduced-motion reflection
pulses. Geometry, trace caps, feed limits, and display-quality budgets are unchanged.

Focused tests cover multiple child callbacks sharing one subscription, current
callbacks after rerender, disabling/re-enabling, and cleanup. Existing ray tracing
and spot-layer policy tests cover path geometry and isolation policy.

To repeat the browser check, read `docs/guides/LOCAL-AGENT-TESTING.md`, start an
owned managed local server, then run from the same checkout:

```sh
node scripts/profile-map-animation.mjs http://127.0.0.1:5180
```

Use the exact allocated URL. The script verifies server ownership and requires a
real GPU before opening the globe. It uses one disposable Chrome context, waits
one normal feed-refresh interval, samples isolation off/on, and smoke-tests flat
and azimuthal target context. JSON and screenshots go to ignored
`tmp/map-animation-check/`. It closes its browser; the server remains owned by
its original terminal. This is fixture UI evidence, not real login, hardware,
full-density live PSK/RBN stress testing, or a physical wall-display certification.
