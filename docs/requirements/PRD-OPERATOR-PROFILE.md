# PRD: Operator Profile — Identity Hub for Ham Radio Operators

**Status:** Draft
**Owner:** Product / Engineering
**Audience:** Frontend, Backend (Supabase), UX, QA
**Version:** 1.0
**Date:** 2026-02-07

**Related docs:**

- `src/types/user.ts` (UserStation, LicenseInfo, OperatingLocation, UserPreferences)
- `src/stores/userStore.ts` (Zustand user preferences store)
- `src/stores/dxccStore.ts` (DXCC entity tracking)
- `src/components/logbook/AwardsTracker.tsx` (DXCC/WAS/WAZ progress)
- `src/components/logbook/QSLManager.tsx` (LoTW/eQSL/ClubLog integration)
- `src/components/map/OperatorProfile.tsx` (compact profile card on PropSphere)
- `src/lib/db/types.ts` (LogEntry, IndexedDB schema)
- `src/lib/export/types.ts` (ADIF/Cabrillo export formats)

---

## 1. Executive Summary

Propulse currently treats operator identity as a handful of form fields buried inside a settings modal: callsign, name, grid, license class, and expiration. There is no dedicated surface where an operator can see their complete ham radio identity, review their operating history, track progress toward awards, or share their station profile with the community.

This PRD defines a full `/profile` route that becomes the operator's identity hub within Propulse. Think of it as a GitHub profile for ham radio operators: a single page that aggregates who you are (callsign, license, QTH), what you have accomplished (DXCC progress, awards, contest results), how active you are (activity heatmap, statistics), and how you connect with others (friends, QR sharing, activity feed).

The profile page also serves as the anchor for Propulse's migration from IndexedDB-only local storage to Supabase as the cloud backend. Profile data is the first entity that will live in Supabase, establishing the authentication model, row-level security patterns, and local-to-cloud sync strategy that all subsequent features will follow.

**What this replaces:**

- The "Station Setup" section inside `SettingsModal.tsx`
- The compact `OperatorProfile.tsx` card on PropSphere (which stays, but now reads from the canonical profile)
- Scattered profile fields across `userStore.ts` preferences

**The vision:** Every ham radio operator who uses Propulse has a rich, shareable profile that represents their complete operating identity, automatically enriched by their logbook activity, and optionally visible to the Propulse community.

---

## 2. Problem Statement

### Current State Limitations

1. **Fragmented identity data.** Operator information is scattered across `UserStation` (callsign, grid, name), `LicenseInfo` (class, country, expiration), `UserPreferences` (radios, antenna), and `ServiceCredentials` (LoTW, eQSL, ClubLog). There is no unified "profile" concept.

2. **No persistent identity.** All data lives in localStorage/IndexedDB on a single browser. If the operator clears browser data or switches devices, everything is lost. There is no account, no cloud backup, no cross-device continuity.

3. **No community presence.** Operators cannot share their station profile, operating statistics, or DXCC progress with others. In a hobby that is fundamentally about connecting with people, Propulse offers zero social surface area.

4. **No achievement recognition.** The `AwardsTracker` component computes DXCC/WAS/WAZ progress but only inside the Logbook page. There is no gamification layer, no badges, no milestones that reward consistent operating and make progress visible.

5. **No activity visualization.** Operators have no way to see their operating patterns over time. Daily QSO counts, band/mode breakdowns, streaks, and personal records are not surfaced anywhere.

6. **Manual data entry only.** Setting up a profile requires manual input for callsign, name, grid, and license. There is no integration with callsign lookup services (HamQTH, callook.info, QRZ) that could auto-fill this data.

### What Ham Radio Operators Expect

Operators coming from Logger32, N1MM, DXKeeper, HAMRS, or QRZ.com expect:

- A profile page that shows their complete station information at a glance
- Automatic DXCC/WAS/WAZ progress tracking tied to their logbook
- QSL confirmation status across LoTW, eQSL, and ClubLog
- The ability to share their callsign page (QRZ.com is the de facto standard)
- Award badges and recognition for operating milestones
- Activity visualizations that show operating patterns

Propulse should match these expectations while adding features that no existing tool provides: real-time activity indicators, GitHub-style heatmaps, auto-generated achievement badges, QR code profile cards for hamfests, and a friends network with activity feeds.

---

## 3. Goals / Success Criteria

### Operator Outcomes

| Goal                                               | Metric                                                    | Target                  |
| -------------------------------------------------- | --------------------------------------------------------- | ----------------------- |
| Operators complete their profile during onboarding | Profile completeness score on first session               | >= 70% within 5 minutes |
| Operators return to profile regularly              | Profile page visits per active user per week              | >= 2                    |
| Operators share their profile                      | QR code generations or share card exports per month       | >= 1 per active user    |
| Operators track award progress via profile         | Time from QSO logged to viewing updated DXCC progress     | < 3 seconds (reactive)  |
| Operators connect with friends                     | Mutual follow relationships per active user after 30 days | >= 3                    |

### System Outcomes

| Goal                             | Metric                                                        | Target                          |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------- |
| Supabase auth adoption           | Percentage of active users with a Supabase account            | >= 80% within 60 days of launch |
| Local-to-cloud migration success | Data loss incidents during migration                          | 0                               |
| Profile page performance         | Time to first meaningful paint on `/profile`                  | < 1.5 seconds on 4G             |
| Profile photo storage efficiency | Average storage per profile photo after optimization          | < 200 KB                        |
| Real-time status accuracy        | Delay between operator activity and status update for friends | < 30 seconds                    |

---

## 4. Non-Goals

The following items are explicitly out of scope for this PRD:

1. **Full social network.** We are not building a chat system, a forums engine, or a messaging platform. The friends feature is limited to follow/unfollow, activity feed, and online status.

2. **Log migration to Supabase.** QSO records remain in IndexedDB for this phase. Only profile, achievement, follow, and activity feed data move to Supabase. Logbook cloud sync is a separate future PRD.

3. **QSL card design tool.** The shareable profile card is a pre-designed template export, not a drag-and-drop card builder.

4. **Public profile SEO.** Public profiles are accessible via direct link but are not indexed by search engines in this phase. Server-side rendering for Open Graph meta tags is included; full SEO optimization is not.

5. **Monetization.** No premium tiers, no paid badges, no subscription gating on profile features.

6. **Contest result import from external sources.** Contest placings displayed on the profile are limited to sessions logged within Propulse. Importing results from 3830scores.com or contest sponsors is out of scope.

7. **Multi-callsign profiles.** Each Supabase account maps to one primary callsign. Operators with multiple callsigns (e.g., home call + vanity call) can list aliases in their bio but cannot maintain separate profiles per call.

8. **Real-time QSO streaming.** The activity feed shows achievements and milestones, not a live stream of every QSO as it happens. The "active now" indicator is based on recent activity, not a per-QSO event stream.

---

## 5. Feature Specification

### 5.1 Profile Page Layout

#### Desktop Layout (>= 1024px)

```
+--------------------------------------------------------------+
|  PROPULSE HEADER (existing)                                   |
+--------------------------------------------------------------+
|           |                                                   |
|  SIDEBAR  |  MAIN CONTENT AREA                                |
|  (320px)  |                                                   |
|           |  +---------------------------------------------+  |
|  Profile  |  | Tab Bar: Overview | Awards | Stats | Social |  |
|  Card     |  +---------------------------------------------+  |
|           |  |                                             |  |
|  - Avatar |  |  Tab content area                           |  |
|  - Call   |  |  (scrollable)                               |  |
|  - Name   |  |                                             |  |
|  - Grid   |  |                                             |  |
|  - License|  |                                             |  |
|  - Status |  |                                             |  |
|  - Links  |  |                                             |  |
|           |  |                                             |  |
|  Actions  |  |                                             |  |
|  - Edit   |  |                                             |  |
|  - Share  |  |                                             |  |
|  - QR     |  |                                             |  |
|           |  +---------------------------------------------+  |
+--------------------------------------------------------------+
```

- Sidebar: fixed-position profile card (320px width), does not scroll with content
- Main area: tabbed content with four tabs (Overview, Awards, Stats, Social)
- Sidebar collapses to a horizontal card at 768-1023px breakpoint

#### Mobile Layout (< 768px)

```
+-------------------------------+
|  PROPULSE HEADER (compact)    |
+-------------------------------+
|  +-------------------------+  |
|  |  Profile Card (full-w)  |  |
|  |  Avatar + Call + Grid   |  |
|  |  License + Status       |  |
|  |  [Edit] [Share] [QR]   |  |
|  +-------------------------+  |
|                               |
|  [Overview|Awards|Stats|Soc]  |
|                               |
|  Scrollable tab content       |
|                               |
+-------------------------------+
|  Bottom Tab Bar (existing)    |
+-------------------------------+
```

- Profile card stacks vertically at the top, full-width
- Tab bar uses horizontal scroll if labels overflow
- All content is single-column, touch-optimized
- Bottom tab bar from existing mobile layout remains

#### Profile Completeness Indicator

A circular progress ring displayed on the profile card, styled after LinkedIn's profile strength indicator. The ring fills based on how many profile fields the operator has completed.

**Completeness scoring weights:**

| Field                         | Weight | Required |
| ----------------------------- | ------ | -------- |
| Callsign                      | 20     | Yes      |
| Operator name                 | 10     | No       |
| Grid square (home QTH)        | 15     | Yes      |
| License country + class       | 15     | No       |
| Profile photo/avatar          | 10     | No       |
| Bio text                      | 5      | No       |
| At least one social link      | 5      | No       |
| At least one radio configured | 10     | No       |
| License expiration date       | 5      | No       |
| Timezone set                  | 5      | No       |

**Visual design:**

- 0-39%: Red ring, label "Getting Started"
- 40-69%: Amber ring, label "Good Progress"
- 70-89%: Signal-green ring, label "Strong Profile"
- 90-100%: Plasma-orange ring with glow, label "All-Star"

The ring uses `stroke-dasharray` / `stroke-dashoffset` SVG animation. The existing `ProfileValidation` interface in `src/types/user.ts` provides the foundation; this extends it with weighted scoring and visual tiers.

---

### 5.2 Identity Section

The identity section is the core of the profile card displayed in the sidebar (desktop) or top card (mobile).

#### Callsign Display

- Primary callsign rendered in 28px bold, `font-mono`, plasma-orange color
- Callsign is the canonical identifier; it appears in the URL (`/profile/N5XXX`), in the sidebar, and in all share artifacts
- If the callsign is not yet set (new user), the profile card shows a "Set Your Callsign" CTA that opens the identity editor
- Callsign validation: 3-10 alphanumeric characters, must contain at least one digit and one letter, standard ITU format

#### Callsign Lookup Integration

When the operator enters or changes their callsign, Propulse queries external lookup services to auto-fill profile fields:

1. **callook.info** (US callsigns only, free, no API key): Returns name, address, grid, license class, grant date, expiration, FRN. Queried first for US calls.
2. **HamQTH** (international, free with registration): Returns name, QTH, grid, latitude, longitude, country. Queried for non-US calls or as a fallback.
3. **QRZ XML** (if operator has QRZ subscription and provides API key in credentials): Returns comprehensive data including bio, photo URL, email.

**Auto-fill flow:**

1. Operator types callsign in the identity editor
2. After 500ms debounce, system queries callook.info (for US prefix) or HamQTH
3. Results appear as "suggested values" below each field with a "Use This" button
4. Operator can accept all suggestions at once ("Auto-fill All") or selectively
5. Existing field values are never overwritten without operator confirmation
6. A "Lookup failed" toast appears if the service is unreachable; manual entry remains available

**Proxy routing:** Lookup requests go through Vercel Edge Functions (`/api/callsign-lookup`) to avoid CORS issues and to rate-limit requests (max 10 lookups per minute per IP).

#### Operator Name

