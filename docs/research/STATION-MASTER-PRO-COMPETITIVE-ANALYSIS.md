# Station Master Pro vs. Propulse: Competitive Analysis

> **Research Date:** 2026-02-19
> **Analyst:** AI Research Assistant
> **Classification:** Internal Strategy Document

---

## Executive Summary

**Station Master Pro** (getstationmaster.com) is a commercial, subscription-based ham radio logging platform that has carved out a unique position in the market through its **social logging** features and **instant visual feedback**. Developed by Stuart (M1STU/G5STU), it emphasizes ease of use, community connection, and immediate gratification in the logging workflow.

**Propulse** is an open, web-native ham radio operations platform with superior propagation modeling, integrated SDR capabilities, and a comprehensive contest engine. This analysis identifies gaps and opportunities for achieving feature parity and differentiation.

---

## Station Master Pro - Complete Feature Profile

### Core Capabilities

| Category             | Features                                                       |
| -------------------- | -------------------------------------------------------------- |
| **Platforms**        | PC, Mac, Linux, Mobile (iOS/Android), Web                      |
| **Radio Control**    | Up to 5 radios + 2 rotators simultaneously                     |
| **Rig Protocols**    | Hamlib, OmniRig, TCI (Expert Electronics), CI-V                |
| **Logging**          | Instant QSO logging with auto-capture (date, time, freq, mode) |
| **QSL Integration**  | Auto-upload to QRZ, eQSL, ClubLog                              |
| **Digital Modes**    | FT8/FT4 via WSJT-X integration                                 |
| **SDR Panadapter**   | Interactive scope for Icom, Thetis, SDRPlay                    |
| **Activations**      | POTA, SOTA, WWFF, WWBOTA support                               |
| **Third-party**      | Log4OM, HRD, N1MM, LoTW integration                            |
| **Gamification**     | Real-time user competition, awards system                      |
| **Remote Operation** | Remote station control tools                                   |

### Pricing

- **Monthly**: £3.33 (~$4.20 USD)
- **Yearly**: £36.50 (~$46 USD) - 9.5% savings
- **Trial**: 7 days free
- Model: Subscription-required for full access

### Recognition

- Featured by RSGB (Radio Society of Great Britain)
- Featured by DX Commander
- Featured by ML&S (Martin Lynch and Sons)
- 4.7/5 Trustpilot rating (94% 5-star reviews)

---

## Station Master Pro's Signature Quality-of-Life Features

### 1. Visual Callsign Map Integration (The "Magic Moment")

The signature delight of SMP is the **instant visual feedback** when entering a callsign:

| Feature                  | How It Works                                                | Delight Factor                      |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------- |
| **Auto-map zoom**        | On entering callsign, instantly zooms to show both stations | Visual confirmation of contact      |
| **Path visualization**   | Great circle line drawn between QSO parties                 | "I just worked Japan!" satisfaction |
| **Distance calculation** | Miles/km displayed prominently                              | Sense of achievement                |
| **Color-coded contacts** | Different colors for first vs. subsequent contacts          | Instant visual status recognition   |

**User Quote:**

> _"on entering a callsign it switches straight to a map which zooms in to show the communication path, also shows distance and colour indicates first or subsequent contact"_ — Martin Smith

---

### 2. Social Logging (Real-Time Presence)

**Unique differentiator** — no other ham radio software has this level of social integration:

| Feature                     | Description                                        |
| --------------------------- | -------------------------------------------------- |
| **Live user presence**      | See who's online across the entire SMP network     |
| **Frequency sharing**       | See what frequency other users are on in real-time |
| **Activity indicator**      | Shows when contacts are actively operating         |
| **Leaderboards**            | Friendly competition between users                 |
| **Personal messaging**      | Built-in chat between operators                    |
| **"Social media for hams"** | Community feel within the app                      |

**User Quote:**

> _"One of it's best features is to be able to see which other Station Master users are online and what frequency they are using in real time"_ — Trustpilot reviewer

---

### 3. Embedded Single-Screen Workflow

No window juggling — everything is tabs within one interface:

| Element      | Station Master Pro     | Traditional Software |
| ------------ | ---------------------- | -------------------- |
| PSK Reporter | Embedded tab           | Separate browser tab |
| DX Cluster   | Integrated display     | External website/app |
| QRZ Lookup   | Inline profile display | External browser     |
| Logging      | Always-visible panel   | Modal/dialog         |
| FT8/WSJT-X   | Integrated decode list | Separate application |

