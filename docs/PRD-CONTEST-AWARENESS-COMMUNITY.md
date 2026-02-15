# PRD: Contest Awareness & Community Experience Layer

**Version:** 1.0
**Date:** 2026-02-15
**Status:** Draft
**Depends On:** `PRD-LOGBOOK-COMPETITIVE-PARITY.md` (Phases 1-5)
**References:** `PRD-CONTEST-FEATURES.md`, `docs/research/QLOG-COMPETITIVE-ANALYSIS.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [User Personas](#4-user-personas)
5. [System Architecture: Contest Context Layer](#5-system-architecture-contest-context-layer)
6. [Feature Specifications](#6-feature-specifications)
   - 7.1 Contest Calendar Engine
   - 7.2 Dashboard Contest Weather
   - 7.3 Band Map Contest Awareness
   - 7.4 Alert Engine Contest Intelligence
   - 7.5 Quiet Band Navigator
   - 7.6 Contest Explorer & Onboarding
   - 7.7 Contest Propagation Intelligence
   - 7.8 Award Tracking Contest Integration
   - 7.9 Post-Contest QSL Batch Workflow
   - 7.10 DX Wizard Contest-Aware Recommendations
7. [Integration with Existing PRDs](#7-integration-with-existing-prds)
8. [Implementation Phases](#8-implementation-phases)
9. [File Inventory](#9-file-inventory)
10. [Quality Gates](#10-quality-gates)
11. [Open Questions](#11-open-questions)

---

## 1. Executive Summary

The Logbook Competitive Parity PRD addresses what DXers, POTA activators, and shack operators need from a logging platform. The existing Contest Features PRD (`PRD-CONTEST-FEATURES.md`) addresses what active contesters need during a contest. Neither addresses the fact that **contesting is a platform-wide environmental condition** that affects every operator on every band, every contest weekend — whether they participate or not.

This PRD introduces a **Contest Context Layer**: shared infrastructure that makes contest activity visible, navigable, and useful across the entire Propulse platform. It serves three populations simultaneously:

1. **Non-contesters** who need to coexist with contest traffic and find usable spectrum
2. **Contest-curious operators** who want a low-friction path to try contesting
3. **Active contesters** whose contest QSOs should flow seamlessly into award tracking, QSL workflows, and propagation analysis

**The thesis:** Contest awareness is infrastructure, not a feature. Like solar weather or band conditions, contest activity is a context layer that should inform every surface of the platform. Propulse becomes the first ham radio application that makes contest weekends better for *everyone* — not just the people running rates.

**Estimated scope:** ~28 new files, ~18 modified files, ~5,500-7,500 new lines across 4 implementation phases.

---

## 2. Problem Statement

### What happens today on contest weekends

Major contests (CQ WW, ARRL Sweepstakes, Field Day) put 10,000-50,000 operators on the air simultaneously. During these events:

- HF bands are dominated by contest traffic — 80-90% of activity on 20m, 40m, and 80m is contest exchanges
- Non-contest operators lose access to their usual frequencies and have no guidance on where to operate
- DX cluster spots become overwhelmingly contest-related, making band maps and alert systems noisy and less useful for non-contest purposes
- Newcomers encounter a wall of rapid-fire exchanges they don't understand, which can be alienating
- After the contest, participants have hundreds of QSOs that need QSL processing and award integration — a workflow no platform handles well

### What Propulse currently does

The codebase has a full contest engine (19 definitions, scoring, SCP, Cabrillo, rate sheets) and a comprehensive logbook PRD in progress. But these exist as separate systems:

- The contest engine knows about contests but doesn't share that knowledge with the dashboard, band map, alerts, or DX Wizard
- The logbook PRD (features 6.1-6.10) was designed without contest context — the DXCC badge, band map, and alert engine don't know when a contest is happening
- No surface in the application tells non-contest operators what's happening on the bands or where to find clear spectrum
- No pathway exists for a curious operator to learn about an upcoming contest and decide to participate

### The gap

There is no **contest context layer** — no shared understanding of "a contest is happening right now" that flows through the entire platform. Every feature operates as though contest weekends are identical to any other weekend.

---

## 3. Goals & Non-Goals

### Goals

1. Build a contest calendar engine as shared infrastructure that any component can query for active/upcoming contests
2. Surface contest awareness on the dashboard, band map, alerts, and DX Wizard so all operators benefit from contest situational awareness
3. Give non-contesters tools to navigate around contest traffic (quiet bands, filtered spots, smart recommendations)
4. Give contest-curious operators a discovery pathway from "what's happening this weekend?" to their first contest QSO
5. Connect contest QSOs to the award tracking and QSL workflows from the Logbook Parity PRD so contest activity counts toward DXCC/WAS/WAZ
6. Use contest-weekend spot density as a propagation intelligence signal that benefits all operators
7. Ensure the contest engine's existing features (scoring, SCP, band map overlays) integrate with the new logbook infrastructure (DXCC status, sync, QSL services)

### Non-Goals

- Replacing N1MM or Win-Test for serious multi-op contest stations (the existing contest engine handles single-op and casual multi-op)
- Contest log adjudication or cross-checking (that's the contest sponsor's job)
- Building our own contest calendar database from scratch (we'll aggregate from existing public sources)
- Real-time contest leaderboards or live score sharing (interesting but separate scope)
- Automated contest registration or entry submission (manual, per contest sponsor rules)

---

## 4. User Personas

### Riley the Ragchewer *(new persona)*

- **Profile:** Extra-class, 15 years, loves long QSOs on 40m and 75m SSB. Runs an IC-7300 into a G5RV. Zero interest in contesting.
- **Pain:** Contest weekends are miserable. Favorite frequencies are wall-to-wall with contest stations exchanging "59 05" at machine-gun speed. Has no idea when contests start or end, so gets surprised every time. Feels like the hobby is being taken over by people who don't actually talk to each other.
- **Needs:** Advance warning of contest weekends, guidance on where to find clear spectrum, ability to filter contest noise out of spot feeds and band maps, a sense that the platform respects their operating style.
- **Switching trigger:** "Finally, software that doesn't assume I want to contest. It actually tells me where to go to have a normal QSO."
- **Key features:** 7.1, 7.2, 7.3, 7.5, 7.10

### Kai the Contest-Curious *(new persona)*

- **Profile:** General-class, 2 years, has heard about contests but never tried one. Runs an IC-705 with a wire antenna. Intimidated by contest culture — thinks it requires a big station and years of experience.
- **Pain:** No idea how to get started. Looked at contest rules online and found them confusing. Doesn't know what exchanges to send, which contests are beginner-friendly, or whether their small station can even participate. Worried about looking foolish.
- **Needs:** Plain-language contest explanations, station capability estimates, "try it" encouragement with realistic expectations, a gentle on-ramp that doesn't require reading 15-page rule documents.
- **Switching trigger:** "It told me I could realistically make 30 contacts in the Sweepstakes with my setup, showed me exactly what to say, and I ended up with 47. Now I'm hooked."
- **Key features:** 7.1, 7.6, 7.8

### Dana the DXer *(existing persona, extended)*

- **Extension:** Dana already uses the band map and alerts from the Logbook Parity PRD. During CQ WW, she specifically hunts rare DXCC entities that only appear during major contests. She needs alerts that understand contest context — throttle the noise but surface the truly rare stations.
- **Additional needs:** Contest-aware alert profiles, multiplier-aware DXCC badge during contests, post-contest LoTW batch upload for the 300 QSOs she logged.
- **Key features:** 7.4, 7.7, 7.8, 7.9

### Pat the POTA Activator *(existing persona, extended)*

- **Extension:** Pat sometimes activates parks during contest weekends because band activity is high and contacts come fast. But the activation workflow doesn't know about contest context — she can't tell which callers are hunting POTA versus running contest exchanges.
- **Additional needs:** Contest calendar awareness to plan activations strategically, understanding of which contests allow POTA-tagged contacts.
- **Key features:** 7.1, 7.2

### Nico the Newcomer *(existing persona, extended)*

- **Extension:** Nico's first experience with a contest weekend was confusing and discouraging. Heard rapid exchanges on 20m and had no idea what was happening. Almost gave up on HF.
- **Additional needs:** Plain-language explanations of what's happening on the bands, educational contest content that turns confusion into curiosity, encouragement to listen and learn.
- **Key features:** 7.2, 7.6

---

## 5. System Architecture: Contest Context Layer

The Contest Context Layer is a shared data and query infrastructure that any component can consume. It answers three questions at any given moment:

1. **What contests are active right now?** (name, sponsor, bands, modes, exchange, time remaining)
2. **What contests are coming soon?** (next 30 days, with details)
3. **How should this information change the behavior of component X?** (per-component integration logic)

```
                         ┌───────────────────────────────┐
                         │      Contest Calendar DB       │
                         │  ───────────────────────────── │
                         │  contestDefinitions (existing) │
                         │  + contestCalendar (NEW)       │
                         │  + contestSchedule API (NEW)   │
                         └──────────────┬────────────────┘
                                        │
                              useContestContext() hook
                                        │
              ┌─────────────┬───────────┼───────────┬──────────────┐
              │             │           │           │              │
              ▼             ▼           ▼           ▼              ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
        │Dashboard │ │ Band Map │ │  Alert   │ │DX Wizard │ │  Award   │
        │ Contest  │ │ Contest  │ │  Engine  │ │ Contest  │ │ Tracking │
        │ Weather  │ │ Filters  │ │ Contest  │ │ Advice   │ │ Contest  │
        │  (7.2)   │ │  (7.3)   │ │ Intel    │ │  (7.10)  │ │ Integr.  │
        │          │ │          │ │  (7.4)   │ │          │ │  (7.8)   │
        └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
              │             │           │           │              │
              │             │           │           │              │
              ▼             ▼           ▼           ▼              ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Quiet   │ │ Contest  │ │  Spot    │ │ Contest  │ │Post-Cntst│
        │  Band    │ │ Explorer │ │ Density  │ │  Propag. │ │   QSL    │
        │  Nav     │ │ Onboard  │ │ as Intel │ │  Intel   │ │  Batch   │
        │  (7.5)   │ │  (7.6)   │ │  (part   │ │  (7.7)   │ │  (7.9)   │
        │          │ │          │ │  of 7.7) │ │          │ │          │
        └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### Data Model: Contest Calendar Entry

