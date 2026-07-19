# SDR Console Audit — 2026-07-19

Full-surface code review of the SDR console (~22,300 lines): `src/pages/SdrConsole.tsx`, `src/stores/sdrStore.ts`, `src/components/sdr/**` (incl. Classic/Flexible/Fate skins, overlays, shared, primitives), the audio/DSP + rig-control hooks, the FT8 decode pipeline, and `src/lib/sdr/**`. Seven parallel deep-review passes, findings verified against source. Baseline `npm run build` was green before any changes.

Severity: **Critical** = breaks the page or a whole feature · **High** = a user-visible feature silently wrong · **Medium** = wrong under common conditions, or a real leak/perf drag · **Low** = latent bug, minor drag, or cleanup.

Status legend: `FIXED` · `DEFERRED (reason)` · `WONT-FIX (reason)`.

---

## Critical

| # | Finding | Where | Status |
|---|---------|-------|--------|
| C-1 | **Infinite render loop in device picker** when a discovered daemon's last address probe fails (unreachable/stale mDNS address). Inline `onDevices`/`onError` callbacks re-created every render + probe effects depending on them re-fire `onError` → `setFetchState` new object → loop → React "Maximum update depth exceeded" unmounts the tree. Also perpetually resets the 12 s enumeration timeout. | `DevicePicker.tsx:89-168` | FIXED |

## High

| # | Finding | Where | Status |
|---|---------|-------|--------|
| H-1 | **PSK Reporter uploads timestamped 1970-01-01.** `new Date(d.time)` where `d.time` is ms-since-midnight-UTC, not epoch. Every reception report uploaded is ~56 years in the past. Same latent bug in `pskReporterUploader.addEnrichedDecode`. | `useFt8Decoder.ts:83`, `pskReporterUploader.ts:162` | FIXED |
| H-2 | **FT8 session stats permanently zero.** `ft8SessionStore.recordDecode` (the only mutator of totalDecodes/uniqueCallsigns/uniqueCountries/uniqueGrids/bestDx) has zero callers. Stats dashboard renders 0s; Best-DX card can never appear. | `ft8SessionStore.ts:330`, `Ft8StatsDashboard.tsx` | FIXED |
| H-3 | **FT8 waterfall markers horizontally misplaced.** `Ft8DecodeOverlay` maps audio Hz (200–3000) across 100% of an RF waterfall that spans ≥10 kHz; decodes occupy ~28% of the view near the dial but get smeared edge-to-edge, with full-height guide lines implying alignment. | `Ft8DecodeOverlay.tsx:115-161`, consumer `ClassicSkin.tsx` | FIXED |
| H-4 | **Flexible skin: wheel-tune over the top spectrum dead all session.** Listener effect runs once while the `hasFft`-gated container ref is still null and never re-runs (stable dep). | `FlexibleSkin.tsx:602-614` | FIXED |
| H-5 | **Fate skin: SNR trend corrupted and time-reversed.** Ingest re-walks the newest-first 500-cap buffer with only a scalar `lastCycleId` guard → history ring fills with duplicated garbage; sparkline drawn time-reversed; trend arrows inverted. | `useFateSnrTrend.ts:70-99` | FIXED |

## Medium

