# Wall-Display Competitor Tool Profiles

**Collected:** 2026-08-29 · profiles of the tools hams actually name for shack/wall displays (sourced from product sites, GitHub, reviews). Companion to `docs/plans/PLAN-WALL-DISPLAY-AND-PARITY.md`.

## 1. HamDashboard (VA3HDL)
- **What:** configurable single-file HTML dashboard arranging ham/weather widgets, images, maps, embedded pages into a grid.
- **Model:** fully client-side (`hamdash.html` + `config.js`), free/open-source, self-hosted from any folder/Pi/Pages host.
- **Standout:** zero backend, zero build; grid cells hold images (with slideshow timers), maps, iframes; per-tile auto-refresh. Lowest barrier to entry in the category. Multiple forks exist.
- **Weak:** raw JS config, no product polish, fragmented forks.
- **Rotation:** purpose-built grid + per-tile rotation timers — that *is* its value prop.
- va3hdl.com/projects/ham-dashboard · github.com/VA3HDL/hamdashboard

## 2. HamDash (hamdash.com)
- **What:** free community-run real-time browser dashboard — "the always-on monitor for your radio shack."
- **Model:** cloud-hosted, free, donation-supported (G0LIW); no account, callsign stored locally.
- **Standout:** eight pre-built dashboard views (home, bands+map, operator tools, space weather, field & weather, activations, SDR receiver, ISS); draggable panel layouts; **SDRCOM — browser-based RTL-SDR via WebUSB** (AM/FM/SSB/CW, waterfall, FT8 decode) with no separate SDR software; AI-assisted propagation predictions.
- **Weak:** Chrome-only for SDR; central-infrastructure dependency; name collisions.
- **Rotation:** named pages you switch manually — not unattended rotation.

## 3. TimeMapper UHD
- **What:** Windows program rendering a customizable 4K world map + greyline + multi-timezone clocks — explicit digital Geochron.
- **Model:** native Win 10/11, paid + 30-day trial, local.
- **Standout:** 25 base maps × 60 layers; 6,000+ satellites; **imports ADIF/Cabrillo (3 logs simultaneously) and live N1MM feed to plot QSOs**; **ultra-wide maps to 720° longitude for multi-monitor spans**; NCDXF beacons.
- **Weak:** Windows-only, paid, needs 4K to be legible.
- **Rotation:** one very wide canvas, not page cycling.

