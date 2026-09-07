# B24 cluster report evidence

Tracks issue #232 / HW-72. Branch `feat/hamclock-b24-cluster`.

The wall's existing DX cluster list now opens in `WallReport` with its title bar, pin/unpin, focus return, and standard footer. The footer labels its timestamp LAST SPOT; it does not turn a polling time into a fresh observation. The shared shell supports a body-only report by omitting the hero and assigning the body its own flexible grid row.

The specification names `ClusterDetailPopover`, but that component is now a nonmodal geographic collection. Its behavior and tests are preserved. The actual wall entry point was `ClusterTile` → `DetailModal` → `DXSpotList`, and that is the path updated here.

## Preserved content and navigation adjustment

All existing cluster filters, search, worked/needed indicators, row actions, selected-spot details, and source handling remain in the same list component. Its ordinary presentation retains scrolling. HamClock opts into measured paging: complete rows fit the available space; Previous/Next and the existing Home/End/arrow navigation reach the loaded list. The shared row measurement accounts for divider borders on later rows, which otherwise caused a partially clipped final row.

Paging is the minimum navigation adjustment needed to reconcile the spec's chrome-only intent with its no-scroll rule. It does not introduce a new feed, engine strip, or cluster configuration model. Existing filter and row typography is preserved; broader configuration/display work remains in B11/#250.

## Verification and limits

- Focused tests: report adoption and pin handoff, existing wall tiles/reports and geographic popover behavior; a new divider-border row-fit regression.
- Local Chromium, disposable returning-operator context, synthetic N0TEST/EM38, Flat projection, default text size and DPR 1. Fixture DX REST feed: empty and 80 spots. Other background feeds use normal dev paths; no login, sync, bridge service, or hardware was created.
- Pulse/Classic/Brass at 1920×1080 and 3840×2160: no outer or paged-row overflow, no page errors. Previous/Next, Home/End, Escape/focus return, and pin/unpin pass. Expanded filters plus selected-spot details also fit at 1080p.
- Lint and production build pass before PR; repository pre-push checks run the full app suite and bundle budgets.
- Managed session owner `hamclock-b24-cluster`, ID `48abf0ff-db21-4cb6-926c-62730de8db41`, local `http://127.0.0.1:5181/map`, checkout `/Users/crypticpy/Projects/propulse/.worktrees/hamclock-b24-cluster`.
- Deployed/authenticated and physical-monitor checks remain pending. HW-72 is partial until those are accepted.

[1080p](../images/hamclock-b24/cluster-1080p.png)

Review follow-up: page ranges are anchored by absolute row offset, so changing row heights cannot change the first unseen row after Next. The footer names the visible ROWS range rather than an unstable page number. ArrowDown/ArrowUp after a page change initialize focus within that range. Added two range regressions and verified Next→ArrowDown in the disposable browser, along with the full prior display matrix.

The report shell mounts eagerly to capture the opener and make the background inert before the heavy list chunk loads. HW-72 is recorded as Partial in both tracked registers. Aggregate counts must be reconciled when other B24 register updates merge. The last-page regression also covers 71 spots with one remaining row; changing measured capacity cannot move that page offset.

## Integration with the operating-view stack

The `feat/hamclock-cluster-report-integration` branch locally integrates the
existing #410 implementation on top of #473. This is an integration for review;
no GitHub PR was merged. It keeps the newer activation/PSK/WSJT-X report styles
and the row helper's per-render child observation, while adding Cluster's
body-only report shell and paging. No renderer or modeling files changed.

Twelve focused report/paging/row-helper tests, lint and production build pass.
Isolated Chromium verifies Cluster and PSK together in Pulse/Classic/Brass at
1080p and 4K (12 combinations), plus expanded Cluster filters and selected details.
Previous/Next, Home/End, Next→ArrowDown, pin/unpin, Escape/focus return, and PSK
SHOW ON MAP all pass; no measured overflow or page errors. The screenshot above
now shows this integrated revision. Existing fixed-pixel Cluster typography is
preserved by the chrome-only slice; B11/#250 and physical-TV readability
acceptance remain separate work, not implied by these fit checks.

This run uses fixture API responses, synthetic N0TEST/EM38, a disposable browser
context and blocked non-HMR WebSockets. No hardware services, login or production
writes. Session owner `hamclock-cluster-report-integration`, ID
`6712657f-83cf-4d2b-9c60-1c61ee96b1a2`, local
`http://127.0.0.1:5181/map`, isolated worktree of the same name. Server identity
was checked before testing. The list's metadata/history/expiry integration
remains the next serialized slice.
The integration server is stopped; its exact claim was released after verifying
the absent PID and free IPv4/IPv6 port. Other agents' sessions were untouched.