**User Quote:**

> _"basically one screen to do 99% of your interactions with log and external sites, very nice indeed."_ — Mike McWhinnie

---

### 4. Instant Auto-Populate Flow

Zero-friction QSO entry (~2-3 seconds total):

```
1. Type callsign → Tab out
2. QRZ auto-lookup fires instantly
3. Name, QTH, grid auto-fill
4. Frequency auto-captured from radio
5. Mode auto-detected
6. Map zooms to show path
7. Click "Log" → Instant upload to QRZ/eQSL/ClubLog
```

---

### 5. Developer Responsiveness as a Feature

Users feel heard — the software evolves with their requests:

| Aspect                       | Evidence                                 |
| ---------------------------- | ---------------------------------------- |
| Rapid iteration              | "Constantly evolving" per reviews        |
| Feature requests implemented | Users cite their ideas being added       |
| Direct access                | Discord community with developer present |
| Bug fixes                    | Quick turnaround on issues               |

**User Quotes:**

> _"Stuart listens to the people that use his logging platform and incorporates their ideas."_ — Kevin Conlon

> _"Stu is very responsive to ideas and new features"_ — Ray

---

## Feature-by-Feature Comparison Matrix

### Radio Control & Rig Integration

| Feature                    | Station Master Pro | Propulse           | Status     |
| -------------------------- | ------------------ | ------------------ | ---------- |
| Multi-radio (simultaneous) | ✅ Up to 5 radios  | ❌ Single radio    | **GAP**    |
| Rotator control            | ✅ 2 rotators      | ❌ Not implemented | **GAP**    |
| Hamlib support             | ✅                 | ✅ via bridge      | **PARITY** |
| OmniRig support            | ✅                 | ❌                 | **GAP**    |
| TCI (Expert Electronics)   | ✅                 | ❌                 | **GAP**    |
| CI-V direct                | ✅                 | ✅ via bridge      | **PARITY** |
| Auto-radio detection       | ✅ Setup wizard    | ✅ Setup wizard    | **PARITY** |

### SDR Capabilities

| Feature               | Station Master Pro     | Propulse                    | Status             |
| --------------------- | ---------------------- | --------------------------- | ------------------ |
| SDR Panadapter        | ✅ Icom/Thetis/SDRPlay | ✅ Universal via SDRconnect | **PARITY**         |
| Spectrum display      | ✅                     | ✅ with multiple spans      | **PARITY**         |
| Waterfall             | ✅                     | ✅ with spot overlays       | **PROPULSE LEADS** |
| Built-in FT8 decoder  | ❌ External WSJT-X     | ✅ Native WebAssembly       | **PROPULSE LEADS** |
| Audio recording       | ❌                     | ✅ WAV export               | **PROPULSE LEADS** |
| Digital mode decoding | FT8 only               | FT8/FT4 built-in            | **PROPULSE LEADS** |

### Logging & QSO Management

| Feature             | Station Master Pro | Propulse             | Status             |
| ------------------- | ------------------ | -------------------- | ------------------ |
| Instant logging     | ✅                 | ✅                   | **PARITY**         |
| Offline logging     | Limited            | ✅ IndexedDB-first   | **PROPULSE LEADS** |
| ADIF import/export  | ✅                 | ✅ with validation   | **PARITY**         |
| QRZ auto-lookup     | ✅ Tab-out trigger | ✅ via HamQTH        | **NEAR PARITY**    |
| Callsign pre-fill   | ✅                 | ✅                   | **PARITY**         |
| Guest/field logging | Limited            | ✅ Field Day mode    | **PROPULSE LEADS** |
| Conflict resolution | Basic              | ✅ Field-level merge | **PROPULSE LEADS** |

### Visual/Map Delighters

| Feature                         | Station Master Pro      | Propulse                  | Status  |
| ------------------------------- | ----------------------- | ------------------------- | ------- |
| Auto-zoom map on callsign entry | ✅ Instant              | ⚠️ Manual search          | **GAP** |
| Great circle path display       | ✅ Visual line          | ⚠️ Has globe, no QSO path | **GAP** |
| Distance calculation display    | ✅ Prominent            | ❌ Not in logging UI      | **GAP** |
| Color-coded contact history     | ✅ First vs. subsequent | ⚠️ Has dupe checking      | **GAP** |
| Contact location preview        | ✅ Map immediately      | ⚠️ Requires DX Wizard     | **GAP** |

