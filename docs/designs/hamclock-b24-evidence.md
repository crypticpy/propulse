# B24 delivery evidence

## HW-71: Recent Contacts report

Implementation: [PR #407](https://github.com/crypticpy/propulse/pull/407), `feat/hamclock-b24-codex`. Opens from the existing Recent Contacts
tile; its list keeps the active-session/today scope, while the report explicitly
summarizes the local logbook's UTC calendar periods (Monday-start week). The
30-day chart also includes the complete current month in summary queries, so a
31-day month does not lose its first day. Day selection changes the detailed
summary; calendar counters remain explicitly labeled. Pinning retains selection.

Counts use canonical identities and newest revisions. Best DX uses both recorded
QSO grids; missing grids do not remove a contact from counts or invent a position.
DXCC uses a recorded entity first, then the existing callsign resolver, with the
unresolved count shown. Distances follow the display's unit preference. Last
contact selection explicitly sets/centers its logged map target; it never tunes.

The report refreshes on local log events and polls every 15 seconds, including
background windows. The footer labels the local read time; it does not represent
cloud-sync freshness. Empty, older-only and failed-log states differ, and failed
refreshes retain data with an explicit notice. No application log writer changes.

Validation on 2026-09-06:

- Final pre-push full suite: 366 files / 3,210 tests passed, including indexed
  range/month-boundary coverage.
- Lint, TypeScript and production build passed. Bundle budgets checked separately.
- Disposable Chromium, fixture station N0TEST / EM38, sixty synthetic logged QSOs,
  Flat map; 1920×1080 and 3840×2160, DPR 1, Pulse/Classic/Brass. Six combinations
  have no measured report head/lead/body/box/footer/control overflow or page errors.
- Keyboard day selection and Escape focus return passed. Component tests cover
  day/month selection, map target, deletion refresh, missing log and retry.
- Pulse headline initially exceeded its line box; final compact count/unit layout
  removes the overflow without changing shared report headline styles.

[1080p Pulse](../images/hamclock-b24/recent-contacts-1080p.png) ·
[4K Brass](../images/hamclock-b24/recent-contacts-4k.png).

Server: owner `hamclock-b24-codex`, session `7a01a06a-f9f7-496c-802b-a827c4f0e4ec`,
`http://127.0.0.1:5181`, local profile, checkout
`/Users/crypticpy/Projects/propulse/.worktrees/hamclock-b24-codex`. Identity verified
by the browser script before use. Browser contexts are disposable and closed by
the script. Only this task's server may be stopped by this task.

Remaining acceptance: deployed-revision review, physical viewing-distance review,
real signed-in cross-device sync and the sustained wall soak. Local fixtures do
not establish these. B24 remains open for HW-70 Band Activity and HW-72 cluster
chrome; this slice does not claim their completion.
