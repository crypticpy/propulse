# Propulse PRD v4.0 - Current State & Path to World Class

**Version:** 4.0
**Date:** January 31, 2026
**Status:** Living Document - Post-Phase 5 Audit
**Tagline:** _"The ionosphere, visualized"_

---

## Executive Summary

Propulse is a modern, web-based ham radio propagation toolset. After completing Phases 1-4 and 85% of Phase 5, this document captures our **actual current state**, **user feedback from all personas**, and the **prioritized path to world-class status**.

### Current Grade Card

| Category             | Grade | Notes                                             |
| -------------------- | ----- | ------------------------------------------------- |
| Visualization        | A     | Best-in-class for HF propagation visualization    |
| Propagation Science  | B-    | Good foundation, missing gray line/TEP/Sporadic E |
| Operational Features | C     | No logging UI, no rig control, no alerts          |
| UX/Accessibility     | B+    | Beautiful but overwhelming for beginners          |
| Mobile Experience    | B     | Functional but cramped                            |

### The Gap to World Class

> "Currently a visualization tool rather than an operating tool. Without rig control, logging, and alerts, it remains something I would glance at rather than operate with."
> — Dr. Harold "Hal" Morrison (W1HAL), 45-year veteran, former ARRL Director

---

## Table of Contents

1. [What's Actually Built](#1-whats-actually-built)
2. [User Persona Feedback](#2-user-persona-feedback)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Gap Analysis](#4-gap-analysis)
5. [Prioritized Roadmap](#5-prioritized-roadmap)
6. [Technical Architecture](#6-technical-architecture)
7. [Success Metrics](#7-success-metrics)

---

## 1. What's Actually Built

### 1.1 Pages & Routes

| Route    | Name        | Status              | Description                           |
| -------- | ----------- | ------------------- | ------------------------------------- |
| `/`      | Home        | Complete            | Landing page with Solar Pulse entry   |
| `/solar` | Solar Pulse | Complete            | Real-time solar weather dashboard     |
| `/map`   | PropSphere  | Complete            | Interactive propagation map (3 views) |
| `/log`   | LogBook     | **Backend Only**    | Route exists but no UI                |
| `/learn` | Learn       | **Not Implemented** | PRD spec exists, not built            |

### 1.2 Solar Pulse Features (100% Complete)

- K-Index, Solar Flux, Sunspots, A-Index, Bz IMF displays
- 24-hour K-Index chart, 30-day Solar Flux trend
- Flare probability (C/M/X class)
- Band conditions matrix (11 HF bands)
- Expandable detail modals for all metrics
- Plain-language condition summaries

**Data Sources:** NOAA SWPC via Vercel Edge proxies (1-minute to 6-hour refresh)

### 1.3 PropSphere Features (85% Complete)

**Map Views:**

- 3D Globe (Three.js with NASA Blue Marble texture)
- 2D Flat Map (Canvas-based equirectangular)
- Azimuthal Equidistant (WebGL + Canvas, centered on user QTH)

**Overlays:**

- Day/Night Terminator
- Greyline Band
- Aurora Oval (NOAA OVATION data)
- MUF Contours (SFI-based estimation)
- Night Lights
- Labels & Borders
- Live DX Spot Arcs (animated)

**Analysis Tools:**

- Path Analysis Panel (distance, bearing, MUF/LUF/FOT, hop count, SNR)
- 24-hour Propagation Forecast
- Band Recommendations
- NVIS Analysis (calculations exist, UI partial)

**User Features:**

- Click-to-target location selection
- Saved Targets (max 10)
- Layer Presets (DX Hunter, Contest, VHF, Emergency)
- Fullscreen Pro Mode
- Time Slider (+/- 24 hours)

### 1.4 Backend Ready, No UI

| Feature            | Backend Status        | UI Status          |
| ------------------ | --------------------- | ------------------ |
| Contact Logging    | IndexedDB CRUD ready  | None               |
| ADIF Import/Export | Parser complete       | No modal           |
| Alert Rules        | Matching system ready | No management UI   |
| Radio Equipment    | Store ready           | Basic manager only |

### 1.5 Known Issues (10 Identified)

1. **RBN spots don't render** - Missing geolocation for callsigns
2. **Source filtering broken** - UI exists, filter not applied
3. **A-Index calculation wrong** - Uses `Kp * 4` instead of lookup table
4. **EventAlert never triggers** - Hardcoded to null
5. **Short/Long path toggle** - Not functional
6. **Demo spots in dev mode** - Not clearly indicated
7. **getActiveRadio() returns null** - Always
8. **Time machine limited** - Only +/- 24 hours
9. **No aurora fallback** - Fails silently
10. **LogBook route commented out** - Not accessible

---

## 2. User Persona Feedback

### 2.1 Cross-Persona Priority Matrix

| Feature               | New Nick | DX Diana | Contest Carl | Emergency Ed | Dr. Hal | TOTAL  |
| --------------------- | -------- | -------- | ------------ | ------------ | ------- | ------ |
| LogBook with ADIF     | 2        | 5        | 5            | 3            | 2       | **17** |
| Real Spot Integration | 0        | 5        | 5            | 2            | 4       | **16** |
| Onboarding Wizard     | 5        | 2        | 0            | 1            | 0       | **8**  |
| Beginner Mode         | 5        | 1        | 0            | 2            | 2       | **10** |
| Offline Mode          | 1        | 2        | 2            | 5            | 1       | **11** |
| VOACAP Integration    | 0        | 3        | 3            | 2            | 5       | **13** |
| Contest Mode          | 0        | 1        | 5            | 0            | 3       | **9**  |
| Educational Content   | 5        | 2        | 0            | 2            | 1       | **10** |

**Top 3 Universal Priorities:**

1. LogBook UI with ADIF Import (17 points)
2. Real PSKReporter/RBN Integration (16 points)
3. VOACAP Backend Integration (13 points)

### 2.2 Persona Summary Quotes

**New Nick (Beginner):**

> "Add a beginner mode and some tutorials, and this could be the app that finally gets me on HF."

**DX Diana (Casual DXer):**

> "The visualization is stunning. Now give me DXCC tracking and I'll never open another app."

**Contest Carl (Contester):**

> "Beautiful, but I need multipliers, rate meters, and Tab-Tab-Enter logging or it's useless for contests."

**Emergency Ed (EmComm):**

> "NVIS is unique and valuable. But if the internet is down, so is Propulse."

**Dr. Hal Morrison (Expert):**

> "Solid ionospheric physics foundation. The potential is here - now integrate real ionosonde data and VOACAP."

---

## 3. Competitive Landscape

### 3.1 Market Opportunity

**HamClock End of Life (June 2026)** - Major opportunity. Thousands of users will need a replacement. Propulse is the only modern web-based option with comparable visualization.

**Cross-Platform Gap** - N1MM and HRD are Windows-only. Propulse works everywhere.

**Mobile Gap** - No serious mobile propagation tool exists. Propulse is responsive but needs optimization.

### 3.2 Best-of-Breed Features to Incorporate

| Source        | Feature                    | Status in Propulse         |
| ------------- | -------------------------- | -------------------------- |
| VOACAP        | Point-to-point predictions | Partial (simplified ITU-R) |
| VOACAP        | Circuit reliability charts | Not implemented            |
| N1MM          | Multiplier tracking        | Not implemented            |
| N1MM          | Rate meter                 | Not implemented            |
| HRD           | Rig control (CAT)          | Not implemented            |
| DXKeeper      | DXCC/WAS/WAZ tracking      | Backend ready, no UI       |
| PSKReporter   | Real-time FT8 spots        | API ready, demo data used  |
| prop.kc2g.com | Real ionosonde MUF         | Not integrated             |
| DXMaps        | Sporadic E visualization   | Not implemented            |

---

## 4. Gap Analysis

### 4.1 Critical Gaps (Must Fix)

| Gap              | Impact               | Effort  | Priority |
| ---------------- | -------------------- | ------- | -------- |
| LogBook UI       | Can't track contacts | Medium  | P0       |
| RBN Geolocation  | Spots don't render   | Low     | P0       |
| A-Index Fix      | Wrong data displayed | Trivial | P0       |
| Source Filtering | Broken UI            | Trivial | P0       |
| CORS Wildcards   | Security risk        | Low     | P0       |

### 4.2 High-Value Gaps

| Gap                  | Impact               | Effort | Priority |
| -------------------- | -------------------- | ------ | -------- |
| DXCC/Award Tracking  | Core DXer value      | Medium | P1       |
| Worked/Needed Status | Essential for DXers  | Medium | P1       |
| Onboarding Wizard    | Beginner retention   | Low    | P1       |
| Real ionosonde MUF   | Accuracy improvement | Medium | P1       |
| Beginner Mode Toggle | UX improvement       | Low    | P1       |

### 4.3 Propagation Model Gaps (from RF Expert)

| Missing                  | Impact                             | Notes              |
| ------------------------ | ---------------------------------- | ------------------ |
| Gray line enhancement    | +5-15 dB not modeled               | Major DX feature   |
| Polar auroral absorption | Currently 4 dB, should be 20-40 dB | Breaks accuracy    |
| Trans-equatorial (TEP)   | 6m/10m not modeled                 | VHF gap            |
| Sporadic E               | Not predicted                      | VHF gap            |
| Winter anomaly           | Seasonal model may be backwards    | Mid-latitude issue |

---

## 5. Prioritized Roadmap

### Phase 5 Completion (1-2 days)

- [ ] Fix A-Index calculation (lookup table)
- [ ] Add RBN geolocation (prefix lookup)
- [ ] Apply source filtering in LiveSpotArcs
- [ ] Add Bz to solar primary metrics
- [ ] Fix CORS (use env variable, not wildcard)
- [ ] Add input validation to API proxies

### Phase 6: LogBook & Awards (2-3 weeks)

**Goal:** Transform from "visualization tool" to "operating tool"

- [ ] LogBook page UI with contact entry form
- [ ] ADIF Import modal
- [ ] Contact search & filtering
- [ ] DXCC entity tracking
- [ ] Worked/Needed status on DX spots
- [ ] ATNO (All-Time New One) alerts
- [ ] Award progress dashboard (DXCC, WAS, WAZ)

### Phase 7: Pro Mode & Contests (2-3 weeks)

**Goal:** Capture HamClock refugees and contesters

- [ ] Pro Mode layout (center map, side panels)
- [ ] Rate meter
- [ ] Multiplier tracking
- [ ] Contest presets (CQ WW, ARRL DX, etc.)
- [ ] Keyboard shortcuts (Tab-Tab-Enter flow)
- [ ] Band map with activity density

### Phase 8: Beginner Experience (1-2 weeks)

**Goal:** Capture new hams, reduce churn

- [ ] Onboarding wizard
- [ ] Beginner mode toggle
- [ ] /learn page with tutorials
- [ ] "What's Open Now?" quick summary
- [ ] City names on target selection
- [ ] Interactive glossary

### Phase 9: Advanced Propagation (2-4 weeks)

**Goal:** Match/exceed VOACAP accuracy

- [ ] VOACAP Online API integration
- [ ] Real ionosonde data (prop.kc2g.com)
- [ ] Gray line enhancement modeling
- [ ] Improved polar path absorption
- [ ] Sporadic E probability model
- [ ] TEP detection for VHF

### Future Consideration

- Rig control (CAT/CI-V) - requires local app
- WSJT-X integration
- Offline mode (PWA with cached data)
- Mobile-optimized layout

---

## 6. Technical Architecture

### 6.1 Current Stack

- **Frontend:** React 18, TypeScript, Vite
- **3D:** Three.js (globe), WebGL (azimuthal)
- **State:** Zustand stores, TanStack Query
- **Storage:** IndexedDB (Dexie.js)
- **Backend:** Vercel Edge Functions (API proxies)
- **Hosting:** Vercel

### 6.2 Data Flow

```
NOAA SWPC ──┐
             ├──► Vercel Edge ──► React Query ──► Zustand ──► Components
PSKReporter ─┤
RBN ─────────┘
```

### 6.3 Technical Debt

1. `bands.ts` is 1200+ lines - needs splitting
2. DXSpotList needs virtualization for 50+ items
3. No AbortController for fetch cancellation
4. Three.js adds ~500KB to bundle

---

## 7. Success Metrics

### 7.1 User Adoption

| Metric              | Current | Target     |
| ------------------- | ------- | ---------- |
| Weekly Active Users | Unknown | 1,000+     |
| Session Duration    | Unknown | >5 minutes |
| Return Rate (7-day) | Unknown | >40%       |

### 7.2 Feature Completion

| Phase              | Target Completion      |
| ------------------ | ---------------------- |
| Phase 5            | 100% within 1 week     |
| Phase 6 (LogBook)  | 100% within 1 month    |
| Phase 7 (Pro Mode) | 100% within 2 months   |
| Phase 8 (Beginner) | 100% within 2.5 months |

### 7.3 Quality Metrics

| Metric                   | Target      |
| ------------------------ | ----------- |
| Lighthouse Performance   | >80         |
| Lighthouse Accessibility | >90         |
| API Response Time        | <500ms      |
| Spot Latency             | <10 seconds |

---

## Appendices

### A. Related Documents

- `CURRENT-STATE-AUDIT.md` - Detailed feature inventory
- `USER-PERSONA-EVALUATIONS.md` - Full persona feedback
- `COMPETITOR-ANALYSIS.md` - Detailed competitor research
- `GAP-ANALYSIS.md` - PRD vs reality assessment
- `EXPERT-FEEDBACK.md` - RF engineer technical review

### B. Data Source APIs

| Source          | API                                                      | Rate Limit       |
| --------------- | -------------------------------------------------------- | ---------------- |
| NOAA K-Index    | `services.swpc.noaa.gov/json/planetary_k_index_1m.json`  | None             |
| NOAA Solar Flux | `services.swpc.noaa.gov/json/f107_cm_flux.json`          | None             |
| NOAA Aurora     | `services.swpc.noaa.gov/json/ovation_aurora_latest.json` | None             |
| PSKReporter     | `retrieve.pskreporter.info/query`                        | 60/hour          |
| RBN             | Telnet `telnet.reversebeacon.net:7000`                   | Connection-based |

---

**Document Maintained By:** Development Team
**Last Audit:** January 31, 2026
**Next Review:** After Phase 6 Completion