```typescript
interface ContestCalendarEntry {
  id: string;                        // unique identifier, e.g., "cqww-cw-2026"
  definitionId?: string;             // links to existing contestDefinitions if we have scoring rules
  name: string;                      // "CQ World Wide DX Contest (CW)"
  sponsor: string;                   // "CQ Magazine"
  slug: string;                      // "cqww-cw" for URL-friendly references
  startUtc: string;                  // ISO 8601
  endUtc: string;                    // ISO 8601
  bands: string[];                   // ["160m","80m","40m","20m","15m","10m"]
  modes: string[];                   // ["CW"]
  exchange: string;                  // "RST + CQ Zone"
  exchangeExample: string;           // "599 05"
  description: string;              // 2-3 sentence plain-language summary
  rulesUrl: string;                  // link to official rules
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedParticipants: number;     // rough scale: 5000, 20000, 50000
  popularBands: string[];            // bands with heaviest activity, e.g., ["20m","40m"]
  warcBandsFree: boolean;            // true if 30m/17m/12m are not used (almost always true)
  scoringType: "points-x-mults" | "points-only" | "qso-count";
  multiOp: boolean;                  // does the contest allow multi-op entries?
  tags: string[];                    // ["dx","hf","major","cw-only"]
}

interface ContestContext {
  activeContests: ContestCalendarEntry[];     // happening right now
  upcomingContests: ContestCalendarEntry[];   // next 30 days
  isContestWeekend: boolean;                  // any major contest active
  contestBands: Set<string>;                  // union of all active contest bands
  quietBands: string[];                       // bands NOT used by any active contest
  totalEstimatedActivity: number;             // sum of estimatedParticipants across active
}
```

---

## 6. Feature Specifications

---

### 7.1 Contest Calendar Engine

**Priority:** P0 (Foundation) | **Effort:** Medium | **Persona:** All

#### Overview

A shared data service providing contest schedule awareness to the entire application. This is the foundation that every other feature in this PRD depends on. It maintains a curated calendar of major and regional contests, keeps it updated, and exposes a reactive hook that any component can consume.

#### User Stories

**US-7.1.1: Platform knows when contests are happening**

> As the Propulse platform, I need a continuously updated calendar of amateur radio contests so that every component can query whether a contest is currently active, what bands and modes it uses, and when the next contests are scheduled.

**Acceptance Criteria:**

- [ ] Contest calendar contains at minimum the 30 most significant HF contests (covering ~90% of contest-weekend hours annually)
- [ ] Each entry includes: name, sponsor, start/end UTC, bands, modes, exchange format, plain-language description, rules URL, difficulty level, and estimated participation scale
- [ ] Calendar is shipped as a static JSON dataset bundled with the app, covering 12 months forward
- [ ] Calendar can be updated via a lightweight fetch from Supabase `contest_calendar` table (if available) to pick up additions/corrections without an app deploy
- [ ] `useContestContext()` hook returns: active contests, upcoming contests (next 30 days), boolean `isContestWeekend`, set of contest-occupied bands, array of quiet bands
- [ ] Hook updates reactively — when a contest starts or ends, all consumers re-render
- [ ] Works offline using the bundled static dataset

**US-7.1.2: Calendar links to existing contest engine definitions**

> As a contest operator, when a calendar entry has a matching contest definition in the existing contest engine (19 definitions), the calendar entry should link to it so I can launch directly into contest mode with the correct scoring rules loaded.

**Acceptance Criteria:**

- [ ] `definitionId` field on calendar entries maps to existing `contestDefinitions` by ID
- [ ] If a match exists, UI surfaces a "Start Contest" action on the calendar entry
- [ ] If no match exists (regional or niche contest), the entry is informational only

**US-7.1.3: Operator views upcoming contest calendar**

> As any operator, I want to see a list of upcoming contests for the next 30 days with enough detail to understand what's happening and when.

**Acceptance Criteria:**

- [ ] Calendar view accessible from dashboard card link and from a dedicated section in Settings or a new Calendar page
- [ ] Each entry shows: name, date range (local time + UTC), bands, modes, 2-3 sentence description, difficulty badge, participation estimate
- [ ] Sortable by date (default), difficulty, or size
- [ ] Filter by: mode (CW/SSB/Digital/Mixed), band (HF/VHF), difficulty, "this weekend only"
- [ ] Visual timeline showing contest windows on a week view (helps visualize overlapping contests)

#### Technical Design

```
Static data: src/lib/data/contestCalendar.ts
  - Export: CONTEST_CALENDAR: ContestCalendarEntry[]
  - Contains 30+ major contests with full metadata
  - Manually curated, updated with each major release
  - Sources: contestcalendar.com, ARRL contest calendar, CQ Magazine schedule

Remote update: Supabase contest_calendar table (optional)
  - Fetched on app load, merged with static data (remote wins on conflict by id)
  - Allows adding late-announced contests without app deploy
  - Falls back gracefully to static data if fetch fails

Hook: useContestContext()
  - Computes activeContests by comparing current UTC time against start/end windows
  - Computes upcomingContests by filtering for start > now && start < now+30d
  - Derives isContestWeekend, contestBands, quietBands
  - Memoized: recomputes only when time crosses a contest boundary (check every 60s)
  - Returns stable references (useMemo) for downstream consumer optimization
```

#### Integration Points

| Integrates With          | How                                                           |
| ------------------------ | ------------------------------------------------------------- |
| `contestDefinitions`     | `definitionId` links calendar entries to scoring engine rules  |
| Dashboard (7.2)          | Supplies active/upcoming data for Contest Weather card         |
| Band Map (7.3)           | Supplies `contestBands` for spot classification                |
| Alert Engine (7.4)       | Supplies `isContestWeekend` for throttling and profile logic   |
| Quiet Band Nav (7.5)     | Supplies `quietBands` array                                   |
| Contest Explorer (7.6)   | Supplies full calendar for discovery UI                        |
| Propagation Intel (7.7)  | Supplies contest windows for spot density analysis             |
| Award Tracking (7.8)     | Supplies contest metadata for QSO tagging                     |
| QSL Batch (7.9)          | Supplies contest windows for batch grouping                   |
| DX Wizard (7.10)         | Supplies active contest data for recommendation adjustments   |

#### Files

| File                                       | Action  | Purpose                                                     |
| ------------------------------------------ | ------- | ----------------------------------------------------------- |
| `src/lib/data/contestCalendar.ts`          | **New** | Static contest calendar dataset (30+ entries)               |
| `src/lib/contest/contestCalendarTypes.ts`  | **New** | ContestCalendarEntry, ContestContext type definitions        |
| `src/hooks/useContestContext.ts`            | **New** | Reactive hook: computes active/upcoming/quiet bands         |
| `src/lib/contest/contestCalendarSync.ts`   | **New** | Optional Supabase fetch + merge logic for remote updates    |
| `src/components/contest/ContestCalendar.tsx`| **New** | Calendar list/timeline view for upcoming contests           |

---

### 7.2 Dashboard Contest Weather

**Priority:** P0 (Foundation) | **Effort:** Small | **Persona:** Riley, Kai, Nico, Pat

#### Overview

A new card on the operational dashboard that provides at-a-glance contest situational awareness, analogous to the existing solar weather cards. During a contest weekend it prominently displays what's happening; during non-contest periods it shows what's coming up. This is the single most impactful feature for non-contesters because it transforms an invisible disruption into visible, plannable information.

#### User Stories

**US-7.2.1: Operator sees active contest information on dashboard**

> As any operator opening Propulse during a contest weekend, I want to immediately see a card telling me what contests are active, what bands and modes they use, and how much time remains, so I understand why the bands sound different.

**Acceptance Criteria:**

- [ ] "Contest Weather" card displayed on the operational dashboard (positioned near Band Conditions table)
- [ ] When contests are active: shows contest name, mode, time remaining (countdown), bands used, estimated activity level (Low/Medium/High/Extreme based on `estimatedParticipants`)
- [ ] Multiple concurrent contests displayed in a stacked layout
- [ ] Activity level indicator uses existing color palette: `signal-green` (low), `caution-yellow` (medium), `plasma-orange` (high), `alert-red` (extreme/major)
- [ ] "Quiet bands" callout at bottom: "Contest-free bands: 30m, 17m, 12m, 60m" (links to Quiet Band Nav, feature 7.5)
- [ ] Card is collapsible and respects user's dashboard layout preferences

**US-7.2.2: Operator sees upcoming contests when no contest is active**

> As any operator on a non-contest weekend, I want to see the next 2-3 upcoming contests with dates, so I can plan my operating schedule.

**Acceptance Criteria:**

- [ ] When no contest is active: card shows "Next contests" with the next 3 upcoming entries
- [ ] Each shows: name, date (e.g., "Feb 28 - Mar 1"), modes, brief description
- [ ] "View full calendar" link to Contest Calendar view (feature 7.1)

**US-7.2.3: Newcomer understands what contests are**

> As Nico the Newcomer, the first time I see the Contest Weather card during an active contest, I want a brief explanation of what a contest is and why the bands are busy, so I'm not confused.

**Acceptance Criteria:**

- [ ] First-time tooltip or inline explanation: "A ham radio contest is happening — thousands of operators are making brief contacts to compete. Bands will be busier than usual. You can participate, or find quieter bands below."
- [ ] Dismissible after first view (stored in settingsStore)
- [ ] "Learn more" link to Contest Explorer (feature 7.6)

#### Technical Design

```
Component: src/components/dashboard/ContestWeatherCard.tsx
  - Consumes useContestContext() for active/upcoming data
  - Renders active state (countdown timer, bands, activity level) or preview state (upcoming list)
  - Timer uses requestAnimationFrame or 1s setInterval for countdown
  - Activity level derived from estimatedParticipants:
    < 1,000 = Low (green)
    1,000-10,000 = Medium (yellow)
    10,000-30,000 = High (orange)
    > 30,000 = Extreme (red)

Integration: Insert into existing dashboard page layout
  - Position: after Band Conditions table, before Log Stats
  - Respects existing dashboard responsive grid system
```

#### Files

| File                                                | Action     | Purpose                                       |
| --------------------------------------------------- | ---------- | --------------------------------------------- |
| `src/components/dashboard/ContestWeatherCard.tsx`   | **New**    | Dashboard card for contest situational awareness |
| `src/components/dashboard/ContestCountdown.tsx`     | **New**    | Countdown timer sub-component                    |
| `src/pages/Dashboard.tsx` (or equivalent home page) | **Modify** | Insert ContestWeatherCard into layout            |
| `src/stores/settingsStore.ts`                       | **Modify** | Add `contestWeatherDismissed` for first-run tip  |

---

### 7.3 Band Map Contest Awareness

**Priority:** P0 (Tier 0) | **Effort:** Medium | **Persona:** Riley, Dana

#### Overview

