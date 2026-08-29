# HelioClock Competitive Analysis
## Feature Overlap, Gap Assessment & Strategic Response

**Prepared:** August 29, 2026
**Classification:** Internal Strategy Document
**Sources:** helioclock.com (Home, Features, Comparison, For Hams, Demo, News, Screenshots pages, reviewed 2026-08-29), product screenshots, PropPulse codebase inventory (this repo, `research/helioclock-feature-gap` branch point `c4146ce9`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Profile](#2-product-profile)
3. [The "Did They See Our Code" Question](#3-the-did-they-see-our-code-question)
4. [Feature Comparison](#4-feature-comparison)
5. [Positioning Differences](#5-positioning-differences)
6. [Recommendations](#6-recommendations)

---

## 1. Executive Summary

HelioClock is **not a direct competitor in product category** — it is an offline, one-time-purchase situational-awareness **kiosk appliance** (Raspberry Pi SD card $39, bootable USB $39, turnkey appliance $299, multi-display NOC server $499+), while PropPulse is a cloud web application with accounts, sync, community, and a subscription tier. HelioClock explicitly benchmarks itself against **HamClock and OpenHamClock**, not against us; its marketing never mentions PropPulse.

It is, however, a **serious feature-surface competitor** for the "one glowing screen in the shack" use case, and its traction is real: it debuted at Huntsville Hamfest (Aug 22–23, 2026), sold out on-site and online, and reported a ~200-order backlog as of Aug 28.

Headline findings:

- **Overlap is broad but shallow.** Nearly every data layer both products share (terminator, DX cluster, RBN, PSK Reporter, POTA/SOTA, space weather, aurora, DRAP, lightning, quakes, fires, radar, GOES clouds, tropical, satellites/ISS, NCDXF beacons, Maidenhead grid) is a commodity sourced from the same public feeds. Neither product's moat lives there.
- **Their genuinely good idea is "Best Band Now"** — a per-QTH MUF prediction cross-checked against live DX Cluster + RBN activity, with 4-state logic (Confirmed / Likely / Surprise Open / Closed), hysteresis, and a public decision log. We have every ingredient to build a better version (a real ITU-R P.533 engine plus DX/RBN/PSK/WSPR feeds) and currently don't reify it into one headline verdict.
- **Our moat is everything after the glance:** logbook + LoTW/eQSL/QRZ/Club Log sync, awards, a full contest engine, POTA/SOTA activation workflow, nets/NCS tooling, operator profiles/community, CAT rig control, an integrated SDR console with FT8 decode, and a physics engine (P.533 ionosphere + ray tracing + SNR prediction) that outclasses their self-described "not a VOACAP replacement" MINIMUF-85 secant-law model. HelioClock has none of this — it is display-only.
- **True feature gaps on our side** are mostly cheap, keyless public-data panels: tides, UV index, moon phase, METAR, volcanoes, world clocks, DXpeditions, air quality, named countdown timers, a quick-reference overlay — plus two bigger differentiators: an **EME planner** and a **CW trainer**, and one structural one: a **kiosk/carousel display mode** for the always-on-screen use case they own.
- **On the code question:** nothing observable supports code-level similarity, and several things cut against it (different propagation model, different stack, different rendering approach). The aesthetic overlap (Orbitron, dark glass panels) is genre-standard. Details in §3.

---

## 2. Product Profile

| Attribute | Detail |
|---|---|
| Product | "Fully Customizable Live Earth Clock & Situational Display for Big Screen TVs and Monitors" — a fullscreen kiosk dashboard |
| Developer | Solo — KA9NWM, ~40-year broadcast meteorology / broadcast systems background, explicitly AI-assisted development |
| Born | **April 20, 2026**, as "EarthCron," a Fire TV project inspired by Geochron mechanical world clocks ($300–500 + $128/yr subscription — the thing it set out to undercut) |
| Public debut | Huntsville Hamfest / ARRL National Convention, Aug 22–23, 2026, booth #V55 |
| Traction | Sold out at the show and online; ~200-order backlog reported Aug 28, 2026 |
| Version | v2.14.4 / server.js v2.4.1 (from their own comparison-page changelog citation) |
| SKUs | Pi 4/5 SD card $39; bootable x86 USB $39 (both "launch special," normally $49); turnkey appliance $299; multi-display Pro Server $499+ (1U rack option) |
| Architecture | Node.js server on-device, browser-rendered UI, systemd, mDNS (`helioclock.local`), GitHub Releases auto-update with atomic swap, watchdog auto-recovery, OpenWebRX bolted on for the RTL-SDR receiver |
| Data model | **No cloud, no accounts, no subscription** — every unit pulls directly from public sources (NOAA, USGS, POTA, SOTA, CelesTrak, VAAC…); "if we disappeared tomorrow, your display keeps working" |
| Propagation model | MINIMUF-85 secant-law, self-described as "not a VOACAP replacement"; their own comparison concedes OpenHamClock's ITU-R P.533-14 engine is more rigorous |
| Design system | Dark UI, glass-panel transparency, gold/cyan/green palette; self-hosted **Orbitron**, Share Tech Mono, Barlow Condensed, IBM Plex Sans |
| UI paradigm | Mini Panels (MP) flanking the map → click for full Detail Panel (DP); "Carousel Mode" auto-rotates saved Favorite Arrangements (panel layout + layer toggle state); bottom news/alert crawl with audible break-in |
| Target markets | Hams first, then NOC/EOC/trading-floor/lobby signage (explicit) |
| Roadmap (their own "planned/in process") | Rig/rotator control, APRS EmComm dashboard, EAS/IPAWS alerts, Tiangong tracking, ADS-B via RTL-SDR, opt-in operator map, social sharing, WWV audio decode |
| Live demo | **Not yet public** ("coming soon"; was slated for HHF reveal) — only a 20-min video walkthrough |

---

## 3. The "Did They See Our Code" Question

Context: our repo was public for a period, and HelioClock's development window (April → August 2026) overlaps it. What the marketing site lets us assess honestly:

**Points of resemblance (all weak):**
- Orbitron display font and a dark, sci-fi "glass panel" aesthetic. Orbitron is the default "space dashboard" Google Font; HamClock descendants and half of the r/amateurradio dashboard projects use this look.
- Panel-flanked world map with terminator, DX cluster feed, space-weather tiles, bottom ticker — this is the **HamClock genre layout**, which we ourselves imitate deliberately (our globe ships a literal `hamclock` layout mode in `mapStore.ts`). Both products descend from the same ancestor.
- Broad data-layer overlap — explained entirely by both products consuming the same free public feeds (NOAA SWPC, USGS, FIRMS, NHC, CelesTrak, POTA/SOTA APIs).

**Points against code-level similarity (stronger):**
- **Different propagation core.** They run MINIMUF-85 secant-law and say so; ours is a custom ITU-R P.533 implementation (`ionosphere.ts` / `rayTrace.ts` / `signal.ts`). Nobody who had our engine would ship MINIMUF and then publicly concede a competitor's model is more rigorous.
- **Different architecture.** On-device Node kiosk with systemd/mDNS/GPIO/OpenWebRX vs. our Vite SPA + Vercel Edge + Supabase + collector. Their 4 projections include a dedicated CONUS view with AK/HI insets — we don't have one to copy.
- **Different feature center of gravity.** Their deepest, most distinctive layers (broadcast-meteorology: GOES GLM lightning, VAAC/observatory volcano aggregation, FAA weather cams, METAR, SST/SSTA, tides) are exactly where we're thinnest — and match the developer's stated 40-year broadcast-weather background. That biography explains the product shape better than our repo does.
- Their origin story (Geochron clone on a Fire TV) and public month-by-month dev blog since May read as an organic, independent build.

**Verdict:** nothing visible supports copying; the resemblance is genre convergence. **The one open item:** their hosted demo isn't live yet. When it ships, the client bundle becomes inspectable — that's the moment to do a real look (bundle strings, asset names, shader/geometry quirks, distinctive constants). Recommend a 30-minute pass then, and closing the question either way.

---

## 4. Feature Comparison

### 4.1 Shared surface (both products have it)

| Domain | HelioClock | PropPulse | Notes |
|---|---|---|---|
| Day/night terminator + greyline | ✅ | ✅ | Parity; they add a greyline pass-quality gauge + 7-day greyline window calendar for your QTH |
| Map projections | Mercator, CONUS w/ insets, 3D globe, azimuthal | 3D globe, flat map, azimuthal | They add a dedicated CONUS view; we have no purpose-built US regional mode |
| Basemap styles | 7 styles incl. Blue/Black Marble, political, outline | Multiple tile styles | They swap 12 monthly seasonal Blue Marble images automatically — we don't |
| DX Cluster | ✅ | ✅ (+ bridge telnet direct) | Parity |
| RBN | ✅ | ✅ | Parity |
| PSK Reporter | ✅ | ✅ | Parity |
| POTA / SOTA | ✅ (+ WWFF + WWBOTA) | ✅ (+ full activation workflow) | They show more networks; we *do* more with them (§4.3) |
| WSJT-X live UDP | ✅ | ✅ (bridge, incl. injection) | Parity-plus for us |
| NCDXF beacons | ✅ 18-beacon live rotation | ✅ Beacon Network layer | Parity |
| ISS + satellite tracking | ✅ passes + polar diagram | ✅ TLE, footprints, SatNOGS, transponders, DB page | We're deeper |
| Maidenhead grid overlay | ✅ + hover locator readout | ✅ + grid activity heatmap | Parity-plus for us |
| Space weather core (SFI, SSN, Kp, X-ray, G/S/R scales, solar wind, SDO imagery) | ✅ | ✅ | Parity; both have trend charts |
| **Dst index** | ✅ — claimed "appears to be unique to Helioclock" | ✅ `api/solar/dst.ts` | **Their uniqueness claim is false — we have it** |
| Aurora / OVATION | ✅ + visibility odds for your latitude | ✅ | They add the personal visibility framing |
| DRAP absorption | ✅ map + per-band panel | ✅ layer | Parity |
| MUF | ✅ 8-region × 9-band matrix | ✅ contour layer + P.533 engine | Different presentation; our physics is deeper |
| Multi-day band forecast | ✅ 9-band × 3-day grid | ✅ 24h BandPlanner w/ windows, mode/power advice | Different horizons; roughly parity |
| Weather radar | ✅ RainViewer + nowCOAST, 4 speeds, QTH "Radar Scope" | ✅ (PropSphere + AtmosPulse 2D) | Their circular QTH scopes are a nice presentation we lack |
| GOES cloud imagery | ✅ animated | ✅ layer | Parity |
| Lightning | ✅ GOES GLM + Lightning Scope + proximity audio alert | ✅ Blitzortung layer | Different sources; they add proximity scope/alert |
| NWS alerts | ✅ polygons + audible crawl break-in | ✅ layer + alert system | Parity |
| Tropical cyclones | ✅ NHC **+ JTWC** (all basins) | ✅ NHC only | Gap: we miss West Pacific / JTWC basins |
| Earthquakes | ✅ USGS, thresholds | ✅ USGS layer | Parity |
| Wildfires | ✅ FIRMS + Fire Scope | ✅ FIRMS layer + flyout | Parity |
| SST / anomaly | ✅ | ✅ | Parity |
| News/alert ticker | ✅ user-configurable RSS/ATOM w/ custom feeds, tones, alert break-in | ✅ DX/conditions ticker + emergency ticker (not user-RSS) | Gap: no custom feed support on our side |
| Custom alert rules | ✅ 9 categories, thresholds, per-category tone, step-up dedup | ✅ AlertRuleBuilder + notifications | Rough parity; their step-up dedup framing is good |
| SDR receive | ✅ via OpenWebRX bolt-on + RTL-SDR dongle | ✅ integrated console, skins, FT8 decode, CI-V spectrum | Ours is native and deeper |
| PTT awareness | ✅ GPIO/USB-serial ON-AIR banner | ⚠️ bridge PTT safety + manual profile "on air" badge | Their auto-triggered fullscreen banner is a distinct feature |
| Contest calendar | ✅ (no default feed; BYO URL) | ✅ Contest Explorer + calendar sync | We're far deeper |
| Uptime/health | ✅ device hardware health (CPU temp, disk, NTP) | ✅ data-source health page | Different meanings of "health"; both fine for their model |

### 4.2 HelioClock features PropPulse lacks (the gap list)

Ranked by strategic value to us, with effort estimates against our existing infra.

**Tier 1 — strategic, build these:**

| # | Feature | What they do | Effort for us | Why it matters |
|---|---|---|---|---|
| G1 | **Best Band Now analog** ("prediction that checks itself") | Per-QTH MUF prediction vs. live DX+RBN activity → Confirmed / Likely / **Surprise Open** / Closed, 20-min hold-to-confirm, hysteresis, API-retrievable decision log | Medium — we have the P.533 engine, DX/RBN/PSK/WSPR feeds, and DXWizard's per-spot condition scoring; missing only the reified verdict + state machine + log | Their signature marketing feature and genuinely the right idea. Ours would be *better-founded* (real P.533 vs. MINIMUF + more confirmation sources incl. WSPR). "Surprise Open" is the single best framing in their product |
| G2 | **Kiosk / Carousel mode** | Fullscreen signage mode; auto-rotates saved "Favorite Arrangements" (layout + layer state); remote view; QR handoff; watchdog | Medium — we already have layout modes (`normal/pro/lite/hamclock`) and layer state in stores; add fullscreen kiosk route, saved-arrangement rotation, wake lock, big-clock header | This is the entire use case HelioClock owns (shack TV / club station / EOC wall). A `/kiosk` mode makes every PropPulse account a HelioClock with zero hardware purchase |
| G3 | **EME moon-bounce planner** | Remote grid in → dual-station moon windows, overlap timeline, full link budget (path loss, ERP, margin vs. JT65/Q65/CW) across 6m–23cm | Medium — pure ephemeris + link-budget math, no new data feeds | Neither HamClock nor OpenHamClock has it either; high prestige with VHF+/weak-signal crowd; complements our satellite tooling |

**Tier 2 — cheap parity, mostly keyless public feeds (batch these):**

| # | Feature | Source | Effort |
|---|---|---|---|
| G4 | Tides panel + 48h chart | NOAA CO-OPS (no API key) | Small |
| G5 | UV index | Open-Meteo (no key) | Small |
| G6 | Moon phase panel | Computed (ephemeris) | Small |
| G7 | World clocks / city clocks (+ optional map layer, timezone boundaries) | Static + tz data | Small |
| G8 | METAR stations (panel + map layer) | aviationweather.gov | Small–medium (station DB) |
| G9 | Volcano activity layer | USGS HANS + Smithsonian GVP weekly | Small–medium |
| G10 | DXpeditions tracker | NG3K ADXO | Small |
| G11 | Named countdown timers (multiple events) | Local | Small — generalize `ContestCountdown` |
| G12 | Quick-reference overlay (band plans by class, Q-codes, prosigns, coax loss, formulas) | Static — much already in `src/lib/data/` | Small — we have the data, need the one-keystroke overlay |
| G13 | JTWC tropical basins (WPac/IO) | JTWC | Small — extend `api/atmos/tropical.ts` |
| G14 | User-configurable RSS/custom feeds in ticker | User URLs (needs proxy) | Small–medium |
| G15 | Air quality (AQI) | EPA AirNow / WAQI (free keys) | Small |
| G16 | Planets visibility panel | Computed | Small |

**Tier 3 — differentiating but bigger or off-axis (decide deliberately):**

| # | Feature | Notes |
|---|---|---|
| G17 | CW trainer (send + receive, Koch method, scoring) | Web Audio makes receive-side easy; send-side via keyboard/audio input is feasible in-browser. A beloved feature category; medium effort |
| G18 | Circular QTH "scopes" (radar/lightning/fire proximity displays w/ range rings + audio proximity alerts) | Pure presentation layer over data we already have; distinctive look |
| G19 | Seasonal monthly basemap imagery | 12 Blue Marble months, swap on the 1st; small but polish-y |
| G20 | WWV/WWVH map markers + path rating | Trivial marker layer; niche charm |
| G21 | Markets panel (indices + watchlist) | **Recommend skip** — off-mission for a ham/propagation product; theirs exists because of NOC/lobby signage targets |
| G22 | FAA weather camera directory | **Recommend skip/low** — aviation niche, links out to FAA anyway |
| G23 | Auto PTT-triggered ON-AIR banner | Bridge already watches the rig; surface a fullscreen banner + TX timer in-app. Small, shack-cred |

**Not applicable to our model (their hardware-product features):** SD/USB/appliance SKUs, GPIO wiring, mDNS, device watchdog, atomic on-device updates, native multi-HDMI output. Our web-app equivalents (URL, PWA, multi-tab) already exist. Their "no cloud dependency" pitch is the one structural claim we cannot match and shouldn't try — see §5.

### 4.3 PropPulse features HelioClock lacks (our moat)

HelioClock is **display-only**. Everything below is absent there entirely:

- **Logbook**: QSO entry console, IndexedDB store, bulk ops, conflict resolution, cross-device sync, **LoTW / eQSL / QRZ / Club Log** upload & QSL status
- **Awards**: DXCC / WAS / WAZ progress tracking
- **Contest engine**: live keyboard-first logging, dupes, multipliers, SCP, Cabrillo export, QTC, band advisor, congestion model, off-time tracker, post-contest batch, Contest Explorer
- **Activation workflow**: POTA/SOTA search, self-spotting, chase logging (they only display spots)
- **Nets**: registry/discovery, NCS live dashboard (preamble→check-ins→rounds→closeout), analytics — nothing like it in any of the three kiosk products
- **Community**: operator profiles, friends, achievements, activity, shareable cards/OG images, presence
- **Rig control**: CAT via Hamlib/Flrig/CI-V, auto-discovery, spectrum from the radio (theirs: "in process")
- **Integrated SDR console**: waterfall, skins, native FT8 decode incl. fox/hound (theirs is an OpenWebRX bolt-on)
- **Real propagation physics**: ITU-R P.533 ionosphere, multi-hop ray tracing, per-mode SNR/decodability prediction, NVIS, Sporadic-E, ducting climatology, HF noise floor, TEC, ionospheric shells — vs. their secant-law MUF
- **Unique layers**: WSPR paths, meteor showers, band-activity waterfall ring, grid activity heatmap, river gauges, APRS, repeaters, spot traces
- **EmComm suite**: ICS-213, SitRep log, Winlink status, Skywarn, NVIS briefing (their APRS/EmComm dashboard is "in process"; EAS/IPAWS "planned")
- **Callsign intelligence**: QRZ/HamQTH/Callook lookup, Club Log DXCC status
- **Mobile experience**: responsive mobile layout — theirs is a fixed big-screen canvas ("Remote View" on a phone is the same kiosk screen)
- **Cloud sync & accounts**: multi-device continuity, Stripe billing infrastructure

---

## 5. Positioning Differences

| Axis | HelioClock | PropPulse |
|---|---|---|
| Category | Appliance / kiosk (Geochron successor) | Web platform / operator toolkit |
| Revenue | One-time hardware ($39–$499+) | Freemium SaaS (Stripe) |
| Availability | Offline-first; survives vendor death | Cloud; requires us to exist |
| Audience | Hams who won't be sysadmins; NOC/EOC/lobby signage | Hams who *operate*: loggers, contesters, activators, net controllers |
| Interaction | Glance at it; occasional click for detail | Work in it: log, contest, control the rig, run a net |
| Second screen | **Is** the product | A mode we don't formally have yet (→ G2) |

Two strategic reads:

1. **They validated a market we can enter for free.** ~200 backlogged orders for a $39–$299 "shack TV brain" proves demand for the always-on display. A PropPulse `/kiosk` mode (G2) delivers that to any browser/TV stick with zero hardware, and unlike HelioClock it's the same account that holds your log, so the display can show *your* worked-status, *your* awards progress, *your* net schedule — personalization a standalone kiosk can never have.
2. **Their "no single point of failure" pitch is aimed at cloud products** — today at HamClock's dead backend, tomorrow potentially at us. Our honest counters: the parts of PropPulse that matter offline (bridge, IndexedDB log) already run locally; everything else is live data that any product, including theirs, needs the internet for anyway. Worth a FAQ/positioning answer before it's asked at a hamfest.

---

## 6. Recommendations

Priority order, if we choose to respond:

1. **G1 — "Band Verdict" (our Best Band Now).** Highest leverage: turns infrastructure we already run into a headline feature, on stronger physics than theirs, with more confirmation sources (DX + RBN + PSK + WSPR). Adopt the good parts of their design: hold-to-confirm timing, hysteresis, a Surprise Open state, and a public decision log (trust-building, and quietly a dataset).
2. **G2 — Kiosk/Carousel mode.** Enters their entire market category with a route and a store. Pair with G11 (countdowns), G7 (world clocks), and the existing `hamclock` layout for immediate credibility.
3. **Tier-2 parity batch (G4–G16).** One sprint of small, mostly keyless panels/layers closes almost the whole "40+ panels" checkbox gap. Sequence the keyless ones first (tides, UV, moon, planets, world clocks, DXpeditions, quick reference, JTWC).
4. **G3 EME planner + G17 CW trainer** as the two "prestige" features, as capacity allows — both are absent from all three kiosk products (EME) or beloved (CW), and both fit our operator-first identity.
5. **Skip:** markets panel, FAA cameras, hardware SKUs.
6. **When their hosted demo goes live:** do the 30-minute bundle inspection (§3) and close the code-similarity question with evidence either way.

---

*Prepared on branch `research/helioclock-feature-gap`. Companion docs: `SDR_Product_Vision_Document.md`, `FT8_Integration_Strategy.md`.*