| # | Finding | Where | Status |
|---|---------|-------|--------|
| M-1 | Frequency input clobbered while typing: sync effect keyed on `connectedState` object identity, which changes on every periodic `radio:state` push. | `SdrConsole.tsx:968-983` | FIXED |
| M-2 | Passband-detail zoom waterfall normalizes radio (dBm) bins against the audio dBFS range whenever the audio FFT is active → wrong contrast on the CI-V edges. SpectrumScope/Waterfall do it right; only PassbandDetail conflates. | `PassbandDetail.tsx:251-330` | FIXED |
| M-3 | Click/wheel tune (`useSmartTuning`) bypasses command tracking: raw send discarded, optimistic freq applied even when the WS isn't OPEN → UI shows a frequency the radio never went to. | `useSmartTuning.ts:164-169,214-219` | FIXED |
| M-4 | Mic/AudioContext orphaned if FT8 effect tears down while `getUserMedia` is pending (permission prompt) — device stays captured until reload. | `useFt8Decoder.ts:111,122` + audio source | FIXED |
| M-5 | FT8 decode-depth setting entirely inert: `ft8DecodeSensitivity.ts` has no callers; worker hardcodes `MAX_LDPC_ITER = 20` (below the "normal" preset). Normal/deep/aggressive do nothing. | `ft8DecodeSensitivity.ts`, worker, bridge init | FIXED |
| M-6 | RotaryKnob: no `onPointerCancel` → after a canceled touch gesture the knob keeps tracking pointer motion with no button held. | `RotaryKnob.tsx:117-136` | FIXED |
| M-7 | `Ft8DecodeOverlay` has no ResizeObserver; on container resize the stale bitmap is stretched for up to a full 15 s cycle; zero-size first mount draws nothing until next decode. | `Ft8DecodeOverlay.tsx:85-92` | FIXED |
| M-8 | Flexible skin: waterfall ResizeObserver never attaches (same `hasFft`-gated-ref trap as H-4); `waterfallHeight` pinned at 400 → FT8/time-axis labels mis-scaled. | `FlexibleSkin.tsx:616-629` | FIXED |
| M-9 | Flexible skin sends *normalized* mode tokens (`CWR`→`CW-R`) to the daemon while Classic sends raw device tokens → mode-set silently fails on rigs advertising compact tokens. | `SlicePanelFilter.tsx:60-84` | FIXED |
| M-10 | Flexible skin: 4 inline arrow handlers defeat `FlexVfoDisplay`'s `memo`; whole VFO subtree reconciles at the ~60 fps FFT stream rate. | `FlexibleSkin.tsx:748-779` | FIXED |
| M-11 | `FlexSideControls`/`FlexInfoTabs`/`FlexBottomBar` unmemoized while the skin re-renders per FFT frame — heaviest is FlexSideControls (band grid, accordions, MemoryPanel). | `flexible/*` | FIXED |
| M-12 | Fate skin: band-hop within 200 ms leaves the decoder stuck OFF (off-toggle fires, pending on-toggle canceled by effect cleanup). | `FateSkin.tsx:277-293` | FIXED |
| M-13 | Fate skin: QSO fade/hide timers cleared+rescheduled on every decode batch → FT4 fade never fires; faded rows stuck invisible occupying visible slots. | `FateDirectedMessages.tsx:324-373` | FIXED |
| M-14 | Fate skin: UTC-midnight rollover breaks decode ordering, staleness marking, and QSO expiry (`time` is ms-since-midnight; deltas go hugely negative). | `useFateDecodes.ts`, `useFateQsoTracker.ts:332-340`, `FateBandActivity.tsx` | FIXED |
| M-15 | Fate skin: `useMemo`s mutate refs (seen-callsigns, SNR ingest, QSO tracker) — discarded/double-invoked renders corrupt state (StrictMode kills NEW badges; doubles H-5 corruption). | `useFateDecodes.ts`, `useFateSnrTrend.ts`, `useFateQsoTracker.ts` | FIXED |

## Low

