# PRD: Supabase Migration -- Local-First Cloud Backend for Propulse

**Status:** Draft
**Owner:** Product / Engineering
**Audience:** Frontend, Backend (Supabase), Infrastructure, QA
**Version:** 1.0
**Date:** 2026-02-07

**Related docs:**

- `docs/requirements/PRD-OPERATOR-PROFILE.md` -- Operator identity, awards, social features
- `docs/requirements/PRD-SHACK-BUILDER.md` -- Equipment management, station modeling
- `docs/requirements/PRD-SETTINGS-PAGE.md` -- App configuration page
- `src/types/user.ts` -- UserStation, LicenseInfo, OperatingLocation, UserPreferences
- `src/types/pin.ts` -- MapPin, PinCategory
- `src/stores/userStore.ts` -- Monolithic Zustand user preferences store (v14, 1608 lines)
- `src/stores/watchStore.ts` -- Watch system (WatchItem[])
- `src/stores/pinStore.ts` -- Map pins (MapPin[])
- `src/stores/skedStore.ts` -- QSO scheduling (Sked[])
- `src/stores/contestStore.ts` -- Contest sessions (ContestSession, ContestQSO)
- `src/stores/dxccStore.ts` -- DXCC tracking (computed from logbook)
- `src/stores/themeStore.ts` -- Theme persistence (localStorage manual)
- `src/stores/syncQueueStore.ts` -- QSL upload retry queue
- `src/lib/db/types.ts` -- LogEntry, AlertRule, AlertHistoryEntry (IndexedDB schemas)
- `src/lib/db/` -- IndexedDB access layer (propulse-db)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Architecture Principles](#3-architecture-principles)
4. [Authentication](#4-authentication)
5. [Database Schema](#5-database-schema)
6. [Sync Architecture](#6-sync-architecture)
7. [Migration Strategy](#7-migration-strategy)
8. [Supabase Project Configuration](#8-supabase-project-configuration)
9. [Client-Side Architecture](#9-client-side-architecture)
10. [Security & Privacy](#10-security--privacy)
11. [Rollout Plan](#11-rollout-plan)
12. [Monitoring & Cost Controls](#12-monitoring--cost-controls)
13. [Testing Strategy](#13-testing-strategy)
14. [Open Questions](#14-open-questions)

---

## 1. Executive Summary

Propulse is a ham radio propagation dashboard built with React 18, TypeScript 5.7, Tailwind 3, Three.js, Zustand 5, and Vite 6. Today, every byte of user data lives in the browser: localStorage via Zustand persist middleware (18 stores across 414 source files) and IndexedDB for the QSO logbook, alert rules, encrypted credentials, and API cache. This architecture was correct for getting to market -- it kept the app fast, offline-capable, and free of infrastructure costs. It is now the single biggest constraint preventing three critical product evolutions: cross-device sync, data durability, and social features.

This PRD defines the migration from browser-only storage to Supabase as the cloud backend. Supabase provides PostgreSQL with Row-Level Security, real-time subscriptions, file storage, edge functions, and authentication -- all consumable from a client-side SDK without building a custom API layer.

**What changes for users:**

- **Cloud backup.** Clearing browser data, switching browsers, or losing a device no longer destroys their operating record. Their QSO logbook, profile, preferences, and equipment data are recoverable from the cloud.
- **Cross-device sync.** An operator can log QSOs on a desktop at home, review their logbook on a laptop at a hamfest, and check propagation on a phone -- all with the same data.
- **Social features.** Public profiles, friend networks, activity feeds, and shareable station cards become possible for the first time.
- **No forced migration.** Users who do not want an account continue using the app identically to today. Every feature works offline and locally. Supabase is additive -- it never becomes a required dependency.

**What stays the same:**

- The app works 100% offline. Network is never in the critical path for any user action.
- All interactions remain instant. Local writes happen synchronously; sync happens in the background.
- Static reference data (DXCC entities, band plans, contest definitions, radio database, Sherwood data) stays bundled in JavaScript. It is never fetched from Supabase.
- Computed data (DXCC tracking, award progress) is derived client-side from the synced logbook. It is never stored redundantly in the cloud.
- Encrypted QSL service credentials (LoTW, eQSL, ClubLog) never leave the device.

**Why Supabase specifically:**

- PostgreSQL with RLS eliminates the need for a custom API layer. The client SDK talks directly to the database with security enforced at the row level.
- The free tier (500MB database, 1GB storage, 2GB egress/month) supports the project through early adoption without any infrastructure cost.
- Auth, storage, edge functions, and realtime are integrated. No need to stitch together Firebase Auth + S3 + Lambda + Pusher.
- Full SQL access means complex queries (logbook analytics, achievement computation) run server-side when needed, without building a REST API.

**Cost discipline is a first-class architectural constraint.** Every design decision in this document is evaluated against its bandwidth impact. The sync architecture uses three tiers of urgency, batches all writes, transmits only deltas, avoids Supabase Realtime for everything except friend online status, and computes derived data locally rather than syncing it. The estimated bandwidth for a typical active operator is approximately 6MB/month -- at Supabase Pro pricing, this supports approximately 40,000 active users before overage charges apply.

---

## 2. Problem Statement

### 2.1 Data Fragility

All user data lives in the browser's localStorage and IndexedDB. These are ephemeral storage mechanisms designed for caching, not for permanent records. A single action destroys everything:

- Clearing browser data (Settings > Clear browsing data)
- Switching browsers (Firefox to Chrome)
- Device replacement (new laptop, phone upgrade)
- Browser updates that reset storage
- Incognito/private browsing mode (no persistence at all)
- Storage eviction under browser pressure (especially on mobile Safari with limited IndexedDB quotas)

For a ham radio operator, the QSO logbook is a permanent legal record of their contacts. Losing it is equivalent to losing years of operating history. Today, the only protection is the manual JSON export in the Settings backup panel -- and most users will never think to use it until it is too late.

### 2.2 No Cross-Device Continuity

Operators commonly use multiple devices:

- Desktop at the home shack (primary operating position)
- Laptop for portable operations (POTA, SOTA, Field Day)
- Phone at hamfests, in the car, or for quick propagation checks
- Tablet for contest logging at a friend's station

Today, each device is an island. A QSO logged on the desktop does not appear on the laptop. Preferences set on the phone do not carry over to the desktop. Equipment configured on one device must be re-entered on another. There is no mechanism to bridge these environments.

### 2.3 No Social Surface Area

Ham radio is fundamentally a social hobby -- operators contact each other across the globe. Yet Propulse offers zero social features because there is no backend to mediate user-to-user interactions. Without a server:

- Operators cannot share their profile, station configuration, or operating statistics
- There is no friend network, activity feed, or online status
- Achievement badges exist only in a single browser's memory
- QR code profile cards at hamfests have nowhere to point

The Profile PRD (`PRD-OPERATOR-PROFILE.md`), Shack PRD (`PRD-SHACK-BUILDER.md`), and Settings PRD (`PRD-SETTINGS-PAGE.md`) all depend on a cloud backend to deliver their full feature sets.

### 2.4 localStorage Size Limits

Browsers enforce a 5-10MB limit per origin for localStorage. A single Zustand store (`propulse-user`) serializes the entire user preferences blob including radio equipment definitions, custom radio specs, saved locations, and targets. As operators add equipment and preferences accumulate, this approaches the limit. IndexedDB has higher limits (typically 50-80% of available disk space), but mobile Safari is notoriously aggressive about evicting IndexedDB data from origins that have not been visited recently.

An operator with 50,000 QSO entries (not unusual for an active contester over several years) stores approximately 25MB in IndexedDB. This works today, but there is no backup, no sync, and no recovery if the browser decides to reclaim that space.

### 2.5 No Data Recovery

If data is lost through any of the mechanisms described above, it is gone permanently. There is no server-side copy, no incremental backup, no point-in-time recovery. The manual JSON export captures a snapshot, but operators must proactively export after every session -- and even then, they must store the export file somewhere safe.

---

## 3. Architecture Principles

These six principles govern every design decision in this document. When trade-offs arise, they are resolved by priority order.

### 3.1 Local-First

The application works 100% without network connectivity. Supabase is never in the critical path for any user action. Every write goes to local storage first, then syncs to the cloud asynchronously. If Supabase is unreachable -- due to network failure, service outage, or the user simply not having an account -- the app continues to function identically to its current behavior.

**Implication:** Every feature must have a complete local implementation before cloud sync is added. The sync layer is a separate concern that enhances but never gates functionality.

### 3.2 Eventual Consistency

Local writes are authoritative. The user sees their changes immediately in the UI. Sync happens in the background on a best-effort basis. If the same data is modified on two devices before sync occurs, the most recent write wins (determined by `updated_at` timestamps). There is no optimistic locking, no merge conflict UI, and no blocking sync operations.

**Implication:** Every syncable record must carry an `updated_at` timestamp that is set on the client at write time. Conflict resolution is automatic and invisible to the user.

### 3.3 Cost-Conscious

Every byte of bandwidth has a cost. The architecture minimizes ingress and egress through:

- **Batch writes:** Never sync on every keystroke. Debounce settings changes by 5 seconds. Batch logbook entries in groups of up to 100.
- **Delta sync:** Only transmit records that have changed since the last successful sync, identified by `updated_at > lastSyncedAt`.
- **No unnecessary Realtime:** Supabase Realtime subscriptions cost per connection-hour of egress. Only friend online status uses Realtime. Everything else uses pull-on-demand or debounced push.
- **Computed data stays local:** DXCC tracking, award progress, and statistics are computed client-side from the synced logbook. They are never stored or synced separately.
- **Static data stays bundled:** DXCC entities (340 records), band plans, contest definitions, radio database (200+ radios), Sherwood data, county lists, prefix tables, satellite TLEs, and geopolitical boundaries (~23,600 lines of bundled JS) are never fetched from Supabase.
- **Compression:** Large payloads (full logbook export for initial upload) use gzip content encoding.
- **Pagination:** Logbook queries are always paginated by date range, never "fetch all."
- **Smart caching:** ETags and `updated_at` timestamps prevent re-downloading unchanged data.

### 3.4 Privacy-Default

All data is private by default. Sharing is opt-in per feature, controlled by `visibility_settings` on the profile:

- Profile: private (default), friends-only, or public
- Logbook: always private (no public logbook feature in this phase)
- Equipment: matches profile visibility
- Online status: opt-in only

The user has full control over what is visible and to whom. There is no global directory of users unless they choose to make their profile public.

### 3.5 Graceful Degradation

If Supabase is down, the app continues normally. Pending sync operations queue locally and flush when connectivity is restored. The UI shows sync status but never blocks user actions. Error states are informational ("3 changes pending sync"), not blocking ("Cannot save -- server unreachable").

### 3.6 Progressive Enhancement

Users without accounts get the same local experience as today. Creating an account adds cloud sync and social features as a layer on top. No existing functionality is removed or gated behind authentication. The app never nags users to create an account -- it offers the option during onboarding and in the Settings > Data section, and that is it.

---

## 4. Authentication

### 4.1 Authentication Methods

**Primary: Magic Link (email)**

Magic link authentication sends a one-time login link to the user's email address. The user clicks the link, and a session is established in the browser. This is the lowest-friction auth method for a technical audience: no password to create, remember, or reset. Supabase handles magic link generation, delivery, and token exchange.

- Flow: User enters email > Supabase sends magic link > User clicks link > Session created
- Token: Supabase issues a JWT with `access_token` and `refresh_token`
- Session duration: 1 hour access token, 7-day refresh token (configurable in Supabase dashboard)
- Auto-refresh: `@supabase/supabase-js` automatically refreshes the access token using the refresh token before expiry

**Secondary: OAuth (Google, GitHub)**

Ham radio operators skew technical. Many already have GitHub accounts for logging software, antenna modeling tools, or open-source radio projects. Google covers the non-technical remainder. Both use Supabase's built-in OAuth flow.

- Google: covers the broadest user base
- GitHub: natural fit for the developer-heavy ham radio community
- Flow: User clicks "Sign in with Google/GitHub" > Redirect to provider > Consent > Redirect back > Session created
- Account linking: If a user signs in with magic link first, then later uses OAuth with the same email, Supabase links the accounts automatically

**Not included:**

- Username/password: higher friction, requires password reset flow, users forget passwords
- Phone/SMS: adds cost (SMS fees), not worth the complexity for this audience
- Apple Sign-In: requires Apple Developer Program membership, can add later if iOS PWA adoption warrants it

### 4.2 Callsign Verification

After authentication, the user associates their amateur radio callsign with their account. This is critical for preventing impersonation -- callsigns are unique identifiers in the ham radio world, and operators take identity seriously.

**Verification flow:**

1. User enters their callsign in the profile setup (e.g., "N5XXX")
2. Client sends callsign to a Supabase Edge Function (`verify-callsign`)
3. Edge Function queries callook.info API (US callsigns) or falls back to QRZ XML API (international callsigns) to confirm:
   - The callsign is valid and currently licensed
   - The licensee name (returned by the API) is displayed for the user to confirm
4. On confirmation, the Edge Function writes `callsign` and `callsign_verified: true` to the `profiles` table
5. If the callsign is already claimed by another Supabase user, the verification fails with a clear error message: "This callsign is already associated with another Propulse account. If you believe this is an error, contact support."

**Edge cases:**

- Users with multiple callsigns (home call + vanity, club callsign): The profile supports one primary callsign. Aliases can be listed in the bio field. Multi-callsign support is deferred.
- Non-US callsigns: callook.info only covers US licenses. For international callsigns, verification falls back to QRZ XML lookup if available, or manual self-attestation with `callsign_verified: false`.
- Callsign changes (upgrade from Tech to Extra with new vanity call): User can update their callsign through the profile edit flow, which re-runs verification.

### 4.3 Anonymous / No-Account Mode

The app works fully without any Supabase account. All features that exist today continue to function locally. The Supabase client is initialized lazily -- it is not instantiated until the user explicitly signs in or creates an account. This means:

- No Supabase network requests for anonymous users
- No auth state to manage
- No session tokens in storage
- Zero cost to Supabase for users without accounts

### 4.4 Session Management

- **Storage:** Supabase stores the session (access_token + refresh_token) in localStorage under the key `sb-<project-ref>-auth-token`. This is Supabase's default behavior.
- **Auto-refresh:** The `@supabase/supabase-js` client automatically refreshes the access token before it expires, using the refresh token. No manual intervention needed.
- **Multi-tab:** Supabase's auth module uses `BroadcastChannel` to synchronize auth state across tabs. Signing out in one tab signs out all tabs.
- **Sign-out:** Clears the Supabase session from localStorage, invalidates the refresh token server-side, and resets `authStore` to its default (unauthenticated) state. Local data is preserved -- signing out does not delete the user's local logbook, preferences, or other data.

### 4.5 Client Library

- **`@supabase/supabase-js`** (v2.x): The core client library. Provides auth, database queries, storage, and realtime subscriptions.
- **No `@supabase/ssr`:** Propulse is a Vite SPA deployed to Vercel as static files. There is no server-side rendering. Cookie-based auth is not needed.
- **No separate `@supabase/realtime-js`:** Realtime is bundled with the core client.

---

## 5. Database Schema

All tables live in the `public` schema unless otherwise noted. The `auth` schema is managed by Supabase and not modified directly. Every table has Row-Level Security (RLS) enabled. UUIDs are generated client-side using `crypto.randomUUID()` to support offline creation.

### 5.1 Core User Tables

#### `profiles`

The canonical user profile. Created automatically via a database trigger when a new `auth.users` row is inserted.

| Column                | Type               | Constraints                               | Default                                               | Description                                                                                      |
| --------------------- | ------------------ | ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`                  | `uuid`             | PK, FK `auth.users(id)` ON DELETE CASCADE | --                                                    | Matches Supabase auth user ID                                                                    |
| `callsign`            | `text`             | UNIQUE, nullable                          | `null`                                                | Amateur radio callsign (e.g., "N5XXX")                                                           |
| `callsign_verified`   | `boolean`          | NOT NULL                                  | `false`                                               | Whether callsign has been verified via FCC/QRZ lookup                                            |
| `operator_name`       | `text`             | nullable                                  | `null`                                                | Operator's display name                                                                          |
| `bio`                 | `text`             | nullable, CHECK `length(bio) <= 500`      | `null`                                                | Free-text biography                                                                              |
| `avatar_url`          | `text`             | nullable                                  | `null`                                                | URL to avatar in Supabase Storage `avatars` bucket                                               |
| `grid`                | `text`             | nullable                                  | `null`                                                | Maidenhead grid square (4 or 6 characters)                                                       |
| `lat`                 | `double precision` | nullable                                  | `null`                                                | Latitude of primary QTH                                                                          |
| `lon`                 | `double precision` | nullable                                  | `null`                                                | Longitude of primary QTH                                                                         |
| `home_location_id`    | `text`             | nullable                                  | `null`                                                | ID of the home/primary OperatingLocation                                                         |
| `active_location_id`  | `text`             | nullable                                  | `null`                                                | ID of the currently active OperatingLocation                                                     |
| `timezone`            | `text`             | nullable                                  | `null`                                                | IANA timezone (e.g., "America/Chicago")                                                          |
| `license`             | `jsonb`            | nullable                                  | `null`                                                | `{ country, class, expirationDate, grantDate, licenseId }`                                       |
| `social_links`        | `jsonb`            | nullable                                  | `'[]'::jsonb`                                         | Array of `{ platform, url }` objects (QRZ, GitHub, Twitter, etc.)                                |
| `visibility_settings` | `jsonb`            | NOT NULL                                  | `'{"profile":"private","onlineStatus":false}'::jsonb` | Controls what others can see                                                                     |
| `stats_cache`         | `jsonb`            | nullable                                  | `null`                                                | Cached stats: `{ totalQsos, totalDxcc, totalCountries, favoriteBand, favoriteMode, lastActive }` |
| `created_at`          | `timestamptz`      | NOT NULL                                  | `now()`                                               | Row creation time                                                                                |
| `updated_at`          | `timestamptz`      | NOT NULL                                  | `now()`                                               | Last modification time                                                                           |

**Indexes:**

- `profiles_pkey` on `(id)` -- primary key
- `profiles_callsign_idx` UNIQUE on `(callsign)` WHERE `callsign IS NOT NULL`

**RLS Policies:**

- `profiles_select_own`: `SELECT` where `auth.uid() = id` -- users can always read their own profile
- `profiles_select_public`: `SELECT` where `visibility_settings->>'profile' = 'public'` -- anyone can read public profiles
- `profiles_select_friends`: `SELECT` where `visibility_settings->>'profile' = 'friends'` AND EXISTS a row in `follows` where `follower_id = auth.uid()` AND `following_id = profiles.id` -- friends can read friend-only profiles
- `profiles_update_own`: `UPDATE` where `auth.uid() = id` -- users can only update their own profile
- `profiles_insert_own`: `INSERT` where `auth.uid() = id` -- handled by trigger, but policy exists for safety

---

#### `saved_locations`

Operating locations (home, portable, POTA, SOTA, etc.) associated with a user profile.

| Column           | Type               | Constraints                                   | Default  | Description                                                 |
| ---------------- | ------------------ | --------------------------------------------- | -------- | ----------------------------------------------------------- |
| `id`             | `text`             | NOT NULL                                      | --       | Client-generated ID (matches OperatingLocation.id)          |
| `user_id`        | `uuid`             | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --       | Owner                                                       |
| `name`           | `text`             | NOT NULL                                      | --       | Friendly name (e.g., "Home", "POTA K-1234")                 |
| `grid`           | `text`             | NOT NULL                                      | --       | Maidenhead grid square                                      |
| `lat`            | `double precision` | NOT NULL                                      | --       | Latitude                                                    |
| `lon`            | `double precision` | NOT NULL                                      | --       | Longitude                                                   |
| `timezone`       | `text`             | nullable                                      | `null`   | IANA timezone                                               |
| `type`           | `text`             | NOT NULL                                      | `'home'` | One of: home, portable, mobile, pota, sota, fieldday, other |
| `activation_ref` | `text`             | nullable                                      | `null`   | Park/summit reference for POTA/SOTA                         |
| `created_at`     | `timestamptz`      | NOT NULL                                      | `now()`  | Row creation time                                           |

**Primary Key:** `(user_id, id)` -- composite key, allows client-generated IDs scoped to user

**RLS Policies:**

- `saved_locations_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `user_preferences`

A single row per user containing all application preferences as a JSONB blob. This avoids creating dozens of columns for individually tiny settings while keeping the sync payload small (~2KB).

| Column        | Type          | Constraints                             | Default       | Description                              |
| ------------- | ------------- | --------------------------------------- | ------------- | ---------------------------------------- |
| `user_id`     | `uuid`        | PK, FK `profiles(id)` ON DELETE CASCADE | --            | Owner                                    |
| `preferences` | `jsonb`       | NOT NULL                                | `'{}'::jsonb` | Full preferences blob (see schema below) |
| `version`     | `integer`     | NOT NULL                                | `1`           | Schema version for future migrations     |
| `updated_at`  | `timestamptz` | NOT NULL                                | `now()`       | Last modification time                   |

**Preferences JSONB schema** (matches `UserPreferences` TypeScript interface minus `station`, `radios`, `customRadios`, `activeRadioId`, `license` which are stored in dedicated tables):

```jsonc
{
  "units": "metric",
  "timeFormat": "24h",
  "theme": "dark",
  "ituRegion": "ITU2",
  "textScale": "md",
  "colorBlindMode": "none",
  "noiseEnvironment": "residential",
  "antennaType": "dipole",
  "preferTestedSpecs": true,
  "bridgeEnabled": false,
  "favoredBands": { "primary": ["20m", "40m"], "hidden": [] },
  "bandPresets": [],
  "notifications": {
    "greylineAlerts": false,
    "stormAlerts": false,
    "stormAlertKpThreshold": 5,
    "flareAlerts": false,
    "bandOpeningAlerts": false,
    "bandOpeningBands": [],
    "soundEnabled": true,
  },
  "spotClustering": { "enabled": true, "gridSize": 5, "minClusterSize": 3 },
  "compassRose": { "enabled": false, "beamWidth": 45, "showBeamWidth": true },
  "spotAge": { "enabled": true, "maxAgeMinutes": 30, "showAgeColumn": true },
  "watchAlerts": {
    "enabled": true,
    "muted": false,
    "volume": 50,
    "cooldownSeconds": 300,
    "callsignAlerts": true,
    "gridAlerts": true,
    "entityAlerts": true,
  },
  "uiInteraction": {
    "holdDurationMs": 2500,
    "flyoutAutoDismissMs": 2500,
    "flyoutAutoDismissEnabled": true,
    "showSpotCallsignLabels": true,
    "showSpotterLabels": false,
    "spotHitRadiusMultiplier": 1.0,
    "spotColorMode": "mode",
    "visualStyle": "realistic",
  },
  "forecastDisplay": {
    "bandMode": "common",
    "customBands": [],
    "showSnrValues": false,
    "detailedFooter": true,
    "hoursToShow": 13,
  },
}
```

**RLS Policies:**

- `user_preferences_all_own`: `ALL` where `auth.uid() = user_id`

---

### 5.2 Logbook Tables

#### `log_entries`

The most important table in the system. Stores the user's QSO logbook -- their permanent record of amateur radio contacts. This table will grow to tens of thousands of rows per active user. Schema mirrors the existing `LogEntry` TypeScript interface from `src/lib/db/types.ts`.

| Column              | Type               | Constraints                                   | Default | Description                                   |
| ------------------- | ------------------ | --------------------------------------------- | ------- | --------------------------------------------- |
| `id`                | `uuid`             | PK                                            | --      | Client-generated UUID (matches IndexedDB key) |
| `user_id`           | `uuid`             | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner                                         |
| `callsign`          | `text`             | NOT NULL                                      | --      | Contacted station callsign                    |
| `frequency`         | `double precision` | nullable                                      | `null`  | Frequency in kHz                              |
| `mode`              | `text`             | nullable                                      | `null`  | Operating mode (SSB, CW, FT8, etc.)           |
| `band`              | `text`             | nullable                                      | `null`  | Amateur band (20m, 40m, etc.)                 |
| `date`              | `text`             | NOT NULL                                      | --      | Contact date ISO format (YYYY-MM-DD)          |
| `time_on`           | `text`             | NOT NULL                                      | --      | Contact start time UTC (HH:MM)                |
| `time_off`          | `text`             | nullable                                      | `null`  | Contact end time UTC (HH:MM)                  |
| `rst_sent`          | `text`             | nullable                                      | `null`  | RST report sent (e.g., "599")                 |
| `rst_rcvd`          | `text`             | nullable                                      | `null`  | RST report received                           |
| `grid`              | `text`             | nullable                                      | `null`  | Contacted station's Maidenhead grid           |
| `name`              | `text`             | nullable                                      | `null`  | Contacted operator's name                     |
| `qth`               | `text`             | nullable                                      | `null`  | Contacted station's location                  |
| `notes`             | `text`             | nullable                                      | `null`  | Free-form notes                               |
| `qsl_sent`          | `text`             | nullable                                      | `null`  | QSL sent status: Y, N, R, I                   |
| `qsl_rcvd`          | `text`             | nullable                                      | `null`  | QSL received status: Y, N, R, I               |
| `lotw_status`       | `boolean`          | nullable                                      | `null`  | Confirmed via Logbook of The World            |
| `eqsl_status`       | `boolean`          | nullable                                      | `null`  | Confirmed via eQSL                            |
| `station_callsign`  | `text`             | nullable                                      | `null`  | Station callsign (log owner's call)           |
| `operator_callsign` | `text`             | nullable                                      | `null`  | Operator callsign (for guest logging)         |
| `is_guest_entry`    | `boolean`          | NOT NULL                                      | `false` | Whether this was logged by a guest operator   |
| `guest_session_id`  | `text`             | nullable                                      | `null`  | Groups guest entries by session               |
| `created_at`        | `timestamptz`      | NOT NULL                                      | `now()` | Record creation time                          |
| `updated_at`        | `timestamptz`      | NOT NULL                                      | `now()` | Last modification time                        |
| `deleted_at`        | `timestamptz`      | nullable                                      | `null`  | Soft delete timestamp (non-null = deleted)    |

**Indexes:**

- `log_entries_pkey` on `(id)`
- `log_entries_user_date_idx` on `(user_id, date DESC)` -- primary query pattern for logbook view
- `log_entries_user_callsign_idx` on `(user_id, callsign)` -- callsign search
- `log_entries_user_band_idx` on `(user_id, band)` -- band filtering
- `log_entries_user_updated_idx` on `(user_id, updated_at)` -- delta sync: "give me everything changed since X"
- `log_entries_user_deleted_idx` on `(user_id, deleted_at)` WHERE `deleted_at IS NOT NULL` -- partial index for propagating deletes

**RLS Policies:**

- `log_entries_all_own`: `ALL` where `auth.uid() = user_id`

**Cost notes:** This is the largest table and the primary driver of bandwidth usage. The `updated_at` index is the most important index in the entire schema -- it enables efficient delta sync by allowing the query `SELECT * FROM log_entries WHERE user_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT 100`. Without this index, every sync would require a full table scan.

---

### 5.3 Contest Tables

#### `contest_sessions`

Completed contest sessions. Active contests remain in local storage for latency reasons and are synced only after the session ends.

| Column              | Type          | Constraints                                   | Default | Description                                                              |
| ------------------- | ------------- | --------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| `id`                | `text`        | NOT NULL                                      | --      | Client-generated session ID                                              |
| `user_id`           | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner                                                                    |
| `contest_id`        | `text`        | NOT NULL                                      | --      | Reference to bundled contest definition                                  |
| `my_exchange`       | `text`        | NOT NULL                                      | --      | Operator's exchange (e.g., state, zone)                                  |
| `categories`        | `jsonb`       | NOT NULL                                      | --      | `{ operator, power, mode, band, overlay }`                               |
| `start_time`        | `timestamptz` | NOT NULL                                      | --      | Session start                                                            |
| `end_time`          | `timestamptz` | nullable                                      | `null`  | Session end (null = still active, but should not be synced while active) |
| `is_active`         | `boolean`     | NOT NULL                                      | `false` | Always false in Supabase (only completed sessions sync)                  |
| `current_serial`    | `integer`     | NOT NULL                                      | `0`     | Final serial number                                                      |
| `total_points`      | `integer`     | NOT NULL                                      | `0`     | Total QSO points                                                         |
| `total_multipliers` | `integer`     | NOT NULL                                      | `0`     | Total multipliers                                                        |
| `total_score`       | `integer`     | NOT NULL                                      | `0`     | Final computed score                                                     |
| `cabrillo_meta`     | `jsonb`       | nullable                                      | `null`  | `{ operatorName, email, club, location }`                                |
| `created_at`        | `timestamptz` | NOT NULL                                      | `now()` | Row creation time                                                        |
| `updated_at`        | `timestamptz` | NOT NULL                                      | `now()` | Last modification time                                                   |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `contest_sessions_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `contest_qsos`

Individual QSOs within a contest session. Synced as a batch when the parent session syncs.

| Column              | Type               | Constraints                                   | Default | Description                          |
| ------------------- | ------------------ | --------------------------------------------- | ------- | ------------------------------------ |
| `id`                | `text`             | NOT NULL                                      | --      | Client-generated QSO ID              |
| `session_id`        | `text`             | NOT NULL                                      | --      | Parent contest session ID            |
| `user_id`           | `uuid`             | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner (denormalized for RLS)         |
| `callsign`          | `text`             | NOT NULL                                      | --      | Contacted station                    |
| `frequency_khz`     | `double precision` | nullable                                      | `null`  | Frequency in kHz                     |
| `band`              | `text`             | NOT NULL                                      | --      | Amateur band                         |
| `mode`              | `text`             | NOT NULL                                      | --      | Operating mode                       |
| `rst_sent`          | `text`             | NOT NULL                                      | --      | RST sent                             |
| `rst_received`      | `text`             | NOT NULL                                      | --      | RST received                         |
| `exchange_sent`     | `text`             | NOT NULL                                      | --      | Contest exchange sent                |
| `exchange_received` | `text`             | NOT NULL                                      | --      | Contest exchange received            |
| `serial_sent`       | `integer`          | nullable                                      | `null`  | Serial number sent                   |
| `serial_received`   | `integer`          | nullable                                      | `null`  | Serial number received               |
| `timestamp`         | `timestamptz`      | NOT NULL                                      | --      | QSO timestamp                        |
| `is_dupe`           | `boolean`          | NOT NULL                                      | `false` | Whether this is a duplicate          |
| `points`            | `integer`          | NOT NULL                                      | `0`     | Point value of this QSO              |
| `is_multiplier`     | `boolean`          | NOT NULL                                      | `false` | Whether this QSO earned a multiplier |
| `multiplier_value`  | `text`             | nullable                                      | `null`  | Multiplier identifier if applicable  |
| `created_at`        | `timestamptz`      | NOT NULL                                      | `now()` | Row creation time                    |

**Primary Key:** `(user_id, session_id, id)`

**Indexes:**

- `contest_qsos_session_idx` on `(user_id, session_id)` -- fetch all QSOs for a session

**RLS Policies:**

- `contest_qsos_all_own`: `ALL` where `auth.uid() = user_id`

---

### 5.4 Equipment Tables

These tables implement the equipment inventory from the Shack Builder PRD (`PRD-SHACK-BUILDER.md`).

#### `user_radios`

Radio equipment instances owned by the user. References bundled radio database by `equipment_id` for factory specs, with optional per-instance overrides.

| Column             | Type          | Constraints                                   | Default | Description                                              |
| ------------------ | ------------- | --------------------------------------------- | ------- | -------------------------------------------------------- |
| `instance_id`      | `text`        | NOT NULL                                      | --      | Client-generated instance ID                             |
| `user_id`          | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner                                                    |
| `equipment_id`     | `text`        | NOT NULL                                      | --      | Reference to bundled RadioEquipment database or "custom" |
| `nickname`         | `text`        | nullable                                      | `null`  | User-assigned nickname                                   |
| `purchase_date`    | `text`        | nullable                                      | `null`  | ISO date of purchase                                     |
| `serial_number`    | `text`        | nullable                                      | `null`  | Device serial number                                     |
| `firmware_version` | `text`        | nullable                                      | `null`  | Current firmware version                                 |
| `tx_power_setting` | `integer`     | nullable                                      | `null`  | Configured TX power in watts                             |
| `notes`            | `text`        | nullable                                      | `null`  | Free-form notes                                          |
| `wiring`           | `text`        | nullable                                      | `null`  | Physical connection notes                                |
| `specs_override`   | `jsonb`       | nullable                                      | `null`  | User overrides for factory specs                         |
| `created_at`       | `timestamptz` | NOT NULL                                      | `now()` | Row creation time                                        |
| `updated_at`       | `timestamptz` | NOT NULL                                      | `now()` | Last modification time                                   |

**Primary Key:** `(user_id, instance_id)`

**RLS Policies:**

- `user_radios_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `antennas`

Antenna installations with real-world parameters for signal chain modeling.

| Column                | Type               | Constraints                                   | Default | Description                                             |
| --------------------- | ------------------ | --------------------------------------------- | ------- | ------------------------------------------------------- |
| `id`                  | `text`             | NOT NULL                                      | --      | Client-generated ID                                     |
| `user_id`             | `uuid`             | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner                                                   |
| `name`                | `text`             | NOT NULL                                      | --      | Antenna name (e.g., "20m 3-element Yagi")               |
| `type`                | `text`             | NOT NULL                                      | --      | Antenna type (dipole, vertical, yagi, etc.)             |
| `manufacturer`        | `text`             | nullable                                      | `null`  | Antenna manufacturer                                    |
| `bands`               | `text[]`           | NOT NULL                                      | `'{}'`  | Array of supported band strings                         |
| `height_agl`          | `double precision` | nullable                                      | `null`  | Height above ground in meters                           |
| `azimuth`             | `double precision` | nullable                                      | `null`  | Fixed azimuth for directional antennas (degrees)        |
| `gain_dbi`            | `double precision` | nullable                                      | `null`  | Specified gain in dBi                                   |
| `polarization`        | `text`             | nullable                                      | `null`  | horizontal, vertical, circular                          |
| `mounting`            | `text`             | nullable                                      | `null`  | tower, mast, roof, ground, portable                     |
| `feedpoint_impedance` | `double precision` | nullable                                      | `null`  | Feedpoint impedance in ohms                             |
| `swr_data`            | `jsonb`            | nullable                                      | `null`  | Per-band SWR measurements: `{ "20m": 1.5, "15m": 2.1 }` |
| `installation_date`   | `text`             | nullable                                      | `null`  | ISO date of installation                                |
| `notes`               | `text`             | nullable                                      | `null`  | Free-form notes                                         |
| `is_portable`         | `boolean`          | NOT NULL                                      | `false` | Whether this is a portable/field antenna                |
| `created_at`          | `timestamptz`      | NOT NULL                                      | `now()` | Row creation time                                       |
| `updated_at`          | `timestamptz`      | NOT NULL                                      | `now()` | Last modification time                                  |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `antennas_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `feedlines`

Feedline (coax, ladder line) inventory for loss calculations in the signal chain.

| Column              | Type               | Constraints                                   | Default  | Description                                               |
| ------------------- | ------------------ | --------------------------------------------- | -------- | --------------------------------------------------------- |
| `id`                | `text`             | NOT NULL                                      | --       | Client-generated ID                                       |
| `user_id`           | `uuid`             | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --       | Owner                                                     |
| `type`              | `text`             | NOT NULL                                      | --       | Feedline type (RG-213, LMR-400, RG-58, ladder line, etc.) |
| `length_meters`     | `double precision` | NOT NULL                                      | --       | Length in meters                                          |
| `connectors`        | `text`             | nullable                                      | `null`   | Connector types (PL-259, N, BNC)                          |
| `manufacturer`      | `text`             | nullable                                      | `null`   | Cable manufacturer                                        |
| `installation_date` | `text`             | nullable                                      | `null`   | ISO date                                                  |
| `condition`         | `text`             | nullable                                      | `'good'` | excellent, good, fair, poor                               |
| `notes`             | `text`             | nullable                                      | `null`   | Free-form notes                                           |
| `created_at`        | `timestamptz`      | NOT NULL                                      | `now()`  | Row creation time                                         |
| `updated_at`        | `timestamptz`      | NOT NULL                                      | `now()`  | Last modification time                                    |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `feedlines_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `accessories`

Amplifiers, tuners, filters, switches, power supplies, and grounding equipment.

| Column         | Type          | Constraints                                   | Default | Description                                                                        |
| -------------- | ------------- | --------------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `id`           | `text`        | NOT NULL                                      | --      | Client-generated ID                                                                |
| `user_id`      | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner                                                                              |
| `category`     | `text`        | NOT NULL                                      | --      | amplifier, tuner, filter, switch, psu, grounding                                   |
| `model`        | `text`        | NOT NULL                                      | --      | Model name/number                                                                  |
| `manufacturer` | `text`        | nullable                                      | `null`  | Manufacturer                                                                       |
| `specs`        | `jsonb`       | nullable                                      | `null`  | Category-specific specs (e.g., max power for amplifier, impedance range for tuner) |
| `bands`        | `text[]`      | NOT NULL                                      | `'{}'`  | Supported bands                                                                    |
| `notes`        | `text`        | nullable                                      | `null`  | Free-form notes                                                                    |
| `created_at`   | `timestamptz` | NOT NULL                                      | `now()` | Row creation time                                                                  |
| `updated_at`   | `timestamptz` | NOT NULL                                      | `now()` | Last modification time                                                             |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `accessories_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `station_presets`

Named equipment configurations linking a radio, antenna, feedline, and accessories into a complete signal chain.

| Column               | Type          | Constraints                                   | Default | Description                                                                 |
| -------------------- | ------------- | --------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| `id`                 | `text`        | NOT NULL                                      | --      | Client-generated ID                                                         |
| `user_id`            | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner                                                                       |
| `name`               | `text`        | NOT NULL                                      | --      | Preset name (e.g., "Home Contest Station")                                  |
| `description`        | `text`        | nullable                                      | `null`  | One-line description                                                        |
| `radio_instance_id`  | `text`        | nullable                                      | `null`  | FK to user_radios.instance_id (logical, not enforced as FK for flexibility) |
| `antenna_id`         | `text`        | nullable                                      | `null`  | FK to antennas.id (logical)                                                 |
| `feedline_id`        | `text`        | nullable                                      | `null`  | FK to feedlines.id (logical)                                                |
| `accessory_ids`      | `text[]`      | NOT NULL                                      | `'{}'`  | Array of accessory IDs in signal chain order                                |
| `linked_location_id` | `text`        | nullable                                      | `null`  | Associated operating location ID                                            |
| `is_active`          | `boolean`     | NOT NULL                                      | `false` | Whether this is the currently active preset                                 |
| `created_at`         | `timestamptz` | NOT NULL                                      | `now()` | Row creation time                                                           |
| `updated_at`         | `timestamptz` | NOT NULL                                      | `now()` | Last modification time                                                      |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `station_presets_all_own`: `ALL` where `auth.uid() = user_id`

---

### 5.5 Social Tables

#### `follows`

Friend/follow relationships between users. Follows are directional (A follows B does not imply B follows A). Mutual follows indicate friendship.

| Column         | Type          | Constraints                                   | Default | Description                 |
| -------------- | ------------- | --------------------------------------------- | ------- | --------------------------- |
| `follower_id`  | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | The user who is following   |
| `following_id` | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | The user being followed     |
| `created_at`   | `timestamptz` | NOT NULL                                      | `now()` | When the follow was created |

**Primary Key:** `(follower_id, following_id)` -- composite, also enforces uniqueness

**Indexes:**

- `follows_following_idx` on `(following_id)` -- "who follows me" query

**RLS Policies:**

- `follows_select_own`: `SELECT` where `auth.uid() = follower_id OR auth.uid() = following_id` -- users can see their own follow relationships
- `follows_insert_own`: `INSERT` where `auth.uid() = follower_id` -- users can only follow as themselves
- `follows_delete_own`: `DELETE` where `auth.uid() = follower_id` -- users can only unfollow their own follows

**Cost notes:** This is a tiny table. No realtime subscription needed. The client fetches follow counts and lists on profile view via standard queries.

---

#### `activity_feed`

Records notable events (achievements, milestones) for display on user profiles and in friend feeds. Write-only from server-side triggers/functions. Clients read paginated subsets.

| Column       | Type          | Constraints                                   | Default             | Description                                                                                         |
| ------------ | ------------- | --------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `id`         | `uuid`        | PK                                            | `gen_random_uuid()` | Auto-generated                                                                                      |
| `user_id`    | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --                  | The user who generated the event                                                                    |
| `event_type` | `text`        | NOT NULL                                      | --                  | Event category: achievement, milestone, qso_milestone, contest_result, new_band, new_mode, new_dxcc |
| `event_data` | `jsonb`       | NOT NULL                                      | --                  | Event-specific payload (e.g., `{ "achievement": "worked_100_dxcc", "count": 100 }`)                 |
| `created_at` | `timestamptz` | NOT NULL                                      | `now()`             | Event timestamp                                                                                     |

**Indexes:**

- `activity_feed_user_created_idx` on `(user_id, created_at DESC)` -- paginated feed query

**RLS Policies:**

- `activity_feed_select_own`: `SELECT` where `auth.uid() = user_id` -- always see own activity
- `activity_feed_select_public`: `SELECT` where the user_id's profile has `visibility_settings->>'profile' = 'public'`
- `activity_feed_select_friends`: `SELECT` where EXISTS a follow relationship from `auth.uid()` to `user_id` AND `visibility_settings->>'profile' IN ('public', 'friends')`
- `activity_feed_insert_service`: `INSERT` using service role only (not client-insertable)

**Retention:** A `pg_cron` job runs daily at 03:00 UTC to delete rows where `created_at < now() - interval '90 days'`. This prevents unbounded growth.

**Cost notes:** No realtime subscription. Clients fetch the feed paginated (20 items per page) when viewing a profile. Write volume is low -- a typical operator might generate 1-5 feed events per week (new achievement, contest completion, DXCC milestone).

---

### 5.6 Configuration Tables

#### `watches`

DX watch items. Mirrors the `WatchItem` interface from `watchStore.ts`. Only persisted data syncs -- transient runtime state (matches, seenSpotIds) stays local.

| Column           | Type          | Constraints                                   | Default | Description                                                                   |
| ---------------- | ------------- | --------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `id`             | `text`        | NOT NULL                                      | --      | Client-generated watch ID                                                     |
| `user_id`        | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner                                                                         |
| `type`           | `text`        | NOT NULL                                      | --      | grid, entity, callsign                                                        |
| `pattern`        | `text`        | NOT NULL                                      | --      | Pattern to match (normalized to uppercase)                                    |
| `name`           | `text`        | nullable                                      | `null`  | User-friendly label                                                           |
| `is_active`      | `boolean`     | NOT NULL                                      | `false` | Whether this watch has recent activity (local state, synced for cross-device) |
| `activity_count` | `integer`     | NOT NULL                                      | `0`     | Cumulative match count                                                        |
| `created_at`     | `timestamptz` | NOT NULL                                      | `now()` | Row creation time                                                             |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `watches_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `map_pins`

Saved globe locations/bookmarks. Mirrors the `MapPin` interface from `pinStore.ts`.

| Column       | Type               | Constraints                                   | Default    | Description                                 |
| ------------ | ------------------ | --------------------------------------------- | ---------- | ------------------------------------------- |
| `id`         | `text`             | NOT NULL                                      | --         | Client-generated pin ID                     |
| `user_id`    | `uuid`             | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --         | Owner                                       |
| `lat`        | `double precision` | NOT NULL                                      | --         | Latitude                                    |
| `lon`        | `double precision` | NOT NULL                                      | --         | Longitude                                   |
| `grid`       | `text`             | NOT NULL                                      | --         | Maidenhead grid                             |
| `name`       | `text`             | nullable                                      | `null`     | User label                                  |
| `color`      | `text`             | nullable                                      | `null`     | Hex color for marker                        |
| `category`   | `text`             | NOT NULL                                      | `'custom'` | dxpedition, friend, beacon, contest, custom |
| `notes`      | `text`             | nullable                                      | `null`     | Free-form notes                             |
| `expires_at` | `timestamptz`      | nullable                                      | `null`     | Expiration for DXpedition pins              |
| `created_at` | `timestamptz`      | NOT NULL                                      | `now()`    | Row creation time                           |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `map_pins_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `skeds`

QSO scheduling entries. Mirrors the `Sked` interface from `skedStore.ts`.

| Column                | Type               | Constraints                                   | Default       | Description                                                     |
| --------------------- | ------------------ | --------------------------------------------- | ------------- | --------------------------------------------------------------- |
| `id`                  | `text`             | NOT NULL                                      | --            | Client-generated sked ID                                        |
| `user_id`             | `uuid`             | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --            | Owner                                                           |
| `target_callsign`     | `text`             | NOT NULL                                      | --            | Target station callsign                                         |
| `target_lat`          | `double precision` | nullable                                      | `null`        | Target latitude                                                 |
| `target_lon`          | `double precision` | nullable                                      | `null`        | Target longitude                                                |
| `preferred_band`      | `text`             | NOT NULL                                      | --            | Preferred operating band                                        |
| `preferred_mode`      | `text`             | NOT NULL                                      | --            | Preferred operating mode                                        |
| `date_range`          | `jsonb`            | NOT NULL                                      | --            | `[startDate, endDate]` ISO date strings                         |
| `recommended_windows` | `jsonb`            | NOT NULL                                      | `'[]'::jsonb` | Array of `{ date, startHourUTC, endHourUTC, band, confidence }` |
| `status`              | `text`             | NOT NULL                                      | `'active'`    | active, worked, missed, cancelled                               |
| `notes`               | `text`             | nullable                                      | `null`        | Free-form notes                                                 |
| `reminder_fired`      | `boolean`          | NOT NULL                                      | `false`       | Whether reminder notification has been shown                    |
| `created_at`          | `timestamptz`      | NOT NULL                                      | `now()`       | Row creation time                                               |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `skeds_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `alert_rules`

DX alert rule definitions. Mirrors the `AlertRule` interface from `src/lib/db/types.ts`. Alert history stays local (24h transient data).

| Column         | Type          | Constraints                                   | Default | Description                                                     |
| -------------- | ------------- | --------------------------------------------- | ------- | --------------------------------------------------------------- |
| `id`           | `text`        | NOT NULL                                      | --      | Client-generated rule ID                                        |
| `user_id`      | `uuid`        | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner                                                           |
| `name`         | `text`        | NOT NULL                                      | --      | Human-readable rule name                                        |
| `enabled`      | `boolean`     | NOT NULL                                      | `true`  | Whether the rule is active                                      |
| `conditions`   | `jsonb`       | NOT NULL                                      | --      | `{ callsignPattern?, entityPattern?, bands?, modes?, minSnr? }` |
| `notification` | `jsonb`       | NOT NULL                                      | --      | `{ sound, browser, highlight }`                                 |
| `created_at`   | `timestamptz` | NOT NULL                                      | `now()` | Row creation time                                               |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `alert_rules_all_own`: `ALL` where `auth.uid() = user_id`

---

#### `saved_targets`

DX Wizard saved analysis targets. Currently stored in `userStore.savedTargets[]`. Small dataset (max 10 per user).

| Column       | Type               | Constraints                                   | Default | Description                |
| ------------ | ------------------ | --------------------------------------------- | ------- | -------------------------- |
| `id`         | `text`             | NOT NULL                                      | --      | Client-generated target ID |
| `user_id`    | `uuid`             | NOT NULL, FK `profiles(id)` ON DELETE CASCADE | --      | Owner                      |
| `callsign`   | `text`             | NOT NULL                                      | --      | Target callsign            |
| `grid`       | `text`             | nullable                                      | `null`  | Target grid square         |
| `lat`        | `double precision` | nullable                                      | `null`  | Target latitude            |
| `lon`        | `double precision` | nullable                                      | `null`  | Target longitude           |
| `name`       | `text`             | nullable                                      | `null`  | Target display name        |
| `created_at` | `timestamptz`      | NOT NULL                                      | `now()` | Row creation time          |

**Primary Key:** `(user_id, id)`

**RLS Policies:**

- `saved_targets_all_own`: `ALL` where `auth.uid() = user_id`

---

### 5.7 Storage Buckets

#### `avatars`

Profile photos. Public read access for profiles with `visibility_settings.profile = 'public'`.

- **Max file size:** 500KB
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`
- **Naming convention:** `{user_id}/avatar.{ext}` (one avatar per user, overwrites on change)
- **Access:** Public read for public profiles. Authenticated read for friends-only profiles. Owner read/write always.
- **Client processing:** Images are resized and compressed client-side to WebP (max 400x400px, quality 80%) before upload to minimize storage and egress.

#### `shack-photos`

Equipment photos for the Shack Builder page.

- **Max file size:** 2MB
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`
- **Naming convention:** `{user_id}/{equipment_type}/{item_id}/{filename}.{ext}`
- **Access:** Matches profile visibility settings. Owner read/write always.
- **Client processing:** Images are compressed client-side to WebP (max 1200px longest edge, quality 85%) before upload. Thumbnails (200x200) are generated client-side for gallery view.
- **Limits:** Max 20 photos per user to prevent storage abuse on free tier.

#### `share-cards`

Server-generated PNG images for profile and shack sharing cards (social media previews, QR code pages).

- **Max file size:** 1MB
- **Naming convention:** `{user_id}/{card_type}_{timestamp}.png`
- **Access:** Public read (share cards are meant to be shared via URL).
- **Retention:** Auto-delete after 7 days via `pg_cron` job. Cards are regenerated on demand.

---

### 5.8 Database Functions and Triggers

#### `handle_new_user()` -- Trigger Function

Fires on `INSERT` into `auth.users`. Creates a corresponding row in `profiles` with the user's ID.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, created_at, updated_at)
  VALUES (new.id, now(), now());

  INSERT INTO public.user_preferences (user_id, preferences, version, updated_at)
  VALUES (new.id, '{}'::jsonb, 1, now());

  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

#### `update_updated_at()` -- Trigger Function

Automatically sets `updated_at = now()` on any row update, for all tables that have an `updated_at` column. This ensures server-side timestamps are accurate even if the client forgets to set them.

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

Applied to: `profiles`, `user_preferences`, `log_entries`, `contest_sessions`, `user_radios`, `antennas`, `feedlines`, `accessories`, `station_presets`.

#### `update_profile_stats()` -- Periodic Function

Recomputes `profiles.stats_cache` from `log_entries` data. Invoked by `pg_cron` every 15 minutes (not on every QSO insert, to avoid per-row overhead). Also invoked manually by the `compute-achievements` Edge Function.

```sql
CREATE OR REPLACE FUNCTION public.update_profile_stats(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'totalQsos', COUNT(*),
    'totalDxcc', COUNT(DISTINCT
      CASE WHEN band IS NOT NULL THEN callsign END
    ),
    'favoriteBand', (
      SELECT band FROM public.log_entries
      WHERE user_id = target_user_id AND deleted_at IS NULL AND band IS NOT NULL
      GROUP BY band ORDER BY COUNT(*) DESC LIMIT 1
    ),
    'favoriteMode', (
      SELECT mode FROM public.log_entries
      WHERE user_id = target_user_id AND deleted_at IS NULL AND mode IS NOT NULL
      GROUP BY mode ORDER BY COUNT(*) DESC LIMIT 1
    ),
    'lastActive', MAX(created_at)
  ) INTO stats
  FROM public.log_entries
  WHERE user_id = target_user_id AND deleted_at IS NULL;

  UPDATE public.profiles
  SET stats_cache = stats, updated_at = now()
  WHERE id = target_user_id;
END;
$$;
```

#### `cleanup_activity_feed()` -- Cron Function

Deletes activity feed entries older than 90 days. Scheduled via `pg_cron` to run daily at 03:00 UTC.

```sql
SELECT cron.schedule(
  'cleanup-activity-feed',
  '0 3 * * *',
  $$DELETE FROM public.activity_feed WHERE created_at < now() - interval '90 days'$$
);
```

#### `cleanup_share_cards()` -- Cron Function

Deletes share card files older than 7 days from the `share-cards` storage bucket. Scheduled daily at 04:00 UTC.

---

## 6. Sync Architecture

This is the most critical section for cost management. Every design choice here directly affects Supabase egress charges.

### 6.1 Sync Tiers

Data is categorized into three tiers based on importance, size, and update frequency. Each tier has a distinct sync strategy optimized for its characteristics.

#### Tier 1 -- Eager Sync (Critical User Data)

**Data:** Profile, preferences, saved locations, saved targets

**Characteristics:** Small payloads (1-5KB each), infrequent changes, high cross-device value.

**Push strategy:**

- On change, start a 5-second debounce timer. If additional changes arrive within the window, the timer resets. When the timer fires, push the entire current state for the changed data type.
- Example: User changes time format, then text scale, then noise environment in quick succession. Only one push fires 5 seconds after the last change, containing all three updates.
- For preferences, the entire JSONB blob is pushed (not individual fields). At ~2KB, the overhead of sending the full blob is less than the complexity of field-level diffing.

**Pull strategy:**

- On app load (when authenticated), fetch current server state for all Tier 1 data in a single batch query.
- Compare server `updated_at` with local `updated_at`. If server is newer, merge server state into local. If local is newer, push local state to server.
- This single round-trip on app load costs approximately 5-10KB.

**Conflict resolution:** Last-write-wins using `updated_at` timestamps. The record with the more recent `updated_at` overwrites the other. Since preferences are a single JSONB blob, this means the entire preferences object from the winning side takes precedence -- there is no field-level merge.

**Bandwidth per sync event:** 2-5KB
**Estimated monthly bandwidth:** ~50KB (assumes 10 preference changes per day, 30 days)

---

#### Tier 2 -- Incremental Sync (Large Datasets)

**Data:** QSO logbook, completed contest sessions

**Characteristics:** Large total volume (potentially 50K+ records), frequent additions, rare edits, highest cross-device value.

**Push strategy (logbook):**

- New or modified `LogEntry` records are added to a local write queue.
- The queue is flushed in batches:
  - Every 30 seconds while the app is online and the queue has entries
  - Immediately on explicit "Sync Now" button press
  - On `visibilitychange` event when the page becomes hidden (browser tab switch or minimize) -- flush whatever is in the queue to prevent data loss if the user closes the tab
- Batch size: up to 100 entries per request. Each entry is approximately 500 bytes, so a full batch is approximately 50KB.
- The push is an `UPSERT` operation: `INSERT ... ON CONFLICT (id) DO UPDATE SET ...`. This handles both new entries and edits to existing entries.

**Pull strategy (logbook):**

- On app load, query: `SELECT * FROM log_entries WHERE user_id = $1 AND updated_at > $2 ORDER BY updated_at ASC LIMIT 100` where `$2` is the locally stored `lastSyncedAt` timestamp for log entries.
- If 100 records are returned (limit hit), there are more to fetch. Continue paginating with `updated_at > (last record's updated_at)` until fewer than 100 records are returned.
- Each fetched batch is merged into local IndexedDB. If a local record exists with the same ID, the one with the newer `updated_at` wins.
- Soft deletes: Records with `deleted_at IS NOT NULL` are flagged locally. The UI filters them out. They are not physically removed from local IndexedDB to allow undo/recovery.

**Push strategy (contest sessions):**

- Completed sessions are synced as a single batch: one `contest_sessions` row + all `contest_qsos` rows for that session.
- This happens once, when `endContest()` is called. Active contests are never synced mid-session.
- A typical contest session with 200 QSOs is approximately 100KB.

**Pull strategy (contest sessions):**

- On app load, fetch `contest_sessions` where `updated_at > lastSyncedAt`. For each new session, fetch its `contest_qsos`.
- Sessions are immutable after sync -- they are not edited once completed.

**Conflict resolution (logbook):** Per-entry last-write-wins using `updated_at`. If the same QSO is edited on two devices, the edit with the later `updated_at` wins. Soft deletes propagate via `deleted_at`: if one device deletes a QSO while another edits it, the delete wins only if its `updated_at` is later.

**Bandwidth estimates (logbook):**

- Per QSO entry (JSON): ~500 bytes
- Daily active operator, 50 QSOs/day push: 50 \* 500 = 25KB/day
- Daily pull (delta sync, typically 0-50 entries from other devices): 0-25KB/day
- Monthly (30 days, single device): ~750KB push + ~750KB pull = ~1.5MB
- Monthly (two devices, active sync): ~3MB total

**Bandwidth estimates (contest):**

- Average contest session: 150 QSOs \* 400 bytes = 60KB + 1KB session metadata = ~61KB
- 2 contests/month: ~122KB

---

#### Tier 3 -- Lazy Sync (Low-Priority Configuration)

**Data:** Watches, map pins, skeds, alert rules

**Characteristics:** Tiny payloads (<1KB each), infrequent changes, low cross-device urgency.

**Push strategy:**

- Sync occurs on explicit CRUD actions only. When the user adds, removes, or modifies a watch/pin/sked/alert rule, the change is pushed to Supabase immediately (no debounce needed -- these are intentional discrete actions, not continuous editing).
- Each push is a single row upsert or delete. Payload: 200-500 bytes.

**Pull strategy:**

- On app load, fetch all rows for each data type where `user_id = auth.uid()`. These are small datasets (max 10 watches, 20 pins, 20 skeds, 100 alert rules) so fetching all is cheaper than tracking deltas.
- Total pull on app load: approximately 10-30KB for all Tier 3 data combined.

**Conflict resolution:** Last-write-wins. Since these are discrete items (not large blobs), conflicts are rare. If two devices add the same watch, both copies exist. If two devices edit the same pin, the later edit wins.

**Bandwidth per CRUD operation:** 200-500 bytes
**Estimated monthly bandwidth:** ~10KB (assumes 20 CRUD operations per month across all Tier 3 data types)

---

### 6.2 Sync Engine Design

The sync engine is a centralized coordinator that manages all three tiers. It is implemented as a combination of a `SyncManager` class (for lifecycle and state management) and React hooks (for UI integration).

#### Core Components

**`SyncManager` class (`src/lib/sync/SyncManager.ts`)**

Singleton instance created at app startup. Responsible for:

- Tracking `lastSyncedAt` timestamps per data type in localStorage (key: `propulse-sync-meta`)
- Managing the write queue (in-memory array backed by localStorage for crash recovery)
- Scheduling sync operations based on tier strategies
- Handling online/offline transitions
- Retry logic for failed operations
- Exposing sync status to the UI

```typescript
interface SyncMeta {
  lastSyncedAt: {
    profile: string | null;
    preferences: string | null;
    locations: string | null;
    targets: string | null;
    logEntries: string | null;
    contestSessions: string | null;
    watches: string | null;
    pins: string | null;
    skeds: string | null;
    alertRules: string | null;
  };
}

interface SyncStatus {
  state: "idle" | "syncing" | "error" | "offline";
  pendingCount: number;
  lastSyncAt: string | null;
  error: string | null;
}

interface WriteQueueEntry {
  id: string;
  table: string;
  operation: "upsert" | "delete";
  data: Record<string, unknown>;
  timestamp: string;
  retryCount: number;
}
```

**Lifecycle:**

1. On app startup, if user is authenticated:
   - Load `SyncMeta` from localStorage
   - Begin initial pull for all tiers (Tier 1 + Tier 3 in parallel, Tier 2 starts after Tier 1 completes)
   - Flush any pending entries in the write queue (from a previous session that closed before flush)
   - Start the 30-second Tier 2 flush interval

2. On `navigator.onLine` change to `true`:
   - Flush the write queue
   - Resume periodic Tier 2 flush interval

3. On `navigator.onLine` change to `false`:
   - Pause all network operations
   - Update sync status to 'offline'
   - Continue accepting writes to the local queue

4. On `visibilitychange` (page hidden):
   - Flush the write queue immediately (best-effort, may not complete if tab is killed)

5. On sign-out:
   - Flush any remaining queue entries
   - Clear `SyncMeta` from localStorage
   - Stop all intervals

**Write queue persistence:**

The write queue is stored in localStorage under `propulse-sync-queue` as a JSON array. This ensures that if the browser crashes or the tab is killed mid-session, pending writes are not lost. On next app load, the queue is read from localStorage and flushed.

Maximum queue size: 500 entries. If the queue exceeds this (e.g., user is offline for an extended period and logging many QSOs), older entries are consolidated by keeping only the most recent version of each record (identified by `id` + `table`).

**Retry strategy:**

Failed sync operations are retried with exponential backoff:

| Retry # | Delay           | Cumulative Wait |
| ------- | --------------- | --------------- |
| 1       | 1 second        | 1 second        |
| 2       | 5 seconds       | 6 seconds       |
| 3       | 30 seconds      | 36 seconds      |
| 4       | 5 minutes       | ~5.5 minutes    |
| 5       | 30 minutes      | ~35.5 minutes   |
| 6-10    | 30 minutes each | ~3 hours total  |

After 10 failed retries, the entry is marked as `failed` in the queue and surfaced to the user in the sync status UI: "1 change failed to sync. [Retry] [Discard]".

**Online detection:**

Two signals are combined:

- `navigator.onLine` for basic connectivity detection
- Supabase client connection state (via `supabase.getChannels()` or a lightweight ping) for actual Supabase reachability

The app considers itself "online for sync" only when both signals indicate connectivity.

#### React Hooks

**`useSync()`** -- Master hook, called once in the app's root layout component.

- Initializes `SyncManager` if the user is authenticated
- Subscribes to auth state changes (start sync on sign-in, stop on sign-out)
- Subscribes to online/offline events
- Returns nothing (side-effect only hook)

**`useSyncStatus()`** -- Read-only hook for UI components.

- Returns `{ state, pendingCount, lastSyncAt, error }` from `SyncManager`
- Used by the sync status indicator in the header/footer
- Updates reactively via a Zustand-like subscription pattern

**`useAuth()`** -- Authentication hook.

- Returns `{ user, session, isAuthenticated, isLoading, signInWithMagicLink, signInWithOAuth, signOut }`
- Wraps `@supabase/supabase-js` auth methods
- Updates `authStore` on auth state changes

**`useProfile(callsign?)`** -- Profile data hook.

- Without argument: returns the authenticated user's own profile from local store
- With callsign argument: fetches another user's public profile from Supabase
- Returns `{ profile, isLoading, error }`

---

### 6.3 What We Do NOT Sync (Cost Savings Breakdown)

Each item below is explicitly excluded from Supabase sync, with the rationale for the decision.

| Data                                         | Storage Location                   | Why It Stays Local                                                                                                                                                                                               | Estimated Savings                                |
| -------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **DXCC tracking** (`propulse-dxcc`)          | localStorage                       | Computed from logbook. `workedEntries`, `workedEntityIds`, `confirmedEntityIds` can be recomputed from `log_entries` on any device. Syncing it would be pure redundancy.                                         | ~50KB/month avoided                              |
| **API cache** (`propulse-api-cache`)         | IndexedDB                          | Cached NOAA/SWPC responses with TTLs. Re-fetched from public APIs. No user data.                                                                                                                                 | ~500KB/month avoided                             |
| **Solar/spot data**                          | TanStack Query cache               | Real-time data from DXHeat, SWPC, NOAA. Ephemeral, re-fetched every 30-300 seconds.                                                                                                                              | ~5MB/month avoided                               |
| **Rig/WSJT-X state**                         | In-memory (rigStore, wsjtxStore)   | Real-time hardware connection state. Meaningless on another device.                                                                                                                                              | N/A (not persisted)                              |
| **Contest UI state** (`propulse-contest-ui`) | localStorage                       | Dock tabs, drafts, spot prefill preferences. Device-specific layout.                                                                                                                                             | <1KB avoided                                     |
| **Guest sessions**                           | sessionStorage + localStorage      | Ephemeral per-tab data for guest operators.                                                                                                                                                                      | <1KB avoided                                     |
| **Alert history** (`propulse-alerts`)        | IndexedDB + localStorage           | 24-hour transient notification log. Automatically pruned.                                                                                                                                                        | ~10KB/month avoided                              |
| **Call history** (`propulse-call-history`)   | localStorage                       | Contest exchange prefill cache. Device-specific workflow optimization.                                                                                                                                           | <1KB avoided                                     |
| **Undo stack**                               | In-memory (undoStore)              | Session-only operation history. Meaningless across devices.                                                                                                                                                      | N/A (not persisted)                              |
| **Layout** (`propulse-layout`)               | localStorage                       | Dashboard panel arrangement. Device-specific -- a phone layout should not overwrite a desktop layout.                                                                                                            | <1KB avoided                                     |
| **Map UI state**                             | localStorage (multiple keys)       | Time scenarios, recent targets, panel states, label options, map style. Device-specific view preferences.                                                                                                        | <5KB avoided                                     |
| **Theme**                                    | localStorage (`propulse-theme`)    | 4 fields (mode, accent, font, radius). Included in `user_preferences` JSONB blob as part of Tier 1 sync. Not synced separately.                                                                                  | 0 (included in preferences)                      |
| **Encrypted credentials**                    | IndexedDB (`propulse-credentials`) | LoTW, eQSL, ClubLog passwords encrypted with AES-256-GCM. The encryption key is derived from browser-specific entropy. Syncing would break the security model.                                                   | Critical security boundary                       |
| **QSL sync queue** (`propulse-sync-queue`)   | localStorage                       | Retry queue for failed QSL uploads to LoTW/eQSL. Transient operational state.                                                                                                                                    | <5KB avoided                                     |
| **Onboarding flag**                          | localStorage                       | Whether the user has seen the onboarding wizard. Device-specific.                                                                                                                                                | ~20 bytes                                        |
| **Static bundled data**                      | JS bundle                          | DXCC entities, band plans, contest definitions, radio database, Sherwood data, counties, prefixes, satellites, world/US geo boundaries. ~23,600 lines of JS. Bundled at build time. Never fetched from Supabase. | ~2MB/month avoided per user if this were fetched |

**Total estimated savings vs. a naive "sync everything" approach:** ~8MB/month per active user. At scale (10,000 users), this is 80GB/month of avoided egress -- the difference between staying on the Supabase Pro plan and needing the Team plan.

---

### 6.4 Bandwidth Budget

Detailed monthly bandwidth estimate for a typical active operator (logs 50 QSOs/day, 2 contests/month, uses 2 devices).

#### Egress (Supabase to Client)

| Data Type           | Pull Frequency      | Payload per Pull      | Pulls/Month       | Monthly Egress        |
| ------------------- | ------------------- | --------------------- | ----------------- | --------------------- |
| Profile             | App load            | 1KB                   | 60 (2x/day \* 30) | 60KB                  |
| Preferences         | App load            | 2KB                   | 60                | 120KB                 |
| Saved locations     | App load            | 1KB                   | 60                | 60KB                  |
| Saved targets       | App load            | 0.5KB                 | 60                | 30KB                  |
| Logbook delta       | App load + periodic | 25KB avg (50 entries) | 60                | 1,500KB               |
| Contest sessions    | App load            | 61KB (150 QSOs)       | 2                 | 122KB                 |
| Watches             | App load            | 1KB                   | 60                | 60KB                  |
| Pins                | App load            | 2KB                   | 60                | 120KB                 |
| Skeds               | App load            | 1KB                   | 60                | 60KB                  |
| Alert rules         | App load            | 2KB                   | 60                | 120KB                 |
| Photos (thumbnails) | Profile view        | 50KB                  | 4                 | 200KB                 |
| **Subtotal egress** |                     |                       |                   | **~2,452KB (~2.4MB)** |

#### Ingress (Client to Supabase)

| Data Type            | Push Frequency        | Payload per Push      | Pushes/Month | Monthly Ingress       |
| -------------------- | --------------------- | --------------------- | ------------ | --------------------- |
| Profile              | On edit (debounced)   | 1KB                   | 10           | 10KB                  |
| Preferences          | On change (debounced) | 2KB                   | 30           | 60KB                  |
| Saved locations      | On CRUD               | 0.5KB                 | 5            | 2.5KB                 |
| Saved targets        | On CRUD               | 0.3KB                 | 10           | 3KB                   |
| Logbook entries      | Batch (30s interval)  | 25KB (50 entries max) | 60           | 1,500KB               |
| Contest sessions     | On end                | 61KB                  | 2            | 122KB                 |
| Watches              | On CRUD               | 0.3KB                 | 5            | 1.5KB                 |
| Pins                 | On CRUD               | 0.3KB                 | 5            | 1.5KB                 |
| Skeds                | On CRUD               | 0.5KB                 | 5            | 2.5KB                 |
| Alert rules          | On CRUD               | 0.5KB                 | 5            | 2.5KB                 |
| Photos (uploads)     | On upload             | 500KB (compressed)    | 2            | 1,000KB               |
| **Subtotal ingress** |                       |                       |              | **~2,705KB (~2.6MB)** |

#### Total Monthly Bandwidth Per Active User

| Direction | Amount     |
| --------- | ---------- |
| Egress    | ~2.4MB     |
| Ingress   | ~2.6MB     |
| **Total** | **~5.0MB** |

#### Scaling Projections

| Plan | Monthly Cost | Included Egress | Max Active Users (at ~2.4MB egress/user) | Effective Cost per User |
| ---- | ------------ | --------------- | ---------------------------------------- | ----------------------- |
| Free | $0           | 2GB             | ~830                                     | $0                      |
| Pro  | $25/month    | 250GB           | ~104,000                                 | $0.00024                |
| Team | $599/month   | 250GB + custom  | 104,000+                                 | varies                  |

The free tier comfortably supports the first 800 active users. The Pro tier at $25/month supports over 100,000 active users before additional egress charges apply ($0.09/GB beyond 250GB). This provides enormous runway.

**Conservative estimate at 1,000 active users:** 1,000 \* 2.4MB = 2.4GB egress/month. Well within the Pro tier's 250GB allowance.

**Aggressive estimate at 10,000 active users:** 10,000 \* 2.4MB = 24GB egress/month. Still only 10% of the Pro tier's allowance.

---

### 6.5 Realtime Subscriptions (Use Sparingly)

Supabase Realtime costs scale with connection-hours and messages delivered. Each active Realtime channel consumes server resources and generates egress for every message broadcast. This section defines the strict boundary of what uses Realtime and what does not.

#### Uses Realtime: Online Status (Supabase Presence)

**Feature:** When viewing a friend's profile or the friends list, show whether they are currently online in Propulse.

**Implementation:** Supabase Presence (built on Realtime channels). The client joins a presence channel scoped to the user's friend list. Each client tracks its own state (online/away/offline) in the channel. The server broadcasts presence updates to channel subscribers.

**Cost controls:**

- The Presence channel is joined only when the user navigates to a view that shows friend status (profile page, friends list). It is unsubscribed immediately on navigate away.
- The channel uses a topic like `online-status:{user_id}` scoped per user, not a global channel.
- Presence heartbeat interval: 30 seconds (Supabase default). Each heartbeat is ~200 bytes.
- Maximum friends list size: 100 follows. Even at 100 concurrent friends all online, the Presence payload is ~20KB per heartbeat.

**Estimated Realtime cost:**

- Average session viewing friends list: 2 minutes/day
- Heartbeats per session: 4
- Payload per heartbeat: ~5KB (for a typical friends list)
- Monthly: 30 days _ 4 heartbeats _ 5KB = 600KB -- negligible.

#### Does NOT Use Realtime: Everything Else

| Feature                           | Why Not Realtime                                       | Alternative                                 |
| --------------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| Logbook sync                      | Too expensive to broadcast every QSO to other devices. | Pull-on-load + periodic batch push (Tier 2) |
| Preferences sync                  | Changes are infrequent (a few per day).                | Debounced push + pull-on-load (Tier 1)      |
| Equipment sync                    | Edited rarely.                                         | Push-on-save + pull-on-load (Tier 1)        |
| Activity feed                     | Not time-critical.                                     | Pull-on-profile-view (paginated query)      |
| Follow changes                    | Not time-critical.                                     | Pull-on-profile-view                        |
| Contest sync                      | Only on session end.                                   | Single batch push (Tier 2)                  |
| Config sync (watches, pins, etc.) | Tiny, infrequent changes.                              | Push-on-CRUD + pull-on-load (Tier 3)        |
| DX spots                          | Already fetched via TanStack Query from DXHeat API.    | Existing polling mechanism                  |
| Solar data                        | Already fetched via TanStack Query from NOAA/SWPC.     | Existing polling mechanism                  |

**This single decision -- limiting Realtime to only online status -- is the most impactful cost optimization in the entire architecture.** A naive implementation that used Realtime channels for logbook sync across devices could easily consume 10-50x more bandwidth than the pull-based approach.

---

## 7. Migration Strategy

### 7.1 For Existing Users (Local Data, No Supabase Account)

These users have been using Propulse with all data in localStorage/IndexedDB. When they create a Supabase account, their local data needs to be uploaded to the cloud.

**Principle:** Local data is authoritative during migration. If the upload fails partway through, it can be resumed from a checkpoint. No local data is deleted during or after migration.

**Migration flow:**

1. **User creates account** (magic link or OAuth). `authStore` receives the session. `SyncManager` initializes.

2. **Profile upload** (immediate, ~2KB):
   - Read `userStore.station`, `userStore.preferences.license`, `userStore.savedTargets` from local state
   - Transform to `profiles` row and `saved_locations` rows
   - Upsert to Supabase
   - On success, update `SyncMeta.lastSyncedAt.profile`

3. **Preferences upload** (immediate, ~2KB):
   - Read `userStore.preferences` (minus station/radios/customRadios/license which go to other tables)
   - Read `themeStore` state and merge into preferences JSONB
   - Upsert to `user_preferences` table
   - On success, update `SyncMeta.lastSyncedAt.preferences`

4. **Equipment upload** (immediate, ~5-50KB depending on collection size):
   - Read `userStore.preferences.radios[]` and `userStore.preferences.customRadios[]`
   - Transform `UserRadio[]` to `user_radios` rows
   - Insert to Supabase
   - On success, update `SyncMeta`

5. **Config upload** (immediate, ~5KB total):
   - Watches from `watchStore.watches[]` -> `watches` table
   - Pins from `pinStore.pins[]` -> `map_pins` table
   - Skeds from `skedStore.skeds[]` -> `skeds` table
   - Alert rules from IndexedDB `alertRules` store -> `alert_rules` table
   - Saved targets from `userStore.savedTargets[]` -> `saved_targets` table
   - Each is a small batch upsert

6. **Logbook upload** (background, potentially large):
   - Read total count of `logEntries` from IndexedDB
   - Display a progress indicator: "Uploading logbook: 0 / 12,345 entries"
   - Paginate through IndexedDB entries in batches of 100
   - For each batch: transform `LogEntry[]` to `log_entries` rows, upsert to Supabase
   - Update progress indicator after each batch
   - On each batch success, update `SyncMeta.lastSyncedAt.logEntries` to the latest `updatedAt` in the batch
   - If a batch fails, retry with backoff. Resume from the last successful `lastSyncedAt` checkpoint.
   - On full completion, show "Logbook uploaded successfully" toast

7. **Contest upload** (background, after logbook):
   - Read `contestStore.sessionHistory[]` (max 10 sessions)
   - Upload each session + its QSOs as a batch
   - Active session (if any) is not uploaded

**Bandwidth for initial migration (typical user with 5,000 QSOs):**

- Steps 1-5: ~15KB
- Step 6: 5,000 entries \* 500 bytes = ~2.5MB
- Step 7: ~200KB (2 past contest sessions)
- Total: ~2.7MB one-time upload

**Bandwidth for initial migration (power user with 50,000 QSOs):**

- Steps 1-5: ~15KB
- Step 6: 50,000 entries \* 500 bytes = ~25MB (uploaded in 500 batches of 100)
- Step 7: ~1MB (10 past contest sessions)
- Total: ~26MB one-time upload
- At 50KB per batch and a 100ms network round-trip, this takes approximately 50 seconds to complete.

### 7.2 For New Users

New users who install Propulse after the migration have two paths:

**Path A: No account (same as today)**

- App works locally. No Supabase interaction. All data in localStorage/IndexedDB.
- User can create an account at any time, triggering the migration flow from section 7.1.

**Path B: Create account during onboarding**

- Sign up with magic link or OAuth during the onboarding wizard.
- Profile fields entered during onboarding are written to both local storage and Supabase simultaneously.
- From this point forward, incremental sync is active for all tiers.
- Local storage mirrors Supabase data for offline use.

### 7.3 Store Refactoring

The current `userStore.ts` (1,608 lines, persistence key `propulse-user`, version 14) is a monolithic store that contains station identity, preferences, equipment, targets, and license data all in a single `UserPreferences` interface. This must be decomposed to align with the Supabase table structure and enable independent sync per data type.

**Current state:**

```
userStore (propulse-user, v14)
├── station (callsign, grid, locations, name)
├── preferences
│   ├── units, timeFormat, theme, ituRegion, textScale, colorBlindMode
│   ├── noiseEnvironment, antennaType, bridgeEnabled, preferTestedSpecs
│   ├── favoredBands, bandPresets, notifications, spotClustering
│   ├── compassRose, spotAge, watchAlerts, uiInteraction, forecastDisplay
│   ├── license (country, class, expiration, grant, id)
│   ├── radios[] (UserRadio instances)
│   ├── customRadios[] (RadioEquipment definitions)
│   └── activeRadioId
└── savedTargets[]
```

**Target state (after decomposition):**

```
profileStore (propulse-profile, v1) -> syncs with profiles + saved_locations tables
├── callsign, operatorName, bio, avatarUrl
├── grid, lat, lon, timezone
├── homeLocationId, activeLocationId
├── savedLocations[]
├── license
├── socialLinks[], visibilitySettings
└── statsCache

settingsStore (propulse-settings, v1) -> syncs with user_preferences table
├── units, timeFormat, theme, ituRegion, textScale, colorBlindMode
├── noiseEnvironment, antennaType, bridgeEnabled, preferTestedSpecs
├── favoredBands, bandPresets, notifications, spotClustering
├── compassRose, spotAge, watchAlerts, uiInteraction, forecastDisplay
└── (all current UserPreferences fields minus station/radios/license)

shackStore (propulse-shack, v1) -> syncs with user_radios, antennas, feedlines, accessories, station_presets tables
├── radios[] (migrated from userStore.preferences.radios)
├── customRadios[] (migrated from userStore.preferences.customRadios)
├── activeRadioId (migrated from userStore.preferences.activeRadioId)
├── antennas[] (new)
├── feedlines[] (new)
├── accessories[] (new)
└── stationPresets[] (new)

authStore (propulse-auth, v1) -> manages Supabase session
├── user (Supabase User object or null)
├── session (Supabase Session or null)
├── isAuthenticated
├── isLoading
└── syncStatus { state, pendingCount, lastSyncAt, error }
```

**Migration path (userStore v14 -> v15 decomposition):**

When the app loads and detects `propulse-user` at version 14:

1. Read the full v14 state
2. Extract `station` + `license` + `savedTargets` -> write to `propulse-profile` v1
3. Extract `preferences` (minus radios/customRadios/activeRadioId/license) -> write to `propulse-settings` v1
4. Extract `preferences.radios` + `preferences.customRadios` + `preferences.activeRadioId` -> write to `propulse-shack` v1
5. Bump `propulse-user` to v15 and mark it as "migrated" (the data remains as a fallback but is no longer the source of truth)
6. All new reads come from the decomposed stores

The migration runs synchronously during store hydration, before the first render. It is a one-time operation that takes <10ms (pure localStorage read/write, no network).

**Backward compatibility:** During the transition period, `userStore` v15 exists as a read-only compatibility shim. Any code that still imports from `userStore` gets redirected to the appropriate decomposed store. This allows incremental migration of consumer components without a big-bang refactor.

---

## 8. Supabase Project Configuration

### 8.1 Environment

- **Project region:** `us-east-1` (US East, Virginia). The majority of ham radio operators using Propulse are US-based. This minimizes latency for the primary user base. International users experience slightly higher latency (~100-200ms) but the local-first architecture makes this invisible for normal usage.
- **Plan:** Start with Free tier during development and initial launch. Upgrade to Pro ($25/month) when approaching free tier limits (500MB database, 1GB storage, 2GB egress, 50,000 monthly active users).
- **Database:** PostgreSQL 15 (Supabase default). No custom extensions required beyond `pg_cron` (included in Pro tier).

### 8.2 Environment Variables

Added to `.env` and `.env.production` (safe for client-side exposure):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  # Public anon key (safe for client)
```

The `anon` key is intentionally public. It provides unauthenticated access to the database, but every table has RLS policies that restrict access to the authenticated user's own data. The `anon` key alone cannot read or write any data without a valid JWT from authentication.

The **service role key** is never stored in client-side code or environment variables. It is used only in Supabase Edge Functions and the Supabase dashboard. It bypasses RLS and must be treated as a secret.

### 8.3 Row-Level Security (RLS)

Every table has RLS enabled. The base policy pattern for user-owned data:

```sql
-- Enable RLS
ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY;

-- Base policy: users can only access their own data
CREATE POLICY "{table_name}_all_own" ON public.{table_name}
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Special policies for `profiles` table (supports public and friends-only visibility):

```sql
-- Anyone can read public profiles
CREATE POLICY "profiles_select_public" ON public.profiles
  FOR SELECT
  USING (visibility_settings->>'profile' = 'public');

-- Friends can read friends-only profiles
CREATE POLICY "profiles_select_friends" ON public.profiles
  FOR SELECT
  USING (
    visibility_settings->>'profile' = 'friends'
    AND EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid()
      AND following_id = profiles.id
    )
  );

-- Users always read/update their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

### 8.4 Edge Functions

#### `verify-callsign`

Verifies a callsign against the FCC ULS database (via callook.info) or QRZ XML API.

- **Trigger:** Called by the client when the user sets or changes their callsign.
- **Input:** `{ callsign: string }`
- **Logic:**
  1. Normalize callsign (uppercase, trim)
  2. Check if callsign is already claimed by another user in `profiles` table
  3. Query callook.info API: `https://callook.info/{callsign}/json`
  4. If callook returns a valid license: extract licensee name, license class, expiration date
  5. If callook returns nothing (non-US callsign): attempt QRZ XML lookup as fallback
  6. Return `{ valid: boolean, name?: string, class?: string, expiration?: string, error?: string }`
- **The client displays the result and asks the user to confirm before writing to the profile.**
- **Rate limit:** 10 requests per minute per user (to prevent abuse).

#### `compute-achievements`

Analyzes a user's logbook data and generates achievement badges. Runs on a schedule (not per-QSO).

- **Trigger:** `pg_cron` job every 6 hours. Also callable on-demand from the client (with rate limiting).
- **Logic:**
  1. For each user with `updated_at` on `log_entries` newer than last achievement computation:
  2. Query aggregate stats: total QSOs, unique DXCC entities, unique grids, band/mode distribution
  3. Check against achievement thresholds (e.g., "First 100 QSOs", "Worked 50 DXCC", "All HF Bands")
  4. Insert new achievements into `activity_feed` table
  5. Update `profiles.stats_cache` via `update_profile_stats()` function
- **Achievement definitions are hardcoded in the Edge Function (not in the database).** This keeps the logic simple and avoids another table.
- **Cost:** Runs 4 times/day. Each run processes only users with new logbook data. Typical computation: <1 second per user, <100 database queries per user.

#### `generate-share-card`

Server-side PNG generation for profile and shack sharing cards.

- **Trigger:** Called by the client when the user clicks "Generate Share Card."
- **Input:** `{ type: 'profile' | 'shack', user_id: string }`
- **Logic:**
  1. Fetch the user's profile and relevant data
  2. Render a pre-designed HTML template with the user's data
  3. Convert to PNG using a headless rendering library (e.g., `@vercel/og`-style Satori + resvg-js)
  4. Upload to `share-cards` storage bucket
  5. Return the public URL
- **Rate limit:** 5 cards per hour per user.

#### `cleanup-feed`

Deletes activity feed entries and share card files past their retention period.

- **Trigger:** `pg_cron` daily at 03:00 UTC.
- **Logic:**
  1. `DELETE FROM activity_feed WHERE created_at < now() - interval '90 days'`
  2. List and delete files in `share-cards` bucket older than 7 days

---

## 9. Client-Side Architecture

### 9.1 Package Dependencies

| Package                 | Version | Purpose                                        |
| ----------------------- | ------- | ---------------------------------------------- |
| `@supabase/supabase-js` | ^2.x    | Core client: auth, database, storage, realtime |

No additional Supabase packages are needed. The core client includes everything required for an SPA.

### 9.2 Client Initialization

A single Supabase client instance is created at app startup in `src/lib/supabase/client.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true, // Required for magic link redirect
        },
      })
    : null;
```

**Lazy initialization:** If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are not set (e.g., local development without Supabase), the client is `null` and all sync operations are no-ops. The app functions fully in local-only mode.

**Auth state listener:** On client creation, an auth state listener is registered that updates `authStore`:

```typescript
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    useAuthStore.getState().setSession(session);
    if (event === "SIGNED_IN") {
      SyncManager.getInstance().start();
    }
    if (event === "SIGNED_OUT") {
      SyncManager.getInstance().stop();
    }
  });
}
```

### 9.3 Sync Hooks

Detailed in section 6.2. Summary of the hook API:

```typescript
// Root layout component
function AppLayout() {
  useSync(); // Initializes sync engine, handles lifecycle
  return <Outlet />;
}

// Header sync indicator
function SyncIndicator() {
  const { state, pendingCount, lastSyncAt } = useSyncStatus();
  // Renders: "Synced" | "Syncing..." | "3 pending" | "Offline"
}

// Auth-gated components
function AccountButton() {
  const { user, isAuthenticated, signOut } = useAuth();
  // Renders sign-in button or user avatar with dropdown
}

// Profile page
function ProfilePage({ callsign }: { callsign?: string }) {
  const { profile, isLoading } = useProfile(callsign);
  // Renders own profile or another user's public profile
}
```

### 9.4 Offline Queue

The offline queue is the critical bridge between local writes and cloud sync. It ensures no data is lost even if the user goes offline for hours or days.

**Queue structure:**

```typescript
interface QueueEntry {
  id: string; // UUID for this queue entry
  table: string; // Supabase table name
  operation: "upsert" | "delete"; // Operation type
  data: Record<string, unknown>; // Row data for upsert, or { id } for delete
  timestamp: string; // ISO timestamp of when the write occurred
  retryCount: number; // Number of failed attempts
  status: "pending" | "failed"; // Entry status
}
```

**Queue operations:**

- **Enqueue:** Called by each store's write actions (e.g., `logStore.addEntry()` adds an entry to the queue after writing to IndexedDB).
- **Flush:** Called by `SyncManager` on interval (every 30 seconds for Tier 2) or on demand.
- **Dequeue:** Entries are removed from the queue only after successful server acknowledgment.
- **Consolidate:** Before flush, entries for the same `(table, id)` pair are merged -- only the most recent version is sent. This deduplicates rapid edits to the same record.

**Persistence:**

The queue is backed by localStorage under `propulse-sync-queue`. On every enqueue/dequeue, the queue is serialized to localStorage. This survives page refresh, tab close, and browser restart. The maximum serialized size is capped at 200KB (approximately 400 entries). If the queue exceeds this, a warning is shown to the user: "Sync queue is full. Please connect to the internet to sync your data."

**Retry behavior:**

Documented in section 6.2. After 10 failed retries, entries are marked `status: 'failed'` and the user is prompted to retry or discard.

---

## 10. Security & Privacy

### 10.1 Data Classification

| Classification                      | Description                                       | Examples                                                                         | Protection                                                                                                 |
| ----------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Private (encrypted client-side)** | Data that must never leave the device in any form | QSL service credentials (LoTW, eQSL, ClubLog passwords)                          | AES-256-GCM in IndexedDB. Key derived from browser entropy. Never sent to Supabase.                        |
| **Private (server-side)**           | Data owned by the user, protected by RLS          | Logbook, contest data, equipment, preferences, watches, pins, skeds, alert rules | Supabase RLS: `auth.uid() = user_id`. Only the owner can read/write.                                       |
| **Selectively public**              | Data the user can choose to share                 | Profile, achievements, shack configuration                                       | Controlled by `visibility_settings` JSONB on `profiles`. Options: private (default), friends-only, public. |
| **Public**                          | Data visible to all authenticated users           | Online status (opt-in)                                                           | Only exposed when `visibility_settings.onlineStatus = true`. Uses Supabase Presence.                       |

### 10.2 Credential Handling

**Supabase anon key:**

- Embedded in the client-side bundle via `VITE_SUPABASE_ANON_KEY`
- Safe to expose: it provides no access beyond what RLS policies allow
- Cannot read any data without a valid user JWT

**Supabase service role key:**

- Used only in Edge Functions (server-side)
- Never stored in client-side code, environment variables, or Git
- Configured in the Supabase dashboard under Edge Function secrets
- Bypasses RLS -- used for administrative operations (trigger functions, cron jobs)

**QSL service credentials:**

- Stored in IndexedDB `propulse-credentials` store
- Encrypted with AES-256-GCM
- The encryption key is derived from `crypto.subtle.generateKey()` and stored in IndexedDB (tied to the browser/device)
- This means credentials cannot be decrypted on another device, even if IndexedDB data were somehow transferred
- Future enhancement: optional Supabase Vault integration for cross-device credential sync (separate feature, separate PRD)

**JWT tokens:**

- Stored in localStorage by Supabase's default auth module
- Auto-refreshed before expiry
- Cleared on sign-out (both client-side and server-side invalidation)

### 10.3 GDPR / Data Privacy

**Data export ("Download My Data"):**

Located in Settings > Data & Account section. Generates a JSON file containing:

- Profile data
- All preferences
- All saved locations
- Complete logbook (all QSO entries)
- All contest sessions and QSOs
- All equipment (radios, antennas, feedlines, accessories, presets)
- All watches, pins, skeds, alert rules, saved targets
- Achievement history
- Follow relationships

Format: JSON wrapped in a ZIP file with a manifest. The export includes both local and cloud data (merged, deduplicated).

**Account deletion:**

Located in Settings > Data & Account section. Requires confirmation ("Type DELETE to confirm").

1. All Supabase data is deleted: profile, preferences, logbook, contests, equipment, social data, storage files
2. The Supabase `auth.users` row is deleted (cascades to all FK-linked tables)
3. Local data is NOT deleted -- the user is informed: "Your local data has been preserved. You can continue using Propulse offline. To remove local data, use your browser's clear data function."
4. The user is signed out

**Data residency:**

- All Supabase data is stored in the configured project region (us-east-1 by default)
- Users are informed of the data region in the Settings > Data section
- No data replication to other regions unless Supabase's infrastructure does so transparently

**Tracking and analytics:**

- Propulse does not use any third-party analytics or tracking by default
- No user data is shared with third parties
- Future analytics (if any) would be opt-in only

---

## 11. Rollout Plan

The migration is implemented in six phases. Each phase is independently shippable and provides value on its own. Phases are ordered by dependency (later phases depend on infrastructure built in earlier phases).

### Phase 1: Foundation

**Goal:** Establish the Supabase project, auth infrastructure, and the `authStore`. The app gains sign-in/sign-out capability but no data sync yet.

**Deliverables:**

- Supabase project created with all tables, indexes, RLS policies, triggers, and storage buckets (via SQL migration scripts)
- `@supabase/supabase-js` added to package.json
- `src/lib/supabase/client.ts` -- Supabase client singleton with lazy init
- `src/stores/authStore.ts` -- Zustand store for auth state (user, session, isAuthenticated, isLoading)
- `useAuth()` hook wrapping sign-in/sign-out methods
- Auth UI components:
  - Sign-in modal with magic link + OAuth buttons
  - Account status indicator in header (avatar/initials or "Sign In" button)
  - Sign-out confirmation
- Magic link redirect handler (catches `?code=` query param from email click)
- App continues to work identically without an account
- All Supabase env vars are optional -- missing vars result in local-only mode

**Estimated effort:** 1-2 weeks

---

### Phase 2: Profile & Preferences Sync

**Goal:** Decompose `userStore` and enable Tier 1 sync for profile and preferences data. Build the `/profile` and `/settings` pages.

**Deliverables:**

- `src/stores/profileStore.ts` -- station identity, license, locations, bio, avatar, social links, visibility
- `src/stores/settingsStore.ts` -- all preferences (decomposed from `userStore.preferences`)
- `userStore` v14 -> v15 migration (data split to new stores)
- `SyncManager` class with Tier 1 push/pull for profile + preferences
- `useSyncStatus()` hook + sync indicator in header
- `/profile` page implementation (from `PRD-OPERATOR-PROFILE.md`)
- `/settings` page implementation (from `PRD-SETTINGS-PAGE.md`)
- Callsign verification Edge Function
- Settings > Data section: account status, sync status, manual "Sync Now" button
- Initial data upload flow (profile + preferences) for existing users creating an account

**Estimated effort:** 3-4 weeks

---

### Phase 3: Logbook Sync

**Goal:** Enable Tier 2 incremental sync for the QSO logbook -- the most critical data for cross-device value.

**Deliverables:**

- Write queue infrastructure (in-memory + localStorage backup)
- Tier 2 push logic: batch upsert with 30-second interval
- Tier 2 pull logic: delta sync on app load with pagination
- Initial logbook upload flow with progress tracking for existing users
- Soft delete propagation
- Conflict resolution (per-entry last-write-wins)
- `visibilitychange` handler for flush-on-tab-hide
- Sync queue consolidation (dedup rapid edits to same entry)
- DXCC recomputation trigger after logbook pull (recompute `dxccStore` from updated logbook)
- Testing: cross-device sync verification, offline resilience, large logbook upload

**Estimated effort:** 2-3 weeks

---

### Phase 4: Equipment & Config Sync

**Goal:** Decompose equipment into `shackStore` and enable sync for all Tier 1 and Tier 3 data types.

**Deliverables:**

- `src/stores/shackStore.ts` -- radios, antennas, feedlines, accessories, station presets
- Equipment data migration from `userStore` to `shackStore`
- `/shack` page implementation (from `PRD-SHACK-BUILDER.md`)
- Tier 1 sync for equipment data (debounced push + pull-on-load)
- Tier 3 sync for watches, pins, skeds, alert rules, saved targets (push-on-CRUD + pull-on-load)
- Photo upload infrastructure (client-side compression + Supabase Storage)
- Avatar upload in profile edit
- Shack photos in equipment detail views

**Estimated effort:** 2-3 weeks

---

### Phase 5: Social Features

**Goal:** Enable the social layer -- follows, activity feed, online status, share cards.

**Deliverables:**

- Follow/unfollow functionality with `follows` table
- Friends list on profile page
- Activity feed display (paginated query on profile view)
- `compute-achievements` Edge Function + `pg_cron` schedule
- Achievement badges on profile
- Online status via Supabase Presence (subscribe on friends view, unsubscribe on navigate away)
- `generate-share-card` Edge Function
- Share card generation and download
- QR code generation for profile URL
- Public profile view (accessible via callsign URL)
- `cleanup-feed` cron job

**Estimated effort:** 2-3 weeks

---

### Phase 6: Contest Sync

**Goal:** Enable sync for completed contest sessions, providing cross-device contest history.

**Deliverables:**

- Contest session sync: push completed session + all QSOs as a batch on `endContest()`
- Contest history pull on app load (delta sync by `updated_at`)
- Contest results display on profile (from synced sessions)
- Cross-device contest history browsing
- Cabrillo export from synced sessions

**Estimated effort:** 1 week

---

### Total Estimated Timeline

| Phase                          | Duration  | Cumulative  |
| ------------------------------ | --------- | ----------- |
| Phase 1: Foundation            | 1-2 weeks | 1-2 weeks   |
| Phase 2: Profile & Preferences | 3-4 weeks | 4-6 weeks   |
| Phase 3: Logbook Sync          | 2-3 weeks | 6-9 weeks   |
| Phase 4: Equipment & Config    | 2-3 weeks | 8-12 weeks  |
| Phase 5: Social Features       | 2-3 weeks | 10-15 weeks |
| Phase 6: Contest Sync          | 1 week    | 11-16 weeks |

---

## 12. Monitoring & Cost Controls

### 12.1 Supabase Dashboard Monitoring

The Supabase dashboard provides built-in metrics for:

- **Database size:** Track growth of `log_entries` table (expected to be the largest). Alert at 80% of plan limit (400MB on free, varies on Pro).
- **Egress:** Monthly bandwidth consumption. The primary cost driver.
- **Connections:** Concurrent database connections. Free tier allows 60 direct connections; Pro allows 500. Each browser tab uses one connection.
- **Edge Function invocations:** Monitor `verify-callsign` and `compute-achievements` usage.
- **Storage:** Total file storage across all buckets.
- **Auth:** Monthly active users, sign-in methods distribution.

### 12.2 Usage Alerts

Configure Supabase usage alerts at the following thresholds:

| Metric        | 50% Alert | 75% Alert | 90% Alert |
| ------------- | --------- | --------- | --------- |
| Database size | 250MB     | 375MB     | 450MB     |
| Egress (free) | 1GB       | 1.5GB     | 1.8GB     |
| Storage       | 500MB     | 750MB     | 900MB     |
| MAU (free)    | 25,000    | 37,500    | 45,000    |

### 12.3 Client-Side Monitoring

The `SyncManager` logs sync operations with metadata for debugging:

```typescript
interface SyncLog {
  timestamp: string;
  operation: "push" | "pull";
  table: string;
  recordCount: number;
  payloadBytes: number;
  durationMs: number;
  success: boolean;
  error?: string;
}
```

Sync logs are stored in an in-memory ring buffer (last 100 entries) and displayed in a developer panel accessible from Settings > Data > "Sync Log" (hidden behind a feature flag or long-press on the sync indicator).

### 12.4 Cost Escalation Procedures

If egress approaches plan limits:

1. **First response:** Increase cache TTLs for Tier 3 data. Reduce Tier 2 flush interval from 30 seconds to 60 seconds.
2. **Second response:** Switch logbook pull from "every app load" to "every 5 minutes or on explicit sync."
3. **Third response:** Disable Realtime presence (online status). Show cached status instead.
4. **Fourth response:** Upgrade to Pro plan or increase plan limits.

These responses are implemented as feature flags configurable from the Supabase Edge Function environment, allowing runtime tuning without a client deploy.

---

## 13. Testing Strategy

### 13.1 Local-Only Mode (Regression)

**Objective:** Verify that all features work without a Supabase account, identical to the pre-migration app.

**Test cases:**

- Remove `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from environment. App loads and functions normally.
- All stores hydrate from localStorage/IndexedDB.
- Logbook CRUD operations work.
- Contest mode works.
- Settings changes persist across page refresh.
- No network requests to Supabase domains.

### 13.2 Sync Correctness

**Objective:** Data created on one device appears on another after sync.

**Test cases:**

- Create a QSO on Device A. Open the app on Device B. The QSO appears within 60 seconds (after pull-on-load + batch interval).
- Change preferences on Device A (e.g., time format 12h -> 24h). Device B reflects the change after next app load.
- Add a watch on Device A. Device B shows the watch after next app load.
- Upload a profile photo on Device A. Device B displays the photo on the profile page.

### 13.3 Conflict Resolution

**Objective:** When the same record is modified on two devices, the most recent edit wins.

**Test cases:**

- Edit the same QSO's notes on Device A ("Notes from A") and Device B ("Notes from B") while both are offline. Bring both online. The device with the later `updated_at` wins. The other device's edit is overwritten on next pull.
- Delete a QSO on Device A while Device B edits it. If the delete's `updated_at` is later, the QSO appears deleted on Device B. If the edit's `updated_at` is later, the QSO is restored.
- Change preferences on both devices simultaneously. Last-write-wins at the JSONB blob level.

### 13.4 Offline Resilience

**Objective:** Changes made while offline are queued and synced when connectivity returns.

**Test cases:**

- Go offline (disable network). Log 10 QSOs. Come back online. All 10 QSOs sync within 60 seconds.
- Go offline. Change preferences. Go offline for 24 hours. Come back online. Preferences sync.
- Go offline. Close the browser tab. Reopen the app (still offline). Pending queue is loaded from localStorage. Go online. Queue flushes.
- Go offline. Exceed the queue size limit (500 entries). Warning is displayed. Queue consolidation deduplicates entries. Come online. All unique entries sync.

### 13.5 Large Logbook Upload

**Objective:** Initial upload of large logbooks completes reliably with progress tracking.

**Test cases:**

- 1,000 entries: completes in <10 seconds, progress bar advances smoothly.
- 10,000 entries: completes in <60 seconds, progress bar shows batch progress (100 batches of 100).
- 25,000 entries: completes in <150 seconds, no timeout errors.
- 50,000 entries: completes in <300 seconds, can be interrupted and resumed (checkpoint via `lastSyncedAt`).
- Simulate network failure mid-upload (after 5,000 entries). Resume from checkpoint. No duplicate entries created.

### 13.6 Auth Flow

**Objective:** All authentication methods work correctly and session management is robust.

**Test cases:**

- Magic link: enter email, receive link, click link, session established, profile created.
- Google OAuth: click button, redirect to Google, consent, redirect back, session established.
- GitHub OAuth: click button, redirect to GitHub, authorize, redirect back, session established.
- Session refresh: wait for access token expiry (1 hour), verify auto-refresh with no user action.
- Sign out: click sign out, session cleared, local data preserved, sync stopped.
- Multi-tab: sign out in tab A, tab B also reflects signed-out state.
- Callsign verification: enter valid US callsign, verify via callook.info, confirm name match.
- Callsign conflict: attempt to claim a callsign already registered to another user, error displayed.

### 13.7 Performance

**Objective:** Sync operations do not degrade UI responsiveness.

**Test cases:**

- Log a QSO while a large batch sync is in progress. The QSO is written to local storage instantly (<10ms). UI does not freeze.
- Open the app with 1,000 pending sync entries. The app is interactive within 500ms. Sync runs in the background.
- Navigate between pages while sync is active. No UI jank, no dropped frames.
- Memory usage during a 50K entry upload stays under 100MB (entries are processed in batches, not loaded all at once).

---

## 14. Open Questions

### Q1: Should preferences use field-level merge instead of JSONB blob replacement?

**Impact:** High. Affects conflict resolution granularity for Tier 1 sync.

**Current design:** The entire `user_preferences.preferences` JSONB blob is replaced on write. If Device A changes `timeFormat` and Device B changes `noiseEnvironment` simultaneously, last-write-wins means one change is lost.

**Alternative:** Store each preference as a separate column, or use JSONB merge (`preferences || new_data`) instead of replacement.

**Recommendation:** Keep JSONB blob replacement for now. The preferences blob is ~2KB. Simultaneous edits on two devices are rare for settings (users typically configure settings on one device). The simplicity of blob replacement outweighs the risk of lost concurrent edits. If this becomes a problem in practice, field-level merge can be added later by tracking per-field `updated_at` timestamps inside the JSONB.

### Q2: Should completed contest sessions be editable after sync?

**Impact:** Medium. Affects contest data model and sync complexity.

**Current design:** Contest sessions are treated as immutable after `endContest()` and sync. The `contest_sessions` and `contest_qsos` tables have `updated_at` but are never updated after initial insert.

**Alternative:** Allow post-contest editing (e.g., correcting a logged callsign). This would require conflict resolution for contest QSOs.

**Recommendation:** Defer editability. Contest data integrity is important for Cabrillo submission. If editing is needed, implement it as "create corrected session from existing" rather than in-place mutation.

### Q3: What happens when a user exceeds the photo storage limit on the free tier?

**Impact:** Low-medium. Affects user experience for early adopters on the free plan.

**Current design:** 20 photos per user, max 2MB each = max 40MB per user. The free tier allows 1GB total storage.

**Recommendation:** Enforce the 20-photo limit client-side. Display storage usage in the shack page. When approaching 1GB total across all users, upgrade to Pro. At $25/month, this is a negligible cost compared to the development investment.

### Q4: Should the sync engine support multiple Supabase environments (dev, staging, prod)?

**Impact:** Low. Affects developer experience.

**Current design:** A single Supabase project is configured via environment variables. Developers use their own Supabase project for local development.

**Recommendation:** Use separate Supabase projects for dev and prod, configured via `.env.development` and `.env.production`. No multi-tenant support in the client code. Supabase's branching feature (if available on the plan) can be used for staging.

### Q5: How should the app handle Supabase SDK version upgrades?

**Impact:** Low. Affects maintenance planning.

**Current design:** Pin `@supabase/supabase-js` to a specific minor version.

**Recommendation:** Pin to `^2.x` (latest v2 minor). Test thoroughly before upgrading to v3 when available. The Supabase SDK follows semver, so minor version upgrades should be non-breaking.

### Q6: Should the `activity_feed` table support reactions (likes/comments) on events?

**Impact:** Medium. Affects social feature scope and table schema.

**Current design:** The activity feed is read-only. Users can view events but not interact with them.

**Recommendation:** Defer reactions to a future social expansion PRD. Adding reactions requires a `feed_reactions` table, notification infrastructure, and moderation tooling that are out of scope for the initial migration.

### Q7: How should cross-device sync handle timezone differences?

**Impact:** Low. Affects edge cases in conflict resolution.

**Current design:** All timestamps are stored as UTC `timestamptz` in PostgreSQL. The client converts to/from local time for display. `updated_at` comparisons for conflict resolution are always in UTC.

**Recommendation:** Current design is correct. No changes needed. The only risk is clock skew between devices, which could cause incorrect last-write-wins resolution. This is mitigated by using server-side `now()` in the `update_updated_at()` trigger, so the server timestamp is authoritative for the `updated_at` column.

### Q8: Should the initial migration upload be cancellable?

**Impact:** Low-medium. Affects UX for users with very large logbooks (50K+ entries).

**Current design:** The upload runs in the background with a progress indicator. There is no cancel button.

**Recommendation:** Add a cancel button that pauses the upload at the next batch boundary. The checkpoint (`lastSyncedAt`) allows resumption later. The user can continue using the app while the upload is paused. A "Resume upload" banner appears until the upload is complete.
