# Favourite and activation tuning — #286

Stacks on PR #412, using the shared controls and reviewed bridge dispatcher from #411. #286 remains the active implementation claim.

Favourite frequency rows now expose an explicit Tune action. The text label itself does not tune. Strict decimal parsing accepts MHz by default, or explicit MHz/kHz/Hz units, and rejects mixed frequencies, suffix junk, negative/zero values and unsafe magnitudes. Invalid saved text produces a disabled INVALID FREQUENCY action. A missing/Other mode requests frequency only rather than choosing a radio mode on the operator's behalf.

The selected activation dialog adds the same action using its current report frequency in kHz. The existing stable-identity refresh logic continues to update the selected report, so a provider frequency change is reflected in the button. Tuning leaves the dialog and QSO draft unchanged. Both surfaces keep their compact presentation and the shared 44-pixel minimum target; this does not implement the future wall activation report.

## Validation

- 22 focused tests pass across parsing, favourite actions and the activation dialog. The activation regression refreshes 14.074 MHz to 7.074125 MHz and checks precise frequency/USB staging without changing the QSO draft.
- Focused browser fixture renders the real FavouriteFreqList and ActivationDetailPanel with synthetic N0TEST/US-1234 data in the query cache. External enrichment endpoints return fixture failures; hardware WebSockets are blocked. No bridge service or radio is used.
- 320×800, 1920×1080 and 3840×2160: favourite valid/invalid controls and activation action retain at least 44-pixel targets, with no clipped button text or viewport overflow. Both actions stage 7,074,125 Hz/USB; Escape closes the activation dialog and returns focus to the opener. No browser page errors.
- Screenshot was visually inspected. Provider availability, physical displays and hardware acknowledgements are outside this fixture's evidence.
- Managed local owner `hamclock-tune-favourites`, session `0f95c61a-afd8-4e42-aaa9-c2ac47bd5723`, URL `http://127.0.0.1:5181/tmp/tune/index.html`, checkout `.worktrees/hamclock-tune-favourites`.
- Full lint/test/build/bundle gates run before publication; the PR records the resulting counts.

[Activation action at 1080p](../images/hamclock-tuning/activation-tune-1080p.png)

Remaining shared-tuning work includes wall contact/activity/tile actions, decode surfaces, and the adapter-dependent SDR target. Activation programme expansion remains its own later batch; this slice adds the action to the existing selected report only.
