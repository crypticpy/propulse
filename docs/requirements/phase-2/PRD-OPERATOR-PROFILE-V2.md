# PRD: Operator Profile V2 -- Rich, Shareable, Gamified Operator Identity

**Status:** Draft
**Owner:** Product / Engineering
**Audience:** Frontend, Backend (Supabase), UX, QA
**Version:** 2.0
**Date:** 2026-02-07
**Supersedes:** `docs/requirements/PRD-OPERATOR-PROFILE.md` (V1)

**Related docs:**

- `docs/requirements/PRD-SUPABASE-MIGRATION.md` -- Cloud backend, auth, RLS, sync
- `docs/requirements/PRD-SHACK-BUILDER.md` -- Equipment management, station modeling
- `docs/requirements/PRD-SETTINGS-PAGE.md` -- App configuration page

**Key source files (current V1 implementation):**

- `src/pages/ProfilePage.tsx` -- Profile page layout (desktop sidebar + tabs, mobile compact card + tabs)
- `src/stores/profileStore.ts` -- Zustand store (station, bio, socialLinks, license, savedTargets, credentials)
- `src/hooks/useProfileCompleteness.ts` -- Weighted completeness scoring (9 items, 100-point scale)
- `src/hooks/useCallsignAutoFill.ts` -- HamQTH debounced lookup for auto-fill suggestions
- `src/hooks/useAwardProgress.ts` -- DXCC/WAS/WAZ computation from logbook entries
- `src/hooks/useLogbookStats.ts` -- Aggregate QSO statistics for the Stats tab
- `src/lib/api/hamqth.ts` -- HamQTH API client (returns qth, country, cqzone, ituzone, lat, lon)
- `src/lib/db/types.ts` -- LogEntry schema (no `state` field -- see Bug #4)
- `src/types/user.ts` -- UserStation, SocialLink, LicenseInfo, OperatingLocation types
- `src/stores/shackStore.ts` -- Radio equipment store (radios, antennas, feedlines, accessories, presets)
- `src/components/profile/` -- 18 component files (ProfileCard, AwardsTab, StatsTab, QRCodeModal, BioSection, SocialLinksSection, etc.)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Experience](#3-target-experience)
4. [Feature Specifications](#4-feature-specifications)
5. [Data Model](#5-data-model)
6. [Privacy & Security](#6-privacy--security)
7. [Gamification Engine](#7-gamification-engine)
8. [API Requirements](#8-api-requirements)
9. [UI/UX Specifications](#9-uiux-specifications)
10. [Bug Fixes](#10-bug-fixes)
11. [Migration](#11-migration)
12. [Success Metrics](#12-success-metrics)

---

## 1. Overview

### Vision

Transform the Propulse operator profile from a basic form-and-stats page into the definitive ham radio identity surface -- a QRZ.com-caliber profile with modern gamification, social sharing, and real-time achievement tracking. Every operator who uses Propulse should feel that their profile is the single best representation of their ham radio identity anywhere on the internet.

### Goals

| Goal                | Description                                                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rich identity**   | Replace the sparse 4-tab profile with a comprehensive operator identity that includes photos, station description, equipment showcase, QSL info, and operating philosophy.    |
| **Gamification**    | Introduce an XP/level system, achievement badges, weekly challenges, and leaderboards that reward consistent operating and make progress visible and fun.                     |
| **Shareability**    | Generate social-media-ready achievement cards, embeddable profile widgets, enhanced QR codes with vCard data, and a public profile URL that works without a Propulse account. |
| **Bug remediation** | Fix all 7 known bugs in the current V1 profile implementation (detailed in Section 10).                                                                                       |
| **Privacy-first**   | Every piece of profile data beyond callsign is opt-in for public visibility. Grid precision, address, photos, and activity data all have granular per-field privacy controls. |
| **Mobile parity**   | Every feature works equally well on mobile. No desktop-only functionality (currently QR code button is desktop-only).                                                         |

### Non-Goals

1. **Full social network.** No chat, messaging, or forums. Social features are limited to public profiles, achievement sharing, and leaderboards.
2. **QSL bureau.** We do not handle physical QSL card routing. QSL info on profiles is informational only.
3. **Contest logging.** Contest features remain in the Contest module. Profile shows contest results but does not provide contest logging.
4. **Paid features.** All V2 profile features are free. No premium tier gating for badges, levels, or sharing.

---

## 2. Current State Analysis

### What Exists (V1)

The V1 profile is implemented in `src/pages/ProfilePage.tsx` with the following structure:

**Layout:**

- Desktop: 320px sticky sidebar (`ProfileCardDesktop`) + tabbed content area (max 720px)
- Mobile: Compact card (`ProfileCardMobile`) at top + horizontal tab pills + tab content

**4 Tabs:**

1. **Overview** -- Station Identity form (callsign, name, grid with HamQTH auto-fill), License Card, Bio (markdown), Social Links
2. **Locations** -- LocationManager for saved operating locations (home, portable, POTA, SOTA, etc.)
3. **Awards** -- DXCC (340 entities), WAS (50 states), WAZ (40 zones) progress rings with worked/confirmed counts
4. **Stats** -- Total QSOs, unique callsigns, countries, active days, activity heatmap (365 days), QSO by mode/band charts, first/last QSO dates, most active band/mode

**Sidebar card features:**

- Callsign (mono font, plasma-orange)
- Operator name
- Grid locator
- Coordinates (lat/lon from active location)
- Profile completeness ring (9-item weighted score: callsign 22%, grid 17%, license 17%, name 11%, radio 11%, timezone 6%, social link 6%, bio 5%, expiration 5%)
- Edit Profile button
- QR Code button (desktop only -- **Bug #1**)
- Inline edit mode with save/cancel

**Data storage:**

- `profileStore.ts` (Zustand + localStorage `propulse-profile` key, version 2)
- Fields: station (UserStation), bio (string), socialLinks (SocialLink[]), license (LicenseInfo), savedTargets (SavedTarget[])
- QSO data in IndexedDB via `useLogbook()` hook

### Known Bugs (7 total)

| #   | Bug                                                      | Location                                                                                                                                                      | Impact                                                                                                             |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | QR code button missing on mobile                         | `ProfileCard.tsx` L157-186 -- `ProfileCardMobile` has no QR button, only `ProfileCardDesktop` has one at L88-111                                              | Mobile users cannot generate QR codes for hamfest sharing                                                          |
| 2   | Timezone unreachable from Profile page                   | `useProfileCompleteness.ts` L59-64 -- timezone is 6% of completeness score, but timezone is only settable in Location edit (not surfaced on Profile Overview) | Users see 94% max completeness with no indication of what's missing if they haven't set timezone via Locations tab |
| 3   | Auto-generated social links don't count for completeness | `useProfileCompleteness.ts` L49-53 -- `socialLinks.some(l => !l.autoGenerated)` requires a manual link; auto-generated QRZ/HamQTH links are excluded          | Confusing UX: user sees 2 links but completeness says "Social Link" is incomplete                                  |
| 4   | WAS state extraction misses ADIF `state` field           | `useAwardProgress.ts` L130-150 -- `extractUSState()` only checks `entry.qth` and `entry.notes`, never `entry.state`                                           | ADIF imports that populate a structured `state` field (common in LoTW exports) silently lose WAS progress          |
| 5   | HamQTH data partially unused                             | `useCallsignAutoFill.ts` L63-73 -- auto-fill only uses `name`, `grid`, `country`; ignores `qth`, `cqzone`, `ituzone`, `lat`, `lon` from `HamQTHLookupResult`  | Wastes API data that could enrich the profile (QTH city display, zone pre-fill, coordinate verification)           |
| 6   | No URL validation on social links                        | `SocialLinksSection.tsx` L46-48 -- `handleSave` only filters empty URLs, never validates URL format                                                           | Invalid URLs (e.g., "my website") are saved and rendered as broken links                                           |
| 7   | Editing auto-generated link doesn't remove `(auto)` flag | `SocialLinksSection.tsx` L57-64 -- `updateLink()` preserves existing object with spread, doesn't clear `autoGenerated` when user edits URL                    | User edits an auto-generated link but it still shows "(auto)" badge, and still doesn't count for completeness      |

### Gaps vs. Competitor Expectations

| Feature                              | QRZ.com | POTA           | SOTA                              | Propulse V1                                       |
| ------------------------------------ | ------- | -------------- | --------------------------------- | ------------------------------------------------- |
| Profile photo / shack photos         | Yes     | No             | No                                | No                                                |
| Station description / equipment list | Yes     | No             | No                                | Partial (Shack Builder exists but not on profile) |
| Award badges on profile              | Yes     | Yes (6 tiers)  | Yes (Mountain Goat / Shack Sloth) | No                                                |
| QSL information                      | Yes     | N/A            | N/A                               | No                                                |
| Map showing QTH                      | Yes     | Yes (park map) | Yes (summit map)                  | Grid only, no map                                 |
| Page view counter                    | Yes     | No             | No                                | No                                                |
| Shareable cards for social media     | No      | No             | No                                | No                                                |
| XP / level system                    | No      | Points system  | Points by height                  | No                                                |
| Weekly challenges                    | No      | No             | No                                | No                                                |
| Activity feed                        | No      | Activator log  | Activator log                     | No                                                |
| Public profile URL                   | Yes     | Yes            | Yes                               | No                                                |

---

## 3. Target Experience

### First-Time Operator Walkthrough

1. **Operator arrives at `/profile` for the first time.** They see a guided setup wizard (not a blank form). The wizard has 4 steps: (a) Enter callsign, (b) Review auto-filled data from HamQTH (name, grid, QTH city, country, zones, coordinates), (c) Upload a profile photo (optional), (d) Write a short bio (optional). Each step shows progress and the operator can skip.

2. **After wizard completes (or is skipped), the Profile page loads.** The sidebar card shows the operator's callsign in bold plasma-orange, their profile photo (or a generated avatar from the callsign), grid locator, completeness ring, and a "Share Profile" button. The completeness ring pulses gently when below 70% to encourage filling in more fields.

3. **The Overview tab is now richer.** Below the Station Identity form, the operator sees: their License Card (auto-fetched from callook.info for US operators), a station description section (markdown-enabled), an equipment showcase (pulled from Shack Builder), a QSL information card (how to reach them), and their social links.

4. **The Awards tab has been replaced by an Achievements tab.** It still shows DXCC/WAS/WAZ rings, but now also displays Propulse-native achievement badges (First QSO, Century Club, Band Explorer, etc.), weekly challenge progress, and the operator's XP level with a progress bar to the next level.

5. **The Stats tab gains personal bests and trends.** New sections: "Personal Records" (most QSOs in a day, most countries in a week, longest streak), "This Month vs. Last Month" comparison cards, and a trend sparkline showing 12-month QSO count trajectory.

6. **A new Activity tab shows recent milestones.** "Earned Band Explorer badge", "Reached Level 8: Seasoned Operator", "New DXCC entity: VP8 (Falkland Islands)", "Weekly Challenge complete: QRP Hero". This tab is also the source for the public activity feed.

7. **The operator taps "Share Profile" and gets options.** (a) Copy public profile URL, (b) Generate a social-media achievement card (PNG) showing their callsign, level, badge count, and top stats, (c) Show QR code (enhanced with vCard data), (d) Embed widget code for their website.

### Returning Operator Experience

The operator logs a QSO that earns them a new DXCC entity. Within 3 seconds:

- A toast notification appears: "New DXCC entity! VP8 -- Falkland Islands (245/340)"
- The DXCC ring on the Awards tab increments
- The Activity feed gains a new entry
- XP is awarded (+50 XP for new DXCC entity)
- If this crosses a level threshold, a level-up celebration animation plays

### Weekly Challenge Flow

Every Monday at 00:00 UTC, a new weekly challenge activates. The operator sees a banner on the Profile page: "This Week: Band Explorer -- Make contacts on 5 different HF bands. Progress: 2/5. Reward: 200 XP + Band Explorer badge." The challenge has a countdown timer. Progress updates in real-time as QSOs are logged. When completed, a celebration animation plays and the badge is immediately visible on the profile.

---

## 4. Feature Specifications

### 4.1 Public Profile Card (Shareable, Embeddable)

**Purpose:** A compact, visually striking card that represents the operator's identity. Can be shared as a URL, embedded on external websites, or exported as an image.

**Components:**

- Callsign (large, mono font, plasma-orange)
- Profile photo or generated avatar (64x64 on card, 128x128 on full profile)
- Operator name
- Grid locator + QTH city (from HamQTH `qth` field)
- Country flag emoji (derived from callsign prefix via DXCC entity lookup)
- License class badge (e.g., "Extra", "General")
- Level badge (e.g., "Lv. 12 -- Seasoned Operator")
- Top 3 achievement badges (most recent or highest tier)
- Key stats row: Total QSOs | DXCC entities | Active days

**Public URL format:** `https://propulse.app/op/{CALLSIGN}` (e.g., `https://propulse.app/op/W5XXX`)

- Renders the public profile card as a standalone page
- Respects privacy settings (only shows fields marked as public)
- Includes Open Graph meta tags for rich link previews on social media
- Works without authentication

**Embeddable widget:** An `<iframe>` snippet that renders the profile card with dark background, suitable for embedding on personal websites or QRZ.com bio pages.

```html
<iframe
  src="https://propulse.app/embed/op/W5XXX"
  width="400"
  height="200"
  frameborder="0"
  style="border-radius:12px;overflow:hidden;"
>
</iframe>
```

**Implementation notes:**

- Public profile is a server-rendered page (Vercel Edge Function or SSR) that reads from Supabase `profiles` table
- The embed endpoint returns the card in a minimal HTML wrapper with no navigation chrome
- Card component: `src/components/profile/PublicProfileCard.tsx` (reused for in-app card and embed)

### 4.2 Profile Privacy Controls (Granular Per-Field Visibility)

**Purpose:** Operators control exactly what is visible on their public profile. Privacy is opt-in for sharing, opt-out for hiding. Callsign is always public (it is a government-issued public identifier).

**Privacy levels per field:**

| Field               | Options                                     | Default         |
| ------------------- | ------------------------------------------- | --------------- |
| Callsign            | Always public                               | Public          |
| Operator name       | Public / Private                            | Public          |
| Profile photo       | Public / Private                            | Public          |
| Grid locator        | Public (6-char) / Public (4-char) / Private | Public (4-char) |
| QTH city            | Public / Private                            | Public          |
| Country             | Always public (derived from callsign)       | Public          |
| Coordinates         | Public / Private                            | Private         |
| Bio                 | Public / Private                            | Public          |
| Station description | Public / Private                            | Public          |
| Equipment list      | Public / Private                            | Public          |
| Social links        | Public / Private                            | Public          |
| QSL information     | Public / Private                            | Public          |
| License class       | Public / Private                            | Public          |
| License expiration  | Public / Private                            | Private         |
| Award progress      | Public / Private                            | Public          |
| Activity feed       | Public / Private                            | Public          |
| Statistics          | Public / Private                            | Public          |
| Shack photos        | Public / Private                            | Public          |
| XP level            | Public / Private                            | Public          |
| Achievement badges  | Public / Private                            | Public          |

**Grid precision control:**

- 4-character grid (e.g., "EM12") reveals location to approximately 100km x 200km
- 6-character grid (e.g., "EM12ab") reveals location to approximately 5km x 10km
- Private hides grid entirely from public profile

**Hard privacy rules (never overridden):**

- FCC address data is never republished or stored (even if HamQTH returns it)
- Historical data of private fields is not retained in public logs (if a field was public and becomes private, historical appearances in activity feeds are redacted)
- No IP address or access log data in public-facing pages
- Coordinates are never displayed at more than 2 decimal places on public profiles (approximately 1km resolution)

**UI location:** A dedicated "Privacy" section within Profile Settings (accessible via a "Privacy Settings" button in the sidebar card or via the Overview tab).

**Data model:** Each field's visibility is stored in a `profile_privacy` JSONB column on the `profiles` table in Supabase. Default values are applied at profile creation.

### 4.3 Enhanced Bio & Photos

**Purpose:** Transform the plain-text bio into a rich station identity section with photos, station description, and equipment showcase.

**Profile photo:**

- Upload from device (JPEG, PNG, WebP)
- Crop to square (1:1 aspect ratio) with in-browser crop tool
- Stored in Supabase Storage bucket `profile-photos` at two sizes: 128x128 (thumbnail) and 512x512 (full)
- Maximum upload size: 5MB (client-side resize to 512x512 before upload, target < 200KB)
- Fallback: generated avatar from callsign using a deterministic color hash (first letter -> hue, callsign hash -> pattern)

**Shack photos (up to 6):**

- Upload from device, same format restrictions as profile photo
- Stored at 1200px max width, JPEG quality 80
- Displayed in a masonry grid on the profile (2 columns desktop, 1 column mobile)
- Each photo has an optional caption (max 200 characters)
- Drag-to-reorder on desktop, long-press-to-reorder on mobile
- Maximum storage: 6 photos x 500KB = 3MB per operator

**Station description:**

- Markdown-enabled textarea (reuses existing `MarkdownRenderer` from `src/components/profile/MarkdownRenderer.tsx`)
- Maximum 5000 characters
- Suggested sections (shown as placeholder hints): "Antennas", "Operating Style", "Favorite Bands", "QSL Info"
- Separate from Bio (bio is personal, station description is technical)

**Equipment showcase:**

- Auto-populated from Shack Builder data (`shackStore.ts` -- radios, antennas, feedlines, accessories)
- Displayed as a compact card grid: radio photo/icon, model name, manufacturer
- Links to Shack Builder for full details
- Manually orderable (the operator chooses which equipment to highlight)
- If no Shack Builder data exists, shows a prompt: "Add your equipment in the Shack Builder to showcase it here."

**QSL information card:**

- Fields: preferred QSL method (LoTW / eQSL / Direct / Bureau / No QSL), QSL message (max 500 characters), QSL manager callsign (if applicable)
- Displayed prominently on the public profile for operators who want to receive QSL cards
- Only shown if the operator has opted to display QSL info

### 4.4 Achievement & Badge System

**Purpose:** Visual recognition of operating milestones. Combines Propulse-native badges with tracking for external award programs (ARRL DXCC, POTA, SOTA).

#### 4.4.1 Propulse-Native Badges

Propulse defines its own achievement badges, computed client-side from logbook data. These are not official awards -- they are Propulse community recognitions.

**Badge categories and tiers:**

| Badge                      | Requirement                                        | Tiers                                       |
| -------------------------- | -------------------------------------------------- | ------------------------------------------- |
| **First Contact**          | Log your first QSO                                 | Single tier                                 |
| **Century Club**           | 100 / 500 / 1000 / 5000 / 10000 QSOs               | Bronze / Silver / Gold / Platinum / Diamond |
| **Globe Trotter**          | 25 / 50 / 100 / 150 / 200 DXCC entities worked     | Bronze / Silver / Gold / Platinum / Diamond |
| **State Collector**        | 10 / 25 / 40 / 50 US states worked                 | Bronze / Silver / Gold / Platinum           |
| **Zone Master**            | 10 / 20 / 30 / 40 CQ zones worked                  | Bronze / Silver / Gold / Platinum           |
| **Band Explorer**          | Contact on 5 / 8 / 10 / 13 different bands         | Bronze / Silver / Gold / Platinum           |
| **Mode Master**            | Contacts on 3 / 5 / 8 / 12 different modes         | Bronze / Silver / Gold / Platinum           |
| **Night Owl**              | 50 / 200 / 500 QSOs made between 00:00-06:00 UTC   | Bronze / Silver / Gold                      |
| **Early Bird**             | 50 / 200 / 500 QSOs made between 06:00-12:00 UTC   | Bronze / Silver / Gold                      |
| **QRP Hero**               | 25 / 100 / 500 QSOs at 5W or less                  | Bronze / Silver / Gold                      |
| **Wire Antenna Warrior**   | 50 / 200 / 500 QSOs with wire antennas configured  | Bronze / Silver / Gold                      |
| **Streak Runner**          | 7 / 14 / 30 / 60 / 100 consecutive days with QSOs  | Bronze / Silver / Gold / Platinum / Diamond |
| **CW Traditionalist**      | 100 / 500 / 2000 CW QSOs                           | Bronze / Silver / Gold                      |
| **Digital Pioneer**        | 100 / 500 / 2000 FT8/FT4/JS8 QSOs                  | Bronze / Silver / Gold                      |
| **Ragchewer**              | 100 / 500 / 2000 SSB/AM/FM QSOs                    | Bronze / Silver / Gold                      |
| **Satellite Communicator** | 10 / 50 / 200 satellite QSOs                       | Bronze / Silver / Gold                      |
| **Contest Warrior**        | Participate in 3 / 10 / 25 / 50 contests           | Bronze / Silver / Gold / Platinum           |
| **DX Legend**              | 250 / 300 / 340 DXCC confirmed                     | Gold / Platinum / Diamond                   |
| **Propulse Pioneer**       | Create a Propulse account (always the first badge) | Single tier                                 |

**Badge visual design:**

- Each badge is a 64x64 SVG icon with a colored border indicating tier
- Tier colors: Bronze (#CD7F32), Silver (#C0C0C0), Gold (#FFD700), Platinum (#E5E4E2), Diamond (#B9F2FF)
- Locked badges shown as greyed-out silhouettes with progress percentage
- Earned badges have a subtle glow animation on first earn

**Badge computation:**

- Client-side only: computed from logbook data and profile data using a `useBadges()` hook
- Recomputed when logbook entries change (via dependency on `useLogbook()`)
- Badge state (earned/not, tier, progress percentage) stored in `profileStore` for display
- Synced to Supabase `profile_badges` table for public profile display

#### 4.4.2 External Award Program Tracking

**ARRL DXCC tracking (enhanced from V1):**

- Current V1: 3 rings (DXCC, WAS, WAZ) with worked/confirmed counts
- V2 additions:
  - DXCC endorsement milestones: visual markers at 100, 150, 200, 250, and every 5 above 300
  - DXCC Honor Roll indicator (330+ confirmed)
  - DXCC #1 Honor Roll indicator (340 confirmed)
  - Band-specific DXCC tracking: separate progress for each band (160m through 6m)
  - Mode-specific DXCC tracking: CW, Phone, Digital, Mixed
  - DXCC Challenge score: sum of band-DXCC totals

**POTA tracking:**

- Fields: POTA activator count, POTA hunter count, park-to-park count
- Tier display: Bronze (10) / Silver (25) / Gold (50) / Platinum (100) / Diamond (250) / Sapphire (500)
- Data source: manual entry initially (POTA does not have a public API for individual stats)
- Future: POTA CSV import support

**SOTA tracking:**

- Fields: SOTA activator points, SOTA chaser points, unique summits
- Tier display: Mountain Goat (1000 activator points), Shack Sloth (1000 chaser points)
- Data source: manual entry initially
- Future: SOTA CSV import support

### 4.5 Weekly Challenges

**Purpose:** Encourage consistent operating with time-bounded goals that refresh weekly. Immediate feedback loop: log QSOs -> see challenge progress update in real-time.

**Challenge rotation:** A new challenge activates every Monday at 00:00 UTC. The challenge pool has 20+ challenges; selection is deterministic based on the ISO week number (everyone gets the same challenge each week).

**Challenge definitions:**

| Challenge             | Description                                                   | Goal            | XP Reward |
| --------------------- | ------------------------------------------------------------- | --------------- | --------- |
| Band Explorer         | Make contacts on N different HF bands                         | 5 bands         | 200 XP    |
| Mode Mixer            | Make contacts using N different modes                         | 3 modes         | 150 XP    |
| DX Hunter             | Work N unique DXCC entities                                   | 5 entities      | 250 XP    |
| QSO Sprint            | Log N total QSOs                                              | 20 QSOs         | 150 XP    |
| CW Week               | Log N CW contacts                                             | 10 CW           | 200 XP    |
| Digital Dash          | Log N FT8/FT4 contacts                                        | 15 digital      | 150 XP    |
| Ragchew Rally         | Log N SSB contacts of 10+ minutes                             | 5 contacts      | 200 XP    |
| State Collector       | Work N unique US states                                       | 10 states       | 200 XP    |
| Zone Hopper           | Work N unique CQ zones                                        | 5 zones         | 200 XP    |
| Band of the Week: 40m | Log N QSOs on 40m specifically                                | 15 QSOs         | 150 XP    |
| Band of the Week: 20m | Log N QSOs on 20m specifically                                | 15 QSOs         | 150 XP    |
| Band of the Week: 15m | Log N QSOs on 15m specifically                                | 10 QSOs         | 150 XP    |
| Band of the Week: 10m | Log N QSOs on 10m specifically                                | 10 QSOs         | 200 XP    |
| QRP Hero              | Log N QSOs at 5W or less                                      | 5 QSOs          | 300 XP    |
| Night Shift           | Log N QSOs between 00:00-06:00 UTC                            | 5 QSOs          | 200 XP    |
| Weekend Warrior       | Log N QSOs on Saturday/Sunday                                 | 10 QSOs         | 150 XP    |
| New Country           | Work at least 1 new (never-before-worked) DXCC entity         | 1 entity        | 500 XP    |
| Streak Builder        | Log at least 1 QSO every day for N days                       | 5 days          | 250 XP    |
| Multi-Band Contact    | Work the same station on N different bands                    | 3 bands         | 200 XP    |
| Propagation Challenge | Log QSOs that match predicted band openings from the forecast | 5 matching QSOs | 300 XP    |

**Challenge UI:**

- Banner at top of Profile page showing current challenge, progress bar, time remaining
- Challenge card with: challenge name, description, progress (e.g., "3/5 bands"), XP reward, countdown timer
- Completed challenges show a "Completed!" badge with the XP earned
- Challenge history accessible from the Achievements tab (list of past challenges with completion status)

**Challenge computation:**

- Client-side: `useChallengeProgress()` hook monitors logbook entries from the current ISO week
- Progress updates reactively when new QSOs are logged
- Completed challenges write an event to the Activity feed and award XP

### 4.6 XP & Level System

**Purpose:** Long-term progression system that gives operators a sense of growth. XP accumulates over time; levels provide titles that reflect operating experience.

**XP sources:**

| Action                                             | XP Award                          |
| -------------------------------------------------- | --------------------------------- |
| Log a QSO                                          | 5 XP                              |
| Log a QSO with a new callsign (first-time contact) | 10 XP                             |
| New DXCC entity worked                             | 50 XP                             |
| New DXCC entity confirmed                          | 25 XP (bonus on top of worked)    |
| New US state worked (WAS)                          | 30 XP                             |
| New CQ zone worked (WAZ)                           | 40 XP                             |
| Earn a badge (any tier)                            | 100 XP                            |
| Complete a weekly challenge                        | Varies (150-500 XP per challenge) |
| Maintain a daily streak (per day)                  | 10 XP/day                         |
| Upload profile photo                               | 25 XP (one-time)                  |
| Complete profile to 100%                           | 100 XP (one-time)                 |
| Upload first shack photo                           | 25 XP (one-time)                  |
| Write a bio (50+ characters)                       | 15 XP (one-time)                  |

**Level table:**

| Level | Title                | XP Required | Cumulative XP |
| ----- | -------------------- | ----------- | ------------- |
| 1     | Novice Operator      | 0           | 0             |
| 2     | Beginner             | 100         | 100           |
| 3     | Apprentice           | 250         | 350           |
| 4     | Enthusiast           | 500         | 850           |
| 5     | Active Operator      | 800         | 1,650         |
| 6     | Experienced          | 1,200       | 2,850         |
| 7     | Skilled Operator     | 1,800       | 4,650         |
| 8     | Seasoned Operator    | 2,500       | 7,150         |
| 9     | Expert               | 3,500       | 10,650        |
| 10    | Advanced Expert      | 5,000       | 15,650        |
| 11    | Master Operator      | 7,000       | 22,650        |
| 12    | Elite Operator       | 10,000      | 32,650        |
| 13    | DX Master            | 15,000      | 47,650        |
| 14    | Propagation Guru     | 20,000      | 67,650        |
| 15    | RF Legend            | 30,000      | 97,650        |
| 16    | Ionosphere Whisperer | 40,000      | 137,650       |
| 17    | DX Commander         | 60,000      | 197,650       |
| 18    | Grand Master         | 80,000      | 277,650       |
| 19    | Supreme Operator     | 120,000     | 397,650       |
| 20    | DX Legend            | 200,000     | 597,650       |

**Level-up celebration:**

- Full-screen overlay with particle animation (plasma-orange sparks)
- "LEVEL UP!" text with the new level number and title
- Auto-dismisses after 3 seconds or on tap
- Achievement card auto-generated for sharing

**XP computation:**

- `useXPEngine()` hook computes total XP from: initial logbook scan (retroactive XP for all existing QSOs) + event-driven XP for new actions
- XP events are idempotent: logging the same QSO twice does not double XP
- Retroactive XP computation runs once on profile creation, then incrementally on each new QSO
- XP total and level stored in `profileStore` and synced to Supabase `profiles.xp_total` column

### 4.7 Activity Feed

**Purpose:** Chronological feed of operating milestones, achievements, and activity. Serves as both a personal journal and the source for the public activity feed.

**Event types:**

| Event              | Example                                               | Icon      |
| ------------------ | ----------------------------------------------------- | --------- |
| QSO milestone      | "Logged 1,000th QSO"                                  | Trophy    |
| New DXCC entity    | "New DXCC: VP8 -- Falkland Islands (245/340)"         | Globe     |
| New US state       | "New WAS state: Alaska (47/50)"                       | Map       |
| New CQ zone        | "New WAZ zone: Zone 34 (35/40)"                       | Target    |
| Badge earned       | "Earned Globe Trotter (Gold) badge"                   | Star      |
| Level up           | "Reached Level 8: Seasoned Operator"                  | Arrow up  |
| Challenge complete | "Completed Weekly Challenge: Band Explorer (+200 XP)" | Flag      |
| Streak milestone   | "30-day operating streak!"                            | Flame     |
| Personal best      | "New personal best: 47 QSOs in one day"               | Lightning |
| Profile update     | "Updated station description"                         | Pencil    |

**Feed rendering:**

- Each event is a card with: icon, timestamp (relative for recent, absolute for older), description, optional detail (e.g., entity name, badge image)
- Events are grouped by date
- Infinite scroll with 20 events per page
- Private events (marked by privacy settings) are hidden from public feed but visible to the operator

**Feed storage:**

- Events are generated client-side from logbook analysis and stored in IndexedDB `activity_events` table
- Synced to Supabase `profile_activity` table for public display
- Maximum 1000 events retained (oldest pruned)

### 4.8 Shareable Achievement Cards

**Purpose:** Generate social-media-ready images that operators can share on Twitter, Mastodon, Facebook, or ham radio forums. Each card is a designed PNG image with the operator's stats.

**Card types:**

1. **Profile Summary Card** (1200x630 -- Open Graph dimensions)
   - Callsign, name, profile photo, grid, country flag
   - Level badge, top 3 achievement badges
   - Key stats: Total QSOs, DXCC entities, active days
   - Propulse branding footer

2. **Achievement Card** (1080x1080 -- Instagram square)
   - Triggered when earning a badge or leveling up
   - Badge/level artwork centered
   - Achievement name, description, date earned
   - Callsign and Propulse branding

3. **Weekly Challenge Card** (1200x630)
   - Challenge name, completion date
   - Progress stats (e.g., "5/5 bands")
   - XP earned
   - Callsign and Propulse branding

4. **Stats Card** (1200x630)
   - Monthly or yearly stats summary
   - QSOs, countries, states, modes, bands breakdown
   - Activity heatmap miniature
   - Callsign and Propulse branding

**Generation method:**

- Client-side: use `html2canvas` or `@vercel/og`-style SVG-to-PNG pipeline
- Render a hidden React component with the card layout, capture to canvas, export as PNG
- Trigger: "Share" button on each relevant section (badge earn modal, level-up overlay, challenge complete banner, stats tab)
- Download as PNG or copy to clipboard for pasting

### 4.9 Enhanced QR Code

**Purpose:** Fix Bug #1 (mobile QR button missing) and enhance the QR code with vCard data and download capability.

**Enhancements over V1:**

| Feature               | V1                                | V2                                                  |
| --------------------- | --------------------------------- | --------------------------------------------------- |
| Platform availability | Desktop only                      | Desktop + Mobile                                    |
| QR code content       | QRZ.com URL only                  | Configurable: QRZ URL, public profile URL, or vCard |
| Download              | Not available                     | Download as PNG button                              |
| vCard data            | Not available                     | Callsign, name, grid, QSL email (if provided)       |
| Styling               | Fixed plasma-orange on void-black | Matches current theme                               |

**vCard QR code format:**

```
BEGIN:VCARD
VERSION:3.0
FN:{Operator Name}
NICKNAME:{Callsign}
NOTE:Ham Radio Operator - {Grid} - {Country}
URL:https://propulse.app/op/{CALLSIGN}
END:VCARD
```

**Mobile QR button placement:** Add a QR code icon button to `ProfileCardMobile` alongside the completeness ring, mirroring the desktop layout. The button opens the same `QRCodeModal`.

**Implementation:**

- Fix `ProfileCardMobile` in `src/components/profile/ProfileCard.tsx` to include QR button
- Add content type selector to `QRCodeModal` (QRZ URL | Propulse Profile | vCard)
- Add download button that triggers `canvas.toBlob()` -> `saveAs()`
- Pass `showQR` callback to `ProfileCardMobile` from `ProfilePage.tsx`

### 4.10 Profile Completeness Overhaul

**Purpose:** Fix Bugs #2 and #3, and add a guided walkthrough that helps operators achieve 100% completeness.

**Bug #2 fix -- Timezone accessible from Profile:**

- Add a timezone selector to the Station Identity section on the Overview tab (below the grid locator field)
- Pre-populate with browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
- When set, writes to the active location's timezone and to `station.timezone` in `profileStore`
- The completeness item "Timezone" becomes achievable without navigating to the Locations tab

**Bug #3 fix -- Auto-generated links count (with nuance):**

- Change completeness logic: auto-generated links count for 50% of the social link weight (3% instead of 6%)
- A manually-added link gives the full 6%
- Update the completeness tooltip to explain: "Add a personal website or social link for full credit"
- This removes the all-or-nothing confusion while still incentivizing manual links

**Guided walkthrough:**

- On first visit to Profile (detected by `profileStore.station === null`), show a step-by-step wizard overlay
- Steps: (1) Callsign + auto-fill, (2) Verify/edit name and grid, (3) License info, (4) Bio + photo (optional)
- Each step shows the completeness ring updating in real-time
- "Skip" button always available
- After wizard, show a "Profile Roadmap" card on Overview tab listing remaining items for 100%

**Completeness score V2 weights:**

| Item                  | V1 Weight | V2 Weight | Notes                                |
| --------------------- | --------- | --------- | ------------------------------------ |
| Callsign              | 22        | 20        | Slightly reduced                     |
| Grid                  | 17        | 15        | Slightly reduced                     |
| License class         | 17        | 12        | Reduced to make room for new items   |
| Name                  | 11        | 10        | Slightly reduced                     |
| Radio (Shack Builder) | 11        | 8         | Slightly reduced                     |
| Timezone              | 6         | 5         | Now accessible from Profile Overview |
| Social link (manual)  | 6         | 5         | Auto-generated counts for 50% (2.5%) |
| Bio                   | 5         | 5         | Unchanged                            |
| License expiration    | 5         | 5         | Unchanged                            |
| Profile photo         | --        | 8         | NEW                                  |
| Station description   | --        | 5         | NEW                                  |
| QSL info              | --        | 2         | NEW                                  |
| **Total**             | **100**   | **100**   |                                      |

### 4.11 Enhanced Callsign Lookup

**Purpose:** Fix Bug #5 by using ALL fields returned by HamQTH, not just name/grid/country.

**Currently returned by `fetchHamQTH()` but unused:**

| Field     | Type   | How to use in V2                                                          |
| --------- | ------ | ------------------------------------------------------------------------- |
| `qth`     | string | Display as "QTH City" on profile card and public profile                  |
| `country` | string | Already used in auto-fill suggestions, now also displayed on profile card |
| `cqzone`  | number | Pre-fill CQ zone for WAZ tracking, display on profile                     |
| `ituzone` | number | Pre-fill ITU zone, display on profile                                     |
| `lat`     | number | Verify/supplement grid coordinates, use for map pin if operator consents  |
| `lon`     | number | Same as lat                                                               |

**Changes to `useCallsignAutoFill.ts`:**

- Expand `CallsignSuggestion` interface to include `qth`, `cqzone`, `ituzone`, `lat`, `lon`
- Pass all fields through from `fetchHamQTH()` result instead of discarding them
- `CallsignLookupSuggestions` component shows additional fields: QTH city, CQ zone, ITU zone

**Changes to auto-fill behavior:**

- When operator clicks "Auto-fill", the following fields are populated:
  - `operatorName` from `result.name`
  - `grid` from `result.grid`
  - `station.qth` (new field) from `result.qth`
  - `station.cqzone` (new field) from `result.cqzone`
  - `station.ituzone` (new field) from `result.ituzone`
  - Coordinates verified: if `result.lat`/`result.lon` differ significantly from grid-derived coordinates, show a warning

**New fields on `UserStation` type (in `src/types/user.ts`):**

```typescript
/** City/town from callsign lookup */
qth?: string;
/** CQ zone number (1-40) */
cqZone?: number;
/** ITU zone number (1-90) */
ituZone?: number;
```

### 4.12 Statistics Enhancements

**Purpose:** Add personal bests, trend comparisons, and richer data visualizations to the Stats tab.

**Personal Records section:**

| Record                             | Computation                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| Most QSOs in a day                 | `max(qsosByDate)`                                                  |
| Most QSOs in a week                | Sliding 7-day window over `qsosByDate`                             |
| Most DXCC entities in a single day | Group QSOs by date, count unique entities per day                  |
| Longest daily streak               | Consecutive dates with >= 1 QSO                                    |
| Current streak                     | Days since last gap                                                |
| Fastest 100 QSOs                   | Min time span between QSO #1 and QSO #100 in any contiguous window |

**Month-over-month comparison cards:**

- 4 cards showing current month vs. previous month: Total QSOs, Unique Callsigns, New DXCC Entities, Active Days
- Each card shows: current value, previous value, delta (green up arrow / red down arrow / gray dash)
- Computed from `qsosByDate` filtered by month

**12-month trend sparkline:**

- Small inline chart (120x40px) showing monthly QSO totals for the last 12 months
- Displayed in the stat cards row, uses SVG path for lightweight rendering

**Band activity over time:**

- New chart: stacked area chart showing QSOs per band per month (last 12 months)
- Helps operators visualize how propagation changes affect their operating patterns

**Top DX contacts table:**

- List of the operator's longest-distance QSOs (top 10)
- Columns: Callsign, Entity, Distance (km/mi), Band, Mode, Date
- Distance computed from operator grid to contact grid (or entity centroid if no grid)

---

## 5. Data Model

### 5.1 New Supabase Tables

All tables follow the Supabase migration pattern defined in `docs/requirements/PRD-SUPABASE-MIGRATION.md`. Row-Level Security (RLS) is enabled on all tables. The `user_id` column references `auth.users.id`.

#### `profiles` table

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  callsign TEXT NOT NULL,
  operator_name TEXT,
  grid TEXT,
  qth TEXT,
  country TEXT,
  cq_zone SMALLINT,
  itu_zone SMALLINT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  timezone TEXT,
  bio TEXT DEFAULT '' CHECK (length(bio) <= 5000),
  station_description TEXT DEFAULT '' CHECK (length(station_description) <= 5000),
  profile_photo_url TEXT,
  license_class TEXT,
  license_country TEXT,
  license_expiration DATE,
  license_grant_date DATE,
  qsl_method TEXT CHECK (qsl_method IN ('lotw', 'eqsl', 'direct', 'bureau', 'none')),
  qsl_message TEXT CHECK (length(qsl_message) <= 500),
  qsl_manager TEXT,
  xp_total INTEGER DEFAULT 0 NOT NULL,
  xp_level SMALLINT DEFAULT 1 NOT NULL,
  profile_privacy JSONB DEFAULT '{
    "name": "public",
    "photo": "public",
    "grid": "public_4char",
    "qth": "public",
    "bio": "public",
    "station_description": "public",
    "equipment": "public",
    "social_links": "public",
    "qsl_info": "public",
    "license_class": "public",
    "license_expiration": "private",
    "awards": "public",
    "activity": "public",
    "stats": "public",
    "photos": "public",
    "level": "public",
    "badges": "public",
    "coordinates": "private"
  }'::jsonb NOT NULL,
  profile_completeness SMALLINT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE UNIQUE INDEX idx_profiles_callsign ON profiles (upper(callsign));
CREATE INDEX idx_profiles_user_id ON profiles (user_id);
CREATE INDEX idx_profiles_xp_level ON profiles (xp_level DESC, xp_total DESC);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Owner can read/write own profile
CREATE POLICY profiles_owner ON profiles
  FOR ALL USING (auth.uid() = user_id);

-- Anyone can read public profiles
CREATE POLICY profiles_public_read ON profiles
  FOR SELECT USING (true);
```

#### `profile_social_links` table

```sql
CREATE TABLE profile_social_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('qrz', 'hamqth', 'website', 'twitter', 'mastodon', 'youtube', 'github', 'other')),
  url TEXT NOT NULL,
  auto_generated BOOLEAN DEFAULT false NOT NULL,
  display_order SMALLINT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (profile_id, link_type)
);

ALTER TABLE profile_social_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_links_owner ON profile_social_links
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY social_links_public_read ON profile_social_links
  FOR SELECT USING (true);
```

#### `profile_badges` table

```sql
CREATE TABLE profile_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  badge_id TEXT NOT NULL,
  badge_tier TEXT NOT NULL CHECK (badge_tier IN ('single', 'bronze', 'silver', 'gold', 'platinum', 'diamond')),
  progress_pct SMALLINT DEFAULT 0 NOT NULL CHECK (progress_pct >= 0 AND progress_pct <= 100),
  earned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (profile_id, badge_id, badge_tier)
);

CREATE INDEX idx_profile_badges_profile ON profile_badges (profile_id);
CREATE INDEX idx_profile_badges_earned ON profile_badges (profile_id, earned_at DESC) WHERE earned_at IS NOT NULL;

ALTER TABLE profile_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY badges_owner ON profile_badges
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY badges_public_read ON profile_badges
  FOR SELECT USING (true);
```

#### `profile_activity` table

```sql
CREATE TABLE profile_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'qso_milestone', 'new_dxcc', 'new_state', 'new_zone',
    'badge_earned', 'level_up', 'challenge_complete',
    'streak_milestone', 'personal_best', 'profile_update'
  )),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_public BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_activity_profile_created ON profile_activity (profile_id, created_at DESC);
CREATE INDEX idx_activity_public ON profile_activity (profile_id, created_at DESC) WHERE is_public = true;

ALTER TABLE profile_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_owner ON profile_activity
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY activity_public_read ON profile_activity
  FOR SELECT USING (is_public = true);
```

#### `profile_photos` table

```sql
CREATE TABLE profile_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  caption TEXT CHECK (length(caption) <= 200),
  display_order SMALLINT DEFAULT 0 NOT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CHECK (display_order >= 0 AND display_order < 6)
);

CREATE INDEX idx_photos_profile ON profile_photos (profile_id, display_order);

ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY photos_owner ON profile_photos
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY photos_public_read ON profile_photos
  FOR SELECT USING (true);
```

#### `weekly_challenges` table

```sql
CREATE TABLE weekly_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  challenge_id TEXT NOT NULL,
  iso_year SMALLINT NOT NULL,
  iso_week SMALLINT NOT NULL,
  progress INTEGER DEFAULT 0 NOT NULL,
  goal INTEGER NOT NULL,
  completed BOOLEAN DEFAULT false NOT NULL,
  xp_awarded INTEGER DEFAULT 0 NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (profile_id, iso_year, iso_week)
);

CREATE INDEX idx_challenges_profile ON weekly_challenges (profile_id, iso_year DESC, iso_week DESC);

ALTER TABLE weekly_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY challenges_owner ON weekly_challenges
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY challenges_public_read ON weekly_challenges
  FOR SELECT USING (true);
```

### 5.2 Supabase Storage Buckets

| Bucket              | Purpose                                              | Max file size | Public           |
| ------------------- | ---------------------------------------------------- | ------------- | ---------------- |
| `profile-photos`    | Profile photos (128x128 thumb, 512x512 full)         | 5MB           | Yes (public URL) |
| `shack-photos`      | Station/shack photos (1200px max width)              | 5MB           | Yes (public URL) |
| `achievement-cards` | Generated achievement card PNGs (temporary, 24h TTL) | 2MB           | Yes (public URL) |

### 5.3 Changes to Existing Local Storage

**`profileStore.ts` additions (localStorage `propulse-profile`):**

```typescript
interface ProfileStore {
  // ... existing fields ...

  // New V2 fields
  qth: string;
  cqZone: number | null;
  ituZone: number | null;
  stationDescription: string;
  qslMethod: "lotw" | "eqsl" | "direct" | "bureau" | "none" | null;
  qslMessage: string;
  qslManager: string;
  profilePhotoUrl: string | null;
  xpTotal: number;
  xpLevel: number;
  badges: ProfileBadge[];
  activityFeed: ActivityEvent[];
  challengeProgress: ChallengeProgress | null;
  profilePrivacy: Record<string, string>;

  // New V2 actions
  setQTH: (qth: string) => void;
  setStationDescription: (desc: string) => void;
  setQSLInfo: (method: string, message: string, manager: string) => void;
  setProfilePhoto: (url: string | null) => void;
  addXP: (amount: number, source: string) => void;
  earnBadge: (badgeId: string, tier: string) => void;
  addActivityEvent: (event: ActivityEvent) => void;
  updateChallengeProgress: (progress: ChallengeProgress) => void;
  setPrivacy: (field: string, visibility: string) => void;
}
```

**`LogEntry` additions (IndexedDB `propulse-db`):**

```typescript
interface LogEntry {
  // ... existing fields ...

  /** US state abbreviation (for WAS tracking) */
  state?: string;
  /** Transmit power in watts (for QRP badge tracking) */
  txPower?: number;
}
```

**Store version migration:** Bump `profileStore` version from 2 to 3. Migration function initializes all new fields with defaults. No data loss.

---

## 6. Privacy & Security

### 6.1 Privacy Principles

1. **Opt-in public.** No profile data is public until the operator creates a Supabase account and explicitly enables public visibility. Local-only users have no public profile.
2. **Callsign is public.** Amateur radio callsigns are government-issued public identifiers. They are always visible on public profiles.
3. **Grid precision control.** Operators choose between 4-character grid (regional, ~100km), 6-character grid (local, ~5km), or hidden. Default is 4-character.
4. **No FCC address data.** Even though HamQTH may return address information, Propulse never stores or displays mailing addresses. The `qth` field stores only city/town level information.
5. **Revocable at any time.** Changing a field from public to private immediately removes it from all public-facing surfaces. Cached public profile pages expire within 5 minutes.
6. **No historical data exposure.** Activity feed entries respect the current privacy settings at render time, not the settings at event creation time.

### 6.2 Data Security

- All profile data in Supabase is protected by Row-Level Security (RLS) policies
- Profile photo uploads are scanned for EXIF data; GPS coordinates in EXIF are stripped before storage
- Social link URLs are validated against a URL pattern and sanitized to prevent XSS
- Achievement card generation happens client-side; no server-side rendering of user-controlled content
- Rate limiting on public profile endpoints: 60 requests/minute per IP
- vCard QR codes never include address or phone number, only callsign, name, grid, and Propulse profile URL

### 6.3 GDPR Compliance

- Full data export: operator can download all profile data as JSON
- Account deletion: cascade delete removes all profile data, photos, badges, activity, and challenge records from Supabase
- Data portability: export includes all user-generated content in standard formats

---

## 7. Gamification Engine

### 7.1 Architecture

The gamification engine is a client-side system that reacts to logbook changes and profile updates. It does not require server-side computation.

**Core components:**

```
                                     +------------------+
                                     | profileStore.ts  |
                                     | (XP, level,      |
                                     |  badges, feed)   |
                                     +--------+---------+
                                              ^
                                              | writes
                                              |
+------------------+    +------------------+  |  +-------------------+
| useLogbook()     |--->| useXPEngine()    |--+  | useBadges()       |
| (QSO entries)    |    | (XP computation) |     | (badge evaluation)|
+------------------+    +------------------+     +-------------------+
                                              |
                              +-----------+   |
                              | useChall- |---+
                              | enge()    |
                              +-----------+
```

**`useXPEngine()` hook:**

- Subscribes to logbook entries via `useLogbook()`
- Maintains a set of "processed" entry IDs to prevent double-counting
- On each new entry: computes XP for that QSO, checks for first-contact bonus, new entity bonuses
- Updates `profileStore.xpTotal` and `profileStore.xpLevel`
- Emits activity events for level-ups and milestones

**`useBadges()` hook:**

- Subscribes to logbook entries and profile data
- Evaluates all badge definitions against current data
- When a badge threshold is crossed: calls `profileStore.earnBadge()`, emits activity event, awards XP
- Returns current badge state for display

**`useChallengeProgress()` hook:**

- Computes current ISO week number
- Selects challenge from deterministic pool: `challengePool[isoWeek % challengePool.length]`
- Filters logbook entries to current week only
- Evaluates challenge criteria against filtered entries
- Returns progress percentage and completion status

### 7.2 Retroactive XP Computation

When a user first enables the gamification system (or creates a profile), all existing logbook entries are scanned to compute retroactive XP. This ensures that veteran operators do not start at Level 1 with thousands of QSOs already logged.

**Algorithm:**

1. Sort all logbook entries by date ascending
2. Process each entry in chronological order, applying the same XP rules as real-time
3. Track seen callsigns, entities, states, zones to correctly award first-contact bonuses
4. Sum total XP, compute level from level table
5. Evaluate all badge definitions against the full logbook
6. Generate a single "Profile created" activity event (not one event per historical milestone)

**Performance:** Processing 10,000 QSOs should complete in < 2 seconds. Use a Web Worker if processing exceeds 500ms to avoid blocking the UI.

### 7.3 Anti-Abuse

- XP is computed client-side from logbook data. There is no server-side validation of individual QSOs.
- Leaderboard participation requires a Supabase account with a verified callsign (verified via callook.info for US operators, or manual admin approval for non-US).
- Obvious anomalies (e.g., 10,000 QSOs in a single day with no contest active) can be flagged by community moderators.
- Weekly challenges use the same logbook data as XP computation; they cannot be gamed independently.
- Public profiles show "Stats as of {date}" disclaimer to indicate that stats are self-reported.

### 7.4 Leaderboards

**Leaderboard types:**

| Leaderboard      | Ranking Metric                             | Period                 |
| ---------------- | ------------------------------------------ | ---------------------- |
| XP Leaders       | Total XP                                   | All-time               |
| Weekly Active    | QSOs this week                             | Current ISO week       |
| Monthly Active   | QSOs this month                            | Current calendar month |
| DXCC Leaders     | DXCC entities worked                       | All-time               |
| WAS Leaders      | US states worked                           | All-time               |
| Challenge Streak | Consecutive weeks with challenge completed | All-time               |

**Leaderboard implementation:**

- Computed from Supabase `profiles` table using aggregate queries
- Cached at the edge with 1-hour TTL (Vercel Edge Function)
- Shows top 100 per leaderboard
- Operator can see their own rank even if not in top 100
- Opt-in: operators must enable "Show on leaderboards" in privacy settings (default: off)

---

## 8. API Requirements

### 8.1 New Vercel Edge Functions

| Endpoint                            | Method | Purpose                                               |
| ----------------------------------- | ------ | ----------------------------------------------------- |
| `GET /api/profile/{callsign}`       | GET    | Fetch public profile data (respects privacy settings) |
| `GET /api/profile/{callsign}/card`  | GET    | Generate Open Graph image for link previews           |
| `GET /api/profile/{callsign}/embed` | GET    | Return embeddable HTML widget                         |
| `GET /api/leaderboard/{type}`       | GET    | Fetch leaderboard data (cached 1hr)                   |
| `GET /api/challenge/current`        | GET    | Return current week's challenge definition            |
| `POST /api/profile/photo`           | POST   | Upload profile photo (resize + strip EXIF + store)    |
| `POST /api/profile/shack-photo`     | POST   | Upload shack photo                                    |
| `DELETE /api/profile/photo/{id}`    | DELETE | Delete a photo                                        |

### 8.2 Existing API Changes

| Endpoint                   | Change                                        |
| -------------------------- | --------------------------------------------- |
| `GET /api/callsign/hamqth` | No change needed (already returns all fields) |

### 8.3 Supabase Direct Queries (Client SDK)

The client-side Supabase SDK directly handles:

- Profile CRUD (read/write own profile, read others' public profiles)
- Badge CRUD (write own badges)
- Activity feed CRUD (write own events, read own + public events)
- Social links CRUD
- Challenge progress CRUD
- Photo metadata CRUD

These do not need custom API endpoints because RLS policies enforce access control at the database level.

---

## 9. UI/UX Specifications

### 9.1 Desktop Layout

```
+-------------------------------------------------------------+
|                     Profile Page (Desktop)                    |
+------------------+------------------------------------------+
| Sidebar (320px)  |  Tab Content Area (max 720px)            |
| sticky top-6     |                                          |
|                  |  [Overview] [Achievements] [Stats]        |
| +------------+   |  [Activity] [Locations]                  |
| |   Photo    |   |                                          |
| | (128x128)  |   |  +------------------------------------+  |
| +------------+   |  | Weekly Challenge Banner             |  |
|                  |  | "Band Explorer: 3/5 bands (4d left)"|  |
| CALLSIGN (2xl)  |  +------------------------------------+  |
| Name             |                                          |
| Grid | QTH city  |  +------------------------------------+  |
| Country flag     |  | [Tab-specific content]              |  |
|                  |  |                                      |  |
| Lv. 12 Seasoned  |  |                                      |  |
| [===----] 7,150  |  |                                      |  |
|                  |  |                                      |  |
| Completeness 87% |  |                                      |  |
| [ring graphic]   |  |                                      |  |
|                  |  |                                      |  |
| [Edit] [Share]   |  |                                      |  |
| [QR]  [Privacy]  |  +------------------------------------+  |
+------------------+------------------------------------------+
```

**Sidebar changes from V1:**

- Profile photo added above callsign
- QTH city + country flag row added
- Level indicator with XP progress bar added below completeness ring
- "Share" button added alongside "Edit"
- "Privacy" quick-access button added
- QR button remains (already present in V1 desktop)

### 9.2 Mobile Layout

```
+---------------------------------------+
|       Profile Page (Mobile)            |
+---------------------------------------+
| +-----------------------------------+ |
| | Photo | CALLSIGN      Ring  [QR]  | |
| | 56px  | Grid | QTH    87%  [Share]| |
| |       | Lv.12 Seasoned            | |
| +-----------------------------------+ |
|                                       |
| [Overview][Achieve][Stats][Activity]  |
|                                       |
| +-----------------------------------+ |
| | Weekly Challenge Banner (compact)  | |
| | Band Explorer: 3/5 bands          | |
| +-----------------------------------+ |
|                                       |
| [Tab-specific content, full width]    |
|                                       |
+---------------------------------------+
```

**Mobile changes from V1:**

- Profile photo added (56x56, left-aligned)
- QR button added (Bug #1 fix)
- Share button added
- Level indicator shown inline with callsign
- Tab bar gains "Achieve" and "Activity" tabs (horizontal scroll)

### 9.3 Tab Structure (V2)

| Tab              | Content                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview**     | Station Identity form, License Card, Station Description, Equipment Showcase, QSL Info, Bio, Social Links                                                               |
| **Achievements** | DXCC/WAS/WAZ rings, Propulse badge grid (earned + locked), POTA/SOTA tracking, Badge detail modals                                                                      |
| **Stats**        | Stat cards (total QSOs, unique calls, countries, active days), Personal Records, Month-over-Month, Activity heatmap, Mode/Band charts, Trend sparkline, Top DX contacts |
| **Activity**     | Chronological event feed (milestones, badges, level-ups, challenges, personal bests), date grouping, infinite scroll                                                    |
| **Locations**    | LocationManager (unchanged from V1)                                                                                                                                     |

### 9.4 New Components to Create

| Component               | File                                               | Description                                          |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `ProfileWizard`         | `src/components/profile/ProfileWizard.tsx`         | First-time setup wizard (4 steps)                    |
| `PublicProfileCard`     | `src/components/profile/PublicProfileCard.tsx`     | Shareable card (reused in embed, share, and sidebar) |
| `LevelIndicator`        | `src/components/profile/LevelIndicator.tsx`        | XP progress bar with level number and title          |
| `BadgeGrid`             | `src/components/profile/BadgeGrid.tsx`             | Grid of earned + locked badges with tier colors      |
| `BadgeDetailModal`      | `src/components/profile/BadgeDetailModal.tsx`      | Modal showing badge description, progress, earn date |
| `WeeklyChallengeBanner` | `src/components/profile/WeeklyChallengeBanner.tsx` | Compact banner with progress bar and countdown       |
| `ActivityFeed`          | `src/components/profile/ActivityFeed.tsx`          | Scrollable event list with date grouping             |
| `ActivityEventCard`     | `src/components/profile/ActivityEventCard.tsx`     | Individual event card (icon, timestamp, description) |
| `AchievementShareCard`  | `src/components/profile/AchievementShareCard.tsx`  | Renderable card for PNG export                       |
| `PersonalRecords`       | `src/components/profile/PersonalRecords.tsx`       | Best-of stats section                                |
| `MonthComparison`       | `src/components/profile/MonthComparison.tsx`       | This month vs. last month cards                      |
| `TrendSparkline`        | `src/components/profile/TrendSparkline.tsx`        | 12-month mini chart                                  |
| `StationDescription`    | `src/components/profile/StationDescription.tsx`    | Markdown-enabled station description editor          |
| `EquipmentShowcase`     | `src/components/profile/EquipmentShowcase.tsx`     | Card grid from shackStore data                       |
| `QSLInfoCard`           | `src/components/profile/QSLInfoCard.tsx`           | QSL method + message editor                          |
| `ProfilePhotoUpload`    | `src/components/profile/ProfilePhotoUpload.tsx`    | Photo upload with crop + resize                      |
| `ShackPhotoGallery`     | `src/components/profile/ShackPhotoGallery.tsx`     | Masonry gallery with captions                        |
| `PrivacySettings`       | `src/components/profile/PrivacySettings.tsx`       | Per-field visibility toggles                         |
| `TimezoneSelector`      | `src/components/profile/TimezoneSelector.tsx`      | Timezone picker for Overview tab                     |
| `TopDXContacts`         | `src/components/profile/TopDXContacts.tsx`         | Table of longest-distance QSOs                       |
| `BandActivityChart`     | `src/components/profile/BandActivityChart.tsx`     | Stacked area chart (bands over time)                 |
| `LeaderboardView`       | `src/components/profile/LeaderboardView.tsx`       | Leaderboard table with operator's rank               |
| `ExternalAwardTracker`  | `src/components/profile/ExternalAwardTracker.tsx`  | POTA/SOTA manual tracking cards                      |
| `AchievementsTab`       | `src/components/profile/AchievementsTab.tsx`       | Full achievements tab (replaces AwardsTab)           |
| `ActivityTab`           | `src/components/profile/ActivityTab.tsx`           | Full activity tab                                    |

### 9.5 New Hooks to Create

| Hook                   | File                                | Description                             |
| ---------------------- | ----------------------------------- | --------------------------------------- |
| `useXPEngine`          | `src/hooks/useXPEngine.ts`          | Reactive XP computation from logbook    |
| `useBadges`            | `src/hooks/useBadges.ts`            | Badge evaluation engine                 |
| `useChallengeProgress` | `src/hooks/useChallengeProgress.ts` | Weekly challenge progress tracker       |
| `usePersonalRecords`   | `src/hooks/usePersonalRecords.ts`   | Personal best computation               |
| `useMonthComparison`   | `src/hooks/useMonthComparison.ts`   | Month-over-month stat deltas            |
| `useActivityFeed`      | `src/hooks/useActivityFeed.ts`      | Activity event generation and retrieval |
| `usePublicProfile`     | `src/hooks/usePublicProfile.ts`     | Fetch public profile from Supabase      |
| `useLeaderboard`       | `src/hooks/useLeaderboard.ts`       | Leaderboard data fetching               |

### 9.6 Design Tokens

All V2 components use the existing Propulse design system:

- Colors: `plasma-orange`, `signal-green`, `caution-amber`, `alert-red`, `void-black`, `deep-space`, `nebula-blue`, `panel`
- Badge tier colors: Bronze (#CD7F32), Silver (#C0C0C0), Gold (#FFD700), Platinum (#E5E4E2), Diamond (#B9F2FF)
- Panel class: `bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl`
- Text: gray scale (gray-200 for primary, gray-400 for secondary, gray-500 for muted)
- Interactive: `hover:text-white hover:border-white/20 transition-colors`
- Mono font for callsigns, grids, and stats
- Level-up animation: plasma-orange particle burst (CSS `@keyframes` in `globals.css`)

---

## 10. Bug Fixes

### Bug #1: QR code button missing on mobile

**Root cause:** `ProfileCardMobile` (line 157-186 of `src/components/profile/ProfileCard.tsx`) does not receive or render a QR button. `ProfileCardDesktop` has a QR button at line 88-111 but mobile was omitted.

**Fix approach:**

1. Add `showQR` prop to `ProfileCardMobileProps` interface
2. Add QR icon button next to the completeness ring in the mobile card
3. Update `ProfilePage.tsx` to pass `showQR={() => setShowQR(true)}` to `ProfileCardMobile`
4. Ensure `QRCodeModal` is rendered in both desktop and mobile branches (already is, but the trigger is missing on mobile)

**Files to modify:**

- `src/components/profile/ProfileCard.tsx` -- Add `showQR` prop and button to `ProfileCardMobile`
- `src/pages/ProfilePage.tsx` -- Pass `showQR` prop to `ProfileCardMobile`

### Bug #2: Timezone field unreachable from Profile page

**Root cause:** `useProfileCompleteness.ts` includes timezone (6% weight) in the completeness score, but the only way to set timezone is by editing a location in the Locations tab. The Overview tab has no timezone field.

**Fix approach:**

1. Create `TimezoneSelector` component with IANA timezone dropdown, defaulting to browser timezone
2. Add `TimezoneSelector` to the Station Identity section on the Overview tab (below grid locator)
3. When timezone is set, update both `station.timezone` and the active location's timezone
4. Auto-detect and suggest browser timezone on first profile visit

**Files to modify:**

- `src/components/profile/TimezoneSelector.tsx` (new)
- `src/components/profile/StationIdentityForm.tsx` -- Add timezone field
- `src/components/profile/index.ts` -- Export new component
- `src/stores/profileStore.ts` -- Ensure timezone updates propagate to active location

### Bug #3: Auto-generated social links don't count for completeness

**Root cause:** `useProfileCompleteness.ts` line 52 checks `socialLinks.some(l => !l.autoGenerated)`, which means auto-generated QRZ/HamQTH links are excluded from completeness.

**Fix approach:**

1. Change the completeness logic to a weighted approach:
   - Any social link (including auto-generated): 50% of weight (2.5 out of 5)
   - At least one manual (non-auto-generated) link: 100% of weight (5 out of 5)
2. Update the completeness item label from "Social Link" to "Social Links" with a tooltip explaining the tiers

**Files to modify:**

- `src/hooks/useProfileCompleteness.ts` -- Update social link evaluation logic

### Bug #4: WAS state extraction misses ADIF `state` field

**Root cause:** `extractUSState()` in `src/hooks/useAwardProgress.ts` (line 130-150) only checks `entry.qth` and `entry.notes` for state patterns. It does not check a structured `state` field because `LogEntry` in `src/lib/db/types.ts` does not define one.

**Fix approach:**

1. Add `state?: string` field to `LogEntry` interface in `src/lib/db/types.ts`
2. Update ADIF import logic to map the ADIF `STATE` field to `entry.state`
3. Update `extractUSState()` to check `entry.state` first (if present and valid 2-letter abbreviation, use it directly), then fall back to QTH/notes parsing
4. Bump IndexedDB version and add migration for existing entries (no data migration needed -- field is optional)

**Files to modify:**

- `src/lib/db/types.ts` -- Add `state` field to `LogEntry`
- `src/hooks/useAwardProgress.ts` -- Check `entry.state` in `extractUSState()`
- `src/lib/import/adif.ts` (or equivalent) -- Map ADIF `STATE` to `entry.state`

### Bug #5: HamQTH data (qth, country, zones, lat/lon) fetched but not used

**Root cause:** `useCallsignAutoFill.ts` (line 63-73) only passes `name`, `grid`, `country` to the suggestion object, discarding `qth`, `cqzone`, `ituzone`, `lat`, `lon` from the HamQTH response.

**Fix approach:**

1. Expand `CallsignSuggestion` interface to include all HamQTH fields
2. Pass all fields through in the query function
3. Update `CallsignLookupSuggestions` to display QTH city and zones
4. Update auto-fill handler to populate new `UserStation` fields (`qth`, `cqZone`, `ituZone`)
5. Show coordinate discrepancy warning if HamQTH lat/lon differs significantly from grid-derived coordinates

**Files to modify:**

- `src/hooks/useCallsignAutoFill.ts` -- Expand suggestion interface, pass all fields
- `src/components/profile/CallsignLookupSuggestions.tsx` -- Display additional fields
- `src/components/profile/StationIdentityForm.tsx` -- Update auto-fill handler
- `src/types/user.ts` -- Add `qth`, `cqZone`, `ituZone` to `UserStation`

### Bug #6: No URL validation on social links

**Root cause:** `SocialLinksSection.tsx` (line 46-48) `handleSave` only filters empty URLs with `draft.filter(l => l.url.trim())` but never validates URL format.

**Fix approach:**

1. Add a URL validation utility: `isValidUrl(url: string): boolean` that checks for `https?://` prefix and basic URL structure
2. In `handleSave`, validate each non-empty URL. Invalid URLs get a red error border and an inline error message.
3. Prevent save if any URL is invalid
4. Also add `type="url"` to the input fields (already present) and a `pattern` attribute as a hint

**Files to modify:**

- `src/components/profile/SocialLinksSection.tsx` -- Add validation logic
- `src/lib/utils/validation.ts` (new or existing) -- `isValidUrl()` utility

### Bug #7: Editing auto-generated link doesn't remove "(auto)" flag

**Root cause:** `SocialLinksSection.tsx` (line 57-64) `updateLink` function creates or updates a link but does not clear the `autoGenerated` flag when the user edits a URL that was originally auto-generated.

**Fix approach:**

1. In `updateLink`, when a link has `autoGenerated: true` and the user changes the URL, set `autoGenerated: false`
2. Specifically: if the existing link's `autoGenerated` is true and the new URL differs from the auto-generated URL pattern (`https://www.qrz.com/db/{CALLSIGN}` or `https://www.hamqth.com/{CALLSIGN}`), clear the flag
3. This ensures the link counts for completeness and no longer shows "(auto)" in the UI

**Files to modify:**

- `src/components/profile/SocialLinksSection.tsx` -- Update `updateLink` to clear `autoGenerated` flag on edit

---

## 11. Migration

### 11.1 From V1 to V2 (Local Storage)

**Profile store migration (version 2 -> 3):**

```typescript
migrate: (persisted: unknown, version: number) => {
  const state = persisted as Record<string, unknown>;

  if (version < 2) {
    if (!("bio" in state)) state.bio = "";
    if (!("socialLinks" in state)) state.socialLinks = [];
  }

  if (version < 3) {
    // V2 additions with defaults
    if (!("qth" in state)) state.qth = "";
    if (!("cqZone" in state)) state.cqZone = null;
    if (!("ituZone" in state)) state.ituZone = null;
    if (!("stationDescription" in state)) state.stationDescription = "";
    if (!("qslMethod" in state)) state.qslMethod = null;
    if (!("qslMessage" in state)) state.qslMessage = "";
    if (!("qslManager" in state)) state.qslManager = "";
    if (!("profilePhotoUrl" in state)) state.profilePhotoUrl = null;
    if (!("xpTotal" in state)) state.xpTotal = 0;
    if (!("xpLevel" in state)) state.xpLevel = 1;
    if (!("badges" in state)) state.badges = [];
    if (!("activityFeed" in state)) state.activityFeed = [];
    if (!("challengeProgress" in state)) state.challengeProgress = null;
    if (!("profilePrivacy" in state)) state.profilePrivacy = {};
  }

  return state as never;
};
```

**Key principle:** No data loss. All new fields have safe defaults. Existing V1 data is preserved exactly as-is.

### 11.2 Local to Supabase Sync (First Cloud Sync)

When an operator creates a Supabase account and links their local profile:

1. **Profile data sync:** Local `profileStore` data is written to the `profiles` table. Fields are mapped 1:1 with camelCase to snake_case conversion.
2. **Social links sync:** Local `socialLinks` array is written to `profile_social_links` rows.
3. **Badge computation:** The `useBadges()` hook runs retroactive computation and writes initial badge state to `profile_badges`.
4. **XP computation:** The `useXPEngine()` hook runs retroactive XP computation and writes to `profiles.xp_total` and `profiles.xp_level`.
5. **Photo upload:** If the operator has a local profile photo URL (from a file:// or blob:// source), it is uploaded to Supabase Storage and the URL is updated.

**Conflict resolution:** During first sync, local data always wins (the operator has been using the app locally; there is no server-side data to conflict with). For subsequent syncs, the standard last-writer-wins strategy from the Supabase Migration PRD applies.

### 11.3 ProfileTabBar Migration

The V1 `ProfileTab` type (`"overview" | "locations" | "awards" | "stats"`) changes to:

```typescript
type ProfileTab =
  | "overview"
  | "achievements"
  | "stats"
  | "activity"
  | "locations";
```

- "awards" is renamed to "achievements" (broader scope)
- "activity" is added as a new tab
- Tab order: Overview, Achievements, Stats, Activity, Locations

### 11.4 Rollout Phases

| Phase                              | Scope                                                                                                                                | Timeline |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **Phase 1: Bug Fixes**             | Fix all 7 bugs (Section 10)                                                                                                          | 1 week   |
| **Phase 2: Profile Enrichment**    | Profile photo, station description, equipment showcase, QSL info, enhanced callsign lookup, timezone selector, completeness overhaul | 2 weeks  |
| **Phase 3: Gamification**          | XP engine, badge system, level system, achievements tab                                                                              | 2 weeks  |
| **Phase 4: Social & Sharing**      | Public profile, achievement cards, enhanced QR code, embed widget, privacy controls                                                  | 2 weeks  |
| **Phase 5: Challenges & Activity** | Weekly challenges, activity feed, activity tab, personal records, stats enhancements                                                 | 2 weeks  |
| **Phase 6: Leaderboards**          | Leaderboard API, leaderboard view, Supabase queries                                                                                  | 1 week   |

---

## 12. Success Metrics

### Primary Metrics

| Metric                                | Current (V1)     | Target (V2, 60 days post-launch) | Measurement                                                |
| ------------------------------------- | ---------------- | -------------------------------- | ---------------------------------------------------------- |
| Average profile completeness          | ~55% (estimated) | >= 75%                           | `mean(profiles.profile_completeness)`                      |
| Profile page visits per user per week | ~1.5 (estimated) | >= 3                             | Analytics event tracking                                   |
| Profile photo upload rate             | 0%               | >= 40% of active users           | `count(profiles.profile_photo_url IS NOT NULL) / count(*)` |
| Share actions per month               | ~0.1 (QR only)   | >= 2 per active user             | Analytics: QR + share card + URL copy events               |
| Badge earn events per user per month  | 0                | >= 3                             | `count(profile_badges.earned_at)` per user per month       |
| Weekly challenge completion rate      | N/A              | >= 30% of active users           | `count(weekly_challenges.completed = true)` per week       |
| XP level distribution median          | N/A              | Level 5+ after 30 days           | `median(profiles.xp_level)`                                |

### Secondary Metrics

| Metric                              | Target                                     | Purpose              |
| ----------------------------------- | ------------------------------------------ | -------------------- |
| Profile page load time (mobile 4G)  | < 2 seconds to first meaningful paint      | Performance          |
| Profile photo storage per user      | < 800KB average (profile + shack combined) | Cost control         |
| Public profile page loads per month | Tracking only (no target)                  | Community engagement |
| Bug #1-#7 regression                | 0 regressions                              | Quality              |
| Leaderboard opt-in rate             | >= 20% of Supabase users                   | Engagement           |

### Qualitative Signals

- Operators voluntarily share Propulse profile URLs on QRZ.com bio pages
- Operators mention badges/levels in ham radio community discussions
- Feature requests shift from "basic profile" to "advanced profile" topics (indicating foundation is solid)
- Reduction in support questions about "why is my completeness not 100%" (indicating Bug #2 and #3 fixes worked)

---

## Appendix A: Badge SVG Template

Each badge is a 64x64 SVG with this structure:

```svg
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <!-- Tier-colored outer ring -->
  <circle cx="32" cy="32" r="30" fill="none" stroke="{tierColor}" stroke-width="3"/>
  <!-- Badge icon area (24x24 centered) -->
  <g transform="translate(20, 20)">
    <!-- Badge-specific icon path here -->
  </g>
  <!-- Tier indicator (small dot at bottom) -->
  <circle cx="32" cy="58" r="4" fill="{tierColor}"/>
</svg>
```

Tier colors:

- Bronze: `#CD7F32`
- Silver: `#C0C0C0`
- Gold: `#FFD700`
- Platinum: `#E5E4E2`
- Diamond: `#B9F2FF`
- Locked: `#374151` (gray-700)

## Appendix B: Weekly Challenge Selection Algorithm

```typescript
function getCurrentChallenge(challengePool: Challenge[]): Challenge {
  const now = new Date();
  // ISO week number calculation
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
  const isoWeek = Math.ceil((days + jan1.getDay() + 1) / 7);
  const isoYear = now.getFullYear();

  // Deterministic selection: same challenge for all users in a given week
  const seed = isoYear * 100 + isoWeek;
  const index = seed % challengePool.length;
  return challengePool[index];
}
```

## Appendix C: XP Level Curve Visualization

```
XP Required per Level:
 Lv  1: ----
 Lv  2: --                              (100 XP)
 Lv  3: ---                             (250 XP)
 Lv  4: -----                           (500 XP)
 Lv  5: --------                        (800 XP)
 Lv  6: ------------                    (1,200 XP)
 Lv  7: ------------------              (1,800 XP)
 Lv  8: -------------------------       (2,500 XP)
 Lv  9: -----------------------------------   (3,500 XP)
 Lv 10: -------------------------------------------------- (5,000 XP)
 ...
 Lv 20: [=============================================...=] (200,000 XP)

Curve: roughly 1.4x-1.5x multiplier per level, with steeper scaling above Level 10.
Designed so that a moderately active operator (10 QSOs/day) reaches Level 5 in ~1 month
and Level 10 in ~6 months.
```

## Appendix D: File Inventory -- Existing Components Affected

| File                                                   | Type of Change                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `src/pages/ProfilePage.tsx`                            | Major: new tabs, wizard, challenge banner, sidebar enhancements |
| `src/stores/profileStore.ts`                           | Major: new fields, new actions, version bump                    |
| `src/types/user.ts`                                    | Moderate: new fields on UserStation, new types                  |
| `src/lib/db/types.ts`                                  | Minor: add `state` and `txPower` to LogEntry                    |
| `src/hooks/useProfileCompleteness.ts`                  | Moderate: new weights, social link logic change                 |
| `src/hooks/useCallsignAutoFill.ts`                     | Moderate: expanded suggestion interface                         |
| `src/hooks/useAwardProgress.ts`                        | Minor: check `entry.state` in extractUSState                    |
| `src/components/profile/ProfileCard.tsx`               | Moderate: photo, level, QR button on mobile, share button       |
| `src/components/profile/ProfileTabBar.tsx`             | Minor: new tab definitions                                      |
| `src/components/profile/SocialLinksSection.tsx`        | Minor: URL validation, auto-generated flag fix                  |
| `src/components/profile/CallsignLookupSuggestions.tsx` | Minor: display additional HamQTH fields                         |
| `src/components/profile/StationIdentityForm.tsx`       | Minor: timezone field, expanded auto-fill handler               |
| `src/components/profile/AwardsTab.tsx`                 | Replaced: becomes AchievementsTab                               |
| `src/components/profile/QRCodeModal.tsx`               | Moderate: content type selector, vCard, download                |
| `src/components/profile/index.ts`                      | Minor: export new components                                    |
