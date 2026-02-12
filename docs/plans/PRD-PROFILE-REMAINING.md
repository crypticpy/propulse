# PRD: Operator Profile — Remaining Items

> **Created**: February 11, 2026
> **Source**: Items not yet implemented from `docs/designs/operator-profile-vision.md`
> **Prerequisite**: Profile V2 build-out (completed Feb 11, 2026)

---

## What's Already Built

The following sections from the vision doc are **complete and shipped**:

- Hero Stats Block (7 stats + Primary Mode)
- Personal Records (7 cards: Furthest QSO, Best Day, Rarest DXCC, Best SNR, Weakest Decode, Most DXCC/Day, Most Bands/Day)
- Operating Archetypes (radar chart, top-3 badges, shared scoring module)
- Interest Tags (picker with categories, display with shared-tag highlighting)
- Where to Find Me (clock-face hours chart, active days chart, favorite frequencies, sked availability toggle)
- Contact This Station (distance/bearing, path-specific band conditions, shared bands/modes, schedule overlap, best recommendation)
- On Air Status (manual 3-state toggle with band/mode/freq/notes/auto-expire, pulsing badge)
- Profile Layout (sidebar with 8/9 elements, tab reorder, rank theming)
- Public Profile Route (`/profile/:callsign` — visitor view with VisitorProfileCard sidebar, 5 tabs, visibility enforcement)
- DB migration (interests, on_air_status, sked_availability, favorite_freqs columns)
- Profile store + sync extensions for all new fields

---

## Remaining Items

### 1. Where to Find Me: Days & Times Scheduling

**Priority**: High
**Effort**: Medium

The current "Where to Find Me" section shows auto-computed operating hours and active days from logbook data. It needs a **manual scheduling layer** so operators can declare when they _plan_ to be on the air, not just when they historically were.

**Requirements**:

- Add a "My Schedule" sub-section below the auto-computed charts
- Operators can add recurring time blocks: day(s) of week + start/end UTC hour + optional band/mode/notes
- Example: "Mon, Wed, Fri — 14:00-16:00 UTC — 20m SSB — Ragchewing"
- Display as a 7×24 grid heatmap (days × hours) with declared blocks highlighted
- Visitor view: show schedule blocks read-only, highlight overlap with viewer's schedule
- DB: new `schedule_blocks` JSONB column on profiles (array of `{ days: number[], startHour: number, endHour: number, band?: string, mode?: string, notes?: string }`)
- Store + sync: add to profileStore and profileSync

### 2. Auto-Detect On Air Status from Logbook

**Priority**: High
**Effort**: Medium

Currently, On Air is manual-only. Operators should be able to opt into **automatic On Air detection** based on recent logbook activity.

**Requirements**:

- New profile setting: `autoOnAir: boolean` (default false)
- When enabled and the operator logs a QSO, automatically set status to "On Air" with:
  - Band/mode/frequency from the logged QSO
  - Auto-expire: 30 minutes from last logged QSO (configurable: 15m, 30m, 1h)
  - Notes: "Auto-detected from logbook"
- If another QSO is logged before expiry, extend the timer
- "Active Today" amber dot: if a QSO was logged in the last 24 hours but auto-on-air has expired, show amber status instead of gray
- Implementation: trigger in the logbook entry save path (after QSO insert, check autoOnAir setting, update on_air_status)
- Settings UI: toggle in profile settings or On Air toggle panel ("Auto-detect from logbook activity")

### 3. Quick On Air Toggle from PropSphere

**Priority**: High
**Effort**: Small

Operators need a way to quickly set their On Air status without navigating to their profile page.

**Requirements**:

- Add a small On Air indicator/button to the PropSphere toolbar (or globe HUD)
- Click opens a compact popover with:
  - Current status indicator (dot + label)
  - Quick toggle: On Air / Listening / Offline
  - When On Air/Listening: band/mode/freq quick-entry fields
  - Auto-expire selector
- Reads/writes to profileStore.onAirStatus (same as profile page toggle)
- Show the pulsing green dot on the toolbar button when On Air
- Position: near the user avatar or in the toolbar's utility section

### 4. Net Database Integration

**Priority**: Medium
**Effort**: Large (depends on PRD-NET-DATABASE)

The "Nets I Check Into" section from the vision doc requires the net database system.

**Requirements**:

- Profile section: "My Nets" showing nets the operator checks into regularly
- Each entry: net name, schedule, frequency, linked to net detail page
- Auto-detect from logbook patterns (future): identify regular QSO patterns on net frequencies
- Cross-reference: when viewing another operator's profile, highlight shared nets
- Blocked by: PRD-NET-DATABASE infrastructure (net catalog, NCS registration, schedule system)

### 5. Operator Discovery & Matchmaking Feed

**Priority**: Medium
**Effort**: Large

The "find operators" system from the vision doc — a discovery feed combining multiple signals.

**Requirements**:

- Discovery page or panel showing operators ranked by match score
- Match factors:
  - Proximity (nearby grid squares, configurable radius)
  - Shared interest tags
  - Shared bands/modes (from logbook stats)
  - QSO history (worked each other before)
  - Propagation feasibility (currently reachable)
  - Schedule overlap (similar operating hours)
- "Operators You Can Work Right Now" — live feed combining:
  - Friends currently On Air
  - Interest-matched operators On Air
  - Operators in reachable grids on open bands
  - Sorted by contact probability
- Requires: Supabase query infrastructure for multi-factor matching, real-time on-air queries (partial GIN index already exists)

### 6. QSO History Between Operators

**Priority**: Medium
**Effort**: Medium

When viewing another operator's profile, show past QSO history between viewer and target.

**Requirements**:

- "Our QSO History" section on visitor profile (Social tab or Overview tab)
- Table/list of past contacts: date, band, mode, RST sent/received
- Summary stats: "You've worked KB0EL 7 times on 3 bands"
- QSO-based friend suggestions: "You've worked this station 5+ times — Follow them?"
- Data source: cross-reference viewer's logbook entries with target's callsign

### 7. Photo Carousel on Sidebar

**Priority**: Low
**Effort**: Small

Station photos from Shack Builder displayed in the profile sidebar.

**Requirements**:

- Small carousel or thumbnail grid in the sidebar ProfileCard
- Sources: equipment photos from Shack Builder, station photos (manual upload)
- Click opens full-size viewer
- Respect visibility settings (equipment visibility)

### 8. Bridge Auto-Detect for On Air

**Priority**: Low
**Effort**: Large (depends on bridge infrastructure)

Automatic On Air detection via the radio bridge WebSocket connection.

**Requirements**:

- When bridge is connected and radio is transmitting, auto-set On Air status
- Read band/mode/frequency directly from CAT data
- Auto-expire when bridge disconnects or radio goes to standby
- Higher fidelity than logbook auto-detect (real-time vs. delayed)
- Depends on: bridge daemon (PRD-RADIO-DAEMON) being connected and providing CAT data

### 9. Push Notifications for On Air

**Priority**: Low
**Effort**: Medium

Friends get notified when someone they follow goes On Air.

**Requirements**:

- Notification preference: "Notify me when friends go On Air" (per-friend or global)
- Delivery: in-app notification (bell icon badge) + optional push notification
- Throttle: max 1 notification per friend per hour
- Content: "{Callsign} is on air on {band} {mode}" with link to their profile
- Depends on: notification infrastructure (not yet built)

---

## Technical Debt & Polish

These items improve code quality and finish rough edges from the V2 build-out.

### T1. Visitor Equipment & Awards Tabs

The visitor view's "Station" and "Awards" tabs currently show raw JSON or minimal data. Polish to match owner view quality.

- Station tab: render equipment cards from statsCache or public equipment data
- Awards tab: render achievement grid from public achievement data
- Handle case where data isn't publicly visible (show locked/hidden message)

### T2. Operating Hours Hook Consolidation

`qsosByHourUtc` computation is duplicated 3 times across ProfilePage.tsx. Extract to a shared `useOperatingHours` hook.

### T3. ProfilePage.tsx Extraction

ProfilePage.tsx is ~1174 lines. Extract `OtherProfileView` into its own file (`src/pages/VisitorProfilePage.tsx` or `src/components/profile/OtherProfileView.tsx`).

### T4. Supabase Types Regeneration

Run `supabase gen types typescript` after the profile_v2 migration is applied to get proper TypeScript types for the new columns. Remove the `as unknown as Json` casts in profileSync.ts.

### T5. UTC/Local Time Toggle

The operating hours clock-face chart currently shows UTC only. Add a toggle for local time display (convert using browser timezone or user-configured timezone).

---

## Priority Summary

| #   | Item                            | Priority | Effort  | Dependencies                 |
| --- | ------------------------------- | -------- | ------- | ---------------------------- |
| 1   | Days & Times Scheduling         | High     | Medium  | None                         |
| 2   | Auto-Detect On Air from Logbook | High     | Medium  | None                         |
| 3   | Quick On Air from PropSphere    | High     | Small   | None                         |
| 4   | Net Database Integration        | Medium   | Large   | PRD-NET-DATABASE             |
| 5   | Operator Discovery Feed         | Medium   | Large   | On Air queries, search infra |
| 6   | QSO History Between Operators   | Medium   | Medium  | Logbook cross-reference      |
| 7   | Photo Carousel                  | Low      | Small   | Shack Builder photos         |
| 8   | Bridge Auto-Detect On Air       | Low      | Large   | PRD-RADIO-DAEMON             |
| 9   | Push Notifications for On Air   | Low      | Medium  | Notification infra           |
| T1  | Visitor Tab Polish              | Medium   | Small   | None                         |
| T2  | Operating Hours Dedup           | Low      | Small   | None                         |
| T3  | ProfilePage Extraction          | Low      | Small   | None                         |
| T4  | Supabase Types Regen            | Low      | Trivial | Migration applied            |
| T5  | UTC/Local Time Toggle           | Low      | Small   | None                         |