Extends the Band Map Widget (Logbook PRD feature 6.4) with contest-awareness: the ability to classify spots as contest-related, filter them, and visually distinguish them. Without this, the band map is overwhelmed during contest weekends — Riley sees 300 orange/gray pips and gives up, while Dana can't find the rare entities buried in contest traffic.

#### User Stories

**US-7.3.1: Operator filters contest spots from band map**

> As a non-contest operator during a contest weekend, I want to toggle "Hide contest activity" on the band map so I can see only non-contest spots and find clear frequencies.

**Acceptance Criteria:**

- [ ] New toggle in BandMapControls: "Hide contest" (icon: trophy with strikethrough)
- [ ] When active: spots classified as contest-related are hidden from the band map
- [ ] Classification heuristic: spot occurred during an active contest window (from useContestContext) AND spot band+mode matches the contest's bands+modes AND spot source is DX cluster (not PSK Reporter — PSK Reporter spots are mostly non-contest)
- [ ] Toggle state persists in settingsStore
- [ ] Spot count badge updates to reflect filtered count

**US-7.3.2: Contest spots visually distinguished when shown**

> As any operator, when contest spots are visible on the band map, I want them visually distinguished from non-contest spots so I can tell at a glance which activity is contest-related.

**Acceptance Criteria:**

- [ ] Contest-classified spots have a subtle visual differentiator: dashed outline, contest icon badge, or reduced opacity (configurable in settings)
- [ ] Tooltip on contest spots includes: "Contest: CQ WW CW" label in addition to standard callsign/frequency/SNR
- [ ] Non-contest spots during a contest weekend are rendered normally (no visual change)

**US-7.3.3: Band map shows contest sub-band boundaries**

> As any operator during a contest weekend, I want to see the conventional contest sub-band boundaries marked on the band map so I can identify where contest activity is concentrated versus where the band is likely clear.

**Acceptance Criteria:**

- [ ] During active contests, horizontal markers on the band map show conventional contest sub-bands (e.g., on 20m CW: contest activity concentrated 14000-14060 kHz)
- [ ] Markers labeled "Contest zone" with subtle shading
- [ ] Sub-band data derived from contest type and well-known operating conventions
- [ ] Markers only appear when a relevant contest is active for this band+mode

#### Technical Design

```
Spot classification: src/lib/contest/spotContestClassifier.ts
  - Input: spot (frequency, band, mode, timestamp, source), contestContext
  - Output: { isContestRelated: boolean, contestId?: string, confidence: "high" | "medium" }
  - High confidence: spot on contest band+mode during contest window from DX cluster
  - Medium confidence: spot on contest band during window but mode ambiguous
  - Low/none: spot outside contest window, or on non-contest band, or from PSK Reporter

Sub-band data: src/lib/data/contestSubBands.ts
  - Static map of contest type → band → [startKhz, endKhz] conventional operating ranges
  - Example: "cw-contest" → "20m" → [14000, 14060]
  - "ssb-contest" → "20m" → [14150, 14350]

Integration with BandMap (6.4):
  - BandMapSpot.tsx checks classification before rendering
  - BandMap.tsx renders sub-band markers when useContestContext().isContestWeekend
  - BandMapControls.tsx adds filter toggle
```

#### Integration Points

| Integrates With              | How                                                          |
| ---------------------------- | ------------------------------------------------------------ |
| `useContestContext()` (7.1)  | Active contest data for classification and sub-band markers  |
| `BandMap.tsx` (6.4)          | Renders sub-band markers and filters spots                   |
| `BandMapSpot.tsx` (6.4)      | Visual differentiation for contest-classified spots          |
| `BandMapControls.tsx` (6.4)  | New "Hide contest" toggle                                    |
| `useBandMapSpots.ts` (6.4)   | Spot data flows through classifier before rendering          |
| `settingsStore.ts`           | Persists filter toggle state                                 |

#### Files

| File                                         | Action     | Purpose                                                  |
| -------------------------------------------- | ---------- | -------------------------------------------------------- |
| `src/lib/contest/spotContestClassifier.ts`   | **New**    | Classify spots as contest-related or not                 |
| `src/lib/data/contestSubBands.ts`            | **New**    | Conventional contest sub-band frequency ranges           |
| `src/components/qso/BandMapContestMarker.tsx`| **New**    | SVG overlay for contest sub-band boundaries              |
| `src/components/qso/BandMapControls.tsx`     | **Modify** | Add contest filter toggle                                |
| `src/components/qso/BandMapSpot.tsx`         | **Modify** | Contest visual differentiation (dashed outline, label)   |
| `src/components/qso/BandMap.tsx`             | **Modify** | Render sub-band markers, apply classification filter     |
| `src/hooks/useBandMapSpots.ts`               | **Modify** | Pipe spots through classifier, expose contest filter     |
| `src/stores/settingsStore.ts`                | **Modify** | Add `bandMapHideContest: boolean` preference             |

---

### 7.4 Alert Engine Contest Intelligence

**Priority:** P1 (Tier 1) | **Effort:** Medium | **Persona:** Dana, Riley

#### Overview

Extends the Spot Alert Rules Engine (Logbook PRD feature 6.9) with contest-aware behavior. During contest weekends, alert volume can spike 10-50x as thousands of stations are spotted. Without contest intelligence, alerts either become useless (too many) or operators disable them and miss genuinely rare stations. This feature adds automatic throttling, contest-aware profiles, and DX-hunting optimization.

#### User Stories

**US-7.4.1: Alerts auto-throttle during contest weekends**

> As a DXer with alert rules for new DXCC entities, I want the alert engine to automatically increase suppression during contest weekends so I'm not overwhelmed, while still alerting me to truly rare stations.

**Acceptance Criteria:**

- [ ] When `useContestContext().isContestWeekend === true`, alert engine applies a contest throttle multiplier
- [ ] Default throttle: suppression window increases from 15 minutes to 60 minutes for contest-band spots
- [ ] Non-contest-band alerts (WARC bands, VHF) are NOT throttled
- [ ] Throttle is configurable: Off / Light (30min) / Medium (60min) / Heavy (120min)
- [ ] Alert toast includes "Contest mode: throttled" indicator so user knows filtering is active

**US-7.4.2: Operator creates contest DX hunting alert profile**

> As a DXer who hunts rare entities during contests, I want a preset alert profile optimized for contest DX hunting that focuses on new DXCC entities appearing on contest bands.

**Acceptance Criteria:**

- [ ] New preset in alert rule presets: "Contest DX Hunter"
- [ ] Preset configuration: alert only on new DXCC entities OR new band-slots, contest bands only, suppression 30 minutes, high-confidence spots only (SNR threshold)
- [ ] Preset auto-activates when a major contest starts (if user has enabled auto-profiles)
- [ ] Reverts to normal profile when contest ends

**US-7.4.3: Non-contester suppresses all contest-band alerts**

> As Riley the Ragchewer during a contest weekend, I want to suppress all alerts for contest bands and only receive alerts for contest-free bands, so I'm not bothered by activity I have no interest in.

**Acceptance Criteria:**

- [ ] New preset: "Contest Weekend Quiet Mode"
- [ ] Suppresses all alerts on bands used by active contests
- [ ] Only fires alerts for WARC bands (30m, 17m, 12m), 60m, and VHF/UHF
- [ ] Auto-activates/deactivates with contest windows (if user enables auto-profiles)

**US-7.4.4: Alert rules support contest-aware conditions**

> As any operator, I want to add "Only during contests" or "Only outside contests" conditions to my alert rules for fine-grained control.

**Acceptance Criteria:**

- [ ] New optional criteria field on alert rules: `contestFilter: "any" | "during-contest" | "outside-contest"`
- [ ] "any" = always evaluate (default, backward compatible)
- [ ] "during-contest" = only evaluate when `isContestWeekend === true`
- [ ] "outside-contest" = only evaluate when `isContestWeekend === false`
- [ ] Visible in AlertRuleBuilder UI as a toggle: "When: Always / During contests / Outside contests"

#### Technical Design

```
Alert engine extension: src/lib/alerts/contestAlertLogic.ts
  - Wraps existing alertEngine.ts evaluation pipeline
  - Injected as middleware: before firing alert, check contest context
  - Throttle logic: multiply suppression window by contestThrottleMultiplier
  - Profile auto-switching: on contest start/end events from useContestContext,
    swap active alert configuration if auto-profiles enabled

Alert profiles stored in IndexedDB alertRules alongside existing rules:
  - New field: contestProfile?: "normal" | "dx-hunter" | "quiet-mode" | "custom"
  - New field: autoActivate?: boolean
  - New field: contestFilter?: "any" | "during-contest" | "outside-contest"

Profile switching:
  - useContestContext() emits "contest-start" and "contest-end" events
  - alertEngine subscribes and swaps active rule set based on autoActivate flags
```

#### Integration Points

| Integrates With             | How                                                     |
| --------------------------- | ------------------------------------------------------- |
| `useContestContext()` (7.1) | Contest state for throttling and profile switching       |
| `alertEngine.ts` (6.9)     | Middleware injection for contest-aware evaluation        |
| `AlertRuleBuilder.tsx` (6.9)| New contest filter UI field                             |
| `alertRules` IndexedDB      | Extended schema with contest fields                     |
| `settingsStore.ts`          | Contest throttle preferences and auto-profile toggle    |

#### Files

| File                                              | Action     | Purpose                                               |
| ------------------------------------------------- | ---------- | ----------------------------------------------------- |
| `src/lib/alerts/contestAlertLogic.ts`             | **New**    | Contest throttle, profile switching, filter middleware |
| `src/components/alerts/ContestAlertProfiles.tsx`  | **New**    | UI for managing contest-specific alert profiles       |
| `src/lib/alerts/alertEngine.ts`                   | **Modify** | Inject contest middleware into evaluation pipeline    |
| `src/components/alerts/AlertRuleBuilder.tsx`      | **Modify** | Add contest filter field to rule creation form        |
| `src/stores/settingsStore.ts`                     | **Modify** | Add contestThrottle, autoProfile preferences          |

---

### 7.5 Quiet Band Navigator

**Priority:** P1 (Tier 1) | **Effort:** Small | **Persona:** Riley, Pat, Nico

#### Overview

A compact, always-accessible widget (during contest weekends) that tells non-contest operators which bands have no active contest traffic. This is the single most requested feature from the "non-contester" community segment in ham radio forums. No existing software provides this.

#### User Stories

**US-7.5.1: Operator sees which bands are contest-free**

> As a non-contest operator during a contest weekend, I want a prominent display showing which bands are contest-free, so I can immediately navigate to usable spectrum without trial and error.

**Acceptance Criteria:**

