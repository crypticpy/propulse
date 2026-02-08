# PRD: Social & Friends -- The Community Layer for Propulse

**Status:** Draft
**Owner:** Product / Engineering
**Audience:** Frontend, Backend (Supabase), UX, QA
**Version:** 1.0
**Date:** 2026-02-07

**Related docs:**

- `docs/requirements/PRD-SUPABASE-MIGRATION.md` -- Cloud backend, auth, RLS, sync, `follows` table, `activity_feed` table
- `docs/requirements/phase-2/PRD-OPERATOR-PROFILE-V2.md` -- Operator identity, gamification engine, XP/levels, achievement badges, shareable cards
- `docs/requirements/phase-2/PRD-SHACK-BUILDER-V2.md` -- Equipment management, shareable station profiles, community contributions
- `docs/requirements/phase-2/PRD-SETTINGS-PREFERENCES-V2.md` -- Privacy controls, notification system

**Key source files (current implementation):**

- `src/stores/profileStore.ts` -- Zustand store (station, bio, socialLinks, license, credentials)
- `src/types/user.ts` -- UserStation, SocialLink, LicenseInfo, OperatingLocation, UserPreferences
- `src/lib/db/types.ts` -- LogEntry schema (QSO contacts in logbook)
- `src/pages/ProfilePage.tsx` -- Profile page layout (desktop sidebar + tabs, mobile compact card + tabs)
- `src/components/profile/` -- 18 component files (ProfileCard, AwardsTab, StatsTab, etc.)
- `src/hooks/useAwardProgress.ts` -- DXCC/WAS/WAZ computation from logbook entries
- `src/hooks/useLogbookStats.ts` -- Aggregate QSO statistics

**Depends on:**

- Supabase Migration (auth, RLS, `profiles` table, `follows` table, `activity_feed` table)
- Operator Profile V2 (XP engine, achievement badges, activity feed events, shareable cards)
- Shack Builder V2 (shareable station profiles, equipment showcase)

---

## Table of Contents

