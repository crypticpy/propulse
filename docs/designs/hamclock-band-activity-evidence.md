# B24 Band Activity report evidence

Implementation branch: `feat/hamclock-b24-activity-report`, based on the history endpoint in PR #408. Tracks HW-70 / issue #232; the batch remains in progress.

The report exposes BANDS, HISTORY, and TOP DX using the existing report shell and pin. BANDS sets map band filters. TOP DX centers a selected location, ranks the loaded cluster sample by distance from the active home, applies map filters, and excludes stale/future or approximate/unlocated spots. It does not claim a global ranking. The accessible table retains every ranked row while the visible list measures how many complete rows fit.

The scope switch changes all live counts together. Regional/path counts never share a chart labeled as scoped history when only global aggregates exist. HISTORY uses six **completed** global UTC hours; absent records remain unknown, including an unknown peak for empty or incomplete hourly coverage. The current trailing ten-minute count is separately labeled on BANDS. HISTORY switches to session-only current-hour samples: the latest server snapshot per ten-minute UTC slot, retained across report close/reopen. These trailing windows overlap; they are never summed into hourly totals or backfilled. Actual sample times are shown, future slots read NOT YET, and absent samples remain UNKNOWN. Live samples remain accessible if the completed-hour endpoint fails. Sixty-minute raw spot counts and twenty-minute deduplicated mode observations retain distinct labels.

## Local verification

- Managed owner: `hamclock-b24-activity-report`; session `54030af2-4f7b-48ad-a6e9-0e27945f723c`.
- Checkout: `/Users/crypticpy/Projects/propulse/.worktrees/hamclock-b24-activity-report`; local profile, `http://127.0.0.1:5182/map`.
- Disposable Chromium context; synthetic N0TEST / EM38, Flat projection, default text size, DPR 1. Fixture feeds: band activity, band history, DX cluster. Other background feeds may use normal dev routes.
- Automated browser checks: 1920×1080 and 3840×2160, Pulse/Classic/Brass, all three tabs; band filtering, DX targeting, Escape and focus return. No account, sync, or hardware connection was created.
- Regression tests cover report states, location/distance ranking, history validation and missing-data semantics. Full Vitest suite: 367 files / 3,222 tests pass. Lint and production build pass. Follow-up: all 48 combinations of views (including both chart modes), themes, resolutions, and hourly-endpoint success/failure report no overflow or page errors. The canonical HamClock band focus is verified alongside map filters. Three new rolling-series tests and two missing-source/partial-peak regression tests pass.

## Remaining acceptance work

HW-70 is partial until deployed/physical-display checks are completed. The existing endpoint cannot supply historical regional/path aggregates. Those are explicitly unavailable; switching to global is an operator action. This slice does not change the model, collector, durable schema, or 3D rendering.

A third HISTORY tab is a deliberate layout adjustment: twelve band actions plus a six-hour chart clipped the 1080p report. Separate tabs preserve readable controls and the no-scroll rule.

Screenshots show current-hour observations: [1080p history](../images/hamclock-b24/band-history-1080p.png), [4K history](../images/hamclock-b24/band-history-4k.png).
