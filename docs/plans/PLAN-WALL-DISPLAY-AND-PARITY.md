# PropPulse Plan: The Split, the Wall, and Parity-Plus

**Date:** 2026-08-29 · **Status:** proposed, awaiting owner decisions (§8)
**Inputs:** `docs/comp_analysis/HelioClock_Competitive_Analysis.md` (gap IDs G1–G23) · `docs/research/wall-displays/COMMUNITY-SIGNALS.md` · `COMPETITOR-TOOLS.md` · `MULTI-DISPLAY-TECH.md`

---

## 1. Strategy in one paragraph

PropPulse splits into two clearly-named halves. The **Open Core** — the display/kiosk experience, the P.533 physics engine, rig control, local logging, and a self-hostable "Shack Server" that serves the app and proxies public feeds on a user's LAN — is open source and runs forever on a Pi with no PropPulse account and no PropPulse servers. The **PropPulse Cloud** — the prediction-modeling and data-storage layer that fuses solar weather, terrestrial weather, fires/smoke, and live spot traffic into band-health verdicts and forecasts no individual can reproduce, plus the multi-user community features — is operated as a service, funded by subscriptions, ideally under a non-profit. Innovations ship open; infrastructure that's genuinely hard for one person to run is what people pay to sustain. This answers the community's two loudest anxieties at once: the HamClock collapse ("what if the vendor disappears?" → the core is yours, forever) and subscription fatigue ("what am I actually paying for?" → the data and models, not the dashboard).

## 2. Why this shape (evidence)

- **Vendor-death trauma is the defining sentiment of 2026.** HamClock's creator became a Silent Key in January; the backend died in June; every competitor is racing for the displaced users. HelioClock's whole pitch is "no cloud dependency." An open, self-hostable core is the only credible answer — and it converts their strongest attack into our feature.
- **Subscription fatigue is real but conditional.** "Stop Paying a Subscription" is literally HelioClock's ad copy, yet hams fund Wavelog instances, QRZ subscriptions, and ARDC-granted projects happily. What they resent is paying rent for software; what they'll sustain is infrastructure with visible ongoing cost. The split puts the paywall exactly on the infrastructure.
- **The dashboard itself is table stakes.** DX cluster + space weather + greyline + POTA/SOTA + satellites + contests appears in every 2026 competitor. Nobody wins on panels; differentiators are prediction accuracy, rig integration, and multi-display — the first two are OpenHamClock's top-engagement open issues and PropPulse's existing strengths.
- **Multi-display is validated whitespace.** HelioClock sells a $499+ multi-display server SKU; HamTab's LAN sync is the only grassroots answer. Nobody offers "pair three screens in 60 seconds from your phone." We can, with infrastructure we already run (Supabase Realtime).

## 3. The Split — what lives where

| Capability | Open Core (self-host, free, open source) | PropPulse Cloud (subscription) |
|---|---|---|
| SPA + all display scenes, kiosk mode | ✅ full | ✅ full |
| P.533 propagation engine (client-side) | ✅ full — physics is open | ✅ + model-corrected |
| Public-feed panels (NOAA, USGS, DX cluster, POTA/SOTA, satellites, WX, tides…) | ✅ via Shack Server proxies | ✅ via edge functions |
| Rig control / WSJT-X / CI-V (bridge) | ✅ full — it's already localhost | ✅ same |
| Logging | ✅ local IndexedDB + ADIF | ✅ + cloud sync/backup |
| Multi-display on one LAN | ✅ N browser windows/devices pointed at Shack Server, settings sync'd locally | ✅ + paired displays, phone-remote scene push, per-display management from anywhere |
| **Band Verdict** (prediction × live confirmation) | ✅ v1: physics × live 2h spot window, computed client-side | ✅ v2: ML-corrected, historically validated, accuracy-scored |
| **Forecast engine** (solar wx + earth wx + fires + traffic → band health/forecast) | ❌ — this is the concept we build our own value around | ✅ the moat |
| Historical data storage & analytics | ❌ (local log analytics only) | ✅ |
| Accounts, profiles, community, nets, awards | ❌ single-user by design | ✅ |
| Lightning (Railway collector) | ❌ (public alternatives documented) | ✅ |
| Billing, OG images, heartbeat | ❌ | ✅ |

Rules that keep the line honest:
1. **No feature ever migrates from Open Core to Cloud.** The line only moves the other way (cloud innovations graduating to core when they become locally feasible).
2. **The Cloud tier must be honest about *why* it's cloud** — every paid capability must have a real answer to "why can't I self-host this?" (answer: 24/7 collectors, historical storage measured in TB, model training, moderation — not artificial locks).
3. **Small-club hosting is Open Core**, not a special tier: one Shack Server on the club LAN, many screens. Anything requiring accounts is Cloud.