### Social/Community Features

| Feature                 | Station Master Pro   | Propulse             | Status             |
| ----------------------- | -------------------- | -------------------- | ------------------ |
| Real-time user presence | ✅ See who's online  | ❌ Not implemented   | **MAJOR GAP**      |
| Frequency sharing       | ✅ Live freq display | ❌ Not implemented   | **MAJOR GAP**      |
| Operator messaging      | ✅ Built-in chat     | ❌ Not implemented   | **MAJOR GAP**      |
| Leaderboards            | ✅ QSO competitions  | ✅ Achievement tiers | **PARTIAL PARITY** |
| Community activity feed | ✅ Social timeline   | ❌ Not implemented   | **MAJOR GAP**      |

### Contest Support

| Feature             | Station Master Pro | Propulse         | Status             |
| ------------------- | ------------------ | ---------------- | ------------------ |
| Contest definitions | Limited            | ✅ 19 built-in   | **PROPULSE LEADS** |
| Real-time scoring   | Basic              | ✅               | **PROPULSE LEADS** |
| Multiplier tracking | Basic              | ✅ Visual maps   | **PROPULSE LEADS** |
| Cabrillo export     | ✅                 | ✅               | **PARITY**         |
| N1MM UDP broadcast  | ✅                 | ✅               | **PARITY**         |
| Band map            | ✅                 | ✅ with spots    | **PARITY**         |
| Dupe checking       | Basic              | ✅ Contest-aware | **PROPULSE LEADS** |

### Propagation & Visualization

| Feature                | Station Master Pro | Propulse                     | Status             |
| ---------------------- | ------------------ | ---------------------------- | ------------------ |
| Propagation analysis   | Basic tools        | ✅ Physics-based ray tracing | **PROPULSE LEADS** |
| Real-time spots        | ✅                 | ✅ 3 sources (PSK/RBN/DX)    | **PARITY**         |
| 3D globe visualization | ❌                 | ✅ Three.js WebGL            | **PROPULSE LEADS** |
| MUF overlay            | Limited            | ✅                           | **PROPULSE LEADS** |
| Aurora visualization   | Limited            | ✅ OVATION data              | **PROPULSE LEADS** |
| Solar metrics          | Basic              | ✅ 40+ metrics               | **PROPULSE LEADS** |
| DX cluster integration | ✅                 | ✅                           | **PARITY**         |

### Activation Support (POTA/SOTA)

| Feature            | Station Master Pro | Propulse              | Status             |
| ------------------ | ------------------ | --------------------- | ------------------ |
| POTA logging       | ✅                 | ✅                    | **PARITY**         |
| SOTA logging       | ✅                 | ✅                    | **PARITY**         |
| WWFF logging       | ✅                 | Planned               | **GAP**            |
| Dual activation    | Limited            | ✅ POTA+SOTA same QSO | **PROPULSE LEADS** |
| Offline field mode | Limited            | ✅ PWA + IndexedDB    | **PROPULSE LEADS** |

### Workflow Efficiency

| Feature                      | Station Master Pro     | Propulse                 | Status          |
| ---------------------------- | ---------------------- | ------------------------ | --------------- |
| Single-screen workflow       | ✅ Embedded everything | ⚠️ Multiple routes/pages | **UX GAP**      |
| Instant QRZ populate         | ✅ Tab-out trigger     | ✅ Has lookup            | **NEAR PARITY** |
| Auto-upload chain            | ✅ QRZ+eQSL+ClubLog    | ✅ Same services         | **PARITY**      |
| Dark mode                    | ✅ Excellent           | ✅ Has dark mode         | **PARITY**      |
| Contextual button appearance | ✅ Smart UI            | ⚠️ Static UI             | **ENHANCEMENT** |

---

## Feature Parity Roadmap

### Phase 1: Quick Wins (Low Effort, High Delight)

