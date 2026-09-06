# Activations wall — #285

This UI slice stacks on #414's source timing contract, using the common tuning stack #411–#413. #285 remains the sole active implementation batch. The report currently covers the existing POTA, ParksnPeaks SOTA and WWFF adapters; WWBOTA/CanParks are still separate source work and the whole issue remains open.

The shipped Spots & Activity page adds Activations in the right-rail slot previously occupied by a duplicate EmComm tile. EmComm remains on Weather & Emergency, and the existing four-left/five-right slot limits are preserved. Counts describe loaded reports in the two-hour window, with unavailable programme counts shown as unknown. The newest rows show callsign, reference, band/mode, age and an explicit Tune action. The tile's report opener and tune actions remain separate targets. A rail containing Activations divides its growing tiles using a fixed zero flex basis, preventing the number of rendered rows from feeding back into the measured available height.

The centred report has programme tabs, at most five facts, measured newest rows and a complete screen-reader table. Successful empty feeds, missing source timing, stale retrievals and failed providers remain distinct. The footer uses the selected programme's successful retrieval time, never the aggregate completion time. Observation ages remain per spot. Cached rows expire after the original two-hour source window. Tuning uses the current reported kHz value and mode; UNKNOWN modes request frequency only. Pinning retains the selected programme.

## Validation

- Helper tests cover expiry, latest report per programme/call/reference, source failures and missing/old timestamps. Report tests cover the accessible table, explicit precise tuning, successful-empty versus unavailable programmes and use of the source's own timestamp.
- Existing page/preset/registry checks pass with the new tile. Typecheck passes; full lint/test/build/bundle gates run before publication.
- Local browser fixture uses N0TEST/EM38, 30 POTA reports, successful empty SOTA, unavailable WWFF, and 30 synthetic cluster spots. External hardware WebSockets are blocked; only the owned Vite HMR connection is allowed. No radio or bridge service is started.
- Report matrix: all three programmes × Pulse/Classic/Brass × 1920×1080 and 3840×2160. No report, panel or list overflow. Tile containment is checked under the same theme/resolution changes with a populated neighbouring cluster. A visually hidden wrapper contains the table's intrinsic height.
- Tile and report Tune actions stage 7,074,125 Hz / USB. Tile tuning does not open the report. Identity text and controls do not overlap. Escape returns focus to the opener; pin/unpin retains SOTA selection and closes correctly.
- Screenshots were visually inspected. Physical-distance readability and authenticated production checks remain pending; local fixtures are not provider or hardware acceptance.
- Owned local session: `hamclock-activations-wall`, `716519d2-46df-4d2d-b2ee-4602b62981d5`, `http://127.0.0.1:5181/map`, checkout `.worktrees/hamclock-activations-wall`.

[1080p report](../images/hamclock-activations/report-1920.png) · [4K report](../images/hamclock-activations/report-3840.png) · [1080p tile](../images/hamclock-activations/tile-1080p.png)
