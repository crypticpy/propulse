# PRD: Gamification Engine -- The Achievement & Challenge Platform for Propulse

**Status:** Draft
**Owner:** Product / Engineering
**Audience:** Frontend, Backend (Supabase), UX, QA
**Version:** 1.0
**Date:** 2026-02-07

**Related docs:**

- `docs/requirements/phase-2/PRD-OPERATOR-PROFILE-V2.md` -- Operator identity, profile badges display, XP level indicator
- `docs/requirements/phase-2/PRD-SHACK-BUILDER-V2.md` -- Equipment data for Equipment badges (QRP detection, antenna types)
- `docs/requirements/PRD-SUPABASE-MIGRATION.md` -- Cloud backend, auth, RLS, sync patterns
- `docs/requirements/PRD-OPERATOR-PROFILE.md` -- V1 profile with AwardsTracker, StatsTab, completeness scoring

**Key source files (existing infrastructure the engine will consume):**

- `src/stores/dxccStore.ts` -- DXCC entity tracking (workedEntries, per-band/mode progress, 340 entities)
- `src/stores/solarStore.ts` -- Live solar data state (SFI, Kp, isLive flag)
- `src/stores/profileStore.ts` -- Operator profile (station, bio, socialLinks, license)
- `src/stores/shackStore.ts` -- Equipment inventory (radios, antennas, feedlines, accessories, presets)
- `src/hooks/useAwardProgress.ts` -- Current DXCC/WAS/WAZ computation from logbook
- `src/hooks/useLogbookStats.ts` -- Aggregate QSO statistics (total, by band, by mode, heatmap)
- `src/lib/db/types.ts` -- LogEntry schema (callsign, frequency, mode, band, date, grid, qth)
- `src/types/solar.ts` -- SolarIndices (sfi, kp, ssn, aIndex), BandCondition, BandStatus
- `src/types/propagation.ts` -- PropagationPath (distance, bearing, hops), FrequencyLimits
- `src/types/supabase.ts` -- Database schema (profiles, achievements, activity_feed, log_entries)
- `src/lib/utils/greyline.ts` -- Greyline computation (sunrise/sunset times, terminator)
- `src/lib/utils/sun.ts` -- Solar position calculations
- `src/lib/data/dxccEntities.ts` -- DXCC entity lookup, active entity count (~340)

---

## Table of Contents

