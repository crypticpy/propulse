# Propulse UI Review - February 2026

## Executive Summary

Propulse is a modern ham radio operator toolset that successfully combines real-time solar weather monitoring, global propagation visualization, and contact logging into a cohesive platform. The application demonstrates strong adherence to its "progressive disclosure" design philosophy, offering clean visual hierarchy and thoughtful information density.

**Overall Assessment: Strong foundation with room for beginner accessibility improvements**

### Key Strengths

- Excellent visual design with consistent space/cosmic theme
- Well-implemented progressive disclosure through expandable modals
- Comprehensive data integration from multiple authoritative sources (NOAA SWPC)
- Responsive design that adapts well to different screen sizes
- Clear color coding system (green=good, amber=fair, red=poor)

### Primary Concerns

- Steep learning curve for beginners despite PRD goals
- Technical terminology pervasive without sufficient inline explanations
- Critical "first-run" experience lacks guided onboarding
- Home page is essentially a landing page, not a dashboard
- Help system exists but requires proactive discovery
- **Mobile experience needs dedicated design** (not just responsive hiding)

---

## Persona Analysis

### 1. "New Nick" - The Beginner

**Profile**: Recently licensed (Tech or General), curious about HF but intimidated, limited knowledge of propagation physics.

#### What Works Well

1. **Propagation Index Gauge (Solar Pulse)**
   - The 0-100 score with color-coded gauge provides an at-a-glance "should I turn on my radio?" answer
   - Score breakdown showing SFI, Kp, and Bz contributions helps users understand what factors matter
   - Category labels ("Excellent", "Good", "Fair", "Poor") are plain-language

2. **Solar Summary Component**
   - Plain-language descriptions: "The sun is very active today with excellent HF propagation expected"
   - "Best bands now" section with highlighted band names provides actionable guidance
   - Geomagnetic warnings are contextualized

3. **Band Conditions Legend**
   - Clear color-coded circles (green/amber/red)
   - "Best For" column provides use-case guidance ("24hr workhorse", "Daytime DX")
   - Night-only indicator helps avoid confusion about 160m

4. **Help Modal System**
   - Comprehensive help content covering major concepts
   - HelpButton components available on key panels

#### Friction Points

1. **Home Page is Not a Dashboard**
   - **Issue**: Home (`/`) shows only a logo, tagline, and "Enter Solar Dashboard" button
   - **Impact**: Beginners expecting a "what should I know right now?" summary must navigate elsewhere
   - **Expected**: The PRD specifies a "Unified Dashboard" with Bands At-a-Glance, Solar Summary, Active Spots Feed

2. **Technical Abbreviations Without Context**
   - **Issue**: Terms like "SFI", "Kp", "Bz", "SSN", "MUF", "FOT", "LUF", "HPF" appear without inline explanations
   - **Location**: Primary Metrics cards

3. **No Onboarding Flow**
   - **Issue**: New users land on Home with no guidance to configure their station
   - **Impact**: PropSphere shows "Set your QTH in settings to see path analysis" but users may not know why

4. **PropSphere Complexity Overwhelming**
   - **Issue**: First view presents Time Machine, Operator Location, 24h Forecast, Optimal Band, plus a 3D globe with 7 layer toggles and 4 presets

#### Recommendations for New Nick

| Priority | Issue                 | Recommendation                                      |
| -------- | --------------------- | --------------------------------------------------- |
| **P0**   | No dashboard          | Implement the PRD's Unified Dashboard at `/`        |
| **P0**   | No onboarding         | Add first-run wizard for station configuration      |
| **P1**   | Technical jargon      | Add hover tooltips on all abbreviations             |
| **P2**   | PropSphere complexity | Add "Beginner Mode" toggle hiding advanced overlays |

---

### 2. "DX Diana" - The Casual DXer

**Profile**: General or Extra class, 2-5 years experience, comfortable with FT8, interested in DXCC.

#### What Works Well

1. **Path Analysis Panel**
   - Short path/long path metrics with distance, bearing, and reciprocal
   - Difficulty rating with color-coded badges
   - Frequency limits (MUF/FOT/LUF/HPF) at path midpoint
   - Save target functionality

2. **24-Hour Propagation Forecast (Band Planner)**
   - Heat map visualization showing all bands over 24 hours
   - "Best Operating Windows" section with peak times and SNR estimates

3. **DX Wizard**
   - Multiple input methods: grid square, coordinates, location name, callsign lookup
   - Mode selection (FT8/CW/SSB) with appropriate SNR targets

#### Friction Points

1. **Greyline Information Buried**
   - **Issue**: PRD specifies "Greyline Alert Card" that appears when greyline is approaching
   - **Impact**: Diana must manually enable greyline overlay and scrub time

2. **No "Best Time for Japan" Quick Answer**
   - **Issue**: Answering "When is the best time to work Japan?" requires 3+ steps

3. **Spot Integration Limited**
   - **Issue**: DX Cluster shows live spots but no ATNO indicators as specified in PRD

#### Recommendations for DX Diana

| Priority | Issue              | Recommendation                                       |
| -------- | ------------------ | ---------------------------------------------------- |
| **P0**   | No greyline alerts | Implement contextual Greyline Alert Card from PRD    |
| **P1**   | DX query workflow  | Add "DX Advisor" panel for quick region/time queries |
| **P1**   | ATNO integration   | Add award status badges to DX spots                  |