- [ ] "Quiet Bands" widget appears in dashboard sidebar, band map panel, and logbook page during active contest weekends only
- [ ] Shows bands NOT used by any active contest, with a green "clear" indicator
- [ ] For each quiet band, shows: band name, current propagation conditions (from existing Solar Pulse data), live spot count (non-contest spots)
- [ ] Click on a quiet band navigates to band map filtered to that band, or sets rig frequency to the band's calling frequency
- [ ] Widget auto-hides when no contest is active

**US-7.5.2: Widget explains WARC band convention**

> As a newcomer, I want to understand WHY 30m, 17m, and 12m are always contest-free, so I learn about the WARC band convention.

**Acceptance Criteria:**

- [ ] Tooltip or info icon on WARC bands: "30m, 17m, and 12m are called 'WARC bands' — by longstanding convention, they're never used for contests. They're always a good choice for non-contest QSOs."
- [ ] Shows once per user, dismissible

**US-7.5.3: Quiet band recommendations consider propagation**

> As any operator, the quiet band suggestions should be ranked by current propagation quality, not just listed alphabetically.

**Acceptance Criteria:**

- [ ] Quiet bands sorted by propagation favorability (using existing Composite Propagation Index per-band data)
- [ ] Bands with poor propagation shown dimmed with note: "Open but propagation is poor"
- [ ] Bands that are closed shown with "Closed" badge

#### Technical Design

```
Component: src/components/contest/QuietBandNav.tsx
  - Consumes useContestContext().quietBands
  - Cross-references with existing useBandConditions() hook for propagation data
  - Sorts by propagation quality descending
  - Renders as a compact vertical list (sidebar-friendly)

Visibility logic:
  - Only renders when useContestContext().isContestWeekend === true
  - Embedded in: Dashboard sidebar, BandMap panel, Logbook sidebar
  - Animated entrance/exit (slide in on contest start)

Click action:
  - If rig connected: rigStore.setFrequency(band calling frequency)
  - Always: navigate to band map filtered to selected band
```

#### Integration Points

| Integrates With              | How                                                     |
| ---------------------------- | ------------------------------------------------------- |
| `useContestContext()` (7.1)  | Quiet bands list and contest active state               |
| `useBandConditions()`        | Existing propagation data for band ranking              |
| `rigStore.ts`                | Click-to-tune to quiet band frequency                   |
| Band Map (6.4)               | Click navigates to filtered band view                   |
| Dashboard, Logbook layouts   | Widget inserted into sidebar during contest weekends    |

#### Files

| File                                            | Action     | Purpose                                           |
| ----------------------------------------------- | ---------- | ------------------------------------------------- |
| `src/components/contest/QuietBandNav.tsx`       | **New**    | Quiet band widget with propagation ranking        |
| `src/pages/Dashboard.tsx`                       | **Modify** | Conditionally render QuietBandNav in sidebar      |
| `src/pages/Logbook.tsx`                         | **Modify** | Conditionally render QuietBandNav in sidebar      |

---

### 7.6 Contest Explorer & Onboarding

**Priority:** P1 (Tier 1) | **Effort:** Medium | **Persona:** Kai, Nico

#### Overview

A discovery and education interface that transforms contesting from an intimidating subculture into an accessible activity. It provides plain-language contest descriptions, personalized station capability estimates, and a guided path from "what is this?" to "I'm going to try it." This leverages existing data: the 19 contest definitions, Shack Builder station profiles, and propagation models.

#### User Stories

**US-7.6.1: Curious operator discovers upcoming contests**

> As Kai the Contest-Curious, I want to browse upcoming contests with plain-language descriptions that explain what the contest is, who participates, what I'd need to send and receive, and how difficult it is, so I can decide if I want to try.

**Acceptance Criteria:**

- [ ] Contest Explorer page (accessible from Contest Calendar, dashboard card link, and navigation)
- [ ] Each contest displayed as an expandable card with: name, dates, mode(s), plain-language description (2-3 sentences), exchange explanation with example, difficulty badge, estimated participation
- [ ] Exchange explanation uses conversational language: "You'll send your signal report and your CQ zone number. For example: '59 05'. The other station will send the same. That's the entire QSO."
- [ ] Difficulty badges: 🟢 Beginner Friendly, 🟡 Intermediate, 🔴 Advanced
- [ ] Beginner-friendly contests highlighted with a "Great for first-timers" banner

**US-7.6.2: Operator sees personalized contest station estimate**

> As an operator with station data in Shack Builder, I want to see an estimate of how many contacts I could realistically make in each contest based on my equipment, so I can set expectations.

**Acceptance Criteria:**

- [ ] If Shack Builder has station data: show "Your station estimate" on each contest card
- [ ] Estimate computed from: power level, antenna type/gain, propagation conditions (if contest is within 48 hours), contest difficulty, contest participation level
- [ ] Displayed as a range: "With your IC-7300 and EFHW, you could realistically make 30-80 contacts in this contest"
- [ ] For contests >48 hours away: "Based on your station, this contest is a good fit for you" (no contact count without propagation data)
- [ ] If no Shack Builder data: prompt to set up equipment profile, or show generic estimates by station class (QRP/100W/High Power)

**US-7.6.3: Operator gets a contest quick-start guide**

> As a first-time contester, I want a one-page quick-start guide for the specific contest I'm about to try, covering exactly what I need to do step by step.

**Acceptance Criteria:**

- [ ] "Quick Start" button on each contest card (especially beginner-friendly ones)
- [ ] Generates a contextual guide with: what to send, what to listen for, which band/mode to start on, what logging features to use in Propulse, tips for the first 30 minutes
- [ ] Guide adapts to user's station: if running QRP, suggest search-and-pounce strategy; if running 100W+ with directional antenna, suggest running
- [ ] Guide mentions Propulse-specific features: "Turn on the Contest Lite HUD for real-time scoring" / "Use the band map to find multipliers"
- [ ] Link to launch contest mode with the correct definition pre-loaded

**US-7.6.4: Newcomer learns contest concepts through tooltips**

> As Nico the Newcomer encountering contest terminology for the first time, I want inline definitions for terms like "multiplier," "exchange," "running," "search and pounce," "rate," and "dupe" so I can learn as I explore.

**Acceptance Criteria:**

- [ ] Contest-specific terminology has hover tooltips throughout the Contest Explorer
- [ ] Tooltip glossary covers at minimum: multiplier, exchange, run (running), search and pounce (S&P), rate, dupe, QSO party, Cabrillo, section, zone
- [ ] Tooltips are concise (1-2 sentences) and use plain language
- [ ] On mobile: tooltips render inline (not hover) when term is tapped

#### Technical Design

```
Station estimate algorithm: src/lib/contest/stationEstimator.ts
  - Inputs: stationProfile (from Shack Builder), contestEntry (from calendar), bandConditions (current)
  - Model: Simplified estimate based on power class, antenna gain, contest size, and operating hours
    - QRP (≤5W): base rate 5-15 QSO/hr
    - Low Power (≤100W): base rate 15-40 QSO/hr
    - High Power (>100W): base rate 30-80 QSO/hr
    - Modifiers: directional antenna (+30%), contest participation level, propagation conditions
    - Total: rate × estimated operating hours (assume 4-8 hours for casual participant)
  - Output: { min: number, max: number, confidence: string, tips: string[] }

Quick-start guide generation: src/lib/contest/contestQuickStart.ts
  - Template-based: each contest type (DX, domestic, VHF, QSO party) has a template
  - Personalized with station data and contest-specific exchange details
  - Returns structured guide object rendered by ContestQuickStart.tsx

Glossary: src/lib/data/contestGlossary.ts
  - Static map of term → definition
  - Consumed by a shared Tooltip component that auto-links glossary terms in text
```

#### Integration Points

| Integrates With                | How                                                       |
| ------------------------------ | --------------------------------------------------------- |
| `useContestContext()` (7.1)    | Calendar data for contest entries                         |
| `contestDefinitions`           | Link to existing scoring rules for "Start Contest" action |
| Shack Builder stores           | Station profile for personalized estimates                |
| `useBandConditions()`          | Current propagation for near-term contest estimates       |
| Contest Engine                 | "Start Contest" launches contest mode with correct config |
| DX Wizard propagation models   | Reuse path loss models for station estimates              |

#### Files

| File                                                  | Action  | Purpose                                                  |
| ----------------------------------------------------- | ------- | -------------------------------------------------------- |
| `src/pages/ContestExplorerPage.tsx`                   | **New** | Main contest discovery and browsing page                 |
| `src/components/contest/ContestExplorerCard.tsx`      | **New** | Expandable card for each contest with all details        |
| `src/components/contest/StationEstimate.tsx`          | **New** | Personalized station capability estimate display         |
| `src/components/contest/ContestQuickStart.tsx`        | **New** | One-page quick-start guide for a specific contest        |
| `src/lib/contest/stationEstimator.ts`                 | **New** | Algorithm: station profile + contest → contact estimate  |
| `src/lib/contest/contestQuickStart.ts`                | **New** | Template engine for contextual quick-start guides        |
| `src/lib/data/contestGlossary.ts`                     | **New** | Glossary of contest terms with plain-language definitions |
| `src/components/ui/GlossaryTooltip.tsx`               | **New** | Shared tooltip that auto-links glossary terms            |

---

### 7.7 Contest Propagation Intelligence

**Priority:** P2 (Tier 2) | **Effort:** Medium | **Persona:** Dana, all operators

#### Overview

Contest weekends generate 2-10x the normal spot volume. This is a massive, underexploited dataset for propagation analysis. Instead of treating contest spots as noise, this feature uses them as a high-density propagation probe: thousands of stations on every band simultaneously provide a near-real-time picture of ionospheric conditions that no other data source can match. The intelligence is surfaced platform-wide, benefiting all operators.

#### User Stories

**US-7.7.1: Propagation confidence improves during contest weekends**

> As any operator, I want the propagation models and confidence intervals in Solar Pulse to improve during contest weekends because there's dramatically more data available.

**Acceptance Criteria:**

- [ ] Solar Pulse "Confidence" indicator reflects spot density: higher density → narrower confidence intervals
- [ ] During contest weekends, confidence label upgrades: "Propagation confidence: HIGH (contest weekend — 2.3M spots in 6hr window)"
- [ ] Per-band confidence granularity: bands with active contests show highest confidence
- [ ] Non-contest bands still benefit from elevated overall activity

**US-7.7.2: Band opening detection accelerates during contests**

> As any operator, band opening detections should be faster and more accurate during contest weekends because the spot density provides finer-grained temporal resolution.

**Acceptance Criteria:**