## 4. Workstreams

### A — Scenes & Kiosk Mode (G2, leveled up)
The foundation everything else builds on. A **Scene** = named snapshot of layout mode + panel arrangement + map layer state (extends existing `mapStore` layout modes + persisted stores). `/kiosk` route: fullscreen, zero-chrome, Wake Lock, big clock/UTC header, stall-tolerant (data-age badges instead of spinners), optional scene rotation on a timer, alert break-in (severe space-wx/NWS events interrupt rotation — explicitly demanded in research). Grid-of-cards paradigm, not page-flipping. QR handoff to phone. **Level-up over HelioClock's Carousel:** alert break-in + our live map as a first-class scene.

### B — Display Wall (multi-display)
Per `MULTI-DISPLAY-TECH.md` recommendation:
- **Contract:** `/display/:id` — self-contained, zero-interaction, Wake Lock, renders its assigned scene.
- **Pairing:** device shows 6-char code + QR at `/display/pair`; owner confirms from an authenticated session; device flips instantly (pre-subscribed Realtime channel).
- **Management:** `displays` table (id, name, owner, `scene_config` jsonb, last_seen_at); Displays page to rename/assign/rotate; row write + broadcast on `display:<id>`, poll-on-reconnect fallback.
- **Launch Wall (Chromium-only enhancement):** `getScreenDetails()` → drag scenes onto detected monitors → one positioned fullscreen window each. Graceful fallback elsewhere.
- **Recipes:** Pi (labwc autostart + systemd restart), Fully Kiosk (Android/Fire TV), Windows mini PC. Ship as docs with the feature.
- **Split:** Open Core gets LAN-level multi-screen (HamTab-style local settings sync via Shack Server); Cloud gets paired displays + remote push. This is the honest line: pairing/remote requires accounts + Realtime.
**Positioning:** HelioClock charges $499+ hardware for this. Ours is a QR code and a spare Fire TV stick.

### C — Band Verdict (G1, leveled up — the flagship)
Their "Best Band Now" is the right idea on a weak engine (MINIMUF-85). Ours: per-QTH P.533 prediction × live confirmation from DX cluster + RBN + PSK (2h window) → **Confirmed / Likely / Surprise Open / Closed** per band, with hold-to-confirm + hysteresis (no flapping), and a queryable decision log ("why did 15m flip at 1840Z?").
- **v1 (Open Core):** computed client-side from physics + live feeds — self-hosts cleanly.
- **v2 (Cloud):** verdicts corrected by the forecast engine (Workstream F) and scored against history — "our verdict was right N% of the time last month" published openly. Accuracy transparency is the trust play nobody else attempts.

### D — Parity batch (G4–G16, G18–G20, G23)
Cheap wins, all Open Core, mostly static data or keyless public APIs: tides (G4), UV (G5), moon phase (G6), world clocks (G7), METAR (G8), volcanoes (G9), DXpeditions (G10), named countdowns (G11), quick-reference overlay (G12 — data already in `src/lib/data/`), JTWC basins (G13), custom RSS in ticker (G14), AQI (G15), planets (G16), circular QTH scopes (G18 — distinctive presentation over data we already have), seasonal basemaps (G19), WWV markers (G20), PTT ON-AIR banner (G23 — bridge already watches the rig). **Skip G21 (markets) and G22 (FAA cams)** — off-mission. Each panel lands as a kiosk-scene-ready card, so parity work compounds into Workstream A.

### E — Shack Server (the Open Core enabler)
The architectural finding that makes the split cheap: the frontend already calls only relative `/api/...` paths, and the bridge already serves `dist/` on port 3173. Extract the ~65 portable proxy routes (everything except the Supabase-dependent list in the analysis doc) into shared handlers consumed by both the Vercel edge functions and a new bridge "shack server" mode. Add mDNS (`propulse.local`), a first-run "no account needed" path, and explicit degradation tiers in the UI (cloud-connected / LAN / fully offline — badge, never break). Ship the honest **"If PropPulse disappears"** doc — the HamClock-collapse counter-positioning, written down.