- Free-text field, max 100 characters
- Displayed below callsign in 18px regular weight
- Optional; profile is valid without it

#### QTH Information

- Sourced from the home `OperatingLocation` in `UserStation.savedLocations[]`
- Displays: city/region text (free-form), Maidenhead grid (4 or 6 characters), lat/lon
- Grid square rendered with a small grid icon, formatted as `EM10fx` with subsquare in lighter opacity
- Clicking the grid square opens the map centered on that location

#### Profile Photo / Avatar

- **Upload:** Accept JPEG, PNG, WebP. Max file size: 5 MB before optimization. Client-side resize to 512x512px and compress to WebP at quality 80 before upload. Final stored size target: < 200 KB.
- **Gravatar fallback:** If no photo is uploaded, generate an avatar from the MD5 hash of `{callsign}@propulse.app` using Gravatar's identicon style. This produces a unique geometric pattern per callsign without requiring any external account.
- **Default fallback:** If Gravatar is unreachable, display a circle with the first two characters of the callsign in 32px bold, plasma-orange on void-black background.
- **Storage:** Uploaded photos are stored in a Supabase Storage bucket (`profile-photos`) with the key `{user_id}/avatar.webp`. Public read, authenticated write.
- **Cropping:** A simple circular crop overlay is provided during upload. No advanced editing tools.

#### Bio / About

- Markdown-supported text area, max 2000 characters
- Rendered with a minimal Markdown parser (bold, italic, links, line breaks, bullet lists)
- No images, headings, or code blocks in bio Markdown to prevent layout abuse
- Displayed on the Overview tab below the identity card
- Placeholder text: "Tell the ham radio community about yourself, your station, your operating interests..."

#### Social Links

Up to 5 social/web links displayed as icon + URL pairs on the profile card:

| Service          | Icon          | URL Pattern                                          |
| ---------------- | ------------- | ---------------------------------------------------- |
| QRZ.com          | QRZ logo      | `https://www.qrz.com/db/{callsign}` (auto-generated) |
| HamQTH           | HamQTH logo   | `https://www.hamqth.com/{callsign}` (auto-generated) |
| Personal website | Globe icon    | Any valid URL                                        |
| Twitter/X        | X logo        | `https://x.com/{handle}`                             |
| Mastodon         | Mastodon logo | Full instance URL                                    |

- QRZ and HamQTH links are auto-generated from the callsign and displayed by default
- Personal website and social media links are user-entered
- Links open in a new tab with `rel="noopener noreferrer"`
- Displayed as compact icon row below bio on desktop, expandable list on mobile

---

### 5.3 License Section

#### License Display

The license card shows the operator's amateur radio license status with visual indicators:

```
+--------------------------------------------------+
|  LICENSE                                          |
|  Country: United States         Class: Extra      |
|  Granted: 2015-03-14           FRN: 00XXXXXXXX   |
|                                                   |
|  Expiration: 2025-03-14                           |
|  [################............] 75% expired       |
|  WARNING: Expires in 42 days                      |
+--------------------------------------------------+
```

- Country displayed as flag emoji + country name (from `LICENSE_COUNTRY_NAMES`)
- Class displayed with a colored badge:
  - US EXTRA / UK FULL / DE KLASSE_A: signal-green badge
  - US GENERAL / UK INTERMEDIATE / DE KLASSE_E: nebula-blue badge
  - US TECHNICIAN / UK FOUNDATION: caution-amber badge
  - Other classes: gray badge

#### Expiration Warnings

Visual warnings based on remaining time to expiration:

| Days Until Expiration | Visual Treatment                                                       |
| --------------------- | ---------------------------------------------------------------------- |
| > 180 days            | Green text, no warning                                                 |
| 90-180 days           | Amber text, "Renew soon" label                                         |
| 30-89 days            | Alert-red text, pulsing dot, "Expiring soon" banner                    |
| 0-29 days             | Alert-red background glow, "EXPIRES IN X DAYS" urgent banner           |
| Expired               | Red strike-through on date, "LICENSE EXPIRED" banner with renewal link |

The expiration progress bar uses a gradient from signal-green (fresh) through caution-amber (midpoint) to alert-red (near expiration).

#### License History

A vertical timeline showing license upgrades:

```
  [*] Extra        2020-06-15
   |
  [o] General      2018-01-20
   |
  [o] Technician   2015-03-14 (initial grant)
```

- Rendered as a compact vertical timeline with dots and connecting lines
- Data source: manually entered by operator (no automatic history import)
- Each entry: class, date, optional notes (e.g., "Passed on first attempt!")
- Maximum 10 history entries

#### Privilege Indicator

A visual matrix showing which bands and modes the operator's license class permits:

| Band | CW  | SSB | Digital | Max Power |
| ---- | --- | --- | ------- | --------- |
| 160m | Yes | Yes | Yes     | 1500W     |
| 80m  | Yes | Yes | Yes     | 1500W     |
| 40m  | Yes | Yes | Yes     | 1500W     |
| ...  | ... | ... | ...     | ...       |

- Data derived from `LicenseCountry` + `LicenseClass` using a privilege lookup table
- Bands available to the operator shown in signal-green; restricted bands shown in gray with a lock icon
- Power limits shown per band where they vary (e.g., US Novice on 10m = 200W)
- Privilege data is maintained as a static lookup table in `src/lib/data/licensePrivileges.ts`
- For countries not in the privilege database, shows "Privilege data unavailable for {country}" with a link to the relevant regulatory authority

---

### 5.4 Location Management

#### Home QTH

- Pulled from the `OperatingLocation` where `type === "home"` in `UserStation.savedLocations[]`
- Displayed with a miniature map thumbnail (static Mapbox image or a Canvas-rendered snippet) showing a pin at the home location
- Map thumbnail: 280px x 160px, dark style matching Propulse theme, with a plasma-orange pin
- Clicking the map thumbnail navigates to PropSphere centered on the home QTH
- Editable via "Edit Home QTH" button that opens a location editor with map picker and grid calculator

#### Saved Portable Locations

A card grid showing all saved operating locations from `UserStation.savedLocations[]`:

```
+------------------+ +------------------+ +------------------+
| POTA K-1234      | | SOTA W4C/WM-001  | | Field Day 2025   |
| Blue Ridge Pkwy  | | Mt. Mitchell     | | Club Site        |
| EM85gx           | | EM85aa           | | FM06             |
| Last: 2025-06-24 | | Last: 2025-08-15 | | Last: 2025-06-28 |
| 12 QSOs          | | 3 QSOs           | | 47 QSOs          |
+------------------+ +------------------+ +------------------+
```

- Each card shows: name, type badge (POTA/SOTA/Field Day/portable/mobile), grid, activation reference (if POTA/SOTA), last activation date, total QSOs from that location
- Type badge colors: POTA = forest-green, SOTA = mountain-blue, Field Day = plasma-orange, Portable = nebula-blue, Mobile = caution-amber
- Cards are sorted by most recently used
- "Add Location" card at the end with a plus icon opens the location editor
- Maximum 20 saved locations (current limit in the codebase)

#### Active Location Indicator

- A small badge on the sidebar profile card shows the currently active location
- If `activeLocationId !== homeLocationId`, the badge shows the active location name with a "portable" icon
- Clicking the badge opens a quick-switch dropdown listing all saved locations
- Switching active location immediately updates the PropSphere operator marker, propagation calculations, and all location-dependent features

#### Location History / Timeline

A chronological timeline of operating location activations:

```
2025-08-15  SOTA W4C/WM-001 — Mt. Mitchell (3 QSOs)
2025-06-28  Field Day 2025 — Club Site (47 QSOs)
2025-06-24  POTA K-1234 — Blue Ridge Pkwy (12 QSOs)
2025-06-01  Home QTH (active since)
```

- Derived from logbook entries by grouping QSOs by their `stationCallsign` and date
- Each entry links to the filtered logbook view for that activation
- Timeline is collapsible, showing last 10 entries by default with "Show all" expansion

---

### 5.5 Awards and Achievements

#### Award Progress Rings

Three primary award trackers displayed as concentric progress rings on the Overview tab:

**DXCC (DX Century Club)**

- Outer ring: entities worked (any confirmation)
- Inner ring: entities confirmed (LoTW/eQSL/card)
- Center text: confirmed count / total active entities (currently ~340)
- Data source: `useDXCCStore.getProgress()`
- Ring colors: worked = nebula-blue, confirmed = signal-green

**WAS (Worked All States)**

- Progress ring showing US states worked
- Center text: states count / 50
- Data source: computed from logbook entries where contacted station is in a US state
- Ring color: signal-green gradient

**WAZ (Worked All Zones)**

- Progress ring showing CQ zones worked
- Center text: zones count / 40
- Data source: computed from logbook entries mapped to CQ zone via DXCC entity
- Ring color: plasma-orange gradient

Each ring is an SVG with `stroke-dasharray` animation. Rings are clickable, expanding to show a detail grid (which entities/states/zones are worked, which are confirmed, which are needed).

#### Contest Awards

A card showing contest participation and performance:

```
+--------------------------------------------------+
|  CONTEST AWARDS                                   |
|                                                   |
|  12 contests entered (2025)                       |
|  Best: CQWW SSB — 145,000 pts (Single-Op, HP)    |
|                                                   |
|  Participation badges:                            |
|  [CQWW] [ARRL DX] [Field Day] [Sweepstakes]      |
|  [WPX] [NAQP] [Stew Perry] [ARRL 10m]            |
+--------------------------------------------------+
```

- Sourced from `contestStore` archived sessions
- Participation badge for each unique contest entered
- "Best result" highlighted with score and category
- Expandable to show full contest history table

#### Achievement Badges

Auto-generated badges based on operating patterns, computed from logbook data. Each badge has four tiers: Bronze, Silver, Gold, Platinum.

| Badge                 | Criteria (per tier)                                              | Icon Concept          |
| --------------------- | ---------------------------------------------------------------- | --------------------- |
| **DX Hunter**         | B: 25 DXCC / S: 50 / G: 100 / P: 200 confirmed entities          | Globe with crosshair  |
| **CW Enthusiast**     | B: 100 CW QSOs / S: 500 / G: 2000 / P: 5000                      | Morse key             |
| **Phone Operator**    | B: 100 SSB QSOs / S: 500 / G: 2000 / P: 5000                     | Microphone            |
| **Digital Pioneer**   | B: 100 FT8/FT4/JS8 QSOs / S: 500 / G: 2000 / P: 5000             | Digital waveform      |
| **Night Owl**         | B: 50 QSOs between 00:00-06:00 local / S: 200 / G: 500 / P: 1000 | Moon with antenna     |
| **Early Bird**        | B: 50 QSOs between 05:00-08:00 local / S: 200 / G: 500 / P: 1000 | Sunrise with antenna  |
| **Contester**         | B: 1 contest / S: 5 / G: 15 / P: 50 entered                      | Trophy                |
| **POTA Activator**    | B: 1 park / S: 5 parks / G: 20 parks / P: 50 parks activated     | Tree with radio waves |
| **SOTA Mountaineer**  | B: 1 summit / S: 5 / G: 20 / P: 50 summits activated             | Mountain peak         |
| **Field Day Warrior** | B: 1 Field Day / S: 3 / G: 5 / P: 10 participations              | Tent with antenna     |
| **Band Explorer**     | B: 3 bands / S: 6 / G: 9 / P: all 13 bands used                  | Spectrum bar          |
| **Marathon Runner**   | B: 7-day streak / S: 30-day / G: 90-day / P: 365-day streak      | Calendar with fire    |
| **Century Club**      | B: 100 QSOs total / S: 1000 / G: 5000 / P: 10000                 | Stacked contacts      |
| **Ragchewer**         | B: 10 QSOs > 30 min / S: 50 / G: 100 / P: 500                    | Chat bubbles          |
| **10m Specialist**    | B: 50 QSOs on 10m / S: 200 / G: 500 / P: 1000                    | Band-specific icon    |
| **160m DXer**         | B: 10 QSOs on 160m / S: 50 / G: 100 / P: 500                     | Moon with "160"       |
| **Elmer**             | B: 1 guest operator logged / S: 5 / G: 10 / P: 25                | Handshake             |
| **Globe Trotter**     | B: 5 CQ zones / S: 15 / G: 25 / P: 40 zones worked               | Spinning globe        |