- [ ] Existing band opening detection service uses spot density to adjust detection thresholds
- [ ] During contests: detect openings in 2-3 minutes vs. the normal 5-10 minutes
- [ ] Faster detection benefits all users via existing notification channels
- [ ] Visual indicator on Solar Pulse: "Detection speed: Enhanced (contest data)"

**US-7.7.3: Contest spot heatmap reveals propagation paths**

> As a DXer, I want to see a heatmap of contest QSO density overlaid on the globe/map, showing which paths are open right now based on where stations are successfully making contacts.

**Acceptance Criteria:**

- [ ] Optional overlay on PropSphere globe and 2D flat map
- [ ] Heatmap derived from spot_history during active contest windows
- [ ] Color intensity represents contact density per path/region
- [ ] Refresh interval: 5 minutes
- [ ] Toggle on/off in map controls
- [ ] Works for all operators, not just contesters

#### Technical Design

```
Spot density analysis: src/lib/contest/contestPropIntel.ts
  - Input: spot_history data for current contest window
  - Computes: spots_per_band_per_hour, path_density_map, opening_velocity
  - Exposes: confidenceMultiplier (1.0 normal, up to 3.0 during major contests)
  - Feeds into existing propagation services

Band opening detection integration:
  - Modify existing bandOpeningService to accept a sensitivity parameter
  - During contest weekends: sensitivity = confidenceMultiplier → faster detection

Heatmap rendering:
  - Aggregate spots by source grid → target grid path
  - Render as great-circle arc density on existing map layers
  - Use existing PropSphere overlay system for globe integration
```

#### Integration Points

| Integrates With            | How                                                      |
| -------------------------- | -------------------------------------------------------- |
| `useContestContext()` (7.1)| Contest windows for spot density time-boxing              |
| `spot_history` (Supabase)  | Raw spot data for density analysis                       |
| Solar Pulse confidence     | Feed confidenceMultiplier into existing CI calculation   |
| Band opening service       | Adjust detection sensitivity during contests             |
| PropSphere overlays        | Render contact density heatmap                           |

#### Files

| File                                                 | Action     | Purpose                                               |
| ---------------------------------------------------- | ---------- | ----------------------------------------------------- |
| `src/lib/contest/contestPropIntel.ts`                | **New**    | Spot density analysis and confidence multiplier       |
| `src/components/map/ContestHeatmapOverlay.tsx`       | **New**    | Great-circle path density overlay for globe/map       |
| `src/hooks/useContestPropIntel.ts`                   | **New**    | Hook: provides density data and confidence to consumers |
| `src/lib/services/bandOpeningService.ts`             | **Modify** | Accept sensitivity parameter from contest intel       |
| `src/components/solar/PropagationConfidence.tsx`     | **Modify** | Display enhanced confidence during contests           |

---

### 7.8 Award Tracking Contest Integration

**Priority:** P1 (Tier 1) | **Effort:** Small-Medium | **Persona:** Dana, Kai

#### Overview

Contest QSOs count toward DXCC, WAS, WAZ, and gridsquare awards in real life — they should in Propulse too. This feature ensures the Award Tracking Dashboard (Logbook PRD feature 6.2) properly integrates contest QSOs and provides contest-specific views that show operators how much their contest participation contributes to award progress.

Additionally, the DXCC Status Badge (feature 6.1) gains a contest-aware variant that shows multiplier significance during active contests, bridging the existing contest engine's multiplier tracking with the new logbook infrastructure.

#### User Stories

**US-7.8.1: Contest QSOs count toward award progress**

> As a DXer who made 300 contacts during CQ WW, I want all those QSOs to appear in my DXCC, WAS, and WAZ award tracking with proper credit, including new entities I worked for the first time during the contest.

**Acceptance Criteria:**

- [ ] QSOs logged through contest mode are tagged with `contestId` in the LogEntry (already partially exists via `operatingMode: "contest"`)
- [ ] Award engine (6.2) includes all QSOs regardless of operating mode — contest QSOs count equally
- [ ] After a contest, the award dashboard highlights newly worked entities/states/zones with a "NEW from CQ WW CW" badge
- [ ] Filter option on awards page: "Show contest contributions" to isolate what a specific contest added to award progress

**US-7.8.2: Award dashboard shows contest contribution breakdown**

> As a contest-curious operator, I want to see how much my contest participation contributed to my award progress, so I understand the value of contesting for my goals.

**Acceptance Criteria:**

- [ ] Awards page includes a "Contest Contributions" summary section
- [ ] Shows: "Contests this year have contributed 34 new DXCC entities, 8 new states, and 5 new zones to your awards"
- [ ] Per-contest breakdown available: "CQ WW CW 2025: +12 DXCC, +3 WAS, +2 WAZ"
- [ ] Visualized as a bar chart or progress contribution ring

**US-7.8.3: DXCC badge shows multiplier significance during contests**

> As a DXer running in a contest, when I type a callsign, the DXCC Status Badge should also indicate whether this station is a new multiplier for my contest score, in addition to the standard DXCC working status.

**Acceptance Criteria:**

- [ ] When `operatingMode === "contest"` AND a contest definition is loaded: badge shows dual status
- [ ] Primary: existing DXCC color (red/green/blue/orange/gray) from feature 6.1
- [ ] Secondary: small multiplier indicator — "New Mult!" if this callsign would be a new multiplier per the active contest's rules
- [ ] Multiplier check uses existing contest engine's multiplier tracking
- [ ] When no contest is active: badge shows standard DXCC-only behavior (no change from 6.1)

#### Technical Design

```
Contest QSO tagging:
  - LogEntry already has operatingMode: string
  - Add optional field: contestId?: string (from contest calendar entry ID)
  - When contest mode is active, qsoStore sets both operatingMode and contestId

Award engine extension: src/lib/awards/contestAwardIntegration.ts
  - computeContestContributions(entries, contestId?) → ContestContribution
  - Returns: { newDxcc: number, newWas: number, newWaz: number, newGrids: number, contestName: string }
  - Aggregates across all contests or per specific contest

DXCC badge extension:
  - useDxccStatus hook gains optional parameter: activeContestDefinition?
  - When provided, also queries contest multiplier engine for mult status
  - Returns extended object: { ...existingFields, isNewMultiplier?: boolean, multiplierType?: string }
```

#### Integration Points

| Integrates With             | How                                                        |
| --------------------------- | ---------------------------------------------------------- |
| Award Engine (6.2)          | Contest contribution computation, filter, breakdown view   |
| `useDxccStatus` (6.1)       | Extended with multiplier check during active contests      |
| `qsoStore.ts`               | Tags QSOs with contestId when in contest mode              |
| Contest scoring engine       | Queries multiplier status for DXCC badge overlay           |
| `LogEntry` type              | New optional `contestId` field                             |
| `AwardsPage.tsx` (6.2)      | Contest contributions section in awards dashboard          |

#### Files

| File                                                    | Action     | Purpose                                                 |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| `src/lib/awards/contestAwardIntegration.ts`             | **New**    | Compute contest contributions to award progress         |
| `src/components/awards/ContestContributions.tsx`        | **New**    | UI: contest contribution summary and per-contest detail |
| `src/hooks/useDxccStatus.ts`                            | **Modify** | Add optional multiplier check for active contests       |
| `src/components/qso/DxccStatusBadge.tsx`                | **Modify** | Render dual status (DXCC + multiplier) during contests  |
| `src/lib/awards/awardEngine.ts`                         | **Modify** | Support filtering by contestId, operating mode          |
| `src/lib/db/types.ts`                                   | **Modify** | Add `contestId?: string` to LogEntry type               |
| `src/stores/qsoStore.ts`                                | **Modify** | Set contestId when logging in contest mode              |
| `src/pages/AwardsPage.tsx`                              | **Modify** | Insert ContestContributions section                     |

---

### 7.9 Post-Contest QSL Batch Workflow

**Priority:** P1 (Tier 1) | **Effort:** Small | **Persona:** Dana, Sam

#### Overview

After a contest weekend, operators typically have 50-500+ new QSOs that need to be uploaded to LoTW, eQSL, and QRZ.com for confirmation. This is tedious in every existing platform — no one provides a "process all my contest QSOs" workflow. This feature adds a contest-aware batch mode to the QSL sync features from the Logbook Parity PRD (features 6.3, 6.7, 6.8).

#### User Stories

**US-7.9.1: Operator batch-uploads contest QSOs to QSL services**

> As a DXer who just finished CQ WW with 287 QSOs, I want a single "Upload Contest to LoTW" action that selects all QSOs from that contest and uploads them in one batch, rather than manually selecting entries.

**Acceptance Criteria:**

- [ ] "Contest QSL Batch" button appears in QslSyncPanel when recent contest QSOs exist (QSOs with `contestId` from the last 7 days)
- [ ] Shows a contest selector if multiple recent contests: "Which contest? CQ WW CW (287 QSOs) / ARRL 160m (43 QSOs)"
- [ ] One-click upload to LoTW, eQSL, and/or QRZ (checkboxes for which services)
- [ ] Uses existing upload infrastructure from features 6.3, 6.7, 6.8
- [ ] Progress indicator: "Uploading 287 QSOs to LoTW... 145/287"
- [ ] Summary on completion: "287 QSOs uploaded to LoTW. 287 uploaded to eQSL. 287 uploaded to QRZ.com."

**US-7.9.2: Post-contest confirmation tracking**

> As a DXer, after uploading my contest QSOs, I want to track how many get confirmed over the following weeks, especially for award credit.

**Acceptance Criteria:**

- [ ] Award dashboard shows "Pending confirmations from CQ WW CW: 287 uploaded, 42 confirmed, 245 pending"
- [ ] Confirmation count updates each time LoTW/eQSL sync runs (from features 6.3/6.7)
- [ ] Notification option: "Alert me when contest confirmations reach 50%" (milestone notifications)
- [ ] Confirmation tracking auto-clears after 90 days or when all QSOs are confirmed

**US-7.9.3: Cabrillo export integrated with batch workflow**

> As a contester, the post-contest workflow should also remind me to export my Cabrillo file for contest submission, alongside the QSL uploads.

**Acceptance Criteria:**

- [ ] "Contest QSL Batch" panel includes a "Export Cabrillo" button alongside QSL service buttons
- [ ] Uses existing Cabrillo export functionality
- [ ] Checklist UX: ☑ Export Cabrillo ☑ Upload LoTW ☑ Upload eQSL ☑ Upload QRZ — so the operator can process everything in one session

#### Technical Design

