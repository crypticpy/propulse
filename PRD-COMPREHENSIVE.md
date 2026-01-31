# Propulse - Comprehensive Ham Radio Operator Toolset

## Product Requirements Document

**Version:** 2.0
**Date:** January 31, 2026
**Project Codename:** Propulse
**Tagline:** _"The ionosphere, visualized"_

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Market Analysis & Competitive Landscape](#market-analysis--competitive-landscape)
3. [Target Users & Use Cases](#target-users--use-cases)
4. [Design Philosophy](#design-philosophy)
5. [Product Architecture](#product-architecture)
6. [Feature Specifications](#feature-specifications)
7. [Data Sources & APIs](#data-sources--apis)
8. [Technical Architecture](#technical-architecture)
9. [Progressive Disclosure Strategy](#progressive-disclosure-strategy)
10. [Implementation Roadmap](#implementation-roadmap)
11. [Appendices](#appendices)

---

## Executive Summary

### What We're Building

**Propulse** is a modern, web-based ham radio operator toolset that combines real-time solar weather monitoring, global propagation visualization, and contact logging into a unified, elegantly designed platform. It replaces the fragmented, engineer-built tools that currently dominate the amateur radio space with a thoughtfully designed experience that serves both beginners and advanced DXers.

### Core Components

| Component             | Purpose                                     | Standalone URL |
| --------------------- | ------------------------------------------- | -------------- |
| **Solar Pulse**       | Real-time solar weather dashboard           | `/solar`       |
| **PropSphere**        | Interactive propagation map & path analysis | `/map`         |
| **LogBook**           | Contact logging with award tracking         | `/log`         |
| **Unified Dashboard** | Personalized quick-glance view              | `/` (home)     |

### Key Differentiators

1. **Progressive Disclosure** — Show what matters now, reveal depth on demand
2. **Unified Data** — One place for solar conditions, propagation, spots, and logging
3. **Modern UX** — Beautiful, intuitive interface that doesn't require a manual
4. **Location-Aware** — Everything contextualized to your QTH and targets
5. **Real-Time + Predictive** — Both live conditions and future planning tools

---

## Market Analysis & Competitive Landscape

### Current Tools & Their Limitations

#### Solar/Propagation Data

| Tool              | Strengths                                             | Weaknesses                                                              |
| ----------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| **HamQSL.com**    | Comprehensive solar data, embeddable widgets          | Dated design (1990s aesthetic), no interactivity, information overload  |
| **VOACAP Online** | Gold-standard HF predictions, scientifically accurate | Complex UI, steep learning curve, point-in-time only, no real-time data |
| **DXLook**        | Real-time propagation, multiple data sources          | New (2025), limited features, no integrated logging                     |
| **SolarHam**      | Detailed space weather analysis                       | Overwhelming for beginners, focused on solar events not radio           |
| **HamClock**      | Good visualization, real-time data                    | End of life (June 2026), desktop app only                               |
| **DXMaps**        | Excellent Sporadic E visualization                    | Narrow focus (VHF), no HF propagation context                           |

#### Logging Software

| Tool                 | Strengths                               | Weaknesses                                          |
| -------------------- | --------------------------------------- | --------------------------------------------------- |
| **N1MM Logger+**     | Industry standard for contesting, free  | Desktop only, steep learning curve, dated UI        |
| **Ham Radio Deluxe** | Full-featured suite, good integration   | Expensive ($100+), Windows only, complex            |
| **Log4OM**           | Good VOACAP integration, award tracking | Desktop only, overwhelming feature set              |
| **QRZ Logbook**      | Web-based, large community              | Limited features, tied to QRZ ecosystem             |
| **CloudLog**         | Self-hosted, modern architecture        | Requires server setup, minimal propagation features |

### Market Gap Analysis

```
                    Simple ←────────────────────────→ Complex
                        │                               │
           Beginner     │     ╔═══════════════╗        │    Expert
           Friendly     │     ║   PROPULSE    ║        │    Tools
                        │     ║   (our gap)   ║        │
                        │     ╚═══════════════╝        │
                        │                               │
    ┌───────────────────┼───────────────────────────────┼─────────────┐
    │  Basic solar      │                               │  VOACAP     │
    │  widgets          │                               │  N1MM       │
    │  (HamQSL)         │                               │  HRD        │
    └───────────────────┴───────────────────────────────┴─────────────┘
```

**The opportunity:** No tool currently occupies the space of "powerful but approachable." Propulse will be the first platform that serves beginners while still providing the depth that experienced operators need.

### Best-of-Breed Features to Incorporate

From our research, these are the features experienced operators actually use and value:

#### From VOACAP

- Point-to-point path analysis
- MUF calculations
- Best-band-for-time predictions
- Take-off angle considerations
- Multi-hop path visualization

#### From DXLook

- Real-time aggregated spot data
- Multiple data source fusion (PSKReporter + RBN + DX Cluster)
- Live propagation visualization

#### From N1MM/HRD

- ATNO (All-Time New One) alerts
- "Needed" filtering on DX spots
- Award progress tracking (DXCC, WAS, WAZ)
- LoTW/eQSL integration
- ADIF import/export

#### From DXMaps

- Sporadic E cloud visualization
- Real-time VHF propagation
- Contact path visualization

#### From PSKReporter

- Real-time digital mode spots
- Signal strength reports
- Geographic distribution of activity

---

## Target Users & Use Cases

### User Personas

#### 1. "New Nick" — The Beginner

**Profile:**

- Recently licensed (Tech or General)
- Curious about HF but intimidated
- Has basic equipment, unsure when/how to use it
- Limited knowledge of propagation physics

**Primary Questions:**

- "Is anything open right now?"
- "Can I reach anyone with my antenna?"
- "What does that number mean?"

**Needs:**

- Plain-language explanations
- Simple yes/no guidance on bands
- Contextual help and tooltips
- No assumed knowledge

**Use Pattern:** Checks once/twice daily, wants quick answers

---

#### 2. "DX Diana" — The Casual DXer

**Profile:**

- General or Extra class, 2-5 years experience
- Works HF regularly, interested in DXCC
- Comfortable with digital modes (FT8)
- Wants to improve DX success rate

**Primary Questions:**

- "When is the best time to work Japan?"
- "Is the greyline hitting my path soon?"
- "What bands should I try for South Africa?"

**Needs:**

- Path-specific predictions
- Time-based planning tools
- Band condition forecasts
- Spot integration for activity awareness

**Use Pattern:** Checks before operating, uses during contests

---

#### 3. "Contest Carl" — The Serious Contester

**Profile:**

- Extra class, 10+ years experience
- Participates in major contests (CQ WW, ARRL DX)
- May run multi-op or SO2R
- Deep knowledge of propagation

**Primary Questions:**

- "What multipliers am I missing?"
- "Where's the activity on 15m right now?"
- "What's the rate on each band?"

**Needs:**

- Real-time spot aggregation with filtering
- Multiplier tracking
- Band activity visualization
- Contest-specific mode

**Use Pattern:** Intensive use during contests, casual otherwise

---

#### 4. "Emergency Ed" — The Preparedness Operator

**Profile:**

- ARES/RACES member, emergency communications focus
- Needs reliable regional communications
- Less interested in DX, more in NVIS
- Wants to know when HF is reliable

**Primary Questions:**

- "Can I reliably reach stations 500 miles away?"
- "Is there a solar event that will disrupt comms?"
- "What's the best frequency for regional coverage?"

**Needs:**

- NVIS propagation predictions
- Solar event alerts (flares, storms)
- Regional coverage maps
- Simple status indicators

**Use Pattern:** Monitors continuously, critical use during events

---

### Use Case Matrix

| Use Case                           | New Nick | DX Diana | Contest Carl | Emergency Ed |
| ---------------------------------- | -------- | -------- | ------------ | ------------ |
| Check current conditions           | ★★★      | ★★       | ★            | ★★★          |
| Path analysis to specific location | ★        | ★★★      | ★★           | ★★           |
| View real-time spots               |          | ★★       | ★★★          |              |
| Plan future operating time         |          | ★★★      | ★★★          | ★★           |
| Log contacts                       | ★        | ★★★      | ★★★          | ★★           |
| Track award progress               |          | ★★★      | ★★           |              |
| Monitor for solar events           | ★        | ★        | ★★           | ★★★          |
| Contest scoring                    |          |          | ★★★          |              |

---

## Design Philosophy

### Core Principles

#### 1. Progressive Disclosure — "Depth on Demand"

**Level 1: Glanceable**
At a glance, answer: "Should I turn on my radio?"

```
┌─────────────────────────────────────────────┐
│  HF CONDITIONS: GOOD ● ● ● ○ ○              │
│  Best bands now: 20m, 17m, 15m              │
│  Solar: SFI 145 | Kp 2 | Quiet              │
└─────────────────────────────────────────────┘
```

**Level 2: Informative**
One click reveals: "What's open where?"

```
┌─────────────────────────────────────────────┐
│  BAND CONDITIONS FROM YOUR QTH              │
│  ┌─────┬────────┬────────┬─────────┐        │
│  │Band │ Day    │ Night  │ Activity│        │
│  ├─────┼────────┼────────┼─────────┤        │
│  │ 20m │ ●Exc   │ ○Fair  │ ▇▇▇▇▇▇▇ │        │
│  │ 17m │ ●Good  │ ○Poor  │ ▇▇▇▇    │        │
│  │ 15m │ ●Exc   │ ○Poor  │ ▇▇▇▇▇   │        │
│  └─────┴────────┴────────┴─────────┘        │
└─────────────────────────────────────────────┘
```

**Level 3: Analytical**
Drill down reveals: "Why, and what should I do?"

```
┌─────────────────────────────────────────────┐
│  20M DETAILED ANALYSIS                      │
│                                             │
│  Current MUF: 21.4 MHz (via GIRO)           │
│  D-Layer Absorption: Minimal                │
│  Predicted opening: 3 more hours            │
│                                             │
│  Best paths from EM10:                      │
│  → Europe (14:00-18:00 UTC)                 │
│  → Japan (22:00-02:00 UTC)                  │
│  → South America (now)                      │
│                                             │
│  Live activity: 847 FT8 | 234 CW | 156 SSB  │
└─────────────────────────────────────────────┘
```

---

#### 2. Context is Everything

Every piece of information should be relevant to the user's:

- **Location** — Band conditions from their QTH, not global averages
- **Time** — What's happening now, and what will happen in their operating window
- **Goals** — Filtered to what they care about (DX vs local, digital vs voice)

---

#### 3. Data Without Noise

**Before (typical ham tool):**

```
Solar Flux: 145.3 sfu ↑ (+2.1 from yesterday)
A Index: 8 (Ap=8, K=2, Planetary K=2.33, Boulder K=2)
X-Ray Background: B4.2 (quiet), latest event: C1.3 at 14:32 UTC
Electron Flux: 1.2e+04 pfu
Proton Flux: 0.42 pfu (< 10 MeV)
...
```

**After (Propulse):**

```
SOLAR CONDITIONS: Quiet ☀️
The sun is calm today. Good conditions for HF.

SFI 145 · Kp 2 · No flares expected
[Show detailed solar data ▼]
```

---

#### 4. Explain, Don't Assume

Every technical term should have a tooltip or contextual explanation:

```
┌─────────────────────────────────────────────┐
│ K-Index: 2 ● Quiet                          │
│                                             │
│ ℹ️ The K-index measures geomagnetic         │
│    disturbance. Lower = better HF.          │
│    • 0-2: Quiet (excellent)                 │
│    • 3-4: Unsettled (still good)            │
│    • 5+: Storm (HF may be disrupted)        │
└─────────────────────────────────────────────┘
```

---

### Visual Design Language

#### Color Palette

| Color             | Hex       | Usage                                          |
| ----------------- | --------- | ---------------------------------------------- |
| **Plasma Orange** | `#FF6B35` | Primary accent, energy, radio waves, sun       |
| **Signal Green**  | `#00FF88` | Positive conditions, good propagation, success |
| **Caution Amber** | `#FFD23F` | Warning, fair conditions, attention needed     |
| **Alert Red**     | `#FF4455` | Poor conditions, danger, problems              |
| **Aurora Purple** | `#AA44FF` | Aurora, VHF enhancement, special events        |
| **Cosmic Cyan**   | `#44DDFF` | Sporadic E, VHF, secondary accent              |
| **Deep Space**    | `#0A0A1A` | Background base                                |
| **Nebula Blue**   | `#1A1A2E` | Card backgrounds, panels                       |

#### Typography

| Use         | Font           | Weight  | Notes                            |
| ----------- | -------------- | ------- | -------------------------------- |
| Headlines   | Orbitron       | 700-900 | Sci-fi feel, technical authority |
| Data Values | JetBrains Mono | 400-600 | Monospace for numbers/codes      |
| Body Text   | Inter          | 400-500 | Readable, accessible             |
| Labels      | Inter          | 500     | UPPERCASE for categories         |

#### Visual Motifs

- **Space/cosmic theme** — Stars, gradients, glow effects
- **Subtle animations** — Data feels alive, not static
- **Card-based layout** — Clear information hierarchy
- **Generous whitespace** — Reduce cognitive load
- **Dark mode primary** — Easier on eyes, better contrast

---

## Product Architecture

### Site Map

```
propulse.app/
├── /                     # Unified Dashboard (personalized home)
├── /solar                # Solar Pulse - Solar weather dashboard
├── /map                  # PropSphere - Interactive propagation map
│   ├── ?view=globe       # 3D globe view
│   ├── ?view=flat        # Mercator projection
│   └── ?view=azimuthal   # Beam heading view
├── /log                  # LogBook - Contact logging
│   ├── /log/new          # Log a new contact
│   ├── /log/import       # ADIF import
│   └── /log/awards       # Award tracking
├── /spots                # Live DX Spots (filterable)
├── /settings             # User preferences
│   ├── /settings/station # QTH, callsign, equipment
│   ├── /settings/display # Theme, units, time format
│   └── /settings/alerts  # Notification preferences
├── /learn                # Educational content
│   ├── /learn/propagation
│   ├── /learn/solar
│   └── /learn/glossary
└── /api                  # Public API (future)
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PROPULSE APP                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Solar Pulse │  │  PropSphere │  │   LogBook   │             │
│  │  (Dashboard) │  │    (Map)    │  │  (Logging)  │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│  ┌──────┴────────────────┴────────────────┴──────┐             │
│  │              Shared State (Zustand)            │             │
│  │  • userQTH      • solarData    • logEntries   │             │
│  │  • preferences  • spotCache    • awardStatus  │             │
│  └──────────────────────┬────────────────────────┘             │
│                         │                                       │
│  ┌──────────────────────┴────────────────────────┐             │
│  │              Data Layer (React Query)          │             │
│  │  • NOAA SWPC    • PSKReporter  • DX Cluster   │             │
│  │  • GIRO         • RBN          • LoTW         │             │
│  └───────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature Specifications

### Module 1: Unified Dashboard (`/`)

**Purpose:** Personalized quick-glance view answering "What should I know right now?"

#### 1.1 Quick Status Header

```
┌─────────────────────────────────────────────────────────────────┐
│ ☀️ PROPULSE                              N5XXX · EM10 · Austin   │
│ ─────────────────────────────────────────────────────────────── │
│ HF: GOOD ● ● ● ○ ○    VHF: FAIR ● ● ○ ○ ○    14:32 UTC · 08:32 L│
└─────────────────────────────────────────────────────────────────┘
```

**Data Points:**

- Overall HF condition rating (calculated from SFI, Kp, current band status)
- Overall VHF condition rating (Sporadic E probability, tropo)
- Current UTC and local time
- User's callsign, grid square, location

#### 1.2 Bands At-a-Glance Card

**Display:** Horizontal band status strip with activity indicators

```
┌─────────────────────────────────────────────────────────────────┐
│ 📡 BANDS FROM YOUR QTH                                          │
│                                                                 │
│ 160m  80m  60m  40m  30m  20m  17m  15m  12m  10m   6m         │
│  ⚫    ⚫   ⬤    🟢   🟢   🟢   🟢   🟡   ⚫    ⚫    ⚫          │
│       🌙       ▃▃   ▅▅   ▇▇   ▅▅   ▃▃                          │
│               activity bars                                     │
│                                                                 │
│ 🟢 Excellent  🟡 Good  ⬤ Fair  ⚫ Poor  🌙 Night-only            │
└─────────────────────────────────────────────────────────────────┘
```

**Interaction:**

- Click any band → Opens detailed band panel
- Activity bars show relative spot activity from PSKReporter

#### 1.3 Solar Summary Card

```
┌─────────────────────────────────────────────────────────────────┐
│ ☀️ SOLAR CONDITIONS                                     Quiet   │
│                                                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │ SFI      │ │ Kp       │ │ SSN      │ │ A-Index  │            │
│ │   145    │ │   2.3    │ │   98     │ │   10     │            │
│ │   sfu ↗  │ │   Quiet  │ │  spots   │ │   Quiet  │            │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                 │
│ ⚡ Flare chance: 25% M-class | 5% X-class    [View Details →]   │
└─────────────────────────────────────────────────────────────────┘
```

#### 1.4 Active Spots Feed (Mini)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📻 LIVE ACTIVITY                               [Filter] [More]  │
│                                                                 │
│ 🟢 JA1XYZ   14.074 FT8   7,200 km   12 min ago   🔔 ATNO        │
│    DL8ABC   14.235 SSB   8,100 km   15 min ago                  │
│    VK2DEF   21.074 FT8   16,000 km  18 min ago                  │
│ 🟠 P29XXX   18.100 CW    12,500 km  22 min ago   🏆 New mult    │
│                                                                 │
│ Showing: All bands · Needed only · Last 30 min                  │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**

- Real-time spot feed from PSKReporter + RBN + DX Cluster
- Visual indicators for ATNO (All-Time New One) and new multipliers
- Filterable by band, mode, needed-only
- Click spot → Opens PropSphere with path analysis

#### 1.5 Greyline Alert Card (Contextual)

_Only appears when greyline is relevant to user's QTH_

```
┌─────────────────────────────────────────────────────────────────┐
│ 🌅 GREYLINE APPROACHING                                         │
│                                                                 │
│ Your greyline window opens in 45 minutes (15:17 UTC)            │
│                                                                 │
│ Prime targets at greyline:                                      │
│ → Western Europe (G, F, DL, EA) on 40m/80m                      │
│ → West Africa (5N, 5T, 6W) on 40m                               │
│                                                                 │
│ [View on Map →]                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 1.6 Recent Contacts Card

```
┌─────────────────────────────────────────────────────────────────┐
│ 📝 RECENT CONTACTS                                  [Log New +] │
│                                                                 │
│ Today (3 QSOs)                                                  │
│ • JA1ABC   20m FT8   14:02   ✓ LoTW                             │
│ • G4XYZ   40m SSB   12:45   ⏳ Pending                          │
│ • VE3DEF   17m CW   10:30   ✓ LoTW                              │
│                                                                 │
│ DXCC Progress: 247/340 confirmed                 [View Log →]   │
└─────────────────────────────────────────────────────────────────┘
```

---

### Module 2: Solar Pulse (`/solar`)

**Purpose:** Comprehensive solar weather dashboard for understanding current and forecast conditions.

#### 2.1 Primary Metrics Panel

**Layout:** 4-column grid of primary indicators

| Metric                 | Source    | Update Frequency | Display                    |
| ---------------------- | --------- | ---------------- | -------------------------- |
| Solar Flux Index (SFI) | NOAA SWPC | Daily            | Large number + trend arrow |
| K-Index (Kp)           | NOAA SWPC | 1 minute         | Number + color bar         |
| Sunspot Number (SSN)   | NOAA SWPC | Daily            | Number                     |
| A-Index (Ap)           | NOAA SWPC | 3 hours          | Number                     |

**Visual Treatment:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ │ SOLAR FLUX   │ │ K-INDEX      │ │ SUNSPOTS     │ │ A-INDEX      │
│ │              │ │              │ │              │ │              │
│ │     145      │ │     2.3      │ │     98       │ │     10       │
│ │     sfu      │ │   ══════╸    │ │     SSN      │ │     Ap       │
│ │      ↗       │ │   Quiet      │ │              │ │   Quiet      │
│ │  +3 vs 7-day │ │              │ │              │ │              │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
│                                                                 │
│ Summary: Good HF conditions. Higher bands (15m-10m) favored.    │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2 HF Band Conditions Matrix

**Display:** Band-by-band predictions from user's QTH

```
┌─────────────────────────────────────────────────────────────────┐
│ 📡 HF BAND CONDITIONS                      from EM10 · Austin   │
│                                                                 │
│ Band    Freq       Day        Night      Best For              │
│ ─────────────────────────────────────────────────────────────── │
│ 160m    1.8 MHz    ⚫ Poor    🟡 Fair    Night DX, regional     │
│  80m    3.5 MHz    🟡 Fair    🟢 Good    Night DX, domestic     │
│  60m    5.3 MHz    🟡 Fair    🟢 Good    NVIS, regional         │
│  40m    7.0 MHz    🟢 Good    🟢 Exc     24hr workhorse         │
│  30m   10.1 MHz    🟢 Exc     🟢 Good    Digital, CW            │
│  20m   14.0 MHz    🟢 Exc     🟡 Fair    Daytime DX             │
│  17m   18.1 MHz    🟢 Good    ⚫ Poor    Daytime DX             │
│  15m   21.0 MHz    🟢 Exc     ⚫ Poor    High flux DX           │
│  12m   24.9 MHz    🟡 Fair    ⚫ Poor    Solar max DX           │
│  10m   28.0 MHz    🟡 Fair    ⚫ Poor    Solar max, local       │
│   6m   50.0 MHz    ⚫ Poor    ⚫ Poor    Sporadic E, tropo      │
│                                                                 │
│ Legend: 🟢 Excellent  🟡 Good  ⬤ Fair  ⚫ Poor                   │
└─────────────────────────────────────────────────────────────────┘
```

**Calculation Factors:**

- Current SFI and K-index
- Time of day at user's QTH
- Estimated MUF at user's location
- D-layer absorption levels

#### 2.3 K-Index History Chart

**Display:** 24-hour bar chart of Kp values

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 K-INDEX (Last 24 Hours)                                      │
│                                                                 │
│ 9│                                                              │
│ 8│                                                              │
│ 7│                                                              │
│ 6│                                                              │
│ 5│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Storm threshold ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│ 4│             ▇                                                │
│ 3│       ▇     ▇ ▇                                              │
│ 2│ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇ ▇          │
│ 1│                                                              │
│ 0└──────────────────────────────────────────────────────────────│
│   00  03  06  09  12  15  18  21  00  03  06  09  12  15 UTC    │
│                                                        NOW ▲    │
│                                                                 │
│ Current: 2.3 (Quiet)  •  3hr forecast: 2  •  24hr forecast: 3   │
└─────────────────────────────────────────────────────────────────┘
```

**Color Coding:**

- Green (0-2): Quiet
- Yellow (3-4): Unsettled
- Orange (5-6): Active storm
- Red (7-9): Severe storm

#### 2.4 Solar Flux Trend Chart

**Display:** 30-day trend with annotation of significant events

```
┌─────────────────────────────────────────────────────────────────┐
│ 📈 SOLAR FLUX INDEX (30-Day Trend)                              │
│                                                                 │
│ 200│                                                            │
│    │                                                            │
│ 175│                              ╭─╮                           │
│    │                         ╭───╯ ╰╮                          │
│ 150│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─╯─ ─ ─ ─╰─ ─ ─ ─ ─ ─ Today: 145 ─ │
│    │         ╭──────────╮                  ╰──╮                 │
│ 125│ ────────╯          ╰──────────────────────╰───             │
│    │                                                            │
│ 100│                                                            │
│    └────────────────────────────────────────────────────────────│
│     Jan 1        Jan 8       Jan 15      Jan 22      Jan 31    │
│                                                                 │
│ 30-day avg: 138 sfu  •  Trend: ↗ Rising  •  Peak: 172 (Jan 18) │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.5 Solar Flare Probability Panel

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚡ FLARE PROBABILITY (Next 24 Hours)                            │
│                                                                 │
│ C-Class  ███████████████████████████████░░░░░░░░░░  75%        │
│ M-Class  ███████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  35%        │
│ X-Class  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10%        │
│ Proton   ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   5%        │
│                                                                 │
│ ℹ️ An M-class flare could cause brief HF radio blackouts on     │
│    the sunlit side of Earth. X-class = significant disruption.  │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.6 Propagation Summary Panel

```
┌─────────────────────────────────────────────────────────────────┐
│ 🌐 PROPAGATION SUMMARY                                          │
│                                                                 │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ │
│ │ Geomag Field     │ │ HF Conditions    │ │ Signal Noise     │ │
│ │     QUIET        │ │     GOOD         │ │     S2-S3        │ │
│ │   Low activity   │ │   Bands open     │ │   Low noise      │ │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘ │
│                                                                 │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ │
│ │ MUF Estimate     │ │ D-Layer Absorp.  │ │ Aurora Activity  │ │
│ │    ~21 MHz       │ │     MINIMAL      │ │     NONE         │ │
│ │   F2 @ EM10      │ │   No blackouts   │ │   Kp too low     │ │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.7 Event Alerts (Conditional)

_Appears only when there's an active or imminent solar event_

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ SOLAR EVENT IN PROGRESS                                      │
│                                                                 │
│ M2.3 FLARE detected at 14:32 UTC                               │
│ Location: Active Region 3842 (N22W45)                          │
│                                                                 │
│ Expected impacts:                                               │
│ • HF radio degradation on sunlit side (now affected)           │
│ • Recovery expected within 30-60 minutes                       │
│ • Higher bands (15m+) most affected                            │
│                                                                 │
│ Your location (EM10): Currently in daylight - EXPECT IMPACT    │
│                                                                 │
│ [Dismiss] [Monitor GOES X-Ray →]                                │
└─────────────────────────────────────────────────────────────────┘
```

---

### Module 3: PropSphere (`/map`)

**Purpose:** Interactive global propagation visualization and path analysis.

#### 3.1 Map View Modes

##### 3.1.1 Globe View (Default)

**Features:**

- 3D WebGL Earth (Three.js with react-three-fiber)
- High-resolution Earth texture (8K with normal maps)
- Smooth day/night terminator with gradient
- Real-time sun/moon position
- Click-drag rotation, pinch/scroll zoom
- Auto-rotation option (0.1°/sec default)

**Technical Specs:**

- 60fps target on mid-range GPU
- LOD (Level of Detail) for zoom levels
- Coastline detail: 10km resolution
- Memory budget: 150MB textures

##### 3.1.2 Flat Map View

**Projections Available:**

- Equirectangular (default)
- Mercator
- Robinson
- Mollweide (equal-area)

**Features:**

- Pan and zoom
- Grid lines (15° intervals)
- Click to set target

##### 3.1.3 Azimuthal View

**Features:**

- Centered on user's QTH
- "Beam heading" perspective
- Distance rings at 5,000 km intervals
- Bearing labels (N/E/S/W and 10° increments)
- Great circle paths shown as straight lines

#### 3.2 Map Overlay Layers

| Layer                | Data Source         | Update    | Visualization       | Default |
| -------------------- | ------------------- | --------- | ------------------- | ------- |
| Day/Night Terminator | Calculated          | Real-time | Shadow gradient     | ON      |
| Greyline Zone        | Calculated          | Real-time | Golden band ±15°    | ON      |
| MUF Contours         | GIRO ionosondes     | 15 min    | Color-coded regions | OFF     |
| Aurora Oval          | NOAA OVATION        | 30 min    | Purple/green glow   | OFF     |
| D-Layer Absorption   | GOES X-ray          | 1 min     | Red danger zones    | OFF     |
| Sporadic E Clouds    | DX cluster analysis | 5 min     | Cyan patches        | OFF     |
| Real-Time Spots      | PSKReporter/RBN     | 1 min     | Animated arcs       | OFF     |

**Layer Control Panel:**

```
┌─────────────────────────────────┐
│ 🗂️ MAP LAYERS                   │
│                                 │
│ ☑️ Day/Night        ━━━━━◉ 80%  │
│ ☑️ Greyline         ━━━◉━ 60%  │
│ ☐ MUF Contours     ━━━━━● 100% │
│ ☐ Aurora Oval      ━━━━━● 100% │
│ ☐ D-Layer          ━━━━━● 100% │
│ ☐ Sporadic E       ━━━━━● 100% │
│ ☐ Live Spots       ━━━━━● 100% │
│                                 │
│ PRESETS:                        │
│ [DX Hunter] [Contest] [VHF]     │
└─────────────────────────────────┘
```

**Layer Presets:**

- **DX Hunter**: Terminator, Greyline, MUF, Live Spots
- **Contest**: Terminator, Live Spots (high density)
- **VHF**: Sporadic E, Aurora, Terminator
- **Emergency**: Terminator, D-Layer (absorption warnings)

#### 3.3 Home QTH Configuration

**Input Methods:**

1. Click on map
2. Enter Maidenhead grid square (auto-converts)
3. Enter lat/lon coordinates
4. Browser geolocation (GPS)
5. Address search (geocoding via Nominatim)
6. Callsign lookup (QRZ/HamQTH API)

**Stored Data:**

```typescript
interface StationProfile {
  id: string;
  name: string; // "Home", "Portable", "Club"
  callsign: string; // "N5XXX"
  grid: string; // "EM10fp"
  lat: number; // 30.5
  lon: number; // -97.8
  timezone: string; // "America/Chicago"
  antennas?: Antenna[]; // Optional antenna definitions
}
```

**UI Panel:**

```
┌─────────────────────────────────┐
│ 📍 YOUR STATION                 │
│                                 │
│ N5XXX        EM10fp             │
│ 30.50°N, 97.80°W                │
│ Austin, Texas                   │
│                                 │
│ 🌅 Sunrise: 07:23 L / 13:23 UTC │
│ 🌇 Sunset:  18:07 L / 00:07 UTC │
│ 🌓 Greyline: in 4h 23m          │
│                                 │
│ [Edit] [Add Profile +]          │
└─────────────────────────────────┘
```

#### 3.4 Path Analysis Tool

**Trigger:** Click on map or select from target list

**Path Analysis Panel:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 📡 PATH ANALYSIS                                        [Close] │
│                                                                 │
│ N5XXX (EM10) ────────────────────────────────→ Tokyo, Japan    │
│              Austin, TX                         JA1, PM95       │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ DISTANCE        BEARING          LONG PATH      HOPS        │ │
│ │                                                             │ │
│ │  10,847 km      315° (NW)        135° (SE)      4F          │ │
│ │  6,740 mi                                       ~3,000km/hop │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ DIFFICULTY: ★★★☆☆ (Moderate)                                   │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ BEST BAND RIGHT NOW                                         │ │
│ │                                                             │ │
│ │     20m         (14.074 MHz FT8)                           │ │
│ │                                                             │ │
│ │ Path illumination: 65% daylight                            │ │
│ │ MUF at midpoint: ~18 MHz                                   │ │
│ │ Expected SNR: -12 dB (workable with FT8)                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ BAND CONDITIONS FOR THIS PATH                                   │
│                                                                 │
│ Band    Status     SNR Est    Notes                            │
│ ──────────────────────────────────────────────────────────────  │
│ 160m    ⚫ Poor    < -25dB    Path too long, daylight          │
│  80m    ⚫ Poor    < -20dB    D-layer absorption               │
│  40m    🟡 Fair    -15 dB     Marginal, try at night          │
│  30m    🟢 Good    -10 dB     Digital modes OK                 │
│  20m    🟢 Exc     -8 dB      ★ Best choice now                │
│  17m    🟢 Good    -10 dB     Open, less activity              │
│  15m    🟡 Fair    -14 dB     Closing soon                     │
│  12m    ⚫ Poor    -20 dB     MUF too low                      │
│  10m    ⚫ Poor    -25 dB     Not open                         │
│                                                                 │
│ [View 24-Hour Forecast →]                                       │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.5 24-Hour Propagation Forecast

**Display:** Hourly band openings for selected path

```
┌─────────────────────────────────────────────────────────────────┐
│ 📅 24-HOUR FORECAST: N5XXX → Japan                              │
│                                                                 │
│        00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 ...  │
│ 160m   ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·      │
│  80m   ·  ·  ·  ·  ░  ▒  ▓  ▓  ▒  ░  ·  ·  ·  ·  ·  ·  ·      │
│  40m   ·  ░  ▒  ▓  ▓  ██ ██ ██ ▓  ▒  ░  ·  ·  ·  ░  ▒  ▓      │
│  30m   ░  ▒  ▓  ██ ██ ██ ██ ██ ██ ▓  ▒  ░  ░  ▒  ▓  ██ ██     │
│  20m   ▓  ██ ██ ██ ██ ▓  ▒  ░  ·  ·  ·  ·  ▒  ▓  ██ ██ ██ ←NOW│
│  17m   ▓  ██ ██ ▓  ▒  ░  ·  ·  ·  ·  ·  ·  ░  ▒  ▓  ██ ▓      │
│  15m   ▒  ▓  ▓  ▒  ░  ·  ·  ·  ·  ·  ·  ·  ·  ░  ▒  ▓  ▒      │
│                                                                 │
│ Legend: ██ Excellent  ▓ Good  ▒ Fair  ░ Poor  · Closed         │
│                                                                 │
│ Best windows:                                                   │
│ • 20m: 13:00-18:00 UTC (short path)                            │
│ • 40m: 04:00-08:00 UTC (greyline enhanced)                     │
│ • 30m: 02:00-10:00 UTC, 14:00-18:00 UTC                        │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.6 Time Controls

**Features:**

- Real-time mode (default, live updates)
- Time scrubber: ±24 hours from now
- Jump to specific date/time
- Animation mode with playback speeds (1x, 2x, 5x, 10x, 60x)
- Preset times (sunrise, sunset, greyline at QTH)

**UI:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ⏱️ TIME CONTROL                                                 │
│                                                                 │
│ ◀◀  ◀  ║  ▶  ▶▶      1x ▼                                      │
│                                                                 │
│ ─────────────────────────●─────────────────────────             │
│ -24h              NOW (+2h)                     +24h            │
│                                                                 │
│ Displaying: 16:32 UTC · Sat Jan 31, 2026                       │
│                                                                 │
│ [LIVE] [My Sunrise] [My Sunset] [Greyline]                     │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.7 Quick Targets Panel

**Preset Targets:**

```
┌─────────────────────────────────┐
│ 🎯 QUICK TARGETS                │
│                                 │
│ REGIONS                         │
│ [Europe] [Japan] [Oceania]      │
│ [S. America] [Africa] [Russia]  │
│                                 │
│ SAVED TARGETS                   │
│ • ZL2ABC (New Zealand) ⭐       │
│ • 3B8XYZ (Mauritius)            │
│ • VK9XX (Christmas Is.)         │
│                                 │
│ RECENT                          │
│ • Tokyo, Japan (clicked)        │
│ • London, UK                    │
│                                 │
│ [+ Add Custom Target]           │
└─────────────────────────────────┘
```

---

### Module 4: LogBook (`/log`)

**Purpose:** Contact logging with DXCC/award tracking and QSL management.

#### 4.1 Quick Log Entry

**Optimized for speed:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ➕ LOG NEW CONTACT                                              │
│                                                                 │
│ Callsign: [JA1XYZ______]  ← Auto-lookup on blur                │
│                                                                 │
│ 📍 Yamamoto Taro · Tokyo, Japan · PM95vq                       │
│    🏆 ATNO! (All-Time New One for Japan)                       │
│                                                                 │
│ Band:  [20m ▼]  Mode: [FT8 ▼]  RST Sent: [599]  Rcvd: [599]   │
│                                                                 │
│ Date/Time: [2026-01-31] [14:32] UTC  (auto-filled)             │
│                                                                 │
│ Notes: [______________________________________________]         │
│                                                                 │
│ [Save & New]  [Save & Close]                   [Cancel]         │
└─────────────────────────────────────────────────────────────────┘
```

**Auto-fill Features:**

- Current UTC date/time
- Last-used band/mode
- Callsign lookup (name, QTH, grid from QRZ/HamQTH)
- ATNO/new multiplier alerts

#### 4.2 Log View (Table)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 CONTACT LOG                    [+ New] [Import] [Export]     │
│                                                                 │
│ Filter: [All Bands ▼] [All Modes ▼] [Date Range ▼] [Search___] │
│                                                                 │
│ Date       Time   Call     Band  Mode  RST S/R  Entity    QSL   │
│ ─────────────────────────────────────────────────────────────── │
│ 2026-01-31 14:32  JA1XYZ   20m   FT8   -12/-10  Japan    ✓LoTW │
│ 2026-01-31 12:45  G4ABC    40m   SSB   59/59    England  ⏳Pend │
│ 2026-01-31 10:30  VE3DEF   17m   CW    599/599  Canada   ✓LoTW │
│ 2026-01-30 22:15  LU5XYZ   15m   FT8   -08/-06  Argentina ✓eQSL│
│ 2026-01-30 18:00  DL8ABC   20m   SSB   57/55    Germany  ✓LoTW │
│ ...                                                             │
│                                                                 │
│ Showing 1-25 of 1,847 contacts                    [< 1 2 3 4 >] │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.3 Award Tracking Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ 🏆 AWARD PROGRESS                                               │
│                                                                 │
│ DXCC                                                            │
│ ████████████████████████████████████░░░░░░░░░  247/340 (73%)   │
│ Confirmed via: LoTW 234 | eQSL 198 | Card 156                  │
│ Needed for Honor Roll: 93 more                                  │
│                                                                 │
│ [Mixed ▼]  Challenge: 1,247 band-slots                         │
│                                                                 │
│ ──────────────────────────────────────────────────────────────  │
│                                                                 │
│ WAS (Worked All States)                                         │
│ ████████████████████████████████████████████░░  48/50 (96%)    │
│ Missing: AK, HI                                                 │
│                                                                 │
│ ──────────────────────────────────────────────────────────────  │
│                                                                 │
│ WAZ (Worked All Zones)                                          │
│ ██████████████████████████████████████░░░░░░░░  34/40 (85%)    │
│ Missing: 1, 2, 18, 23, 31, 39                                  │
│                                                                 │
│ [View Detailed Breakdown →]                                     │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.4 DXCC Entity Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│ 🌍 DXCC ENTITY STATUS                       [By Band] [By Mode] │
│                                                                 │
│ Filter: [Show All ▼]  Sort: [Entity Name ▼]                    │
│                                                                 │
│ Entity          160 80  60  40  30  20  17  15  12  10   Status │
│ ─────────────────────────────────────────────────────────────── │
│ 1A - SMOM        ·   ·   ·   ·   ·   ·   ·   ·   ·   ·   Needed│
│ 3A - Monaco      ·   ·   ·   ✓   ·   ✓   ·   ✓   ·   ·   Conf  │
│ 3B8 - Mauritius  ·   ·   ·   ·   ·   ✓   ·   ·   ·   ·   Conf  │
│ 3DA - Eswatini   ·   ·   ·   ·   ·   ·   ·   ·   ·   ·   Needed│
│ ...                                                             │
│                                                                 │
│ ✓ = Confirmed   ○ = Worked   · = Needed                        │
│                                                                 │
│ Stats: 247 confirmed | 38 worked-not-confirmed | 55 needed     │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.5 QSL Management

```
┌─────────────────────────────────────────────────────────────────┐
│ 📮 QSL STATUS                                                   │
│                                                                 │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐          │
│ │ LoTW          │ │ eQSL          │ │ QSL Cards     │          │
│ │    1,523      │ │    1,102      │ │      387      │          │
│ │   confirmed   │ │   confirmed   │ │   confirmed   │          │
│ │               │ │               │ │               │          │
│ │ 48 pending    │ │ 156 pending   │ │ 89 awaiting   │          │
│ └───────────────┘ └───────────────┘ └───────────────┘          │
│                                                                 │
│ ACTIONS                                                         │
│ [Sync LoTW] [Sync eQSL] [Generate QSL Labels] [Print Cards]    │
│                                                                 │
│ RECENT CONFIRMATIONS                                            │
│ • JA1XYZ - LoTW confirmed 2 hours ago                          │
│ • VK2ABC - eQSL confirmed yesterday                            │
│ • DL8XYZ - LoTW confirmed 3 days ago                           │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.6 Import/Export

**Supported Formats:**

- ADIF 3.1 (import/export)
- Cabrillo 3.0 (export for contests)
- CSV (export)

**Import UI:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 📥 IMPORT CONTACTS                                              │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │     Drag & drop your ADIF file here                        │ │
│ │                                                             │ │
│ │              or click to browse                            │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Supported: .adi, .adif                                          │
│                                                                 │
│ Options:                                                        │
│ ☑️ Skip duplicates                                              │
│ ☑️ Auto-merge with existing entries                             │
│ ☐ Overwrite existing entries                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

### Module 5: Live Spots (`/spots`)

**Purpose:** Real-time DX spot aggregation with intelligent filtering.

#### 5.1 Spot Feed

```
┌─────────────────────────────────────────────────────────────────┐
│ 📻 LIVE DX SPOTS                            Last update: 2s ago │
│                                                                 │
│ FILTERS                                                         │
│ Bands: [All ▼]  Modes: [All ▼]  Source: [All ▼]  [Needed Only] │
│                                                                 │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ 🔔 P29VCX     18.100  CW    14:32  Papua New Guinea   ATNO!    │
│     Spotted by W6XXX · 12,500 km from you · 315°               │
│     [Open in Map] [Log Contact]                                 │
│                                                                 │
│    JA1ABC     14.074  FT8   14:31  Japan                       │
│     PSKReporter · 10,800 km · 315° · SNR: -8 dB                │
│                                                                 │
│ 🏆 5T5PA      21.295  SSB   14:30  Mauritania      New mult    │
│     Spotted by ON4XXX · 6,200 km · 45°                         │
│     [Open in Map] [Log Contact]                                 │
│                                                                 │
│    VK2DEF     14.074  FT8   14:29  Australia                   │
│     PSKReporter · 16,000 km · 225° · SNR: -12 dB               │
│                                                                 │
│ ...                                                             │
│                                                                 │
│ Sources: PSKReporter (1,234) · RBN (456) · DX Cluster (234)    │
└─────────────────────────────────────────────────────────────────┘
```

#### 5.2 Spot Filtering Options

**Basic Filters:**

- Band selection (multi-select)
- Mode selection (CW, SSB, FT8, etc.)
- Source selection (PSKReporter, RBN, DX Cluster)

**Smart Filters:**

- **Needed Only** — Only show ATNO entities
- **New Band** — Entities worked but not on this band
- **New Mode** — Entities worked but not on this mode
- **IOTA Needed** — Missing IOTA references
- **CQ Zone Needed** — Missing CQ zones

**Alert Configuration:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔔 SPOT ALERTS                                                  │
│                                                                 │
│ Alert me when spotted:                                          │
│ ☑️ All-Time New One (ATNO) for DXCC                             │
│ ☑️ New band slot for confirmed entity                           │
│ ☐ New mode slot for confirmed entity                           │
│ ☐ Specific entities: [Add...]                                  │
│ ☐ Specific callsigns: [Add...]                                 │
│                                                                 │
│ Delivery:                                                       │
│ ☑️ In-app notification                                          │
│ ☑️ Browser push notification                                    │
│ ☐ Email (max 10/day)                                           │
│                                                                 │
│ Sound: [Chime ▼] [Test]                                        │
└─────────────────────────────────────────────────────────────────┘
```

#### 5.3 Band Activity Map

**Visual:** Real-time spot density on map

```
┌─────────────────────────────────────────────────────────────────┐
│ 🗺️ ACTIVITY MAP                              Band: [20m ▼]      │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                    [World map with heat overlay]            │ │
│ │                                                             │ │
│ │    Europe: 🔥🔥🔥     Japan: 🔥🔥                          │ │
│ │    N. America: 🔥🔥   S. America: 🔥                        │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Activity levels: 🔥🔥🔥 High  🔥🔥 Medium  🔥 Low               │
└─────────────────────────────────────────────────────────────────┘
```

---

### Module 6: Educational Content (`/learn`)

**Purpose:** Help beginners understand propagation concepts.

#### 6.1 Interactive Glossary

```
┌─────────────────────────────────────────────────────────────────┐
│ 📚 GLOSSARY                                    Search: [____]   │
│                                                                 │
│ A  B  C  D  E  F  G  H  I  J  K  L  M  N  O  P  Q  R  S  T ...  │
│                                                                 │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ K-INDEX (Kp)                                                    │
│                                                                 │
│ A measure of geomagnetic disturbance, ranging from 0 to 9.      │
│                                                                 │
│ What it means for you:                                          │
│ • 0-2: Quiet — Best HF conditions, all bands may be open       │
│ • 3-4: Unsettled — Minor degradation, high bands still good    │
│ • 5+: Storm — HF significantly affected, aurora on VHF         │
│                                                                 │
│ Quick tip: Lower K = Better HF (usually)                       │
│                                                                 │
│ Related: A-Index, Geomagnetic Storm, Aurora                    │
│ See it: [View Current K-Index →]                               │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2 Propagation Guides

**Topics:**

1. **Understanding the Ionosphere** — Layers, how they work, why they matter
2. **Solar Weather 101** — SFI, K-index, flares, CMEs explained simply
3. **Grey Line Magic** — What it is, when it happens, how to use it
4. **Band Selection Guide** — Which band for which situation
5. **Reading Propagation Charts** — How to interpret VOACAP output
6. **Sporadic E Hunting** — When and where to find it
7. **DX for Beginners** — Getting started with long-distance contacts

---

## Data Sources & APIs

### Primary Data Sources

| Source                     | Data                                        | Endpoint                     | Rate Limit    | Fallback       |
| -------------------------- | ------------------------------------------- | ---------------------------- | ------------- | -------------- |
| **NOAA SWPC**              | Solar indices, K-index, flare probabilities | services.swpc.noaa.gov/json/ | None (public) | Cache 15m      |
| **GIRO/LGDC**              | Ionosonde data, MUF, foF2                   | giro.uml.edu                 | 100/hr        | NOAA estimates |
| **PSKReporter**            | Digital mode spots                          | pskreporter.info/api         | 1/min         | RBN only       |
| **Reverse Beacon Network** | CW/RTTY spots                               | reversebeacon.net/api        | None          | DX Cluster     |
| **DX Cluster**             | SSB/CW spots                                | Various nodes via WebSocket  | Varies        | Cache          |
| **QRZ.com**                | Callsign lookup                             | xmldata.qrz.com              | 50/hr (paid)  | HamQTH         |
| **HamQTH**                 | Callsign lookup                             | hamqth.com/xml.php           | 100/hr (free) | Primary        |
| **LoTW**                   | QSL verification                            | lotw.arrl.org                | Manual sync   | None           |
| **eQSL**                   | QSL verification                            | eqsl.cc                      | Manual sync   | None           |

### NOAA SWPC API Endpoints

```javascript
const NOAA_BASE = "https://services.swpc.noaa.gov/json";

const endpoints = {
  kIndex: `${NOAA_BASE}/planetary_k_index_1m.json`, // 1-min updates
  solarFlux: `${NOAA_BASE}/f107_cm_flux.json`, // Daily
  flareProbability: `${NOAA_BASE}/solar_probabilities.json`, // Daily
  auroraForecast: `${NOAA_BASE}/ovation_aurora_latest.json`, // 30-min
  xrayFlux: `${NOAA_BASE}/goes/primary/xrays-6-hour.json`, // 1-min
  sunspots: `${NOAA_BASE}/solar-cycle/sunspots.json`, // Daily
  geomagForecast: `${NOAA_BASE}/geospace/geomag_dst_3_day_forecast.json`,
};
```

### Calculated Data

| Metric          | Algorithm                     | Inputs                       |
| --------------- | ----------------------------- | ---------------------------- |
| Sun position    | NOAA solar position algorithm | UTC time                     |
| Moon position   | Simplified lunar ephemeris    | UTC time                     |
| Terminator      | 90° from subsolar point       | Sun position                 |
| Greyline        | Terminator ±10-15°            | Terminator position          |
| MUF estimate    | f₀F₂ × 3.6 × cos(zenith)^0.5  | SFI, time, location          |
| Band conditions | Multi-factor scoring          | SFI, Kp, MUF, time, distance |
| Path loss       | Free space + absorption       | Distance, frequency, D-layer |
| Hop count       | distance / 3000km             | Great circle distance        |

### Data Refresh Strategy

| Data Type         | Refresh Interval | Caching Strategy                   |
| ----------------- | ---------------- | ---------------------------------- |
| K-index           | 1 minute         | Memory, 5-min stale                |
| Solar flux        | 4 hours          | Memory + localStorage, 1-day stale |
| Flare probability | 6 hours          | Memory + localStorage, 1-day stale |
| Aurora forecast   | 30 minutes       | Memory, 1-hr stale                 |
| Live spots        | 5 seconds        | Memory ring buffer (last 1000)     |
| Callsign lookups  | On demand        | IndexedDB, 30-day expiry           |
| User log          | Real-time        | IndexedDB + optional cloud sync    |

---

## Technical Architecture

### Frontend Stack

```
React 18 + TypeScript
├── Vite (build tool)
├── Three.js + @react-three/fiber (3D globe)
├── D3.js (charts and visualizations)
├── Zustand (state management)
├── TanStack Query (data fetching)
├── Tailwind CSS (styling)
├── Framer Motion (animations)
├── Leaflet (2D maps)
├── date-fns (date handling)
├── zod (validation)
└── Dexie (IndexedDB wrapper)
```

### Backend Stack (Railway)

```
Node.js + Express/Hono
├── PostgreSQL (user data, logs)
├── Redis (caching, rate limiting)
├── Bull (job queue for data aggregation)
├── WebSocket (real-time spots)
└── Prisma (ORM)
```

### API Proxy Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│   Browser   │────▶│   Vercel    │────▶│  External APIs      │
│  (Client)   │     │   Edge      │     │  (NOAA, PSK, etc.)  │
└─────────────┘     │  Functions  │     └─────────────────────┘
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Railway   │
                    │  (Backend)  │
                    │  - User DB  │
                    │  - Logging  │
                    │  - Spots WS │
                    └─────────────┘
```

**Why Edge Functions:**

- Bypass CORS for NOAA/GIRO
- Cache at edge for performance
- Rate limit protection

### Database Schema (Simplified)

```sql
-- Users (optional accounts)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  callsign VARCHAR(20) UNIQUE,
  email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Station profiles
CREATE TABLE stations (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR(100),
  callsign VARCHAR(20),
  grid VARCHAR(8),
  lat DECIMAL(10, 7),
  lon DECIMAL(10, 7),
  is_primary BOOLEAN DEFAULT false
);

-- Contact log
CREATE TABLE qsos (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  call VARCHAR(20) NOT NULL,
  qso_date DATE NOT NULL,
  time_on TIME NOT NULL,
  band VARCHAR(10),
  mode VARCHAR(20),
  freq DECIMAL(10, 4),
  rst_sent VARCHAR(10),
  rst_rcvd VARCHAR(10),
  grid VARCHAR(8),
  dxcc_entity INT,
  lotw_sent BOOLEAN DEFAULT false,
  lotw_rcvd BOOLEAN DEFAULT false,
  eqsl_sent BOOLEAN DEFAULT false,
  eqsl_rcvd BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_qsos_user_date ON qsos(user_id, qso_date);
CREATE INDEX idx_qsos_call ON qsos(call);
CREATE INDEX idx_qsos_dxcc ON qsos(dxcc_entity);
```

### Performance Requirements

| Metric                   | Target          |
| ------------------------ | --------------- |
| First Contentful Paint   | < 1.5s          |
| Time to Interactive      | < 3s            |
| Largest Contentful Paint | < 2.5s          |
| Globe frame rate         | 60fps stable    |
| API response time        | < 200ms (p95)   |
| Memory usage             | < 200MB         |
| Bundle size              | < 500KB gzipped |

### Browser Support

| Browser        | Minimum Version | WebGL Required |
| -------------- | --------------- | -------------- |
| Chrome         | 100+            | Yes            |
| Firefox        | 100+            | Yes            |
| Safari         | 15+             | Yes            |
| Edge           | 100+            | Yes            |
| iOS Safari     | 15+             | Yes            |
| Chrome Android | 100+            | Yes            |

---

## Progressive Disclosure Strategy

### Information Hierarchy by User Level

#### Beginner Mode (Default)

**Visible:**

- Overall condition rating (1-5 scale with colors)
- Plain-language summaries ("Good conditions for HF")
- Recommended bands (just names, not frequencies)
- Simple path analysis (just distance and best band)
- Contextual help everywhere

**Hidden (in expandable sections):**

- Raw numerical data (SFI, Kp, etc.)
- Detailed band matrix
- MUF contours
- 24-hour forecasts
- Advanced path metrics

**Example:**

```
HF Conditions: GOOD 🟢

The ionosphere is healthy today. Try 20m or 17m for
long-distance contacts. Best time: next 4 hours.

[Show me the details ▼]
```

#### Intermediate Mode

**Visible (in addition to beginner):**

- Numerical indices with explanations
- Band matrix with day/night
- Basic charts (K-index, SFI trend)
- Path analysis with bearings and hops
- Spot filtering

**Hidden:**

- MUF contour overlays
- D-layer absorption visualization
- Advanced time simulation
- Full VOACAP integration

#### Expert Mode

**Visible (everything):**

- All raw data
- All visualization layers
- Full VOACAP-style predictions
- Antenna take-off angle considerations
- Advanced filtering and alerting

### Contextual Help System

Every technical term has three levels of explanation:

1. **Hover tooltip** — 1-sentence definition
2. **Info icon click** — Paragraph explanation with "what this means for you"
3. **Learn more link** — Full educational article

```typescript
interface HelpContent {
  term: string;
  tooltip: string; // < 15 words
  explanation: string; // 2-3 paragraphs
  learnMorePath: string; // /learn/glossary#term
  relatedTerms: string[];
  showInContext: boolean; // Whether to show in beginner mode
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Goal:** Core infrastructure and Solar Pulse dashboard

**Deliverables:**

- [ ] Project setup (Vite, TypeScript, Tailwind)
- [ ] Design system and component library
- [ ] NOAA API integration and caching
- [ ] Solar Pulse dashboard (all sections)
- [ ] User preferences (localStorage)
- [ ] Mobile-responsive layout
- [ ] Vercel deployment

**Success Criteria:**

- Solar data displays correctly with 5-minute updates
- Band conditions calculated from SFI/Kp
- Responsive on mobile and desktop
- Lighthouse score > 90

### Phase 2: PropSphere Core (Weeks 5-8)

**Goal:** Interactive map with basic path analysis

**Deliverables:**

- [ ] 3D globe view (Three.js)
- [ ] Flat map view (Leaflet)
- [ ] Day/night terminator layer
- [ ] Greyline visualization
- [ ] Home QTH configuration
- [ ] Click-to-target path analysis
- [ ] Basic path metrics (distance, bearing, hops)
- [ ] Time slider (±24 hours)

**Success Criteria:**

- Globe renders at 60fps on mid-range device
- Path analysis matches VOACAP within 10%
- Time scrubbing works smoothly

### Phase 3: PropSphere Advanced (Weeks 9-12)

**Goal:** Full propagation visualization

**Deliverables:**

- [ ] MUF overlay layer (GIRO integration)
- [ ] Aurora oval visualization
- [ ] Azimuthal projection view
- [ ] 24-hour propagation forecast chart
- [ ] Band-by-band path conditions
- [ ] Saved targets
- [ ] Layer presets

**Success Criteria:**

- MUF data updates every 15 minutes
- Aurora matches NOAA OVATION
- Users can plan future operating times

### Phase 4: Live Spots (Weeks 13-16)

**Goal:** Real-time spot aggregation

**Deliverables:**

- [ ] PSKReporter integration
- [ ] RBN integration
- [ ] DX Cluster integration (selected nodes)
- [ ] Spot filtering (band, mode, needed)
- [ ] Spot visualization on map
- [ ] Basic alert system (in-app only)

**Success Criteria:**

- Spots update within 5 seconds
- Filtering responds instantly
- No more than 100ms render time for spot list

### Phase 5: LogBook (Weeks 17-20)

**Goal:** Contact logging with award tracking

**Deliverables:**

- [ ] Quick log entry form
- [ ] Contact list view with filtering
- [ ] ADIF import/export
- [ ] DXCC tracking (340 entities)
- [ ] WAS tracking
- [ ] WAZ tracking
- [ ] Callsign auto-lookup (HamQTH)
- [ ] IndexedDB local storage

**Success Criteria:**

- Import 10,000 QSOs in < 5 seconds
- Award calculations match ARRL
- Works fully offline

### Phase 6: Account System & Cloud Sync (Weeks 21-24)

**Goal:** Optional accounts with sync

**Deliverables:**

- [ ] Railway backend deployment
- [ ] User authentication (email/callsign)
- [ ] Cloud log sync
- [ ] LoTW integration (manual upload/download)
- [ ] eQSL integration
- [ ] Browser push notifications
- [ ] Multi-device sync

**Success Criteria:**

- Login/register in < 3 steps
- Sync conflict resolution works
- Notifications delivered within 10 seconds

### Phase 7: Polish & Launch (Weeks 25-28)

**Goal:** Production readiness

**Deliverables:**

- [ ] Educational content (/learn)
- [ ] Interactive glossary
- [ ] Onboarding flow for new users
- [ ] Performance optimization
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Error tracking (Sentry)
- [ ] Analytics (privacy-respecting)
- [ ] Documentation and help system

**Success Criteria:**

- All Lighthouse scores > 90
- Zero critical accessibility issues
- < 0.1% error rate

---

## Appendices

### Appendix A: DXCC Entity List

The complete list of 340 current DXCC entities will be maintained in a JSON file, including:

- Entity prefix(es)
- Entity name
- Continent
- CQ Zone
- ITU Zone
- Deleted status
- IOTA reference (if applicable)

### Appendix B: Band Frequency Allocations

```typescript
const bands = {
  "160m": { start: 1.8, end: 2.0, name: "160 meters", type: "hf" },
  "80m": { start: 3.5, end: 4.0, name: "80 meters", type: "hf" },
  "60m": { start: 5.3305, end: 5.4035, name: "60 meters", type: "hf" },
  "40m": { start: 7.0, end: 7.3, name: "40 meters", type: "hf" },
  "30m": { start: 10.1, end: 10.15, name: "30 meters", type: "hf" },
  "20m": { start: 14.0, end: 14.35, name: "20 meters", type: "hf" },
  "17m": { start: 18.068, end: 18.168, name: "17 meters", type: "hf" },
  "15m": { start: 21.0, end: 21.45, name: "15 meters", type: "hf" },
  "12m": { start: 24.89, end: 24.99, name: "12 meters", type: "hf" },
  "10m": { start: 28.0, end: 29.7, name: "10 meters", type: "hf" },
  "6m": { start: 50.0, end: 54.0, name: "6 meters", type: "vhf" },
  "2m": { start: 144.0, end: 148.0, name: "2 meters", type: "vhf" },
  "70cm": { start: 420.0, end: 450.0, name: "70 centimeters", type: "uhf" },
};
```

### Appendix C: Maidenhead Grid Square Conversion

```typescript
function gridToLatLon(grid: string): { lat: number; lon: number } {
  grid = grid.toUpperCase();
  let lon = (grid.charCodeAt(0) - 65) * 20 - 180;
  let lat = (grid.charCodeAt(1) - 65) * 10 - 90;
  lon += parseInt(grid[2]) * 2;
  lat += parseInt(grid[3]);
  if (grid.length >= 6) {
    lon += ((grid.charCodeAt(4) - 65) * 5) / 60;
    lat += ((grid.charCodeAt(5) - 65) * 2.5) / 60;
  }
  // Return center of grid square
  lon += grid.length >= 6 ? 2.5 / 60 : 1;
  lat += grid.length >= 6 ? 1.25 / 60 : 0.5;
  return { lat, lon };
}

function latLonToGrid(lat: number, lon: number, precision: number = 6): string {
  lon += 180;
  lat += 90;
  let grid = "";
  grid += String.fromCharCode(65 + Math.floor(lon / 20));
  grid += String.fromCharCode(65 + Math.floor(lat / 10));
  lon %= 20;
  lat %= 10;
  grid += Math.floor(lon / 2).toString();
  grid += Math.floor(lat).toString();
  if (precision >= 6) {
    lon %= 2;
    lat %= 1;
    grid += String.fromCharCode(97 + Math.floor(lon * 12));
    grid += String.fromCharCode(97 + Math.floor(lat * 24));
  }
  return grid;
}
```

### Appendix D: Glossary of Terms

| Term           | Definition                                                 |
| -------------- | ---------------------------------------------------------- |
| **A-Index**    | 24-hour average of geomagnetic activity (0-400)            |
| **ADIF**       | Amateur Data Interchange Format - standard log file format |
| **ATNO**       | All-Time New One - a DXCC entity never worked before       |
| **Aurora**     | Polar light phenomenon that can enhance VHF propagation    |
| **D-Layer**    | Lowest ionospheric layer; absorbs HF during daylight       |
| **DXCC**       | DX Century Club - award for contacting 100+ countries      |
| **E-Layer**    | Middle ionospheric layer; supports Sporadic E              |
| **F-Layer**    | Upper ionospheric layer; primary HF propagation layer      |
| **FT8**        | Digital mode optimized for weak signal communication       |
| **Greyline**   | Terminator region with enhanced propagation                |
| **K-Index**    | 3-hour geomagnetic activity measure (0-9)                  |
| **LoTW**       | Logbook of The World - ARRL QSL verification system        |
| **MUF**        | Maximum Usable Frequency - highest freq that will reflect  |
| **QSL**        | Confirmation of a contact                                  |
| **QTH**        | Station location                                           |
| **SFI**        | Solar Flux Index - 10.7cm radio emissions (70-300)         |
| **Skip**       | Radio wave bouncing off ionosphere                         |
| **Sporadic E** | Unpredictable E-layer ionization enabling VHF DX           |
| **SSN**        | Sunspot Number - count of visible sunspots                 |
| **Terminator** | Line between day and night on Earth                        |
| **VOACAP**     | Voice of America Coverage Analysis Program                 |
| **WAS**        | Worked All States - award for all 50 US states             |
| **WAZ**        | Worked All Zones - award for all 40 CQ zones               |

---

## References & Sources

### Research Sources Used

1. [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/)
2. [VOACAP Online](https://www.voacap.com/hf/)
3. [PSKReporter](https://pskreporter.info/)
4. [Reverse Beacon Network](https://www.reversebeacon.net/)
5. [DXLook Real-Time HF Propagation](https://dxlook.com/)
6. [HamQSL Solar Data](https://www.hamqsl.com/solar.html)
7. [DXMaps VHF Propagation](https://www.dxmaps.com/)
8. [N1MM Logger+](https://n1mmwp.hamdocs.com/)
9. [Ham Radio Deluxe](https://www.hamradiodeluxe.com/)
10. [ARRL DXCC Program](https://www.arrl.org/dxcc)
11. [Logbook of The World](https://lotw.arrl.org/)
12. [GIRO Ionospheric Data](https://giro.uml.edu/)

### Technical References

1. [ITU-R P.533 - HF Propagation Prediction](https://www.itu.int/rec/R-REC-P.533/)
2. [NOAA Solar Position Algorithm](https://www.esrl.noaa.gov/gmd/grad/solcalc/)
3. [Three.js Documentation](https://threejs.org/docs/)
4. [ADIF Specification](https://adif.org/)

---

_"Make the invisible visible — help every operator understand the ionosphere."_

**Document Version:** 2.0
**Last Updated:** January 31, 2026
