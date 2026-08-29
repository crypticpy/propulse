# Wall Display Community Signals (2024–2026)

**Collected:** 2026-08-29 · web research across Reddit, QRZ, RadioReference, GitHub, ham blogs, plus a Facebook "ham info wall" thread supplied by the owner. Companion to `docs/plans/PLAN-WALL-DISPLAY-AND-PARITY.md`.

Context: HamClock creator Elwood Downey (WB0OEW) became a Silent Key Jan 29, 2026; the clearskyinstitute.com backend shut down permanently June 2026, forcing an active, fast-moving migration. This produced an unusual amount of fresh, concrete community signal — a wave of new open-source and commercial competitors (OpenHamClock, HamDash/HamDashboard×3, HamTab, POTACAT, HelioClock) all racing to capture the same displaced user base PropPulse would be competing for.

## 1. CONTENT — most-named must-have panels (ranked by mention frequency)

1. **DX cluster / live spots** — named in nearly every dashboard description and forum thread as core; OpenHamClock users specifically complained the layout can't be changed away from a default DX-cluster-first view. (github.com/accius/openhamclock discussions #282)
2. **Space weather / propagation** (solar flux, K-index, X-ray flux/flares, aurora, DRAP absorption, MUF/VOACAP predictions) — universal across every competitor. (dxradar.com/blog/hamclock-alternatives, helioclock.com/features)
3. **Greyline / world map with solar terminator** — called out explicitly as something HamClock had that early alternatives initially lacked, and a top ask when it's missing.
4. **POTA / SOTA (+ WWFF / WWBOTA) activation feeds** — now standard in every 2026-era competitor; POTACAT streams "seven sources automatically including POTA, SOTA, DX Cluster, RBN, PSK Reporter, FreeDV, WSJT-X decodes, and DX Expeditions." (w4zbb.org/2026/02/24/what-is-potacat)
5. **Satellite / ISS tracking** — explicitly requested with Doppler correction ("If we had satellite frequencies in realtime, we could use OHC to define correct frequency to any satellite, just selecting it in the map" — OHC discussion #306); OpenHamClock has an open issue for satellite pipeline resilience hardening (#1165).
6. **Contest calendar** — bundled in HamDash, OpenHamClock, HamTab as a standard panel.
7. **Rig integration / on-air status / click-to-tune** — hot, explicitly requested in the OpenHamClock rig-control discussion: "Clicking spots in the DX Cluster or POTA panels automatically tunes the radio," "The HUGE ON AIR is great." Users also asked for live FREQ/Power/SWR readouts. (OHC discussion #306)
8. **Local/general weather + radar** — NEXRAD radar, METAR, GOES cloud/lightning, tides, UV index, tropical storms; framed by HelioClock as core value for portable/POTA-adjacent ops and general situational awareness.
9. **Non-ham "situational awareness" content** — earthquakes/volcanoes, wildfire/air-quality, FAA weather cameras, a markets panel (stocks/crypto) and live news/alert crawl are explicit HelioClock differentiators aimed at a "NOC/ops-team" audience — evidence some buyers want a general command-center screen, not a ham-only one. The Facebook info-wall thread confirms: members show local air traffic (ADS-B), news feeds (worldmonitor.app), weather radar, and even joke about the debt clock.
10. **CW trainer / desk reference / EME planner / NCDXF beacons** — niche but present as differentiating "extras" in the higher-end commercial product.

**Takeaway:** the baseline expected feature set has converged hard — DX cluster + space weather + greyline + POTA/SOTA + satellites + contests is table stakes across every 2026 alternative, not a differentiator. Rig control/click-to-tune and non-ham "ops center" content are where products are trying to stand out.

## 2. BEHAVIOR — static vs rotating vs grid vs alerts

- **Grid/mosaic of live cards is the dominant paradigm**, not page rotation. OpenHamClock, HamDash, HamTab, and HelioClock all present a single always-visible dashboard of simultaneous panels ("40+ configurable panels" for HelioClock) rather than cycling full-screen pages.
- The older "info wall" pattern — Firefox Tab Rotator / Vivaldi tiled tabs cycling through "scores of pages" — is a workaround from before consolidated dashboards existed; generic tab-rotator extensions are still what people reach for when no single dashboard covers everything.
- **Alert break-in is explicitly demanded and marketed**, not a nice-to-have: HelioClock's pitch centers on "alerts that break through the moment something happens," with custom alert rules + audio tones that trigger only on escalation (step-up deduplication so refreshes don't spam).
- Layout **customization/persistence** is a recurring complaint vector: OpenHamClock users wanted config that persists which panels/layout show, syncs across viewing devices, and doesn't reset to a DX-cluster default: "I love the classic layout on a 7-inch screen, but I can't change the default windows." (OHC discussion #282)

## 3. HARDWARE

- **Raspberry Pi (3/4/5)** is the single most-mentioned platform — repeatedly described as the primary use case for driving a dedicated monitor.
- **Small-form-factor x86 mini PCs** (Intel N100-class, 4GB+) are an equal-tier alternative; the Facebook thread's builds run Win 11 minis driving 3+ monitors.
- **Repurposed/legacy hardware**: Inovato Quadra (sold for HamClock) being repointed at OpenHamClock; old Android tablets, spare monitors, smart-TV browsers all viable since browser-based dashboards need no install.
- **Fire TV Stick / smart TV kiosk**: generic pattern is a kiosk browser (Fully Kiosk) pointed at a dashboard URL; known limitation is "no self-healing — if the browser crashes or network drops, there's no watchdog process to restart it" — exactly the reliability gap HelioClock markets against with its watchdog timer.
- **Number of screens**: typically **one dedicated screen** per documented install; multi-screen walls exist (the Facebook thread's whole premise) but are DIY exceptions that commercial vendors are now targeting.
- OS/browser: overwhelmingly **browser-based, cross-platform**.

## 4. PAIN POINTS

- **Existential dependency on a single volunteer/company backend** — the defining pain point of the era after HamClock's collapse. Now the top-cited reason to prefer architectures with no single point of failure. (k9zw.wordpress.com/2026/01/29/hamclock-depreciated)
- **Setup complexity for self-hosted options**: OpenHamClock self-host requires Node v20.19+, git clone, `npm ci`, hand-editing a hidden `.env` — "can be tricky to get running if you're not comfortable with GitHub/Docker" (Mike VE9KK). Docker is the "zero-config" middle path.
- **Stale OS packages**: "Ubuntu 24.04's `apt install nodejs` is too old and will not work."
- **Reliability bugs in the new crop**: black-screen/gateway errors on openhamclock.com; HamClock screen-blanking bugs on Pi.
- **Fixed/awkward resolution and small-screen layouts**: OpenHamClock designed for 1920×1080+; 7" users complained about lack of layout control.
- **Accessibility gaps**: open OHC issues for WCAG AA contrast failures (#1112) and a screen-reader audit (#997).
- **RFI/QRM from monitors and shack electronics** — persistent, structural objection to adding more always-on electronics near the operating position (hardware-domain, but informs guidance docs).
- **Battery safety** objection to repurposed-tablet displays running 24/7.
- **Subscription fatigue actively marketed against**: HelioClock's promo is literally titled "Stop Paying a Subscription."

## 5. MULTI-DISPLAY demand

- Direct community-thread evidence of multi-display *centralization* is thin, but the market is responding: HelioClock sells a **$499+ multi-display server SKU**, contrasting itself with OpenHamClock/HamClock which "require separate browser instances or additional hardware per screen."
- Today's de facto workaround: one Pi/mini-PC driving two HDMI outputs via desktop-level dual-monitor extension, or (Facebook thread) a Windows mini PC + tab-rotator hacks + tiling window managers.
- HelioClock's lighter answer: **Remote View** — LAN-browser access at `helioclock.local` with automatic settings sync — one canonical dashboard, many viewing surfaces.
- Net read: latent demand validated by a commercial SKU, not yet served by any grassroots solution. Whitespace.

## 6. SELF-HOSTING sentiment

- Genuinely split and situational:
  - **Ease-first / cloud-leaning** (majority of casual commentary): "for a one stop shopping I would recommend Open ham clock. Enter it in your browser and you are ready to go" (VE9KK) — recommending the hosted zero-install path.
  - **Data-independence / resilience** (emerging strongly because of the HamClock collapse): HelioClock markets directly at the anxiety — "Every unit fetches data directly from public sources like NOAA and USGS, with no Helioclock server standing in between."
  - The practical middle ground people adopt: OpenHamClock offers **both** — identical software, switchable deployment. The community wants *choice/portability* more than ideological self-hosting.
- **Bottom line for PropPulse**: the HamClock shutdown made "what happens if the vendor disappears" a live, front-of-mind question in this community. A cloud SPA competing here should expect to be asked directly about data-source independence, offline/degraded-mode behavior, and exit options — even by users who prefer hosted convenience.