```
Contest QSO grouping: src/lib/contest/postContestBatch.ts
  - Query IndexedDB logEntries where contestId is set AND date within last 7 days
  - Group by contestId
  - Return: { contestId, contestName, qsoCount, uploaded: { lotw, eqsl, qrz }, confirmed: number }

Batch upload: leverages existing sync modules (lotwSync, eqslSync, qrzSync)
  - Passes filtered entry set (by contestId) to existing upload functions
  - Wraps with a batch coordinator for progress tracking across services

Confirmation tracking: src/lib/contest/contestConfirmationTracker.ts
  - Queries LogEntries by contestId and checks lotw/eqsl confirmation fields
  - Returns running counts, persists milestone thresholds in settingsStore
```

#### Integration Points

| Integrates With            | How                                                        |
| -------------------------- | ---------------------------------------------------------- |
| `lotwSync.ts` (6.3)       | Batch upload filtered by contestId                         |
| `eqslSync.ts` (6.7)       | Same                                                       |
| `qrzSync.ts` (6.8)        | Same                                                       |
| `QslSyncPanel.tsx` (6.7)  | Contest batch mode added as a tab/section                  |
| Cabrillo export            | Existing export, surfaced in batch workflow UI             |
| `logStore.ts`              | Query by contestId for batch grouping                      |
| Award dashboard (6.2)      | Pending confirmation display for contest QSOs              |

#### Files

| File                                                  | Action     | Purpose                                                  |
| ----------------------------------------------------- | ---------- | -------------------------------------------------------- |
| `src/lib/contest/postContestBatch.ts`                 | **New**    | Group contest QSOs, coordinate batch uploads             |
| `src/lib/contest/contestConfirmationTracker.ts`       | **New**    | Track confirmation progress for contest QSOs             |
| `src/components/qso/ContestQslBatch.tsx`              | **New**    | UI: contest selector, service checkboxes, progress, checklist |
| `src/components/qso/QslSyncPanel.tsx`                 | **Modify** | Add contest batch tab/section                            |
| `src/lib/db/logStore.ts`                              | **Modify** | Add `getEntriesByContestId()` query                      |

---

### 7.10 DX Wizard Contest-Aware Recommendations

**Priority:** P2 (Tier 2) | **Effort:** Small | **Persona:** Riley, Pat, Nico

#### Overview

Extends the DX Wizard's propagation-based band recommendations to account for contest conditions. During contest weekends, the "best band" for a non-contester isn't necessarily the band with the best propagation — it's the band with the best propagation that also has usable spectrum. This feature adjusts recommendations based on contest-induced QRM and suggests WARC bands when appropriate.

#### User Stories

**US-7.10.1: DX Wizard recommendations factor in contest QRM**

> As a non-contest operator asking "what's the best band to work Japan right now?", I want the DX Wizard to factor in that a contest is running on 20m and 15m, so it might recommend 17m instead even if propagation is slightly worse.

**Acceptance Criteria:**

- [ ] When `isContestWeekend === true`, DX Wizard recommendations include a "contest impact" factor
- [ ] For contest bands: note added — "20m: Excellent propagation, but heavy contest traffic. Consider 17m as an alternative."
- [ ] For non-contest bands: note added — "17m: Good propagation, contest-free"
- [ ] Recommendation ranking optionally adjustable: "Optimize for: Best propagation / Least congestion / Balance"
- [ ] Non-contest mode is the default when a contest is active

**US-7.10.2: DX Wizard suggests contest-free alternatives**

> As Riley the Ragchewer who always operates on 40m SSB, I want the DX Wizard to proactively suggest WARC band alternatives when my preferred band is congested with contest activity.

**Acceptance Criteria:**

- [ ] When a user's requested target band is a contest band during a contest weekend: recommendation includes "Consider these contest-free alternatives:" with ranked WARC band suggestions and their propagation quality
- [ ] Alternative suggestions include expected signal quality comparison: "17m: ~3dB weaker than 20m on this path, but contest-free"

#### Technical Design

```
Extension to existing DX Wizard recommendation engine:
  - After computing standard propagation recommendations per band:
  - If useContestContext().isContestWeekend:
    - Add contestImpact field to each band recommendation
    - For contest bands: contestImpact = "heavy" | "moderate" (based on contest size)
    - For non-contest bands: contestImpact = "none"
    - Re-rank with congestion weight (configurable): contestWeight * propagation + (1-contestWeight) * clearSpectrum
    - Default contestWeight: 0.3 (propagation still matters most, but congestion is a real factor)
  - Generate alternative suggestions for contest bands

No new page — extends existing DxWizard component
```

#### Integration Points

| Integrates With              | How                                                    |
| ---------------------------- | ------------------------------------------------------ |
| `useContestContext()` (7.1)  | Active contest bands and congestion estimates           |
| DX Wizard recommendation     | Additional ranking factor and alternative suggestions  |
| `contestSubBands.ts` (7.3)  | Sub-band data for granular congestion modeling          |

#### Files

| File                                               | Action     | Purpose                                              |
| -------------------------------------------------- | ---------- | ---------------------------------------------------- |
| `src/lib/contest/contestCongestionModel.ts`        | **New**    | Model contest QRM impact on band usability           |
| `src/components/dx/DxWizardContestNote.tsx`        | **New**    | Contest impact callout within DX Wizard results      |
| `src/components/dx/DxWizard.tsx` (or equivalent)   | **Modify** | Inject contest context into recommendation pipeline  |

---

## 7. Integration with Existing PRDs

This PRD is designed to layer cleanly on top of the existing PRDs without requiring rework. Here's how the three PRDs relate:

```
┌──────────────────────────────────────────────────────────────────┐
│                PRD: Contest Features (existing)                    │
│  Contest engine, scoring, SCP, rate sheets, Cabrillo, voice      │
│  → The "during contest" operating experience for active          │
│    contesters                                                     │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────┼──────────────────────────────────┐
│         PRD: Contest Awareness & Community (THIS PRD)              │
│  Contest calendar, dashboard weather, band map filters, alert     │
│  intelligence, quiet bands, explorer, prop intel, award           │
│  integration, QSL batch, DX Wizard awareness                     │
│  → The "contest as environment" layer for ALL operators           │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────┼──────────────────────────────────┐
│           PRD: Logbook Competitive Parity (in progress)           │
│  DXCC status, awards, LoTW, band map, sync, POTA/SOTA, eQSL,    │
│  QRZ, alerts, credential vault                                   │
│  → The daily operating platform for DXers, activators, everyone  │
└──────────────────────────────────────────────────────────────────┘
```

### Dependency Map

| This PRD Feature | Depends on Logbook PRD Feature | Depends on Contest PRD Feature |
| ---------------- | ------------------------------ | ------------------------------ |
| 7.1 Calendar     | None (foundation)              | Contest definitions (19 defs)  |
| 7.2 Dashboard    | None                           | None                           |
| 7.3 Band Map     | 6.4 Band Map Widget            | None                           |
| 7.4 Alerts       | 6.9 Alert Rules Engine         | None                           |
| 7.5 Quiet Bands  | None (uses existing prop data) | None                           |
| 7.6 Explorer     | None                           | Contest definitions, scoring   |
| 7.7 Prop Intel   | None (uses existing prop services) | None                       |
| 7.8 Awards       | 6.1 DXCC Status, 6.2 Awards   | Contest scoring (mults)        |
| 7.9 QSL Batch    | 6.3 LoTW, 6.7 eQSL, 6.8 QRZ  | Cabrillo export                |
| 7.10 DX Wizard   | None (extends existing DX Wiz) | None                           |

### LogEntry Type Extension

This PRD adds one field to LogEntry (from `src/lib/db/types.ts`):

```typescript
// Added by this PRD
contestId?: string;  // Links to ContestCalendarEntry.id for contest-mode QSOs
```

This field is set by qsoStore when `operatingMode === "contest"` and a contest definition is loaded. It supplements the existing `operatingMode` field, which only indicates the mode was "contest" without identifying which specific contest.

---

## 8. Implementation Phases

### Phase A: Contest Context Foundation (Features 7.1, 7.2, 7.5)

**Rationale:** The contest calendar engine is the foundation everything else depends on. Dashboard weather and quiet bands are the highest-impact, lowest-effort features for non-contesters. These three features deliver immediate value with no dependencies on the Logbook Parity PRD.

**Timeline:** Can begin immediately (no Logbook PRD dependencies)

| File                                                | Owner   | Action |
| --------------------------------------------------- | ------- | ------ |
| `src/lib/data/contestCalendar.ts`                   | Agent A | New    |
| `src/lib/contest/contestCalendarTypes.ts`            | Agent A | New    |
| `src/hooks/useContestContext.ts`                     | Agent A | New    |
| `src/lib/contest/contestCalendarSync.ts`             | Agent A | New    |
| `src/components/contest/ContestCalendar.tsx`         | Agent A | New    |
| `src/components/dashboard/ContestWeatherCard.tsx`    | Agent B | New    |
| `src/components/dashboard/ContestCountdown.tsx`      | Agent B | New    |
| `src/components/contest/QuietBandNav.tsx`            | Agent B | New    |
| `src/pages/Dashboard.tsx`                            | Agent B | Modify |
| `src/stores/settingsStore.ts`                        | Agent B | Modify |

**Quality gate:** `tsc --noEmit` clean. ContestWeatherCard renders with mock active contest. QuietBandNav shows correct bands for a simulated CQ WW weekend. useContestContext returns correct active/upcoming/quiet data.

### Phase B: Band Map & Alert Intelligence (Features 7.3, 7.4)

**Rationale:** These extend features 6.4 (Band Map) and 6.9 (Alert Engine) from the Logbook PRD. Should begin after Logbook PRD Phases 1 and 3 (band map) and Phase 5 (alerts) are complete.

**Timeline:** After Logbook PRD Phase 3 (band map) and Phase 5 (alerts)

| File                                                  | Owner   | Action |
| ----------------------------------------------------- | ------- | ------ |
| `src/lib/contest/spotContestClassifier.ts`            | Agent A | New    |
| `src/lib/data/contestSubBands.ts`                     | Agent A | New    |
| `src/components/qso/BandMapContestMarker.tsx`         | Agent A | New    |
| `src/lib/alerts/contestAlertLogic.ts`                 | Agent B | New    |
| `src/components/alerts/ContestAlertProfiles.tsx`      | Agent B | New    |
| `src/components/qso/BandMapControls.tsx`              | Agent A | Modify |
| `src/components/qso/BandMapSpot.tsx`                  | Agent A | Modify |
| `src/components/qso/BandMap.tsx`                      | Agent A | Modify |
| `src/hooks/useBandMapSpots.ts`                        | Agent A | Modify |
| `src/lib/alerts/alertEngine.ts`                       | Agent B | Modify |
| `src/components/alerts/AlertRuleBuilder.tsx`          | Agent B | Modify |
| `src/stores/settingsStore.ts`                         | Agent B | Modify |

