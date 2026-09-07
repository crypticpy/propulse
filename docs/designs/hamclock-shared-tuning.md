# Shared tuning delivery — issue #286

Branch `feat/hamclock-shared-tune`. This is the active implementation item; B24 remains in review.

`TuneButton` is the common visible affordance for a target frequency. It is absent when CAT is off; unavailable bridge/rig states display a disabled reason. Wall rendering uses the existing HamClock control and theme tokens, including in portals. Normal rendering keeps a 44-pixel minimum target. Frequency labels preserve Hz precision rather than rounding every target to the nearest kHz.

`queueTune` rechecks connection/configuration and display-only state at activation, then stages pending frequency and mode in one store update. It does not modify observed frequency/mode or claim acknowledgement from the radio. Explicit LSB, USB, CW and CWR modes are preserved; the existing shared mapping handles SSB/digital conventions.

## Covered in this slice

- Cluster spot rows: a persistent tune action row while CAT is enabled; the action no longer depends on hovering over a small icon. This trades density for a readable touch target.
- Selected-spot details: the same button and readiness logic.
- Spot alert toasts: explicit Tune action instead of tuning from the whole alert background.
- `applyLogIntent("tune")`: keyboard/context-menu and future adapter callers use the same guard and atomic staging. Unavailable rigs return an ignored result and leave no delayed command.

## Validation

- Unit regressions cover CAT-hidden, seeking/waiting, atomic pending frequency+mode, unchanged observed state, invalid frequency, display-only rejection, precise fractional-kHz target labels, explicit alert activation, mode preservation, and the ready/unavailable dispatcher paths.
- Local browser fixtures use synthetic N0TEST/EM38 and eight DX spots, Flat HamClock, default text size and DPR 1. Hardware WebSocket destinations are blocked; only the owned Vite HMR connection is allowed. No bridge service or hardware was started.
- BRIDGE OFF, BRIDGE SEEKING, RIG WAITING, and ready states pass. Activating 14.074 MHz FT8 stages 14,074,000 Hz + USB. Pulse/Classic/Brass at 1920×1080 and 3840×2160: target sizes are at least 44 px, no button clipping or browser page errors.
- Managed local owner `hamclock-shared-tune`, session `28743849-4764-4606-a4b9-e7aede867714`, `http://127.0.0.1:5181/map`, checkout `/Users/crypticpy/Projects/propulse/.worktrees/hamclock-shared-tune`.
- Production build and focused tests pass. Full app pre-push checks provide final lint/test/build/bundle evidence. An older adapter fixture was updated to require a ready rig instead of assuming disconnected commands can be queued.

## Remaining issue scope

This slice does not close #286. Next: apply the shared button to wall contact/activity reports and tile actions, activation and PSK/WSJT-X surfaces, map spot presentation, favourites, and satellite frequency controls. Validate the combined wall list with B24 paging (#410) after integration; this branch starts from main, where the old cluster dialog is still present. Preserve field units and source mode semantics for each caller.

AetherSDR/TCI target routing and the rig/SDR/both choice depend on the actual adapter. No unavailable SDR target is fabricated. Real radio acknowledgement and deployed/authenticated/physical-display checks remain pending and cannot be established by these fixtures.

[1080p shared action](../images/hamclock-tuning/shared-tune-1080p.png)


## Transport review follow-up

The sync hook now sends a single `rig.set` request, whose existing bridge handler awaits frequency then mode. One tune request stays in flight until its acknowledgement/error; a newer staged target waits without being erased by the older response. A disconnect clears pending tune commands. The hook keeps CAT configuration independent of the master bridge switch so BRIDGE OFF remains visible for a configured backend. Reverse CW stays `CWR` for Hamlib and becomes `CW-R` for direct ICOM, including an auto-detected ICOM backend from the connection acknowledgement.

The shared button imports its theme/control styles directly, so a fresh non-map route can render a portalled wall-style alert with the saved wall layout. Hook regressions cover combined dispatch, a second target queued during a request, acknowledgement clearing, auto backend normalization, frequency-only requests and disconnect cleanup. These are mocked bridge protocol tests, not hardware acknowledgement evidence.


## Current-main release integration — 2026-09-07

Integrated with main `0ae6bda2`, preserving the current theme tokens while replacing the old toast hint and hover-only tuning action. The merge has 15 changed files against main. Lint, production build and 49 focused tuning/dispatcher/adapter tests pass. Six isolated Chromium cases cover Pulse/Classic/Brass at 1080p and 4K; all targets are at least 44px, no target clipping or page errors. Synthetic connection states cover BRIDGE OFF, BRIDGE SEEKING, RIG WAITING and ready. The ready action stages 14,074,000 Hz plus USB.

The adapted browser fixture seeds parsed synthetic DX records after the simulated rig transition; this validates controls and layout, not live feed retention. All hardware WebSockets remain blocked. Current test owner is `hamclock-operating-release`, session `cb106b4a-e997-4847-a861-5a997bbac11d`, local profile at http://127.0.0.1:5186/map, checkout `.worktrees/hamclock-operating-release`. Existing user previews at 5181 and 5182 are preserved.

The user authorized moving the reviewed operating stack toward release. Integration proceeds one dependency at a time; no new weather/model/3D batch is claimed. Hardware acknowledgement, actual account sync, deployed PSK coordination and physical-display acceptance remain separately pending.