## 4. Simon's World Clock (sdr-radio.com)
- **What:** free Windows world-map/greyline clock, a ham's from-scratch Geochron alternative.
- **Standout:** greyline, live DX plotting, rotator support, satellite tracking (main + 10 secondary), custom map images.
- **Weak:** rough UI (author's own admission), thin docs/support.
- **Rotation:** single dedicated full-screen map appliance.

## 5. HamVision (hamvision.net)
- **What:** subscription web suite (clubs/DXpeditions): "Chrono" shack dashboard + QSO/QSL system + rig-bridge.
- **Model:** browser, paid (~€20/yr) + requires paid QRZ XML for full value (PD2TX).
- **Standout:** Chrono designed for dim-shack viewing; DX/POTA/SOTA/WWFF + APRS trackers on one map; SFI/SSN/K, MUF, VOACAP, aurora oval during storms; **location-based severe-weather popups**.
- **Weak:** subscription in a free-dominated category; thin public documentation trail.

## 6. HamTab (hamtab.net)
- **What:** modern self-hosted open-source browser dashboard, marketed as "the free HamClock alternative."
- **Model:** Node.js, macOS/Linux/Windows/Docker/Pi, MIT, donations.
- **Standout (steal these):** **LAN settings sync — every browser/device on the local network shows the same configured layout automatically**; export/import settings as a portable text code; multiple saved layout profiles; grayscale + text-scaling accessibility; CAT/CI-V rig control in-dashboard; ADIF import.
- **Weak:** requires Node/self-host competence; young project.
- **Rotation:** LAN sync effectively solves multi-screen fleets — configure once, all screens match.

## 7. The Holy Cluster (holycluster.iarc.org)
- **What:** modern map-first DX cluster (IARC team) — live map instead of telnet text.
- **Model:** browser, open-source, free, no login.
- **Standout:** spots as map pins; color-coded band-open bar; continent/prefix filters; polar/azimuth display; **CAT control server from the browser cluster page**; aggregates telnet + RBN + PSKReporter.
- **Weak:** young, unbranded domain, SPA-only.

## 8. POTA CAT (potacat.com)
- **What:** free open-source desktop app aggregating POTA/SOTA/DX/RBN/PSK/FreeDV/WSJT-X/DXpedition spots with **one-click spot→tune via Hamlib** (200+ rigs).
- **Standout:** click-to-tune workflow; built-in logging; FT8; **remote station operation (audio/PTT/logging) from a phone browser via self-hosted web UI** (K3SBP).
- **Weak:** operator tool first, not an ambient display.

## 9. Gray Line Ham Clock (Microsoft Store)
- **What:** free Windows big-digit clock + greyline globe + ham widgets (SFI, A/K, WWV, DX/RBN/POTA).
- **Standout:** extreme font/scale configurability (font size 4–1000) with freely repositionable widgets — adapts to any screen; **RBN spots of *your own* signal**; NASA SOHO imagery.
- **Weak:** Windows Store only; small public footprint.

## 10. World Monitor (worldmonitor.app)
- **What:** free open-source AI-powered "global intelligence" dashboard (non-ham): conflict, markets, shipping, aviation, cyber, news on a live 3D globe. 59K GitHub stars.
- **Model:** hosted PWA, Tauri desktop, or self-hosted (AGPL + commercial).
- **Standout (analogs to steal):** 56 toggleable layers on one globe; **"daily AI brief"** synthesizing noisy feeds into plain language; **"Scenario Engine"** ("what happens to routes/markets if X") — propagation analog: "what happens to my paths if this CME hits."
- **Weak:** non-ham data; overload risk; no first-class kiosk/rotation mode found.

## 11. OpenHamClock (github.com/accius/openhamclock)
- **What:** actively-developed open-source HamClock successor (original ceased functioning June 2026). MIT, free, 28+ contributors.
- **Model:** self-hosted Node/React (Linux/macOS/Windows/Pi/Docker/Railway) or hosted openhamclock.com (enter callsign and go).
- **Standout:** three switchable layouts — Modern, Classic (retro continuity), and **EmComm** (ARES/RACES/SKYWARN ops layout: APRS, NWS alerts, FEMA feeds, shelters, net rosters, point-to-point messaging, designed to keep working over RF when internet is down) — **the single most distinctive idea in the set**. 30+ panels, 22 rig-control plugins, WSJT-X, audio alerts.
- **Issue-tracker signal (by engagement):** VOACAP prediction accuracy (#887, #1050); rig control reliability (WSJTX multicast #846 — 33 comments; Rig Bridge PTT #707 — 32 comments); Flex Radio API (#469 — 30 comments); Docker image (#190 — shipped). Most-requested historical feature: **a real replacement for classic HamClock's Live Spots view (#1134, 30 comments)** — migrating users want parity above all. Open issues now skew accessibility (WCAG contrast #1112, screen-reader audit #997).
- **Rotation:** explicit mode switching (operator picks a persona), not timed rotation.

---

## PATTERNS

1. **Free/self-hosted wins the popularity race.** Every tool with traction is free (donation-supported at most). The one subscription product has the thinnest community trail. Paying for a shack dashboard is a hard sell.
2. **Zero-setup beats configurability — until trust is earned, then configurability retains.** "One HTML file" and "enter your callsign and go" win first-run; HamTab/OpenHamClock's deep customization wins retention.
3. **Geochron aesthetics are the category's visual language** — greyline map + big clock is what "ham wall display" *means*, more than any specific widget.
4. **LAN/multi-screen sync is a real, underserved need.** HamTab's LAN sync is the only clean answer to "three monitors around the shack"; everyone else assumes one screen.
5. **Rig integration and prediction accuracy are the two hardest, most-wanted problems** (OpenHamClock's top issues by engagement) — exactly the two things PropPulse is best positioned to win.
6. **EmComm mode is a differentiator nobody else copied yet.**
7. **The map is the product** — every tool's anchor is the live map; panels orbit it.
