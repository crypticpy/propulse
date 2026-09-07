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

Screenshots now show integrated TOP DX tune controls: [1080p history](../images/hamclock-b24/band-history-1080p.png), [4K history](../images/hamclock-b24/band-history-4k.png).


## Operating/tuning integration — #286

The report is locally integrated on top of #513 in `.worktrees/hamclock-band-tune`,
branch `feat/hamclock-band-tune`. Additive stylesheet conflict resolution retains
all newer cluster/activation/PSK/WSJT-X rules and the existing Band Activity rules.
TOP DX rows now have separate map-selection and shared TuneButton controls, with
exact report frequency/mode and no nested buttons. Whole rows are measured after
data arrival; the accessible table still contains the full ranked sample.
Bridge reports use the existing sixty-second clock tolerance, while REST remains
strict. Reports more than sixty seconds ahead are excluded.

TOP DX names its home-relative sample and uses the cluster source's own status
and timestamp (last observation for bridge, retrieval time for REST). It no
longer borrows the live-activity headline, facts or freshness. The list report
layout gives contact rows the available space. Pinning preserves the selected
view. BANDS/HISTORY retain their existing scope, counts and missing-data semantics.

Twenty-eight focused tests cover report/history states, precise tune staging,
map selection independence, asynchronous rows and source-specific timestamps.
Disposable Chromium fixtures cover 48 cases: four views × three themes × two
resolutions (1080p/4K) × available/unavailable stored history. Populated TOP DX
rows, disabled bridge controls, valid ISO feed metadata, band selection and
Escape focus return are verified. No overflow or page errors occurred. The 503
history case explicitly shows HOURLY HISTORY UNAVAILABLE while retaining the
separate current-hour samples view; no stored history is fabricated. All feeds
are synthetic, and hardware WebSockets are blocked.

Managed local test identity: owner `hamclock-band-tune`, session
`9b8d1f25-60b2-4e57-b8a8-238898eb9bcc`, origin `http://127.0.0.1:5181`, root
`.worktrees/hamclock-band-tune`. The user preview at 5182 is preserved. Full
required checks run before publication; deployed, actual-radio and physical
monitor acceptance remain pending. The integration stays within 15 files.
