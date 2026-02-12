# Net Control Manager — Vision & Brainstorm

> **Origin**: Brainstormed in session Feb 11, 2026.
> **Status**: Early ideation — not yet scoped for implementation.
> **Related**: `docs/plans/PRD-PROFILE-REMAINING.md` (item #4: Net Database Integration),
> `docs/requirements/phase-2/PRD-NET-DATABASE.md` (original requirements)

---

## The Core Idea

A complete system for ham radio nets — from discovery to live session management.
Three user roles, four major subsystems, integrated with the rest of Propulse.

No ham radio platform has digitized the net experience well. Net schedules live
on scattered websites, NCS operators track check-ins on paper or spreadsheets,
and participants rely on memory or sticky notes for their net schedule. Propulse
can own this entire workflow.

### Design Philosophy: The Clipboard, Not The Stage

**The radio is still the radio.** Nets exist to practice radio skills — operating
procedures, communication discipline, emergency preparedness. If we digitize the
core activity, we defeat the purpose. Nobody needs another internet chat room.

**Propulse is the NCS's clipboard, not a replacement for the stage.**

The app handles the bookkeeping that already happens on paper and spreadsheets.
The net itself — check-ins, traffic, ragchewing — always happens over the air.
If every Propulse server went down mid-net, the net continues without missing
a beat. Zero internet dependency for the actual radio activity.

**What the app does:**

- **Before**: Net info page (what it is, when it meets, who runs it). Set a reminder. That's it.
- **During**: Give the NCS a digital scratch pad to track what they hear on the air
  (replaces the legal pad and pencil, nothing more). NCS makes their notes
  about the session just like they would on paper.
- **After**: Save the session log, track attendance, share a summary.
  Participation goes into your logbook history — you were there, you got
  radio time in.

**The one nice touch**: When the NCS types your callsign into their scratch pad
(because they heard you check in on the air), and you happen to be a Propulse
user, you get a passive notification: "You've been checked into OMISS 20m Net."
That's it — no behavior changed, no radio skill bypassed. The NCS did their job
on the air, and you got a nice record of it.

**What the app must NEVER do:**

- Replace over-the-air check-in with a button click
- Tune your radio or take over radio control
- Facilitate the actual radio procedures through software
- Create a dependency where participants need the app to participate
- Make the net unable to function if the internet goes down
- Turn the NCS dashboard into a chat room or digital net

You still have to make your radio work, get on the air, do your reports,
and check in yourself. The value is in the **periphery** — discovery,
scheduling, record-keeping — not in replacing the core radio activity.

---

## User Roles

### 1. Net Control Station (NCS) — "The Host"

The operator actively running a net session. They need:

- A dedicated **live dashboard** (full-screen view) to manage the session
- Real-time check-in tracking, queue management, timing
- Session logging and post-net reports
- Net-type-specific tooling (traffic queue, swap listings, assignment tracking)
- May rotate — a net can have multiple designated NCS operators

### 2. Net Participant — "The Attendee"

A regular operator who checks into nets. They need:

- A way to **discover** nets (searchable directory)
- A way to **subscribe** to favorite nets (the "Station Notebook")
- **Alerts and reminders** before nets start
- Smooth **check-in experience** (either via app or just on-air)
- Visibility into their subscriptions from their profile

### 3. Net Creator/Manager — "The Organizer"

The person who owns the net listing. May or may not be NCS on any given session.
They need:

- Net **creation and configuration** (schedule, frequency, type, description)
- **NCS rotation management** (designate multiple NCS operators)
- **Listing control** (public directory, unlisted, or private/invite-only)
- Analytics (attendance trends, session history, participant engagement)
- The ability to **transfer ownership** or add co-managers

---

## Subsystem 1: Net Registry (The Directory)

A searchable, browsable catalog of amateur radio nets.

### Net Types

Each type has slightly different NCS tooling and participant experience:

| Type                         | Description                               | NCS Tooling Needs                                                      |
| ---------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| **Ragchew / Roundtable**     | Social conversation, everyone gets a turn | Round-robin queue, turn timer (optional)                               |
| **Traffic Net**              | Formal NTS message handling               | Priority queue (emergency/priority/routine/welfare), message tracking  |
| **Swap / Trade**             | Buy, sell, trade equipment                | Listings queue with item descriptions, "sold" tracking                 |
| **ARES / RACES / Emergency** | Emergency communications                  | Formal check-in with location, assignment tracking, priority messaging |
| **DX Net**                   | DX spotting with managed pileup           | Caller queue, DX station tracker, "worked" list                        |
| **Training / Elmer**         | Educational, Q&A format                   | Topic queue, presenter notes, Q&A queue                                |
| **SKYWARN / Weather**        | Severe weather reporting                  | Location-tagged reports, severity levels, relay tracking               |
| **Club Net**                 | Regular club check-ins + announcements    | Announcement queue, member roster check-in                             |
| **Specialty**                | QRP, satellite, digital, etc.             | Flexible — inherits from ragchew with custom labels                    |

### Net Listing Fields

Each net in the registry has:

- **Name**: "OMISS 20m Net", "Tri-County ARES Net"
- **Type**: From the type taxonomy above
- **Frequency**: Primary (e.g., 14.260 MHz) + optional alternate/backup
- **Mode**: SSB, CW, FM, Digital, etc.
- **Band**: Derived from frequency, also explicit for band-based nets
- **Schedule**: Recurring pattern (e.g., "Every Tuesday, 0100 UTC") or ad-hoc
- **Duration**: Typical length (e.g., "~60 minutes")
- **Region / Coverage**: Geographic area or "worldwide"
- **Description**: Free text, what the net is about
- **Preamble / Script**: Optional template text the NCS reads at the start
- **NCS Roster**: List of designated NCS operators (callsigns + rotation schedule)
- **Website / External Links**: Optional
- **Repeater Info**: For FM nets — repeater callsign, offset, tone
- **Visibility**: Public (in directory), Unlisted (shareable link), Private (invite-only)
- **Tags**: Searchable labels (similar to interest tags on profiles)

### Directory Search & Filtering

- Full-text search on name, description, tags
- Filter by: type, band, mode, day of week, time range (UTC), region
- Sort by: popularity (subscriber count), next upcoming, recently added
- "Nets happening now" — live indicator for nets currently in session
- "Nets near me" — filter by geographic proximity (for repeater/local nets)
- Cross-reference with user's bands/modes from logbook stats

### Net Detail Page

Each net gets a dedicated page showing:

- All listing fields above
- Next scheduled session with countdown
- Subscriber count (if public)
- Recent session history (dates, NCS, attendance)
- "Subscribe" / "Unsubscribe" button
- "LIVE NOW" indicator when a session is active (informational — tune your radio!)
- Map showing subscriber locations (if opted in)
- Link to NCS dashboard (if user is a designated NCS)

---

## Subsystem 2: NCS Live Dashboard

A dedicated full-screen view for the Net Control Station operator to run a
live net session. This is the centerpiece feature.

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Net Name]           LIVE ●          Duration: 00:47:23           │
│  14.260 MHz SSB       NCS: W1ABC      Check-ins: 23               │
├───────────────────────────────────┬─────────────────────────────────┤
│                                   │                                 │
│  CHECK-IN LIST                    │  QUEUE                          │
│                                   │                                 │
│  ● W1ABC (NCS)         ✓ 00:00   │  NOW:  KB0EL                   │
│  ● KB0EL               ✓ 00:03   │  NEXT: N5XYZ                   │
│  ● N5XYZ               ✓ 00:05   │  THEN: WA2DEF                  │
│  ● WA2DEF              ✓ 00:07   │                                 │
│  ● K3ABC  (via relay)  ✓ 00:12   │  ┌─────────────────────────┐   │
│  ○ VE3RST  (pending)             │  │  Timer: 3:42 remaining  │   │
│  ○ AA1BBB  (late)                │  │  [+1min] [Skip] [Done]  │   │
│                                   │  └─────────────────────────┘   │
│  [+ Add Station]                  │                                 │
│                                   │  TRAFFIC / NOTES               │
│                                   │  KB0EL: Has traffic for W1ABC  │
│                                   │  N5XYZ: Announcement re: Field │
│                                   │         Day planning            │
│                                   │                                 │
├───────────────────────────────────┴─────────────────────────────────┤
│  [Preamble] [Announcements] [Call for Check-ins] [Close Net]       │
│  Session Notes: __________________________________________________ │
└─────────────────────────────────────────────────────────────────────┘
```

### Core NCS Features

**Check-In Management** (digital scratch pad — replaces paper log):

- NCS types callsigns as they hear stations check in **on the air**
- Check-in is always over the radio — the app just records what NCS hears
- No "app-based check-in" button — that would bypass the radio skill practice
- Check-in status: Checked In → Had Turn → Completed
- Late check-in: Stations arriving after initial roll call get flagged
- "Relay" indicator: Mark stations being relayed through another station
- Check-in timestamp for each station
- If a checked-in callsign matches a Propulse user, link to their profile (nice-to-have)

**Queue Management**:

- Drag-and-drop reordering (or arrow buttons for keyboard users)
- "Now Speaking" highlight with optional turn timer
- Auto-advance: when NCS marks current station "Done," next moves up
- Priority insertion: for stations with emergency/priority traffic
- "Skip" and "Come Back" for stations not responding

**Turn Timer** (optional, configurable per net):

- Countdown timer shown on dashboard
- Warning at configurable threshold (e.g., 30 seconds remaining)
- NCS can extend (+1 min, +2 min) or skip
- Timer is a tool, not a hard cutoff — NCS always has override

**Net-Type-Specific Panels**:

_Traffic Net_:

- Message priority levels: Emergency, Priority, Routine, Welfare
- Message routing: "KB0EL has traffic for W1ABC" with accept/pass tracking
- Formal message form (if NCS wants to log message content)

_Swap/Trade Net_:

- Listings queue: Item description, asking price, contact info
- "Sold/Claimed" status tracking
- Persistent listings that carry over between sessions

_ARES/Emergency Net_:

- Location tracking per station (grid or address)
- Assignment board: "K3ABC — assigned to shelter Alpha"
- Status updates: Available, Assigned, Deployed, Off-duty
- Priority message queue with severity levels

_DX Net_:

- DX station info panel (callsign, entity, frequency, mode)
- Caller queue for working the DX station
- "Worked" checklist as stations complete QSOs
- Propagation indicator for the DX path

**Session Management**:

- Start/End session controls
- Net preamble prompt (scrollable script the NCS reads)
- "Call for check-ins" prompt
- Announcements section
- "Close net" sequence with closing remarks prompt
- Post-session summary auto-generated:
  - Date, time, duration
  - NCS callsign
  - Total check-ins
  - Traffic handled (for traffic nets)
  - Notable events / NCS notes
  - Exportable as text, PDF, or shareable link

**Session History**:

- Log of all past sessions for this net
- Attendance tracking over time (who checks in regularly?)
- NCS rotation tracking
- Searchable by date, NCS, participant

---

## Subsystem 3: Station Notebook (Personal Favorites)

The personal "operating guide" where operators save their favorite nets,
frequencies, and radio hangouts. This is the concept of the "book where
you write down all the interesting places."

### What Goes in the Notebook

**Net Subscriptions**:

- Nets you've subscribed to from the directory
- Shows: name, next session, frequency, your alert preferences
- Quick actions: "View net detail", set reminder preferences

**Favorite Frequencies**:

- Already partially built in "Where to Find Me" (`FavoriteFreqList.tsx`)
- Extend to support grouping: "My Net Frequencies", "Ragchew Spots", "DX Hunting"
- Each entry: frequency, mode, band (auto-detected), notes, optional schedule

**Saved Stations**:

- Repeaters you use regularly
- Stations/operators you like to ragchew with
- Linked to their Propulse profile if they have one

### Notebook Display

- Accessible from profile sidebar or main navigation
- Feeds into "Where to Find Me" on your profile (cross-pollination)
- Privacy controls: choose which entries are visible on your public profile
- Calendar view: your weekly net schedule at a glance
- List view: all entries sorted by next upcoming

### Integration with Profile

- Station Notebook entries can optionally appear in your "Where to Find Me" section
- "My Nets" subsection on profile shows subscribed nets (visibility controlled)
- Operating hours auto-enriched: nets you attend appear as scheduled blocks
- Other operators visiting your profile can see shared nets (if public)

---

## Subsystem 4: Alert System (System-Wide)

A notification infrastructure that starts with net alerts but serves the
entire Propulse platform. This is foundational — once built, it supports
spot watch alerts, on-air notifications, contest reminders, and more.

### Alert Types (Starting with Nets)

| Alert                     | Trigger                        | Display                               |
| ------------------------- | ------------------------------ | ------------------------------------- |
| **Net Reminder (10 min)** | 10 min before scheduled start  | Notification badge + optional overlay |
| **Net Reminder (5 min)**  | 5 min before, if not dismissed | Reminder notification                 |
| **Net Countdown (3 min)** | 3 min before                   | Persistent countdown timer on screen  |
| **Net Live**              | NCS starts the session         | "Net is LIVE" indicator + frequency   |
| **Checked In**            | NCS types your callsign        | "You've been checked into [Net Name]" |
| **Net Ended**             | NCS closes the session         | Brief summary notification            |

### Future Alert Types (Built on Same Infrastructure)

- **Spot Watch Match** — A watched callsign/band/mode appears in spots
- **Friend On Air** — Someone you follow sets On Air status
- **Contest Starting** — A contest in your calendar is about to begin
- **Propagation Alert** — Band opening detected on a watched path
- **Achievement Unlocked** — You earned a new badge/record

### Alert Destinations

Different views render alerts differently:

| View                        | Alert Rendering                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Observatory / Ham Clock** | Large overlay card with countdown, frequency, net name. Prominent — this is your "at the station" view. |
| **PropSphere**              | Toolbar badge (bell icon) with count. Click opens alert panel.                                          |
| **Dashboard**               | Alert card in the sidebar or header area.                                                               |
| **Any View**                | System notification bell (top-right) with badge count.                                                  |
| **Push (future)**           | Browser push notification or mobile push.                                                               |

### Alert Architecture

```
AlertEvent {
  id: string
  type: 'net_reminder' | 'spot_match' | 'friend_on_air' | 'contest' | 'propagation' | 'achievement'
  title: string
  body: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
  triggerAt: ISO timestamp
  expiresAt: ISO timestamp
  actionUrl?: string          // Deep link to relevant page
  actionLabel?: string        // "Tune In", "View Net", "View Spot"
  metadata: Record<string, unknown>  // Type-specific data (frequency, callsign, etc.)
  dismissed: boolean
  source: { type: string, id: string }  // e.g., { type: 'net', id: 'net_123' }
}
```

**Alert Store** (Zustand):

- Pending alerts queue
- Active (visible) alerts
- Dismissed alerts (recent history)
- User preferences per alert type (enabled, sound, overlay, countdown)
- Do Not Disturb mode
- Quiet hours (e.g., no alerts 0200-0800 local)

**Alert Scheduler**:

- Background timer that checks for upcoming alerts
- Fires alerts at configured intervals (10 min, 5 min, 3 min)
- Handles recurring schedules (every Tuesday at 0100 UTC)
- Respects user preferences and DND mode

### Observatory Integration

The Observatory view gets special treatment for alerts — this is the
"at the station" mode where alerts should be prominent and beautiful:

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│           ┌──────────────────────────┐               │
│           │  🔴 OMISS 20m NET        │               │
│           │  Starting in 4:32        │               │
│           │  14.260 MHz SSB          │               │
│           │                          │               │
│           │  [Dismiss]  [View Net]   │               │
│           └──────────────────────────┘               │
│                                                      │
│              🌍  PropSphere Globe                    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

- Large, ambient-style overlay card (matches Observatory aesthetic)
- Countdown timer that's visible but not intrusive
- Auto-dismisses after net starts (or user dismisses)
- Frequency displayed prominently (for tuning)

---

## Privacy & Visibility Controls

Operators control what's visible about their net activity:

| Setting                              | Options                   | Default |
| ------------------------------------ | ------------------------- | ------- |
| Show "My Nets" on profile            | Public / Friends / Hidden | Friends |
| Show net check-in history            | Public / Friends / Hidden | Hidden  |
| Appear in net participant lists      | Yes / No                  | Yes     |
| Show notebook frequencies on profile | Public / Friends / Hidden | Friends |
| Allow net discovery suggestions      | Yes / No                  | Yes     |

Net Creators control listing visibility:

- **Public**: Appears in directory, searchable, anyone can subscribe
- **Unlisted**: Not in directory search, but accessible via direct link
- **Private**: Invite-only, only visible to invited operators

---

## Data Model (High-Level)

### Nets Table

```
nets {
  id: uuid
  name: string
  type: net_type enum
  description: text
  frequency: string
  mode: string
  band: string (derived)
  schedule: jsonb  // Recurring pattern or one-off
  duration_minutes: int
  region: string
  repeater_info: jsonb (nullable)
  preamble_template: text (nullable)
  tags: text[]
  visibility: 'public' | 'unlisted' | 'private'
  created_by: uuid (profile ref)
  website_url: string (nullable)
  created_at: timestamptz
  updated_at: timestamptz
}
```

### Net Managers Table

```
net_managers {
  net_id: uuid
  user_id: uuid
  role: 'owner' | 'manager' | 'ncs'
  created_at: timestamptz
}
```

### Net Subscriptions Table

```
net_subscriptions {
  user_id: uuid
  net_id: uuid
  alert_10min: boolean default true
  alert_5min: boolean default true
  alert_3min: boolean default true
  show_on_profile: boolean default true
  created_at: timestamptz
}
```

### Net Sessions Table

```
net_sessions {
  id: uuid
  net_id: uuid
  ncs_user_id: uuid
  started_at: timestamptz
  ended_at: timestamptz (nullable)
  status: 'scheduled' | 'live' | 'completed' | 'cancelled'
  checkin_count: int
  notes: text
  summary: jsonb  // Post-session auto-generated summary
}
```

### Net Check-Ins Table

```
net_checkins {
  session_id: uuid
  callsign: string
  user_id: uuid (nullable — not all checkins are Propulse users)
  checked_in_at: timestamptz
  status: 'pending' | 'confirmed' | 'completed' | 'skipped'
  is_relay: boolean default false
  relay_via: string (nullable — callsign of relay station)
  traffic_notes: text (nullable)
  queue_position: int
}
```

### Alerts Table (or local-only store)

```
alerts {
  id: uuid
  user_id: uuid
  type: alert_type enum
  title: string
  body: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
  trigger_at: timestamptz
  expires_at: timestamptz
  action_url: string (nullable)
  metadata: jsonb
  dismissed: boolean default false
  source_type: string
  source_id: uuid
}
```

---

## Integration Points with Existing Propulse Features

| Feature                        | Integration                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Profile — Where to Find Me** | Net subscriptions auto-populate "My Nets" section. Scheduled net times appear as blocks on the operating schedule. |
| **Profile — Interest Tags**    | "Net Control Station" and "Net Regular" tags. Net type tags (ARES, Traffic Handler).                               |
| **Profile — On Air Status**    | When NCS starts a session, auto-set On Air status with net frequency/mode.                                         |
| **PropSphere**                 | "Nets happening now" indicator on globe — show net frequency/location markers.                                     |
| **Observatory**                | Large ambient net alerts with countdown. Net activity overlay.                                                     |
| **Spot Watch**                 | "Watch this net's frequency" — auto-create spot watch for net frequencies.                                         |
| **Logbook**                    | QSOs made during a net session can be tagged with the net. Net participation history.                              |
| **Operator Rank**              | Net participation contributes to "Elmering Spirit" and "Net Regular" archetype scores.                             |
| **Station Notebook**           | Personal collection of saved nets, frequencies, and radio hangouts feeds into profile.                             |

---

## Terminology Decisions Needed

| Concept                 | Options                                                               | Notes                                                                 |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Personal favorites book | "Station Notebook" / "My Frequencies" / "Radio Diary" / "Shack Notes" | Should feel personal, like a physical notebook you keep by your radio |
| Net directory           | "Net Registry" / "Net Directory" / "Net Finder"                       | Registry sounds authoritative; Directory is more approachable         |
| Net subscriptions       | "Subscribe" / "Follow" / "Join"                                       | "Subscribe" is clearest for recurring events                          |
| NCS dashboard           | "Net Control Dashboard" / "NCS Console" / "Net Manager"               | Dashboard is standard; Console sounds cool                            |
| Alert system brand      | "Propulse Alerts" / "Station Alerts" / "Radio Alerts"                 | System-wide, not net-specific                                         |

---

## Open Questions

1. **~~Real-time check-in via app~~**: RESOLVED — Check-in is always over the air. The app is a scratch pad for the NCS, not a replacement for radio procedures. The whole point of nets is practicing radio skills.

2. **Audio integration**: Could the NCS dashboard eventually integrate with WebSDR or radio audio for monitoring? (Very future — but worth considering in the architecture.)

3. **Multi-NCS**: Some large nets have multiple NCS operators handling different bands or regions simultaneously. Support this from day one?

4. **Net federation**: Should Propulse net listings be importable from existing net directories (e.g., Net Logger, ARRL Net Directory)? One-time import or ongoing sync?

5. **Offline NCS mode**: If NCS loses internet during a session, should the dashboard work offline and sync when reconnected?

6. **Gamification**: Attendance streaks, "Most Reliable Check-in" badges, NCS session count milestones?

7. **Net scheduling conflicts**: If a participant subscribes to two nets at the same time, flag the conflict?

---

## Phasing Suggestion

### Phase 1: Net Registry + Station Notebook

- Net data model and CRUD
- Searchable directory with filters
- Net detail page
- Station Notebook (subscribe to nets, save favorite frequencies)
- Profile integration (My Nets section)

### Phase 2: Alert System

- Alert data model and store
- Net reminder alerts (10/5/3 min)
- Alert rendering in Observatory, PropSphere, and notification bell
- User alert preferences

### Phase 3: NCS Live Dashboard

- Session management (start/end)
- Check-in tracking (NCS types callsigns as heard on air)
- Queue management
- Turn timer
- Post-session summary and export

### Phase 4: Specialized Net Types

- Traffic net tooling
- Swap/trade net tooling
- ARES/emergency net tooling
- DX net tooling

### Phase 5: Discovery & Social

- Net recommendations based on profile/interests
- "Nets happening now" on PropSphere
- Net-tagged logbook QSOs
- Attendance analytics

---

## Why This Matters

Net control is one of the most important activities in amateur radio, and
it's running on paper, spreadsheets, and memory. No platform has built a
proper digital toolkit for NCS operators. The closest thing is "Net Logger"
(a Windows desktop app from 2005) and scattered web pages listing net schedules.

Propulse already has the operator profiles, the propagation data, the alert
infrastructure (being built), and the social graph. Adding net management
makes Propulse the **operating system for ham radio activity** — not just
a tool for individual operators, but the platform where the community
organizes and meets.
