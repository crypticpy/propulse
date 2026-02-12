# Operator Profile Vision: The Ham Radio Character Sheet

> **Origin**: Brainstormed in session `20f33e25` (Feb 11, 2026). Recovered from session history
> after near-loss to context compaction. This document is the authoritative record of the
> full vision — consolidating ideas from the original brainstorm, existing PRDs, and
> follow-up discussions.

## The Core Idea

The operator profile should feel like a **baseball card meets D&D character sheet** —
information-dense, visually striking, and deeply relevant to what ham radio operators
actually care about. Not a generic social media profile with a bio and a photo.

Every section should answer the question: **"What would a ham radio operator want to know
about another ham radio operator?"**

The profile should be populated as much as possible from **data we already have** — logbook
QSOs, equipment in Shack Builder, band conditions, propagation models, spot history — so
it feels alive and earned, not just filled out in a form.

---

## 1. Hero Stats Block (The Baseball Card Front)

The top of every profile shows at-a-glance operator statistics, auto-computed from
logbook data:

| Stat             | Source                                 | Display                        |
| ---------------- | -------------------------------------- | ------------------------------ |
| Total QSOs       | Logbook count                          | `12,847`                       |
| Countries Worked | Unique DXCC from logbook               | `147 / 340` with progress bar  |
| Grids Activated  | Unique grids from logbook              | `89`                           |
| Furthest Contact | Max great-circle distance from logbook | `18,432 km` with mini map line |
| Longest Streak   | Consecutive days with QSOs             | `47 days`                      |
| Favorite Band    | Band with most QSOs                    | `20m (3,456 QSOs)`             |
| Primary Mode     | Mode with most QSOs                    | `FT8 (5,234 QSOs)`             |

These are **read-only, auto-computed** — the operator earns them, they don't type them in.

### Personal Records

A "records" sub-section with achievements that feel like game stats:

- **Furthest QSO**: Distance, callsign, band, date — with a mini great-circle line on a tiny map
- **Best Single Day**: Most QSOs in 24 hours (contest days will shine here)
- **Most Countries in a Day**: Peak DXCC count in 24h
- **Most Bands in a Day**: Peak band diversity
- **Rarest DXCC**: The entity with the fewest total QSOs on the platform
- **Best SNR**: Strongest signal report received (from FT8/FT4 data)
- **Weakest Signal Decoded**: Lowest SNR successfully decoded (QRP bragging rights)

---

## 2. Operating Archetypes (The D&D Character Sheet)

Auto-detected from logbook patterns, displayed as a **radar/spider chart** or as
**archetype badges**. Each operator gets scored on these axes:

| Archetype                  | Detection Logic                                                 |
| -------------------------- | --------------------------------------------------------------- |
| **DXer**                   | High unique-DXCC count, long-distance QSOs, diverse grids       |
| **Ragchewer**              | Long QSO durations (SSB/CW), repeat contacts with same stations |
| **Contester**              | High QSO rates during contest weekends, contest-mode activity   |
| **Digital Wizard**         | Heavy FT8/FT4/RTTY usage, digital mode diversity                |
| **CW Traditionalist**      | High CW percentage, especially manual CW (non-contest)          |
| **Band Explorer**          | Activity spread across many bands, including VHF/UHF/microwave  |
| **Night Owl / Early Bird** | Operating hour distribution skewed to night/morning             |
| **QRP Warrior**            | Low power QSOs, high distance-per-watt ratio                    |
| **Elmering Spirit**        | Mentorship activity, helping new operators (from social data)   |
| **Net Regular**            | Frequent net check-ins, NCS activity                            |

**Display options**:

- **Radar chart**: Pentagon/octagon shape showing relative strengths (like a D&D ability score chart)
- **Top 3 badges**: Show the operator's strongest archetypes as colored badges
- **Full breakdown**: Expandable detail view with percentile rankings

The archetype system makes profiles feel **personal and earned** — two operators with
the same QSO count look completely different based on how they operate.

---

## 3. "Where to Find Me" Section

This is the section that makes Propulse profiles uniquely useful compared to QRZ or
HamQTH. It answers: **"If I want to work this station, where and when do I look?"**

