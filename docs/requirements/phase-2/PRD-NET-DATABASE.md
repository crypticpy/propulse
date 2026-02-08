# PRD: Net Database -- The Living Amateur Radio Net Directory

**Status:** Draft
**Owner:** Product / Engineering
**Audience:** Frontend, Backend (Supabase), UX, QA
**Version:** 1.0
**Date:** 2026-02-07

**Related docs:**

- `docs/requirements/PRD-SUPABASE-MIGRATION.md` -- Cloud backend, auth, RLS, sync
- `docs/requirements/phase-2/PRD-OPERATOR-PROFILE-V2.md` -- Operator identity, gamification hooks
- `docs/requirements/phase-2/PRD-SHACK-BUILDER-V2.md` -- Equipment context for net frequency matching

---

## Table of Contents

1. [Overview & Vision](#1-overview--vision)
2. [User Stories](#2-user-stories)
3. [Feature Specifications](#3-feature-specifications)
4. [Data Model](#4-data-model)
5. [NetLogger API Integration](#5-netlogger-api-integration)
6. [Data Seeding Strategy](#6-data-seeding-strategy)
7. [Privacy & Moderation](#7-privacy--moderation)
8. [Gamification Integration](#8-gamification-integration)
9. [UI Components](#9-ui-components)
10. [Mobile Experience](#10-mobile-experience)
11. [Offline Support](#11-offline-support)
12. [API Endpoints](#12-api-endpoints)
13. [Success Metrics](#13-success-metrics)

---

## 1. Overview & Vision

### The problem

Amateur radio nets are the heartbeat of the hobby. Every day, thousands of operators gather on specific frequencies at specific times to check in, pass traffic, practice CW, report severe weather, chase DX, or simply ragchew. Nets are how new hams find community, how emergency communicators drill readiness, and how old-timers maintain friendships spanning decades.

Yet there is no single, authoritative, living directory of nets.

The data is fragmented across a half-dozen sources, each with partial coverage and no API. The ARRL Net Directory lists ~1,000-1,500 nets but has no machine-readable interface. NetFinder.radio catalogs ~500-600 nets with a modern UI but no API. W0XZ maintains a curated HF net list of 200+ entries with winter/summer UTC times but as a static web page. AllStarNets.org covers 47 curated AllStarLink nets. NetLogger provides the only live API -- showing nets currently on the air with real-time participant counts -- but only covers nets whose NCS or logger uses the NetLogger software.

No single source has more than 30% coverage. The estimated total of active nets worldwide is 2,000-5,000+. This fragmentation is the opportunity.

### The vision: "The RepeaterBook for Nets"

RepeaterBook became the de facto repeater directory by aggregating data from every source, making it searchable, and letting the community keep it current. Propulse will do the same for nets.

The Net Database is a comprehensive, searchable, community-maintained directory of amateur radio nets with one feature that no other tool offers: **real-time "Nets On Air Now" tracking** powered by the NetLogger API. When an operator opens Propulse, they can see -- right now, this instant -- which nets are active, how many people are checked in, who the NCS is, and on what frequency. This is the killer feature. It transforms the net directory from a static reference into a living, breathing pulse of the amateur radio community.

The tagline: _"Never miss a net again."_

### Goals

1. **Live net tracking**: Surface currently active nets from the NetLogger API with real-time participant counts, NCS callsign, and frequency. This is the headline feature -- no other app does this.

2. **Comprehensive directory**: Aggregate net schedule data from all available sources (W0XZ, AllStarNets, ARRL scrapes, community submissions) into a single searchable database of 2,000+ nets within 6 months.

3. **"What's coming up?"**: Show nets starting in the next 60 minutes, personalized by the operator's interests (band, mode, type) and equipment (frequencies their radio can tune).

4. **Community contributions**: Let net controllers register their nets, let participants suggest corrections, and let moderators maintain quality. The directory grows organically.

5. **Emergency net prominence**: During severe weather events or activations, ARES/RACES/SkyWarn nets surface automatically with visual urgency indicators.

6. **Gamification**: Net participation feeds into the Propulse XP system -- check-ins earn points, regular attendance earns streak badges, NCS operators earn leadership recognition.

7. **Offline access**: Cache the full net schedule in IndexedDB so operators can look up net times even without connectivity (field day, POTA, off-grid).

### Non-Goals

- **Real-time audio streaming**: Propulse does not relay or decode audio. Operators tune their radios.
- **Automated net logging**: NetLogger desktop software handles check-in logging. Propulse reads its API but does not replicate its functionality.
- **Net scheduling/booking**: Propulse does not coordinate frequency usage or arbitrate conflicts between nets.
- **Chat or messaging during nets**: No in-app communication. The radio is the communication channel.
- **IRLP/EchoLink gateway control**: Propulse links to node numbers for reference but does not control VoIP gateways.
- **Full RepeaterBook replacement**: Repeater data is used for enrichment (linking nets to repeater details), not as a standalone repeater directory.

---

## 2. User Stories

### 2.1 The new ham looking for community

> "I just got my Technician license last month. I have a Baofeng and access to a local 2m repeater. I keep hearing people mention 'nets' but I don't know when they happen or how to join. I want to find nets I can participate in with my equipment."

**Acceptance criteria:**

- User can filter nets by band (2m, 70cm), mode (FM), and type (Ragchew, Club, Newcomer-friendly).
- Results show the net name, day/time in the user's local timezone, frequency, repeater name, and a brief description.
- Tapping a net shows check-in procedure instructions ("Listen for the NCS to call for check-ins by suffix letter...").
- A "My Nets" bookmark lets the user save favorites and get browser push notifications before they start.

### 2.2 The net controller registering a net

> "I'm the NCS for our county ARES net. We meet every Tuesday at 7 PM local on the W5ABC repeater, 146.940 MHz, PL 100.0. I also run a backup net on EchoLink node 12345. I want to register this net so people can find it, and I want to manage the listing myself."

**Acceptance criteria:**

- NCS can create a net listing with: name, frequency, mode, band, repeater details (callsign, offset, tone), schedule (day of week + time UTC), duration, coverage area, type (Emergency/ARES), description, check-in procedure.
- NCS can specify digital infrastructure: EchoLink node, AllStar node, DMR talkgroup, D-STAR reflector, YSF room.
- NCS can designate a backup NCS callsign and alternate frequency.
- NCS can update or deactivate their net listing at any time.
- NCS can see how many Propulse users have bookmarked their net.

### 2.3 The DX chaser discovering live nets

> "It's Saturday afternoon and I'm looking for something to do on the radio. I want to see what nets are active RIGHT NOW and jump into one."

**Acceptance criteria:**

- A "Nets On Air Now" panel shows currently active nets from the NetLogger API.
- Each active net shows: name, frequency, mode, band, NCS callsign, logger callsign, participant count (live), and how long the net has been running.
- The list auto-refreshes every 60 seconds without user action.
- Tapping an active net shows full details plus the live check-in list (from NetLogger's GetCheckins endpoint).
- If no nets are currently on air, the panel shows "No active nets detected" with a link to the full schedule.

### 2.4 The contest operator checking the net calendar

> "I want to operate the ARRL Sweepstakes this weekend. Before I set up on a frequency, I want to make sure I'm not going to interfere with a scheduled net. Show me what nets are on 40m CW between 2100-0300 UTC."

**Acceptance criteria:**

- Calendar view lets the user select a date range, band, and mode.
- Results show nets as time blocks on a timeline visualization.
- The user can see frequency ranges that are busy with scheduled nets vs. clear.
- This view is also useful for finding nets to join during a specific time window.

### 2.5 The ARES coordinator during a weather event

> "A tornado watch was just issued for our county. I need to activate our SkyWarn net and I want every Propulse user in the area to see it."

**Acceptance criteria:**

- Emergency nets (ARES, RACES, SkyWarn, CERT) have a distinct visual treatment: red/amber alert border, lightning bolt icon, "ACTIVE" badge.
- When an emergency net is activated (either manually by the NCS or detected via NetLogger as a net with emergency keywords), it surfaces at the top of the net directory and in the "On Air Now" panel with priority placement.
- Users who have bookmarked emergency nets or are in the affected area (based on their grid square or state) receive a push notification.
- The emergency overlay does not require manual curation -- it triggers on net type flags and keyword detection.

### 2.6 The awards chaser tracking net participation

> "I participate in the OMISS net on multiple bands. I want to track my check-ins for award credit and see my progress toward the OMISS award requirements."

**Acceptance criteria:**

- User can log a net check-in (date, net name, band, callsign used) from the net detail page.
- Check-in history is viewable in a "My Net Activity" tab.
- For award-eligible nets (OMISS, 3905 Century Club, etc.), progress toward award requirements is shown.
- Check-in data can be exported as CSV for submission to award sponsors.

---

## 3. Feature Specifications

### 3.1 Nets On Air Now (THE killer feature)

This is the centerpiece. No other amateur radio app or website shows live net activity with participant counts in a real-time, auto-refreshing panel. NetLogger's own website shows this, but it is a niche tool unknown to most operators. Propulse brings this data to the surface where every operator can discover it.

#### 3.1.1 Data source

The NetLogger API (`netlogger.org/api/`) exposes three key endpoints:

| Endpoint                            | Returns                          | Use                               |
| ----------------------------------- | -------------------------------- | --------------------------------- |
| `GetActiveNets.php`                 | All currently active nets        | Main data feed for "On Air Now"   |
| `GetCheckins.php?NetName={name}`    | Check-in list for a specific net | Detail view participant list      |
| `GetPastNets.php?Date={YYYY-MM-DD}` | Nets that ran on a given date    | Historical data, seeding schedule |

The API returns XML. Propulse proxies these calls through a Vercel Edge Function (`/api/netlogger/active-nets`) that:

1. Fetches the XML from NetLogger.
2. Parses XML to JSON using `fast-xml-parser`.
3. Normalizes field names to the Propulse canonical schema (see Section 4).
4. Returns JSON with CORS headers.
5. Caches the response for 30 seconds at the edge (Vercel Edge Cache) to avoid hammering the NetLogger server.

#### 3.1.2 Active net data fields

Each active net from NetLogger provides:

```typescript
interface ActiveNet {
  netName: string; // "Midcars Midday Net"
  frequency: string; // "7.258"
  mode: string; // "SSB"
  band: string; // "40m" (derived from frequency)
  ncsCallsign: string; // "W5XYZ"
  loggerCallsign: string; // "K5ABC"
  participantCount: number; // 47
  startedAt: string; // ISO 8601 UTC timestamp
  netControlStation: string; // NCS name/description
  subscriberCount: number; // NetLogger subscribers for this net
}
```

#### 3.1.3 UI: NetLivePanel component

**Desktop (sidebar or dedicated section):**

- A panel titled "Nets On Air Now" with a pulsing green dot indicator and the count of active nets.
- Each active net is a compact card showing:
  - Net name (bold, truncated to 1 line)
  - Frequency + mode badge (e.g., "7.258 MHz SSB")
  - Band pill (e.g., "40m" with band color coding)
  - NCS callsign
  - Participant count with a people icon (e.g., "47 checked in")
  - Duration since start (e.g., "Running for 1h 23m")
- Cards are sorted by participant count (most popular first) by default, with sort options for frequency, band, and start time.
- Auto-refresh every 60 seconds with a subtle pulse animation on the refresh indicator.
- Manual refresh button for immediate update.
- Clicking a card opens the Net Detail Page (Section 3.4).

**Empty state:**

- "No nets detected on air right now. Check the schedule for upcoming nets." with a link to the schedule browser.
- Show the next 3 nets starting within the hour (from the schedule database) as "Starting Soon" cards.

#### 3.1.4 Live check-in list

When viewing an active net's detail page, a "Live Check-ins" tab shows the current participant list from `GetCheckins.php`:

- Callsign column (sortable)
- Check-in time (relative, e.g., "12 min ago")
- QTH / Name (if provided by NetLogger)
- Comments column (free text from NetLogger)

The check-in list refreshes every 60 seconds in sync with the active net panel.

#### 3.1.5 Historical net detection

`GetPastNets.php` returns nets that ran on a given date. Propulse uses this for:

- **Schedule inference**: If a net ran on the last 4 consecutive Mondays at approximately the same time, Propulse infers a "Monday weekly" schedule and suggests adding it to the directory.
- **Activity metrics**: "This net has run 48 out of the last 52 weeks" as a reliability indicator on the net detail page.
- **Seeding**: Bulk-fetch past nets to bootstrap the directory with real nets that may not be in any other source.

### 3.2 Net Schedule Browser

The searchable, filterable directory of all known nets. This is the "RepeaterBook" core of the feature -- a comprehensive reference that operators return to again and again.

#### 3.2.1 Search

- **Full-text search** across net name, description, NCS callsign, sponsor organization, and associated repeater callsign.
- Implemented via Supabase `to_tsvector` index on the `nets` table.
- Client-side search as fallback when offline (searching the IndexedDB cached schedule).

#### 3.2.2 Filter facets

| Filter              | Options                                                                                                                                                                                          | UI Element                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Band                | 160m, 80m, 60m, 40m, 30m, 20m, 17m, 15m, 12m, 10m, 6m, 2m, 70cm, 23cm, Other                                                                                                                     | Multi-select band pills                          |
| Mode                | CW, SSB, AM, FM, Digital (FT8/FT4/JS8), DMR, D-STAR, Fusion, RTTY, PSK, Other                                                                                                                    | Multi-select mode pills                          |
| Type                | Traffic, Emergency (ARES/RACES), SkyWarn, Ragchew, DX, CW Practice, Club, Digital Repeater, VHF/UHF Repeater, Tactical, Awards, Newcomer, Missionary/Faith, Maritime, Military, POTA/SOTA, Other | Multi-select type pills                          |
| Day                 | Mon, Tue, Wed, Thu, Fri, Sat, Sun, Daily                                                                                                                                                         | Multi-select day pills                           |
| Time range          | Slider from 0000-2359 UTC (or local timezone toggle)                                                                                                                                             | Dual-handle range slider                         |
| Coverage            | Local, Regional, National, International                                                                                                                                                         | Single-select dropdown                           |
| Country             | Country list (top 10 by net count promoted)                                                                                                                                                      | Searchable dropdown                              |
| State/Province      | US states, Canadian provinces                                                                                                                                                                    | Searchable dropdown (shown when country = US/CA) |
| Active on NetLogger | Yes / No / Either                                                                                                                                                                                | Toggle                                           |
| Emergency nets only | Toggle                                                                                                                                                                                           | Switch                                           |

#### 3.2.3 Result list

Each net result shows:

- **Net name** (bold, linked to detail page)
- **Schedule summary**: "Every Tuesday, 0100 UTC (Mon 8:00 PM ET)" -- always show both UTC and a user-friendly local conversion
- **Frequency + mode**: "7.258 MHz SSB" with band pill
- **Type badge(s)**: Colored pills for each net type (e.g., "Emergency" in red, "Ragchew" in blue, "CW Practice" in amber)
- **Coverage**: "Regional - Oklahoma" or "International"
- **Subscriber count**: Heart icon with count (how many Propulse users bookmarked this net)
- **Reliability indicator**: Green/amber/gray dot based on recent NetLogger activity data. Green = ran in the last 2 weeks, amber = ran in the last month, gray = no recent data.
- **"On Air Now" badge**: If this net is currently active (matched against NetLogger live data), show a pulsing green "LIVE" badge with participant count.

#### 3.2.4 Sort options

- **Relevance** (default when searching)
- **Next occurrence** (soonest to start)
- **Popularity** (subscriber count)
- **Participant count** (for currently live nets)
- **Alphabetical**
- **Recently added**

#### 3.2.5 Pagination

- Infinite scroll with 25-net batches.
- URL-based filter state (query params) for shareable filtered views: `/nets?band=40m&mode=SSB&type=ragchew`.

### 3.3 Net Calendar View

A visual calendar that answers "what nets are happening at a specific time?" -- essential for operators planning their week or checking for frequency conflicts.

#### 3.3.1 Calendar modes

- **Week view** (default): Horizontal timeline with days as columns, hours as rows. Nets displayed as colored time blocks sized to their duration.
- **Day view**: Single-day vertical timeline with 30-minute resolution. Useful for seeing density of activity on a given day.
- **"Next hour" view**: A compact panel showing nets starting in the next 60 minutes, ordered by start time. This is the "what can I do right now?" quick reference.

#### 3.3.2 Time block rendering

Each net time block shows:

- Net name (truncated if necessary)
- Frequency
- Band color (left border color matches the band's theme color from the propagation displays)
- Duration (block height proportional to duration)
- Click to open net detail

#### 3.3.3 Timezone handling

- All net times stored as UTC in the database.
- Calendar defaults to the user's local timezone (from browser `Intl.DateTimeFormat().resolvedOptions().timeZone`).
- A toggle to switch between local time and UTC.
- For nets with summer/winter time differences (e.g., W0XZ data with `time_utc` and `time_utc_summer`), the calendar automatically uses the correct time based on the current date.
- DST transitions are handled explicitly: if the user's timezone observes DST and the net's UTC time doesn't change, the local time display shifts correctly.

#### 3.3.4 Filtering in calendar view

The same filters from Section 3.2.2 apply to the calendar. Toggling a band filter, for example, shows/hides nets on that band in the calendar view.

#### 3.3.5 "Starting soon" notifications

- A "Starting Soon" section at the top of the calendar view shows nets beginning within the next 60 minutes.
- Each entry shows a countdown: "Starts in 23 minutes."
- If the net is in the user's "My Nets" list, the countdown is more prominent with an amber background.

### 3.4 Net Detail Page

Every net in the directory gets a comprehensive detail page. This is the canonical reference for that net.

#### 3.4.1 Content sections

**Header:**

- Net name (large, bold)
- Type badges (colored pills)
- "On Air Now" indicator (if currently active via NetLogger, with participant count)
- Bookmark button (heart icon, toggles "My Nets" membership)
- Share button (copy URL, generate QR code)

**Schedule card:**

- Day(s) of the week with time in both UTC and user's local timezone
- Duration (e.g., "~90 minutes")
- Summer/winter time distinction if applicable ("Winter: 0100 UTC, Summer: 0000 UTC")
- Next occurrence with countdown ("Next: Tuesday, Feb 11 at 0100 UTC -- in 3 days")
- iCal download button (`.ics` file for calendar import)

**Frequency & access card:**

- Primary frequency + mode
- Band with propagation context (link to current band conditions from Propulse's propagation data)
- Repeater details (if applicable): repeater callsign, offset, tone/CTCSS, location
- Digital infrastructure:
  - EchoLink node number (with "Connect via EchoLink" informational link)
  - AllStar node number
  - DMR talkgroup ID + color code
  - D-STAR reflector + module
  - YSF room name
- Alternate/backup frequency (if specified)

**Description & procedure card:**

- Free-text description of the net's purpose and format
- Check-in procedure instructions (e.g., "NCS calls for check-ins alphabetically by suffix. State your callsign phonetically, name, and QTH.")
- Format: Directed or undirected
- Net control: NCS callsign(s) and name(s)
- Sponsor organization (if any), with URL

**Activity card (from NetLogger data):**

- Reliability: "Ran 48 of last 52 weeks (92%)"
- Average participant count (from historical NetLogger data)
- Peak participant count and date
- Last detected activity date
- Graph: weekly participant count over the last 12 weeks (sparkline bar chart)

**Live check-ins tab (if currently active):**

- Real-time participant list from NetLogger (Section 3.1.4)
- "Join this net" callout with the frequency displayed prominently

**Community section:**

- User comments / tips (from Propulse users)
- "Suggest a correction" link (opens correction form, feeds into moderation queue)
- "Reported by [source]" attribution showing where the net data came from

#### 3.4.2 URL structure

- **Directory URL**: `/nets/{net-id}` where `net-id` is a URL-safe slug (e.g., `/nets/midcars-midday-40m-ssb`)
- **Deep link to live**: `/nets/{net-id}?tab=live` (opens with live check-in tab selected)

### 3.5 My Nets (Bookmarks & Notifications)

#### 3.5.1 Bookmarking

- Any net can be bookmarked by tapping the heart icon on its card or detail page.
- Bookmarked nets are stored locally (IndexedDB) and synced to Supabase for logged-in users (the `user_net_bookmarks` table).
- A "My Nets" section on the net directory page shows all bookmarked nets, sorted by next occurrence.

#### 3.5.2 Notifications

- For each bookmarked net, the user can enable a reminder notification.
- Notification lead time is configurable: 5, 10, 15, 30, or 60 minutes before the net starts.
- Implementation: Browser Push Notifications via the existing PWA service worker.
- Notification content: "MIDCARS Midday Net starts in 15 minutes on 7.258 MHz SSB"
- Notifications are opt-in per net, not globally forced.

#### 3.5.3 My Nets dashboard

A personalized view showing:

- **Today's nets**: Which of the user's bookmarked nets happen today, with countdown timers
- **This week at a glance**: Mini calendar showing bookmarked net times
- **Net activity history**: Check-ins the user has logged (Section 3.8)
- **Streak tracking**: "You've checked into the Tuesday ARES Net 8 weeks in a row"

### 3.6 Net Submission Form (Community Contributions)

#### 3.6.1 Submission flow

1. User navigates to the net directory and clicks "Add a Net" button (visible to all authenticated users).
2. The submission form collects:

**Required fields:**

- Net name
- Primary frequency (MHz)
- Mode (dropdown from canonical list)
- Band (auto-derived from frequency, editable)
- Schedule: day(s) of week + time UTC
- Net type (at least one from canonical list)

**Optional fields:**

- Alternate name(s)
- Duration (minutes)
- Summer UTC time (if different from winter)
- Description
- Check-in procedure
- Format (directed/undirected)
- Coverage (local/regional/national/international)
- Net control callsign(s)
- Sponsor organization + URL
- Repeater details (callsign, offset, tone)
- Digital infrastructure (EchoLink, AllStar, DMR, D-STAR, Fusion node IDs)
- State/province
- Country
- Emergency/EMCOMM flags (ARES, RACES, SkyWarn, CERT)
- Source URL (where the submitter found this information)

3. Before submission, a duplicate check runs against existing nets (fuzzy match on name + frequency + day). If a potential match is found, the user sees "This might already exist" with the matching entry and options to: submit anyway (as a new net), suggest a correction to the existing net, or cancel.
4. On submit, the listing enters the moderation queue with `status = 'pending'`.
5. The user sees their pending submission in "My Submissions" with status tracking.

#### 3.6.2 Correction flow

Instead of adding a new net, users can suggest corrections to existing listings:

- A "Suggest a correction" button on every net detail page.
- Opens a pre-filled form with the current net data. The user modifies fields and adds a note explaining the change.
- Correction creates a `net_corrections` record linked to the original net.
- Moderator sees a diff view of proposed changes.

#### 3.6.3 Quality controls

- **Rate limiting**: 10 net submissions per user per day, 3 corrections per net per user per week.
- **Required verification**: Submitter must have a verified email (Supabase auth).
- **Spam detection**: Flag submissions containing URLs in the description (except known ham radio domains).
- **Duplicate scoring**: Fuzzy match using Levenshtein distance on name + exact match on frequency and day.

### 3.7 NCS Registration & Net Management

Net controllers get a dedicated management experience that goes beyond simple listing submission.

#### 3.7.1 NCS claim flow

1. An authenticated user navigates to a net they control and clicks "I'm the NCS -- Claim this net."
2. Verification: The user must enter the NCS callsign associated with the net. If it matches their profile callsign (or an alternate callsign on their profile), the claim is auto-approved. Otherwise, it enters a moderation queue.
3. Once approved, the user becomes the "owner" of that net listing and can edit all fields directly without moderation.

#### 3.7.2 NCS dashboard

Net controllers see a "My Managed Nets" section with:

- Quick-edit links for each managed net
- Subscriber (bookmark) count with trend indicator
- Last detected activity (from NetLogger) -- confirms the net is being tracked
- "Activate net" button that creates a manual "On Air Now" entry (for nets not using NetLogger)
- "Deactivate for this week" toggle for cancellations (posts a notice on the net detail page)

#### 3.7.3 Backup NCS

- The net owner can designate one or more backup NCS callsigns.
- Backup NCS users gain edit access to the net listing (useful when the primary NCS is unavailable).
- Backup NCS is displayed on the net detail page.

### 3.8 Net Check-in Integration (Participation Tracking)

#### 3.8.1 Manual check-in logging

After participating in a net, the user can log their check-in:

- From the net detail page: "Log a check-in" button.
- Form fields: date (defaults to today), band (defaults to net's primary band), callsign used (defaults to profile callsign), notes (optional).
- The check-in is stored locally and synced to Supabase.

#### 3.8.2 Semi-automatic check-in detection

If the user has Propulse open during an active net and the net is in their "My Nets" list:

- After the net ends (detected via NetLogger data showing the net is no longer active), Propulse shows a prompt: "It looks like the [Net Name] just ended. Did you check in?"
- Tapping "Yes" logs the check-in automatically with the net's date, band, and frequency.
- Tapping "No" or dismissing does nothing.

This is deliberately not fully automatic -- there is no way for Propulse to verify the operator actually transmitted on the net frequency. The prompt is a convenience, not an assertion.

#### 3.8.3 Check-in history

A "My Net Activity" tab in the user's profile or net directory shows:

- All logged check-ins in reverse chronological order
- Filter by net name, band, date range
- Total check-in count
- Unique nets participated in
- Current streaks (consecutive weeks for recurring nets)
- Export as CSV (for award submissions to organizations like OMISS)

### 3.9 Emergency Net Overlay

#### 3.9.1 Visual treatment

Emergency nets (those with `emcomm_flags` containing ARES, RACES, SkyWarn, or CERT) receive distinct visual treatment across all views:

- **Border**: `border-alert-red/60` (or `border-caution-amber/60` for SkyWarn weather watch vs. warning)
- **Icon**: Lightning bolt for SkyWarn, shield for ARES/RACES, radio tower for CERT
- **Badge**: "EMERGENCY" or "SKYWARN" in red/amber, pulsing when the net is currently active
- **Sort priority**: Emergency nets that are currently active or starting within 30 minutes always appear at the top of search results and the "On Air Now" panel, regardless of other sort criteria

#### 3.9.2 Activation triggers

A net's emergency overlay activates when:

1. The net has `emcomm_flags` set AND is currently active on NetLogger, OR
2. The NCS manually activates "Emergency Mode" from the NCS dashboard, OR
3. The net name or NetLogger session name contains emergency keywords ("ARES", "RACES", "SkyWarn", "SKYWARN", "emergency", "activation", "severe weather", "tornado", "hurricane", "wildfire", "earthquake")

Keyword detection runs on every NetLogger API poll. No manual curation is required for known patterns.

#### 3.9.3 Area-based alerting

When an emergency net activates and has a state or region associated with it:

- Users whose operator profile grid square or state matches the net's coverage area receive a push notification (if they have notifications enabled for emergency nets).
- The notification includes the net name, frequency, and the nature of the activation.
- This is opt-in: users must enable "Emergency Net Alerts" in their notification settings. Default: off.

---

## 4. Data Model

### 4.1 Canonical Net Data Schema

The canonical schema represents the union of all data fields across all sources, normalized into a consistent structure.

#### `nets` table (Supabase)

```sql
CREATE TABLE nets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,                      -- URL-safe identifier, e.g., 'midcars-midday-40m-ssb'

  -- Identity
  name TEXT NOT NULL,
  alt_names TEXT[],                               -- alternate names / abbreviations
  description TEXT,
  check_in_procedure TEXT,

  -- Frequency & mode
  frequency REAL NOT NULL,                        -- MHz, e.g., 7.258
  mode TEXT NOT NULL,                             -- 'SSB', 'CW', 'FM', 'DMR', 'DSTAR', 'FT8', etc.
  band TEXT NOT NULL,                             -- '40m', '2m', etc. (derived from frequency, stored for indexing)
  alt_frequency REAL,                             -- backup frequency
  alt_mode TEXT,

  -- Schedule
  days TEXT[] NOT NULL,                           -- ['monday', 'tuesday', ...] or ['daily']
  time_utc TEXT NOT NULL,                         -- 'HH:MM' format, e.g., '01:00'
  time_utc_summer TEXT,                           -- if different from winter, e.g., '00:00'
  duration_minutes INTEGER,                       -- estimated duration, e.g., 90
  schedule_notes TEXT,                            -- "Except major holidays", "First Monday only", etc.

  -- Classification
  net_type TEXT[] NOT NULL DEFAULT '{}',          -- ['traffic', 'emergency', 'ragchew', ...]
  format TEXT CHECK (format IN ('directed', 'undirected', 'hybrid', 'unknown')),
  coverage TEXT CHECK (coverage IN ('local', 'regional', 'national', 'international')),

  -- Location / scope
  country TEXT DEFAULT 'US',
  state TEXT,                                     -- US state or Canadian province
  region TEXT,                                    -- free-text region description

  -- Net control
  ncs_callsign TEXT,                              -- primary NCS
  ncs_name TEXT,
  backup_ncs TEXT[],                              -- array of backup NCS callsigns

  -- Sponsor
  sponsor TEXT,                                   -- "Oklahoma City ARC", "ARRL", etc.
  sponsor_url TEXT,

  -- Repeater details (for VHF/UHF nets)
  repeater_callsign TEXT,
  repeater_offset TEXT,                           -- '+', '-', or 'simplex'
  repeater_tone REAL,                             -- CTCSS tone in Hz, e.g., 100.0
  repeater_dcs TEXT,                              -- DCS code, e.g., '023'
  repeater_location TEXT,                         -- city/state of repeater

  -- Digital infrastructure
  echolink_node TEXT,
  allstar_node TEXT,
  dmr_talkgroup TEXT,
  dmr_color_code INTEGER,
  dmr_timeslot INTEGER,
  dstar_reflector TEXT,
  dstar_module TEXT,
  ysf_room TEXT,

  -- Emergency/EMCOMM flags
  emcomm_flags TEXT[],                            -- ['ares', 'races', 'skywarn', 'cert']
  is_emergency_active BOOLEAN DEFAULT false,      -- manually set by NCS for active events

  -- Metadata
  source TEXT NOT NULL,                           -- 'netlogger', 'w0xz', 'allstar', 'arrl', 'community', 'manual'
  source_url TEXT,
  source_id TEXT,                                 -- ID in the original source system
  last_confirmed TIMESTAMPTZ,                     -- when this listing was last verified accurate
  last_netlogger_activity TIMESTAMPTZ,            -- last time seen active on NetLogger
  netlogger_avg_participants REAL,                -- rolling average participant count
  netlogger_reliability_pct REAL,                 -- % of expected sessions that actually ran

  -- Ownership
  owner_user_id UUID REFERENCES auth.users(id),   -- NCS who claimed this listing
  created_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'inactive', 'rejected', 'archived')),

  -- Engagement
  subscriber_count INTEGER NOT NULL DEFAULT 0,    -- denormalized bookmark count

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Full-text search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(name, '') || ' ' ||
      coalesce(array_to_string(alt_names, ' '), '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(ncs_callsign, '') || ' ' ||
      coalesce(sponsor, '') || ' ' ||
      coalesce(repeater_callsign, '')
    )
  ) STORED
);

-- Indexes
CREATE INDEX idx_nets_search ON nets USING GIN (search_vector);
CREATE INDEX idx_nets_band ON nets (band);
CREATE INDEX idx_nets_mode ON nets (mode);
CREATE INDEX idx_nets_days ON nets USING GIN (days);
CREATE INDEX idx_nets_net_type ON nets USING GIN (net_type);
CREATE INDEX idx_nets_emcomm ON nets USING GIN (emcomm_flags);
CREATE INDEX idx_nets_status ON nets (status);
CREATE INDEX idx_nets_country_state ON nets (country, state);
CREATE INDEX idx_nets_frequency ON nets (frequency);
CREATE INDEX idx_nets_slug ON nets (slug);
CREATE INDEX idx_nets_owner ON nets (owner_user_id);
```

#### `net_submissions` table (community contributions pending moderation)

```sql
CREATE TABLE net_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_id UUID NOT NULL REFERENCES auth.users(id),

  -- Same fields as nets table (all optional except name + frequency + mode)
  name TEXT NOT NULL,
  frequency REAL NOT NULL,
  mode TEXT NOT NULL,
  band TEXT,
  days TEXT[],
  time_utc TEXT,
  time_utc_summer TEXT,
  duration_minutes INTEGER,
  net_type TEXT[],
  format TEXT,
  coverage TEXT,
  country TEXT,
  state TEXT,
  description TEXT,
  check_in_procedure TEXT,
  ncs_callsign TEXT,
  sponsor TEXT,
  sponsor_url TEXT,
  repeater_callsign TEXT,
  repeater_offset TEXT,
  repeater_tone REAL,
  echolink_node TEXT,
  allstar_node TEXT,
  dmr_talkgroup TEXT,
  dstar_reflector TEXT,
  ysf_room TEXT,
  emcomm_flags TEXT[],
  source_url TEXT,

  -- Moderation
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_changes')),
  submission_notes TEXT,                           -- submitter's notes to moderator
  reviewer_id UUID REFERENCES auth.users(id),
  reviewer_notes TEXT,                             -- moderator's feedback
  reviewed_at TIMESTAMPTZ,
  approved_net_id UUID REFERENCES nets(id),        -- link to created net if approved

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_net_submissions_status ON net_submissions (status);
CREATE INDEX idx_net_submissions_submitter ON net_submissions (submitter_id);
```

#### `net_corrections` table (suggested changes to existing nets)

```sql
CREATE TABLE net_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  net_id UUID NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
  submitter_id UUID NOT NULL REFERENCES auth.users(id),

  -- Changed fields (JSON diff format)
  changes JSONB NOT NULL,                          -- { "frequency": { "old": 7.258, "new": 7.260 }, "time_utc": { "old": "01:00", "new": "01:30" } }
  reason TEXT NOT NULL,                            -- explanation of why the change is needed

  -- Moderation
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id UUID REFERENCES auth.users(id),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_net_corrections_net ON net_corrections (net_id);
CREATE INDEX idx_net_corrections_status ON net_corrections (status);
```

#### `user_net_bookmarks` table

```sql
CREATE TABLE user_net_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  net_id UUID NOT NULL REFERENCES nets(id) ON DELETE CASCADE,

  -- Notification preferences per bookmark
  notify_before_minutes INTEGER,                   -- null = no notification, 5/10/15/30/60
  notify_emergency BOOLEAN NOT NULL DEFAULT false, -- notify on emergency activation

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, net_id)
);

CREATE INDEX idx_bookmarks_user ON user_net_bookmarks (user_id);
CREATE INDEX idx_bookmarks_net ON user_net_bookmarks (net_id);
```

#### `net_checkins` table (user participation log)

```sql
CREATE TABLE net_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  net_id UUID NOT NULL REFERENCES nets(id) ON DELETE CASCADE,

  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- date/time of the check-in
  band TEXT,                                          -- band used (may differ from net's primary)
  callsign_used TEXT,                                 -- callsign used for this check-in
  notes TEXT,                                         -- user's notes about the session

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkins_user ON net_checkins (user_id, checked_in_at DESC);
CREATE INDEX idx_checkins_net ON net_checkins (net_id, checked_in_at DESC);
```

#### `netlogger_snapshots` table (historical NetLogger activity)

```sql
CREATE TABLE netlogger_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  net_name TEXT NOT NULL,                            -- NetLogger net name (used for matching)
  matched_net_id UUID REFERENCES nets(id),           -- matched to our directory entry

  frequency TEXT NOT NULL,
  mode TEXT NOT NULL,
  ncs_callsign TEXT,
  logger_callsign TEXT,
  participant_count INTEGER NOT NULL,
  started_at TIMESTAMPTZ,

  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()      -- when we captured this data
);

CREATE INDEX idx_netlogger_snapshots_name ON netlogger_snapshots (net_name, snapshot_at DESC);
CREATE INDEX idx_netlogger_snapshots_matched ON netlogger_snapshots (matched_net_id, snapshot_at DESC);
```

### 4.2 RLS Policies

```sql
-- nets: readable by all, writable by owner or moderator
ALTER TABLE nets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nets are publicly readable"
  ON nets FOR SELECT
  USING (status = 'active');

CREATE POLICY "Net owners can update their nets"
  ON nets FOR UPDATE
  USING (owner_user_id = auth.uid());

CREATE POLICY "Moderators can manage all nets"
  ON nets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('moderator', 'admin')
    )
  );

-- net_submissions: submitters see their own, moderators see all pending
ALTER TABLE net_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own submissions"
  ON net_submissions FOR SELECT
  USING (submitter_id = auth.uid());

CREATE POLICY "Moderators can see all submissions"
  ON net_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('moderator', 'admin')
    )
  );

CREATE POLICY "Authenticated users can submit"
  ON net_submissions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- user_net_bookmarks: users manage their own bookmarks
ALTER TABLE user_net_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own bookmarks"
  ON user_net_bookmarks FOR ALL
  USING (user_id = auth.uid());

-- net_checkins: users manage their own check-ins
ALTER TABLE net_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own check-ins"
  ON net_checkins FOR ALL
  USING (user_id = auth.uid());
```

### 4.3 Local Store (Zustand)

For users without a Supabase account or when offline:

```typescript
interface NetStore {
  // Bookmarks (local fallback)
  bookmarkedNetIds: string[];
  bookmarkNet: (netId: string) => void;
  unbookmarkNet: (netId: string) => void;

  // Check-in history (local fallback)
  checkins: LocalNetCheckin[];
  addCheckin: (checkin: Omit<LocalNetCheckin, "id">) => void;
  removeCheckin: (id: string) => void;

  // Notification preferences
  notificationPrefs: Record<string, NotificationPref>;
  setNotificationPref: (netId: string, pref: NotificationPref) => void;

  // Filter state (persisted for convenience)
  savedFilters: NetFilterState;
  setSavedFilters: (filters: Partial<NetFilterState>) => void;

  // Cache metadata
  lastScheduleSync: string | null; // ISO timestamp of last full schedule fetch
}

interface LocalNetCheckin {
  id: string;
  netId: string;
  netName: string;
  checkedInAt: string; // ISO date
  band: string;
  callsignUsed: string;
  notes?: string;
}

interface NotificationPref {
  enabled: boolean;
  minutesBefore: 5 | 10 | 15 | 30 | 60;
  emergencyAlerts: boolean;
}

interface NetFilterState {
  bands: string[];
  modes: string[];
  types: string[];
  days: string[];
  timeRangeUtc: [number, number]; // [startMinutes, endMinutes] from 0-1439
  coverage: string | null;
  country: string | null;
  state: string | null;
  emergencyOnly: boolean;
  activeOnNetlogger: boolean | null;
}
```

### 4.4 Net Type Taxonomy

The canonical net type values, used in the `net_type` array field:

```typescript
const NET_TYPES = [
  "traffic", // ARRL NTS traffic handling
  "emergency", // General emergency communications
  "ares", // ARES-affiliated emergency net
  "races", // RACES-affiliated emergency net
  "skywarn", // SkyWarn severe weather reporting
  "cert", // Community Emergency Response Team
  "ragchew", // General conversation / social
  "dx", // DX spotting / chasing
  "cw_practice", // Morse code practice
  "club", // Club-sponsored regular net
  "digital", // Digital mode net (DMR, D-STAR, Fusion, WIRES-X)
  "repeater", // VHF/UHF repeater net
  "tactical", // Military/MARS tactical net
  "awards", // Awards-eligible net (OMISS, 3905, etc.)
  "newcomer", // New ham / Elmer net
  "missionary", // Faith-based / missionary net
  "maritime", // Maritime mobile net
  "military", // Military affiliated (MARS, etc.)
  "portable", // POTA/SOTA/Field Day oriented
  "technical", // Technical discussion / experimenter
  "qrp", // QRP-focused net
  "youth", // Youth / STEM / scouting
  "other", // Uncategorized
] as const;

type NetType = (typeof NET_TYPES)[number];
```

---

## 5. NetLogger API Integration

### 5.1 Vercel Edge Function: `/api/netlogger/active-nets`

```typescript
// api/netlogger/active-nets.ts (Vercel Edge Function)
//
// Proxies the NetLogger GetActiveNets endpoint:
// - Fetches XML from netlogger.org/api/GetActiveNets.php
// - Parses XML to JSON
// - Normalizes field names to Propulse canonical schema
// - Caches at Vercel Edge for 30 seconds
// - Returns JSON array of active nets

import { XMLParser } from "fast-xml-parser";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const res = await fetch("https://www.netlogger.org/api/GetActiveNets.php", {
    headers: { "User-Agent": "Propulse/1.0 (ham radio dashboard)" },
  });

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: "NetLogger API unavailable" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);

  // Normalize to canonical schema
  const nets = normalizeActiveNets(parsed);

  return new Response(JSON.stringify(nets), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

### 5.2 Vercel Edge Function: `/api/netlogger/checkins`

```typescript
// api/netlogger/checkins.ts
// Proxies GetCheckins.php for a specific net
// Query param: ?net=NetName (URL-encoded)
// Returns JSON array of check-in records

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const netName = url.searchParams.get("net");

  if (!netName) {
    return new Response(JSON.stringify({ error: "Missing net parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await fetch(
    `https://www.netlogger.org/api/GetCheckins.php?NetName=${encodeURIComponent(netName)}`,
    { headers: { "User-Agent": "Propulse/1.0 (ham radio dashboard)" } },
  );

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: "NetLogger API unavailable" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);

  const checkins = normalizeCheckins(parsed);

  return new Response(JSON.stringify(checkins), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

### 5.3 Vercel Edge Function: `/api/netlogger/past-nets`

```typescript
// api/netlogger/past-nets.ts
// Proxies GetPastNets.php for a specific date
// Query param: ?date=YYYY-MM-DD
// Returns JSON array of past net sessions

export const config = { runtime: "edge" };
```

### 5.4 Caching Strategy

The NetLogger API is a community resource. Propulse must be a good citizen and minimize unnecessary load.

| Layer                       | TTL                      | Purpose                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel Edge Cache**       | 30 seconds               | `s-maxage=30` on all NetLogger proxy responses. Ensures that 100 concurrent Propulse users generate only 1 upstream request per 30s.                                                                                                            |
| **Client TanStack Query**   | 60 seconds (`staleTime`) | The `useActiveNets()` hook refetches every 60 seconds. Combined with edge caching, this means ~2 upstream requests per minute at most.                                                                                                          |
| **IndexedDB snapshot**      | 5 minutes                | Active net data is written to IndexedDB on each successful fetch. If the edge function is unreachable, the client shows the last known state with a "Last updated X minutes ago" indicator.                                                     |
| **Supabase snapshot table** | Every 15 minutes (cron)  | A Vercel Cron Job (`/api/cron/netlogger-snapshot`) fetches active nets every 15 minutes and writes them to the `netlogger_snapshots` table. This builds the historical dataset for activity metrics without relying on client-side persistence. |

### 5.5 NetLogger-to-Directory Matching

Active nets from NetLogger must be matched to directory entries to enrich the "On Air Now" display with schedule information, descriptions, and bookmarks.

**Matching algorithm:**

1. **Exact name match**: If `activeNet.netName` exactly matches a `nets.name` or any value in `nets.alt_names`, match confidence = 1.0.
2. **Frequency + time match**: If the frequency is within 5 kHz and the current UTC time is within 30 minutes of the scheduled `time_utc`, match confidence = 0.8.
3. **Fuzzy name match**: Normalized Levenshtein distance on `netName` vs. `nets.name` (lowercase, stripped of "net", "the", common suffixes). If distance < 0.3, match confidence = 0.7.
4. **No match**: The active net is shown in "On Air Now" with a "Not in directory" indicator and a "Add this net" quick-link that pre-fills the submission form.

Matches with confidence >= 0.7 are stored. Confidence < 0.7 matches are flagged for manual review. Once a match is confirmed (automatically or by a moderator), the `netlogger_snapshots.matched_net_id` is set and future matching is instant.

### 5.6 Rate Limiting & Error Handling

- **Upstream timeout**: 5 second timeout on all NetLogger API calls. On timeout, return the last cached response from Vercel Edge Cache or IndexedDB.
- **Retry policy**: On 5xx errors, retry once after 2 seconds. On persistent failure, return cached data with a `stale: true` flag.
- **Circuit breaker**: If 5 consecutive requests to NetLogger fail within 5 minutes, stop attempting for 10 minutes. Show "NetLogger data temporarily unavailable" in the UI.
- **User-Agent**: All requests include `User-Agent: Propulse/1.0 (ham radio dashboard)` for transparency.
- **No authentication**: The NetLogger API does not require authentication for read-only endpoints.

---

## 6. Data Seeding Strategy

### 6.1 Source priority

The initial net directory is seeded from multiple sources in priority order. When the same net appears in multiple sources, the higher-priority source's data is used, with lower-priority sources filling in missing fields.

| Priority | Source                    | Est. Nets       | Method                                                      | Key Fields                                                       |
| -------- | ------------------------- | --------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| 1        | **NetLogger historical**  | 500-800         | API (`GetPastNets` for last 90 days)                        | Name, frequency, mode, NCS, participant counts, reliability data |
| 2        | **W0XZ HF Nets**          | 200+            | Manual extraction from w0xz.com/v/hfnets/                   | Name, frequency, mode, days, time_utc, time_utc_summer, band     |
| 3        | **AllStarNets.org**       | 47              | Manual extraction from allstarnets.org                      | Name, frequency, AllStar node, day, time, description            |
| 4        | **ARRL Net Directory**    | ~1,000-1,500    | Manual extraction (no API, requires scrape or manual entry) | Name, frequency, mode, day, time, sponsor, type                  |
| 5        | **NetFinder.radio**       | 500-600         | Manual extraction (no API)                                  | Name, frequency, mode, day, time, description, type              |
| 6        | **RepeaterBook**          | Enrichment only | API (repeater details for VHF/UHF nets)                     | Repeater callsign, offset, tone, location, ARES/RACES flags      |
| 7        | **Community submissions** | Ongoing         | User submissions via the submission form                    | All fields                                                       |

### 6.2 Seed script: `scripts/seed-nets.ts`

A Node.js script that:

1. **Phase 1 -- NetLogger bootstrap**: Fetches `GetPastNets` for the last 90 days. Groups sessions by net name. For each unique net name, infers schedule (most common day-of-week + time), calculates reliability (sessions / expected sessions), and computes average participant count. Creates directory entries with `source = 'netlogger'`.

2. **Phase 2 -- W0XZ import**: Reads a manually prepared JSON file (`data/seeds/w0xz-nets.json`) extracted from the W0XZ website. Each entry includes name, frequency, mode, band, days, time_utc, time_utc_summer. Matches against existing NetLogger-seeded entries by frequency and day. New entries get `source = 'w0xz'`; matches enrich the existing entry with W0XZ's additional fields (summer time, band).

3. **Phase 3 -- AllStarNets import**: Reads `data/seeds/allstar-nets.json`. These are mostly VHF/UHF nets with AllStar node IDs. Most will be new entries with `source = 'allstar'`.

4. **Phase 4 -- Manual curation**: A `data/seeds/curated-nets.json` file containing manually entered nets from ARRL, NetFinder, and other sources. These are nets that are well-known and high-traffic but not captured by the automated sources.

5. **Phase 5 -- Deduplication**: After all sources are loaded, run a deduplication pass using the matching algorithm from Section 5.5. Merge duplicates, keeping the highest-priority source's data as the base.

### 6.3 Seed data files

```
data/
  seeds/
    w0xz-nets.json         -- ~200 HF nets from w0xz.com
    allstar-nets.json       -- 47 AllStarLink nets
    curated-nets.json       -- 100-200 manually curated high-profile nets
    net-type-mappings.json  -- keyword-to-type mappings for automated categorization
```

### 6.4 Automated categorization

The seed script automatically assigns net types based on keyword analysis:

```typescript
const TYPE_KEYWORDS: Record<NetType, string[]> = {
  traffic: ["traffic", "nts", "message handling", "radiogram"],
  emergency: ["emergency", "emcomm", "disaster"],
  ares: ["ares", "amateur radio emergency"],
  races: ["races", "radio amateur civil emergency"],
  skywarn: ["skywarn", "severe weather", "weather spotter", "nws"],
  ragchew: ["ragchew", "rag chew", "social", "roundtable", "friendly"],
  dx: ["dx", "long path", "propagation"],
  cw_practice: ["cw practice", "code practice", "morse", "slow speed", "fist"],
  club: ["club", "association", "society", "arc", "radio club"],
  awards: ["omiss", "3905", "award", "county hunter", "nen"],
  qrp: ["qrp", "low power", "milliwatt"],
  newcomer: ["newcomer", "new ham", "elmer", "beginner", "tech net"],
  portable: ["pota", "sota", "field day", "portable", "parks on the air"],
  maritime: ["maritime", "marine", "waterway", "boat"],
  military: ["mars", "military", "armed forces"],
  digital: ["dmr", "d-star", "dstar", "fusion", "ysf", "wires-x", "digital"],
};
```

The net name and description are scanned against these keywords. Multiple types can be assigned.

### 6.5 RepeaterBook enrichment

For VHF/UHF nets that reference a repeater, a secondary enrichment pass:

1. Queries the RepeaterBook API for the repeater's callsign or frequency + location.
2. If found, populates: `repeater_callsign`, `repeater_offset`, `repeater_tone`, `repeater_location`.
3. If the RepeaterBook entry has ARES, RACES, or SKYWARN flags, and the net doesn't already have `emcomm_flags`, add them.

### 6.6 Ongoing data freshness

- **NetLogger cron** (Section 5.4): Every 15 minutes, snapshot active nets. Weekly batch job analyzes snapshots to update `last_netlogger_activity`, `netlogger_avg_participants`, and `netlogger_reliability_pct` on matched directory entries.
- **Stale detection**: Nets not confirmed active (via NetLogger, NCS update, or community correction) for 6 months get an "Unconfirmed" badge. After 12 months, they are moved to `status = 'archived'`.
- **Community corrections**: The correction flow (Section 3.6.2) keeps data current without requiring moderator initiative.

---

## 7. Privacy & Moderation

### 7.1 Privacy principles

- **NCS callsigns are public**: Net control stations operate in a public capacity. Their callsigns are already broadcast on air and published in existing directories. Propulse does not add new privacy exposure.
- **Participant callsigns from NetLogger are public**: NetLogger check-in lists are already visible on netlogger.org. Propulse surfaces the same data through its API.
- **Propulse user bookmarks are private**: No user can see which other users have bookmarked a net. Only the aggregate `subscriber_count` is visible (and only to the net owner/NCS).
- **Check-in history is private**: A user's net participation log is visible only to that user.
- **Location data**: Users are never required to enter location data to use the net directory. Location-based features (area emergency alerts, nearby repeater nets) use the grid square or state already in the operator's profile, not GPS or IP geolocation.

### 7.2 Moderation workflow

#### 7.2.1 Submission review

1. New net submissions appear in a moderator queue at `/admin/net-moderation`.
2. Each submission shows:
   - Submitter's callsign and account age
   - All submitted fields
   - Duplicate detection results (fuzzy matches against existing nets)
   - A map pin if frequency and mode are provided (helpful for confirming repeater nets)
3. Moderator actions:
   - **Approve**: Creates a new `nets` entry. Notifies the submitter.
   - **Reject** (with reason): Sets status to `rejected`. Notifies the submitter with the reason.
   - **Request changes**: Sets status to `needs_changes`. Notifies the submitter with specific feedback.
   - **Merge with existing**: If the submission is a duplicate of an existing net, merge new fields into the existing entry.

#### 7.2.2 Correction review

1. Corrections appear in a separate tab of the moderation queue.
2. Each correction shows a diff view: old value vs. proposed value for each changed field, plus the submitter's reason.
3. Moderator actions:
   - **Apply**: Updates the `nets` entry with the proposed changes. Credits the corrector.
   - **Reject** (with reason): Discards the correction. Notifies the submitter.
   - **Partial apply**: Moderator can accept some changes and reject others.

#### 7.2.3 Abuse handling

- **Spam submissions**: 3+ rejected submissions from the same user triggers a review of the account. Moderators can restrict the user's submission privileges.
- **Offensive content**: Net descriptions and check-in procedures are scanned for prohibited content patterns on submission. Flagged submissions go to a priority moderation queue.
- **Impersonation**: If a user claims NCS ownership of a net and the actual NCS disputes it, the moderator revokes the claim and may restrict the impersonator's account.

### 7.3 Moderator tooling

- Moderators are users with `role = 'moderator'` or `role = 'admin'` in the `profiles` table (same role system as the Shack Builder V2 equipment moderation).
- The moderation queue is accessible at `/admin/net-moderation` (protected by role check).
- Moderator actions are logged in an `admin_audit_log` table for accountability.
- Statistics dashboard: submissions per day, average time to review, approval/rejection rate.

---

## 8. Gamification Integration

The net database ties into the Propulse XP and achievement system defined in the Operator Profile V2 PRD. Net participation is a first-class XP source.

### 8.1 XP awards

| Action                                   | XP          | Cooldown                | Rationale                      |
| ---------------------------------------- | ----------- | ----------------------- | ------------------------------ |
| Check in to a net (logged)               | 15 XP       | 1 per net per day       | Core participation reward      |
| Check in to 3 different nets in one week | 30 XP bonus | Weekly                  | Encourages exploration         |
| Check in to a net on a new band          | 20 XP       | 1 per band per net      | Encourages multi-band activity |
| Submit a net to the directory (approved) | 50 XP       | Per approved submission | Rewards community contribution |
| Submit a correction (approved)           | 25 XP       | Per approved correction | Rewards data stewardship       |
| Bookmark 5 nets                          | 10 XP       | One-time                | Onboarding milestone           |

### 8.2 Achievements / Badges

| Badge                     | Requirement                                         | Icon Concept                |
| ------------------------- | --------------------------------------------------- | --------------------------- |
| **Net Newbie**            | Check in to your first net                          | Radio with green check mark |
| **Net Regular**           | Check in to the same net 4 weeks in a row           | Calendar with streak flame  |
| **Net Explorer**          | Check in to 10 different nets                       | Compass rose                |
| **Net Controller**        | Register as NCS for a net                           | Microphone with star        |
| **Emergency Ready**       | Check in to 3 different emergency/ARES/SkyWarn nets | Shield with lightning bolt  |
| **Band Hopper**           | Check in to nets on 5 different bands               | Rainbow spectrum bar        |
| **Directory Contributor** | Have 3 net submissions approved                     | Pen writing on document     |
| **Data Steward**          | Have 5 corrections approved                         | Wrench with check mark      |
| **Night Owl**             | Check in to a net between 0300-0600 UTC             | Moon with headset           |
| **Iron Streak**           | 12-week consecutive check-in streak on any net      | Iron medal                  |

### 8.3 Streak tracking

Streaks are tracked per net per user:

- A streak increments when the user logs a check-in for a net in its scheduled week (for weekly nets) or scheduled day (for daily nets).
- A streak resets if the user misses a scheduled occurrence.
- The current streak and longest streak are displayed on the net detail page (in the "My Activity" section) and in the user's net activity dashboard.
- Streak data is stored in the `net_checkins` table and computed on the fly (no separate streak table needed -- a query groups check-ins by week and counts consecutive weeks).

### 8.4 Leaderboards (future consideration)

Not in V1 of the net database, but the data model supports future leaderboards:

- "Most active net participants this month" (per net)
- "Most reliable NCS operators" (based on net running consistently)
- "Top contributors" (approved submissions + corrections)

These are noted as future scope because leaderboards introduce competitive dynamics that need careful design to avoid discouraging newcomers.

---

## 9. UI Components

### 9.1 Component architecture

| Component                  | Location                | Purpose                                                                                                                                                     |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NetLivePanel.tsx`         | `src/components/nets/`  | "Nets On Air Now" real-time panel. Shows active nets from NetLogger with auto-refresh. Used on the Net Directory page and optionally on the main dashboard. |
| `NetDirectoryPage.tsx`     | `src/pages/`            | Full net directory page at `/nets`. Contains search bar, filter panel, result list, and calendar toggle.                                                    |
| `NetCalendar.tsx`          | `src/components/nets/`  | Calendar view of net schedules. Week view, day view, and "next hour" compact view.                                                                          |
| `NetDetailPage.tsx`        | `src/pages/`            | Full net detail page at `/nets/{slug}`. All sections from Section 3.4.                                                                                      |
| `NetCard.tsx`              | `src/components/nets/`  | Compact net result card used in search results and bookmark lists.                                                                                          |
| `NetSubmitForm.tsx`        | `src/components/nets/`  | Community net submission form with duplicate detection.                                                                                                     |
| `NetCorrectionForm.tsx`    | `src/components/nets/`  | Correction suggestion form for existing nets.                                                                                                               |
| `NetCheckinLogger.tsx`     | `src/components/nets/`  | Manual check-in logging UI.                                                                                                                                 |
| `NetActivityDashboard.tsx` | `src/components/nets/`  | User's net participation history, streaks, and stats.                                                                                                       |
| `NetEmergencyBanner.tsx`   | `src/components/nets/`  | Emergency net overlay banner with alert styling.                                                                                                            |
| `NetFilterPanel.tsx`       | `src/components/nets/`  | Collapsible filter facet panel for the directory.                                                                                                           |
| `NetBookmarkButton.tsx`    | `src/components/nets/`  | Heart icon bookmark toggle with notification settings popover.                                                                                              |
| `NetScheduleCard.tsx`      | `src/components/nets/`  | Schedule display card with timezone conversion and iCal export.                                                                                             |
| `NetCheckinList.tsx`       | `src/components/nets/`  | Live check-in list table from NetLogger data.                                                                                                               |
| `NetModerationQueue.tsx`   | `src/components/admin/` | Moderator submission/correction review interface.                                                                                                           |

### 9.2 Design language

The net database follows the established Propulse design language:

- **Surfaces**: `bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl` for cards.
- **Primary accent**: `plasma-orange` for active states, bookmarks, and CTAs.
- **Band colors**: Reuse the band color palette from the propagation displays for consistent visual language. When a net card shows "40m", the pill uses the same color as 40m in the band condition displays.
- **Emergency colors**: `alert-red` for ARES/RACES/emergency badges, `caution-amber` for SkyWarn watch-level alerts.
- **Live indicator**: Pulsing `signal-green` dot for "On Air Now" status, matching the existing online indicator pattern.
- **Typography**: `text-gray-200` primary, `text-gray-400` secondary, `text-gray-500` muted. Net names in `font-semibold`, frequencies in `font-mono`.
- **Spacing**: `space-y-4` between cards, `gap-2` inline, `p-4` mobile / `p-6` desktop card padding.

### 9.3 Navigation

The Net Database is accessible from:

- **Primary nav**: A "Nets" tab in the main navigation bar (alongside Dashboard, Map, Logbook, Shack, Profile, Settings).
- **Dashboard widget**: An optional "Nets On Air Now" widget on the main dashboard showing the top 3-5 active nets (compact cards). Tapping "See all" navigates to `/nets`.
- **Deep links**: `/nets` (directory), `/nets/{slug}` (detail), `/nets?tab=calendar` (calendar view), `/nets?tab=my-nets` (bookmarks).

### 9.4 Route structure

```
/nets                           -- Net directory (search + filter)
/nets?tab=calendar              -- Calendar view
/nets?tab=my-nets               -- My bookmarked nets + activity
/nets/{slug}                    -- Net detail page
/nets/{slug}?tab=live           -- Net detail with live check-in tab
/nets/submit                    -- New net submission form
/admin/net-moderation           -- Moderator queue (role-restricted)
```

---

## 10. Mobile Experience

### 10.1 Layout adaptations

**Net directory (`/nets`):**

- Search bar is sticky at the top.
- Filter panel is a bottom sheet (slide-up from bottom) triggered by a "Filters" button, matching the mobile filter pattern used elsewhere in Propulse.
- Result cards are full-width, stacked vertically.
- The "On Air Now" panel appears above the search results as a horizontal scrollable card strip.
- Sort control is a dropdown above the results list.

**Net calendar:**

- Week view uses horizontal scrolling with the current day centered.
- Day view is the default on mobile (simpler, less cramped).
- "Next hour" view is a compact vertical list, ideal for the mobile "what's happening now?" use case.

**Net detail page:**

- Full-screen page with a back arrow navigation.
- Sections collapse into an accordion pattern. Schedule, Frequency, and Description are expanded by default; Activity, Check-ins, and Community are collapsed.
- Live check-in list is a scrollable table with horizontal overflow.
- "Log a check-in" is a floating action button (FAB) in the bottom-right corner.

### 10.2 Touch interactions

- **Swipe left on a net card**: Reveals "Bookmark" and "Share" quick actions.
- **Long-press on a bookmarked net**: Opens notification settings for that net.
- **Pull-to-refresh on the directory**: Triggers a manual refresh of both the directory results and the "On Air Now" panel.

### 10.3 Performance considerations

- **Virtual scrolling**: The result list uses `react-window` or `@tanstack/react-virtual` for rendering large filtered result sets without DOM bloat.
- **Image lazy loading**: Net logos or sponsor logos (if any) use `loading="lazy"` and `IntersectionObserver` for deferred loading.
- **Skeleton loading**: All data-dependent sections show skeleton placeholders during fetch.

---

## 11. Offline Support

### 11.1 IndexedDB cache: `propulse-nets-cache`

The full net schedule is cached in IndexedDB for offline access.

**Cache structure:**

```typescript
interface NetsCacheDB {
  // Object store: 'nets'
  // Key: net.id (UUID)
  // Value: full Net object from Supabase
  nets: Net[];

  // Object store: 'active-nets'
  // Key: 'latest'
  // Value: last known active nets from NetLogger
  activeNets: ActiveNet[];

  // Object store: 'metadata'
  // Key: 'sync'
  // Value: { lastFullSync: ISO string, lastActiveSync: ISO string, netCount: number }
  metadata: CacheMetadata;
}
```

### 11.2 Sync strategy

| Event                  | Action                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| **App load (online)**  | Background fetch of nets updated since `lastFullSync`. Merge into IndexedDB.                      |
| **App load (offline)** | Read from IndexedDB. Show "Offline -- showing cached schedule" banner.                            |
| **Full sync**          | Every 24 hours, fetch all active nets from Supabase and replace the IndexedDB `nets` store.       |
| **Incremental sync**   | Every 5 minutes (when online), fetch nets with `updated_at > lastFullSync`. Merge into IndexedDB. |
| **Active nets**        | Every 60 seconds (Section 5.4), update the `active-nets` store.                                   |

### 11.3 Offline capabilities

When offline, the user can:

- Browse the cached net schedule (search, filter, calendar view)
- View net detail pages for cached nets
- Access their bookmarked nets list
- View their check-in history (locally stored)
- Log a new check-in (queued for Supabase sync when online)

When offline, the user cannot:

- See "Nets On Air Now" (requires live data; last known state is shown with staleness indicator)
- Submit a new net or correction (queued for submission when online)
- See live check-in lists
- Receive push notifications (requires service worker + network)

### 11.4 Service worker integration

The existing Propulse PWA service worker (`sw.js`) is extended with:

- **Net schedule pre-cache**: On service worker install, fetch and cache the top 100 most-bookmarked nets.
- **Background sync**: When a check-in or submission is created offline, register a background sync event. The service worker retries the submission when connectivity returns.
- **Push notification scheduling**: For bookmarked nets with notification preferences, the service worker schedules local notifications based on the cached schedule. This works even when the app is closed (on supported platforms).

---

## 12. API Endpoints

### 12.1 Vercel Edge Functions (NetLogger proxy)

| Endpoint                                     | Method | Purpose                 | Cache    |
| -------------------------------------------- | ------ | ----------------------- | -------- |
| `/api/netlogger/active-nets`                 | GET    | Currently active nets   | 30s edge |
| `/api/netlogger/checkins?net={name}`         | GET    | Check-in list for a net | 30s edge |
| `/api/netlogger/past-nets?date={YYYY-MM-DD}` | GET    | Nets on a past date     | 1h edge  |

### 12.2 Supabase client queries (via TanStack React Query)

These are not REST endpoints but Supabase client SDK queries wrapped in TanStack React Query hooks:

| Hook                      | Query                                                                               | Refetch              |
| ------------------------- | ----------------------------------------------------------------------------------- | -------------------- |
| `useNets(filters)`        | `supabase.from('nets').select('*').eq('status', 'active')` + dynamic filters        | staleTime: 5 min     |
| `useNet(slug)`            | `supabase.from('nets').select('*').eq('slug', slug).single()`                       | staleTime: 5 min     |
| `useActiveNets()`         | `fetch('/api/netlogger/active-nets')`                                               | refetchInterval: 60s |
| `useNetCheckins(netName)` | `fetch('/api/netlogger/checkins?net=${netName}')`                                   | refetchInterval: 60s |
| `useMyBookmarks()`        | `supabase.from('user_net_bookmarks').select('*, nets(*)').eq('user_id', userId)`    | staleTime: 1 min     |
| `useMyCheckins(filters)`  | `supabase.from('net_checkins').select('*, nets(name, slug)').eq('user_id', userId)` | staleTime: 5 min     |
| `useNetActivity(netId)`   | `supabase.from('netlogger_snapshots').select('*').eq('matched_net_id', netId)`      | staleTime: 15 min    |

### 12.3 Supabase mutations

| Mutation                 | Table                | Purpose                                                      |
| ------------------------ | -------------------- | ------------------------------------------------------------ |
| `bookmarkNet(netId)`     | `user_net_bookmarks` | Add bookmark + increment `nets.subscriber_count` via trigger |
| `unbookmarkNet(netId)`   | `user_net_bookmarks` | Remove bookmark + decrement `nets.subscriber_count`          |
| `logCheckin(data)`       | `net_checkins`       | Record a net check-in                                        |
| `submitNet(data)`        | `net_submissions`    | Submit a new net for moderation                              |
| `submitCorrection(data)` | `net_corrections`    | Submit a correction for an existing net                      |
| `claimNet(netId)`        | `nets`               | Set `owner_user_id` (with verification)                      |
| `updateNet(netId, data)` | `nets`               | NCS updates their own net listing                            |

### 12.4 Vercel Cron Jobs

| Cron                            | Schedule                 | Purpose                                                                                                           |
| ------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `/api/cron/netlogger-snapshot`  | Every 15 minutes         | Fetch active nets and write to `netlogger_snapshots`                                                              |
| `/api/cron/net-activity-rollup` | Daily at 0600 UTC        | Compute `netlogger_avg_participants`, `netlogger_reliability_pct`, `last_netlogger_activity` for all matched nets |
| `/api/cron/net-stale-check`     | Weekly (Sunday 0000 UTC) | Flag nets not confirmed in 6 months as "Unconfirmed", archive nets inactive for 12 months                         |

---

## 13. Success Metrics

### 13.1 Launch metrics (30 days)

| Metric                                 | Target                  | How measured                              |
| -------------------------------------- | ----------------------- | ----------------------------------------- |
| Net directory entries at launch        | 500+                    | Supabase query on `nets` table            |
| Net directory entries at 30 days       | 750+ (community growth) | Same                                      |
| "Nets On Air Now" panel loads per day  | 500+                    | Edge function invocation count            |
| Unique users visiting `/nets` per week | 200+                    | Route-based analytics event               |
| Nets bookmarked per active user        | 3+ (mean)               | `user_net_bookmarks` count / active users |
| Community net submissions (30 days)    | 50+                     | `net_submissions` count                   |
| Net check-ins logged (30 days)         | 200+                    | `net_checkins` count                      |

### 13.2 Growth metrics (90 days)

| Metric                                          | Target                       | Rationale                                                     |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| Directory entries                               | 1,500+                       | Approaching "critical mass" where most active nets are listed |
| Weekly active users on `/nets`                  | 500+                         | Net directory becomes a habit for daily/weekly visitors       |
| "On Air Now" average active nets displayed      | 5-15 (varies by time of day) | Matches expected NetLogger activity levels                    |
| Average time on net directory per session       | 3+ minutes                   | Indicates browsing/discovery behavior, not just lookup        |
| Push notification opt-in rate (bookmarked nets) | 20% of bookmarkers           | Notifications drive return visits                             |
| Community correction submissions per week       | 10+                          | Directory is community-maintained, not just seeded            |
| NCS claims (net owners)                         | 50+                          | Net controllers are investing in the platform                 |

### 13.3 Quality metrics

| Metric                                   | Target                                            | How measured                                         |
| ---------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Stale nets (no confirmation in 6 months) | < 15% of directory                                | Supabase query                                       |
| Average moderation review time           | < 48 hours                                        | `reviewed_at - created_at` on submissions            |
| Submission approval rate                 | > 70%                                             | Indicates good submission quality and low spam       |
| NetLogger match rate                     | > 60% of active nets matched to directory entries | `netlogger_snapshots` with non-null `matched_net_id` |
| Page load time (`/nets`, median mobile)  | < 2 seconds                                       | Performance monitoring                               |
| Active nets API latency (P95)            | < 300ms                                           | Edge function monitoring                             |
| Net detail page load (P95)               | < 1.5 seconds                                     | Performance monitoring                               |
| Offline schedule access success rate     | > 95% (for users who loaded at least once online) | Service worker analytics                             |

### 13.4 Engagement benchmarks

The net database is successful if it becomes the operator's first stop for net information -- replacing manual Google searches, PDF lists, and word-of-mouth. The benchmark is RepeaterBook's position in the repeater space: not the only source, but the most comprehensive and most frequently consulted one.

**Leading indicators of success:**

- Users searching for specific net names (they know what they want and expect to find it here)
- Users with 5+ bookmarked nets (the directory is part of their routine)
- NCS operators claiming their nets (the directory has credibility with net leadership)
- Other ham radio websites linking to Propulse net detail pages (the directory is authoritative)

**Failure indicators to watch:**

- High bounce rate on `/nets` (users don't find what they're looking for)
- Low community submission rate (directory is perceived as static, not participatory)
- NetLogger match rate below 40% (the directory isn't comprehensive enough to match live data)
- Moderator queue growing faster than review capacity (scaling problem)

---

## Implementation Tiers

Features are delivered in tiers to minimize risk and establish foundations before building dependent features:

| Tier                          | Features                                                                                    | Dependencies                       | Risk                              |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------- |
| **T1: Core directory**        | `nets` table, seed data, Net Directory page, search, filter, Net Detail page                | Supabase infrastructure            | Medium -- backend dependency      |
| **T2: Live tracking**         | NetLogger proxy Edge Functions, "Nets On Air Now" panel, live check-in list, cron snapshots | T1 + NetLogger API availability    | Medium -- external API dependency |
| **T3: Personalization**       | My Nets bookmarks, notification preferences, push notifications, My Nets dashboard          | T1 + PWA service worker            | Low -- additive features          |
| **T4: Community**             | Net submission form, correction form, moderation queue, NCS claim flow                      | T1 + moderation tooling            | Medium -- moderation capacity     |
| **T5: Calendar & scheduling** | Net Calendar view (week/day/next-hour), timezone handling, iCal export, "Starting soon"     | T1                                 | Low -- pure frontend              |
| **T6: Gamification**          | Check-in logging, streak tracking, XP awards, achievements, activity dashboard              | T1 + Operator Profile V2 XP system | Low -- self-contained             |
| **T7: Emergency overlay**     | Emergency net visual treatment, activation triggers, area-based alerting                    | T2 + T3 (notifications)            | Low -- mostly presentation        |

### Rollback strategy

- **T1**: If Supabase is unreachable, the directory page shows a cached static dataset bundled at build time (similar to the equipment database fallback in Shack Builder V2).
- **T2**: If the NetLogger API becomes unavailable, the "On Air Now" panel shows "Live data temporarily unavailable" and the rest of the directory continues to function. The circuit breaker (Section 5.6) prevents cascading failures.
- **T3-T7**: Pure frontend features with no external dependencies beyond T1/T2. Rollback is a git revert.

---

_This PRD is a living document. As implementation progresses through the tiers, sections will be updated to reflect design decisions, technical tradeoffs, and community feedback. The net database is a community feature -- its value grows with participation._