| Feature                      | Effort | Impact | Implementation Notes                                            |
| ---------------------------- | ------ | ------ | --------------------------------------------------------------- |
| **Mini-map in QSO entry**    | Low    | High   | Add inline Mapbox/Leaflet widget that updates on callsign entry |
| **Auto-distance display**    | Low    | Medium | Calculate great-circle distance when callsign populated         |
| **Color dupe indicator**     | Low    | Medium | Visual badge showing new/dupe/worked-before status              |
| **Tab-triggered QRZ lookup** | Low    | Medium | Auto-lookup on blur/Tab, not just button click                  |
| **WWFF field support**       | Low    | Medium | Add field to logging form and database schema                   |
| **Inline profile card**      | Low    | High   | Show QRZ photo/bio in hover card on callsign                    |

### Phase 2: Medium Investment (Core UX Improvements)

| Feature                           | Effort | Impact | Implementation Notes                                        |
| --------------------------------- | ------ | ------ | ----------------------------------------------------------- |
| **Unified logging dashboard**     | Medium | High   | Single-page layout with embedded spots, map, and entry form |
| **Click-spot-to-log flow**        | Medium | High   | Click any spot → auto-tune radio + pre-fill log             |
| **Great circle path on globe**    | Medium | High   | Draw animated path between QSO parties in 3D globe          |
| **Enhanced dupe visualization**   | Medium | Medium | Color-coded worked-before status with band/mode breakdown   |
| **OmniRig adapter**               | Medium | Low    | Windows-specific wrapper for broader rig support            |
| **Rotator integration (1 rotor)** | Medium | Medium | Add daemon commands + azimuth UI panel                      |

### Phase 3: Strategic Investment (Major Differentiators)

| Feature                              | Effort | Impact    | Implementation Notes                                    |
| ------------------------------------ | ------ | --------- | ------------------------------------------------------- |
| **Propulse Network**                 | High   | Very High | Real-time presence system with opt-in frequency sharing |
| **Multi-radio support (2-3 radios)** | High   | Medium    | Extend bridge protocol for simultaneous radio control   |
| **Rotator control (2 rotators)**     | High   | Medium    | Full azimuth tracking + memories                        |
| **TCI Protocol support**             | Medium | Medium    | Expert Electronics native protocol                      |
| **Real-time leaderboards**           | Medium | High      | Live QSO counts, distance challenges, band activity     |
| **Operator messaging**               | Medium | Medium    | Built-in chat between online users                      |

---

## Brainstorm: New Features Inspired by Analysis

### A. "Propulse Pulse" — Enhanced Social Layer

Beyond what SMP offers:

1. **Propagation-Based Social Matching**
   - "Operators who can hear you now" — based on spot data
   - Suggested QSOs: "K1ABC is on 20m FT8 and propagation is open to them"
   - Mutual contact predictions

2. **Activity Heatmaps**
   - Personal: Where you've operated most
   - Community: Where Propulse users are active
   - Real-time: Current band activity visualization

3. **Collaborative Logging**
   - Multi-operator events with shared log view
   - Net control logging (multiple check-ins)
   - Club station shared logging

4. **Social Challenges**
   - "Work 10 new DXCC entities this week"
   - "Most distance on 40m today"
   - "POTA activation competition"
   - Achievement badges with shareable cards

### B. "Smart Logging" — AI-Assisted Features

1. **Predictive Callsign Completion**
   - Type "K1" → suggest likely completions based on propagation
   - Historical pattern recognition

2. **Auto-Band/Mode Detection from Audio**
   - Audio fingerprinting to detect if signal is SSB/CW/FT8
   - Suggest likely mode if user hasn't selected

3. **Smart Dupe Detection**
   - Fuzzy matching for partial callsigns
   - "Did you mean K1ABC? You worked K1ABD yesterday"

4. **Logging Confidence Scoring**
   - Highlight potentially incorrect entries
   - "Grid square doesn't match callsign prefix"

### C. "Visual Propagation" — Enhanced Visualization

1. **Live Path Prediction**
   - Before making a call, show predicted path quality
   - "Path to Japan: Good (75%) for next 30 minutes"

2. **Historical QSO Replay**
   - Replay your day's contacts on the globe
   - "Time-lapse" of your activity

3. **Contact Network Graph**
   - Visualize who you've worked, who they've worked
   - "Six degrees of separation" for hams