### Favorite Frequencies

Operator-declared list of frequencies they monitor or call CQ on:

- `14.250 MHz SSB` — "My daily ragchew freq"
- `7.074 MHz FT8` — "Always running FT8 here"
- `146.520 MHz FM` — "Mobile simplex"

### Nets I Check Into

Linked to the net database (PRD-NET-DATABASE.md):

- **OMISS 20m Net** — Tuesdays, 0100 UTC
- **Straight Key Century Club** — Sundays, 2000 UTC
- **Local ARES Net** — Mondays, 0200 UTC on 146.940 MHz

Each net links to the net detail page. Other operators can see shared nets.

### Typical Operating Hours

Auto-generated **clock-face heatmap** from `qsosByHourUtc` logbook data:

- Circular 24-hour clock with heat intensity showing when this operator is most active
- Adjustable: UTC or local time display
- Hoverable segments showing QSO count per hour

### Active Days

Auto-generated from logbook: which days of the week they're most active (bar chart or
dot pattern).

### Sked Availability

Manual toggle:

- **Open for skeds** — "Message me to schedule a QSO"
- **Busy season** — "Contest prep, limited availability"
- **Off the air** — "Traveling, back in March"

---

## 4. "Contact This Station" (Propagation-Aware Social)

**This is the killer feature.** When you're viewing another operator's profile and
you're logged in, the profile shows a **live contact feasibility panel**:

### What You See

```
┌─────────────────────────────────────────────────┐
│  Contact KB0EL                                   │
│                                                   │
│  Distance: 2,437 km (EM73 → FN42)               │
│  Bearing: 047°                                    │
│                                                   │
│  Band Conditions Right Now:                       │
│  ┌──────────────────────────────────────────┐    │
│  │ 20m  ████████████  Excellent  ← Try this │    │
│  │ 15m  ████████░░░░  Good                  │    │
│  │ 40m  ██████░░░░░░  Fair                  │    │
│  │ 10m  ██░░░░░░░░░░  Poor                  │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  Shared Bands: 20m, 40m, 15m (from logbook)     │
│  Shared Modes: FT8, SSB                          │
│                                                   │
│  Their typical hours: ████░░░░░░██████░░░░░░██  │
│  Your typical hours:  ░░████████░░░░░░████░░░░  │
│  Overlap window:      ░░██████░░░░░░░░████░░░░  │
│                                                   │
│  Best time to try: ~1400-1800 UTC on 20m SSB    │
│                                                   │
│  [Schedule a QSO]  [Add to Watch List]           │
└─────────────────────────────────────────────────┘
```

### Data Sources (All Already Built)

| Data                   | Source                                                     | Status                              |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------- |
| Distance & bearing     | `calculateGreatCircleDistance()` in `bands.ts`             | Built                               |
| Band conditions        | `calculateBandConditions()` + K-index + SFI hooks          | Built                               |
| Operating hours        | `qsosByHourUtc` from logbook stats                         | Built                               |
| Shared bands/modes     | Cross-reference two operators' logbook stats               | Needs wiring                        |
| Propagation model      | `calculateBandConditions()` for path-specific prediction   | Needs enhancement for path-specific |
| Spot Watch integration | "Add to Watch List" triggers Spot Watch for their callsign | Built                               |

### Enhancement: Path-Specific Propagation

Currently `calculateBandConditions()` gives general conditions. For "Contact This Station"
we need **path-specific** prediction factoring in:

- Great circle distance between the two stations
- Time of day at both endpoints
- Solar terminator position relative to the path
- K-index impact on the specific path latitude

This builds on the existing propagation model documented in
`docs/plans/PLAN-PROPAGATION-MODEL.md` (3-level architecture).

---

## 5. Interest & Activity Tags