**Badge computation:**

- Badges are computed locally from IndexedDB logbook data and DXCC store data
- Computation runs on profile page mount and is cached in memory for the session
- When Supabase is connected, earned badges are synced to the `achievements` table so they appear on public profiles
- Badge tier transitions trigger a toast notification and an entry in the activity feed

**Badge display:**

- Earned badges shown as 48x48px icons with metallic tier border (bronze/silver/gold/platinum gradient)
- Unearned badges shown as grayscale outlines with a lock overlay
- Hovering a badge shows: name, description, current progress, next tier threshold
- Badges are laid out in a responsive grid (4 columns desktop, 2 columns mobile)

#### Progress Bars to Next Tier

Below each earned badge, a compact progress bar shows advancement toward the next tier:

```
[DX Hunter - Gold]
[##############........] 142 / 200 entities
Platinum in 58 more confirmations
```

- Progress bar uses the next tier's color as the fill target
- If Platinum is already achieved, the bar is full with a sparkle animation
- Progress percentage and absolute counts shown below the bar

---

### 5.6 Activity Heatmap

A GitHub-style 365-day contribution graph showing daily QSO activity, displayed on the Stats tab.

#### Layout

```
+----------------------------------------------------------+
|  ACTIVITY (past 12 months)                    2025-2026   |
|                                                           |
|  Mon  [ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]...[ ][ ][ ][ ]    |
|  Wed  [ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]...[ ][ ][ ][ ]    |
|  Fri  [ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]...[ ][ ][ ][ ]    |
|       Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  ...    |
|                                                           |
|  Less [   ][   ][   ][   ][   ] More                      |
+----------------------------------------------------------+
```

- 53 columns (weeks) x 7 rows (days), reading left to right, oldest to newest
- Each cell is a 12x12px rounded square with 2px gap
- Day labels (Mon, Wed, Fri) on the left axis
- Month labels along the bottom axis

#### Color Intensity Mapping

Activity levels mapped to the Propulse color palette:

| QSO Count | Color                    | CSS Class                     |
| --------- | ------------------------ | ----------------------------- |
| 0         | `rgba(255,255,255,0.04)` | void-black with subtle border |
| 1-4       | `rgba(0, 217, 108, 0.2)` | signal-green at 20%           |
| 5-14      | `rgba(0, 217, 108, 0.4)` | signal-green at 40%           |
| 15-29     | `rgba(0, 217, 108, 0.6)` | signal-green at 60%           |
| 30+       | `rgba(0, 217, 108, 0.9)` | signal-green at 90%           |

Thresholds are percentile-based for the operator's own data: if someone averages 50 QSOs/day, the thresholds scale up proportionally so the heatmap shows meaningful variation rather than being all-green.

#### Tooltips

Hovering a cell shows a tooltip:

```
February 7, 2026
12 QSOs
Best DX: JA1XYZ (10,847 km)
Bands: 20m (7), 40m (3), 15m (2)
```

- Date in long format
- Total QSO count
- Farthest DX contact of the day (callsign + distance)
- Band breakdown

#### Filters

A filter bar above the heatmap allows scoping:

- **Band filter:** Dropdown with "All Bands" default, individual band options
- **Mode filter:** Dropdown with "All Modes" default, SSB/CW/FT8/FT4/RTTY/other
- Filters apply reactively; the heatmap recomputes and re-renders with the filtered dataset
- Filter state is persisted in the URL query params (`/profile?band=20m&mode=FT8`)

#### Click-to-Drill

Clicking a heatmap cell opens a popover or navigates to the logbook with that day's QSOs filtered:

- Popover (desktop): shows a mini table of QSOs for that day (callsign, band, mode, time)
- Navigation (mobile): routes to `/log?date=2026-02-07` with the date filter applied

#### Data Source

- QSO data is read from IndexedDB via the existing logbook query functions
- The heatmap component computes day-by-day aggregates in a `useMemo` keyed on the logbook entry count and filter state
- For performance, the component pre-aggregates on mount and only recomputes when new entries are added

---

### 5.7 Operating Statistics

Displayed on the Stats tab below the activity heatmap, in a responsive card grid.

#### Headline Stats (Top Row)

Four large metric cards:

```
+------------+ +------------+ +------------+ +------------+
|  12,847    | |  1,247     | |  312       | |  47        |
|  Total QSOs| |  This Year | |  This Month| |  Today     |
|  All Time  | |  (2026)    | |  (Feb)     | |            |
+------------+ +------------+ +------------+ +------------+
```

- Numbers rendered in 36px bold, plasma-orange
- Subtitle in 12px gray
- Each card has a subtle sparkline showing the 30-day trend beneath the number

#### QSOs by Mode (Donut Chart)

```
+--------------------------------------------------+
|  QSOs BY MODE                                     |
|                                                   |
|          +------+                                 |
|         /  FT8   \    FT8: 5,234 (40.7%)         |
|        |  40.7%   |   SSB: 3,891 (30.3%)         |
|        |   SSB    |   CW:  2,456 (19.1%)         |
|         \ 30.3%  /    FT4:   623 (4.8%)          |
|          +------+     Other: 643 (5.0%)           |
|                                                   |
+--------------------------------------------------+
```

- Interactive donut chart with hover highlights
- Top 5 modes shown individually; remainder grouped as "Other"
- Color coding per mode consistent with PropSphere spot colors:
  - FT8: `#3B82F6` (blue)
  - SSB: `#EF4444` (red)
  - CW: `#F59E0B` (amber)
  - FT4: `#8B5CF6` (purple)
  - RTTY: `#10B981` (emerald)
  - Other: `#6B7280` (gray)

#### QSOs by Band (Horizontal Bar Chart)

```
+--------------------------------------------------+
|  QSOs BY BAND                                     |
|                                                   |
|  20m  [#########################] 3,456           |
|  40m  [#####################] 2,891               |
|  15m  [################] 2,100                    |
|  10m  [###########] 1,456                         |
|  17m  [#######] 891                               |
|  80m  [#####] 654                                 |
|  ...                                              |
+--------------------------------------------------+
```

- Sorted by count descending
- Bar color uses the band's conventional color from the existing spot color scheme
- Clicking a band bar filters the heatmap to that band

#### Key Ratios and Records

A card grid showing derived statistics:

| Statistic                 | Computation                                                               | Display                               |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| DX vs Domestic Ratio      | QSOs with non-home DXCC entity / total QSOs                               | "72% DX / 28% Domestic" with mini bar |
| Average Distance          | Mean great-circle distance across all QSOs with grid data                 | "4,230 km avg"                        |
| Unique Entities This Year | Distinct DXCC entities worked in current calendar year                    | "87 entities in 2026"                 |
| Current Streak            | Consecutive calendar days with at least 1 QSO (ending today or yesterday) | "14 days" with fire icon              |
| Longest Streak            | Maximum consecutive-day streak in logbook history                         | "47 days (2025-10-01 to 2025-11-16)"  |
| Farthest DX               | Single QSO with the greatest computed distance                            | "ZL1ABC — 14,321 km (2025-06-14)"     |
| Most QSOs in One Day      | Highest single-day QSO count                                              | "127 QSOs (2025-06-28 — Field Day)"   |
| Most QSOs in One Hour     | Highest 60-minute rolling window QSO count                                | "42 QSOs/hr (CQWW SSB)"               |
| Favorite Band             | Band with most QSOs                                                       | "20m (3,456 QSOs)"                    |
| Favorite Mode             | Mode with most QSOs                                                       | "FT8 (5,234 QSOs)"                    |

- Each stat rendered as a compact card with an icon, label, value, and optional subtitle
- Cards arranged in a 3-column grid (desktop) or 2-column grid (mobile)
- All computations are memoized and derived from the IndexedDB logbook data

---

### 5.8 QSL Status Dashboard

Displayed on the Overview tab as a summary card, with detailed view accessible by clicking "View QSL Details."

#### Summary Card

```
+--------------------------------------------------+
|  QSL CONFIRMATIONS                    Rate: 62%   |
|                                                   |
|  LoTW     [synced]   Last: 2h ago   4,231 conf   |
|  eQSL     [pending]  Last: 3d ago     891 conf   |
|  Club Log [error]    Last: failed      0 conf    |
|                                                   |
|  Overall: 5,122 / 8,234 QSOs confirmed           |
|  [################################..............] |
+--------------------------------------------------+
```

- Service status badges using existing `QSLManager` status colors:
  - Synced: signal-green dot
  - Pending: caution-amber dot
  - Error: alert-red dot
  - Not configured: gray dot
- Last sync time shown as relative ("2h ago", "3d ago")
- Overall confirmation rate as percentage and progress bar

#### Detailed QSL View (Expandable)

When expanded or navigated to, shows:

- Per-service breakdown with upload/download counts
- Timeline of sync events (last 10)
- "Cards Needed" list: QSOs where the contacted station is a new DXCC entity that has not been confirmed. Sorted by entity rarity. Shows callsign, band, mode, date, and which services have been tried.
- "Sync Now" button per service (triggers existing sync logic from `QSLManager`)

The profile does not duplicate the full `QSLManager` UI; it provides a summary that links to the logbook's QSL management tab for detailed operations.

---

### 5.9 Social Features

#### 5.9.1 QR Code Profile Card

Generate a QR code encoding the operator's Propulse profile URL, designed to be shown at hamfests, POTA activations, and Field Day events.

**QR code specifications:**

- Content: `https://propulse.app/profile/{callsign}`
- Error correction level: H (high, 30% recovery — tolerates partial obstruction)
- Module size: computed to fill 280x280px on screen
- Colors: plasma-orange modules on void-black background
- Embedded logo: Propulse logo centered at 20% of QR size
- Quiet zone: 4 modules minimum

**Display:**

- Full-screen modal optimized for showing to another person's phone camera
- Screen brightness automatically increased to maximum (using `screen.keepAwake` API where available)
- White border around the QR for contrast on dark backgrounds
- Callsign displayed above the QR in large text
- "Scan to view my Propulse profile" text below
- Close button in the corner

**Mobile optimization:**

- On mobile, the QR modal enters a "torch mode" where the phone screen acts as a bright QR display
- Orientation locked to portrait during QR display
- Status bar hidden to maximize display area

#### 5.9.2 Shareable Profile Card

Generate a PNG or SVG card that operators can share on social media, embed in emails, or print for physical QSL card reference.

**Card specifications:**

- Dimensions: 1200x630px (Open Graph standard for social media)
- Format: PNG (for sharing) and SVG (for printing)

**Templates (3 designs):**

1. **Minimalist Dark:**
   - Void-black background with subtle grid pattern
   - Callsign in 72px plasma-orange
   - Grid square, name, key stat (DXCC count) in white
   - Propulse watermark in corner

2. **Classic Ham:**
   - Deep-space gradient background
   - Callsign in bold serif font, centered
   - License class badge, grid, name
   - Three stat callouts: Total QSOs, DXCC, Favorite Band
   - Globe icon with signal-green accent

3. **Contest Fighter:**
   - Dynamic gradient background (plasma-orange to deep-space)
   - Callsign large and angled
   - Contest stats: total contests, best score, total QSOs
   - Achievement badge row at bottom
   - Energy/fire aesthetic

**Generation:**

- Cards are rendered client-side using a hidden Canvas element
- Template selection via a preview carousel
- "Download PNG" and "Copy to Clipboard" buttons
- On mobile, "Share" button triggers Web Share API with the generated image