4. **Awards Progress Visualization**
   - DXCC: Countries as colored map
   - WAS: States filled in as worked
   - Visual progress bars for each award

### D. "Seamless Integration" — Workflow Enhancements

1. **Voice-to-Log**
   - "Log K1ABC on 20 meters"
   - Hands-free logging for mobile ops

2. **Photo QSL Integration**
   - Take photo of paper QSL → auto-extract data
   - Digital QSL card creation from templates

3. **External App Webhooks**
   - Trigger IFTTT/actions on new QSO
   - Post to social media automatically
   - Update personal website with latest contacts

4. **Time-Travel Logging**
   - "I made this contact yesterday but forgot to log it"
   - Backdate with validation warnings
   - QSO recovery from WSJT-X logs, email confirmations

### E. "Competition Excellence" — Contest Enhancements

1. **Contest-Specific Social**
   - See other Propulse users in the same contest
   - Rate comparison in real-time
   - Multi-op team coordination board

2. **Propaganda Mode** (Gamified Practice)
   - Simulate contest conditions for practice
   - AI-generated pileups to practice calls
   - Speed drills with scoring

3. **Post-Contest Analysis**
   - Rate graphs over time
   - Band/mode breakdown visualizations
   - Compare with historical performance
   - Suggest improvements for next contest

4. **Spot Intelligence**
   - Filter spots by "multiplier needed"
   - Auto-spot your CQ calls
   - Multiplier hunting assistant

### F. "Field Operation Excellence" — Portable/DXpedition

1. **Offline-First Contest Mode**
   - Full contest scoring without internet
   - Sync when connection restored
   - Merge resolution for multi-op

2. **Satellite/Aircraft Logging**
   - Doppler prediction and logging
   - Auto-frequency adjustment
   - Satellite pass scheduling

3. **Emergency/QRP Modes**
   - Ultra-minimal UI for battery conservation
   - Large buttons for gloves/mobility
   - Morse code audio logging (tap pattern)

4. **DXpedition Coordination**
   - Team logging with pileup management
   - QSO rate optimization suggestions
   - Band change coordination

---

## Strategic Recommendations

### Immediate Priorities (Next 30 Days)

1. **Add mini-map to QSO entry** — Instant visual gratification, easy win
2. **Implement auto-distance calculation** — Achievement feeling
3. **Create unified logging dashboard** — Reduce clicks, improve workflow
4. **Add WWFF support** — Close activation program gap

### Medium-Term Goals (3-6 Months)

1. **Build Propulse Network MVP** — Real-time presence is SMP's moat; we need our own
2. **Implement click-spot-to-log** — Critical for FT8 operators
3. **Add great circle path visualization** — Visual delight on globe
4. **Enhance dupe visualization** — Color-coded status indicators

### Long-Term Vision (6-12 Months)

1. **Multi-radio support** — Appeal to serious contesters
2. **Advanced social features** — Messaging, leaderboards, challenges
3. **AI-assisted logging** — Smart suggestions, predictive features
4. **Deep propagation-social integration** — "Who can I work right now?"

---

## Competitive Positioning Statement

**Station Master Pro** wins on:

- Social connection and community feel
- Instant visual gratification (maps, paths)
- Ease of use for casual operators
- Multi-radio convenience

**Propulse** wins on:

- Propagation intelligence and modeling
- Native FT8/SDR integration
- Comprehensive contest support
- Offline-first architecture
- Physics-based visualization

**The Opportunity:** Combine Propulse's technical depth with SMP's social/visual delight to create the ultimate ham radio platform.

---

## Sources

- [Station Master Pro Official Site](https://getstationmaster.com/)
- [Station Master Pro Trustpilot Reviews](https://www.trustpilot.com/review/station-master.online)
- [KE2YK Comprehensive Guide](https://ke2yk.com/2024/02/05/elevate-your-amateur-radio-experience-with-station-master-software-a-comprehensive-guide/)
- [FlexRadio Community Discussion](https://community.flexradio.com/discussion/8031520/is-anyone-using-the-station-master-logging-software-by-g5stu)
- Propulse codebase analysis (src/, docs/, memory/)
- [Propulse Competitive Analysis 2026](COMPETITIVE-ANALYSIS-2026.md)

---

_Document Version: 1.0_
_Last Updated: 2026-02-19_
_Next Review: 2026-03-19_
