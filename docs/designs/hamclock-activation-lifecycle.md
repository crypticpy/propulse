# Activation lifecycle corrections

A selected activation could disappear when its old report expired in the same render that a renewed report arrived. The detail card now adopts the current report for the same stable activation identity before evaluating expiry. An expired report still closes when no current replacement exists; renewal does not tune a radio or create a QSO.

Disabled activation consumers also retained a shared clock subscription. The hook now starts its ten-second expiry clock and periodic refetch only while enabled, and clears the timer when disabled. Re-enabling immediately refreshes the local expiry time.

This is the isolated activation portion of #505, extracted onto current main in four source/test files. Cluster bridge timestamp and source/runtime work remain outside this slice; #505 is not fully superseded.

Validation: both new regressions fail against current main before the correction (selected renewal becomes undefined; disabled consumer keeps rendering), then all 14 focused hook/detail tests pass. These tests cover enabled/disabled transitions alongside a one-second clock, source outages, expiry, renewal and unchanged QSO/radio state. Normal lint/build/release checks run before publication. No hardware service or database mutation is involved.

Browser component checks also pass at 320px, 1080p and 4K on owned local session `71adea1c-8d2d-4e55-90d5-7aec37cfabcb`, owner `hamclock-activation-lifecycle-release`, http://127.0.0.1:5196. The actual detail component retains usable 44px tuning targets, exact staged frequency/mode, Escape focus return and expiry closing, with no browser errors. Fixture enrichment and hardware WebSockets were blocked. The renewal race and disabled-clock behavior are established by the focused regressions above.