| # | Finding | Where | Status |
|---|---------|-------|--------|
| L-1 | Redundant per-frame Zustand writes: `setFftEnabled(true)`/`setAudioEnabled(true)` on every frame. | `SdrConsole.tsx:516,522` | FIXED |
| L-2 | `sdrStore.lastAudioFrame` is dead state (audio frames route through refs). | `sdrStore.ts:8,25-31` | FIXED |
| L-3 | `skinProps` memo depends on the whole `smeterById` map → rebuilds on any device's S-meter tick. | `SdrConsole.tsx:1246,1444` | FIXED |
| L-4 | Duplicate `stream:fft:start` after reconnect (resync path + auto-start effect race). | `SdrConsole.tsx:399-407,990-1006` | FIXED |
| L-5 | `useSdrSettings` reads settings keys with no fallback while the settings modal applies `??` defaults — two surfaces disagree when persisted store predates a key. | `useSdrSettings.ts:78-134` | FIXED |
| L-6 | Waterfall appends a duplicate row when tuning/minDb/view change without a new frame (drag a passband edge → waterfall scrolls too fast). | `Waterfall.tsx:665-677` | FIXED |
| L-7 | `GAMMA_LUT_CACHE` unbounded — gamma slider drag mints thousands of retained LUTs. | `waterfallPalette.ts:228-247` | FIXED |
| L-8 | Same palette LUT indexed with `round` (Waterfall) vs `floor` (PassbandDetail) → subtly different colors for identical data. | `Waterfall.tsx:554`, `PassbandDetail.tsx:339` | FIXED |
| L-9 | Per-frame `createImageData` in the Canvas2D fallback path. | `Waterfall.tsx:651` | FIXED |
| L-10 | Spectrum fill/glow gradients rebuilt every vsync though inputs change rarely. | `SpectrumScope.tsx:897,914` | FIXED |
| L-11 | Audio binary frame parse lacks the even-length guard the FFT branch has → malformed frame throws instead of dropping. | `protocol.ts:418-422` | FIXED |
| L-12 | Pending command IDs never time out — lost acks accumulate for the connection lifetime. | `useRadioCommands.ts:81-104` | FIXED |
| L-13 | EQ Q clamped on one write path but not `handleUpdateEqBand` (invariant lives in the widget, not the mutation). | `useEqBands.ts:67-114` | FIXED |
| L-14 | `useAudioFft`: unreachable teardown branch + double throttle (worker FRAME_MS and maxFps gate on independent clocks). | `useAudioFft.ts:118-127` | PARTIAL — dead teardown removed; the maxFps gate was kept deliberately (documented public option a future caller could set below the worker's 20 fps) |
| L-15 | FT8 decode list auto-scroll dies once the 500-cap buffer saturates (effect keyed on `length`). Same pattern in Fate band activity + directed messages. | `Ft8DecodeList.tsx:50-54`, `FateBandActivity.tsx:625`, `FateDirectedMessages.tsx:511` | FIXED |
| L-16 | Decodes-per-cycle sparkline can't show zero-decode cycles and trails by one render (ref mutated post-render). | `Ft8DecoderPanel.tsx:69-77` | FIXED |
| L-17 | IndexedDB FT8 history persisted without freq/band/myCallsign (`ft8AddDecodes(decodes)` called bare). Same on the WSJT-X external-decode path (dial tracked via ref from WSJT-X status). | `SdrConsole.tsx:135, 495` | FIXED (both paths) |
| L-18 | Native decodes mislabeled `source: "bridge"` (bridge stamps `instanceId` on native decodes too). | `useFt8DecodeEnricher.ts:146` | FIXED |
| L-19 | `memoryStore` persist has `version: 1` but no `migrate` — a future bump would silently wipe saved memories. | `memoryStore.ts:105-110` | FIXED |
| L-20 | Spot overlay clips to `maxSpots` in array order, not by age/relevance. | `SpotTagOverlay.tsx:158-160` | FIXED |
| L-21 | Band-edge markers suppressed whenever center freq sits in an inter-segment gap (60 m channelized gaps). | `BandPlanOverlay.tsx:162-163` | FIXED |
| L-22 | `DspBadge` glow hardcoded green regardless of `activeColor`; interpolated `bg-${color}` classes are Tailwind-JIT-fragile (also `GainSlider` `accent-${color}`). | `DspBadge.tsx:57-58`, `GainSlider.tsx:138` | FIXED |
| L-23 | `sliceFlagLeft` re-implements `computePassbandHz` inline (verified identical today; drift risk). | `FlexibleSkin.tsx:647-704` | FIXED |
| L-24 | `FlexSmeter.tsx` dead code (never imported; real meter is shared `SmeterBar`). | `FlexSmeter.tsx` | FIXED (deleted) |
| L-25 | `Ft8WidebandDecoder` dead code (~390 lines, never imported; also carries a mislabeled monotonic counter). | `ft8WidebandDecoder.ts` | FIXED (deleted) |
| L-26 | Freq-axis center-tick highlight `hz === centerHz` essentially never true in float Hz. | `FlexFreqAxis.tsx:102` | FIXED |
| L-27 | `audioEnabled` prop passed to `FlexBottomBar` but never consumed. | `FlexibleSkin.tsx`/`FlexBottomBar.tsx` | FIXED |
| L-28 | Two parallel mode-normalization/sort implementations (root cause of M-9). | `FlexibleSkin.tsx:46-124`, `SlicePanelFilter.tsx:60-84` | FIXED |
| L-29 | `FlexTimeAxis` doesn't round `speed` like Waterfall does; stale `fps = 20` default (all callers pass 60). | `FlexTimeAxis.tsx:58,89` | FIXED |
| L-30 | Fate: QSO report sent/received attribution inverted (parser's `senderCallsign` is actually the addressed station). Latent — fields not rendered yet. | `useFateQsoTracker.ts:255-303` | FIXED |
| L-31 | Fate keyboard: Space/C/D swallowed on focused buttons/links (only input/textarea/select exempted). | `useFateKeyboard.ts:138-159` | FIXED |
| L-32 | Fate audio meter AudioContext never `resume()`d — reads silence on browsers that start suspended. (Second `getUserMedia` on the decoder's device also contends — see Deferred.) | `FateSkin.tsx:62-95` | FIXED (resume) |
| L-33 | Spectrum line widths drawn in device px, not scaled by the 0.6–1.25 render DPR (EQ overlay in the same file does scale). | `SpectrumScope.tsx:962 et al.` | FIXED |

## Deferred (conscious decisions, not fixed in this pass)

| Item | Why deferred |
|------|--------------|
| Decouple `lastFftFrame` from `skinProps` so the skin tree stops re-rendering per FFT frame (route frames via refs/context to canvas consumers only). | Architectural change to the skin contract; M-10/M-11 memoization recovers most of the cost. Right follow-up after device testing. |
| Fate meter should tap the FT8 decoder's audio graph instead of opening a second `getUserMedia` on the same device. | Requires exposing the decoder's graph across hooks; `resume()` fix applied meanwhile. |
| `getBoundingClientRect()` per pointermove in scope/waterfall hover paths. | Real but small (no re-render storm); caching a rect risks stale-rect bugs with scroll — punt. |
| Half-bin center convention in `fillFftCrossfade` (`-0.5` term) — display could be shifted half a bin (~525 Hz wideband) if the daemon reports cell-centered bins. | Self-consistent across all renderers; needs verification against the daemon's actual FFT layout during device testing. |
| Bridge-side 30 s FT8 dedup window suppresses alternate-cycle repeat CQs (WSJT-X shows every cycle). | Behavior decision, bridge-side; flag for device testing. |
| `centerHz − spanHz/2` view math re-implemented ~6 places (consistent today). | Extracting a shared helper is a refactor best done with the skin-props decoupling above. |

---

## Fix plan (executed in this order)

1. **Wave 1 (parallel, disjoint files)**
   - Core: C-1, M-1, L-1..L-5, L-17
   - Rendering: M-2, L-6..L-10, L-33
   - Audio/rig: M-3, L-11..L-14
   - Overlays/primitives (+ ClassicSkin plumbing): H-3, M-6, M-7, L-19..L-22
   - Flexible skin: H-4, M-8..M-11, L-23, L-24, L-26..L-29
2. **Wave 2 (sequential — shared FT8 types/bridge)**
   - FT8 pipeline: H-1, H-2, M-4, M-5, L-15 (list), L-16, L-18, L-25 — including adding an absolute-epoch timestamp to decodes (feeds M-14)
   - Fate skin: H-5, M-12..M-15, L-15 (fate), L-30..L-32
3. **Verify**: `npm run verify` (tracked-artifacts + lint + build + bundle budgets) after each wave; one commit per cluster.

Every fix agent re-verified its finding against source before patching; anything that didn't reproduce was to be reported back, not patched.

---

## Execution notes (post-fix)

- **All waves executed and verified.** Lint (`--max-warnings 0`), the full vitest suite (267/267), `tsc -b` + Vite build, and bundle budgets are green on every commit. The bridge and Rust-daemon suites were skipped during the per-wave loops (neither component is touched; all changes are under `src/`) but both ran green in the full pre-push `npm run verify`.
- **Implementation choices worth knowing during device testing:**
  - M-12: fixed by clearing the decode buffer directly on band hop (`clearDecodes()`) instead of the off/on decoder flap — the decoder now stays running across band changes.
  - M-5: decode depth threads `maxIterations` into the worker's LDPC budget; `subtractionPasses`/`minSnr` are carried but the current WASM interface exposes no hook for them. Depth changes restart the decoder.
  - Epoch anchor: `WsjtxDecode.epochMs` (absolute ms) is stamped by the native bridge (cycle start) and fallback-stamped at store ingest. It is persisted to IndexedDB and restored on load; rows written before the field existed rebuild it from the record's ingest timestamp (PR #33 Codex review).
  - H-2: session stats are recorded once per new decode in `useFt8DecodeEnricher` via a marker-walk; IndexedDB-restored rows (`isNew === false`) are excluded.
  - L-6: the waterfall now appends rows only on new radio FFT frames — audio-FFT arrival no longer drives appends. Watch cadence on rigs whose CI-V scope streams slower than the audio FFT.
- **Extras fixed beyond the numbered findings:** dead `autoAudioStartRef` removed from `SdrConsole.tsx`; native decodes labeled via a shared `NATIVE_INSTANCE_ID`; dead `FlexSmeter.tsx` and `ft8WidebandDecoder.ts` deleted.
- **Final review pass** (completeness + principal reviewer over the full diff) caught two defects in the H-2 fix, both corrected: the stats recorder filtered on the enriched `isNew` (which means "unworked DXCC", not "live decode" — now carried separately as `isLiveDecode`), and the per-instance recorded-marker double-counted across the three views that mount the enricher (now module-scoped). Also added: eviction of stale fade/hide bookkeeping in `FateActiveQsos`. Known acceptable trade-off: a rig-command response arriving after the 10 s pending-id eviction (L-12) is treated as untracked — fine for localhost CAT latencies.
