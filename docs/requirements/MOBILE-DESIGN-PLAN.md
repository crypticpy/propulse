# Propulse Mobile UI Design Review and Recommendations

**Version:** 1.0
**Date:** February 1, 2026
**Author:** Claude (AI Design Assistant)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Mobile Navigation System](#2-mobile-navigation-system)
3. [Module-by-Module Mobile Designs](#3-module-by-module-mobile-designs)
4. [Shared Mobile Components](#4-shared-mobile-components)
5. [Technical Considerations](#5-technical-considerations)
6. [Implementation Roadmap](#6-implementation-roadmap)
7. [Design Specifications](#7-design-specifications)

---

## 1. Executive Summary

### Current Mobile Experience Assessment

**Current Approach:**

- Uses responsive CSS with Tailwind breakpoints (`md:`, `lg:`, `xl:`)
- Panels are hidden on mobile via `hidden lg:block` patterns
- Navigation uses horizontally scrolling icons on small screens
- PropSphere has a mobile tab system for bottom panels (Path/Bands/Recs/Spots)
- No dedicated mobile layouts; desktop components compressed to fit

**Key Issues Identified:**

1. **Navigation Overflow**: Header nav uses `overflow-x-auto` creating awkward horizontal scroll on mobile
2. **Hidden Functionality**: Critical features like Band Conditions and Path Analysis are completely hidden on mobile
3. **Touch Targets Too Small**: Many buttons fall below 44x44px minimum
4. **Content Density**: Cards designed for desktop consumption, overwhelming on mobile
5. **No Mobile-Specific Patterns**: Missing pull-to-refresh, swipe gestures, bottom sheets, FABs
6. **Vertical Space Waste**: Sticky header consumes 64px
7. **Form Inputs Not Optimized**: Forms don't account for virtual keyboards

### Proposed Mobile-First Approach

1. **Bottom Tab Navigation**: Primary navigation moves to fixed bottom bar
2. **Stack-Based Navigation**: Module screens use stack navigation for drill-down
3. **Mobile-Optimized Layouts**: Purpose-built mobile views, not hidden desktop panels
4. **Touch-First Interactions**: Swipe cards, pull-to-refresh, long-press actions
5. **Progressive Disclosure**: Show summary first, reveal details on tap
6. **Offline-Ready PWA**: Service worker caching for field use

### Key Design Principles for Mobile

| Principle                  | Application                                   |
| -------------------------- | --------------------------------------------- |
| **Thumb-Zone Friendly**    | Primary actions in bottom 1/3 of screen       |
| **One-Handed Operation**   | Contest and Logbook must work one-handed      |
| **Glanceable Data**        | Solar conditions visible in 2 seconds or less |
| **Contextual Actions**     | Show relevant actions based on current state  |
| **Reduced Cognitive Load** | One primary task per screen                   |
| **Offline Resilience**     | Core features work without network            |

---

## 2. Mobile Navigation System

### Bottom Tab Bar Design

Replace header navigation with fixed bottom tab bar on mobile (`< 768px`).

```
+--------------------------------------------------+
|              [Module Content Area]               |
+--------------------------------------------------+
| [Home] [Solar] [Map] [Tools] [Log] |  <- 5 tabs  |
+--------------------------------------------------+
```

#### Tab Configuration

| Tab   | Icon     | Label | Destination  | Badge Support        |
| ----- | -------- | ----- | ------------ | -------------------- |
| Home  | `house`  | Home  | `/`          | No                   |
| Solar | `sun`    | Solar | `/solar`     | Alert dot for storms |
| Map   | `globe`  | Map   | `/map`       | No                   |
| Tools | `wrench` | Tools | Drawer/Sheet | No                   |
| Log   | `book`   | Log   | `/log`       | QSO count            |

**Tools Drawer Contains:**

- DX Wizard (`/dx`)
- Band Planner (`/planner`)
- Contest (`/contest`)
- Settings

#### Tab Bar Specifications

```
Height: 56px + safe-area-inset-bottom
Background: rgba(10, 10, 26, 0.95) with backdrop-blur
Border-top: 1px solid rgba(255, 255, 255, 0.1)
Icon size: 24px
Label font: Inter 10px medium
Active color: #FF6B35 (plasma-orange)
Inactive color: #6B7280 (gray-500)
```

### Gesture-Based Navigation

| Gesture           | Context          | Action                        |
| ----------------- | ---------------- | ----------------------------- |
| Swipe left/right  | Solar cards      | Navigate between metric cards |
| Swipe up          | PropSphere       | Open path/bands bottom sheet  |
| Swipe down        | Any detail view  | Dismiss/go back               |
| Swipe left on QSO | Logbook list     | Reveal delete action          |
| Pull down         | Lists/dashboards | Refresh data                  |
| Long press        | QSO row          | Show context menu             |

### Mobile Header

```
+----------------------------------------------------------+
| ☀️ PROPULSE                          14:32 UTC | ⚙️        |
+----------------------------------------------------------+
```

- Logo only (no tagline)
- Condensed UTC time
- Settings gear (opens modal)
- Height: 48px (down from 64px)

---

## 3. Module-by-Module Mobile Designs

### 3.1 Home Dashboard

Transform into mobile command center:

```
+----------------------------------------------------------+
| +------------------------------------------------------+ |
| |  HF CONDITIONS: GOOD          [████████░░] 76/100    | |
| |  Best bands: 20m, 17m, 15m    SFI 145 | Kp 2        | |
| +------------------------------------------------------+ |
|                                                          |
| +------------------------+  +------------------------+   |
| |    ☀️ SFI: 145         |  |    📡 Kp: 2.3          |   |
| |    ↗ Rising            |  |    Quiet               |   |
| +------------------------+  +------------------------+   |
|                                                          |
| QUICK ACTIONS                                            |
| [🌍 Open Map]  [📝 Log QSO]  [🧙 DX Wizard]              |
|                                                          |
| RECENT ACTIVITY                                          |
| JA1XYZ  20m FT8   2 min ago                             |
| G4ABC   40m SSB   15 min ago                            |
+----------------------------------------------------------+
```

### 3.2 Solar Pulse

Swipeable card carousel with vertical scroll:

```
+----------------------------------------------------------+
| PROPAGATION INDEX                                        |
| +------------------------------------------------------+ |
| |                  ████████████                        | |
| |                     76                               | |
| |               GOOD CONDITIONS                        | |
| +------------------------------------------------------+ |
|                                                          |
| PRIMARY METRICS                    ← swipe →    [1/4]   |
| +------------------------------------------------------+ |
| |    ☀️ SOLAR FLUX INDEX                               | |
| |           145 sfu                                    | |
| |    [▁▂▃▄▅▆▇█▇▆] 30-day trend                        | |
| +------------------------------------------------------+ |
|                                                          |
| BAND CONDITIONS                                          |
| | 160m ⚫  80m 🟡  40m 🟢  20m 🟢  15m 🟢  10m ⚫      | |
+----------------------------------------------------------+
```

### 3.3 PropSphere (Map)

Full-screen map with bottom sheet:

```
+----------------------------------------------------------+
| [< Back]  PropSphere              [Layers]  [⟳ Live]     |
+----------------------------------------------------------+
|                    +-------------+                       |
|                   |    3D Globe   |                      |
|                    +-------------+                       |
|                                                          |
|  [Globe] [Flat] [Azimuthal]                             |
+----------------------------------------------------------+
| ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔  <- Drag handle                   |
| Target: JA1XYZ • PM95 • 10,847 km                       |
| Best Band Now: 20m • Path Status: GOOD                  |
+----------------------------------------------------------+
```

**Bottom Sheet States:**

- Collapsed: 80px (target summary)
- Half-expanded: 40% (key details)
- Full-expanded: 85% (complete analysis)

### 3.4 Band Planner

Simplified view with 8-column heat map:

```
+----------------------------------------------------------+
| TARGET: [Enter grid_______________]  [Resolve]           |
| Your QTH: EM10 → Target: FN31 • 2,450 km                |
|                                                          |
| BEST WINDOWS                                             |
| +------------------------------------------------------+ |
| | 20m ★ RECOMMENDED                                    | |
| | 13:00-18:00 UTC • Peak at 15:00 • SNR -8 dB         | |
| +------------------------------------------------------+ |
|                                                          |
| 24-HOUR FORECAST (3h intervals)                         |
| Hour: 00 03 06 09 12 15 18 21                           |
| 20m:  ░░ ░░ ▓▓ ██ ██ ██ ▓▓ ░░                          |
| 17m:  ░░ ░░ ▓▓ ██ ██ ▓▓ ░░ ░░                          |
+----------------------------------------------------------+
```

### 3.5 DX Wizard

3-step wizard flow:

```
Step 1: TARGET        Step 2: SETUP        Step 3: RESULTS
[Grid/Call input] →   [Mode/Power] →       [Recommendations]
```

### 3.6 LogBook

Card-based QSO list with FAB:

```
+----------------------------------------------------------+
| +------------------------------------------------------+ |
| | JA1XYZ    20m FT8    +06/-08    Feb 1, 14:32 UTC    | |
| | PM95sq    Japan      10,847 km                       | |
| +------------------------------------------------------+ |
|                                                          |
|                                            [+] FAB      |
+----------------------------------------------------------+
```

Swipe left on card → Delete action

### 3.7 Contest

One-handed operation with large LOG button:

```
+----------------------------------------------------------+
| SCORE: 12,450    QSOs: 127    MULTS: 45                 |
+----------------------------------------------------------+
|                                                          |
| CALLSIGN: [________________]                             |
| EXCHANGE: [________________]                             |
|                                                          |
|   +--------------------------------------------------+  |
|   |              LOG QSO (56px height)               |  |
|   +--------------------------------------------------+  |
|                                                          |
| DUPES   MULTS   RATE   BANDS                            |
+----------------------------------------------------------+
```

---

## 4. Shared Mobile Components

### MobileCard

- Swipeable with action reveal
- Variants: compact, detailed, expandable
- Touch feedback on tap

### MobileChart

- Touch-scrollable sparklines
- Tap-to-see-value interaction
- Simplified axes for mobile

### FAB (Floating Action Button)

- Size: 56x56px
- Position: bottom-right, 16px margin
- Uses: New QSO, Quick Log

### BottomSheet

- Three snap points: 30%, 60%, 90%
- Drag handle for affordance
- Backdrop dismiss

### MetricCarousel

- Horizontal swipe between cards
- Pagination dots
- Auto-advance option (disabled by default)

---

## 5. Technical Considerations

### Breakpoint Strategy

```css
/* Mobile-first approach */
.component {
  /* Mobile styles */
}

@media (min-width: 768px) {
  .component {
    /* Tablet/Desktop */
  }
}
```

Key breakpoint: **768px** - switches between mobile and desktop layouts

### Performance

- Lazy load charts and 3D globe
- Reduce animation complexity on mobile
- Use `will-change` sparingly
- Debounce scroll/resize handlers

### Offline Support

- Cache solar data for 15 minutes
- Store user preferences locally
- Show "offline" indicator when disconnected
- Queue QSO entries for sync

### PWA Features

- Install prompt after 2nd visit
- Push notifications for:
  - Geomagnetic storm alerts
  - Greyline alerts
  - Contest reminders

---

## 6. Implementation Roadmap

### Phase 1: Core Navigation (2-3 weeks)

- Bottom tab bar component
- Mobile header
- Tools drawer
- Basic routing changes

### Phase 2: Solar Pulse Mobile (2 weeks)

- Metric card carousel
- Simplified band strip
- Pull-to-refresh
- Chart modals

### Phase 3: PropSphere Mobile (3 weeks)

- Bottom sheet component
- Touch gesture handling
- Simplified layer controls
- Map optimizations

### Phase 4: Remaining Modules (4 weeks)

- Band Planner simplification
- DX Wizard wizard flow
- LogBook card view + FAB
- Contest one-handed mode

---

## 7. Design Specifications

### Touch Targets

- Minimum: 44x44px
- Recommended: 48x48px
- Primary actions: 56x56px

### Typography (Mobile)

- Headers: 20px (down from 24px)
- Body: 16px
- Labels: 12px
- Min readable: 11px

### Spacing

- Card padding: 12px (vs 16px desktop)
- Section gaps: 16px (vs 24px desktop)
- Edge margins: 16px

### Safe Areas

```css
padding-bottom: env(safe-area-inset-bottom);
padding-top: env(safe-area-inset-top);
```

### Animations

- Duration: 200ms (vs 300ms desktop)
- Easing: ease-out for enter, ease-in for exit
- Reduce motion: respect `prefers-reduced-motion`

---

## Summary

This mobile design plan transforms Propulse from a responsive desktop app into a true mobile-first experience. Key changes:

1. **Bottom tab navigation** replaces header overflow
2. **Module-specific mobile views** instead of hidden panels
3. **Touch-first interactions** (swipe, pull, long-press)
4. **Progressive disclosure** reduces cognitive load
5. **One-handed operation** for Contest and LogBook

Implementation should proceed in phases, starting with core navigation and Home dashboard, then progressively enhancing each module with its mobile-optimized view.