#### 5.9.3 Friends Network

A follow-based social graph connecting Propulse operators.

**Follow mechanics:**

- One-directional follow (like Twitter, not like Facebook)
- Mutual follow = "Friend" status (both operators follow each other)
- Following an operator subscribes you to their activity feed events
- No follow approval workflow; follows are immediate
- Unfollow is instant and silent (no notification)

**Following flow:**

1. Visit another operator's profile (`/profile/{callsign}`)
2. Click "Follow" button
3. Button changes to "Following" (checkmark icon)
4. Their activity appears in your Social tab's activity feed
5. If they also follow you, both profiles show "Friends" badge

**Data model:** See Section 6 for the `follows` table.

**Friends list UI:**

- Displayed on the Social tab
- Card grid showing each friend's avatar, callsign, name, and status indicator
- Sort options: alphabetical, most recently active, most QSOs
- Search filter for large friend lists
- Tapping a friend card navigates to their profile

**Discovery:**

- "People you may know" suggestions based on:
  - Operators you have worked (QSOs in logbook where the other operator is on Propulse)
  - Operators active in the same grid square
  - Operators participating in the same contests
- Discovery section shown on the Social tab when the operator has < 10 friends

#### 5.9.4 Activity Feed

A chronological feed of events from operators you follow, displayed on the Social tab.

**Event types:**

| Event                     | Trigger                      | Display                                      |
| ------------------------- | ---------------------------- | -------------------------------------------- |
| New DXCC entity confirmed | DXCC store confirmation      | "{call} confirmed {entity} on {band}!"       |
| Achievement earned        | Badge tier transition        | "{call} earned Gold DX Hunter!"              |
| Contest entered           | Contest session started      | "{call} is operating {contest name}"         |
| Contest completed         | Contest session ended        | "{call} finished {contest} — {score} points" |
| POTA activation           | Location switch to POTA type | "{call} is activating {park reference}"      |
| SOTA activation           | Location switch to SOTA type | "{call} is on summit {reference}"            |
| Profile milestone         | 1000th QSO, 100th DXCC, etc. | "{call} reached {milestone}!"                |

**Feed UI:**

- Reverse-chronological card list
- Each card: avatar, callsign, event text, relative timestamp
- Clicking an event navigates to the relevant section of that operator's profile
- Infinite scroll with 20 events per page
- "No activity yet" placeholder for new users with a prompt to follow operators

**Feed computation:**

- Events are generated server-side (Supabase Edge Function) when the triggering action occurs
- Events are stored in the `activity_feed` table
- The feed query filters events from operators the current user follows
- Events are retained for 90 days, then archived

#### 5.9.5 Online / Active Indicator

An opt-in status indicator showing when an operator is actively operating.

**Status levels:**

| Status       | Condition                                                       | Visual                               |
| ------------ | --------------------------------------------------------------- | ------------------------------------ |
| Active Now   | QSO logged within last 15 minutes OR bridge WebSocket connected | Solid green dot with pulse animation |
| Active Today | QSO logged today but not within 15 minutes                      | Solid amber dot                      |
| Inactive     | No QSOs today                                                   | Gray dot (or no dot)                 |
| Offline      | Opted out of status sharing                                     | No indicator shown                   |

**Implementation:**

- Status is computed locally and pushed to Supabase `profiles.last_active_at` via a heartbeat
- Heartbeat interval: every 60 seconds while the Propulse tab is focused
- When the bridge WebSocket is connected (rig integration), heartbeat is continuous regardless of tab focus
- Status visibility is controlled by the privacy setting (see 5.9.6)

**Display:**

- Green/amber dot overlaid on the avatar in friend lists and profile views
- Tooltip on hover: "Active now" or "Last active 2h ago"
- On the operator's own profile: shows their status as others would see it, with a toggle to enable/disable

#### 5.9.6 Profile Visibility Settings

Granular privacy controls for profile sections.

**Global visibility levels:**

| Level        | Who can see          | URL access                                           |
| ------------ | -------------------- | ---------------------------------------------------- |
| Public       | Anyone with the link | `/profile/{callsign}` returns full allowed sections  |
| Friends Only | Mutual follows only  | Non-friends see callsign + "Private Profile" message |
| Private      | Self only            | Direct link returns 404-like "Profile not found"     |

**Per-section visibility overrides:**

| Section                         | Default Visibility | Can Override To           |
| ------------------------------- | ------------------ | ------------------------- |
| Identity (callsign, name, grid) | Public             | Friends Only, Private     |
| License                         | Public             | Friends Only, Private     |
| Awards & Achievements           | Public             | Friends Only, Private     |
| Activity Heatmap                | Public             | Friends Only, Private     |
| Operating Statistics            | Public             | Friends Only, Private     |
| QSL Status                      | Friends Only       | Public, Private           |
| Social (friends list)           | Friends Only       | Public, Private           |
| Activity Feed                   | Friends Only       | Public, Private           |
| Online Status                   | Friends Only       | Public, Private, Disabled |

**Settings UI:**

- Accessible from the profile page via a "Privacy Settings" link/button
- Toggle matrix: rows = sections, columns = visibility levels (radio buttons)
- "Apply to All" convenience button to set all sections to the same level
- Changes are saved to Supabase `profiles.visibility_settings` (JSONB column)

---

### 5.10 Profile Sharing

#### Unique Profile URLs

- Format: `https://propulse.app/profile/{callsign}`
- Callsign in URL is case-insensitive; always normalized to uppercase in database
- The `/profile` route without a callsign shows the authenticated operator's own profile
- `/profile/{callsign}` where the callsign matches the authenticated user shows edit mode
- `/profile/{callsign}` for another operator shows read-only view with follow button
- Non-existent callsigns show a "Profile not found — this operator hasn't joined Propulse yet" page with a "Claim this callsign" CTA

#### Open Graph Meta Tags

When a profile URL is shared on social media, the link preview should show:

```html
<meta property="og:title" content="N5XXX — Propulse Operator Profile" />
<meta
  property="og:description"
  content="Extra Class | EM10fx | 12,847 QSOs | 142 DXCC"
/>
<meta property="og:image" content="https://propulse.app/api/og/profile/N5XXX" />
<meta property="og:url" content="https://propulse.app/profile/N5XXX" />
<meta property="og:type" content="profile" />
<meta property="twitter:card" content="summary_large_image" />
```

- The `og:image` is dynamically generated by a Vercel Edge Function that renders the Minimalist Dark profile card template as a PNG
- The Edge Function reads profile data from Supabase and generates the image using `@vercel/og` (Satori-based image generation)
- Image is cached at the CDN level with a 1-hour TTL; cache is busted when profile data changes

#### Export Profile as PNG Card

- Uses the shareable profile card system (Section 5.9.2)
- "Export" button in the sidebar action area
- Template selector, then "Download" or "Share"
- Downloaded file name: `propulse-{callsign}-profile.png`

#### Print-Friendly View

- A "Print" button generates a clean, light-themed layout suitable for paper
- Removes navigation, dark backgrounds, animations
- Shows: callsign, name, grid, license, DXCC progress, contact info, QR code
- Formatted to fit on a standard 3.5" x 2" card (business card size) for QSL card reference
- Uses `@media print` CSS rules

---

## 6. Data Model

### 6.1 Supabase Tables

#### `profiles` Table

```sql
CREATE TABLE profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callsign      TEXT NOT NULL UNIQUE,
  operator_name TEXT,
  bio           TEXT CHECK (char_length(bio) <= 2000),
  avatar_url    TEXT,
  home_grid     TEXT CHECK (home_grid ~ '^[A-R]{2}[0-9]{2}([a-x]{2})?$'),
  home_lat      DOUBLE PRECISION,
  home_lon      DOUBLE PRECISION,
  timezone      TEXT,

  -- License info
  license_country  TEXT,
  license_class    TEXT,
  license_expiry   DATE,
  license_grant    DATE,
  license_id       TEXT,
  license_history  JSONB DEFAULT '[]'::JSONB,

  -- Social links
  website_url   TEXT,
  twitter_handle TEXT,
  mastodon_url  TEXT,

  -- Privacy settings
  visibility    TEXT NOT NULL DEFAULT 'public'
                CHECK (visibility IN ('public', 'friends_only', 'private')),
  visibility_settings JSONB DEFAULT '{}'::JSONB,

  -- Status tracking
  last_active_at   TIMESTAMPTZ,
  status_sharing   BOOLEAN NOT NULL DEFAULT true,

  -- Cached statistics (updated periodically by Edge Function or client push)
  stats_cache   JSONB DEFAULT '{}'::JSONB,

  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_profiles_callsign ON profiles (UPPER(callsign));
CREATE INDEX idx_profiles_user_id ON profiles (user_id);
CREATE INDEX idx_profiles_home_grid ON profiles (home_grid);
CREATE INDEX idx_profiles_last_active ON profiles (last_active_at DESC);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

**`stats_cache` JSONB structure:**

```typescript
interface ProfileStatsCache {
  totalQsos: number;
  qsosThisYear: number;
  dxccWorked: number;
  dxccConfirmed: number;
  statesWorked: number;
  zonesWorked: number;
  currentStreak: number;
  longestStreak: number;
  favoriteMode: string;
  favoriteBand: string;
  lastQsoDate: string;
  updatedAt: string; // ISO timestamp of when cache was last refreshed
}
```

**`visibility_settings` JSONB structure:**

```typescript
interface VisibilitySettings {
  identity?: "public" | "friends_only" | "private";
  license?: "public" | "friends_only" | "private";
  awards?: "public" | "friends_only" | "private";
  heatmap?: "public" | "friends_only" | "private";
  statistics?: "public" | "friends_only" | "private";
  qsl?: "public" | "friends_only" | "private";
  social?: "public" | "friends_only" | "private";
  activityFeed?: "public" | "friends_only" | "private";
  onlineStatus?: "public" | "friends_only" | "private" | "disabled";
}
```

#### `achievements` Table

```sql
CREATE TABLE achievements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id     TEXT NOT NULL,         -- e.g., "dx_hunter", "cw_enthusiast"
  tier         TEXT NOT NULL           -- "bronze", "silver", "gold", "platinum"
               CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  progress     INTEGER NOT NULL DEFAULT 0,  -- current count toward next tier
  threshold    INTEGER NOT NULL DEFAULT 0,  -- next tier threshold
  earned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata     JSONB DEFAULT '{}'::JSONB,   -- badge-specific extra data

  UNIQUE (profile_id, badge_id, tier)
);

CREATE INDEX idx_achievements_profile ON achievements (profile_id);
CREATE INDEX idx_achievements_badge ON achievements (badge_id);
```

**`metadata` JSONB examples:**

```typescript
// DX Hunter badge
{ topEntities: ["JA", "VK", "ZL", "G", "DL"] }

// Marathon Runner badge
{ streakStart: "2025-10-01", streakEnd: "2025-11-16" }

// Contest Fighter badge
{ bestContest: "cqww-ssb", bestScore: 145000 }
```

#### `follows` Table

```sql
CREATE TABLE follows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX idx_follows_follower ON follows (follower_id);
CREATE INDEX idx_follows_following ON follows (following_id);

-- Materialized view for mutual friends (optional optimization)
CREATE VIEW mutual_friends AS
SELECT
  f1.follower_id AS user_a,
  f1.following_id AS user_b
FROM follows f1
JOIN follows f2
  ON f1.follower_id = f2.following_id
  AND f1.following_id = f2.follower_id;