1. [Overview & Vision](#1-overview--vision)
2. [Architecture](#2-architecture)
3. [Contact Milestone System](#3-contact-milestone-system)
4. [Badge System](#4-badge-system)
5. [Level & XP System](#5-level--xp-system)
6. [Dynamic Challenge Engine](#6-dynamic-challenge-engine)
7. [Multiplier System](#7-multiplier-system)
8. [Leaderboards](#8-leaderboards)
9. [Data Model](#9-data-model)
10. [Integration Points](#10-integration-points)
11. [Anti-Gaming Measures](#11-anti-gaming-measures)
12. [Retroactive Computation](#12-retroactive-computation)
13. [UI Components](#13-ui-components)
14. [API Endpoints](#14-api-endpoints)

---

## 1. Overview & Vision

### The Opportunity

Ham radio is a hobby built on achievement. Operators chase DXCC Honor Roll, earn Worked All States, compete for SOTA Mountain Goat status, and activate POTA parks to reach Platinum. Every contact is a small victory. Every new country is a milestone. Every band opening is a race against the ionosphere.

Yet no ham radio software treats this achievement culture as a first-class system. QRZ.com shows static award counts. POTA tracks park activations in a spreadsheet-style table. LoTW is a confirmation database with zero celebration. The actual _experience_ of progression -- the dopamine of leveling up, the thrill of completing a challenge against the clock, the pride of a badge earned under impossible conditions -- does not exist anywhere in the ham radio software ecosystem.

Propulse changes that.

The Gamification Engine is a standalone system that transforms every QSO, every band opening, every geomagnetic storm into an opportunity for achievement. It reads Propulse's live propagation data and _creates challenges that match the ionosphere in real time_. It tracks contacts per US state and per DXCC country and rewards operators who chase them all. It recognizes the operator who makes a contact during a K-index 7 storm just as much as the one who works 100 countries on 20 meters.

This is not gamification bolted onto a logging app. This is a purpose-built achievement engine that understands radio propagation, respects ham radio culture, and makes every operating session feel like it matters.

### Design Principles

1. **Authenticity over cleverness.** Level names come from real ham radio terminology. Badge criteria map to real operating achievements. Nothing feels like a mobile game -- it feels like the awards bureau that ham radio deserves.

2. **Condition-adaptive, not static.** Challenges are generated from live propagation data. When 10 meters opens unexpectedly, the engine creates a 10m Sprint. When a geomagnetic storm hits, it creates a Storm Chaser challenge with bonus multipliers. The engine _reacts to the ionosphere_.

3. **Multi-path progression.** Not everyone chases DX. Some operators love POTA. Some live for CW. Some are mentors. The level system and badge categories reward _all_ styles of operating, not just one path.

4. **Transparency for technical audiences.** Ham radio operators are engineers, scientists, and tinkerers. They want to see the formula. XP calculations, multiplier algorithms, and badge criteria are fully visible -- never a black box.

5. **Celebration without pressure.** Every achievement is celebrated with animation, sound, and visual flair. But there is no punishment for inactivity, no decaying score, no "you missed your streak" guilt. The engine rewards operating. It never penalizes not operating.

### What This PRD Covers

This PRD defines the complete gamification engine as a standalone system. It is _consumed by_ the Profile page (which displays badges, levels, and challenge progress), the Shack page (which contributes equipment badges), and any future feature that needs achievement tracking.

This PRD does **not** define the Profile page layout, the Shack page layout, or the social sharing UI. Those are defined in their respective PRDs. This PRD defines:

- The badge registry (all categories, tiers, criteria, visual specs)
- The XP and level system (sources, curve, titles)
- The contact milestone tracker (per-state, per-country, cross-multipliers)
- The dynamic challenge engine (condition-adaptive algorithm, challenge types, cadence)
- The multiplier system (distance, conditions, islands, events)
- The leaderboard system (categories, seasons, privacy)
- The data model (Supabase tables, RLS policies)
- The client-side computation engine (hooks, stores, workers)
- The API surface (endpoints, payloads, rate limits)

### Non-Goals

1. **Real-money transactions.** No paid badges, no premium XP boosters, no subscription gating. Every feature in this PRD is free for all Propulse users.
2. **PvP competition.** Leaderboards are opt-in and seasonal. There is no head-to-head competitive mode. Contest scoring remains in the Contest module.
3. **External award verification.** We do not verify ARRL DXCC, IOTA, or other external awards. Propulse badges are Propulse-native achievements based on the operator's logbook data.
4. **Bot/automated QSO logging.** The engine requires human-initiated QSO logging. Automated imports are supported but subject to anti-gaming validation.
5. **Mobile push notifications.** Challenge alerts appear in-app. Native push notifications are a future enhancement.

---

## 2. Architecture

### System Overview

The Gamification Engine is a hybrid client-server system. The client-side engine runs in the browser and performs real-time badge evaluation, challenge progress tracking, and XP computation. The server (Supabase) persists achievements, manages leaderboards, and runs periodic challenge generation via Edge Functions.

```
+------------------------------------------------------------------+
|  BROWSER (Client-Side Engine)                                     |
|                                                                   |
|  +------------------+   +-------------------+   +--------------+  |
|  | GamificationStore|   | ChallengeEngine   |   | XPCalculator |  |
|  | (Zustand)        |   | (React Hook)      |   | (Pure fn)    |  |
|  |                  |   |                   |   |              |  |
|  | - badges[]       |   | - activeChallenges|   | - totalXP    |  |
|  | - xp / level     |   | - progress{}      |   | - level      |  |
|  | - milestones{}   |   | - conditions{}    |   | - nextLevel  |  |
|  | - streaks{}      |   | - cadence timers  |   | - sources[]  |  |
|  +--------+---------+   +--------+----------+   +------+-------+  |
|           |                      |                      |          |
|           v                      v                      v          |
|  +------------------------------------------------------------------+
|  |  QSO Event Bus (Zustand middleware / custom event emitter)       |
|  |  Fires on: QSO logged, QSO imported, QSO deleted, QSO edited   |
|  +------------------------------------------------------------------+
|           |                      |                      |          |
|           v                      v                      v          |
|  +------------------+   +-------------------+   +--------------+  |
|  | LogbookStore     |   | SolarStore        |   | ProfileStore |  |
|  | (IndexedDB)      |   | (Live NOAA data)  |   | (Zustand)    |  |
|  +------------------+   +-------------------+   +--------------+  |
|                                                                   |
+------------------------------------------------------------------+
           |                      |                      |
           v                      v                      v
+------------------------------------------------------------------+
|  SUPABASE (Server-Side Persistence)                               |
|                                                                   |
|  +------------------+   +-------------------+   +--------------+  |
|  | achievements     |   | challenges        |   | leaderboards |  |
|  | (badge + tier +  |   | (active, history) |   | (seasonal,   |  |
|  |  progress + xp)  |   |                   |   |  category)   |  |
|  +------------------+   +-------------------+   +--------------+  |
|                                                                   |
|  +------------------+   +-------------------+                     |
|  | contact_milestones|  | xp_ledger         |                     |
|  | (per-state,      |   | (source, amount,  |                     |
|  |  per-country)    |   |  timestamp)       |                     |
|  +------------------+   +-------------------+                     |
|                                                                   |
|  Edge Functions:                                                  |
|  - generate-daily-challenges (cron: 0 0 * * *)                   |
|  - generate-weekend-challenges (cron: 0 0 * * 5)                 |
|  - rotate-leaderboard-season (cron: 0 0 1 * *)                  |
|  - compute-retroactive-badges (on-demand, admin-triggered)       |
+------------------------------------------------------------------+
```

### Client-Side Engine

The client-side engine is the primary computation layer. It evaluates badge criteria, tracks challenge progress, and computes XP in real time as QSOs are logged. This architecture minimizes server round-trips and provides instant feedback.

**Core components:**

| Component               | Type          | Responsibility                                                                                       |
| ----------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `useGamificationEngine` | React Hook    | Orchestrates badge evaluation, challenge tracking, XP computation on QSO events                      |
| `gamificationStore.ts`  | Zustand Store | Persists earned badges, XP total, level, active challenges, streaks, milestones                      |
| `badgeEvaluator.ts`     | Pure Function | Given a badge definition and operator state, returns `{ earned: boolean, progress: number }`         |
| `challengeEngine.ts`    | Pure Function | Given solar conditions + active challenges, evaluates QSO against challenge criteria                 |
| `xpCalculator.ts`       | Pure Function | Given an XP event (QSO, badge, challenge, streak), returns XP amount with multipliers                |
| `milestoneTracker.ts`   | Pure Function | Tracks per-state and per-country contact counts, evaluates milestone thresholds                      |
| `useConditionMonitor`   | React Hook    | Subscribes to `solarStore` and band conditions, triggers challenge generation when conditions change |

**Event flow for a logged QSO:**

1. Operator logs a QSO in the logbook (or imports via ADIF)
2. The QSO event fires through the event bus
3. `useGamificationEngine` receives the event and:
   a. Enriches the QSO with computed fields (distance from operator QTH, DXCC entity, US state, continent, IOTA reference, greyline status, solar conditions at time of contact)
   b. Passes enriched QSO to `milestoneTracker` -- updates per-state/per-country counts, checks milestone thresholds
   c. Passes enriched QSO to `badgeEvaluator` -- checks all badge criteria against current state
   d. Passes enriched QSO to `challengeEngine` -- updates progress on active challenges
   e. Calls `xpCalculator` for all earned achievements (QSO base XP + milestone XP + badge XP + challenge XP + multipliers)
   f. Updates `gamificationStore` with new state
   g. Syncs delta to Supabase (debounced, batched)
4. UI reacts to store changes (toast notifications, badge animations, level-up celebrations)

### Server-Side Components

Supabase handles persistence, cross-device sync, leaderboard aggregation, and periodic challenge generation.

**Edge Functions:**

| Function                      | Trigger                                     | Purpose                                                                                                 |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `generate-daily-challenges`   | Cron: `0 0 * * *` (daily at 00:00 UTC)      | Reads current solar conditions via NOAA API, generates 2-3 daily micro-challenges adapted to conditions |
| `generate-weekend-challenges` | Cron: `0 0 * * 5` (Friday 00:00 UTC)        | Generates 1-2 weekend challenges (Island Hopper, Band Explorer, etc.) with higher XP rewards            |
| `rotate-leaderboard-season`   | Cron: `0 0 1 * *` (1st of month, 00:00 UTC) | Archives current leaderboard, creates new season, computes final standings                              |
| `compute-retroactive-badges`  | Admin-triggered or on first login           | Scans user's entire QSO history and awards any badges/milestones already earned                         |
| `sync-challenge-state`        | On client connect                           | Pushes active challenges to client, reconciles progress                                                 |

**RLS (Row Level Security) policies:**

- Users can read/write their own `achievements`, `contact_milestones`, `xp_ledger`, and `challenge_progress` rows
- Users can read (but not write) `challenges` (server-generated)
- Users can read leaderboard rows where `is_public = true` or `user_id = auth.uid()`
- Leaderboard aggregation runs as service role (bypasses RLS)

---

## 3. Contact Milestone System

### Overview

The Contact Milestone System tracks how many contacts an operator has made with stations in each US state (50 states + DC) and each DXCC country (~340 active entities). It awards milestone badges at specific thresholds and unlocks extraordinary "cross-multiplier" power badges when an operator achieves a milestone threshold across ALL states or ALL countries.

This system is separate from the existing `dxccStore.ts` DXCC tracking (which tracks unique entities worked/confirmed). The milestone system tracks _total contact count_ per geographic entity, not just "worked yes/no."

### Per-State Milestones (US States)

**Tracked entities:** 50 US states + District of Columbia (51 total)

**State extraction logic:**

1. Check `log_entry.state` field (ADIF standard field -- requires adding to `LogEntry` schema)
2. Fall back to `log_entry.qth` text parsing (existing logic in `useAwardProgress.ts`, needs hardening)
3. Fall back to callsign prefix analysis (US callsign districts map to approximate regions)
4. Manual override: operator can tag a QSO with a state in the logbook

**Milestone thresholds per state:**

| Threshold       | Badge Name Pattern | Badge Tier | XP Award |
| --------------- | ------------------ | ---------- | -------- |
| 10 contacts     | `{State} Explorer` | Bronze     | 25 XP    |
| 100 contacts    | `{State} Operator` | Silver     | 100 XP   |
| 1,000 contacts  | `{State} Master`   | Gold       | 500 XP   |
| 10,000 contacts | `{State} Legend`   | Platinum   | 2,500 XP |

**Example:** An operator who has made 100 contacts with stations in Texas earns the "Texas Operator" badge (Silver tier, 100 XP).

**Visual representation:**

- US map grid with color-coded cells: gray (< 10), bronze (10+), silver (100+), gold (1,000+), platinum (10,000+)
- Tap/click a state to see: contact count, badge tier, progress to next tier, most recent contact, first contact date
- Progress bar below the map showing overall percentage across all states

### Per-Country Milestones (DXCC Entities)

**Tracked entities:** All active DXCC entities (~340, sourced from `dxccEntities.ts`)

**Country extraction logic:**

1. DXCC entity lookup via callsign prefix (existing `lookupEntity()` in `dxccEntities.ts`)
2. Cross-reference with `dxccStore` worked entries for confirmed entity mapping
3. ADIF `dxcc` field from imported logs

**Milestone thresholds per country:**

| Threshold       | Badge Name Pattern     | Badge Tier | XP Award |
| --------------- | ---------------------- | ---------- | -------- |
| 10 contacts     | `{Country} Visitor`    | Bronze     | 25 XP    |
| 100 contacts    | `{Country} Regular`    | Silver     | 100 XP   |
| 1,000 contacts  | `{Country} Specialist` | Gold       | 500 XP   |
| 10,000 contacts | `{Country} Ambassador` | Platinum   | 2,500 XP |

**Visual representation:**

- World map grid or DXCC entity table with color-coded tiers
- Filterable by continent, sorted by contact count or alphabetically
- Continent summary cards showing percentage of entities in each continent that have reached each tier

### Cross-Multiplier Power Badges

These are the crown jewels of the milestone system. They are earned when an operator achieves a specific milestone threshold across EVERY entity in a category.

**US State Cross-Multiplier Badges:**

| Requirement                       | Badge Name           | Badge Tier | XP Award   | Visual                                                                |
| --------------------------------- | -------------------- | ---------- | ---------- | --------------------------------------------------------------------- |
| 10+ contacts in ALL 50 states     | `All-State Explorer` | Gold       | 5,000 XP   | US map fully lit bronze, badge with stars radiating                   |
| 100+ contacts in ALL 50 states    | `All-State Operator` | Diamond    | 25,000 XP  | US map fully lit silver, animated badge with electricity effect       |
| 1,000+ contacts in ALL 50 states  | `All-State Master`   | Legendary  | 100,000 XP | US map fully lit gold, animated badge with plasma-orange glow         |
| 10,000+ contacts in ALL 50 states | `All-State Legend`   | Mythic     | 500,000 XP | US map fully lit platinum, animated badge with cosmic particle effect |

**DXCC Country Cross-Multiplier Badges:**

| Requirement                          | Badge Name       | Badge Tier | XP Award     | Visual                              |
| ------------------------------------ | ---------------- | ---------- | ------------ | ----------------------------------- |
| 10+ contacts in ALL ~340 entities    | `World Explorer` | Diamond    | 50,000 XP    | Globe fully lit, rotating animation |
| 100+ contacts in ALL ~340 entities   | `World Operator` | Legendary  | 250,000 XP   | Globe with aurora effect            |
| 1,000+ contacts in ALL ~340 entities | `World Master`   | Mythic     | 1,000,000 XP | Globe with plasma tendrils          |

**Design note:** Cross-multiplier badges at the 1,000+ and 10,000+ levels are intentionally nearly impossible to achieve. They represent years -- possibly decades -- of dedicated operating. Their existence as aspirational targets is part of their value. An operator who achieves "All-State Master" (1,000 contacts in every US state) has made at least 50,000 US QSOs distributed with remarkable consistency. This is a lifetime achievement.

### Milestone Data Structure

```typescript
interface ContactMilestone {
  /** 'state' or 'country' */
  category: "state" | "country";
  /** State abbreviation (e.g., 'TX') or DXCC entity ID */
  entityKey: string;
  /** Display name (e.g., 'Texas' or 'Germany') */
  entityName: string;
  /** Total contact count */
  contactCount: number;
  /** Current tier reached: 0 = none, 1 = 10+, 2 = 100+, 3 = 1000+, 4 = 10000+ */
  currentTier: 0 | 1 | 2 | 3 | 4;
  /** Progress percentage to next tier (0-100) */
  progressToNextTier: number;
  /** ISO timestamp of first contact */
  firstContactAt: string;
  /** ISO timestamp of most recent contact */
  lastContactAt: string;
}

interface CrossMultiplierProgress {
  /** 'all-state' or 'all-country' */
  category: "all-state" | "all-country";
  /** Target tier (1 = 10+, 2 = 100+, 3 = 1000+, 4 = 10000+) */
  targetTier: 1 | 2 | 3 | 4;
  /** Number of entities that have reached the target tier */
  entitiesAtTier: number;
  /** Total entities required */
  totalEntities: number;
  /** Percentage complete (0-100) */
  percentage: number;
  /** Entity keys that are still below the target tier (the "holdouts") */
  remainingEntities: string[];
}
```

---

## 4. Badge System

### Badge Architecture

Every badge in Propulse follows a consistent structure:

```typescript
interface BadgeDefinition {
  /** Unique identifier (e.g., 'contact-milestone-tx-100') */
  id: string;
  /** Display name (e.g., 'Texas Operator') */
  name: string;
  /** Category for grouping in the UI */
  category: BadgeCategory;
  /** Visual tier affecting border color, animation, rarity indicator */
  tier: BadgeTier;
  /** Short description shown on hover/tap */
  description: string;
  /** Detailed criteria shown in badge detail view */
  criteria: string;
  /** Icon identifier (maps to SVG icon library) */
  icon: string;
  /** XP awarded when badge is earned */
  xpReward: number;
  /** Whether this badge can be earned multiple times (e.g., per-state badges) */
  repeatable: boolean;
  /** Evaluation function: given operator state, returns earned status and progress */
  evaluate: (state: OperatorState) => BadgeEvaluation;
}

type BadgeCategory =
  | "contact-milestone" // Per-state, per-country contact counts
  | "cross-multiplier" // Every state/country at a threshold
  | "profile-completion" // Profile sections filled out
  | "challenge-completion" // N challenges completed
  | "streak" // Consecutive days on air
  | "mode" // Operating mode mastery
  | "band" // Band-specific achievements
  | "distance" // Contact distance records
  | "equipment" // Station setup achievements
  | "time-based" // Time-of-day contacts
  | "conditions" // Weather/propagation conditions
  | "social" // Community contributions
  | "pota-sota" // External program integration
  | "special-event"; // Seasonal and anniversary events

type BadgeTier =
  | "bronze" // Entry-level, achievable in days
  | "silver" // Intermediate, weeks to months
  | "gold" // Advanced, months of dedicated effort
  | "platinum" // Expert, sustained long-term commitment
  | "diamond" // Elite, exceptional achievement
  | "legendary" // Extraordinary, years of dedication
  | "mythic"; // Nearly impossible, lifetime aspiration

interface BadgeEvaluation {
  /** Whether the badge has been fully earned */
  earned: boolean;
  /** Progress toward earning (0.0 to 1.0) */
  progress: number;
  /** Human-readable progress description */
  progressLabel: string;
  /** Timestamp when earned (null if not yet earned) */
  earnedAt: string | null;
}
```

### Badge Tier Visual Design

| Tier      | Border Color              | Background              | Animation             | Rarity Label |
| --------- | ------------------------- | ----------------------- | --------------------- | ------------ |
| Bronze    | `#CD7F32`                 | Dark copper gradient    | None                  | Common       |
| Silver    | `#C0C0C0`                 | Cool silver gradient    | Subtle shimmer        | Uncommon     |
| Gold      | `plasma-orange` (#F97316) | Warm gold gradient      | Gentle pulse          | Rare         |
| Platinum  | `#E5E4E2`                 | White-platinum gradient | Slow gleam sweep      | Epic         |
| Diamond   | `#B9F2FF`                 | Ice-blue gradient       | Sparkle particles     | Legendary    |
| Legendary | `#FFD700` to `#FF4500`    | Animated fire gradient  | Flame tendrils        | Mythic       |
| Mythic    | `#9B59B6` to `#3498DB`    | Cosmic nebula gradient  | Particle field + glow | Transcendent |

### Badge Categories

#### 4.1 Contact Milestones (Category: `contact-milestone`)

Defined in Section 3. Per-state badges (204 total: 51 entities x 4 tiers) and per-country badges (~1,360 total: ~340 entities x 4 tiers).

**Total badges in category:** ~1,564

#### 4.2 Cross-Multiplier Power Badges (Category: `cross-multiplier`)

Defined in Section 3. All-State badges (4 tiers) and All-Country badges (3 tiers).

**Total badges in category:** 7

#### 4.3 Profile Completion (Category: `profile-completion`)

| Badge                 | Criteria                                           | Tier   | XP  |
| --------------------- | -------------------------------------------------- | ------ | --- |
| Identity Established  | Set callsign + grid                                | Bronze | 10  |
| Licensed & Verified   | Complete license info (country, class, expiration) | Bronze | 15  |
| Station Portrait      | Upload profile photo                               | Bronze | 10  |
| Tell Your Story       | Write bio (50+ characters)                         | Bronze | 10  |
| Connected Operator    | Add 2+ social links                                | Silver | 20  |
| Equipment Documented  | Add 1+ radio to Shack Builder                      | Silver | 25  |
| Full Station Profile  | Add radio + antenna + feedline in Shack Builder    | Gold   | 50  |
| Profile Completionist | Reach 100% profile completeness score              | Gold   | 100 |

**Total badges in category:** 8

#### 4.4 Challenge Completion (Category: `challenge-completion`)

| Badge                   | Criteria                                        | Tier     | XP    |
| ----------------------- | ----------------------------------------------- | -------- | ----- |
| First Challenge         | Complete 1 challenge                            | Bronze   | 25    |
| Challenge Enthusiast    | Complete 10 challenges                          | Bronze   | 50    |
| Challenge Veteran       | Complete 50 challenges                          | Silver   | 200   |
| Challenge Master        | Complete 100 challenges                         | Gold     | 500   |
| Challenge Champion      | Complete 250 challenges                         | Platinum | 2,000 |
| Challenge Legend        | Complete 500 challenges                         | Diamond  | 5,000 |
| Challenge Perfectionist | Complete 25 challenges with 100% objectives met | Gold     | 1,000 |

**Total badges in category:** 7

#### 4.5 Streak Badges (Category: `streak`)

A "streak day" is defined as a UTC day on which the operator logged at least one QSO.

| Badge               | Criteria                 | Tier      | XP     |
| ------------------- | ------------------------ | --------- | ------ |
| First Week          | 7-day streak             | Bronze    | 50     |
| Dedicated Operator  | 14-day streak            | Silver    | 100    |
| Monthly Devotion    | 30-day streak            | Gold      | 300    |
| Quarter Champion    | 90-day streak            | Platinum  | 1,000  |
| Half-Year Hero      | 180-day streak           | Diamond   | 3,000  |
| Year-Round Operator | 365-day streak           | Legendary | 10,000 |
| Iron Will           | 730-day streak (2 years) | Mythic    | 50,000 |

**Total badges in category:** 7

#### 4.6 Mode Badges (Category: `mode`)

Each mode has a tiered progression based on total QSOs in that mode.

| Badge               | Criteria                                                    | Tier     | XP    |
| ------------------- | ----------------------------------------------------------- | -------- | ----- |
| FT8 Initiate        | 100 FT8 QSOs                                                | Bronze   | 25    |
| FT8 Operator        | 1,000 FT8 QSOs                                              | Silver   | 100   |
| FT8 Master          | 10,000 FT8 QSOs                                             | Gold     | 500   |
| CW Initiate         | 100 CW QSOs                                                 | Bronze   | 25    |
| CW Operator         | 1,000 CW QSOs                                               | Silver   | 100   |
| CW Master           | 10,000 CW QSOs                                              | Gold     | 500   |
| CW Legend           | 50,000 CW QSOs                                              | Platinum | 2,500 |
| SSB Initiate        | 100 SSB QSOs                                                | Bronze   | 25    |
| SSB Operator        | 1,000 SSB QSOs                                              | Silver   | 100   |
| SSB Master          | 10,000 SSB QSOs                                             | Gold     | 500   |
| Digital Explorer    | QSOs in 5+ digital modes (FT8, FT4, JS8, RTTY, PSK31, etc.) | Silver   | 150   |
| Multi-Mode Operator | 500+ QSOs in 3+ different modes                             | Gold     | 300   |
| Omni-Mode Master    | 1,000+ QSOs in 5+ different modes                           | Platinum | 1,000 |

**Total badges in category:** 13

#### 4.7 Band Badges (Category: `band`)

| Badge             | Criteria                                         | Tier     | XP    |
| ----------------- | ------------------------------------------------ | -------- | ----- |
| 160m Warrior      | 100 QSOs on 160m (the "Gentleman's Band")        | Silver   | 150   |
| 160m Conqueror    | 1,000 QSOs on 160m                               | Gold     | 500   |
| Top Band Legend   | 5,000 QSOs on 160m                               | Platinum | 2,500 |
| 80m Night Owl     | 500 QSOs on 80m                                  | Silver   | 100   |
| 40m Workhorse     | 1,000 QSOs on 40m                                | Silver   | 100   |
| 20m Champion      | 2,000 QSOs on 20m                                | Gold     | 300   |
| 15m Explorer      | 500 QSOs on 15m                                  | Silver   | 100   |
| 10m Sunspot Rider | 1,000 QSOs on 10m during solar max (SFI > 120)   | Gold     | 500   |
| 6m Magic          | 100 QSOs on 6m (sporadic E / tropo)              | Gold     | 300   |
| 6m Wizard         | 1,000 QSOs on 6m                                 | Platinum | 1,500 |
| Band Explorer     | QSOs on 8+ different HF bands                    | Silver   | 150   |
| All-Band Operator | QSOs on all 11 HF/VHF bands (160m through 6m)    | Gold     | 500   |
| WARC Specialist   | 500+ QSOs on WARC bands (30m, 17m, 12m combined) | Gold     | 300   |

**Total badges in category:** 13

#### 4.8 Distance Badges (Category: `distance`)

Distance is computed as great-circle distance between operator QTH (from `profileStore` active location) and contacted station's grid locator (from `log_entry.grid`).

| Badge                 | Criteria                                                          | Tier     | XP    |
| --------------------- | ----------------------------------------------------------------- | -------- | ----- |
| Local Ragchewer       | 100 QSOs under 500 km                                             | Bronze   | 25    |
| Regional Operator     | Single QSO over 1,000 km                                          | Bronze   | 15    |
| Long Hauler           | Single QSO over 5,000 km                                          | Silver   | 50    |
| Intercontinental      | Single QSO over 10,000 km                                         | Gold     | 150   |
| Antipodal Contact     | Single QSO over 18,000 km (nearly opposite side of Earth)         | Platinum | 500   |
| Distance Accumulator  | 100,000 km cumulative QSO distance in one month                   | Silver   | 200   |
| Around the World      | 40,075 km cumulative distance in one week (Earth's circumference) | Gold     | 500   |
| Million Mile Operator | 1,000,000 km cumulative lifetime distance                         | Platinum | 2,000 |
| Continental Sweep     | Contact all 6 populated continents in a single UTC day            | Gold     | 500   |

**Total badges in category:** 9

#### 4.9 Equipment Badges (Category: `equipment`)

These badges read from the Shack Builder (`shackStore`) and logbook data. Power level is inferred from the station preset's `operatingPowerWatts` field or a future `power` field on log entries.

| Badge                | Criteria                                                                       | Tier   | XP    |
| -------------------- | ------------------------------------------------------------------------------ | ------ | ----- |
| QRP Hero             | 100 QSOs at 5W or less                                                         | Silver | 200   |
| QRP Master           | 1,000 QSOs at 5W or less                                                       | Gold   | 1,000 |
| QRPp Legend          | 10 QSOs at 1W or less                                                          | Gold   | 500   |
| Wire Antenna Warrior | 500 QSOs using dipole/EFHW/random wire antenna (from shack preset)             | Silver | 150   |
| Homebrew Engineer    | Add a custom/homebrew radio to Shack Builder (manual entry, not from database) | Bronze | 50    |
| Station Architect    | Configure 3+ complete station presets in Shack Builder                         | Silver | 100   |
| Full Signal Chain    | Configure a complete signal chain: radio + antenna + feedline + tuner/amp      | Gold   | 200   |
| Vintage Operator     | Log QSOs with a radio manufactured before 2000 (from radio database year)      | Silver | 100   |

**Total badges in category:** 8

#### 4.10 Time-Based Badges (Category: `time-based`)

Time calculations use the operator's QTH coordinates (from `profileStore` active location) and solar position algorithms (from `sun.ts` and `greyline.ts`).

| Badge             | Criteria                                                                               | Tier   | XP  |
| ----------------- | -------------------------------------------------------------------------------------- | ------ | --- |
| Greyline Operator | 10 QSOs during greyline window (30 min before/after sunrise or sunset at operator QTH) | Silver | 100 |
| Greyline Master   | 100 greyline QSOs                                                                      | Gold   | 500 |
| Sunrise Contact   | QSO within 15 minutes of sunrise at operator QTH                                       | Bronze | 25  |
| Sunset Contact    | QSO within 15 minutes of sunset at operator QTH                                        | Bronze | 25  |
| Midnight Operator | 10 QSOs between 00:00 and 04:00 local time                                             | Silver | 75  |
| Night Owl Century | 100 QSOs between 22:00 and 06:00 local time                                            | Gold   | 300 |
| Dawn Patrol       | 50 QSOs between 04:00 and 07:00 local time                                             | Silver | 100 |
| Marathon Operator | Single operating session lasting 12+ hours with 50+ QSOs                               | Gold   | 500 |
| Weekend Warrior   | 100 QSOs logged on Saturdays and Sundays                                               | Bronze | 50  |
| Holiday Operator  | QSO logged on 5+ major holidays (New Year, Independence Day, Christmas, etc.)          | Silver | 100 |

**Total badges in category:** 10

#### 4.11 Weather/Condition Badges (Category: `conditions`)

These badges integrate with `solarStore` to read real-time solar conditions at the time each QSO is logged.

| Badge               | Criteria                                                       | Tier     | XP    |
| ------------------- | -------------------------------------------------------------- | -------- | ----- |
| Storm Chaser        | 10 QSOs while K-index >= 5                                     | Gold     | 300   |
| Storm Survivor      | 50 QSOs while K-index >= 5                                     | Platinum | 1,000 |
| Geomagnetic Legend  | 10 QSOs while K-index >= 7                                     | Diamond  | 2,500 |
| Solar Maximum Rider | 100 QSOs while SFI > 150                                       | Silver   | 150   |
| Solar Cycle Veteran | 1,000 QSOs while SFI > 150                                     | Gold     | 500   |
| Dead Band Revival   | QSO on a band with "Poor" condition rating (from `BandStatus`) | Silver   | 100   |
| Impossible Contact  | QSO on a band with "Poor" condition rating over 5,000 km       | Gold     | 500   |
| Aurora Operator     | QSO during aurora event (K >= 7 + high latitude path)          | Platinum | 750   |
| Quiet Sun Explorer  | 100 QSOs while SFI < 80 (solar minimum conditions)             | Silver   | 200   |

**Total badges in category:** 9

#### 4.12 Social Badges (Category: `social`)

| Badge                   | Criteria                                                                              | Tier   | XP  |
| ----------------------- | ------------------------------------------------------------------------------------- | ------ | --- |
| First Friend            | Add first friend/follow on Propulse                                                   | Bronze | 10  |
| Social Butterfly        | 10+ friends/follows                                                                   | Silver | 50  |
| Community Hub           | 50+ friends/follows                                                                   | Gold   | 200 |
| Profile Sharer          | Share profile card or QR code 5+ times                                                | Bronze | 25  |
| Achievement Broadcaster | Share 10+ achievement cards to social media                                           | Silver | 50  |
| Elmer                   | Be followed by 5+ operators who joined Propulse after you                             | Gold   | 300 |
| Net Controller          | Log 50+ QSOs in net-style operation (multiple QSOs in short window on same frequency) | Silver | 150 |
| Welcome Committee       | Be the first contact logged by 3+ new Propulse operators                              | Gold   | 500 |

**Total badges in category:** 8

#### 4.13 POTA/SOTA Integration (Category: `pota-sota`)

These badges recognize activity in external programs by reading operating location metadata from `profileStore` saved locations.

| Badge             | Criteria                                                        | Tier     | XP    |
| ----------------- | --------------------------------------------------------------- | -------- | ----- |
| Park Visitor      | Log 10 QSOs from a POTA park location                           | Bronze   | 25    |
| Park Activator    | Log QSOs from 10 different POTA parks                           | Silver   | 150   |
| Park Expert       | Log QSOs from 50 different POTA parks                           | Gold     | 500   |
| Park Master       | Log QSOs from 100 different POTA parks                          | Platinum | 2,000 |
| Summit Climber    | Log QSOs from 5 different SOTA summits                          | Silver   | 200   |
| Summit Veteran    | Log QSOs from 25 different SOTA summits                         | Gold     | 750   |
| Mountain Goat     | Log QSOs from 100 different SOTA summits                        | Platinum | 3,000 |
| Field Day Veteran | Log QSOs during 3+ Field Day events (last full weekend of June) | Silver   | 150   |
| Portable Pioneer  | Log 500 QSOs from any portable/POTA/SOTA locations              | Gold     | 300   |

**Total badges in category:** 9

#### 4.14 Special Event Badges (Category: `special-event`)

Time-limited badges that are only available during specific windows. Once the window closes, the badge becomes unobtainable (increasing its rarity and prestige).

| Badge                    | Criteria                                                                    | Window        | Tier     | XP    |
| ------------------------ | --------------------------------------------------------------------------- | ------------- | -------- | ----- |
| New Year's First Contact | First QSO of the calendar year (Jan 1, 00:00-23:59 UTC)                     | Annual        | Silver   | 100   |
| World Amateur Radio Day  | 5+ QSOs on April 18                                                         | Annual        | Silver   | 75    |
| Summer Solstice DX       | 10+ QSOs on June 20-21                                                      | Annual        | Silver   | 75    |
| Winter DX Marathon       | 50+ QSOs during December                                                    | Annual        | Gold     | 200   |
| Propulse Anniversary     | 10+ QSOs on Propulse's birthday (date TBD)                                  | Annual        | Gold     | 250   |
| Friday the 13th          | 13+ QSOs on any Friday the 13th                                             | Recurring     | Silver   | 100   |
| Leap Day Operator        | QSO on February 29                                                          | Every 4 years | Platinum | 500   |
| Solar Eclipse Contact    | QSO during a solar eclipse visible from operator QTH (window TBD per event) | Per-event     | Diamond  | 1,000 |

**Total badges in category:** 8

### Badge Summary

| Category             | Count      | Notes                              |
| -------------------- | ---------- | ---------------------------------- |
| Contact Milestones   | ~1,564     | 51 states x 4 + ~340 countries x 4 |
| Cross-Multiplier     | 7          | Lifetime aspirational              |
| Profile Completion   | 8          | Onboarding-driven                  |
| Challenge Completion | 7          | Meta-progression                   |
| Streak               | 7          | Consistency rewards                |
| Mode                 | 13         | Operating style                    |
| Band                 | 13         | Band exploration                   |
| Distance             | 9          | Geographic reach                   |
| Equipment            | 8          | Station setup                      |
| Time-Based           | 10         | Operating schedule                 |
| Conditions           | 9          | Propagation awareness              |
| Social               | 8          | Community participation            |
| POTA/SOTA            | 9          | External programs                  |
| Special Event        | 8          | Time-limited exclusives            |
| **Total**            | **~1,680** |                                    |

This is intentionally a large number. The vast majority (1,564) are contact milestones that unlock naturally over time. The remaining 116 "curated" badges provide diverse goals across every dimension of the hobby.

---

## 5. Level & XP System

### XP Sources

Every meaningful action in Propulse earns XP. The sources are designed so that no single activity dominates -- an operator who does POTA activations, an operator who chases DX, and an operator who does CW contesting should all progress at comparable rates.

| XP Source                     | Base Amount          | Notes                                                                      |
| ----------------------------- | -------------------- | -------------------------------------------------------------------------- |
| **QSO Logged**                | 5 XP                 | Base XP per QSO (any mode, any band)                                       |
| **New DXCC Entity**           | 50 XP                | First QSO with a new DXCC entity                                           |
| **New US State**              | 25 XP                | First QSO with a new US state                                              |
| **New CQ Zone**               | 30 XP                | First QSO in a new CQ zone (1-40)                                          |
| **New ITU Zone**              | 30 XP                | First QSO in a new ITU zone (1-90)                                         |
| **Badge Earned**              | (badge-specific)     | See badge tables above                                                     |
| **Challenge Completed**       | (challenge-specific) | See Section 6                                                              |
| **Streak Day**                | 10 XP                | Each consecutive day on air (compounds: day N earns 10 + floor(N/7) bonus) |
| **Profile Section Completed** | 5-25 XP              | Completing profile fields (one-time per field)                             |
| **Equipment Documented**      | 10 XP                | Adding a radio, antenna, or accessory to Shack Builder (one-time per item) |
| **Friend Added**              | 5 XP                 | Following another operator (max 50 XP from follows)                        |
| **Achievement Shared**        | 5 XP                 | Sharing a badge or milestone to social media (max 25 XP from sharing)      |
| **Distance Bonus**            | 1 XP / 1,000 km      | Additional XP based on QSO distance (floor(distance_km / 1000))            |
| **Condition Multiplier**      | 1.5x - 3.0x          | Applied to QSO base XP when conditions are adverse (see Section 7)         |

### Level Progression

30 levels grouped into 6 tiers of 5 levels each. XP requirements follow a modified quadratic curve that starts accessible and becomes increasingly demanding.

**XP Formula:** `required_xp(level) = 100 * level^1.8`

This produces a curve where early levels come quickly (encouraging retention) and later levels represent genuine long-term commitment.

| Level | Title                | Tier        | Cumulative XP Required | Incremental XP |
| ----- | -------------------- | ----------- | ---------------------- | -------------- |
| 1     | Frequency Scout      | Foundation  | 0 (start)              | --             |
| 2     | Signal Listener      | Foundation  | 349                    | 349            |
| 3     | Repeater Operator    | Foundation  | 913                    | 564            |
| 4     | Band Explorer        | Foundation  | 1,684                  | 771            |
| 5     | General Operator     | Foundation  | 2,639                  | 955            |
| 6     | Casual DXer          | Operator    | 3,762                  | 1,123          |
| 7     | Net Participant      | Operator    | 5,038                  | 1,276          |
| 8     | POTA Hunter          | Operator    | 6,455                  | 1,417          |
| 9     | Digital Specialist   | Operator    | 8,002                  | 1,547          |
| 10    | Contest Entrant      | Operator    | 9,672                  | 1,670          |
| 11    | DX Chaser            | Experienced | 11,458                 | 1,786          |
| 12    | Contest Operator     | Experienced | 13,353                 | 1,895          |
| 13    | Propagation Analyst  | Experienced | 15,351                 | 1,998          |
| 14    | Multi-Mode Operator  | Experienced | 17,447                 | 2,096          |
| 15    | Award Hunter         | Experienced | 19,636                 | 2,189          |
| 16    | DX Expert            | Advanced    | 21,915                 | 2,279          |
| 17    | Contest Veteran      | Advanced    | 24,278                 | 2,363          |
| 18    | Technical Innovator  | Advanced    | 26,723                 | 2,445          |
| 19    | Elmer Mentor         | Advanced    | 29,246                 | 2,523          |
| 20    | Award Collector      | Advanced    | 31,843                 | 2,597          |
| 21    | DX Master            | Master      | 34,512                 | 2,669          |
| 22    | Contest Champion     | Master      | 37,249                 | 2,737          |
| 23    | Propagation Master   | Master      | 40,052                 | 2,803          |
| 24    | Community Leader     | Master      | 42,918                 | 2,866          |
| 25    | Station Commander    | Master      | 45,844                 | 2,926          |
| 26    | Radio Ambassador     | Legend      | 48,830                 | 2,986          |
| 27    | Spectrum Guardian    | Legend      | 51,872                 | 3,042          |
| 28    | Ionosphere Whisperer | Legend      | 54,969                 | 3,097          |
| 29    | DX Legend            | Legend      | 58,119                 | 3,150          |
| 30    | Propulse Pioneer     | Legend      | 61,321                 | 3,202          |

**Level-up experience:**

- Toast notification: "Level Up! You are now Level 12: Contest Operator"
- Badge display updates with new level indicator
- Celebration animation: level number rises from the center of the screen with a burst of particles in the tier's color scheme
- Activity feed entry: "Reached Level 12: Contest Operator"
- Level-up earns bonus XP: `level * 50` (e.g., reaching level 12 earns 600 bonus XP)

### XP Transparency

The operator can view a complete XP ledger showing every XP event:

```
Date       | Source              | Amount  | Details
-----------+---------------------+---------+------------------------------------------
2026-02-07 | QSO Logged          | 5 XP    | W1AW on 20m CW
2026-02-07 | Distance Bonus      | 3 XP    | 3,240 km
2026-02-07 | Condition Multiplier| +8 XP   | 1.5x (K=5 storm conditions)
2026-02-07 | New DXCC Entity     | 50 XP   | #245 Falkland Islands
2026-02-07 | Badge: Storm Chaser | 300 XP  | 10th QSO with K >= 5
2026-02-07 | Streak Day          | 14 XP   | Day 31 (10 + 4 weekly bonus)
```

---

## 6. Dynamic Challenge Engine

### Core Concept

The Dynamic Challenge Engine is the beating heart of the gamification system. Unlike static achievements that reward lifetime accumulation, challenges create _urgency_. They have deadlines. They react to what the ionosphere is doing right now. They make every operating session feel like an event.

The key innovation: **challenges are auto-generated based on current propagation conditions**. No human configures them. The engine reads SFI, K-index, band conditions, time of year, and day of week, then selects from a template library and parameterizes challenges to match.

### Challenge Architecture

```typescript
interface ChallengeTemplate {
  /** Template identifier */
  templateId: string;
  /** Display name (may be parameterized: "10m Sprint" vs "15m Sprint") */
  nameTemplate: string;
  /** Description template with placeholders */
  descriptionTemplate: string;
  /** Category for grouping */
  category: ChallengeCategory;
  /** Cadence this template can be used for */
  allowedCadences: ChallengeCadence[];
  /** Condition requirements for this template to be eligible */
  conditionRequirements: ConditionRequirement;
  /** Objectives that must be completed */
  objectives: ChallengeObjective[];
  /** Base XP reward */
  baseXpReward: number;
  /** Multiplier applied based on difficulty (condition-derived) */
  difficultyMultiplier: number;
  /** Icon identifier */
  icon: string;
}

type ChallengeCategory =
  | "condition-adaptive" // React to current propagation
  | "distance" // Geographic reach
  | "geography" // Island, mountain, coastal
  | "band-mode" // Specific band or mode
  | "social"; // Community interaction

type ChallengeCadence =
  | "daily" // 24-hour window (00:00 - 23:59 UTC)
  | "weekend" // Friday 00:00 - Sunday 23:59 UTC
  | "weekly"; // Monday 00:00 - Sunday 23:59 UTC

interface ChallengeObjective {
  /** What to measure */
  metric:
    | "qso_count"
    | "unique_entities"
    | "unique_bands"
    | "unique_modes"
    | "cumulative_distance_km"
    | "unique_continents"
    | "unique_states"
    | "unique_parks"
    | "unique_summits"
    | "qsos_on_band"
    | "qsos_in_mode"
    | "qsos_during_window"
    | "max_single_distance";
  /** Target value */
  target: number;
  /** Optional filter (e.g., band = '10m', mode = 'CW') */
  filter?: Record<string, string>;
  /** Description for the UI */
  label: string;
}

interface ConditionRequirement {
  /** SFI range for template eligibility (null = any) */
  sfiRange?: { min?: number; max?: number };
  /** K-index range */
  kpRange?: { min?: number; max?: number };
  /** Required band condition for a specific band */
  bandCondition?: { band: string; condition: BandCondition };
  /** Day of week (0 = Sunday, 6 = Saturday) */
  dayOfWeek?: number[];
  /** Season (month ranges) */
  season?: "spring" | "summer" | "autumn" | "winter";
}
```

### Challenge Generation Algorithm

The `generate-daily-challenges` Edge Function runs at 00:00 UTC and executes the following algorithm:

```
1. FETCH current solar conditions:
   - SFI from /api/solar/flux
   - K-index from /api/solar/k-index
   - Band conditions from propagation engine (BandStatus[] for all bands)

2. COMPUTE condition profile:
   - hf_quality = map SFI + Kp to overall HF quality score (0-100)
   - open_bands = bands where dayCondition == "Good" or "Excellent"
   - closed_bands = bands where dayCondition == "Poor"
   - unexpected_openings = bands in open_bands that are historically rare
     (e.g., 10m open when SFI < 100 = unexpected)
   - storm_active = Kp >= 5
   - solar_max = SFI > 150

3. SELECT challenge templates:
   a. Always include 1 "condition-adaptive" challenge:
      - If storm_active: select "Storm Chaser" template
      - If unexpected_openings not empty: select "Band Sprint" template,
        parameterize with unexpected band
      - If solar_max: select "Solar Maximum" template
      - If hf_quality < 30: select "Dead Band Revival" or "Adversity Award"
      - If greyline window within 4 hours: select "Greyline Gold"
      - Default: select "Band Explorer" (contacts on N different bands)

   b. Include 1 "variety" challenge (rotate through categories):
      - Monday: distance challenge ("Around the World")
      - Tuesday: mode challenge ("CW Day" or "Digital Explorer")
      - Wednesday: social challenge ("New Friend Wednesday")
      - Thursday: band challenge (parameterized to best current band)
      - Friday: geography challenge (start of weekend event)
      - Saturday: island/POTA challenge ("Island Hopper" or "Park Sprint")
      - Sunday: streak/endurance challenge ("Sunday Marathon")

   c. Optionally include 1 "micro-challenge" (quick, completable in 1-2 hours):
      - "Quick Five" -- 5 QSOs in 60 minutes
      - "Tri-Band" -- contact 3 different bands in 1 hour
      - "Mode Switch" -- QSOs in 2 different modes in 30 minutes

4. PARAMETERIZE selected templates:
   - Replace {band} placeholders with actual band names
   - Adjust difficulty targets based on conditions:
     - Storm active: reduce QSO count targets by 30% (harder to make contacts)
     - Solar max: increase distance targets by 20% (propagation supports it)
     - Poor conditions: reduce targets by 50%, increase XP multiplier by 2x
   - Set time windows (daily = 24h, weekend = 72h, weekly = 168h)

5. PERSIST challenges to `challenges` table
6. NOTIFY connected clients via Supabase Realtime subscription
```

### Challenge Templates Library

#### Condition-Adaptive Challenges

| Template            | Trigger Condition                | Objectives                                                                  | Base XP | Difficulty Range                          |
| ------------------- | -------------------------------- | --------------------------------------------------------------------------- | ------- | ----------------------------------------- |
| Storm Chaser        | K-index >= 5                     | Make {5-15} QSOs while K >= 5                                               | 200     | Adapts to K severity                      |
| Solar Maximum       | SFI > 150                        | Make {10-30} QSOs, at least {3-5} on 10m or 15m                             | 150     | Adapts to SFI level                       |
| Dead Band Revival   | Any band "Poor" condition        | Make {3-10} QSOs on a "Poor" band                                           | 250     | Fewer QSOs required = harder band         |
| Band Sprint         | Unexpected band opening detected | Make {10-25} QSOs on {band} within {4-8} hours                              | 200     | Shorter window for rarer openings         |
| Greyline Gold       | Greyline window approaching      | Make {3-10} QSOs during greyline window (30 min pre/post sunrise or sunset) | 175     | Based on window duration                  |
| Adversity Award     | Overall HF quality < 30          | Make any {5-15} QSOs under poor conditions                                  | 300     | Inverse scale: worse conditions = more XP |
| Quiet Sun Challenge | SFI < 80                         | Make {5-20} QSOs on 40m or 80m (reliable low-band propagation)              | 125     | Adapts to SFI depth                       |

#### Distance Challenges

| Template          | Cadence | Objectives                                     | Base XP |
| ----------------- | ------- | ---------------------------------------------- | ------- |
| Around the World  | Weekly  | Accumulate {40,075} km total QSO distance      | 500     |
| Antipodal Reach   | Weekly  | Make a single QSO over {16,000} km             | 300     |
| Continental Sweep | Daily   | Contact stations on {4-6} different continents | 400     |
| Long Haul Day     | Daily   | Make {3-5} QSOs each over {5,000} km           | 200     |
| Distance Record   | Weekly  | Beat your personal single-QSO distance record  | 250     |

#### Island & Geography Challenges

| Template             | Cadence | Objectives                                                | Base XP |
| -------------------- | ------- | --------------------------------------------------------- | ------- |
| Island Hopper        | Weekend | Make {5-15} QSOs with island DXCC entities (IOTA)         | 300     |
| Mountain Radio       | Weekend | Make {3-10} QSOs from/to SOTA locations                   | 250     |
| Coastal Run          | Weekend | Make {5-10} QSOs with coastal entities                    | 200     |
| State Sampler        | Weekly  | Contact stations in {5-10} different US states            | 200     |
| Continental Explorer | Weekly  | Contact {3-5} new DXCC entities you haven't worked before | 300     |

#### Band & Mode Challenges

| Template      | Cadence | Objectives                                                               | Base XP |
| ------------- | ------- | ------------------------------------------------------------------------ | ------- |
| Band Explorer | Daily   | Make QSOs on {3-5} different bands                                       | 100     |
| {Band} Sprint | Daily   | Make {10-25} QSOs on a specific band (auto-selected based on conditions) | 150     |
| CW Weekend    | Weekend | Make {20-50} CW QSOs                                                     | 200     |
| Digital Day   | Daily   | Make {10-20} QSOs using digital modes (FT8/FT4/JS8/RTTY/PSK)             | 125     |
| SSB Marathon  | Weekend | Make {30-75} SSB QSOs                                                    | 175     |
| Mode Mixer    | Daily   | Make QSOs in {3-4} different modes in one day                            | 150     |
| WARC Warrior  | Weekly  | Make {10-20} QSOs on WARC bands (30m, 17m, 12m)                          | 200     |

#### Social Challenges

| Template          | Cadence                | Objectives                                                                   | Base XP |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------- | ------- |
| New Friend Friday | Weekly (starts Friday) | Work {3-5} callsigns you've never worked before                              | 100     |
| Elmer Hour        | Daily                  | Help a newcomer on air (self-reported, honor system via checkbox)            | 75      |
| Net Night         | Weekly                 | Check into {2-3} nets this week (self-reported)                              | 100     |
| Ragchew Day       | Daily                  | Make {3-5} QSOs with notes field filled in (indicates extended conversation) | 75      |
| Welcome Wagon     | Weekly                 | Be the first to log a QSO with {1-3} operators who are new to Propulse       | 150     |

### Challenge Lifecycle

```
[Generated] --> [Active] --> [In Progress] --> [Completed] or [Expired]
                                |
                                +--> [Abandoned] (user opts out)
```

1. **Generated:** Edge Function creates challenge, persists to DB, pushes via Realtime
2. **Active:** Challenge appears on user's dashboard with countdown timer
3. **In Progress:** User has made at least one QSO that counts toward an objective
4. **Completed:** All objectives met before deadline. XP awarded, badge progress updated, celebration animation
5. **Expired:** Deadline passed without completion. No penalty. Challenge moves to history with partial progress recorded
6. **Abandoned:** User manually dismisses the challenge. No penalty. Recorded for analytics

### Challenge Display

Active challenges appear as cards with:

- Challenge name and icon
- Category label and cadence badge (Daily / Weekend / Weekly)
- Objective checklist with progress bars
- Countdown timer (prominent, updates every minute)
- Current XP reward (base + any active multipliers)
- Condition indicator (current SFI, K-index, relevant band conditions)

---

## 7. Multiplier System

### Overview

Multipliers increase the XP earned from QSOs and challenge completions. They reward operating under difficult conditions, reaching distant stations, and participating in special events. Multipliers stack multiplicatively.

### Distance Multiplier

Applied to every QSO based on great-circle distance:

| Distance           | Multiplier | Rationale                       |
| ------------------ | ---------- | ------------------------------- |
| < 500 km           | 1.0x       | Local/regional contacts         |
| 500 - 2,000 km     | 1.2x       | Moderate distance               |
| 2,000 - 5,000 km   | 1.5x       | Significant distance            |
| 5,000 - 10,000 km  | 2.0x       | Long-haul DX                    |
| 10,000 - 15,000 km | 2.5x       | Intercontinental DX             |
| 15,000 - 18,000 km | 3.0x       | Near-antipodal                  |
| > 18,000 km        | 4.0x       | Antipodal (other side of Earth) |

### Condition Multiplier

Applied to QSO base XP when solar/geomagnetic conditions make contacts harder:

| Condition                                                  | Multiplier | Detection                                 |
| ---------------------------------------------------------- | ---------- | ----------------------------------------- |
| K-index 5-6                                                | 1.5x       | Read from `solarStore.kp` at QSO log time |
| K-index 7-8                                                | 2.5x       | Same                                      |
| K-index 9                                                  | 4.0x       | Same (extreme storm, very rare)           |
| SFI < 80 (solar minimum)                                   | 1.3x       | Read from `solarStore.sfi`                |
| SFI < 70 (deep minimum)                                    | 1.5x       | Same                                      |
| Band rated "Poor" and QSO on that band                     | 2.0x       | Cross-reference `BandStatus.dayCondition` |
| Band rated "Poor" and QSO distance > 5,000 km on that band | 3.0x       | Compound: poor band + long distance       |

### Time Multiplier

| Condition                                           | Multiplier | Detection                             |
| --------------------------------------------------- | ---------- | ------------------------------------- |
| Greyline window (30 min pre/post sunrise or sunset) | 1.3x       | Computed from operator QTH + `sun.ts` |
| Midnight operating (00:00-04:00 local)              | 1.2x       | Operator timezone from `profileStore` |
| Marathon session (4+ consecutive hours on air)      | 1.1x       | Computed from QSO timestamps          |

### Island Multiplier

Applied during Island Hopper weekend challenges:

| Condition                                                  | Multiplier | Detection                                   |
| ---------------------------------------------------------- | ---------- | ------------------------------------------- |
| QSO with IOTA island entity during Island Hopper challenge | 2.0x       | DXCC entity cross-referenced with IOTA list |
| QSO with rare IOTA entity (< 100 activations worldwide)    | 3.0x       | Rarity data from IOTA reference             |

### Special Event Multiplier

| Condition                          | Multiplier                          | Window                           |
| ---------------------------------- | ----------------------------------- | -------------------------------- |
| Propulse Anniversary event         | 2.0x all XP                         | 48 hours around anniversary date |
| World Amateur Radio Day (April 18) | 1.5x all XP                         | 24 hours                         |
| Solar eclipse event                | 3.0x for QSOs during eclipse window | Duration of eclipse              |
| Friday the 13th                    | 1.3x all XP                         | 24 hours                         |

### Multiplier Stacking

Multipliers stack **multiplicatively**, not additively. Example:

- Base QSO XP: 5
- Distance multiplier (8,000 km): 2.0x
- Condition multiplier (K = 6): 1.5x
- Island Hopper weekend: 2.0x
- **Total: 5 _ 2.0 _ 1.5 \* 2.0 = 30 XP** for a single QSO

Maximum theoretical multiplier cap: **10.0x** (prevents extreme outliers from distorting leaderboards). If stacked multipliers exceed 10.0x, they are capped at 10.0x.

### Multiplier Transparency

Active multipliers are displayed in a "Multiplier Stack" widget:

```
+-----------------------------------+
|  ACTIVE MULTIPLIERS               |
|                                   |
|  [2.0x] Distance > 5,000 km      |
|  [1.5x] Storm (K=5)              |
|  [2.0x] Island Hopper Weekend    |
|                                   |
|  Combined: 6.0x                   |
|  Next QSO base: 5 XP -> 30 XP    |
+-----------------------------------+
```

---

## 8. Leaderboards

### Philosophy

Leaderboards are **opt-in, seasonal, and multi-category**. They exist to foster friendly competition and community connection, not to create a pressure-driven grind. Operators who prefer solo progression can completely ignore leaderboards with no impact on their badges, XP, or challenges.

### Leaderboard Categories

| Category             | Metric                                 | Reset              | Description                      |
| -------------------- | -------------------------------------- | ------------------ | -------------------------------- |
| XP Earned            | Total XP earned during season          | Monthly            | Overall activity and achievement |
| QSOs Logged          | Total QSOs during season               | Monthly            | Raw operating volume             |
| DX Distance          | Cumulative QSO distance (km)           | Monthly            | Geographic reach                 |
| Challenges Completed | Challenges finished during season      | Monthly            | Challenge engagement             |
| New Entities         | New DXCC entities worked during season | Monthly            | DX hunting                       |
| Badges Earned        | New badges unlocked during season      | Monthly            | Achievement variety              |
| Streak Length        | Current consecutive days on air        | Ongoing (no reset) | Consistency                      |
| Storm Operator       | QSOs while K >= 5 during season        | Monthly            | Adversity operating              |

### Season Structure

- Each season = 1 calendar month
- Seasons start at 00:00 UTC on the 1st of each month
- At season end:
  - Final standings are archived
  - Top 3 in each category earn a "Season Champion" badge for that month (Bronze/Silver/Gold for 3rd/2nd/1st)
  - All participants' positions are recorded in their profile
- A running "All-Time" leaderboard tracks lifetime totals (never resets)

### Privacy Controls

| Setting                     | Options                                           | Default   |
| --------------------------- | ------------------------------------------------- | --------- |
| Leaderboard participation   | Opted in / Opted out                              | Opted out |
| Display name on leaderboard | Callsign / Operator name / Anonymous ("Op #XXXX") | Callsign  |
| Visible stats               | All / XP only / None                              | All       |

Operators who opt out are completely invisible on leaderboards. Their data is never included in rankings.

### Leaderboard Display

```
+----------------------------------------------------------+
|  MONTHLY LEADERBOARD: February 2026                       |
|  Category: [XP Earned v]   Season ends in: 21d 14h 32m  |
+----------------------------------------------------------+
|  #  | Operator     | Level | XP This Month | Trend       |
+-----+--------------+-------+---------------+-------------+
|  1  | W1AW         | 24    | 12,450 XP     | +3 (up)     |
|  2  | N5XX         | 19    | 11,200 XP     | -- (same)   |
|  3  | VK3ABC       | 22    | 10,875 XP     | -1 (down)   |
|  ... |             |       |               |             |
|  47 | [YOU] K5DEF  | 14    | 3,240 XP      | +5 (up)     |
+----------------------------------------------------------+
|  Your rank: #47 of 1,234 participants                     |
|  Top 10%: Need 8,100 XP (+4,860 more)                   |
+----------------------------------------------------------+
```

---

## 9. Data Model

### Supabase Tables

#### `achievements` (extends existing)

The existing `achievements` table (already in `supabase.ts`) is the primary badge storage. We extend it with additional fields:

```sql
CREATE TABLE achievements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id    TEXT NOT NULL,           -- e.g., 'contact-milestone-tx-100'
  tier        TEXT NOT NULL DEFAULT 'bronze',
  progress    NUMERIC NOT NULL DEFAULT 0,  -- 0.0 to 1.0
  earned_at   TIMESTAMPTZ,             -- null if not yet earned
  xp_awarded  INTEGER NOT NULL DEFAULT 0,
  metadata    JSONB DEFAULT '{}',      -- badge-specific data (e.g., state, country, distance)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, badge_id)
);

-- RLS: users can only read/write their own achievements
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own achievements"
  ON achievements FOR ALL
  USING (auth.uid() = user_id);
```

#### `contact_milestones` (new)

Per-state and per-country contact count tracking.

```sql
CREATE TABLE contact_milestones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category       TEXT NOT NULL CHECK (category IN ('state', 'country')),
  entity_key     TEXT NOT NULL,          -- State abbrev ('TX') or DXCC entity ID ('291')
  entity_name    TEXT NOT NULL,          -- 'Texas' or 'United States'
  contact_count  INTEGER NOT NULL DEFAULT 0,
  current_tier   SMALLINT NOT NULL DEFAULT 0,  -- 0-4
  first_contact  TIMESTAMPTZ,
  last_contact   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, category, entity_key)
);

CREATE INDEX idx_milestones_user_category
  ON contact_milestones(user_id, category);

ALTER TABLE contact_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own milestones"
  ON contact_milestones FOR ALL
  USING (auth.uid() = user_id);
```

#### `xp_ledger` (new)

Append-only ledger of every XP event for transparency and auditability.

```sql
CREATE TABLE xp_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,             -- 'qso', 'badge', 'challenge', 'streak', 'milestone', 'level_up', 'profile', 'equipment'
  amount      INTEGER NOT NULL,          -- XP amount (positive)
  multiplier  NUMERIC DEFAULT 1.0,       -- combined multiplier applied
  reference_id TEXT,                     -- QSO ID, badge ID, challenge ID, etc.
  description TEXT,                      -- Human-readable description
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- No updated_at: ledger entries are immutable
  CONSTRAINT positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_xp_user_created
  ON xp_ledger(user_id, created_at DESC);

ALTER TABLE xp_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own XP ledger"
  ON xp_ledger FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own XP"
  ON xp_ledger FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

#### `challenges` (new)

Server-generated challenges.

```sql
CREATE TABLE challenges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL,
  cadence         TEXT NOT NULL CHECK (cadence IN ('daily', 'weekend', 'weekly')),
  objectives      JSONB NOT NULL,          -- ChallengeObjective[]
  xp_reward       INTEGER NOT NULL,
  multiplier_info JSONB DEFAULT '{}',      -- active multipliers at generation time
  conditions_snapshot JSONB DEFAULT '{}',  -- SFI, Kp, band conditions at generation
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Challenges are global (same for all users), so no user_id
-- RLS: all authenticated users can read challenges
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read challenges"
  ON challenges FOR SELECT
  USING (auth.role() = 'authenticated');
```

#### `challenge_progress` (new)

Per-user progress on active challenges.

```sql
CREATE TABLE challenge_progress (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  challenge_id   UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'in_progress', 'completed', 'expired', 'abandoned')),
  objective_progress JSONB NOT NULL DEFAULT '[]',  -- [{objective_index, current, target}]
  completed_at   TIMESTAMPTZ,
  xp_awarded     INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, challenge_id)
);

ALTER TABLE challenge_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own challenge progress"
  ON challenge_progress FOR ALL
  USING (auth.uid() = user_id);
```

#### `leaderboard_entries` (new)

Denormalized leaderboard entries for fast reads.

```sql
CREATE TABLE leaderboard_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season      TEXT NOT NULL,             -- 'all-time' or '2026-02'
  category    TEXT NOT NULL,             -- 'xp', 'qsos', 'distance', etc.
  value       BIGINT NOT NULL DEFAULT 0,
  rank        INTEGER,                   -- computed by service role
  is_public   BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, season, category)
);

CREATE INDEX idx_leaderboard_season_category_rank
  ON leaderboard_entries(season, category, rank);

ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read public or own entries"
  ON leaderboard_entries FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Users manage own entries"
  ON leaderboard_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own entries"
  ON leaderboard_entries FOR UPDATE
  USING (auth.uid() = user_id);
```

#### `user_streaks` (new)

Tracks the operator's current and longest streaks.

```sql
CREATE TABLE user_streaks (
  user_id         UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,                -- last UTC date with a QSO
  streak_start_date DATE,               -- when the current streak began
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own streaks"
  ON user_streaks FOR ALL
  USING (auth.uid() = user_id);
```

#### `user_gamification` (new)

Denormalized summary of user's gamification state for fast profile rendering.

```sql
CREATE TABLE user_gamification (
  user_id         UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_xp        BIGINT NOT NULL DEFAULT 0,
  current_level   SMALLINT NOT NULL DEFAULT 1,
  level_title     TEXT NOT NULL DEFAULT 'Frequency Scout',
  badges_earned   INTEGER NOT NULL DEFAULT 0,
  challenges_completed INTEGER NOT NULL DEFAULT 0,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  total_qsos      INTEGER NOT NULL DEFAULT 0,
  total_distance_km BIGINT NOT NULL DEFAULT 0,
  states_worked   SMALLINT NOT NULL DEFAULT 0,
  countries_worked SMALLINT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_gamification ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gamification"
  ON user_gamification FOR ALL
  USING (auth.uid() = user_id);
-- Public read for leaderboard display
CREATE POLICY "Public read gamification summary"
  ON user_gamification FOR SELECT
  USING (true);
```

### Entity Relationship Diagram

```
profiles (1) --< (many) achievements
profiles (1) --< (many) contact_milestones
profiles (1) --< (many) xp_ledger
profiles (1) --< (many) challenge_progress
profiles (1) --< (many) leaderboard_entries
profiles (1) --- (1)    user_streaks
profiles (1) --- (1)    user_gamification

challenges (1) --< (many) challenge_progress
```

---

## 10. Integration Points

### 10.1 Logbook Integration (Primary Data Source)

The logbook is the primary source of truth for the gamification engine. Every QSO logged, imported, edited, or deleted triggers a gamification re-evaluation.

**Event sources:**

- `logEntries` in IndexedDB (current local storage)
- `log_entries` in Supabase (after cloud sync migration)
- ADIF import (bulk QSO import)
- Contest QSO logging (`contest_qsos` table)

**Required LogEntry enrichments (new fields or computed at evaluation time):**

| Field            | Source                                             | Purpose                             |
| ---------------- | -------------------------------------------------- | ----------------------------------- |
| `state`          | ADIF field / QTH parsing / callsign prefix         | US state for WAS/milestone tracking |
| `dxcc_entity`    | `lookupEntity(callsign)`                           | DXCC entity for country milestones  |
| `distance_km`    | Great-circle from operator QTH to contact grid     | Distance badges/multipliers         |
| `continent`      | Derived from DXCC entity                           | Continental Sweep challenges        |
| `is_greyline`    | `greyline.ts` computation at QSO time              | Time-based badges                   |
| `solar_sfi`      | `solarStore.sfi` at QSO log time                   | Condition badges/multipliers        |
| `solar_kp`       | `solarStore.kp` at QSO log time                    | Condition badges/multipliers        |
| `band_condition` | `BandStatus.dayCondition` for QSO band at log time | Condition badges                    |

**Implementation note:** These enrichments are computed client-side at QSO log time and stored as part of the gamification event, not added to the LogEntry schema itself. This preserves ADIF compatibility and keeps the log clean.

### 10.2 Propagation Engine Integration

The gamification engine is a _consumer_ of Propulse's existing propagation engine. It reads but never writes propagation data.

**Data consumed:**

- `SolarIndices` from `solarStore`: SFI, Kp, SSN, A-index
- `BandStatus[]` from band conditions computation: per-band day/night conditions
- `PropagationPath` from path analysis: distance, bearing, hops
- Greyline windows from `greyline.ts`: sunrise/sunset times at operator QTH
- `FrequencyLimits` from MUF calculations: determines if a band is theoretically "open"

**Integration pattern:** The `useConditionMonitor` hook subscribes to `solarStore` via Zustand's `subscribe` API. When SFI or Kp changes significantly (SFI change > 10 or Kp change >= 2), it re-evaluates condition-adaptive challenge eligibility and updates the multiplier display.

### 10.3 Profile Integration

The Profile page is the primary _display surface_ for gamification data.

**Profile page consumes:**

- `user_gamification` summary: level, title, XP, badge count (displayed on profile card)
- `achievements[]`: earned badges (displayed on Awards/Achievements tab)
- `contact_milestones[]`: per-state/per-country progress (displayed as interactive maps)
- `challenge_progress[]`: active challenge cards (displayed on profile dashboard)
- `user_streaks`: current/longest streak (displayed on stats tab)
- `xp_ledger[]`: recent XP events (displayed on activity feed)

**Profile page writes:**

- Profile completion badges trigger when profile fields are filled in

### 10.4 Shack Builder Integration

The Shack Builder provides data for Equipment badges.

**Data consumed from `shackStore`:**

- `radios[]`: radio equipment for Homebrew Engineer, Vintage Operator badges
- `antennas[]`: antenna type for Wire Antenna Warrior badge
- `presets[]`: station presets for Station Architect, Full Signal Chain badges
- `preset.operatingPowerWatts`: power level for QRP Hero/Master badges

**Integration pattern:** `badgeEvaluator.ts` reads from `shackStore` when evaluating equipment-category badges. No writes to shack data.

### 10.5 Activity Feed Integration

The existing `activity_feed` table in Supabase records gamification events for social display.

**Events written to activity feed:**

- Badge earned: `{ event_type: 'badge_earned', event_data: { badge_id, badge_name, tier, xp } }`
- Level up: `{ event_type: 'level_up', event_data: { new_level, title, total_xp } }`
- Challenge completed: `{ event_type: 'challenge_completed', event_data: { challenge_name, xp, time_remaining } }`
- Milestone reached: `{ event_type: 'milestone_reached', event_data: { category, entity, tier, count } }`
- Streak milestone: `{ event_type: 'streak_milestone', event_data: { days, badge_name } }`
- Cross-multiplier badge: `{ event_type: 'power_badge', event_data: { badge_name, tier } }`

---

## 11. Anti-Gaming Measures

### Problem Statement

Any gamification system with public leaderboards and achievement tracking is susceptible to gaming. In ham radio specifically, the risks include:

1. **Duplicate QSO flooding:** Logging the same QSO hundreds of times to inflate counts
2. **Self-spotting farms:** Creating fake QSOs with non-existent callsigns
3. **ADIF fabrication:** Importing fabricated ADIF files with thousands of fake contacts
4. **Clock manipulation:** Backdating QSOs to retroactively complete time-sensitive challenges
5. **Multi-account exploitation:** Creating multiple accounts to appear on leaderboards

### Mitigation Strategies

#### 11.1 Duplicate Detection

```typescript
interface DuplicateCheck {
  // A QSO is a duplicate if same callsign + band + mode within 10 minutes
  deduplicationWindow: 10; // minutes
  // Fields that define uniqueness
  uniqueKey: ["callsign", "band", "mode", "date"];
  // Action on duplicate: count only once for gamification, still log in logbook
  action: "skip_gamification_only";
}
```

- QSOs that match an existing entry on `callsign + band + mode` within 10 minutes of each other earn XP only once
- The logbook still records duplicates (some operators want them for contest logging or QSL purposes)
- Duplicate detection runs client-side for instant feedback and server-side for validation

#### 11.2 Rate Limiting

| Metric                    | Limit  | Window         | Action                                   |
| ------------------------- | ------ | -------------- | ---------------------------------------- |
| QSOs per hour             | 120    | Rolling 1 hour | Excess QSOs logged but earn no XP        |
| QSOs per day              | 500    | UTC day        | Warning at 400, no XP above 500          |
| Unique callsigns per hour | 100    | Rolling 1 hour | Excess earn no XP                        |
| ADIF imports per day      | 5      | UTC day        | Hard limit, additional imports rejected  |
| XP earned per day         | 10,000 | UTC day        | Soft cap: XP above 10K earns at 10% rate |

Rate limits are generous enough to accommodate legitimate contest operating (a good contest operator might log 100+ QSOs per hour). The XP daily soft cap prevents a single massive ADIF import from catapulting someone to level 30.

#### 11.3 Callsign Validation

- QSOs with callsigns matching impossible patterns (e.g., all numeric, single character) earn no gamification credit
- QSOs with the operator's own callsign earn no credit (self-contacts)
- Optional: cross-reference callsigns against known callsign databases (HamQTH, callook.info) for validation. QSOs with verified callsigns could earn a small bonus

#### 11.4 ADIF Import Throttling

- ADIF imports are rate-limited to 5 per day, max 10,000 QSOs per import
- Imported QSOs earn XP at a reduced rate (50% of normal) to prevent ADIF file sharing as an XP exploit
- Retroactive badge evaluation for imported QSOs runs asynchronously (no instant gratification for bulk imports)
- Solar condition snapshots for imported QSOs use historical data (not current conditions), preventing "import during storm" exploits

#### 11.5 Statistical Anomaly Detection (Future Enhancement)

For leaderboard integrity, a background process can flag accounts with suspicious patterns:

- QSO rate consistently at or near rate limits
- Unusually high percentage of QSOs with the same small set of callsigns
- Distance distribution that doesn't match known propagation patterns
- XP accumulation rate significantly above the 99th percentile

Flagged accounts are reviewed by an admin. No automatic penalties -- false positives are worse than letting a few gamers through.

---

## 12. Retroactive Computation

### Problem Statement

When the gamification engine launches, existing Propulse users will have thousands of QSOs in their logbooks. These operators should receive credit for their existing accomplishments. An operator who has already worked 200 DXCC entities should not start at level 1 with zero badges.

### Retroactive Badge Pipeline

The `compute-retroactive-badges` Edge Function (or client-side worker for offline-first) processes an operator's entire QSO history and awards all applicable badges.

**Pipeline steps:**

1. **Load QSO history:** Read all `log_entries` for the user (from IndexedDB or Supabase)

2. **Enrich QSOs:** For each QSO, compute:
   - DXCC entity (from callsign prefix)
   - US state (from state field, QTH, or callsign)
   - Distance (from operator QTH to contact grid, if grid available)
   - Mode category (CW, SSB, digital)
   - Band
   - Date/time for streak computation

3. **Compute milestones:** Aggregate contact counts per state and per country. Set milestone tiers.

4. **Evaluate all badges:** Run every badge's `evaluate()` function against the computed state.

5. **Compute streaks:** Walk the QSO date sequence to find longest streak and current streak.

6. **Compute XP:** Sum up XP for:
   - All QSOs (5 XP each, subject to daily cap applied retroactively)
   - All earned badges (badge-specific XP)
   - Streak days (10 XP per day, with weekly bonus)
   - New entities/states (one-time bonuses)
   - **Note:** Retroactive XP does NOT include condition multipliers or distance multipliers (historical solar data is imprecise, and many old QSOs lack grid locators for distance)

7. **Compute level:** Map total XP to level using the progression table.

8. **Persist results:** Write to `achievements`, `contact_milestones`, `xp_ledger`, `user_gamification`, `user_streaks`

9. **Notify user:** On next login, show a "Welcome to Propulse Achievements" modal:
   ```
   +----------------------------------------------+
   |  Welcome to Propulse Achievements!            |
   |                                               |
   |  We analyzed your logbook and you've          |
   |  already earned:                              |
   |                                               |
   |  Level 14: Multi-Mode Operator                |
   |  47 badges unlocked                           |
   |  12,450 XP from 2,340 QSOs                   |
   |  28 DXCC countries at 10+ contacts            |
   |  Longest streak: 23 days                      |
   |                                               |
   |  [View Your Achievements]  [Dismiss]          |
   +----------------------------------------------+
   ```

### Performance Considerations

- For operators with < 5,000 QSOs: run entirely client-side in a Web Worker (< 2 seconds)
- For operators with 5,000 - 50,000 QSOs: run client-side in a Web Worker with progress indicator (< 15 seconds)
- For operators with 50,000+ QSOs: run server-side via Edge Function with async notification (< 60 seconds)
- Retroactive computation runs once per user. Subsequent QSOs trigger incremental evaluation only.

### Historical Solar Data Limitation

Retroactive computation cannot apply condition multipliers (storm bonus, solar max bonus) because we don't have reliable SFI/Kp data for every historical QSO timestamp. This is documented transparently:

> "XP from your historical QSOs is calculated at base rates. Condition and distance multipliers apply to QSOs logged after the gamification engine launch. Your future QSOs will benefit from multipliers based on real-time solar conditions."

---

## 13. UI Components

### 13.1 Components to Build

| Component                 | Location                                                  | Purpose                                                                                         |
| ------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GamificationProvider`    | `src/providers/GamificationProvider.tsx`                  | React context that wraps the app, initializes the gamification engine, subscribes to QSO events |
| `BadgeGrid`               | `src/components/gamification/BadgeGrid.tsx`               | Grid display of earned and unearned badges, filterable by category                              |
| `BadgeCard`               | `src/components/gamification/BadgeCard.tsx`               | Individual badge display with tier border, progress indicator, earned/locked state              |
| `BadgeDetailModal`        | `src/components/gamification/BadgeDetailModal.tsx`        | Full-screen modal showing badge details: criteria, progress, history, share button              |
| `LevelBadge`              | `src/components/gamification/LevelBadge.tsx`              | Compact level indicator (number + title) for profile card and inline use                        |
| `LevelProgress`           | `src/components/gamification/LevelProgress.tsx`           | Progress bar showing XP toward next level                                                       |
| `XPLedgerTable`           | `src/components/gamification/XPLedgerTable.tsx`           | Paginated table of XP events with filtering                                                     |
| `ChallengeCard`           | `src/components/gamification/ChallengeCard.tsx`           | Active challenge with objectives, progress bars, countdown timer                                |
| `ChallengeList`           | `src/components/gamification/ChallengeList.tsx`           | List of active + recent challenges (active first, then completed, then expired)                 |
| `MultiplierStack`         | `src/components/gamification/MultiplierStack.tsx`         | Real-time display of active XP multipliers                                                      |
| `MilestoneMap`            | `src/components/gamification/MilestoneMap.tsx`            | Interactive US map and world map with per-state/per-country milestone coloring                  |
| `MilestoneTable`          | `src/components/gamification/MilestoneTable.tsx`          | Tabular view of milestone progress, sortable/filterable                                         |
| `StreakIndicator`         | `src/components/gamification/StreakIndicator.tsx`         | Current streak display with flame animation for active streaks                                  |
| `LeaderboardTable`        | `src/components/gamification/LeaderboardTable.tsx`        | Leaderboard display with category tabs, season selector, user highlighting                      |
| `AchievementToast`        | `src/components/gamification/AchievementToast.tsx`        | Toast notification for badge earned, level up, challenge complete                               |
| `LevelUpCelebration`      | `src/components/gamification/LevelUpCelebration.tsx`      | Full-screen celebration animation for level-ups                                                 |
| `RetroactiveWelcome`      | `src/components/gamification/RetroactiveWelcome.tsx`      | First-time welcome modal showing retroactively computed achievements                            |
| `CrossMultiplierProgress` | `src/components/gamification/CrossMultiplierProgress.tsx` | Progress display for cross-multiplier power badges (all states, all countries)                  |

### 13.2 Profile Page Integration

The Profile page's Achievements tab (`src/components/profile/AwardsTab.tsx` or new `AchievementsTab.tsx`) becomes the primary gamification surface:

```
+---------------------------------------------------------------+
|  ACHIEVEMENTS TAB                                              |
+---------------------------------------------------------------+
|                                                                |
|  +-------------------+  +----------------------------------+  |
|  | LEVEL 14          |  | XP PROGRESS                      |  |
|  | Multi-Mode        |  | 15,351 / 17,447 XP               |  |
|  | Operator          |  | [=========>-----------] 88%      |  |
|  |                   |  | 2,096 XP to Level 15              |  |
|  | [flame] 23-day    |  |                                   |  |
|  |         streak    |  | Active Multipliers: 1.5x storm   |  |
|  +-------------------+  +----------------------------------+  |
|                                                                |
|  ACTIVE CHALLENGES (2)                                         |
|  +---------------------------+  +---------------------------+ |
|  | Storm Chaser (Daily)      |  | Band Explorer (Weekly)    | |
|  | 7/10 QSOs with K>=5       |  | 4/5 bands contacted      | |
|  | [========>--] 70%         |  | [========>---] 80%        | |
|  | Ends in: 6h 23m           |  | Ends in: 3d 14h          | |
|  | Reward: 200 XP (x1.5)    |  | Reward: 100 XP           | |
|  +---------------------------+  +---------------------------+ |
|                                                                |
|  RECENT BADGES (last 30 days)                                  |
|  [Badge] [Badge] [Badge] [Badge] [Badge] ... [View All]       |
|                                                                |
|  BADGE COLLECTION                                              |
|  [All] [Milestones] [Challenges] [Streaks] [Modes] [More v]   |
|  +-------+-------+-------+-------+-------+-------+-------+   |
|  |       |       |       |       |       |       |       |   |
|  | Badge | Badge | Badge | Badge | Badge | Badge | Badge |   |
|  |       |       |       |       |       |       |       |   |
|  +-------+-------+-------+-------+-------+-------+-------+   |
|  |       |       |       |       |       |       |       |   |
|  | Badge | Badge | Badge | Badge | [locked] [locked] ...  |   |
|  |       |       |       |       |       |       |       |   |
|  +-------+-------+-------+-------+-------+-------+-------+   |
|                                                                |
|  CONTACT MILESTONES                                            |
|  [US States] [DXCC Countries]                                  |
|  +----------------------------------------------------------+ |
|  |  [Interactive US Map / World Map with tier coloring]      | |
|  |  47/50 states at 10+  |  12/50 states at 100+            | |
|  |  Progress to All-State Explorer: 94%                      | |
|  +----------------------------------------------------------+ |
|                                                                |
|  LEADERBOARD PREVIEW                                           |
|  Your rank: #47 of 1,234  |  [View Full Leaderboard]          |
+---------------------------------------------------------------+
```

### 13.3 QSO Logging Integration

When a QSO is logged, the gamification engine evaluates in real-time and surfaces results:

```
+----------------------------------------------+
|  QSO LOGGED: W1AW on 20m CW at 14:32 UTC    |
|                                               |
|  +5 XP (base) + 3 XP (distance 3,240 km)    |
|  x1.5 multiplier (K=5 storm)                |
|  = 12 XP earned                              |
|                                               |
|  [Storm Chaser] 8/10 QSOs -- 2 more!         |
|  [Texas] 99/100 contacts -- 1 more for       |
|          Silver badge!                        |
+----------------------------------------------+
```

This appears as a compact notification below the QSO confirmation, auto-dismissing after 5 seconds.

### 13.4 Celebration Animations

| Event                        | Animation                                                     | Duration | Sound               |
| ---------------------------- | ------------------------------------------------------------- | -------- | ------------------- |
| Badge earned (Bronze/Silver) | Badge icon slides in from right with shimmer                  | 2s       | Subtle chime        |
| Badge earned (Gold+)         | Badge icon expands from center with particle burst            | 3s       | Achievement fanfare |
| Level up                     | Full-screen number rise with tier-colored particle explosion  | 4s       | Level-up jingle     |
| Challenge completed          | Challenge card pulses green, checkmark animation, confetti    | 3s       | Success tone        |
| Cross-multiplier badge       | Full-screen map illumination with power-up glow and lightning | 5s       | Epic orchestral hit |
| Streak milestone (30+)       | Flame animation intensifies, streak counter pulses            | 2s       | Flame whoosh        |

All animations are:

- Interruptible (tap/click to dismiss)
- Respect `prefers-reduced-motion` OS setting (no animation, instant display)
- Have a "mute celebrations" toggle in settings
- GPU-accelerated via CSS transforms (no jank on mobile)

---

## 14. API Endpoints

### 14.1 Gamification State

**GET `/api/gamification/state`**

Returns the user's complete gamification state for initial load.

```json
{
  "level": 14,
  "title": "Multi-Mode Operator",
  "totalXp": 15351,
  "xpToNextLevel": 2096,
  "badgesEarned": 47,
  "currentStreak": 23,
  "longestStreak": 45,
  "challengesCompleted": 12,
  "statesWorked": 47,
  "countriesWorked": 156
}
```

**Rate limit:** 60 requests/minute

### 14.2 Badge Operations

**GET `/api/gamification/badges`**

Returns all earned badges with progress on unearned badges.

Query params:

- `category` (optional): filter by badge category
- `earned_only` (optional): `true` to return only earned badges
- `limit` (optional): pagination limit (default 50)
- `offset` (optional): pagination offset

```json
{
  "badges": [
    {
      "id": "contact-milestone-tx-100",
      "name": "Texas Operator",
      "category": "contact-milestone",
      "tier": "silver",
      "progress": 1.0,
      "earnedAt": "2026-01-15T14:32:00Z",
      "xpAwarded": 100
    },
    {
      "id": "streak-30",
      "name": "Monthly Devotion",
      "category": "streak",
      "tier": "gold",
      "progress": 0.77,
      "earnedAt": null,
      "xpAwarded": 0
    }
  ],
  "total": 1680,
  "earned": 47
}
```

**Rate limit:** 30 requests/minute

### 14.3 Challenge Operations

**GET `/api/gamification/challenges`**

Returns active challenges and recent history.

Query params:

- `status` (optional): `active`, `completed`, `expired`, `all`
- `limit` (optional): default 10

```json
{
  "active": [
    {
      "id": "ch_abc123",
      "name": "Storm Chaser",
      "category": "condition-adaptive",
      "cadence": "daily",
      "objectives": [
        { "label": "QSOs with K >= 5", "current": 7, "target": 10 }
      ],
      "xpReward": 200,
      "activeMultipliers": ["1.5x storm"],
      "startsAt": "2026-02-07T00:00:00Z",
      "endsAt": "2026-02-07T23:59:59Z",
      "status": "in_progress"
    }
  ],
  "history": []
}
```

**Rate limit:** 30 requests/minute

### 14.4 Milestone Operations

**GET `/api/gamification/milestones`**

Returns per-state and per-country milestone progress.

Query params:

- `category`: `state` or `country` (required)
- `min_tier` (optional): minimum tier to return (0-4)

```json
{
  "category": "state",
  "milestones": [
    {
      "entityKey": "TX",
      "entityName": "Texas",
      "contactCount": 342,
      "currentTier": 2,
      "progressToNextTier": 0.342,
      "firstContactAt": "2024-03-15T14:32:00Z",
      "lastContactAt": "2026-02-06T20:15:00Z"
    }
  ],
  "crossMultiplier": {
    "targetTier": 1,
    "entitiesAtTier": 47,
    "totalEntities": 51,
    "percentage": 92.2,
    "remainingEntities": ["AK", "HI", "WY", "ND"]
  }
}
```

**Rate limit:** 30 requests/minute

### 14.5 XP Ledger

**GET `/api/gamification/xp-ledger`**

Returns paginated XP history.

Query params:

- `limit` (optional): default 50, max 200
- `offset` (optional): pagination offset
- `source` (optional): filter by XP source type

```json
{
  "entries": [
    {
      "id": "xp_def456",
      "source": "qso",
      "amount": 12,
      "multiplier": 1.5,
      "referenceId": "qso_xyz789",
      "description": "QSO with W1AW on 20m CW (3,240 km, K=5 storm)",
      "createdAt": "2026-02-07T14:32:00Z"
    }
  ],
  "totalXp": 15351,
  "entriesCount": 3421
}
```

**Rate limit:** 20 requests/minute

### 14.6 Leaderboard

**GET `/api/gamification/leaderboard`**

Returns leaderboard standings.

Query params:

- `category` (required): `xp`, `qsos`, `distance`, `challenges`, `entities`, `badges`, `streak`, `storm`
- `season` (optional): `all-time` or `YYYY-MM` (default: current month)
- `limit` (optional): default 25, max 100
- `around_user` (optional): `true` to center results around the requesting user's rank

```json
{
  "season": "2026-02",
  "category": "xp",
  "entries": [
    {
      "rank": 1,
      "callsign": "W1AW",
      "level": 24,
      "value": 12450,
      "trend": 3
    }
  ],
  "userRank": 47,
  "totalParticipants": 1234
}
```

**Rate limit:** 30 requests/minute

### 14.7 Retroactive Computation

**POST `/api/gamification/compute-retroactive`**

Triggers retroactive badge computation for the authenticated user. Returns immediately with a job ID; results are delivered via Supabase Realtime.

```json
// Request: empty body (uses auth token for user identification)

// Response:
{
  "jobId": "job_ghi012",
  "estimatedDuration": "15s",
  "qsoCount": 8432,
  "status": "processing"
}
```

**Rate limit:** 1 request per user per day

### 14.8 Sync Delta

**POST `/api/gamification/sync`**

Syncs client-side gamification state changes to the server. Used for debounced batch updates.

```json
// Request:
{
  "achievements": [
    {
      "badgeId": "storm-chaser",
      "tier": "gold",
      "progress": 1.0,
      "earnedAt": "2026-02-07T14:32:00Z"
    }
  ],
  "milestoneUpdates": [
    {
      "category": "state",
      "entityKey": "TX",
      "contactCount": 343,
      "currentTier": 2
    }
  ],
  "xpEvents": [
    {
      "source": "qso",
      "amount": 12,
      "multiplier": 1.5,
      "referenceId": "qso_xyz789"
    }
  ],
  "streakUpdate": {
    "currentStreak": 24,
    "lastActiveDate": "2026-02-07"
  }
}
```

**Rate limit:** 10 requests/minute (batching is expected)

---

## Appendix A: Glossary

| Term             | Definition                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| **ADIF**         | Amateur Data Interchange Format -- standard file format for exchanging QSO logs                          |
| **CQ Zone**      | Contest zone system dividing the world into 40 zones, used in CQ WW contests                             |
| **DXCC**         | DX Century Club -- ARRL award program tracking contacts with 340 active entities (countries/territories) |
| **EFHW**         | End-Fed Half Wave -- a popular wire antenna type                                                         |
| **Elmer**        | A mentor in the ham radio community                                                                      |
| **FT8**          | Digital mode designed for weak-signal communication, extremely popular since 2017                        |
| **Greyline**     | The twilight zone between day and night on Earth; HF signals propagate well along it                     |
| **IOTA**         | Islands on the Air -- award program for contacting island stations                                       |
| **ITU Zone**     | International Telecommunication Union zone system (90 zones)                                             |
| **K-index (Kp)** | Planetary geomagnetic activity index (0-9); higher = more disturbed = worse HF propagation               |
| **MUF**          | Maximum Usable Frequency -- highest frequency that will refract from the ionosphere on a given path      |
| **Net**          | A scheduled on-air gathering of operators, typically with a net control station                          |
| **POTA**         | Parks on the Air -- program for activating parks and nature areas                                        |
| **QRP**          | Low-power operation (typically 5W or less)                                                               |
| **QRPp**         | Very low power operation (1W or less)                                                                    |
| **QSO**          | A radio contact between two stations                                                                     |
| **QTH**          | Location of a radio station                                                                              |
| **SFI**          | Solar Flux Index (10.7 cm radio flux) -- higher = better HF propagation                                  |
| **SOTA**         | Summits on the Air -- program for portable operation from mountain summits                               |
| **SSN**          | Sunspot Number -- daily count of sunspots                                                                |
| **WARC**         | World Administrative Radio Conference bands (30m, 17m, 12m) -- no contests allowed                       |
| **WAS**          | Worked All States -- award for contacting all 50 US states                                               |
| **WAZ**          | Worked All Zones -- award for contacting all 40 CQ zones                                                 |

## Appendix B: XP Simulation

To validate the level progression curve, here are simulated scenarios showing how different operator profiles reach various levels:

**Casual Operator (5 QSOs/week, no challenges):**

- Week 1: ~25 XP from QSOs + profile setup (~50 XP) = Level 1
- Month 1: ~100 QSO XP + streaks + badges = ~400 XP = Level 2
- Month 6: ~2,500 XP = Level 4 (Band Explorer)
- Year 1: ~5,500 XP = Level 7 (Net Participant)

**Active Operator (20 QSOs/week, occasional challenges):**

- Month 1: ~500 QSO XP + challenges + badges = ~1,500 XP = Level 3
- Month 6: ~8,000 XP = Level 9 (Digital Specialist)
- Year 1: ~18,000 XP = Level 14 (Multi-Mode Operator)

**Dedicated DXer (50 QSOs/week, daily challenges, DX chasing):**

- Month 1: ~2,000 QSO XP + challenges + DXCC badges + distance = ~4,500 XP = Level 5
- Month 6: ~22,000 XP = Level 16 (DX Expert)
- Year 1: ~45,000 XP = Level 24 (Community Leader)

**Contest Operator (100+ QSOs on contest weekends, 20/week otherwise):**

- Month 1: ~3,000 XP = Level 4
- Month 6: ~18,000 XP = Level 14
- Year 1: ~40,000 XP = Level 23 (Propagation Master)

These simulations confirm that:

- Casual operators reach meaningful levels (5-7) within a year
- Active operators hit the "Experienced" tier (11-15) within a year
- Only the most dedicated operators reach "Legend" tier (26-30), and it takes multiple years
- No operator can "finish" the system -- there is always something to chase

---

_This PRD is the definitive reference for the Propulse Gamification Engine. It defines a system that is as deep as ham radio itself -- because the hobby deserves software that celebrates every contact, every band opening, and every operator who keys up and reaches out across the ionosphere._
