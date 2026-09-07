# B10 — News configuration evidence

Issue #206, HW-36/HW-37. UI PR #480, server prerequisite PR #479. Branch `feat/hamclock-b10-codex` starts at
origin/main `19b75c8b`, independently of the earlier operating-view PR stack.

The existing B0 widget registry and schema-validated store are reused. The new
WidgetConfigDialog renders registered panels through useWidgetConfig, or an
existing-store adapter such as NewsFeedsConfig. News remains in feedStore;
10/15/30/60-minute polling preferences drive both RSS hooks, per-source age and
enabled controls remain authoritative, and manual refresh exposes fetched state.
The news gear opens the centered wall dialog. The older combined dialog routes
feed additions to the verified news flow; its alert and existing-feed controls remain.

Custom feeds require a successful server `verify=1` response with a parsed title.
The same URL/redirect/body/rate-limit boundary handles verification and reading.
An edited URL invalidates verification, including late responses for older input.
Empty titled feeds are accepted; HTML/untitled documents and blocked redirects
are rejected. Item count is the normalized bounded sample (at most 50), not a
claim about every historical item. The existing five-feed add limit remains;
longer legacy collections paginate two rows per NEWS tab without scrolling.

## Validation

- 40 focused tests cover handler validation, URL races, persistence defaults,
  polling options, disabled sources and long-list pagination.
- Full `npm run verify`: 365 app files / 3,210 tests, Python/archive checks,
  bridge tests, 10 daemon tests, lint, production build and bundle budgets pass.
  The initial sandbox run could not bind a disposable daemon-test port; the
  authorized rerun passed without starting a real daemon or hardware service.
- Disposable Chromium: 30 cases across 1920×1080 and 3840×2160, pulse/classic/brass,
  preferences/source/add tabs and nine-source pagination. No dialog overflow or
  page errors. Verify-before-add, parsed title saving, persisted 30-minute timing,
  disabled-source manual refresh, fetched timestamp and Escape focus restoration
  pass. Five mocked RSS requests; browser accesses only the app RSS endpoint.
- After screenshot review, unfetched state says UNKNOWN and each source shows its
  URL. The complete browser matrix passed again after that correction.

Browser session: owner `hamclock-b10-codex`, profile local, port 5181,
ID `91de6a57-d5b6-4874-b530-6bc20b5e9ce0`. All non-HMR WebSockets were blocked.
Feed/API responses were fixtures; no real RSS availability, account sync, radio
hardware or physical display readability is claimed.

![News sources at 1080p](../images/hamclock-b10/news-config-1080p.png)


Acceptance follow-up: the older combined dialog's unverified add form was removed
in favor of the verified news handoff. A regression checks the absent URL form,
handoff callback and retained alert controls; 17 targeted UI tests pass. The
server verification is isolated in PR #479 (`feat/hamclock-b10-feed-verify`, two files),
with the UI stacked on that prerequisite to keep register updates within the
15-file PR limit. No additional batch is claimed.


The legacy-entry-point browser rerun also passed the complete 30-case matrix,
with no unverified URL form, successful handoff to NEWS FEEDS, and Escape focus
restored to the original combined-settings gear. This used local owner
`hamclock-b10-codex`, port 5181, session
`59d38514-abb4-4dfe-b40c-d68c3d0380ea`; its server was stopped after verification.
The prerequisite PR #479 separately passed full verification: 364 app files /
3,205 tests plus the remaining required checks.

Final UI push verification passes: 365 app files / 3,211 tests, with all remaining required gates passing. Register statuses in this branch describe the delivered behavior upon merge; the board remains In review until maintainer acceptance.


## Review corrections

PR #479 now checks the actual RSS/Atom document root after declarations/comments,
rejecting HTML with feed-like script/comment text. Verification failures use
no-store responses, including timeout, non-2xx, oversized body and blocked
redirect cases; 26 handler tests pass. The prolog check avoids redundant token
alternatives. Server head: e8e09970.

PR #480 routes Home's custom-feed additions through the same verified dialog,
preserving Home's active-feed selection. Controlled tabs select a remaining page
when the final feed on a page is removed. UI fix: 5c15a351; integrated head
587641d2. Full required checks pass: 365 app files / 3,214 tests.

A disposable Chromium harness rendered the real NewsFeedCard through Vite's
normal TSX transform with the real query provider. It verified add gating,
successful verified add and active selection, removal of NEWS 2's sole feed with
NEWS 1 remaining visible, and Escape focus restoration. Three mocked RSS
requests, zero page errors. This is component/browser evidence, not a signed-in
Home-page test: the full Home personal-panel gate was not changed or bypassed.
Session owner hamclock-b10-codex, local port 5181, ID
452c6275-8046-4e69-a4d5-8c3ebf43ea38; server stopped after the check.

## Release integration

The UI stack was merged without committing onto `origin/main` at `7c80fe48`,
which already contains the two-file RSS verification prerequisite. The three
textual conflicts retained the current theme-token and masthead settings work,
while keeping the verified Home and legacy-dialog handoffs. The resulting diff
remains the original 15 UI/evidence files.

Focused integration verification passed 57 tests across RSS verification, feed
persistence/querying, the wall configuration dialog, ticker settings and ticker
rendering. Lint and the production build also passed. A fresh disposable browser
run repeated the 30-case wall matrix and 30-case legacy-entry matrix at 1080p/4K
in pulse/classic/brass, with five mocked RSS requests and zero page errors. The
Home component harness again verified add gating, active selection, page-removal
recovery and focus return with three mocked requests and zero errors. The managed
local session used owner `hamclock-config-release`, port 5187, ID
`769dd284-16fc-4677-8e04-6d346949138f`; feed responses remained fixtures and no
account, database, radio or physical-display service was used.