```

#### `activity_feed` Table

```sql
CREATE TABLE activity_feed (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  event_data   JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_feed_profile ON activity_feed (profile_id, created_at DESC);
CREATE INDEX idx_activity_feed_created ON activity_feed (created_at DESC);

-- Retention policy: delete events older than 90 days
-- (Implemented via pg_cron or Supabase scheduled function)
```

**`event_data` JSONB structure by event type:**

```typescript
// "dxcc_confirmed"
{ entity: "Japan", entityId: 339, band: "20m", callsign: "JA1XYZ" }

// "achievement_earned"
{ badgeId: "dx_hunter", tier: "gold", description: "Confirmed 100 DXCC entities" }

// "contest_entered"
{ contestId: "cqww-ssb", contestName: "CQ WW DX SSB" }

// "contest_completed"
{ contestId: "cqww-ssb", contestName: "CQ WW DX SSB", score: 145000, qsoCount: 312 }

// "pota_activation"
{ parkRef: "K-1234", parkName: "Blue Ridge Parkway" }

// "milestone"
{ type: "qso_count", value: 10000, label: "10,000th QSO!" }
```

#### `saved_locations` Table (optional — for cloud persistence of locations)

```sql
CREATE TABLE saved_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  grid            TEXT NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  timezone        TEXT,
  location_type   TEXT NOT NULL DEFAULT 'other',
  activation_ref  TEXT,
  is_home         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_locations_profile ON saved_locations (profile_id);
```

### 6.2 Relationship to Existing IndexedDB Data

The migration strategy follows a **local-first, cloud-optional** pattern:

```
                  +-------------------+
                  |  IndexedDB        |
                  |  (source of truth |
                  |   for logbook)    |
                  +--------+----------+
                           |
                    compute on client
                           |
                  +--------v----------+
                  |  Zustand Stores   |
                  |  (runtime state)  |
                  +--------+----------+
                           |
              sync profile + achievements
                           |
                  +--------v----------+
                  |  Supabase         |
                  |  (cloud state)    |
                  |  profiles         |
                  |  achievements     |
                  |  follows          |
                  |  activity_feed    |
                  +-------------------+
```

**What stays in IndexedDB:**

- `logEntries` (QSO records) — remains local-only for this phase
- `alertRules` and `alertHistory` — remains local-only

**What stays in localStorage (via Zustand persist):**

- `propulse-user` (UserPreferences) — app settings, radios, notification prefs
- `propulse-dxcc` (DXCC tracking data) — stays local, but summary is synced to `profiles.stats_cache`

**What moves to Supabase:**

- Profile identity data (callsign, name, grid, bio, avatar, license, links)
- Achievement badges (earned tiers)
- Social graph (follows)
- Activity feed events
- Profile visibility settings
- Online status heartbeat

### 6.3 Migration Strategy

#### Phase 1: Read from Local, Write to Both

1. On first launch after the profile feature ships, detect existing `UserStation` data in `userStore`
2. Prompt the operator to create a Supabase account (see Section 10 for auth flow)
3. On account creation, copy existing profile fields to the Supabase `profiles` row:
   - `station.callsign` -> `profiles.callsign`
   - `station.operatorName` -> `profiles.operator_name`
   - `station.savedLocations[home]` -> `profiles.home_grid`, `home_lat`, `home_lon`
   - `preferences.license` -> `profiles.license_*` fields
4. The local `userStore` remains the runtime source for app-internal features (propagation calc, contest headers)
5. Profile edits write to both local store and Supabase simultaneously
6. If Supabase is unreachable, writes queue locally and sync on reconnect (via `syncQueueStore`)

#### Phase 2: Supabase as Source of Truth (Future)

- Profile data reads from Supabase first, falls back to local
- Local store becomes a cache layer
- This phase is out of scope for this PRD but the architecture supports it

---

## 7. UI/UX Design Specifications

### 7.1 Color Palette

All profile components use the established Propulse dark theme:

| Token           | Hex                      | Usage                                           |
| --------------- | ------------------------ | ----------------------------------------------- |
| `void-black`    | `#0A0A1A`                | Page background, card backgrounds               |
| `deep-space`    | `#0F0F2E`                | Card surfaces, elevated panels                  |
| `space-900`     | `#1A1A3E`                | Hover states, active tabs                       |
| `plasma-orange` | `#FF6B35`                | Primary accent, callsign text, CTAs             |
| `signal-green`  | `#00D96C`                | Success states, confirmed counts, active status |
| `caution-amber` | `#FFB800`                | Warning states, pending sync                    |
| `alert-red`     | `#FF3B3B`                | Error states, expired license                   |
| `nebula-blue`   | `#3B82F6`                | Secondary accent, links, worked-but-unconfirmed |
| `panel`         | `rgba(255,255,255,0.05)` | Card borders, dividers                          |

**Badge tier colors:**

| Tier     | Border Gradient                        | Glow                    |
| -------- | -------------------------------------- | ----------------------- |
| Bronze   | `#CD7F32` to `#8B4513`                 | `rgba(205,127,50,0.3)`  |
| Silver   | `#C0C0C0` to `#808080`                 | `rgba(192,192,192,0.3)` |
| Gold     | `#FFD700` to `#B8860B`                 | `rgba(255,215,0,0.3)`   |
| Platinum | `#E5E4E2` to `#B0B0B0` with blue sheen | `rgba(229,228,226,0.4)` |

### 7.2 Typography Hierarchy

| Element          | Font                           | Size | Weight | Color                   |
| ---------------- | ------------------------------ | ---- | ------ | ----------------------- |
| Callsign (hero)  | `JetBrains Mono` / system mono | 28px | 700    | plasma-orange           |
| Section headings | `Inter`                        | 18px | 600    | white                   |
| Card titles      | `Inter`                        | 14px | 600    | white                   |
| Body text        | `Inter`                        | 14px | 400    | `rgba(255,255,255,0.8)` |
| Stat values      | `JetBrains Mono` / system mono | 36px | 700    | plasma-orange           |
| Stat labels      | `Inter`                        | 12px | 400    | `rgba(255,255,255,0.5)` |
| Badge names      | `Inter`                        | 11px | 500    | white                   |
| Timestamps       | `Inter`                        | 12px | 400    | `rgba(255,255,255,0.4)` |

### 7.3 Card Components

All content on the profile page is contained in card components:

```css
.profile-card {
  background: rgba(15, 15, 46, 0.6); /* deep-space at 60% */
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 20px;
  backdrop-filter: blur(8px);
}

.profile-card:hover {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(15, 15, 46, 0.8);
}
```

Card variants:

- **Stat card:** Compact, 1-2 values, minimal padding (12px)
- **Content card:** Standard, scrollable content area
- **Interactive card:** Hover effect, cursor pointer, click action
- **Badge card:** Fixed 48x48px icon area + text, metallic border for earned badges

### 7.4 Layout Grid

- Desktop main content: CSS Grid with `grid-template-columns: 320px 1fr`
- Tab content area: CSS Grid with responsive columns via `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
- Stat cards: `grid-template-columns: repeat(4, 1fr)` on desktop, `repeat(2, 1fr)` on mobile
- Badge grid: `grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))`
- Gap: 16px (desktop), 12px (mobile)

### 7.5 Animations and Transitions

| Element                 | Animation               | Duration | Easing      |
| ----------------------- | ----------------------- | -------- | ----------- |
| Tab switch              | Content fade + slide    | 200ms    | ease-out    |
| Badge earn notification | Scale up + glow pulse   | 500ms    | spring      |
| Progress ring fill      | Stroke-dashoffset       | 800ms    | ease-in-out |
| Heatmap cell hover      | Scale 1.0 to 1.3        | 150ms    | ease-out    |
| Status dot pulse        | Opacity 1.0 to 0.4 loop | 2000ms   | ease-in-out |
| Card enter (on scroll)  | Fade up 20px            | 300ms    | ease-out    |
| QR code modal           | Scale 0.9 to 1.0 + fade | 250ms    | ease-out    |

All animations respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 7.6 Loading States and Skeletons

Every data-dependent section shows a skeleton placeholder while loading:

- **Profile card skeleton:** Circular avatar placeholder (pulse animation), 3 text lines of varying width
- **Stat card skeleton:** Rectangle placeholder for number, shorter rectangle for label
- **Heatmap skeleton:** Grid of uniformly gray cells
- **Badge grid skeleton:** Grid of circular placeholders
- **Activity feed skeleton:** 3 card placeholders with avatar circle + text lines

Skeleton components use a shared `Skeleton` primitive:

```tsx
<Skeleton className="h-8 w-32 rounded" />  // text line
<Skeleton className="h-12 w-12 rounded-full" />  // avatar
```

Background: `rgba(255,255,255,0.05)` with a shimmer gradient animation sweeping left to right.

---

## 8. Mobile Experience

### 8.1 Full Mobile Layout

The mobile profile layout follows the existing Propulse mobile design language (bottom tab bar, stacked cards, swipe gestures):

```
+-------------------------------+
|  < Profile         [Edit] [+] |  <- Compact header with back + actions
+-------------------------------+
|  +-------------------------+  |
|  |  [Avatar]  N5XXX        |  |  <- Profile card (horizontal layout)
|  |  John Smith | EM10fx    |  |
|  |  Extra | Active Now     |  |
|  |  [Share] [QR] [Follow]  |  |
|  +-------------------------+  |
|                               |
|  [Overview] [Awards] [Stats]  |  <- Horizontal scroll tabs
|                               |
|  +-------------------------+  |
|  |  DXCC    [===......] 42%|  |  <- Compact award rings
|  |  WAS     [====.....] 56%|  |
|  |  WAZ     [==.......] 25%|  |
|  +-------------------------+  |
|                               |
|  +-------------------------+  |
|  |  Activity Heatmap       |  |  <- Horizontally scrollable
|  |  [<<< scroll >>>]       |  |
|  +-------------------------+  |
|                               |
+-------------------------------+
|  [Home] [Solar] [Map] [...] |  <- Existing bottom tab bar
+-------------------------------+
```

Key mobile adaptations:

- Profile card uses horizontal layout (avatar left, info right) instead of vertical
- Award progress uses horizontal bars instead of rings to save vertical space
- Activity heatmap is horizontally scrollable with momentum
- Stats use 2-column grid instead of 4-column
- Social tab shows a simplified friend list (avatar + callsign only)
- Tab bar uses horizontal scroll with active tab indicator line

### 8.2 QR Code Display (Mobile)

Optimized for the "show your phone at a hamfest" use case:

- Enters full-screen mode (hides navigation bars)
- Background switches to pure white for maximum contrast with QR modules
- QR code rendered at maximum available screen width minus 32px margin
- Screen brightness request via `navigator.wakeLock` API (keeps screen on)
- Large callsign text above QR: 48px bold
- "Tap anywhere to close" instruction at bottom
- Orientation: portrait lock via `screen.orientation.lock('portrait')` (where supported)
- If the scanned profile is a Propulse user, the recipient sees the full profile; if not, they see a "Join Propulse" landing page with the operator's callsign pre-filled

### 8.3 Touch-Friendly Interactions

| Element                | Touch Target                     | Gesture                    |
| ---------------------- | -------------------------------- | -------------------------- |
| Tab buttons            | 48px height, full-width segments | Tap to switch              |
| Badge cards            | 48x48px minimum                  | Tap to expand detail       |
| Heatmap cells          | 16x16px with 8px touch padding   | Tap to show popover        |
| Follow/Unfollow button | 44x44px                          | Tap                        |
| Friend card            | Full card area (min 64px height) | Tap to navigate            |
| Share button           | 44x44px                          | Tap triggers Web Share API |
| Edit fields            | 44px height minimum              | Tap to focus               |

Swipe gestures:

- Heatmap: horizontal swipe to scroll weeks
- Friend list: swipe left on friend card to reveal "Unfollow" action
- Profile card (when viewing others): swipe down to dismiss

### 8.4 Web Share API Integration

On mobile devices that support the Web Share API, the "Share" button triggers the native share sheet:

```typescript
async function shareProfile(callsign: string, statsCache: ProfileStatsCache) {
  const shareData: ShareData = {
    title: `${callsign} — Propulse Profile`,
    text: `Check out ${callsign}'s ham radio profile on Propulse! ${statsCache.totalQsos} QSOs, ${statsCache.dxccConfirmed} DXCC confirmed.`,
    url: `https://propulse.app/profile/${callsign}`,
  };

  if (navigator.canShare?.(shareData)) {
    await navigator.share(shareData);
  } else {
    // Fallback: copy URL to clipboard
    await navigator.clipboard.writeText(shareData.url!);
    toast.success("Profile link copied to clipboard");
  }
}
```

For image sharing (profile card PNG), the share data includes a `files` array with the generated Blob.

### 8.5 Profile Card at Hamfest

The complete flow when someone scans your QR code at a hamfest:

1. Operator opens QR modal on their phone (full-screen, bright)
2. Other person scans with their phone camera
3. Phone opens `https://propulse.app/profile/{callsign}` in their browser
4. If the other person is a Propulse user: they see the profile and a "Follow" button
5. If not a Propulse user: they see a public profile view with a "Sign up to connect" CTA
6. The public view shows: callsign, name, grid, license class, DXCC count, top achievements
7. Mobile-optimized: loads in under 2 seconds on 4G, no app install required

