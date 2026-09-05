# Home dashboard refinement

Implemented September 5, 2026, following feedback on the previous [Home elevation](HOME-ELEVATION-EVIDENCE.md). This document supersedes that release's layout and optional-panel behavior.

## Delivered behavior

- A full-width, frequency-ordered band grid leads with current reception/cluster reports, reporter coverage, dominant mode, and an explicit 20-minute window. Phone begins with common bands and offers all available bands. Missing, stale, and failed reports remain unknown, not closed.
- Solar outlook, local model weather, and calculated daylight share an aligned supporting row. Solar remains global; weather and daylight follow Home's chosen location. Official forecasts and current readings have distinct labels and source states. The next-24-hour Kp summary includes an ongoing three-hour predicted interval.
- Guests can open Home without signing in and choose a 4/6-character grid or approximate browser location. No automatic geolocation request. Signed-in operators follow their saved station unless they choose a Home override. Location is saved in the browser and does not mutate the station.
- Advanced dashboard expands observed mode counts and a modeled 12-hour path outlook. Target, mode, power, simplified antenna, and noise assumptions are editable. Saved station antenna/noise and configured power are used when available. Solar forecasts are matched to their validity intervals; held-current fallbacks are explicit. Missing current inputs withhold estimates. Terrain, pointing, amplifier/feedline effects, and the far-end station remain simplified and disclosed.
- Optional panels have visible previews, explicit View/Add to Home/Remove from Home controls, and a plainly named Show more information panels disclosure. Saved phone panels stay visible. Personal station/log details have a separate disclosure.
- Home uses soft gray-blue foregrounds, muted cyan/amber, readable 14px supporting labels and 16px body text, clear numerals, 44px primary controls, focus rings, and reduced-motion support. This implements the requested low-light preference; it is not a medical accessibility claim.

## Guest boundary and compatibility

Public Home mounts a separate read-only shell, with no personal radio services, operating monitor, setup wizard, log services, or personal history/countdown panels. Guest nearby reports use public PSK/RBN only, excluding cached cluster and WSJT-X data. Profile-bound optional panels explicitly require a saved Profile location. Guest clocks have a public default selection.

Authenticated desktop/mobile shells retain their existing navigation and hardware behavior. Anonymous registered wall displays and `/display/*` registration retain their existing display-sync shell, including Home scenes. Password recovery and private-route authentication remain covered.

## Verification

- Full unit suite: 271 files / 1,589 tests passed before the final display-shell regression addition. The three added shell tests and all six AuthGate tests then passed; the pre-push hook reruns the full suite on the committed result.
- Production-build Home browser suite: 21 applicable checks; the duplicate phone viewport sweep is intentionally skipped. Covers current/stale/error/empty evidence, keyboard controls, saved phone panels, station/location changes, operating policy, model assumptions, and 390/834/1440/2560px layouts with large text and reduced motion.
- Configured-auth guest browser suite: desktop and phone passed using a disposable invalid auth service, no real account or tokens. Saved bridge settings caused no WebSocket connections; personal panels were withheld; grid selection and nearby disclosure worked; `/log` showed the login form. Local development's unconfigured-auth bypass was not used for this check.
- Build, lint, and bundle budgets passed. Two independent source reviewers identified the guest boundary, ongoing Kp interval, noise/antenna assumptions, and small-label issues; these were addressed. Follow-up review caught the display-shell exception, now covered by regression tests.

Screenshots use disposable source fixtures, not live conditions: [desktop](screenshots/home-dashboard/desktop.png), [phone](screenshots/home-dashboard/phone.png), [advanced](screenshots/home-dashboard/advanced.png), [guest](screenshots/home-dashboard/guest.png).

Release CI, bot review, merge, and production verification are recorded on the pull request. No live radio commands are part of validation.