### F — Cloud Forecast Engine (the moat we charge for)
The concept the user named: fuse **solar weather** (SWPC indices, X-ray flux, proton events) + **terrestrial weather** (NWS/GOES) + **fires/smoke** (FIRMS — smoke aerosols measurably attenuate; we already render fire layers) + **live spot traffic** (DX/RBN/PSK via collector) into band-health nowcasts and forecasts *validated against what actually happened*. Existing assets: Railway-deployed models, the collector, the physics engine as prior.
- Phase F1: define the fusion spec + evaluation harness (verdict vs. observed openings) — measurement before modeling.
- Phase F2: nowcast correction layer feeding Band Verdict v2.
- Phase F3: multi-hour/day forecast + "Scenario" framing ("this CME arrives Tuesday — here's your 20m weekend").
- **Constraint carried forward:** the decommissioned M5→WSPR→Supabase ingest stays dead. Any expansion of historical spot retention beyond the current 2h window is an explicit cost/scope decision (§8), designed fresh — partitioned, budgeted, and sized before a single row lands.
- **Open-innovation rule:** model architectures, evaluation methodology, and scorecards publish openly; the trained weights, the always-on pipeline, and the historical store are the service.

### G — Prestige & identity
- **EME planner (G3):** pure ephemeris + link-budget math; nobody grassroots has it; VHF+ credibility. Open Core.
- **CW trainer (G17):** Web Audio; beloved category. Open Core.
- **EmComm kiosk scene:** the one OpenHamClock idea nobody copied — ARES/RACES layout (NWS alerts, APRS, nets, station status). We already have an EmComm suite to surface; as a *scene* it's mostly composition. Open Core.
- **ADS-B local air traffic:** bridge-side ingest from a user's own dump1090/readsb — the Facebook info-wall crowd runs these already. Open Core, LAN-only by nature.

## 5. Phasing

**Phase 1 — "Every PropPulse is a wall display" (foundation):**
A (Scenes + Kiosk) → B baseline (`/display/:id` + pairing + Displays page) → D batch 1 (G6, G7, G11, G12, G16, G19, G20, G23) → C v1 (client-side Band Verdict).
*Exit:* a Pi + TV shows a rotating, alert-capable PropPulse wall paired from a phone in under 5 minutes; Band Verdict visible on the dashboard.

**Phase 2 — "The core is yours" (the split made real):**
E (Shack Server + degradation tiers + docs) → D batch 2 (G4, G5, G8, G9, G10, G13, G14, G15, G18) → B enhancement (Launch Wall) → licensing/repo decisions executed (§8).
*Exit:* `propulse.local` serves the full Open Core with zero PropPulse infrastructure; "If PropPulse disappears" published.

**Phase 3 — "Forecasts nobody else can touch" (the moat):**
F1→F2 (fusion spec, eval harness, nowcast correction) → C v2 (ML-corrected verdicts + public accuracy scorecard) → G prestige items as capacity allows → subscription/non-profit launch.
*Exit:* Cloud tier live with a published accuracy number; first sustaining members.

Ordering rationale: Phase 1 wins the displaced-HamClock audience *now* with infrastructure we already run; Phase 2 cements trust before we ask for money; Phase 3 asks for money only once the free core has proven generosity.

## 6. Governance & sustainability

- **Non-profit:** amateur-radio science/education fits 501(c)(3) precedent, and **ARDC grants** fund exactly this shape of project (open-source ham software with operating costs) — a credible funding leg beside subscriptions. Formation is a legal workstream for the owner; the plan only requires that pricing pages *say what the money runs* (collectors, storage, training) from day one.
- **Licensing (decision):** recommend **AGPL-3.0** for the Open Core (protects against closed-SaaS forks — relevant given the HelioClock history; World Monitor uses exactly this AGPL+commercial split) vs. MIT (maximum adoption, HamTab's choice). Repo is currently private; open-sourcing requires a secrets/history audit first.
- **Framing:** "sustaining membership," not "premium unlock." Display features are never paywalled — the paywall is the intelligence layer and multi-user services only.

## 7. Non-goals

- No hardware SKU. HelioClock sells appliances; we publish recipes.
- No markets panel (G21), no FAA cams (G22).
- No rebuild of the decommissioned WSPR ingest pipeline.
- No per-panel paywalls or feature-gating inside the display experience.
- No native apps; PWA + kiosk browsers cover every target device.

## 8. Decisions needed from the owner

1. **License for the Open Core** — AGPL-3.0 (recommended) vs. MIT — and go/no-go on the repo-history audit to open it.
2. **Non-profit** — pursue 501(c)(3) formation and an ARDC application, or launch subscriptions under the current structure first?
3. **Cloud pricing shape** — single sustaining tier (recommended: one price, everything) vs. tiered; free-account scope for paired displays (e.g., 2 free, more with membership?).
4. **Historical data retention** — approve designing a bounded historical spot/index store for the forecast engine (explicit monthly budget cap), superseding nothing: the 2h live window stays the default.
5. **Naming** — "Shack Server," "Scenes," "Display Wall," "Band Verdict" are working names; bless or rename before UI work starts.