---

## 9. Integration Points

### 9.1 Profile to DX Wizard

The DX Wizard uses the operator's profile for:

| DX Wizard Field                                 | Profile Source                                               | Fallback                                 |
| ----------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- |
| Home QTH (grid, lat, lon)                       | `profiles.home_grid`, `home_lat`, `home_lon`                 | `userStore.station.savedLocations[home]` |
| Antenna type                                    | `userStore.preferences.antennaType` (stays in preferences)   | Default dipole                           |
| License privileges (max power, available bands) | `profiles.license_class` + `license_country`                 | Assume Extra/Full                        |
| Active radio                                    | `userStore.preferences.activeRadioId` (stays in preferences) | No radio context                         |

The DX Wizard reads profile data via the existing `useUserStore` hooks. When Supabase is the source of truth (Phase 2), the hooks will transparently read from cache-backed Supabase data.

### 9.2 Profile to Contest Logging

Contest sessions use profile data for:

| Contest Field                                            | Profile Source                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `myCallsign`                                             | `profiles.callsign`                                               |
| `myExchange` (when exchange includes state/section/grid) | `profiles.home_grid`, operator's ARRL section (derived from grid) |
| Cabrillo `CALLSIGN` header                               | `profiles.callsign`                                               |
| Cabrillo `NAME` header                                   | `profiles.operator_name`                                          |
| Cabrillo `LOCATION` header                               | ARRL section derived from `profiles.home_grid`                    |
| Category selection (power)                               | Informed by `profiles.license_class` max power                    |

### 9.3 Profile to Cabrillo Export

The `CabrilloHeader` interface in `src/lib/export/types.ts` maps directly from profile:

```typescript
function buildCabrilloHeader(
  profile: SupabaseProfile,
  session: ContestSession,
): CabrilloHeader {
  return {
    CONTEST: session.contestId,
    CALLSIGN: profile.callsign,
    NAME: profile.operator_name ?? "",
    LOCATION: deriveARRLSection(profile.home_grid) ?? "",
    CATEGORY_OPERATOR: session.categories.operator,
    CATEGORY_BAND: session.categories.band,
    CATEGORY_MODE: session.categories.mode,
    CATEGORY_POWER: session.categories.power,
    CATEGORY_ASSISTED: session.categories.assisted,
    CATEGORY_TRANSMITTER: "ONE",
    CLAIMED_SCORE: session.score,
  };
}
```

### 9.4 Profile to PropSphere OperatorProfile Overlay

The existing `src/components/map/OperatorProfile.tsx` compact card currently reads from `useUserStore`. After this feature ships:

- The compact card continues to read from the local store (fast, no network dependency)
- It gains a "View Full Profile" link that navigates to `/profile`
- The avatar from the profile (if uploaded) is displayed as a small circle on the compact card
- License expiration warnings from the full profile are mirrored on the compact card

### 9.5 Profile to Equipment / Shack

The profile Overview tab includes an "Equipment Summary" section:

```
+--------------------------------------------------+
|  MY STATION                                       |
|                                                   |
|  Active Radio: Icom IC-7300                       |
|  Antenna: 3-element Yagi                          |
|  Power: 100W                                      |
|                                                   |
|  [View All Equipment]                             |
+--------------------------------------------------+
```

- Radio data is sourced from `userStore.preferences.radios[]` and `activeRadioId`
- Antenna type from `userStore.preferences.antennaType`
- The "View All Equipment" link navigates to the Settings modal Radio Manager section
- Equipment data stays in `userStore` (local preferences), not migrated to Supabase, because radio configurations are device-specific (e.g., different radios at home vs portable)

### 9.6 Profile vs Settings Boundary

Clear separation of concerns:

| In Profile (`/profile`)         | In Settings (`SettingsModal`)                         |
| ------------------------------- | ----------------------------------------------------- |
| Callsign, name, bio, avatar     | Theme, time format, text scale                        |
| Grid, home QTH, saved locations | Color blind mode                                      |
| License info and history        | Notification preferences                              |
| Social links                    | Favored bands, band presets                           |
| Awards and achievements         | Radio equipment configuration                         |
| Statistics and heatmap          | Spot clustering, compass rose, spot age               |
| Friends and activity feed       | UI interaction preferences                            |
| QSL summary                     | Forecast display preferences                          |
| Visibility/privacy settings     | Bridge connection settings                            |
|                                 | Noise environment                                     |
|                                 | QSL service credentials (LoTW/eQSL/ClubLog passwords) |

Rule of thumb: **Profile = who you are and what you've done. Settings = how the app behaves.**

---

## 10. Supabase Requirements

### 10.1 Authentication

**Primary auth method: Magic link (passwordless email)**

Flow:

1. Operator clicks "Sign In" on profile page (or prompted during onboarding)
2. Modal asks for email address
3. Supabase sends a magic link email
4. Operator clicks link; Supabase creates session
5. On first sign-in, operator is prompted to set their callsign
6. Callsign is verified (see Section 13.2) and the `profiles` row is created

**Why magic link over password:**

- Ham radio operators skew older demographic; password management is a common friction point
- Callsign-based auth would require a separate verification system
- Magic link is zero-friction: enter email, click link, done
- Supabase supports magic link natively with no additional infrastructure

**Session management:**

- JWT-based sessions with 7-day refresh token
- Session persisted in localStorage (via Supabase client SDK)
- Automatic token refresh on page load
- Sign-out clears session but does not delete local data (localStorage/IndexedDB)

**Alternative auth methods (enabled but not primary):**

- Google OAuth (for operators who prefer it)
- GitHub OAuth (for developer-oriented operators)
- Email + password (available as a fallback if operator prefers)

**Callsign binding:**

- Each Supabase `auth.users` account maps to exactly one `profiles.callsign`
- Callsign is set during onboarding and can be changed (with verification) in profile settings
- Callsign changes are rate-limited to 1 per 30 days

### 10.2 Real-Time Subscriptions

Supabase Realtime is used for two features:

**Online status:**

- Subscribe to `profiles` table changes on `last_active_at` column
- Filter: only profiles where `id IN (SELECT following_id FROM follows WHERE follower_id = current_user_profile_id)`
- This gives real-time friend status updates without polling
- Channel: `online-status:{profile_id}`

**Activity feed:**

- Subscribe to `activity_feed` table inserts
- Filter: `profile_id IN (SELECT following_id FROM follows WHERE follower_id = current_user_profile_id)`
- New events appear in the feed without page refresh
- Channel: `feed:{profile_id}`

**Subscription management:**

- Subscriptions are created when the Social tab is active
- Subscriptions are destroyed when navigating away from the profile page
- A shared `useRealtimeSubscription` hook manages subscription lifecycle

### 10.3 Row-Level Security Policies

```sql
-- Profiles: anyone can read public profiles
CREATE POLICY "Public profiles are viewable by anyone"
  ON profiles FOR SELECT
  USING (visibility = 'public');

-- Profiles: friends can see friends-only profiles
CREATE POLICY "Friends can view friends-only profiles"
  ON profiles FOR SELECT
  USING (
    visibility = 'friends_only'
    AND EXISTS (
      SELECT 1 FROM follows f1
      JOIN follows f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
      WHERE f1.follower_id = (
        SELECT id FROM profiles WHERE user_id = auth.uid()
      )
      AND f1.following_id = profiles.id
    )
  );

-- Profiles: users can always read their own
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (user_id = auth.uid());

-- Profiles: users can only update their own
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Follows: authenticated users can create follows
CREATE POLICY "Authenticated users can follow"
  ON follows FOR INSERT
  WITH CHECK (
    follower_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Follows: users can delete their own follows
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  USING (
    follower_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Follows: users can see their own follows and followers
CREATE POLICY "Users can see own follow graph"
  ON follows FOR SELECT
  USING (
    follower_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR following_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Achievements: readable by anyone who can see the profile
CREATE POLICY "Achievements follow profile visibility"
  ON achievements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = achievements.profile_id
      AND (
        p.visibility = 'public'
        OR p.user_id = auth.uid()
        OR (
          p.visibility = 'friends_only'
          AND EXISTS (
            SELECT 1 FROM follows f1
            JOIN follows f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
            WHERE f1.follower_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
            AND f1.following_id = p.id
          )
        )
      )
    )
  );

-- Achievements: only the profile owner can insert/update
CREATE POLICY "Users can manage own achievements"
  ON achievements FOR ALL
  USING (
    profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Activity feed: follows profile visibility + follow relationship
CREATE POLICY "Feed visible to followers"
  ON activity_feed FOR SELECT
  USING (
    profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM follows
      WHERE follower_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
      AND following_id = activity_feed.profile_id
    )
  );

-- Activity feed: only profile owner can insert
CREATE POLICY "Users can create own feed events"
  ON activity_feed FOR INSERT
  WITH CHECK (
    profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );
```

### 10.4 Storage Bucket

```sql
-- Create storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,                             -- Public read access
  5242880,                          -- 5MB max upload size
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);
```

**Storage policies:**

```sql
-- Anyone can read profile photos (bucket is public)
CREATE POLICY "Public read for profile photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-photos');

-- Users can upload to their own folder
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own avatar
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own avatar
CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

### 10.5 Edge Functions

| Function                    | Trigger                             | Purpose                                                      |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `api/callsign-lookup`       | HTTP GET from client                | Proxy callsign lookup to callook.info / HamQTH to avoid CORS |
| `api/og/profile/{callsign}` | HTTP GET from social media crawlers | Generate Open Graph image for profile link previews          |
| `api/profile/sync-stats`    | HTTP POST from client (debounced)   | Accept stats_cache update from client after logbook changes  |
| `api/profile/heartbeat`     | HTTP POST from client (every 60s)   | Update `last_active_at` for online status                    |
| `cleanup-activity-feed`     | Scheduled (daily via pg_cron)       | Delete activity_feed rows older than 90 days                 |

---

## 11. Accessibility

### 11.1 WCAG 2.1 AA Compliance

All profile components meet WCAG 2.1 Level AA standards:

**Color contrast:**

- All text meets 4.5:1 contrast ratio against its background
- Large text (18px+ bold or 24px+ regular) meets 3:1 ratio
- Interactive elements meet 3:1 contrast against adjacent colors
- Badge tier borders meet 3:1 against card background
- The existing Propulse color palette already meets these ratios (verified via APCA contrast checks)

**Focus indicators:**

- All interactive elements show a visible focus ring (2px solid plasma-orange, 2px offset)
- Focus rings are only shown for keyboard navigation (`:focus-visible`)
- Tab order follows visual layout (left to right, top to bottom)

### 11.2 Screen Reader Support

**Achievement badges:**

```html
<div
  role="img"
  aria-label="DX Hunter badge, Gold tier. 142 of 200 entities confirmed. 58 more for Platinum."