**Quality gate:** `tsc --noEmit` clean. Band map correctly hides contest-classified spots. Sub-band markers render during simulated contest. Alert throttling reduces alert frequency by configured multiplier. Contest filter field visible in rule builder.

### Phase C: Explorer, Awards, QSL Batch (Features 7.6, 7.8, 7.9)

**Rationale:** Contest Explorer can be built any time after Phase A. Award integration and QSL batch depend on Logbook PRD Phases 1-2 (DXCC, awards, LoTW). These three features share a "post-contest / between-contest" workflow focus.

**Timeline:** After Logbook PRD Phase 2 (awards + LoTW)

| File                                                     | Owner   | Action |
| -------------------------------------------------------- | ------- | ------ |
| `src/pages/ContestExplorerPage.tsx`                      | Agent A | New    |
| `src/components/contest/ContestExplorerCard.tsx`         | Agent A | New    |
| `src/components/contest/StationEstimate.tsx`             | Agent A | New    |
| `src/components/contest/ContestQuickStart.tsx`           | Agent A | New    |
| `src/lib/contest/stationEstimator.ts`                    | Agent A | New    |
| `src/lib/contest/contestQuickStart.ts`                   | Agent A | New    |
| `src/lib/data/contestGlossary.ts`                        | Agent A | New    |
| `src/components/ui/GlossaryTooltip.tsx`                  | Agent A | New    |
| `src/lib/awards/contestAwardIntegration.ts`              | Agent B | New    |
| `src/components/awards/ContestContributions.tsx`         | Agent B | New    |
| `src/lib/contest/postContestBatch.ts`                    | Agent B | New    |
| `src/lib/contest/contestConfirmationTracker.ts`          | Agent B | New    |
| `src/components/qso/ContestQslBatch.tsx`                 | Agent B | New    |
| `src/hooks/useDxccStatus.ts`                             | Agent B | Modify |
| `src/components/qso/DxccStatusBadge.tsx`                 | Agent B | Modify |
| `src/lib/awards/awardEngine.ts`                          | Agent B | Modify |
| `src/lib/db/types.ts`                                    | Agent B | Modify |
| `src/stores/qsoStore.ts`                                 | Agent B | Modify |
| `src/pages/AwardsPage.tsx`                               | Agent B | Modify |
| `src/components/qso/QslSyncPanel.tsx`                    | Agent B | Modify |
| `src/lib/db/logStore.ts`                                 | Agent B | Modify |

**Quality gate:** `tsc --noEmit` clean. Contest Explorer renders all 30+ calendar entries with expandable cards. Station estimate produces reasonable range for test station profile. Contest contributions section shows correct counts from test data. QSL batch uploads correct QSO subset. DXCC badge shows multiplier indicator during simulated contest.

### Phase D: Propagation Intelligence & DX Wizard (Features 7.7, 7.10)

**Rationale:** These are the most sophisticated features, requiring stable propagation services and a working DX Wizard. They provide the most value during actual contest weekends, so real-world testing is essential.

**Timeline:** After Phases A-C complete; ideally delivered before a major contest weekend for real-world validation

| File                                                     | Owner   | Action |
| -------------------------------------------------------- | ------- | ------ |
| `src/lib/contest/contestPropIntel.ts`                    | Agent A | New    |
| `src/components/map/ContestHeatmapOverlay.tsx`           | Agent A | New    |
| `src/hooks/useContestPropIntel.ts`                       | Agent A | New    |
| `src/lib/contest/contestCongestionModel.ts`              | Agent B | New    |
| `src/components/dx/DxWizardContestNote.tsx`              | Agent B | New    |
| `src/lib/services/bandOpeningService.ts`                 | Agent A | Modify |
| `src/components/solar/PropagationConfidence.tsx`         | Agent A | Modify |
| `src/components/dx/DxWizard.tsx`                         | Agent B | Modify |

**Quality gate:** `tsc --noEmit` clean. Propagation confidence indicator shows enhanced value during simulated contest. Heatmap renders on globe with test spot data. DX Wizard shows contest notes and alternatives during simulated contest. Full `vite build` clean.

---

## 9. File Inventory

### New Files (~28)

| File                                                     | Phase | Purpose                                          |
| -------------------------------------------------------- | ----- | ------------------------------------------------ |
| `src/lib/data/contestCalendar.ts`                        | A     | Static contest calendar dataset                  |
| `src/lib/contest/contestCalendarTypes.ts`                | A     | Type definitions for contest context layer       |
| `src/hooks/useContestContext.ts`                          | A     | Core reactive hook for contest awareness         |
| `src/lib/contest/contestCalendarSync.ts`                 | A     | Optional remote calendar updates from Supabase   |
| `src/components/contest/ContestCalendar.tsx`             | A     | Calendar list/timeline view                      |
| `src/components/dashboard/ContestWeatherCard.tsx`        | A     | Dashboard contest situational awareness card     |
| `src/components/dashboard/ContestCountdown.tsx`          | A     | Countdown timer sub-component                    |
| `src/components/contest/QuietBandNav.tsx`                | A     | Contest-free band navigator widget               |
| `src/lib/contest/spotContestClassifier.ts`               | B     | Classify spots as contest-related                |
| `src/lib/data/contestSubBands.ts`                        | B     | Conventional contest frequency ranges            |
| `src/components/qso/BandMapContestMarker.tsx`            | B     | Sub-band boundary overlay for band map           |
| `src/lib/alerts/contestAlertLogic.ts`                    | B     | Contest throttle and profile switching middleware |
| `src/components/alerts/ContestAlertProfiles.tsx`         | B     | Contest-specific alert profile management UI     |
| `src/pages/ContestExplorerPage.tsx`                      | C     | Contest discovery and onboarding page            |
| `src/components/contest/ContestExplorerCard.tsx`         | C     | Expandable contest detail card                   |
| `src/components/contest/StationEstimate.tsx`             | C     | Personalized station capability estimate         |
| `src/components/contest/ContestQuickStart.tsx`           | C     | Contextual quick-start guide                     |
| `src/lib/contest/stationEstimator.ts`                    | C     | Station estimate algorithm                       |
| `src/lib/contest/contestQuickStart.ts`                   | C     | Quick-start template engine                      |
| `src/lib/data/contestGlossary.ts`                        | C     | Contest terminology glossary                     |
| `src/components/ui/GlossaryTooltip.tsx`                  | C     | Shared glossary-aware tooltip component          |
| `src/lib/awards/contestAwardIntegration.ts`              | C     | Contest contribution to award progress           |
| `src/components/awards/ContestContributions.tsx`         | C     | Contest contribution display in awards           |
| `src/lib/contest/postContestBatch.ts`                    | C     | Post-contest QSL batch coordinator               |
| `src/lib/contest/contestConfirmationTracker.ts`          | C     | Track confirmation progress for contest QSOs     |
| `src/components/qso/ContestQslBatch.tsx`                 | C     | Post-contest batch upload UI                     |
| `src/lib/contest/contestPropIntel.ts`                    | D     | Contest spot density propagation intelligence    |
| `src/components/map/ContestHeatmapOverlay.tsx`           | D     | Propagation path density heatmap overlay         |
| `src/hooks/useContestPropIntel.ts`                       | D     | Hook: density data and confidence for consumers  |
| `src/lib/contest/contestCongestionModel.ts`              | D     | Model contest QRM impact for DX Wizard           |
| `src/components/dx/DxWizardContestNote.tsx`              | D     | Contest impact callout in DX Wizard results      |

### Modified Files (~18)

| File                                              | Phases   | Changes                                                          |
| ------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `src/pages/Dashboard.tsx`                         | A        | Insert ContestWeatherCard and QuietBandNav                       |
| `src/stores/settingsStore.ts`                     | A, B     | Contest weather dismissal, band map filter, alert throttle prefs |
| `src/components/qso/BandMapControls.tsx`          | B        | Add contest filter toggle                                        |
| `src/components/qso/BandMapSpot.tsx`              | B        | Contest visual differentiation                                   |
| `src/components/qso/BandMap.tsx`                  | B        | Sub-band markers, classification filter                          |
| `src/hooks/useBandMapSpots.ts`                    | B        | Pipe spots through contest classifier                            |
| `src/lib/alerts/alertEngine.ts`                   | B        | Inject contest middleware                                        |
| `src/components/alerts/AlertRuleBuilder.tsx`      | B        | Add contest filter field                                         |
| `src/hooks/useDxccStatus.ts`                      | C        | Optional multiplier check parameter                              |
| `src/components/qso/DxccStatusBadge.tsx`          | C        | Dual status (DXCC + multiplier) during contests                  |
| `src/lib/awards/awardEngine.ts`                   | C        | Support contestId filter, operating mode filter                  |
| `src/lib/db/types.ts`                             | C        | Add `contestId?: string` to LogEntry                             |
| `src/stores/qsoStore.ts`                          | C        | Set contestId in contest mode                                    |
| `src/pages/AwardsPage.tsx`                        | C        | Insert ContestContributions section                              |
| `src/components/qso/QslSyncPanel.tsx`             | C        | Add contest batch tab                                            |
| `src/lib/db/logStore.ts`                          | C        | Add `getEntriesByContestId()` query                              |
| `src/lib/services/bandOpeningService.ts`          | D        | Accept sensitivity parameter from contest intel                  |
| `src/components/solar/PropagationConfidence.tsx`  | D        | Display enhanced confidence during contests                      |
| `src/components/dx/DxWizard.tsx`                  | D        | Inject contest context into recommendations                      |
| `src/pages/Logbook.tsx`                           | A        | Conditionally render QuietBandNav in sidebar                     |

---

## 10. Quality Gates

| Gate | After Phase | Criteria                                                                                                                                                     |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QG-A | Phase A     | `tsc --noEmit` clean. useContestContext returns correct data for simulated CQ WW weekend. Dashboard card renders active and preview states. Quiet bands correct. |
| QG-B | Phase B     | `tsc --noEmit` clean. Band map hides contest spots when filter active. Sub-band markers appear during simulated contest. Alert throttle reduces volume by 4x.   |
| QG-C | Phase C     | `tsc --noEmit` clean. Explorer renders 30+ contests. Station estimate produces range for test profile. QSL batch uploads correct subset. DXCC badge shows mults. |
| QG-D | Phase D     | `tsc --noEmit` clean. Confidence indicator enhanced during simulated contest. Heatmap renders on globe. DX Wizard shows contest notes. Full `vite build` clean. |

