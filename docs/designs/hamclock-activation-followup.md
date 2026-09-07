# Activation integration follow-up — #285

This slice migrates unchanged version-5 Spots right rails from the former EmComm slot to Activations. It uses the existing shipped-layout comparison, preserves custom rails and the Weather EmComm slot, and increments persisted layout version to 6. It addresses review comment 3945585543 on PR #415.

The selected activation card shows original-source attribution, includes it in copied/QSO context, and retains 1 Hz frequency display precision. Its clock closes expired selections even during provider failure, without altering the radio or QSO draft. Changed expiry/source metadata refreshes the selected report. This completes the selected-card follow-up from the CANParks slice.

Validation: 58 targeted tests pass, including old-layout migration/custom preservation, precise frequency labels, and expiry under per-provider or request-wide failure. Browser fixtures at 320px, 1080p and 4K verified original-source attribution, precise explicit tuning, minimum 44px controls and focus return. Advancing the clock beyond expiry closed the card while provider requests returned 503. [Selected card](../images/hamclock-activations/detail-provenance-1080p.png).

An actual `/map` session seeded with the former version-5 shipped rail received Activations. The browser also pinned SOTA, switched to CANParks and retained UNPIN/pressed state; the stable pin identity fix itself is in PR #415. No page/list overflow was observed in this focused 1080p check. The parent CANParks slice records the full 30 programme/theme/resolution matrix.

Managed local session: owner `hamclock-activation-followup`, id `2ef7c5a6-b39b-4ace-9a32-66851547f208`, port 5181, isolated worktree `.worktrees/hamclock-activation-detail-expiry`. Synthetic data; hardware transports blocked. Production rendering before merge and physical-display acceptance remain pending.


Compact sidebar review follow-up (PR #416 comments 3945620024 / 3945629717): the grid now allocates one column per feed and uses narrow padding so all six labels fit at 280/320/384px. Browser geometry checks confirmed a shared row, no tab overflow and End-key focus on CANParks. Local session owner `hamclock-activation-followup`, id `32da24da-d89a-401b-8da5-f18c92732efc`, port 5181; isolated fixture and blocked hardware.


## Combined release validation — 2026-09-07

The refreshed WWBOTA, CANParks and activation detail/migration slices preserve their separate 9/15/9-file PR boundaries. Per-slice focused checks passed (23 WWBOTA and 28 CANParks tests); the combined expiry/detail/store suite passed 81 tests. The final browser matrix passed all 30 programme/theme/resolution combinations at 1080p/4K. Separate fixtures verify existing-layout migration, cached row expiry, selected-detail expiry/provenance, precise tuning, and six sidebar tabs fitting at 280/320/384px with keyboard End reaching CANParks. No page errors or measured overflow.

Tests run in isolated browser contexts with hardware WebSockets blocked, on owner `hamclock-operating-release`, session `cb106b4a-e997-4847-a861-5a997bbac11d`, local http://127.0.0.1:5186, checkout `.worktrees/hamclock-operating-release`. Reproduction scripts: `tmp/activation-final/matrix.mjs`, `tmp/activation-final/check.mjs`, `tmp/activation-detail/check.mjs`, `tmp/activation-sidebar/check.mjs`. These checks use synthetic provider snapshots, not a real radio or authenticated account. Existing previews are preserved.