Operator-selected tags displayed as colored pills on the profile. Predefined vocabulary
with shared-interest highlighting (when viewing someone else's profile, shared tags glow):

### Tag Categories

**Operating Activities**:
`DXing` `Contesting` `Ragchewing` `POTA` `SOTA` `IOTA` `Field Day`
`EmComm / ARES` `Satellite` `EME (Moonbounce)` `SSTV` `APRS`

**Modes**:
`CW` `SSB` `FT8` `FT4` `RTTY` `AM` `FM` `Digital Modes` `Data Modes`

**Technical Interests**:
`QRP` `Homebrew` `Antenna Experimenter` `SDR` `Remote Operating`
`Microwave` `VHF/UHF` `HF`

**Community Roles**:
`Elmer / Mentor` `Net Control Station` `Club Officer` `ARRL Member`
`Volunteer Examiner`

### Display

- Colored pills grouped by category
- When viewing another operator's profile: **shared tags highlighted** with a subtle glow
- Tags are searchable in operator discovery ("find operators into POTA near me")

---

## 6. "On The Air" Live Status

Real-time indicator when an operator is currently active:

### Status States

| State            | Indicator                        | Source                                   |
| ---------------- | -------------------------------- | ---------------------------------------- |
| **On Air**       | Green pulse dot + band/mode/freq | Manual toggle or auto-detect from bridge |
| **Active Today** | Amber dot                        | Auto: QSO logged today                   |
| **Listening**    | Blue dot + frequency             | Manual: monitoring but not transmitting  |
| **Offline**      | Gray dot or hidden               | Default / opted out                      |

### "On Air" Details

When an operator sets themselves as On Air, they can specify:

- **Band & Mode**: "20m SSB"
- **Frequency** (optional): "14.250 MHz"
- **Location** (optional): "Home", "POTA K-1234", "Portable/EM73"
- **Notes**: "Running POTA K-1234, looking for P2P"
- **Auto-expire**: 1, 2, 4, or 8 hours

Friends get optional notifications when someone goes on air.

---

## 7. Social & Discovery Features

### Friends & Collaborators

- Follow-based social graph (from PRD-SOCIAL-AND-FRIENDS.md)
- **QSO-based suggestions**: "You've worked KB0EL 7 times on 20m, 40m, 15m. Follow them?"
- **Mutual friends** shown on profiles
- **QSO history** between you and the profile owner

### Operator Discovery / Matchmaking

Finding other operators based on:

1. **Proximity**: Nearby grid squares (configurable radius)
2. **Shared interests**: Matching tags (DXing + POTA = strong match)
3. **Shared bands/modes**: Both active on 20m SSB
4. **QSO history**: Worked each other before
5. **Propagation feasibility**: Currently reachable based on band conditions (the unique differentiator)
6. **Schedule overlap**: Similar operating hours

### "Operators You Can Work Right Now"

A discovery feed combining:

- Friends who are currently On Air
- Operators in your interest areas who are On Air
- Operators whose grid is currently reachable on open bands
- Sorted by contact probability (propagation + distance + band match)

This is **matchmaking** — using everything Propulse knows (propagation, solar data,
operator preferences, equipment, location) to connect operators who can actually
make contact right now.

---

## 8. Profile Layout

### Profile Card Sidebar (Desktop: 320px sticky)

Redesigned as a **collector card** with 9 elements:

1. **Avatar** with rank-driven frame (existing: RankBorderStyles.ts)
2. **Callsign + Name** with rank badge
3. **On Air indicator** (green pulse when active)
4. **Photo carousel** (station photos from Shack Builder)
5. **Quick stats row**: QSOs | Countries | Grid
6. **Operating hours mini-bar** (24h heat strip, compact)
7. **Archetype badges** (top 3)
8. **Interest tags** (pills, scrollable)
9. **Completeness ring** (how filled-out is the profile)

### Tab Order (Information-Forward)

Reordered to put what hams care about first:

1. **Overview** — Hero stats, personal records, archetype chart, "Where to Find Me"
2. **My Shack** — Equipment cards, station diagram, band coverage
3. **Stats & Records** — Deep stats: QSOs by band/mode charts, activity heatmap, records table
4. **Awards** — Achievement badges, DXCC progress, WAS, WAZ, contest placements
5. **Social** — Friends, activity feed, QSO history with visitor

### "Contact This Station" Panel

Appears as a **sticky footer or floating panel** when viewing another operator's profile
(not your own). Always visible, always showing current propagation feasibility.

---

## 9. Data-Driven Population

The profile should feel alive without requiring the operator to manually fill everything.
Sources:

| Profile Element      | Auto Source                                   | Manual Override       |
| -------------------- | --------------------------------------------- | --------------------- |
| Hero stats           | Logbook aggregation                           | No (earned)           |
| Personal records     | Logbook analysis                              | No (earned)           |
| Archetypes           | Logbook pattern detection                     | No (earned)           |
| Operating hours      | `qsosByHourUtc` from logbook                  | Can hide              |
| Favorite band/mode   | Logbook stats                                 | Can override          |
| Equipment showcase   | Shack Builder data                            | Edit in Shack         |
| Band coverage        | Equipment specs from Shack Builder            | Auto                  |
| Location/grid        | Callsign lookup (callook, HamQTH, QRZ)        | Can override          |
| License info         | Callsign lookup                               | Auto                  |
| On Air status        | Bridge WebSocket or manual toggle             | Manual                |
| Interest tags        | —                                             | Manual (curated list) |
| Favorite frequencies | —                                             | Manual                |
| Nets                 | — (future: auto-detect from logbook patterns) | Manual                |
| Sked availability    | —                                             | Manual                |
| Bio / description    | —                                             | Manual (free text)    |

**Goal**: A new user who imports their logbook and adds their equipment should have a
**rich, impressive profile with zero additional effort**. The manual fields (tags,
frequencies, nets, bio) are cherry on top.

---

## 10. Existing Infrastructure

### Already Built

- `ProfileCard.tsx` — Desktop/mobile cards with rank integration
- `ShareCard.tsx` + `cardRenderer.ts` — 7 rank-gated card templates, 1200x630px export
- 9 rank visual components (`RankBadge`, `RankBorderStyles`, `CardFlip`, `MouseTilt`, `ParticleAurora`, `StatCountUp`, `LegendaryEffects`, `EtherealEffects`, `RankUpCelebration`)
- 30+ profile component files (StatCard, AwardProgressRing, AchievementGrid, ActivityHeatmap, QSOByBandChart, etc.)
- `useOperatorRank()`, `rankEngine.ts`, `rankConstants.ts`
- `calculateBandConditions()`, `calculateGreatCircleDistance()`, solar data hooks
- Spot Watch engine (for "Add to Watch List" integration)
- Equipment card system (S/M/L/XL with trading card aesthetic)

### Needs Building

- Operating archetype detection engine (logbook pattern analysis)
- "Contact This Station" propagation panel
- Path-specific propagation enhancement
- Clock-face operating hours visualization
- Interest tag CRUD + discovery matching
- "Where to Find Me" section components
- "On Air" status system (manual toggle + optional bridge auto-detect)
- Operator discovery / matchmaking feed
- Schedule overlap calculation
- Profile tab reorder + information-forward layout

### Related PRDs

- `docs/requirements/PRD-OPERATOR-PROFILE.md` — V1 profile (partially implemented)
- `docs/requirements/phase-2/PRD-OPERATOR-PROFILE-V2.md` — V2 enhancements
- `docs/requirements/phase-2/PRD-SOCIAL-AND-FRIENDS.md` — Social layer, tags, discovery
- `docs/requirements/phase-2/PRD-GAMIFICATION-ENGINE.md` — Badges, ranks, challenges
- `docs/requirements/phase-2/PRD-NET-DATABASE.md` — Net schedules, NCS registration
- `docs/designs/card-level-up-system.md` — Visual progression system (10 features, 7 ranks)
- `docs/guides/card-design-best-practices.md` — Card design research (MTG, D&D, Pokemon, etc.)

---

## Why This Matters

No other ham radio platform does this. QRZ is a phone book. HamQTH is a lookup service.
LoTW is a confirmation database. None of them answer the question a ham operator actually
has when they find another operator:

**"Can I work this person? When? On what band? What are they into? Would they want to
talk to me?"**

Propulse already has every piece of data needed to answer those questions. The operator
profile is where it all comes together.