---

## 11. Open Questions

| #   | Question                                                                                                                                                                                                                                                                                    | Impact  | Decision Needed By   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------- |
| 1   | **Contest calendar source: static bundle vs. external API?** Static is simplest and works offline. An external API (contestcalendar.com, or our own Supabase table) stays current but adds a dependency. Recommended: static bundle with optional Supabase overlay for mid-cycle updates.       | Phase A | Before Phase A start |
| 2   | **Spot contest classification: heuristic vs. definitive?** Heuristic (time+band+mode+source) will have false positives/negatives. More definitive classification would require matching spots against known contest callsign databases (SCP data), adding complexity.                          | Phase B | Before Phase B start |
| 3   | **Station estimate model: simple tiers vs. full simulation?** Tier-based (QRP/LP/HP × antenna type) is fast to build and "good enough." Full simulation using propagation models is more accurate but significantly more complex and fragile.                                                 | Phase C | Before Phase C start |
| 4   | **Contest heatmap: client-side aggregation vs. server-side?** Client-side is simpler but may struggle with 100K+ spots. Server-side (Supabase function) handles scale but adds latency and server cost. Could start client-side and migrate.                                                  | Phase D | Before Phase D start |
| 5   | **Auto-profile switching: opt-in or opt-out?** Auto-switching alert profiles when contests start/end is powerful but could surprise users. Opt-in is safer but reduces adoption. Recommended: opt-in with prominent prompt on first contest weekend after feature ships.                       | Phase B | Before Phase B start |
| 6   | **WARC band definition: strict or inclusive?** Traditional WARC bands are 30m, 17m, 12m. Should we also include 60m (never used for contests but not traditionally "WARC")? Including it gives non-contesters one more option.                                                                | Phase A | Before Phase A start |
| 7   | **Contest Explorer: separate page vs. section in existing pages?** Separate page gives room for rich content but adds navigation complexity. Could be a modal/drawer accessible from the dashboard card. Recommended: dedicated page linked from dashboard card and navigation.               | Phase C | Before Phase C start |

---

## Appendix A: Initial Contest Calendar (30 entries)

The following contests should be included in the initial static calendar dataset. This list covers the major HF contests that produce the most significant band congestion and the highest-value DX hunting opportunities.

| Contest                         | Typical Weekend        | Duration | Bands                        | Mode(s)   | Difficulty   | Est. Participants |
| ------------------------------- | ---------------------- | -------- | ---------------------------- | --------- | ------------ | ----------------- |
| CQ WW DX CW                    | Last full wknd Oct     | 48h      | 160-10m                      | CW        | Intermediate | 40,000+           |
| CQ WW DX SSB                   | Last full wknd Nov     | 48h      | 160-10m                      | SSB       | Beginner     | 45,000+           |
| ARRL DX CW                     | 3rd full wknd Feb      | 48h      | 160-10m                      | CW        | Intermediate | 8,000             |
| ARRL DX SSB                    | 1st full wknd Mar      | 48h      | 160-10m                      | SSB       | Beginner     | 10,000            |
| CQ WPX CW                      | Last full wknd May     | 48h      | 160-10m                      | CW        | Intermediate | 7,000             |
| CQ WPX SSB                     | Last full wknd Mar     | 48h      | 160-10m                      | SSB       | Beginner     | 8,000             |
| ARRL Sweepstakes CW            | 1st full wknd Nov      | 24h      | 160-10m                      | CW        | Advanced     | 5,000             |
| ARRL Sweepstakes SSB           | 3rd full wknd Nov      | 24h      | 160-10m                      | SSB       | Intermediate | 6,000             |
| ARRL Field Day                  | 4th full wknd Jun      | 24h      | 160-6m                       | All       | Beginner     | 35,000+           |
| IARU HF World Championship     | 2nd full wknd Jul      | 24h      | 160-10m                      | CW+SSB    | Intermediate | 6,000             |
| CQ WW RTTY                     | Last full wknd Sep     | 48h      | 80-10m                       | RTTY      | Intermediate | 5,000             |
| ARRL 10 Meter Contest           | 2nd full wknd Dec      | 48h      | 10m                          | CW+SSB    | Beginner     | 4,000             |
| ARRL 160 Meter Contest          | 1st full wknd Dec      | 42h      | 160m                         | CW        | Intermediate | 2,500             |
| ARRL VHF Contest (January)      | 3rd full wknd Jan      | 33h      | 50MHz+                       | All       | Intermediate | 3,000             |
| NAQP CW                        | 2nd full wknd Jan      | 12h      | 160-10m                      | CW        | Beginner     | 3,500             |
| NAQP SSB                       | 3rd full wknd Jan      | 12h      | 160-10m                      | SSB       | Beginner     | 3,500             |
| CQ 160 Meter CW                | Last full wknd Jan     | 42h      | 160m                         | CW        | Intermediate | 2,000             |
| WAE DX CW                      | 2nd full wknd Aug      | 48h      | 80-10m                       | CW        | Advanced     | 3,000             |
| WAE DX SSB                     | 2nd full wknd Sep      | 48h      | 80-10m                       | SSB       | Intermediate | 3,000             |
| All Asian DX CW                | 3rd full wknd Jun      | 48h      | 160-10m                      | CW        | Intermediate | 2,500             |
| All Asian DX SSB               | 1st full wknd Sep      | 48h      | 160-10m                      | SSB       | Intermediate | 2,500             |
| JIDX CW                        | 2nd full wknd Apr      | 48h      | 160-10m                      | CW        | Intermediate | 2,000             |
| NA Sprint CW                   | 1st full wknd Sep      | 4h       | 80-20m                       | CW        | Advanced     | 1,000             |
| NA Sprint SSB                  | 2nd full wknd Sep      | 4h       | 80-20m                       | SSB       | Advanced     | 1,000             |
| CQ WW VHF                      | 3rd full wknd Jul      | 27h      | 50MHz, 144MHz                | All       | Intermediate | 2,000             |
| ARRL SS (digital)              | 1st wknd Jun           | 24h      | 160-6m                       | FT8/FT4   | Beginner     | 2,000             |
| Stew Perry Topband Challenge   | Last wknd Dec          | 14h      | 160m                         | CW        | Advanced     | 1,500             |
| ARRL RTTY Roundup              | 1st full wknd Jan      | 24h      | 80-10m                       | RTTY/Digi | Beginner     | 3,000             |
| SAC CW                         | Last full wknd Sep     | 24h      | 160-10m                      | CW        | Intermediate | 2,000             |
| CQMM DX Contest                | 3rd full wknd Apr      | 48h      | 80-10m                       | CW        | Intermediate | 1,500             |

*Note: Actual dates shift yearly. The static dataset should contain concrete dates for the current calendar year and be updated annually.*

---

## Appendix B: Contest Sub-Band Conventions

These are the commonly recognized sub-band allocations where contest activity is concentrated. Used by the band map (7.3) for sub-band markers and the DX Wizard (7.10) for congestion modeling.

| Band | CW Contest (kHz)    | SSB Contest (kHz)    | Digital Contest (kHz) | Non-Contest Window (kHz) |
| ---- | ------------------- | -------------------- | --------------------- | ------------------------ |
| 160m | 1800-1850           | 1850-2000            | 1838-1843             | 1850-1900 (varies)       |
| 80m  | 3500-3570           | 3600-3800 (Region 2) | 3570-3600             | 3800-4000 (Region 2)    |
| 40m  | 7000-7045           | 7125-7300 (Region 2) | 7040-7070             | 7045-7125                |
| 20m  | 14000-14060         | 14150-14350          | 14070-14112           | 14060-14150              |
| 15m  | 21000-21070         | 21200-21450          | 21070-21110           | 21070-21200              |
| 10m  | 28000-28070         | 28300-29000          | 28070-28150           | 28150-28300              |

*30m (10100-10150), 17m (18068-18168), and 12m (24890-24990) are WARC bands — contests are never held on these bands by universal convention.*

---

## Appendix C: Glossary of Contest Terms

Included in `src/lib/data/contestGlossary.ts` for the GlossaryTooltip component.

| Term                | Definition                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Contest             | A competitive event where amateur radio operators try to make as many contacts as possible within a fixed time window                     |
| Exchange            | The information swapped during a contest contact — varies by contest (e.g., signal report + zone, signal report + state)                  |
| Multiplier (Mult)   | A bonus scoring element — usually unique countries, states, or zones. Final score = points × multipliers                                 |
| Running             | Calling CQ repeatedly on a single frequency and logging stations that respond. The fastest way to accumulate contacts                     |
| Search and Pounce   | Tuning across the band looking for stations to call. Slower but doesn't require holding a frequency. Recommended for beginners            |
| Rate                | The number of contacts per hour. Competitive operators track this in real time                                                            |
| Dupe                | A duplicate contact — same station on the same band and mode. Most contests don't give credit for dupes                                   |
| QSO Party           | A relaxed, regional contest (usually state-level) designed to be fun and approachable. Great for beginners                                |
| Cabrillo            | The standard log file format for contest submissions. Named after the Cabrillo Lighthouse in California                                  |
| Section             | A geographic subdivision used as a multiplier in some contests (e.g., ARRL sections for Sweepstakes)                                     |
| Zone                | CQ zones (1-40) or ITU zones (1-90) used as multipliers in international contests                                                        |
| WARC Bands          | 30m, 17m, and 12m — bands allocated at the 1979 World Administrative Radio Conference. By convention, contests never use these bands      |
| Off-time            | Mandatory rest periods in some contests. Many 48-hour contests only allow 36 hours of operating time                                      |
| SCP                 | Super Check Partial — a database of known contest callsigns used to predict a call from partial input                                     |
| QTC                 | In WAE contests, a batch of previously logged QSO data sent as a "message" for bonus points — unique to this contest family               |
| Single-Op           | One operator, one station. The most common contest category                                                                               |
| Multi-Op            | A team operating one station together, often in shifts. Categories vary (multi-single, multi-two, multi-multi)                            |
| Assisted            | An entry category where the operator uses DX cluster spots. Unassisted means finding all stations yourself                                |
| Band Map            | A frequency-domain display showing spotted stations, used to find new contacts and multipliers                                             |
| Pileup              | When many stations call a single station simultaneously. Common for rare multipliers during contests                                      |

---

*This PRD was designed to complement, not replace, the existing Contest Features PRD and the Logbook Competitive Parity PRD. Together, the three PRDs create a complete platform that serves the entire amateur radio community — from ragchewers who want to avoid contests, to newcomers discovering contesting for the first time, to serious DXers who use contests strategically for award progress.*
