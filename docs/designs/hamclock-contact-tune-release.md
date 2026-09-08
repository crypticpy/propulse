# Recent Contacts tuning release evidence

This current-main extraction preserves the merged Recent Contacts report and
contact metadata. It adds the shared guarded `TuneButton` to each visible tile
row and to the report's last-contact and best-DX summaries. Tuning uses the
logged frequency and mode; it never infers frequency from the band. The tile
continues to open the report through its separate full-tile control.

Validation on 2026-09-07:

- `NODE_OPTIONS=--no-experimental-webstorage npx vitest run
  src/components/map/hamclock/wall/reports/RecentContactsReport.test.tsx
  src/components/map/hamclock/wall/tiles/RecentContactsTile.test.tsx
  src/components/radio/TuneButton.test.tsx`: 3 files, 18 tests passed.
- `npm run lint` passed with zero warnings.
- `npm run build` passed (`tsc -b` and the production Vite/PWA build).
- A disposable Chromium fixture on the owned local-profile session verified
  exact `14.074125 MHz CW` staging, no report opening from the tile tune action,
  keyboard report opening, two report tune actions, Escape dismissal, and no
  bounded report-content overflow or page errors at 1920×1080 and 3840×2160.
  WebSockets were blocked; no bridge, radio, provider, or cloud service was used.
- Review follow-up permits zero rendered contact rows when a crowded custom rail
  cannot fit a complete row. A mounted-tile browser resize check reduced the
  tile until its caption honestly read `TOP 0 OF 1 · TODAY`, then restored room
  and observed the same tile recover its row and `TOP 1 OF 1 · TODAY` caption.
  This follow-up used owned session `80d50b3e-b16e-4f51-be0f-f4b529245b94`
  at `http://127.0.0.1:5197`; it was stopped after the check.

Managed browser session: owner `hamclock-contact-tune-release`, id
`58c6cb9b-b5f7-4dc6-8567-782f2b644fd5`, local profile,
`http://127.0.0.1:5196`, rooted at `.worktrees/hamclock-contact-tune-release`.
The repository-wide HamClock fixture reached the wall but stopped at its stale
`Home region` selector on current main, so the focused fixture supplied the
contact-specific browser evidence.

Physical viewing-distance and real connected-radio acceptance remain external
follow-ups. This check stages a tune request only and performs no hardware action.