---

### 3. "Contest Carl" - The Serious Contester

**Profile**: Extra class, 10+ years experience, participates in major contests.

#### What Works Well

1. **Contest Page**
   - Real-time score, QSO count, multiplier count
   - Multiplier tracker with visual grid
   - Dupe checking with real-time feedback

2. **Pro View (Fullscreen) for PropSphere**
   - Full-immersion map view with collapsible panels
   - Clean glass-panel overlay aesthetic

#### Friction Points

1. **No Band Activity Visualization**
   - **Issue**: PRD specifies "Band Activity Map" showing activity density
   - **Impact**: Carl can't quickly see "Where's the activity on 15m right now?"

2. **No Keyboard Shortcuts**
   - **Issue**: Contest logging relies on mouse interaction
   - **Impact**: Slower entry for experienced contesters

3. **Limited Real-time Spot Filtering**
   - **Issue**: No "Needed multipliers only" filter option

#### Recommendations for Contest Carl

| Priority | Issue              | Recommendation                                              |
| -------- | ------------------ | ----------------------------------------------------------- |
| **P0**   | No band activity   | Add Band Activity visualization                             |
| **P0**   | Keyboard shortcuts | Implement contest-standard shortcuts (Enter to log, F-keys) |
| **P1**   | Needed mult filter | Add "Show needed multipliers only" filter                   |

---

### 4. Professional Electrical Engineer / Ham Radio Enthusiast

**Profile**: Technical background, appreciates precision, expects engineering-quality data.

#### What Works Well

1. **Data Sourcing Transparency**
   - Footer on Solar Pulse links to NOAA SWPC
   - PRD documents all API endpoints

2. **Technical Metrics Available**
   - Full set: SFI, Kp, Ap, SSN, Bz, MUF, FOT, LUF, HPF
   - Path metrics: great circle distance, bearing, hop count

3. **Propagation Index Formula Documented**
   - Calculation breakdown: SFI (40pts) + Kp (40pts) + Bz (20pts)
   - Component scores visible in modal

#### Friction Points

1. **Calculation Methodology Not Inspectable**
   - **Issue**: Band conditions and SNR estimates shown but formulas aren't visible to users

2. **Limited Error/Uncertainty Indication**
   - **Issue**: Forecasts shown as definitive values without confidence intervals

#### Recommendations for Engineer

| Priority | Issue                    | Recommendation                             |
| -------- | ------------------------ | ------------------------------------------ |
| **P1**   | Calculation transparency | Add "View methodology" link in modals      |
| **P2**   | Uncertainty display      | Show confidence intervals on SNR estimates |

---

## Cross-Cutting Issues

### 1. Home Page Does Not Serve As Dashboard

**Impact**: All personas. The PRD specifies a Unified Dashboard, but current Home is a splash screen.

### 2. First-Run Experience Missing

**Impact**: Critical for beginners. No mechanism to detect or guide first-time users.

### 3. Tooltips Inconsistently Implemented

**Impact**: Technical terms appear without hover explanations; Tooltip component exists but underutilized.

### 4. Time Handling Complexity

**Impact**: Multiple time concepts (UTC, local, offset, day/night) without clear labeling.

### 5. Mobile Experience Needs Dedicated Design

**Impact**: All personas on mobile devices. Current approach hides desktop panels rather than providing mobile-optimized views.

- Bottom tab navigation needed (standard mobile pattern)
- Module-specific mobile views with swipe navigation
- Touch-optimized interactions (larger tap targets, swipe gestures)
- Simplified data hierarchy for smaller screens

---

## Priority Matrix

### P0 - Critical

| Issue                              | Effort | Impact                         |
| ---------------------------------- | ------ | ------------------------------ |
| Implement Unified Dashboard at `/` | Large  | Transforms first impression    |
| Add first-run onboarding wizard    | Medium | Enables immediate usefulness   |
| Add keyboard shortcuts for Contest | Medium | Critical for serious use       |
| Add band activity visualization    | Medium | Core contest feature           |
| Design mobile-first experience     | Large  | Opens platform to mobile users |

### P1 - High Priority

| Issue                                       | Effort | Impact                  |
| ------------------------------------------- | ------ | ----------------------- |
| Implement hover tooltips on technical terms | Small  | Reduces learning curve  |
| Add greyline alert notifications            | Medium | Answers key DX question |
| Add ATNO badges to DX spots                 | Medium | Enables award tracking  |
| Add calculation transparency                | Medium | Builds trust in data    |

### P2 - Medium Priority

| Issue                                   | Effort | Impact            |
| --------------------------------------- | ------ | ----------------- |
| Add region quick-select to Band Planner | Small  | Convenience       |
| Implement PropSphere "Beginner Mode"    | Medium | Reduces overwhelm |
| Add rate trend sparkline                | Small  | Decision support  |

---

## Conclusion

Propulse demonstrates excellent technical foundations and visual design. The primary gap is between the application's capabilities and beginner accessibility. The PRD's "progressive disclosure" philosophy is partially implemented, but the entry point (Home page) and onboarding don't adequately serve new users.

**Recommended Focus Order**:

1. Transform Home page into the PRD's Unified Dashboard
2. Add first-run onboarding wizard
3. Design dedicated mobile experience
4. Implement tooltips consistently
5. Add contest keyboard shortcuts
6. Implement greyline alerts and ATNO integration