1. [Overview](#1-overview)
2. [User Stories](#2-user-stories)
3. [Feature Specifications](#3-feature-specifications)
4. [Data Model](#4-data-model)
5. [Privacy Controls](#5-privacy-controls)
6. [Notification System](#6-notification-system)
7. [Gamification Integration](#7-gamification-integration)
8. [Moderation & Safety](#8-moderation--safety)
9. [UI Components](#9-ui-components)
10. [Mobile Experience](#10-mobile-experience)
11. [API Endpoints](#11-api-endpoints)
12. [Success Metrics](#12-success-metrics)

---

## 1. Overview

### Vision

Ham radio is the original social network. Since 1901, operators have been reaching across oceans, forging friendships with nothing but RF energy and a shared passion for the art and science of radio communication. The Elmer tradition -- where experienced operators mentor newcomers -- is one of the hobby's most cherished cultural institutions. Every Extra-class operator remembers the Elmer who helped them build their first antenna.

Yet ham radio's social infrastructure lives in fragmented, aging systems. QRZ.com profiles are static pages. Club management happens on Yahoo Groups (still) or Facebook groups. Mentorship matching is word-of-mouth. There is no single place where an operator can see what their friends are doing on the air right now, compare progress with peers, or discover new operators who share their interests.

Propulse Social fills this gap. It is the social layer that connects the Profile (identity), Gamification (progression), Nets (scheduled operations), and Shack (equipment) features into a cohesive community experience. It transforms Propulse from a tool you use alone into a place you visit with friends.

The tone is warm, not competitive. Encouraging, not pressuring. The social features celebrate the ham radio culture of mutual aid (the Elmer tradition), collaborative achievement (Field Day, JOTA), and genuine human connection across distance and difference. This is not Instagram for hams -- it is the digital radio club lounge.

### Goals

| Goal                   | Description                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Friends & follows**  | Let operators build a social graph of friends and followed operators, separate from the QSO logbook's contact records.                                  |
| **Activity awareness** | Show operators what their friends are doing: QSOs logged, badges earned, challenges completed, nets joined, equipment added.                            |
| **Operator discovery** | Help operators find peers by location, interests, bands, modes, and experience level -- turning the vast amateur population into a navigable community. |
| **Elmer/Mentorship**   | Formalize the mentorship tradition with structured mentor-mentee pairing, progress tracking, and recognition for Elmers who invest time in newcomers.   |
| **Clubs & groups**     | Enable ham radio clubs to organize within Propulse: shared goals, club leaderboards, inter-club events, and a digital home for local club activity.     |
| **Social sharing**     | Generate shareable content (achievement cards, station profiles, QSO milestones) that operators can post to Twitter, Mastodon, Discord, and Facebook.   |
| **Real-time presence** | Show when friends are on the air, what band and mode they are on, and optionally what park or summit they are activating.                               |
| **Privacy-first**      | Every social feature is opt-in. Default state is invisible. Operators control exactly what they share, with whom, and at what precision level.          |

### Non-Goals

1. **Full messaging platform.** Direct messaging is lightweight and callsign-based, not a chat application. We are not building Slack or Discord.
2. **Forum or discussion boards.** Propulse is a dashboard, not a forum. Community discussion happens on external platforms (Discord, Reddit, eHam); we link to them.
3. **QSL card exchange.** QSL management is a logbook feature, not a social feature. This PRD does not cover LoTW, eQSL, or physical QSL routing.
4. **Contest team management.** Contest teams have specific needs (shared multiplier tracking, rate optimization) that belong in the Contest module.
5. **Commercial features.** No equipment marketplace, no sponsored profiles, no paid promotions, no affiliate revenue. Ham radio culture actively resists commercialization.
6. **Content moderation at scale.** This system is designed for a community of tens of thousands, not millions. Moderation tooling is proportionate.

---

## 2. User Stories

### 2.1 Friends & Follows

| ID   | As a...             | I want to...                                          | So that...                                                          |
| ---- | ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| S-01 | Registered operator | Search for another operator by callsign               | I can find and follow them                                          |
| S-02 | Registered operator | Send a friend request to another operator             | We can see each other's friend-only content                         |
| S-03 | Registered operator | Accept or decline incoming friend requests            | I control who is in my inner circle                                 |
| S-04 | Registered operator | Follow an operator without mutual friendship          | I can see their public activity without requiring their approval    |
| S-05 | Registered operator | Block an operator                                     | They cannot see my profile, send me requests, or appear in my feeds |
| S-06 | Registered operator | See a list of my friends, followers, and who I follow | I can manage my social connections                                  |
| S-07 | Registered operator | Unfriend or unfollow someone                          | I can change my social graph without confrontation                  |

### 2.2 Activity Feed

| ID   | As a...             | I want to...                                                                               | So that...                                           |
| ---- | ------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| S-08 | Registered operator | See a feed of activity from people I follow                                                | I know what my community is doing                    |
| S-09 | Registered operator | Filter my feed by event type (QSOs, badges, challenges, equipment)                         | I see what interests me most                         |
| S-10 | Registered operator | Tap a feed item to see details (the badge earned, the QSO logged, the challenge completed) | I can engage with the context, not just the headline |
| S-11 | Registered operator | React to a feed item with a predefined reaction (73, FB, QSL)                              | I can acknowledge others' achievements quickly       |
| S-12 | Registered operator | Control which of my activities appear in others' feeds                                     | I share only what I want to share                    |

### 2.3 Operator Discovery

| ID   | As a...             | I want to...                                                          | So that...                                      |
| ---- | ------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| S-13 | Registered operator | Find operators near my grid square                                    | I can discover local hams I might contact       |
| S-14 | Registered operator | Find operators who share my interests (POTA, contesting, CW, digital) | I can connect with like-minded people           |
| S-15 | Registered operator | See operators who are active on the same bands I use                  | I can find potential contacts and friends       |
| S-16 | New licensee        | Find Elmers who are willing to mentor in my area                      | I can get help getting started                  |
| S-17 | Registered operator | See "Operators you may know" suggestions based on QSO history         | I can connect with people I have already worked |

### 2.4 Elmer/Mentorship

| ID   | As a...              | I want to...                                                                 | So that...                                                         |
| ---- | -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| S-18 | Experienced operator | Mark myself as available to Elmer new operators                              | Newcomers can find me                                              |
| S-19 | New licensee         | Request an Elmer match                                                       | I get paired with an experienced operator who can guide me         |
| S-20 | Elmer                | Track my mentee's progress (license milestones, first QSO, first DX contact) | I can celebrate their achievements and know when to offer guidance |
| S-21 | Mentee               | Mark milestones as completed and share them with my Elmer                    | My Elmer knows I am progressing                                    |
| S-22 | Elmer                | Earn recognition (badges, XP) for mentoring                                  | My investment in the next generation is visible and valued         |

### 2.5 Clubs & Groups

| ID   | As a...             | I want to...                                                         | So that...                                       |
| ---- | ------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| S-23 | Club officer        | Create a club in Propulse with name, callsign, description, and logo | My club has a digital home                       |
| S-24 | Club officer        | Invite members by callsign                                           | Existing operators can join our club             |
| S-25 | Club member         | See a club activity feed (member QSOs, badges, challenges)           | I feel connected to my club's activity           |
| S-26 | Club officer        | Set a collaborative goal ("Work all 50 states this month as a club") | We have a shared objective to rally around       |
| S-27 | Club member         | See club progress toward our shared goal                             | I know how we are doing and how I can contribute |
| S-28 | Registered operator | Discover and join public clubs                                       | I can find communities that match my interests   |

### 2.6 Social Sharing & Presence

| ID   | As a...             | I want to...                                                          | So that...                                             |
| ---- | ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| S-29 | Registered operator | Share a badge or achievement as a designed image card                 | I can post it to Twitter, Discord, or Facebook         |
| S-30 | Registered operator | Share my station profile as a link with a rich preview                | Others see my setup without needing a Propulse account |
| S-31 | Registered operator | See which friends are "On Air Now"                                    | I know when someone I care about is operating          |
| S-32 | Registered operator | Set my own "On Air" status with band, mode, and optional location     | My friends know I am available for a QSO               |
| S-33 | Registered operator | Get a notification when a friend activates a POTA park or SOTA summit | I can work them for the activation                     |
| S-34 | Registered operator | Compare my DXCC/WAS/WAZ progress with a friend (opt-in)               | I have friendly motivation to keep operating           |

### 2.7 Direct Messages

| ID   | As a...             | I want to...                          | So that...                                       |
| ---- | ------------------- | ------------------------------------- | ------------------------------------------------ |
| S-35 | Registered operator | Send a short text message to a friend | I can coordinate without leaving Propulse        |
| S-36 | Registered operator | Disable DMs entirely                  | I am not bothered if I prefer not to be messaged |

### 2.8 QSO History with Friends

| ID   | As a...             | I want to...                                                       | So that...                                 |
| ---- | ------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| S-37 | Registered operator | See how many times I have worked a friend, on what bands and modes | I know our contact history at a glance     |
| S-38 | Registered operator | See the first and most recent QSO with a friend                    | I can reference our operating relationship |

---

## 3. Feature Specifications

### 3.1 Friends List

The friends system uses a two-tier model: **follows** (one-directional, public activity visibility) and **friends** (mutual follows, unlocking friend-only content and messaging).

#### 3.1.1 Following

- Any authenticated operator can follow any other operator with a public or friends-visible profile.
- Following does not require approval from the target operator.
- Following shows the target's public activity in your feed.
- The `follows` table already exists in the Supabase schema (see `PRD-SUPABASE-MIGRATION.md` Section 5.5). This system extends it with additional semantics.

#### 3.1.2 Friend Requests

- When operator A follows operator B, and operator B has `friend_request_mode` set to `"approval"` (the default), operator B receives a friend request notification.
- Operator B can accept (creating a mutual follow), decline (no action, A still follows B publicly), or block (removes follow and prevents future interaction).
- When `friend_request_mode` is set to `"auto_accept"`, mutual follows are created automatically when someone follows you.
- When `friend_request_mode` is set to `"disabled"`, follows are one-directional only; no friendship is created.

#### 3.1.3 Mutual Friends (Friendship)

- A friendship exists when both A follows B and B follows A.
- Friendships unlock:
  - Visibility of friend-only profile content (6-char grid, detailed stats, equipment notes)
  - Direct messaging (if both parties have DMs enabled)
  - "On Air Now" real-time presence
  - QSO history with each other
  - Progress comparison (if opted in)
  - Activity feed items marked as "friends-only"

#### 3.1.4 Friend Management

- **Friends list view**: Shows mutual friends with callsign, name, avatar, last active timestamp, and "On Air" indicator if applicable.
- **Following view**: Shows operators you follow (including non-mutual follows).
- **Followers view**: Shows operators following you, with "Follow Back" action for non-mutual.
- **Pending requests**: Shows incoming friend requests with accept/decline/block actions.
- **Search**: Search for operators by callsign, name, or grid square. Results link to public profiles with a "Follow" button.

#### 3.1.5 Blocking

- Blocking operator X:
  - Removes any existing follow/friendship in both directions
  - Hides X from your feed, search results, and discovery suggestions
  - Hides you from X's feed, search results, and discovery suggestions
  - Prevents X from following you, sending friend requests, or sending messages
  - X sees your profile as if it were set to private (even if it is public)
- Blocks are silent -- X is not notified that they have been blocked.
- Blocks are managed from a "Blocked Operators" section in social settings.
- Unblocking restores the default state but does not restore the previous follow/friendship.

#### 3.1.6 Limits

| Limit                         | Value | Rationale                                                                            |
| ----------------------------- | ----- | ------------------------------------------------------------------------------------ |
| Max friends (mutual follows)  | 200   | Supabase Presence channel performance; realistic social graph size for ham operators |
| Max follows (one-directional) | 500   | Feed query performance; prevents abuse                                               |
| Max pending friend requests   | 50    | Prevents spam accumulation                                                           |
| Max blocks                    | 200   | Storage and query efficiency                                                         |

### 3.2 Activity Feed

The activity feed is the central social experience. It aggregates events from operators you follow into a chronological stream, creating ambient awareness of community activity.

#### 3.2.1 Feed Sources

The feed draws from the `activity_feed` table defined in `PRD-SUPABASE-MIGRATION.md` Section 5.5. This PRD extends the event types and adds a "friends feed" view.

**Event types** (extending the Profile V2 `activity_feed.event_type` enum):

| Event Type           | Description                                              | Example                                                  | Icon           |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------- |
| `qso_milestone`      | QSO count milestones (100, 500, 1000, 5000, 10000)       | "N5XXX logged their 1,000th QSO"                         | Trophy         |
| `new_dxcc`           | New DXCC entity worked                                   | "N5XXX worked VP8 -- Falkland Islands"                   | Globe          |
| `new_state`          | New US state worked                                      | "N5XXX worked Alaska (47/50 WAS)"                        | Map pin        |
| `new_zone`           | New CQ zone worked                                       | "N5XXX worked Zone 34 (35/40 WAZ)"                       | Target         |
| `badge_earned`       | Achievement badge earned                                 | "N5XXX earned Globe Trotter (Gold)"                      | Star           |
| `level_up`           | XP level increase                                        | "N5XXX reached Level 8: Seasoned Operator"               | Arrow up       |
| `challenge_complete` | Weekly challenge completed                               | "N5XXX completed Band Explorer"                          | Flag           |
| `streak_milestone`   | Operating streak milestone (7, 14, 30, 60, 90, 365 days) | "N5XXX has a 30-day operating streak!"                   | Flame          |
| `equipment_added`    | New equipment added to shack (radio, antenna)            | "N5XXX added an Icom IC-7610 to their shack"             | Radio          |
| `net_joined`         | Joined a scheduled net                                   | "N5XXX checked into the OMISS 20m Net"                   | Signal         |
| `pota_activation`    | Started a POTA activation                                | "N5XXX is activating K-1234 (Blue Ridge Parkway)"        | Tree           |
| `sota_activation`    | Started a SOTA activation                                | "N5XXX is activating W4C/CM-001 (Mt. Mitchell)"          | Mountain       |
| `on_air`             | Started an operating session                             | "N5XXX is on the air: 20m SSB"                           | Antenna        |
| `elmer_milestone`    | Mentorship milestone                                     | "N5XXX helped their mentee earn Technician license"      | Graduation cap |
| `club_goal_progress` | Club collaborative goal progress                         | "N5XXX contributed 3 new states to BARC's WAS Challenge" | Users          |
| `profile_update`     | Significant profile update (new photo, bio rewrite)      | "N5XXX updated their station profile"                    | Pencil         |

#### 3.2.2 Feed Views

**Personal feed ("My Activity"):**

- Shows only the authenticated operator's own events
- This already exists conceptually in Profile V2's Activity Feed (Section 4.7)
- Accessible from the Profile page

**Friends feed ("Activity"):**

- Shows events from all operators the user follows
- Interleaved chronologically, newest first
- This is the primary social surface -- the first thing an operator sees when they open the Social page
- Infinite scroll with 20 events per page
- Events respect the poster's privacy settings (friend-only events visible only to mutual friends)

**Club feed:**

- Shows events only from members of a specific club
- Accessible from the Club detail page
- Includes club-specific events (goal progress, member joins)

#### 3.2.3 Feed Item Structure

Each feed item displays:

- **Avatar**: Profile photo or generated avatar from callsign
- **Callsign**: Linked to the operator's profile
- **Event description**: Human-readable text (see examples in table above)
- **Timestamp**: Relative for events < 24 hours ("3 hours ago"), absolute date for older ("Feb 5, 2026")
- **Detail card**: Optional expanded content (badge image, QSO details, equipment card)
- **Reactions bar**: Quick-reaction buttons (see Section 3.2.4)

#### 3.2.4 Reactions

Feed items support lightweight reactions using ham radio vernacular:

| Reaction | Symbol | Meaning                                                                         |
| -------- | ------ | ------------------------------------------------------------------------------- |
| 73       | `73`   | "Best regards" -- the universal ham greeting. Default positive reaction.        |
| FB       | `FB`   | "Fine business" -- acknowledgment of something well done.                       |
| QSL      | `QSL`  | "I confirm / I acknowledge" -- stronger than 73, used for notable achievements. |
| DX!      | `DX!`  | "Great DX!" -- specifically for DX contacts and country milestones.             |
| CQ       | `CQ`   | "Calling all stations" -- encouraging someone to get on the air / keep going.   |

Reactions are stored in a `feed_reactions` table (see Section 4). They are aggregated and displayed as counts below each feed item. Tapping a reaction toggles it (add/remove).

#### 3.2.5 Feed Privacy

- Operators control which event types appear in their public/friends feed via a per-type toggle in social settings.
- Default: QSO milestones, badges, level-ups, and challenges are visible. Equipment additions and net joins are hidden.
- Friend-only events are only visible to mutual friends.
- Operators can delete any of their own feed events retroactively.

### 3.3 Follow System

The follow system is the foundation of the social graph. It is intentionally simple -- modeled after Twitter/Mastodon follows rather than Facebook friend requests -- because ham radio operators value accessibility and low friction.

#### 3.3.1 Follow Mechanics

- **Follow**: One-tap action on any operator's profile. Creates a row in the `follows` table.
- **Unfollow**: One-tap action. Deletes the follow row. Silent -- no notification to the unfollowed operator.
- **Follower count**: Displayed on the operator's public profile as "N followers."
- **Following count**: Displayed on the operator's own profile as "Following N."
- **Mutual indicator**: When viewing an operator who also follows you, show a "Follows you" badge.

#### 3.3.2 Follow Notifications

- When operator A follows operator B, operator B receives a notification: "N5XXX started following you."
- Notification links to A's profile.
- Notification can be disabled globally in notification settings.

### 3.4 Operator Discovery

Finding other operators is the entry point to the social experience. Discovery surfaces operators based on proximity, shared interests, and QSO history.

#### 3.4.1 Nearby Operators

- Shows operators whose grid square is within a configurable radius (default: 100 miles / 160 km) of the user's grid square.
- Grid precision: Discovery uses 4-character grid squares for distance calculation, regardless of what precision the discovered operator has set for their profile visibility.
- Sorted by distance (nearest first).
- Each result shows: callsign, name, distance, shared bands/modes, mutual friends count.
- Operators who have set their profile to "private" do not appear in discovery results.

#### 3.4.2 Similar Interests

- Matches operators based on:
  - **Shared bands**: Operators who are active on the same bands (from logbook stats or profile band preferences).
  - **Shared modes**: CW, SSB, FT8, FT4, RTTY, etc.
  - **Shared activities**: POTA, SOTA, contesting, ragchewing, DXing, satellite.
  - **Similar equipment**: Operators using the same radio model (from Shack Builder data).
- Interest matching uses the `profiles.stats_cache` JSONB field and operator tags (see Section 4).
- Results are scored by interest overlap and sorted by relevance.

#### 3.4.3 QSO-Based Suggestions ("Operators You May Know")

- Cross-references the user's logbook with the Propulse user base.
- For each callsign in the user's logbook, checks if that callsign has a verified Propulse profile.
- Presents matches as: "You've worked N5XXX 7 times on 20m, 40m, 15m. Follow them?"
- This is the most powerful discovery mechanism because it connects operators who already have an RF relationship.
- Computation: A Supabase Edge Function queries `log_entries.remote_callsign` against `profiles.callsign` for the authenticated user. Results are cached in `profiles.stats_cache.suggested_follows` with a 24-hour TTL.

#### 3.4.4 Discovery Opt-Out

- Operators can opt out of appearing in discovery results entirely via a toggle in social settings.
- Opt-out hides the operator from nearby, interest-based, and QSO-based suggestions.
- Opt-out does not affect profile visibility (a private profile is already hidden; a public profile remains accessible via direct URL or callsign search).

### 3.5 Elmer/Mentorship System

The Elmer system is the heart of this PRD. It formalizes the most valued tradition in ham radio -- experienced operators helping newcomers -- and makes that investment visible and rewarded.

#### 3.5.1 Elmer Registration

- Any operator with a verified callsign and license class of General or Extra (US) or equivalent (international) can register as an available Elmer.
- Registration form collects:
  - **Specialties**: Checkboxes for areas of expertise (getting started, antennas, HF operating, VHF/UHF, digital modes, CW, contesting, POTA/SOTA, satellite, emergency communications, electronics/building).
  - **Availability**: "A few hours per month" / "Weekly availability" / "Available most days."
  - **Preferred contact method**: Within Propulse DM, email, phone (masked), or local in-person.
  - **Location**: Grid square (for matching nearby mentees).
  - **Bio**: A short description of their experience and what they enjoy helping with.
- Registration creates a row in the `elmers` table (see Section 4) and makes the operator discoverable in the Elmer directory.

#### 3.5.2 Mentee Request

- New operators (or any operator seeking guidance) can browse the Elmer directory and request a match.
- Request form collects:
  - **What I need help with**: Checkboxes matching the Elmer specialty list.
  - **My license class**: Technician / General / Extra / Unlicensed (studying).
  - **My experience level**: "Just getting started" / "Some experience, need guidance" / "Experienced but learning a new area."
  - **Preferred meeting style**: Online only / In-person if nearby / Either.
- The system suggests Elmers based on: specialty match, geographic proximity, availability, and current mentee load.
- Mentee selects a preferred Elmer and sends a request.

#### 3.5.3 Matching & Pairing

- Elmer receives a mentorship request notification with the mentee's profile and request details.
- Elmer can accept (creating an active mentorship) or decline (with optional reason: "I'm at capacity right now. Try [suggested alternative].").
- An active mentorship creates a row in the `mentorships` table (see Section 4).
- Each Elmer has a configurable max mentee count (default: 3). The system does not allow new matches when at capacity.

#### 3.5.4 Mentorship Dashboard

When an active mentorship exists, both parties see a shared dashboard:

**Mentee milestones** (predefined checklist, customizable by the Elmer):

| Milestone             | Description                                       | Default  |
| --------------------- | ------------------------------------------------- | -------- |
| First QSO             | Made their first contact                          | Enabled  |
| First HF QSO          | Worked a station on an HF band                    | Enabled  |
| First DX QSO          | Worked a station in another country               | Enabled  |
| First CW QSO          | Made a contact using Morse code                   | Optional |
| First Digital QSO     | Made a contact using FT8/FT4/RTTY                 | Optional |
| 10 Unique Countries   | Worked 10 DXCC entities                           | Enabled  |
| First POTA Activation | Activated a park                                  | Optional |
| License Upgrade       | Upgraded from Tech to General or General to Extra | Enabled  |
| Built an Antenna      | Built a wire antenna or other homebrew project    | Optional |
| Joined a Net          | Checked into a scheduled net                      | Enabled  |
| 100 QSO Club          | Logged 100 total QSOs                             | Enabled  |
| First Contest         | Participated in a contest                         | Optional |

- The mentee checks milestones as completed. The Elmer receives a notification for each.
- Completion timestamps are recorded.
- Progress is visualized as a journey path with milestone markers.

**Mentorship notes:**

- Both parties can add notes visible to each other (not public). Used for session summaries, next steps, resource links.
- Notes are stored in the `mentorship_notes` table.
- Markdown support for links and formatting.

**Mentorship duration:**

- No fixed duration. Either party can end the mentorship at any time.
- When ended, the mentorship moves to "completed" status. Milestones and history are preserved.
- A mentee can have one active Elmer at a time (prevents mentorship fragmentation).
- An Elmer can have up to `max_mentees` active mentees.

#### 3.5.5 Elmer Recognition

Elmers who invest time in mentoring deserve visible recognition:

- **Elmer badge on profile**: A distinctive badge (mortar board / graduation cap motif) on the Elmer's profile showing they are an active or experienced Elmer.
- **Elmer XP**: Each mentee milestone completed awards the Elmer bonus XP (see Section 7).
- **Elmer tier badges**: Based on cumulative mentoring achievement:

| Tier | Requirement                                                | Badge Name       | Badge Color                  |
| ---- | ---------------------------------------------------------- | ---------------- | ---------------------------- |
| 1    | First mentee milestone completed                           | Helping Hand     | Signal green                 |
| 2    | 10 milestones across all mentees                           | Elmer Apprentice | Nebula blue                  |
| 3    | Complete mentorship (all enabled milestones) with 1 mentee | Certified Elmer  | Plasma orange                |
| 4    | Complete mentorship with 3 mentees                         | Senior Elmer     | Gold                         |
| 5    | Complete mentorship with 10 mentees                        | Master Elmer     | Plasma orange with gold ring |
| 6    | Mentee achieves Extra class or equivalent                  | License Maker    | Purple with star             |

#### 3.5.6 Elmer Directory

- A searchable list of registered Elmers, accessible from the Social page.
- Filters: specialty, distance, availability, Elmer tier.
- Each Elmer card shows: callsign, name, specialties, Elmer tier badge, mentee count / capacity, distance from user, brief bio excerpt.
- Sorted by relevance (specialty match first, then proximity, then availability).

### 3.6 Clubs & Groups

Clubs are the organizational unit of ham radio. Every city has at least one, and most operators belong to several. Propulse Clubs bring club activity into the digital dashboard.

#### 3.6.1 Club Creation

- Any authenticated operator can create a club.
- Required fields: club name, club callsign (optional), description.
- Optional fields: logo (uploaded to Supabase Storage), website URL, meeting schedule (text), affiliated ARRL section.
- Creator becomes the club admin.
- Club gets a public URL: `https://propulse.app/club/{slug}` where slug is derived from the club name.

#### 3.6.2 Membership

- **Public clubs**: Any operator can join. No approval needed.
- **Private clubs**: Operators request to join. An admin or officer approves or declines.
- **Invite-only clubs**: Only invited operators can join. Invites sent by admin/officer via callsign.
- Roles: `admin` (full control), `officer` (invite, manage goals, manage members), `member` (participate).
- Members can leave a club at any time.
- Admins can remove members or transfer admin role.

#### 3.6.3 Club Feed

- A filtered activity feed showing only events from club members.
- Includes club-specific events: member joins, collaborative goal progress, competition results.
- Club feed is visible to members only (for private/invite-only clubs) or publicly (for public clubs).

#### 3.6.4 Collaborative Goals

Clubs can set shared objectives that aggregate member contributions:

**Goal definition:**

- Goal type: WAS (work all states), DXCC count, QSO count, Band Explorer (QSOs on N bands), Mode Explorer, or custom.
- Target: e.g., "50 states" for WAS, "100 DXCC entities" for DXCC count, "1000 QSOs" as a club.
- Deadline: Optional end date. Goals without deadlines are ongoing.
- Contribution source: Each member's logbook entries during the goal period count toward the collective total. Deduplication: each state/entity/band counts once per member contribution (the club needs 50 states total, not 50 unique states from one member).

**Goal tracking:**

- Progress bar on the club page showing current / target.
- Contribution leaderboard: which members have contributed the most toward the goal.
- Activity feed events when the goal reaches milestones (25%, 50%, 75%, 100%).
- Completion celebration: banner on club page, achievement card shareable by members.

**Goal limits:**

- Max 3 active goals per club (prevents goal fatigue).
- Goals cannot be shorter than 7 days (prevents trivial goals).

#### 3.6.5 Club Leaderboard

- Within a club, an opt-in leaderboard ranks members by:
  - QSO count (this period)
  - New DXCC entities (this period)
  - XP earned (this period)
  - Challenge completions (this period)
- Period options: this week, this month, this year, all time.
- Leaderboard is visible only to club members.
- Members can opt out of the leaderboard while remaining club members.

#### 3.6.6 Inter-Club Events

- Clubs can create friendly competitions against other clubs.
- Event types: QSO race (most QSOs in a weekend), DX race (most entities in a month), activity challenge (most active operators).
- Both club admins must agree to the event.
- Results are computed automatically from member logbooks.
- This is a future extension -- V1 ships with club-internal features only.

#### 3.6.7 Club Limits

| Limit                       | Value      | Rationale                  |
| --------------------------- | ---------- | -------------------------- |
| Max clubs per operator      | 5          | Prevents club spam         |
| Max members per club        | 500        | Supabase query performance |
| Max active goals per club   | 3          | Prevents goal fatigue      |
| Max officers per club       | 10         | Governance simplicity      |
| Club name max length        | 100 chars  | Display constraints        |
| Club description max length | 2000 chars | Reasonable detail          |

### 3.7 Achievement Sharing

This feature extends the shareable achievement cards defined in `PRD-OPERATOR-PROFILE-V2.md` Section 4.8 with social distribution mechanics.

#### 3.7.1 Share Targets

When an operator earns a badge, levels up, completes a challenge, or reaches a milestone, the "Share" action offers:

- **Copy link**: Copies a URL to the achievement detail page (`https://propulse.app/op/{callsign}/achievement/{id}`). The page renders the achievement card with Open Graph meta tags for rich previews.
- **Download image**: Generates a PNG card (1200x630 for Twitter/OpenGraph, 1080x1080 for Instagram/Discord) using client-side canvas rendering.
- **Copy to clipboard**: Copies the PNG image to the system clipboard for direct pasting into Discord, Slack, or other apps.
- **Share to Twitter/X**: Opens a pre-filled tweet with the achievement text and image URL.
- **Share to Mastodon**: Opens a compose window (requires the user to enter their instance URL once, then remembered).

#### 3.7.2 Station Profile Sharing

The shareable station profile from `PRD-SHACK-BUILDER-V2.md` Section 4.13 generates:

- Public URL: `https://propulse.app/shack/{callsign}`
- Open Graph preview: callsign, station summary, best-band ERP, hero photo
- QR code for hamfests

#### 3.7.3 Achievement Card Design

All shareable cards follow a consistent design language:

- **Background**: Deep space gradient (`void-black` to `deep-space`)
- **Accent**: `plasma-orange` for borders, highlights, and the Propulse wordmark
- **Typography**: Bold callsign in `plasma-orange`, achievement name in white, description in `text-gray-400`
- **Badge/icon**: Centered, full-color badge artwork at 2x resolution
- **Footer**: Propulse logo + "propulse.app" URL + date earned
- **QR code**: Small QR linking to the operator's public profile, bottom-right corner

### 3.8 Direct Messages

Lightweight, optional messaging between friends. This is intentionally minimal -- a way to say "Hey, want to try for a QSO on 20m this evening?" rather than a full chat platform.

#### 3.8.1 Eligibility

- Both operators must be mutual friends (bidirectional follow).
- Both operators must have DMs enabled in their social settings.
- If either party disables DMs, existing conversation history is preserved but no new messages can be sent.

#### 3.8.2 Message Format

- Plain text only. No images, files, or rich formatting.
- Max 500 characters per message.
- Messages are displayed in a simple thread view (newest at bottom).
- No read receipts (reduces social pressure).
- No typing indicators (unnecessary for async-first communication).

#### 3.8.3 Conversation List

- Accessible from the Social page's "Messages" tab.
- Shows conversations sorted by last message time (newest first).
- Each conversation shows: friend's callsign + name, last message preview, timestamp, unread badge.
- Max 50 active conversations. Oldest conversations are archived (messages preserved in DB but not fetched by default).

#### 3.8.4 Notifications

- New message notifications appear as a badge on the Social nav item.
- Optional push notification (if the operator has enabled browser push notifications).
- During quiet hours (per `PRD-SETTINGS-PREFERENCES-V2.md` Fix #14), message notifications are silenced.

#### 3.8.5 Message Limits

| Limit                                 | Value     | Rationale                                              |
| ------------------------------------- | --------- | ------------------------------------------------------ |
| Max message length                    | 500 chars | Keep messages concise                                  |
| Max messages per conversation per day | 100       | Prevent spam/abuse                                     |
| Max active conversations              | 50        | UI and query performance                               |
| Message retention                     | 90 days   | Storage management; align with activity feed retention |

### 3.9 "On Air Now" Status

Real-time presence showing which friends are currently operating.

#### 3.9.1 Setting Status

- Operator manually sets "On Air" status from a quick-action button on the dashboard or Social page.
- Status fields:
  - **Band**: Selected from the standard band list (160m through 23cm).
  - **Mode**: Selected from mode list (SSB, CW, FT8, FT4, RTTY, AM, FM, etc.).
  - **Frequency** (optional): Specific frequency in kHz.
  - **Location** (optional): "Home", a saved location name, or a POTA/SOTA reference.
  - **Notes** (optional): Free text, e.g., "Looking for Zone 34" or "Running POTA K-1234."
- Status auto-expires after 2 hours (configurable: 1, 2, 4, 8 hours). Operator can extend or clear manually.
- Alternatively, the bridge connection to WSJT-X or other software can auto-set "On Air" status when the operator starts transmitting (future integration).

#### 3.9.2 Presence Display

- The friends list shows a green "On Air" dot next to friends who are currently operating.
- Tapping the indicator expands to show: band, mode, frequency (if provided), location, notes, and time since status was set.
- A dedicated "On Air Now" section at the top of the Social page lists all friends currently on the air.
- If the friend is activating a POTA park or SOTA summit, the activation reference is prominently displayed with a link to the POTA/SOTA page.

#### 3.9.3 Implementation

- Uses Supabase Presence (built on Realtime channels), extending the architecture defined in `PRD-SUPABASE-MIGRATION.md` Section 9.1.
- The client joins a presence channel scoped to the user's friend list when the Social page (or dashboard with social widgets) is active.
- Presence state payload:

```json
{
  "callsign": "N5XXX",
  "status": "on_air",
  "band": "20m",
  "mode": "SSB",
  "frequency": 14250,
  "location": "Home",
  "notes": "Looking for Zone 34",
  "since": "2026-02-07T15:30:00Z",
  "expires": "2026-02-07T17:30:00Z"
}
```

- Presence channel is unsubscribed when the user navigates away from social views.
- Estimated payload: ~200 bytes per presence update, ~5KB per heartbeat for a typical friends list.

#### 3.9.4 Friend Activity Alerts

- When a friend goes "On Air," the operator can optionally receive a notification.
- Alert types (configurable per-friend or globally):
  - "Any friend goes on air" (can be noisy -- default off)
  - "Friend activates POTA/SOTA" (high interest -- default on for friends)
  - "Friend is on a band I'm monitoring" (band match -- default off)
- Alerts respect quiet hours.

### 3.10 QSO History with Friends

When viewing a friend's profile, a "Our History" section shows the RF relationship between the two operators.

#### 3.10.1 History Data

Computed by cross-referencing the authenticated user's logbook (`log_entries`) with QSOs where `remote_callsign` matches the friend's verified callsign.

**Displayed metrics:**

- Total QSOs with this friend
- First QSO date and band/mode
- Most recent QSO date and band/mode
- Bands worked together (visual band pills, matching the Shack page pattern)
- Modes used together
- QSO timeline: mini sparkline showing contact frequency over time

#### 3.10.2 Computation

- Client-side for local-only users: query IndexedDB logbook for matching callsign.
- Server-side for cloud users: Supabase Edge Function that queries `log_entries` for both users and computes the intersection. Results cached in `friend_qso_cache` with 24-hour TTL.
- Displayed on the friend's profile page in a collapsible "Our History" card.

#### 3.10.3 Privacy

- QSO history is only visible when both operators are mutual friends.
- The history shows only aggregate data (counts, dates, bands), not individual QSO details (signal reports, notes, etc.).

### 3.11 Collaborative Challenges

Beyond club goals, the system supports friend-group challenges -- informal competitions or cooperative goals between friends.

#### 3.11.1 Challenge Creation

- Any operator can create a collaborative challenge and invite friends.
- Challenge types:
  - **Race**: First to reach N QSOs / N entities / N states wins.
  - **Collective**: Group works together to reach a combined goal.
  - **Streak**: Longest consecutive-day operating streak wins.
- Challenge parameters: type, target, start date, end date, invited friends.
- Max 10 participants per challenge. Max 3 active challenges per operator.

#### 3.11.2 Challenge Tracking

- Real-time progress for each participant, computed from their logbook.
- Leaderboard within the challenge.
- Activity feed events for milestones and completion.
- Winner announcement when the challenge ends (for race-type challenges).

#### 3.11.3 Challenge Completion

- Completed challenges are archived with final standings.
- Participants earn challenge-specific XP (see Section 7).
- A shareable "Challenge Complete" card is generated.

### 3.12 Station Comparison

An opt-in feature that lets friends compare their operating progress side-by-side.

#### 3.12.1 Comparison Data

When both operators have opted in to comparison, the system shows:

| Category         | Data Compared                                                       |
| ---------------- | ------------------------------------------------------------------- |
| DXCC             | Entities worked / confirmed, progress ring overlay                  |
| WAS              | States worked / confirmed, map overlay (US map with colored states) |
| WAZ              | Zones worked / confirmed                                            |
| QSO Count        | Total QSOs, QSOs this month, QSOs this year                         |
| Band Activity    | QSOs per band, visualized as a side-by-side bar chart               |
| Mode Activity    | QSOs per mode, visualized as a pie/donut chart comparison           |
| Operating Streak | Current streak, longest streak                                      |
| XP & Level       | Current level, total XP                                             |

#### 3.12.2 Comparison UI

- Accessible from a friend's profile via a "Compare" button (visible only if both parties have opted in).
- Split-screen layout: user on the left, friend on the right.
- Each metric shows both values with the delta highlighted (green if user is ahead, neutral if tied, blue for friend ahead).
- The intent is friendly motivation, not competition -- the UI celebrates both operators' achievements.

#### 3.12.3 Opt-In Mechanics

- "Allow friends to compare stats with me" toggle in social settings (default: off).
- Even when enabled, comparison is only available to mutual friends (not followers).
- Operators can revoke comparison access at any time.

---

## 4. Data Model

### 4.1 Supabase Tables (new)

The Supabase Migration PRD already defines `follows` and `activity_feed`. This PRD adds the following tables.

#### `friend_requests`

Pending friend requests awaiting approval.

```sql
CREATE TABLE friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  message TEXT CHECK (length(message) <= 200),  -- optional note with request
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,

  UNIQUE(from_user_id, to_user_id)  -- one pending request per pair
);

CREATE INDEX idx_friend_requests_to ON friend_requests (to_user_id, status)
  WHERE status = 'pending';  -- efficient "show my pending requests" query
```

**RLS Policies:**

- `friend_requests_select_own`: `SELECT` where `auth.uid() = from_user_id OR auth.uid() = to_user_id`
- `friend_requests_insert_own`: `INSERT` where `auth.uid() = from_user_id`
- `friend_requests_update_recipient`: `UPDATE` where `auth.uid() = to_user_id` (to accept/decline)
- `friend_requests_delete_own`: `DELETE` where `auth.uid() = from_user_id` (cancel sent request)

#### `blocks`

Operator blocks.

```sql
CREATE TABLE blocks (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX idx_blocks_blocked ON blocks (blocked_id);  -- "am I blocked by X?" query
```

**RLS Policies:**

- `blocks_select_own`: `SELECT` where `auth.uid() = blocker_id`
- `blocks_insert_own`: `INSERT` where `auth.uid() = blocker_id`
- `blocks_delete_own`: `DELETE` where `auth.uid() = blocker_id`

#### `feed_reactions`

Reactions on activity feed items.

```sql
CREATE TABLE feed_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id UUID NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('73', 'FB', 'QSL', 'DX', 'CQ')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(feed_item_id, user_id)  -- one reaction per user per item
);

CREATE INDEX idx_feed_reactions_item ON feed_reactions (feed_item_id);
```

**RLS Policies:**

- `feed_reactions_select_visible`: `SELECT` where the feed item is visible to the user (delegates to `activity_feed` RLS)
- `feed_reactions_insert_own`: `INSERT` where `auth.uid() = user_id`
- `feed_reactions_delete_own`: `DELETE` where `auth.uid() = user_id`

#### `operator_tags`

Interest tags for operator discovery.

```sql
CREATE TABLE operator_tags (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag TEXT NOT NULL CHECK (length(tag) <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, tag)
);

CREATE INDEX idx_operator_tags_tag ON operator_tags (tag);  -- "find operators with tag X" query
```

Predefined tag vocabulary: `pota`, `sota`, `contesting`, `dx`, `cw`, `ssb`, `ft8`, `ft4`, `rtty`, `am`, `satellite`, `emcomm`, `qrp`, `homebrew`, `vhf_uhf`, `microwave`, `sstv`, `aprs`, `digital`, `ragchew`, `antenna_experimenter`, `remote_operating`.

**RLS Policies:**

- `operator_tags_select_public`: `SELECT` for all (tags are not sensitive)
- `operator_tags_insert_own`: `INSERT` where `auth.uid() = user_id`
- `operator_tags_delete_own`: `DELETE` where `auth.uid() = user_id`

#### `clubs`

Club definitions.

```sql
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) <= 50),
  name TEXT NOT NULL CHECK (length(name) <= 100),
  callsign TEXT,                           -- club callsign (optional)
  description TEXT CHECK (length(description) <= 2000),
  logo_url TEXT,                           -- Supabase Storage path
  website_url TEXT,
  meeting_schedule TEXT,                   -- free text
  arrl_section TEXT,                       -- affiliated ARRL section
  join_mode TEXT NOT NULL DEFAULT 'public'
    CHECK (join_mode IN ('public', 'approval', 'invite_only')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clubs_slug ON clubs (slug);
```

**RLS Policies:**

- `clubs_select_public`: `SELECT` where `join_mode = 'public'` OR user is a member
- `clubs_select_member`: `SELECT` where user is a member (for private clubs)
- `clubs_insert_auth`: `INSERT` for any authenticated user
- `clubs_update_admin`: `UPDATE` where user has `admin` role in `club_members`
- `clubs_delete_admin`: `DELETE` where user has `admin` role in `club_members`

#### `club_members`

Club membership and roles.

```sql
CREATE TABLE club_members (
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'officer', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  show_on_leaderboard BOOLEAN NOT NULL DEFAULT true,

  PRIMARY KEY (club_id, user_id)
);

CREATE INDEX idx_club_members_user ON club_members (user_id);  -- "my clubs" query
```

**RLS Policies:**

- `club_members_select_member`: `SELECT` where user is a member of the club
- `club_members_insert_self`: `INSERT` where `auth.uid() = user_id` AND club is public (or invite exists)
- `club_members_update_admin`: `UPDATE` where user has `admin` or `officer` role
- `club_members_delete_self_or_admin`: `DELETE` where `auth.uid() = user_id` OR user has `admin` role

#### `club_goals`

Collaborative goals for clubs.

```sql
CREATE TABLE club_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) <= 100),
  description TEXT CHECK (length(description) <= 500),
  goal_type TEXT NOT NULL
    CHECK (goal_type IN ('was', 'dxcc_count', 'qso_count', 'band_explorer', 'mode_explorer', 'custom')),
  target_value INTEGER NOT NULL,           -- numeric target (50 states, 100 entities, 1000 QSOs)
  current_value INTEGER NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ,                    -- optional end date
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_club_goals_club ON club_goals (club_id, status);
```

**RLS Policies:**

- `club_goals_select_member`: `SELECT` where user is a member of the club
- `club_goals_insert_officer`: `INSERT` where user has `admin` or `officer` role
- `club_goals_update_officer`: `UPDATE` where user has `admin` or `officer` role

#### `club_goal_contributions`

Individual member contributions to club goals.

```sql
CREATE TABLE club_goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES club_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contribution_type TEXT NOT NULL,         -- e.g., 'state_worked', 'entity_worked', 'qso_logged'
  contribution_key TEXT NOT NULL,          -- e.g., state abbreviation, DXCC entity number, band name
  log_entry_id TEXT,                       -- optional reference to the QSO that triggered this
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(goal_id, user_id, contribution_type, contribution_key)  -- deduplicate per member
);

CREATE INDEX idx_club_goal_contrib_goal ON club_goal_contributions (goal_id);
```

**RLS Policies:**

- `club_goal_contributions_select_member`: `SELECT` where user is a member of the club
- `club_goal_contributions_insert_service`: `INSERT` using service role (computed by Edge Function)

#### `messages`

Direct messages between friends.

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) >= 1 AND length(body) <= 500),
  read_at TIMESTAMPTZ,                    -- null = unread
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages (
  LEAST(sender_id, recipient_id),
  GREATEST(sender_id, recipient_id),
  created_at DESC
);  -- efficient conversation thread query

CREATE INDEX idx_messages_recipient_unread ON messages (recipient_id, created_at DESC)
  WHERE read_at IS NULL;  -- unread message count query
```

**RLS Policies:**

- `messages_select_participant`: `SELECT` where `auth.uid() = sender_id OR auth.uid() = recipient_id`
- `messages_insert_friend`: `INSERT` where `auth.uid() = sender_id` AND mutual follow exists AND neither party has DMs disabled AND no block exists
- `messages_update_recipient`: `UPDATE` where `auth.uid() = recipient_id` (for marking as read)
- `messages_delete_own`: `DELETE` where `auth.uid() = sender_id` AND `created_at > now() - interval '5 minutes'` (delete within 5-minute window)

#### `elmers`

Registered mentors.

```sql
CREATE TABLE elmers (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  availability TEXT NOT NULL DEFAULT 'few_hours_monthly'
    CHECK (availability IN ('few_hours_monthly', 'weekly', 'most_days')),
  preferred_contact TEXT NOT NULL DEFAULT 'dm'
    CHECK (preferred_contact IN ('dm', 'email', 'phone', 'in_person')),
  max_mentees INTEGER NOT NULL DEFAULT 3 CHECK (max_mentees >= 1 AND max_mentees <= 10),
  active_mentee_count INTEGER NOT NULL DEFAULT 0,
  bio TEXT CHECK (length(bio) <= 500),
  is_active BOOLEAN NOT NULL DEFAULT true,  -- false = not currently accepting mentees
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS Policies:**

- `elmers_select_all`: `SELECT` for all authenticated users (Elmer directory is public to logged-in users)
- `elmers_insert_own`: `INSERT` where `auth.uid() = user_id`
- `elmers_update_own`: `UPDATE` where `auth.uid() = user_id`
- `elmers_delete_own`: `DELETE` where `auth.uid() = user_id`

#### `mentorships`

Active and completed mentor-mentee relationships.

```sql
CREATE TABLE mentorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elmer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A mentee can have one active mentorship at a time
  UNIQUE(mentee_id) WHERE (status = 'active')
);

CREATE INDEX idx_mentorships_elmer ON mentorships (elmer_id, status);
CREATE INDEX idx_mentorships_mentee ON mentorships (mentee_id, status);
```

**RLS Policies:**

- `mentorships_select_participant`: `SELECT` where `auth.uid() = elmer_id OR auth.uid() = mentee_id`
- `mentorships_insert_mentee`: `INSERT` where `auth.uid() = mentee_id` (mentee initiates)
- `mentorships_update_participant`: `UPDATE` where `auth.uid() = elmer_id OR auth.uid() = mentee_id` (accept, complete, cancel)

#### `mentorship_milestones`

Progress tracking within a mentorship.

```sql
CREATE TABLE mentorship_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentorship_id UUID NOT NULL REFERENCES mentorships(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL,             -- e.g., 'first_qso', 'first_hf', 'license_upgrade'
  title TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,  -- Elmer can disable optional milestones
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),  -- who marked it complete (mentee or elmer)
  sort_order INTEGER NOT NULL DEFAULT 0,

  UNIQUE(mentorship_id, milestone_key)
);

CREATE INDEX idx_mentorship_milestones_ship ON mentorship_milestones (mentorship_id, sort_order);
```

**RLS Policies:**

- `mentorship_milestones_select_participant`: `SELECT` where user is elmer or mentee in the mentorship
- `mentorship_milestones_update_participant`: `UPDATE` where user is elmer or mentee (to mark complete or enable/disable)

#### `mentorship_notes`

Shared notes between Elmer and mentee.

```sql
CREATE TABLE mentorship_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentorship_id UUID NOT NULL REFERENCES mentorships(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) >= 1 AND length(body) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mentorship_notes_ship ON mentorship_notes (mentorship_id, created_at DESC);
```

**RLS Policies:**

- `mentorship_notes_select_participant`: `SELECT` where user is elmer or mentee in the mentorship
- `mentorship_notes_insert_participant`: `INSERT` where user is elmer or mentee
- `mentorship_notes_update_author`: `UPDATE` where `auth.uid() = author_id`
- `mentorship_notes_delete_author`: `DELETE` where `auth.uid() = author_id`

#### `collaborative_challenges`

Friend-group challenges.

```sql
CREATE TABLE collaborative_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) <= 100),
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('race', 'collective', 'streak')),
  target_value INTEGER NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'completed', 'expired', 'cancelled')),
  metric TEXT NOT NULL CHECK (metric IN ('qso_count', 'dxcc_count', 'state_count', 'streak_days')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE challenge_participants (
  challenge_id UUID NOT NULL REFERENCES collaborative_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_value INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (challenge_id, user_id)
);
```

**RLS Policies:**

- `challenges_select_participant`: `SELECT` where user is a participant
- `challenges_insert_auth`: `INSERT` for authenticated users
- `challenge_participants_select_participant`: `SELECT` where user is a participant in the challenge
- `challenge_participants_insert_invited`: `INSERT` where user is invited (or self if joining own challenge)

#### `social_settings`

Per-user social feature configuration. Stored separately from general preferences to keep the social layer modular.

```sql
CREATE TABLE social_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  friend_request_mode TEXT NOT NULL DEFAULT 'approval'
    CHECK (friend_request_mode IN ('approval', 'auto_accept', 'disabled')),
  dm_enabled BOOLEAN NOT NULL DEFAULT true,
  discoverable BOOLEAN NOT NULL DEFAULT true,           -- appear in discovery results
  show_on_air_status BOOLEAN NOT NULL DEFAULT true,     -- share "On Air" status with friends
  show_qso_history BOOLEAN NOT NULL DEFAULT true,       -- show QSO history with friends
  allow_comparison BOOLEAN NOT NULL DEFAULT false,      -- allow friends to compare stats
  visible_feed_events JSONB NOT NULL DEFAULT
    '["qso_milestone","badge_earned","level_up","challenge_complete","streak_milestone","new_dxcc"]'::jsonb,
  on_air_alert_mode TEXT NOT NULL DEFAULT 'pota_sota'
    CHECK (on_air_alert_mode IN ('all', 'pota_sota', 'none')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS Policies:**

- `social_settings_select_own`: `SELECT` where `auth.uid() = user_id`
- `social_settings_insert_own`: `INSERT` where `auth.uid() = user_id`
- `social_settings_update_own`: `UPDATE` where `auth.uid() = user_id`

### 4.2 Extensions to Existing Tables

#### `profiles` additions

The `profiles` table defined in `PRD-SUPABASE-MIGRATION.md` Section 5.1 gains these fields:

```sql
ALTER TABLE profiles ADD COLUMN
  friend_count INTEGER NOT NULL DEFAULT 0,      -- cached mutual follow count
  follower_count INTEGER NOT NULL DEFAULT 0,     -- cached follower count
  following_count INTEGER NOT NULL DEFAULT 0,    -- cached following count
  is_elmer BOOLEAN NOT NULL DEFAULT false,       -- has registered as Elmer
  elmer_tier INTEGER NOT NULL DEFAULT 0;         -- 0-6, computed from mentorship achievements
```

These are denormalized counts maintained by database triggers on the `follows` table, avoiding expensive count queries on every profile view.

#### `activity_feed` event_type extension

The `activity_feed.event_type` column (currently `TEXT NOT NULL`) must accept the new event types listed in Section 3.2.1. Since the column uses a CHECK constraint, it must be updated:

```sql
ALTER TABLE activity_feed DROP CONSTRAINT IF EXISTS activity_feed_event_type_check;
ALTER TABLE activity_feed ADD CONSTRAINT activity_feed_event_type_check
  CHECK (event_type IN (
    -- Existing types (from Profile V2 + Supabase Migration)
    'achievement', 'milestone', 'qso_milestone', 'contest_result',
    'new_band', 'new_mode', 'new_dxcc',
    -- Extended types (Social & Friends)
    'new_state', 'new_zone', 'badge_earned', 'level_up',
    'challenge_complete', 'streak_milestone', 'equipment_added',
    'net_joined', 'pota_activation', 'sota_activation', 'on_air',
    'elmer_milestone', 'club_goal_progress', 'profile_update'
  ));
```

### 4.3 Supabase Database Functions

#### `accept_friend_request(request_id UUID)`

Atomic function that:

1. Updates the `friend_requests` row to `status = 'accepted'`
2. Inserts a mutual follow (B follows A) into `follows` if not already exists
3. Updates the `friend_count`, `follower_count`, `following_count` on both profiles
4. Creates an activity feed event for both parties

```sql
CREATE OR REPLACE FUNCTION accept_friend_request(p_request_id UUID)
RETURNS void AS $$
DECLARE
  v_from UUID;
  v_to UUID;
BEGIN
  SELECT from_user_id, to_user_id INTO v_from, v_to
    FROM friend_requests WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed';
  END IF;

  -- Verify caller is the recipient
  IF auth.uid() != v_to THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Update request status
  UPDATE friend_requests SET status = 'accepted', responded_at = now()
    WHERE id = p_request_id;

  -- Create mutual follow (the original follow A->B already exists)
  INSERT INTO follows (follower_id, following_id)
    VALUES (v_to, v_from)
    ON CONFLICT DO NOTHING;

  -- Update denormalized counts (handled by triggers, but explicit for clarity)
  -- Trigger on follows table updates counts automatically
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### `update_follow_counts()`

Trigger function on the `follows` table that maintains denormalized counts on `profiles`:

```sql
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = NEW.following_id;

    -- Check if this creates a mutual follow (friendship)
    IF EXISTS (
      SELECT 1 FROM follows WHERE follower_id = NEW.following_id AND following_id = NEW.follower_id
    ) THEN
      UPDATE profiles SET friend_count = friend_count + 1 WHERE id IN (NEW.follower_id, NEW.following_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE profiles SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.following_id;

    -- Check if this breaks a mutual follow (friendship)
    IF EXISTS (
      SELECT 1 FROM follows WHERE follower_id = OLD.following_id AND following_id = OLD.follower_id
    ) THEN
      UPDATE profiles SET friend_count = GREATEST(friend_count - 1, 0) WHERE id IN (OLD.follower_id, OLD.following_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER follows_count_trigger
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();
```

#### `compute_qso_history(user_a UUID, user_b UUID)`

Edge Function that computes QSO history between two friends:

```sql
CREATE OR REPLACE FUNCTION compute_qso_history(p_user_a UUID, p_user_b UUID)
RETURNS JSONB AS $$
DECLARE
  v_callsign_a TEXT;
  v_callsign_b TEXT;
  v_result JSONB;
BEGIN
  SELECT callsign INTO v_callsign_a FROM profiles WHERE id = p_user_a;
  SELECT callsign INTO v_callsign_b FROM profiles WHERE id = p_user_b;

  IF v_callsign_a IS NULL OR v_callsign_b IS NULL THEN
    RETURN '{"total_qsos": 0}'::jsonb;
  END IF;

  SELECT jsonb_build_object(
    'total_qsos', count(*),
    'first_qso', min(qso_date),
    'last_qso', max(qso_date),
    'bands', jsonb_agg(DISTINCT band),
    'modes', jsonb_agg(DISTINCT mode)
  ) INTO v_result
  FROM log_entries
  WHERE user_id = p_user_a
    AND upper(remote_callsign) = upper(v_callsign_b);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.4 Supabase Storage Buckets

| Bucket       | Access                  | Max Size | Allowed Types                     | Purpose          |
| ------------ | ----------------------- | -------- | --------------------------------- | ---------------- |
| `club-logos` | Public read, auth write | 500 KB   | image/jpeg, image/png, image/webp | Club logo images |

All other storage needs (profile photos, shack photos, achievement card images) are covered by existing buckets defined in the Supabase Migration and Profile V2 PRDs.

### 4.5 Estimated Storage Impact

| Table                   | Rows per User (avg) | Row Size (avg) | Notes                                          |
| ----------------------- | ------------------- | -------------- | ---------------------------------------------- |
| `follows`               | 50                  | 50 bytes       | Tiny rows, composite PK                        |
| `friend_requests`       | 5                   | 200 bytes      | Most are transient (accepted/declined quickly) |
| `blocks`                | 1                   | 50 bytes       | Most users block nobody                        |
| `feed_reactions`        | 100                 | 80 bytes       | 2 reactions per feed item per user             |
| `operator_tags`         | 5                   | 60 bytes       | 5 interest tags per user                       |
| `clubs`                 | 0.5                 | 500 bytes      | Not every user creates a club                  |
| `club_members`          | 2                   | 50 bytes       | 2 club memberships per user                    |
| `club_goals`            | 1                   | 200 bytes      | Via club membership                            |
| `messages`              | 50                  | 300 bytes      | 50 messages in active conversations            |
| `elmers`                | 0.05                | 300 bytes      | 5% of users register as Elmers                 |
| `mentorships`           | 0.1                 | 200 bytes      | 10% participate in mentorship                  |
| `mentorship_milestones` | 1                   | 150 bytes      | ~12 milestones per mentorship                  |
| `social_settings`       | 1                   | 500 bytes      | One row per user                               |

**Estimated total per user:** ~50 KB
**Estimated total at 10,000 users:** ~500 MB (within Supabase free tier)

---

## 5. Privacy Controls

### 5.1 Design Principles

1. **Opt-in, not opt-out.** Every social feature is disabled by default. Creating a Supabase account does not automatically make you visible to others.
2. **Granular control.** Operators choose what to share, with whom, and at what precision. Not "public or private" but "this specific data at this specific granularity to this specific audience."
3. **No surprises.** The system never shares information without explicit operator consent. When a new social feature is added, its default is "off."
4. **Graceful degradation.** When an operator restricts their privacy, the system does not break -- it shows appropriate empty states ("This operator has a private profile") rather than errors.
5. **Never share physical address.** Under no circumstance does Propulse display, transmit, or store a physical street address. Location is expressed as grid square, city/state, or coordinates -- and each has its own precision control.

### 5.2 Privacy Settings

All social privacy settings live in the `social_settings` table (Section 4.1) and are surfaced in a "Social & Privacy" section on the Settings page.

| Setting               | Options                             | Default                                  | Description                                        |
| --------------------- | ----------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| Profile visibility    | Private / Friends / Public          | Private                                  | Who can see your profile beyond callsign and name  |
| Grid square precision | Hidden / 4-char / 6-char            | 4-char for public, 6-char for friends    | How precisely your location is shown               |
| Friend request mode   | Approval / Auto-accept / Disabled   | Approval                                 | How incoming friend requests are handled           |
| Direct messages       | Enabled / Disabled                  | Enabled                                  | Whether friends can send you messages              |
| Discoverable          | Yes / No                            | Yes                                      | Whether you appear in discovery search results     |
| On Air status         | Visible to friends / Hidden         | Visible                                  | Whether friends see your On Air status             |
| QSO history           | Visible to friends / Hidden         | Visible                                  | Whether friends can see your mutual QSO history    |
| Stat comparison       | Allow / Deny                        | Deny                                     | Whether friends can compare their stats with yours |
| Activity feed events  | Per-type toggles                    | Milestones/badges on; equipment/nets off | Which of your activities appear in others' feeds   |
| On Air alerts         | All friends / POTA/SOTA only / None | POTA/SOTA only                           | When you notify friends of your On Air status      |

### 5.3 What Is Never Shared (Regardless of Settings)

These items are never visible to other users under any privacy configuration:

- Physical street address
- Email address (used for auth, never displayed)
- Phone number
- IP address or browser fingerprint
- QSL service credentials (LoTW, eQSL, ClubLog passwords)
- Equipment serial numbers, purchase prices, insurance values
- Personal notes on QSOs or equipment
- Blocked operator list
- Message content (visible only to the two participants)
- Exact login times or usage patterns

### 5.4 Grid Square Precision Control

Grid squares are central to ham radio identity, but they encode physical location with increasing precision:

| Precision   | Example  | Area          | Appropriate Visibility                  |
| ----------- | -------- | ------------- | --------------------------------------- |
| 4-character | EM73     | ~100 x 100 km | Public (city-level, matches QRZ.com)    |
| 6-character | EM73vk   | ~5 x 10 km    | Friends only (neighborhood-level)       |
| 8-character | EM73vk05 | ~500 x 500 m  | Never shared (street-level, local only) |

The privacy setting controls the maximum precision shown to each audience tier:

- **Public**: 4-character grid (or hidden entirely)
- **Friends**: Up to 6-character grid
- **Self**: Full precision stored locally, 8-character if available

### 5.5 Data Deletion

- **Delete social data**: Removes follows, friend requests, blocks, reactions, messages, club memberships, mentorships, and social settings from Supabase. Club admin role transfers to the next officer (or the club is deleted if no other members). This is accessible from Settings > Data > "Delete Social Data."
- **Delete account**: Covered by `PRD-SUPABASE-MIGRATION.md` Section 10.5. Cascades to all social tables via foreign key `ON DELETE CASCADE`.
- Both actions require two-step confirmation.

---

## 6. Notification System

### 6.1 Notification Types

Social features generate the following notifications:

| Notification                | Trigger                                           | Default     | Priority |
| --------------------------- | ------------------------------------------------- | ----------- | -------- |
| New follower                | Someone follows you                               | On          | Low      |
| Friend request received     | Someone sends a friend request                    | On          | Medium   |
| Friend request accepted     | Your friend request was accepted                  | On          | Medium   |
| New message                 | Friend sends a direct message                     | On          | Medium   |
| Feed reaction               | Someone reacts to your feed item                  | Off         | Low      |
| Club invite                 | Invited to join a club                            | On          | Medium   |
| Club goal milestone         | Club goal reaches 25/50/75/100%                   | On          | Low      |
| Mentorship request          | Mentee requests you as Elmer                      | On          | High     |
| Mentee milestone            | Your mentee completes a milestone                 | On          | Medium   |
| Friend On Air               | A friend sets On Air status                       | Per-setting | Low      |
| Friend POTA/SOTA activation | A friend starts a POTA/SOTA activation            | On          | Medium   |
| Challenge invite            | Invited to a collaborative challenge              | On          | Medium   |
| Challenge complete          | A collaborative challenge you are in is completed | On          | Low      |

### 6.2 Notification Delivery

- **In-app badge**: A red badge on the Social nav item showing unread notification count.
- **In-app notification panel**: Accessible from the Social page header. Lists recent notifications with timestamps and actions (e.g., "Accept" on friend request notifications).
- **Browser push notifications** (optional): For high-priority notifications when the app is in the background. Requires explicit browser permission grant.
- **Email digest** (future): A weekly email summarizing social activity. Not in V1 scope.

### 6.3 Notification Storage

Notifications are stored in a lightweight `notifications` table:

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,                         -- deep link within Propulse (e.g., /social/requests)
  metadata JSONB,                          -- type-specific payload
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id)
  WHERE read_at IS NULL;
```

**Retention:** Notifications older than 30 days are pruned by a `pg_cron` job.

### 6.4 Quiet Hours Integration

All social notifications respect the quiet hours system defined in `PRD-SETTINGS-PREFERENCES-V2.md` Fix #14. During quiet hours:

- In-app badges still update (silent visual indicator).
- Browser push notifications are suppressed.
- No audio alerts for messages.
- Notifications are queued and delivered when quiet hours end.

---

## 7. Gamification Integration

The social layer integrates with the XP/Level system and achievement badges defined in `PRD-OPERATOR-PROFILE-V2.md` Sections 4.5-4.6. This section defines the social-specific XP awards and badges.

### 7.1 Social XP Awards

| Action                                  | XP Award   | Frequency                      |
| --------------------------------------- | ---------- | ------------------------------ |
| Complete profile to "public" visibility | 50 XP      | One-time                       |
| First follower                          | 25 XP      | One-time                       |
| Reach 10 followers                      | 50 XP      | One-time                       |
| Reach 50 followers                      | 100 XP     | One-time                       |
| First mutual friend                     | 25 XP      | One-time                       |
| Reach 10 friends                        | 50 XP      | One-time                       |
| React to a feed item                    | 2 XP       | Per reaction (max 20/day)      |
| Join a club                             | 25 XP      | Per club (max 5)               |
| Contribute to a club goal               | 10 XP      | Per contribution (max 50/goal) |
| Complete a collaborative challenge      | 100-300 XP | Per challenge                  |
| Register as Elmer                       | 100 XP     | One-time                       |
| Mentee completes a milestone            | 50 XP      | Per milestone                  |
| Complete a full mentorship              | 500 XP     | Per mentorship                 |
| Send first message                      | 10 XP      | One-time                       |

### 7.2 Social Badges

New badge category: **Community** (separate from the Operating, Achievement, and Shack badge categories defined in Profile V2).

| Badge            | Requirement                                         | Tier     | Icon Theme          |
| ---------------- | --------------------------------------------------- | -------- | ------------------- |
| Social Butterfly | Have 10 mutual friends                              | Bronze   | Butterfly antenna   |
| Community Voice  | React to 50 feed items                              | Bronze   | Speech bubble       |
| Club Champion    | Contribute to 3 club goal completions               | Silver   | Shield with star    |
| Elmer            | Complete a mentorship (all enabled milestones)      | Gold     | Graduation cap      |
| Master Elmer     | Complete 5 mentorships                              | Platinum | Gold graduation cap |
| License Maker    | Mentee achieves license upgrade during mentorship   | Gold     | FCC license motif   |
| Team Player      | Win 3 collaborative challenges                      | Silver   | Handshake           |
| On Air Regular   | Set On Air status 50 times                          | Bronze   | Green dot / antenna |
| Park Spotter     | Get POTA activation alerts for 10 different friends | Bronze   | Binoculars / tree   |
| Connected        | Reach 50 mutual friends                             | Silver   | Network graph       |

### 7.3 Elmer-Specific XP

The Elmer XP system is weighted heavily because mentoring is the most valuable social contribution:

| Mentee Milestone           | Elmer XP Bonus |
| -------------------------- | -------------- |
| First QSO                  | 25 XP          |
| First HF QSO               | 30 XP          |
| First DX QSO               | 40 XP          |
| License upgrade            | 100 XP         |
| 100 QSO Club               | 50 XP          |
| Any other milestone        | 25 XP          |
| Full mentorship completion | 500 XP bonus   |

At maximum engagement (mentoring 3 mentees through full milestones), an Elmer earns approximately 3,000 XP -- equivalent to roughly 2 XP levels. This is intentional: mentoring should be one of the most rewarding activities in Propulse, on par with operating.

---

## 8. Moderation & Safety

### 8.1 Content Policies

Propulse social features are used by a community of licensed amateur radio operators. The content policies reflect this:

1. **Real identity required.** Social features require a verified callsign. Anonymous participation is not possible.
2. **Ham radio context.** All social features are scoped to ham radio activity. There is no general-purpose posting or content creation.
3. **No hate speech, harassment, or discrimination.** Standard community guidelines apply.
4. **No commercial solicitation.** Selling equipment, services, or promotions through social features is not permitted.
5. **No impersonation.** Using someone else's callsign is a federal offense (in the US) and results in immediate account suspension.

### 8.2 Moderation Tools

#### User-level tools (available to all operators)

- **Block**: Hide an operator from all social surfaces (Section 3.1.5)
- **Report**: Flag a profile, message, or feed item for moderator review. Report form collects: reason (harassment, spam, impersonation, inappropriate content, other), optional description.
- **Delete own content**: Operators can delete their own messages, feed items, and reactions.

#### Moderator-level tools (available to users with `role = 'moderator'` in profiles)

- **Review reported content**: Queue of reported items with context (reporter, reported user, content, reason).
- **Warn user**: Send a moderation notice to a user about a policy violation. Warning is visible only to the user and moderators.
- **Suspend social features**: Temporarily disable a user's ability to post feed items, send messages, or create clubs. Duration: 24 hours, 7 days, or 30 days. Suspension does not affect the user's non-social features (logbook, shack, propagation dashboard).
- **Ban from social**: Permanently disable all social features for a user. Requires admin approval.
- **Remove content**: Delete specific messages, feed items, or club content that violates policies.

#### Admin-level tools (available to users with `role = 'admin'` in profiles)

- **Approve/deny bans**: Review moderator-initiated bans.
- **Manage moderators**: Grant or revoke moderator role.
- **View moderation log**: Audit trail of all moderation actions.

### 8.3 Automated Safety

- **Rate limiting**: Message sending is rate-limited to 100 messages per conversation per day, 20 friend requests per day, and 50 reactions per day.
- **Spam detection**: If a user sends identical messages to 5+ different recipients within 1 hour, their messaging is temporarily suspended pending moderator review.
- **New account throttle**: Accounts less than 24 hours old cannot send friend requests or messages (prevents ban-evasion spam accounts). They can follow and react.

### 8.4 Reports Table

```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id),
  reported_user_id UUID NOT NULL REFERENCES profiles(id),
  content_type TEXT NOT NULL
    CHECK (content_type IN ('profile', 'message', 'feed_item', 'club', 'review')),
  content_id UUID,                         -- ID of the reported content (message ID, feed item ID, etc.)
  reason TEXT NOT NULL
    CHECK (reason IN ('harassment', 'spam', 'impersonation', 'inappropriate', 'other')),
  description TEXT CHECK (length(description) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'action_taken', 'dismissed')),
  reviewer_id UUID REFERENCES profiles(id),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_status ON reports (status, created_at);
```

---

## 9. UI Components

### 9.1 New Pages

| Page                 | Route                        | Purpose                                                    |
| -------------------- | ---------------------------- | ---------------------------------------------------------- |
| Social Home          | `/social`                    | Activity feed, On Air Now section, friend activity         |
| Friends List         | `/social/friends`            | Friends, followers, following, pending requests            |
| Operator Discovery   | `/social/discover`           | Nearby operators, interest matching, QSO-based suggestions |
| Elmer Directory      | `/social/elmers`             | Browse and search registered Elmers                        |
| Mentorship Dashboard | `/social/mentorship/{id}`    | Active mentorship milestones, notes, progress              |
| Club Detail          | `/club/{slug}`               | Club info, feed, goals, members, leaderboard               |
| Club Directory       | `/social/clubs`              | Browse and search public clubs                             |
| Messages             | `/social/messages`           | Conversation list and message threads                      |
| Challenge Detail     | `/social/challenge/{id}`     | Collaborative challenge progress and leaderboard           |
| Comparison           | `/social/compare/{callsign}` | Side-by-side stat comparison with a friend                 |

### 9.2 New Components

| Component                   | Location                            | Purpose                                                    |
| --------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| `SocialPage.tsx`            | `src/pages/`                        | Social home page layout with feed, On Air Now, suggestions |
| `FriendsList.tsx`           | `src/components/social/`            | Tabbed view (friends, followers, following, requests)      |
| `ActivityFeed.tsx`          | `src/components/social/`            | Chronological feed with filtering and infinite scroll      |
| `FeedItem.tsx`              | `src/components/social/`            | Single feed event card with reactions                      |
| `ReactionBar.tsx`           | `src/components/social/`            | 73 / FB / QSL / DX! / CQ reaction buttons                  |
| `OnAirNow.tsx`              | `src/components/social/`            | Friends currently on the air, with band/mode/location      |
| `OnAirStatusSetter.tsx`     | `src/components/social/`            | Form to set your own On Air status                         |
| `OperatorCard.tsx`          | `src/components/social/`            | Compact operator display (callsign, name, avatar, badges)  |
| `OperatorDiscovery.tsx`     | `src/components/social/`            | Discovery tabs (nearby, interests, QSO-based)              |
| `ElmerDirectory.tsx`        | `src/components/social/`            | Searchable Elmer list with filters                         |
| `ElmerRegistration.tsx`     | `src/components/social/`            | Elmer registration form                                    |
| `MentorshipDashboard.tsx`   | `src/components/social/`            | Milestone tracker, notes, progress for active mentorship   |
| `MilestoneTracker.tsx`      | `src/components/social/`            | Visual milestone journey path                              |
| `ClubCard.tsx`              | `src/components/social/`            | Club preview card for directory                            |
| `ClubDetail.tsx`            | `src/components/social/`            | Full club page (feed, goals, members)                      |
| `ClubGoalProgress.tsx`      | `src/components/social/`            | Progress bar and contribution breakdown for a club goal    |
| `MessageThread.tsx`         | `src/components/social/`            | Conversation view with message bubbles                     |
| `ConversationList.tsx`      | `src/components/social/`            | List of active message conversations                       |
| `ChallengeCard.tsx`         | `src/components/social/`            | Collaborative challenge progress card                      |
| `StatComparison.tsx`        | `src/components/social/`            | Side-by-side comparison layout                             |
| `QSOHistoryCard.tsx`        | `src/components/social/`            | Mutual QSO history display                                 |
| `SocialSettingsSection.tsx` | `src/components/settings/sections/` | Social privacy and feature toggles                         |
| `NotificationPanel.tsx`     | `src/components/social/`            | In-app notification list                                   |
| `FollowButton.tsx`          | `src/components/social/`            | Follow/Unfollow/Friend Request button                      |
| `ShareModal.tsx`            | `src/components/social/`            | Share achievement/station card with target selection       |

### 9.3 Design Language

Social components follow the established Propulse design system:

- **Card surfaces**: `bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl` (consistent with Shack, Profile, Settings pages)
- **Primary accent**: `plasma-orange` for follow buttons, active states, and social action CTAs
- **Secondary accent**: `nebula-blue` for informational badges and secondary actions
- **Success/positive**: `signal-green` for online status, milestone completion, positive deltas
- **Warning**: `caution-amber` for pending requests, approaching limits
- **Danger**: `alert-red` for block actions, report buttons, negative deltas
- **Avatar fallback**: Generated from callsign using the first two characters mapped to a hue on the plasma-orange to nebula-blue gradient, with the callsign initials centered
- **Feed layout**: Cards with `p-4 space-y-3` padding, avatar on the left (40px circle), content on the right
- **Reaction pills**: `rounded-full px-3 py-1 text-sm` with count badge, hover to highlight, active state filled

### 9.4 Navigation

The Social page is accessible from the main navigation sidebar/bottom bar:

- **Desktop**: New nav item "Social" (icon: users/people) in the sidebar, between "Profile" and "Settings"
- **Mobile**: New nav item in the bottom tab bar, replacing the current empty slot or as an additional item
- **Badge**: Red notification count badge on the Social nav item when there are unread notifications or pending friend requests

Social sub-pages use a horizontal tab bar at the top:

- **Feed** (default) | **Friends** | **Discover** | **Clubs** | **Messages** | **Elmers**

---

## 10. Mobile Experience

### 10.1 Layout Adaptations

| Feature              | Desktop                              | Mobile                                                         |
| -------------------- | ------------------------------------ | -------------------------------------------------------------- |
| Activity feed        | 600px max-width centered column      | Full-width, edge-to-edge cards                                 |
| Friends list         | 3-column grid of operator cards      | Single-column list with compact cards                          |
| On Air Now           | Horizontal card row above feed       | Horizontally scrollable pill strip                             |
| Club detail          | 2-column (info sidebar + feed)       | Single column with collapsible info header                     |
| Messages             | 2-panel (list + thread side-by-side) | Single panel with back navigation                              |
| Stat comparison      | Side-by-side columns                 | Vertically stacked with toggle ("Show mine" / "Show friend's") |
| Mentorship dashboard | 2-column (milestones + notes)        | Single column with tab toggle                                  |
| Operator discovery   | Grid with filter sidebar             | Full-width list with filter bottom sheet                       |

### 10.2 Touch Interactions

- **Swipe right on feed item**: Quick-react with 73 (the most common positive reaction).
- **Long-press on operator card**: Show quick-action popover (Follow, Message, Compare, Block).
- **Pull-to-refresh on feed**: Refresh activity feed from Supabase.
- **Swipe between Social sub-pages**: Horizontal swipe navigation between Feed, Friends, Discover tabs.

### 10.3 Performance Considerations

- **Feed pagination**: Load 20 items initially, infinite scroll loads 20 more per batch.
- **Avatar lazy loading**: Avatars below the fold use `loading="lazy"` with placeholder gradient.
- **Presence throttle**: On Air status updates debounced to every 30 seconds on mobile to conserve battery and bandwidth.
- **Offline graceful degradation**: Social features require a network connection. When offline, show cached feed data with a banner: "You're offline. Social features will update when you reconnect." Non-social features (logbook, propagation, shack) continue to work fully offline.

---

## 11. API Endpoints

### 11.1 Supabase Edge Functions

| Endpoint                      | Method | Purpose                                                 | Auth         |
| ----------------------------- | ------ | ------------------------------------------------------- | ------------ |
| `social/discover-nearby`      | GET    | Find operators near a grid square within radius         | Required     |
| `social/discover-interests`   | GET    | Find operators with matching interest tags              | Required     |
| `social/discover-qso-matches` | GET    | Find Propulse users from your logbook                   | Required     |
| `social/qso-history`          | GET    | Compute QSO history between two friends                 | Required     |
| `social/club-goal-update`     | POST   | Recompute club goal progress from member logbooks       | Service role |
| `social/challenge-update`     | POST   | Recompute challenge standings from participant logbooks | Service role |
| `social/elmer-match-suggest`  | GET    | Suggest Elmers based on mentee profile                  | Required     |
| `social/share-card`           | POST   | Generate Open Graph meta for achievement URL            | Public       |

### 11.2 Supabase Direct Queries (Client SDK)

Most social features use standard Supabase client queries rather than Edge Functions:

| Operation              | Table                         | Query Type                      |
| ---------------------- | ----------------------------- | ------------------------------- |
| Follow/unfollow        | `follows`                     | INSERT / DELETE                 |
| Send friend request    | `friend_requests`             | INSERT                          |
| Accept/decline request | `friend_requests` + `follows` | RPC (`accept_friend_request`)   |
| Block/unblock          | `blocks`                      | INSERT / DELETE                 |
| Load feed              | `activity_feed`               | SELECT with pagination          |
| React to feed item     | `feed_reactions`              | UPSERT / DELETE                 |
| Send message           | `messages`                    | INSERT                          |
| Load messages          | `messages`                    | SELECT with conversation filter |
| Mark message read      | `messages`                    | UPDATE                          |
| Join/leave club        | `club_members`                | INSERT / DELETE                 |
| Create club goal       | `club_goals`                  | INSERT                          |
| Register as Elmer      | `elmers`                      | INSERT                          |
| Request mentorship     | `mentorships`                 | INSERT                          |
| Update milestones      | `mentorship_milestones`       | UPDATE                          |
| Add mentorship notes   | `mentorship_notes`            | INSERT                          |
| Update social settings | `social_settings`             | UPSERT                          |
| Load notifications     | `notifications`               | SELECT                          |
| Mark notification read | `notifications`               | UPDATE                          |
| Report content         | `reports`                     | INSERT                          |

### 11.3 Supabase Realtime Channels

| Channel                       | Scope            | Payload                 | Subscribe When         |
| ----------------------------- | ---------------- | ----------------------- | ---------------------- |
| `presence:{user_id}`          | Friends of user  | On Air status object    | Social page is active  |
| `notifications:{user_id}`     | Single user      | New notification object | App is open (any page) |
| `messages:{conversation_key}` | Two participants | New message object      | Message thread is open |

**Cost discipline**: Realtime is used for exactly three features. Everything else uses standard queries with client-side polling or manual refresh. This aligns with the bandwidth discipline established in `PRD-SUPABASE-MIGRATION.md` Section 9.

---

## 12. Success Metrics

### 12.1 Adoption Metrics

| Metric                                                               | Target (90 days post-launch) | Measurement                                                          |
| -------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| % of authenticated users who follow at least 1 operator              | 40%                          | `SELECT count(DISTINCT follower_id) FROM follows` / total auth users |
| Average friends per active social user                               | 8                            | `AVG(friend_count) FROM profiles WHERE friend_count > 0`             |
| % of authenticated users who view the Social page at least once/week | 30%                          | Analytics event on Social page visit                                 |
| Club creation rate                                                   | 50+ clubs in 90 days         | `SELECT count(*) FROM clubs`                                         |
| Average club size                                                    | 15 members                   | `AVG(member_count)` computed from `club_members`                     |
| Elmer registrations                                                  | 100+ Elmers in 90 days       | `SELECT count(*) FROM elmers WHERE is_active = true`                 |
| Active mentorships                                                   | 50+ at any given time        | `SELECT count(*) FROM mentorships WHERE status = 'active'`           |

### 12.2 Engagement Metrics

| Metric                                                 | Target        | Measurement                                      |
| ------------------------------------------------------ | ------------- | ------------------------------------------------ |
| Feed views per active social user per week             | 5+            | Analytics event count                            |
| Reactions per feed item (among items with > 5 viewers) | 1.5 avg       | `feed_reactions` count / `activity_feed` count   |
| Messages sent per active DM user per week              | 10+           | `messages` count per user per week               |
| On Air status sets per week (across all users)         | 200+          | Count of presence updates with status = 'on_air' |
| Club goal completion rate                              | 60%+          | Completed goals / total goals with deadlines     |
| Collaborative challenge creation rate                  | 20+ per month | `collaborative_challenges` inserts per month     |

### 12.3 Mentorship Quality Metrics

| Metric                                                                     | Target                                              | Measurement                                          |
| -------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Mentorship acceptance rate                                                 | 70%+                                                | Accepted / (accepted + declined) mentorship requests |
| Average milestones completed per active mentorship                         | 6+ (of 12)                                          | Milestone completion count                           |
| Mentorship completion rate (all enabled milestones)                        | 30%+                                                | Completed mentorships / total started mentorships    |
| Mentee retention (still active on Propulse 90 days after mentorship start) | 80%+                                                | Login activity check for mentees                     |
| Elmer satisfaction (measured by continued availability)                    | 85%+ of Elmers remain active after first mentorship | `is_active` flag retention                           |

### 12.4 Safety Metrics

| Metric                               | Target                     | Measurement                            |
| ------------------------------------ | -------------------------- | -------------------------------------- |
| Reports per 1000 social interactions | < 5                        | `reports` count / total social actions |
| Report resolution time (median)      | < 24 hours                 | `reviewed_at - created_at` median      |
| Block rate                           | < 2% of users block anyone | `blocks` count / total auth users      |
| Spam detection false positive rate   | < 1%                       | Manual review of auto-suspensions      |

### 12.5 How to Measure

- **Adoption and engagement**: Lightweight analytics events (no PII) stored in a Supabase `analytics_events` table. Events: `social_page_view`, `feed_view`, `reaction_sent`, `message_sent`, `on_air_set`, `follow_created`, `club_joined`.
- **Mentorship quality**: Direct queries against `mentorships` and `mentorship_milestones` tables, run as a weekly monitoring job.
- **Safety**: Supabase SQL queries on `reports` and `blocks` tables, reviewed weekly by the moderation team.
- **Infrastructure**: Supabase dashboard for database size, Realtime connection count, and Edge Function invocation count.

---

## Appendix A: Rollout Plan

### Tier 1: Foundation (Friends & Follows)

- Follow/unfollow, friend requests, block
- Friends list page
- Basic notification system
- Social settings page
- `follows` table already exists; add `friend_requests`, `blocks`, `social_settings`, `notifications` tables
- **Risk**: Low -- extends existing `follows` table with UI

### Tier 2: Activity Feed

- Activity feed page (friends feed)
- Feed item rendering with reactions
- Feed privacy controls
- Extend `activity_feed` event types
- Add `feed_reactions` table
- **Risk**: Low -- `activity_feed` table already exists; this adds UI and reactions

### Tier 3: Discovery & Presence

- Operator discovery (nearby, interests, QSO-based)
- On Air Now status
- Operator tags
- Add `operator_tags` table, discovery Edge Functions
- Supabase Presence integration
- **Risk**: Medium -- Presence requires careful bandwidth management

### Tier 4: Direct Messages

- Message sending and conversation view
- Add `messages` table
- Realtime message delivery
- **Risk**: Medium -- requires Realtime subscription management

### Tier 5: Clubs & Groups

- Club creation, membership, feed
- Collaborative goals
- Club leaderboard
- Add `clubs`, `club_members`, `club_goals`, `club_goal_contributions` tables
- **Risk**: Medium -- club goal computation requires Edge Functions

### Tier 6: Elmer/Mentorship

- Elmer registration and directory
- Mentorship matching and dashboard
- Milestone tracking and notes
- Add `elmers`, `mentorships`, `mentorship_milestones`, `mentorship_notes` tables
- **Risk**: Low -- self-contained feature with clear data model

### Tier 7: Advanced Social

- Collaborative challenges
- Station comparison
- QSO history with friends
- Achievement sharing enhancements
- Add `collaborative_challenges`, `challenge_participants` tables
- **Risk**: Low -- builds on foundation from Tiers 1-2

### Feature Flags

Each tier is gated behind a feature flag:

| Flag                           | Default | Scope                        |
| ------------------------------ | ------- | ---------------------------- |
| `VITE_ENABLE_SOCIAL_FRIENDS`   | `false` | Tier 1: Friends & Follows    |
| `VITE_ENABLE_SOCIAL_FEED`      | `false` | Tier 2: Activity Feed        |
| `VITE_ENABLE_SOCIAL_DISCOVERY` | `false` | Tier 3: Discovery & Presence |
| `VITE_ENABLE_SOCIAL_MESSAGES`  | `false` | Tier 4: Direct Messages      |
| `VITE_ENABLE_SOCIAL_CLUBS`     | `false` | Tier 5: Clubs & Groups       |
| `VITE_ENABLE_SOCIAL_ELMER`     | `false` | Tier 6: Elmer/Mentorship     |
| `VITE_ENABLE_SOCIAL_ADVANCED`  | `false` | Tier 7: Advanced Social      |

Each flag can be enabled independently, but higher tiers depend on lower tiers being enabled (e.g., Clubs requires Friends & Feed).

---

## Appendix B: Key File Paths (Planned)

| File                                                         | Purpose                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `src/pages/SocialPage.tsx`                                   | Social home page (feed, On Air Now, suggestions)                    |
| `src/pages/FriendsPage.tsx`                                  | Friends management (friends, followers, requests)                   |
| `src/pages/ClubPage.tsx`                                     | Club detail page                                                    |
| `src/pages/MentorshipPage.tsx`                               | Mentorship dashboard                                                |
| `src/pages/MessagesPage.tsx`                                 | Message conversations                                               |
| `src/stores/socialStore.ts`                                  | Zustand store for social state (friends, feed cache, notifications) |
| `src/stores/clubStore.ts`                                    | Zustand store for club state                                        |
| `src/stores/mentorshipStore.ts`                              | Zustand store for mentorship state                                  |
| `src/hooks/useFriends.ts`                                    | Friends list and follow management hook                             |
| `src/hooks/useActivityFeed.ts`                               | Activity feed fetching and pagination hook                          |
| `src/hooks/useOnAirStatus.ts`                                | Supabase Presence integration for On Air status                     |
| `src/hooks/useOperatorDiscovery.ts`                          | Discovery search and suggestion hook                                |
| `src/hooks/useClubGoals.ts`                                  | Club goal progress tracking hook                                    |
| `src/hooks/useMentorship.ts`                                 | Mentorship dashboard data hook                                      |
| `src/hooks/useMessages.ts`                                   | Message thread management hook                                      |
| `src/hooks/useSocialNotifications.ts`                        | Social notification fetching and badge count                        |
| `src/hooks/useQSOHistory.ts`                                 | Mutual QSO history computation hook                                 |
| `src/hooks/useSocialSettings.ts`                             | Social privacy settings management hook                             |
| `src/components/social/`                                     | ~25 component files (see Section 9.2)                               |
| `src/components/settings/sections/SocialSettingsSection.tsx` | Social privacy settings UI                                          |
| `src/types/social.ts`                                        | TypeScript types for social features                                |

---

## Appendix C: Relationship to Other PRDs

This PRD intentionally avoids duplicating specifications that belong in other PRDs. The following features are defined elsewhere and referenced here:

| Feature                                  | Owner PRD                 | This PRD's Relationship                     |
| ---------------------------------------- | ------------------------- | ------------------------------------------- |
| `follows` table schema                   | Supabase Migration        | Consumes and extends with friend semantics  |
| `activity_feed` table schema             | Supabase Migration        | Extends event types, adds UI                |
| Supabase Presence architecture           | Supabase Migration        | Extends with On Air status                  |
| XP/Level system                          | Operator Profile V2       | Adds social XP sources                      |
| Achievement badges                       | Operator Profile V2       | Adds Community badge category               |
| Shareable achievement cards              | Operator Profile V2       | Adds social distribution targets            |
| Activity feed event generation           | Operator Profile V2       | Extends with social event types             |
| Shareable station profile                | Shack Builder V2          | Integrates into social sharing              |
| Notification system (quiet hours, sound) | Settings & Preferences V2 | Social notifications respect these settings |
| Profile visibility settings              | Supabase Migration        | Social features respect profile visibility  |
| Callsign verification                    | Supabase Migration        | Social features require verified callsign   |

---

_This PRD is a living document. As implementation proceeds through the tiers defined in Appendix A, sections will be updated to reflect design decisions, technical tradeoffs, and community feedback. The social layer is the most culturally sensitive part of Propulse -- every feature should be evaluated against the question: "Would this make ham radio feel more welcoming?"_
