# Station and satellite tune controls — #286

This slice stacks on PR #411 (`feat/hamclock-shared-tune`). The issue remains the sole active implementation claim; this is not the remaining queue's completion.

The DX WorkStationPanel uses the common guarded TuneButton. Its former local mode conversion incorrectly chose LSB for digital spots below 10 MHz. Shared mapping now stages USB for a 7.074 MHz FT8 target. Actions wrap in a narrow panel.

Both existing satellite detail presentations pass their calculated receive frequency through SatelliteTuneButton. Frequency is converted from Hz to kHz at the boundary and rounded back to whole Hz when queued. Explicit FM transponders request FM. Linear/digital/mixed categories do not uniquely identify the desired rig mode, so these request frequency only. `mode: null` explicitly leaves the observed mode unchanged and clears any previously pending mode command. There is no uplink, PTT, or automatic tracking action. Orbital calculations, transponder data and globe internals are unchanged.

These existing compact panels explicitly use normal 44-pixel controls, even if the map's saved layout is HamClock. They are not wall reports and do not inherit large wall typography into their fixed-width containers. Future full wall reports can use the wall variant.

## Evidence

- Shared button and mode mapping tests: 17 passed, including five new FM/frequency-only satellite cases. Tests verify whole-Hz staging and clearing a previous pending mode without changing observed rig mode.
- Focused browser component fixture renders the real WorkStationPanel and SatelliteTuneButton. It verifies 7.074 MHz FT8 → 7,074,000 Hz/USB and 435.123456 MHz unspecified receive mode → 435,123,456 Hz/no mode command.
- Ready and RIG WAITING states at 320×800, 1920×1080 and 3840×2160, under all three saved wall themes: 18 combinations, both buttons at least 44 pixels, no clipped button content or viewport overflow, no browser page errors. The compact controls intentionally keep normal styling across themes.
- Fixture is an isolated component page, not an end-to-end satellite propagation/provider test. Hardware WebSocket destinations are blocked. No bridge service or radio was used.
- Owned local session: `hamclock-tune-surfaces`, `d30bf747-0938-4883-a8ba-e85904df35a6`, `http://127.0.0.1:5181/tmp/tune/index.html`, `.worktrees/hamclock-tune-surfaces`.
- Full lint/test/build/bundle gates run before publishing; final counts are recorded in the PR.

[Focused station/satellite fixture](../images/hamclock-tuning/satellite-station-fixture.png)

Remaining #286 work includes wall contacts/activity/tile actions, activation/decode and favourite surfaces, plus the adapter-dependent SDR target. Real hardware acknowledgement and full satellite presentation acceptance remain pending.