>
  <img src="..." alt="" aria-hidden="true" />
  <span class="sr-only"
    >DX Hunter, Gold tier, 142 of 200 entities confirmed</span
  >
</div>
```

**Progress rings:**

```html
<svg
  role="img"
  aria-label="DXCC progress: 142 entities worked, 98 confirmed, out of 340 total"
>
  <title>DXCC Progress</title>
  <!-- SVG content -->
</svg>
```

**Activity heatmap:**

```html
<div
  role="grid"
  aria-label="Activity heatmap showing daily QSO counts for the past 12 months"
>
  <div role="row" aria-label="Monday">
    <div role="gridcell" aria-label="February 7, 2026: 12 QSOs">...</div>
  </div>
</div>
```

**Status indicators:**

```html
<span aria-label="Currently active" role="status">
  <span class="green-dot" aria-hidden="true"></span>
</span>
```

**Activity feed:**

```html
<div role="feed" aria-label="Activity feed from operators you follow">
  <article
    role="article"
    aria-label="JA1XYZ confirmed Japan on 20m, 2 hours ago"
  >
    ...
  </article>
</div>
```

### 11.3 Keyboard Navigation

| Key                | Context                           | Action                                  |
| ------------------ | --------------------------------- | --------------------------------------- |
| `Tab`              | Profile page                      | Move focus between interactive elements |
| `Shift+Tab`        | Profile page                      | Move focus backwards                    |
| `Enter` / `Space`  | Button, link, badge               | Activate element                        |
| `Arrow Left/Right` | Tab bar                           | Switch tabs                             |
| `Arrow Left/Right` | Heatmap row                       | Move between cells                      |
| `Arrow Up/Down`    | Heatmap column                    | Move between rows                       |
| `Escape`           | QR modal, popover, expanded badge | Close/dismiss                           |
| `Home`             | Tab bar                           | Go to first tab                         |
| `End`              | Tab bar                           | Go to last tab                          |

Tab bar implements `role="tablist"` with `role="tab"` children and `role="tabpanel"` content areas, following the WAI-ARIA Tabs pattern.

### 11.4 High Contrast Mode Compatibility

When `prefers-contrast: more` is active:

- Card backgrounds increase opacity to 90%
- Border colors increase to `rgba(255,255,255,0.2)`
- Badge outlines become 2px solid instead of gradients
- Heatmap cells add 1px borders between all cells
- Progress ring strokes increase to 4px width (from 3px)
- All decorative gradients flatten to solid colors

When the existing `colorBlindMode` (from `UserPreferences`) is active, chart colors use the configured color-blind-safe palette (already implemented in `src/lib/themes/colorblind.ts`). The donut chart and bar chart respect this palette automatically.

---

## 12. Performance

### 12.1 Lazy Loading Strategy

| Component              | Load Trigger                 | Bundle Split                                    |
| ---------------------- | ---------------------------- | ----------------------------------------------- |
| Activity Heatmap       | Stats tab selected           | Dynamic `import()`                              |
| Donut/Bar Charts       | Stats tab selected           | Dynamic `import()` (shared chart library chunk) |
| QR Code Generator      | "Show QR" button clicked     | Dynamic `import()` of `qrcode` library          |
| Profile Card Generator | "Export Card" button clicked | Dynamic `import()` of canvas rendering utils    |
| Friend List            | Social tab selected          | Dynamic `import()`                              |
| Activity Feed          | Social tab selected          | Dynamic `import()`                              |

The Overview tab (default) loads eagerly. All other tabs load their content on first selection and cache the component for subsequent visits within the session.

**Route-level code splitting:**

```typescript
const ProfilePage = lazy(() =>
  import("@/pages/Profile").then((m) => ({ default: m.Profile })),
);
```

Estimated bundle sizes:

- Profile page core (identity, license, awards summary): ~45 KB gzipped
- Stats tab (heatmap, charts): ~30 KB gzipped (chart library)
- Social tab (feed, friends): ~15 KB gzipped
- QR code generation: ~8 KB gzipped
- Profile card canvas rendering: ~12 KB gzipped

### 12.2 Image Optimization

**Profile photos:**

- Client-side resize to 512x512px before upload (using OffscreenCanvas or Canvas API)
- Compress to WebP at quality 80
- Supabase Storage serves images via CDN with automatic format negotiation
- Browser `loading="lazy"` on all avatar images except the profile owner's sidebar avatar
- Placeholder: 24x24px blurred thumbnail inline as `data:` URI (generated during upload)

**Badge icons:**

- SVG sprites for badge icons (single HTTP request for all badges)
- SVG symbols defined once, referenced via `<use>` elements
- Total badge sprite: ~15 KB (18 badges x ~800 bytes each)

**Heatmap rendering:**

- Canvas-based rendering (not individual DOM elements) for the 365-day grid
- Single canvas element re-rendered on filter change
- Canvas size: 636x84px (53 weeks x 12px cells with 2px gaps)
- Total render time: < 5ms on mid-range mobile

### 12.3 Caching Strategy

| Data                    | Cache Location                                 | TTL                           | Invalidation                           |
| ----------------------- | ---------------------------------------------- | ----------------------------- | -------------------------------------- |
| Own profile data        | Zustand store (memory) + Supabase client cache | Session                       | On edit                                |
| Other profiles          | Supabase client cache + React Query            | 5 minutes                     | On profile view refocus                |
| Friend online status    | Zustand store (memory)                         | Real-time (Supabase Realtime) | Subscription updates                   |
| Activity feed           | React Query                                    | 2 minutes                     | On Social tab focus + Realtime inserts |
| Stats computations      | `useMemo` keyed on logbook entry count         | Session                       | On new logbook entry                   |
| Achievement badges      | Zustand store (memory)                         | Session                       | On badge computation trigger           |
| Callsign lookup results | `sessionStorage`                               | Browser session               | Manual re-lookup                       |
| Profile photos (CDN)    | Browser cache (Supabase CDN headers)           | 24 hours                      | On avatar upload                       |

**React Query configuration for profile data:**

```typescript
{
  staleTime: 5 * 60 * 1000,   // 5 minutes
  gcTime: 30 * 60 * 1000,     // 30 minutes garbage collection
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  retry: 2,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
}
```

---

## 13. Security and Privacy

### 13.1 Data Residency

| Data Category                                | Storage                   | Encryption                                   |
| -------------------------------------------- | ------------------------- | -------------------------------------------- |
| Profile identity (callsign, name, grid, bio) | Supabase (cloud)          | At rest (Supabase default AES-256)           |
| Profile photo                                | Supabase Storage (cloud)  | At rest                                      |
| Achievement badges                           | Supabase (cloud)          | At rest                                      |
| Social graph (follows)                       | Supabase (cloud)          | At rest                                      |
| Activity feed                                | Supabase (cloud)          | At rest                                      |
| QSO records                                  | IndexedDB (local only)    | None (browser-level only)                    |
| QSL service credentials                      | localStorage (local only) | None (browser-level only; stored as entered) |
| App preferences                              | localStorage (local only) | None                                         |
| Session token                                | localStorage (local only) | JWT signed by Supabase                       |

**Critical:** QSL service credentials (LoTW, eQSL, ClubLog passwords) are never sent to Supabase. They remain in the local `userStore` and are only used for direct API calls from the client to the respective QSL services.

### 13.2 Callsign Verification

To prevent impersonation (someone claiming a callsign they do not hold), the following verification strategy is used:

**Tier 1 — Basic validation (always enforced):**

- Callsign format must match ITU pattern: 1-3 character prefix (letter+digit or digit+letter combinations), followed by 1-4 suffix characters
- Callsign must exist in a recognized callsign database (callook.info for US, or HamQTH)
- If the callsign does not exist in any database, a warning is shown but the operator can proceed (supports new calls not yet indexed)

**Tier 2 — Email domain correlation (best-effort):**

- If the operator signs up with an email that matches a domain associated with a known amateur radio organization (e.g., `@arrl.net`), the verification confidence is higher
- This is informational only, not enforced

**Tier 3 — Challenge verification (optional, future):**

- The operator is asked to add a specific text string to their QRZ.com or HamQTH bio
- Propulse checks for the string via API lookup
- If found, the callsign is "verified" and a checkmark badge appears on the profile
- This is not required for profile creation; it is an optional trust signal

**Dispute resolution:**

- If two accounts claim the same callsign, the first account retains it
- A dispute form (email-based, manual review) is available for the true license holder to reclaim their callsign
- Disputed profiles are flagged and reviewed by an admin

### 13.3 Privacy Controls

Each profile section has independent visibility controls (defined in Section 5.9.6). Additional privacy measures:

**Data minimization:**

- Grid squares on public profiles are truncated to 4 characters (e.g., `EM10` instead of `EM10fx`) unless the operator explicitly allows 6-character display
- Exact lat/lon is never exposed in public profile API responses; only the grid square center point
- Operating statistics on public profiles show rounded numbers (e.g., "~12,800 QSOs" instead of "12,847")

**Right to deletion:**

- "Delete Account" button in profile settings
- Triggers Supabase `auth.users` deletion, which cascades to all profile data
- Local data (IndexedDB, localStorage) is cleared on the current device
- A confirmation modal warns that this action is irreversible and lists what will be deleted
- 30-day soft delete window: the profile row is marked `deleted_at` and fully purged after 30 days. If the operator signs back in within 30 days, the profile is restored.

**Data export:**

- "Export My Data" button generates a JSON file containing all Supabase data for the profile (profile, achievements, follows, activity feed)
- Conforms to GDPR Article 20 (data portability)
- Export file includes a manifest describing each data type and its schema

### 13.4 GDPR Considerations

Propulse serves EU-based operators, so GDPR compliance is required:

| GDPR Requirement                | Implementation                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Lawful basis for processing** | Consent (explicit opt-in during account creation)                                                                                         |
| **Right to access**             | "Export My Data" feature (JSON download)                                                                                                  |
| **Right to rectification**      | Profile edit functionality                                                                                                                |
| **Right to erasure**            | "Delete Account" with cascade deletion                                                                                                    |
| **Right to data portability**   | JSON export includes all personal data                                                                                                    |
| **Data minimization**           | Only necessary fields stored; grid truncation on public view                                                                              |
| **Privacy by design**           | Default visibility is "public" for ham-relevant data (callsign, grid), "friends only" for social data. Operators can restrict everything. |
| **Consent withdrawal**          | Account deletion removes all cloud data                                                                                                   |
| **Data breach notification**    | Supabase handles infrastructure-level incidents; application-level monitoring via Supabase audit logs                                     |

**Cookie/tracking notice:**

- Propulse does not use tracking cookies or third-party analytics in the client
- Supabase auth uses a session JWT in localStorage (not a cookie)
- No cookie banner is needed (no cookies are set)

---

## 14. Phased Delivery Plan

Each phase produces a shippable increment. No timelines; phases are sequenced by dependency.

### Phase 1 — Profile Page Shell + Identity Section

**Dependencies:** None
**Scope:** Route, layout, sidebar card, identity editor, callsign lookup

**Deliverables:**

- `/profile` route added to `App.tsx` with lazy-loaded `Profile` page component
- Desktop sidebar + main content layout with tab skeleton
- Mobile stacked card + tab layout
- Identity section (callsign, name, grid, avatar placeholder, bio, social links)
- Callsign lookup integration via new `/api/callsign-lookup` Edge Function
- Profile completeness indicator
- Read data from existing `userStore`; no Supabase yet

**Done when:**

- Profile page renders with all identity data from local store
- Callsign lookup auto-fills fields from callook.info/HamQTH
- Profile completeness ring reflects filled fields
- Mobile layout is fully functional
- `npm run lint && npm run build` passes

### Phase 2 — Supabase Auth + Profile Table + Migration

**Dependencies:** Phase 1
**Scope:** Authentication, profiles table, local-to-cloud sync

**Deliverables:**

- Supabase project setup (auth, database, storage)
- Magic link authentication flow
- `profiles` table with RLS policies
- Migration logic: copy local `UserStation` + `LicenseInfo` to `profiles` row on first auth
- Dual-write: profile edits update both local store and Supabase
- Profile photo upload to Supabase Storage
- Graceful fallback when offline (reads local, queues writes)

**Done when:**

- Operator can sign in via magic link
- Profile data persists in Supabase and survives browser data clear
- Profile photo upload and display works
- Offline operation continues without errors
- RLS policies correctly restrict access

### Phase 3 — License Section + Location Management

**Dependencies:** Phase 1
**Scope:** License display, history, privileges; location cards and timeline

**Deliverables:**

- License card with expiration warnings
- License history timeline (manual entry)
- Band/mode privilege matrix lookup table
- Saved locations card grid with type badges
- Active location indicator on sidebar card
- Location history timeline derived from logbook data

**Done when:**

- License card shows all fields with appropriate visual warnings
- Privilege matrix correctly reflects license class band/mode/power limits
- Location cards show all saved locations with metadata
- Location switching works from the profile page

### Phase 4 — Awards, Achievements, and Stats

**Dependencies:** Phase 1, Phase 2 (for achievement sync)
**Scope:** DXCC/WAS/WAZ rings, badge system, heatmap, statistics

**Deliverables:**

- Award progress rings (DXCC, WAS, WAZ) on Overview tab
- Full achievement badge system with 18 badges x 4 tiers
- Achievement computation engine (reads from IndexedDB logbook + DXCC store)
- Achievement sync to Supabase `achievements` table
- Activity heatmap (365-day grid with filters)
- Operating statistics cards (headline stats, charts, records)
- Badge earn notification toasts

**Done when:**

- All 18 badges compute correctly from logbook data
- Progress rings animate and show accurate counts
- Heatmap renders 365 days with correct color mapping
- Statistics cards show accurate computed values
- Achievements sync to Supabase when authenticated

### Phase 5 — Social Features

**Dependencies:** Phase 2
**Scope:** Follows, friends, activity feed, online status

**Deliverables:**

- `follows` table with RLS policies
- Follow/unfollow buttons on other profiles
- Friends list on Social tab
- `activity_feed` table with event generation
- Activity feed UI with real-time updates (Supabase Realtime)
- Online status heartbeat and indicator dots
- "People you may know" discovery suggestions
- Profile visibility settings UI

**Done when:**

- Operators can follow/unfollow each other
- Activity feed shows events from followed operators in real time
- Online status indicators accurately reflect operator activity
- Visibility settings correctly gate profile section access
- Privacy controls work as specified

### Phase 6 — Sharing and Social Cards

**Dependencies:** Phase 4 (for stats in cards)
**Scope:** QR code, profile cards, Open Graph, print view

**Deliverables:**

- QR code modal with full-screen mobile optimization
- Shareable profile card generator (3 templates)
- Open Graph meta tag Edge Function (`/api/og/profile/{callsign}`)
- Web Share API integration on mobile
- Print-friendly CSS layout
- Public profile view for non-authenticated visitors

**Done when:**

- QR code generates and scans correctly
- All 3 profile card templates render accurately
- Social media link previews show correct OG image and text
- Mobile share sheet works on iOS and Android
- Print layout fits business card dimensions

### Phase 7 — Polish, Performance, and Accessibility Audit

**Dependencies:** Phases 1-6
**Scope:** Cross-cutting quality

**Deliverables:**

- Performance audit: bundle size, load time, render performance
- Accessibility audit: screen reader testing, keyboard navigation, contrast
- Edge case handling: empty states, error states, offline recovery
- Animation polish and `prefers-reduced-motion` respect
- Skeleton loading states for all data-dependent sections
- Documentation of data model and API contracts

**Done when:**

- Profile page loads in < 1.5 seconds on 4G
- All WCAG 2.1 AA criteria met
- All empty/error/loading states have appropriate UI
- All animations respect reduced motion preference
- `npm run lint && npm run build` passes

---

## 15. Open Questions

| ID   | Question                                                                                                         | Status | Decision                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| OQ-1 | Should the activity feed include QSO-level events (e.g., "N5XXX worked JA1XYZ on 20m") or only milestone events? | Open   | Leaning milestone-only to reduce noise and storage                                                       |
| OQ-2 | Should achievement badge definitions be configurable by the operator (custom thresholds) or fixed?               | Open   | Leaning fixed for simplicity and consistent community meaning                                            |
| OQ-3 | Should the profile page replace the current Settings modal's station setup section, or coexist?                  | Open   | Leaning coexist: profile is the rich view, settings modal keeps a simplified "quick setup" for new users |
| OQ-4 | Should we support vanity callsigns as profile aliases (e.g., W1AW as a secondary call for N5XXX)?                | Open   | Deferred to future iteration                                                                             |
| OQ-5 | Should the Open Graph image be generated on every request or pre-generated on profile update?                    | Open   | Leaning pre-generated on update + CDN cache for performance                                              |
| OQ-6 | Should the friends network support "blocking" (prevent someone from seeing your profile)?                        | Open   | Leaning yes, needed for community safety                                                                 |
| OQ-7 | What is the maximum number of follows per operator to prevent spam?                                              | Open   | Suggesting 500 follows, 10000 followers                                                                  |
| OQ-8 | Should profile data be included in ADIF exports (MY_NAME, MY_GRIDSQUARE fields)?                                 | Open   | Leaning yes, natural integration point                                                                   |

---

## 16. Appendix

### A. File Impact Summary

#### New Files

| File                                            | Purpose                                    |
| ----------------------------------------------- | ------------------------------------------ |
| `src/pages/Profile.tsx`                         | Profile page route component               |
| `src/components/profile/ProfileSidebar.tsx`     | Sidebar card with identity + actions       |
| `src/components/profile/IdentityEditor.tsx`     | Edit modal for identity fields             |
| `src/components/profile/LicenseCard.tsx`        | License display with expiration warnings   |
| `src/components/profile/LicenseHistory.tsx`     | License upgrade timeline                   |
| `src/components/profile/PrivilegeMatrix.tsx`    | Band/mode/power privilege grid             |
| `src/components/profile/LocationGrid.tsx`       | Saved locations card grid                  |
| `src/components/profile/LocationTimeline.tsx`   | Operating location history                 |
| `src/components/profile/AwardRings.tsx`         | DXCC/WAS/WAZ progress rings                |
| `src/components/profile/AchievementGrid.tsx`    | Badge grid with tier indicators            |
| `src/components/profile/AchievementDetail.tsx`  | Badge detail popover/modal                 |
| `src/components/profile/ActivityHeatmap.tsx`    | 365-day QSO heatmap (Canvas)               |
| `src/components/profile/StatsCards.tsx`         | Operating statistics card grid             |
| `src/components/profile/ModeChart.tsx`          | QSOs-by-mode donut chart                   |
| `src/components/profile/BandChart.tsx`          | QSOs-by-band bar chart                     |
| `src/components/profile/QSLSummary.tsx`         | QSL confirmation summary card              |
| `src/components/profile/FriendList.tsx`         | Friends card grid                          |
| `src/components/profile/ActivityFeed.tsx`       | Activity feed card list                    |
| `src/components/profile/QRCodeModal.tsx`        | Full-screen QR display                     |
| `src/components/profile/ShareCard.tsx`          | Profile card generator + template selector |
| `src/components/profile/VisibilitySettings.tsx` | Privacy control matrix                     |
| `src/components/profile/CompletenessRing.tsx`   | Profile completeness indicator             |
| `src/components/profile/ProfileTabs.tsx`        | Tab bar component for profile sections     |
| `src/stores/profileStore.ts`                    | Zustand store for Supabase profile state   |
| `src/stores/socialStore.ts`                     | Zustand store for follows + feed state     |
| `src/hooks/useAchievements.ts`                  | Badge computation hook                     |
| `src/hooks/useProfileStats.ts`                  | Statistics computation hook                |
| `src/hooks/useCallsignLookup.ts`                | Callsign auto-fill hook                    |
| `src/hooks/useRealtimeSubscription.ts`          | Supabase Realtime subscription hook        |
| `src/lib/data/licensePrivileges.ts`             | Band/mode/power lookup by license class    |
| `src/lib/data/achievementDefinitions.ts`        | Badge definitions with thresholds          |
| `src/lib/profile/statsComputation.ts`           | Statistical computation functions          |
| `src/lib/profile/cardRenderer.ts`               | Canvas-based profile card generation       |
| `src/lib/supabase/client.ts`                    | Supabase client initialization             |
| `src/lib/supabase/auth.ts`                      | Auth helper functions                      |
| `src/lib/supabase/types.ts`                     | Generated Supabase type definitions        |
| `api/callsign-lookup.ts`                        | Vercel Edge Function for callsign proxy    |
| `api/og/profile/[callsign].ts`                  | Vercel Edge Function for OG image          |
| `api/profile/sync-stats.ts`                     | Vercel Edge Function for stats cache       |
| `api/profile/heartbeat.ts`                      | Vercel Edge Function for status update     |
| `supabase/migrations/001_profiles.sql`          | Initial profile schema migration           |
| `supabase/migrations/002_achievements.sql`      | Achievements table migration               |
| `supabase/migrations/003_social.sql`            | Follows + activity feed migration          |

#### Modified Files

| File                                        | Changes                                           |
| ------------------------------------------- | ------------------------------------------------- |
| `src/App.tsx`                               | Add `/profile` and `/profile/:callsign` routes    |
| `src/components/layout/Layout.tsx`          | Add "Profile" nav link                            |
| `src/components/layout/MobileLayout.tsx`    | Add profile access to mobile nav                  |
| `src/components/map/OperatorProfile.tsx`    | Add avatar display + "View Profile" link          |
| `src/components/settings/SettingsModal.tsx` | Add "Go to Profile" link in station setup section |
| `src/stores/userStore.ts`                   | Add Supabase sync integration for profile fields  |
| `src/types/user.ts`                         | Extend `ProfileValidation` with weighted scoring  |

#### Unchanged Files (Read-Only Dependencies)

| File                         | Usage                                      |
| ---------------------------- | ------------------------------------------ |
| `src/stores/dxccStore.ts`    | Read DXCC progress for award rings         |
| `src/lib/db/types.ts`        | Read `LogEntry` type for stats computation |
| `src/types/contest.ts`       | Read contest types for contest awards      |
| `src/stores/contestStore.ts` | Read archived sessions for contest badges  |
| `src/types/radio.ts`         | Read radio types for equipment summary     |
| `src/lib/export/types.ts`    | Reference for Cabrillo header integration  |

### B. Supabase Configuration Reference

```
Project: propulse-prod
Region: us-east-1 (Virginia)
Database: PostgreSQL 15
Auth providers: Email (magic link), Google OAuth, GitHub OAuth
Storage: profile-photos bucket (public read, authenticated write)
Realtime: Enabled for profiles, activity_feed tables
Edge Functions: Deno runtime, deployed via Vercel Edge
```

### C. Badge Icon Reference

All badge icons are designed as 48x48px SVGs using the Propulse color palette. Each icon has four color variants corresponding to the tier:

- Bronze: warm brown tones (#CD7F32 primary)
- Silver: cool gray tones (#C0C0C0 primary)
- Gold: warm gold tones (#FFD700 primary)
- Platinum: cool white with blue sheen (#E5E4E2 primary with #6B9BD2 accent)

Icons are stored as an SVG sprite sheet at `src/assets/badges.svg` and referenced via `<use href="#badge-{id}-{tier}">`.

---

_Document End_
