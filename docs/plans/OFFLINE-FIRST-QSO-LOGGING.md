# Offline-First QSO Logging System

> Implementation Plan | Created: 2026-02-12
> Status: DRAFT — Awaiting review before implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Supabase Migration SQL](#2-supabase-migration-sql)
3. [Service Worker Strategy](#3-service-worker-strategy)
4. [qsoStore Design](#4-qsostore-design)
5. [Sync Engine Design](#5-sync-engine-design)
6. [QSO Entry UI](#6-qso-entry-ui)
7. [QSO Log Viewer](#7-qso-log-viewer)
8. [Conflict Resolution UI](#8-conflict-resolution-ui)
9. [Phase 2: Daemon Static Serving](#9-phase-2-daemon-static-serving)
10. [Phase 3: Capacitor Outline](#10-phase-3-capacitor-outline)
11. [File Inventory](#11-file-inventory)
12. [Implementation Order](#12-implementation-order)
13. [Quality Philosophy & Review Gates](#13-quality-philosophy--review-gates)

---

## 1. Executive Summary

Propulse currently has a working logbook (IndexedDB `logEntries` store, `log_entries` Supabase table, Tier 2 sync via `logbookSync.ts`). This plan replaces the basic log with a world-class offline-first QSO logging system that makes operators say "holy shit, I never knew it could be this easy."

### What exists today

| Component         | Location                              | Status                          |
| ----------------- | ------------------------------------- | ------------------------------- |
| IndexedDB schema  | `src/lib/db/types.ts` (`LogEntry`)    | Working, version 3              |
| IndexedDB CRUD    | `src/lib/db/logStore.ts`              | Working, 14 functions           |
| Supabase table    | `log_entries` (initial migration)     | Working, 10 indexes             |
| Sync module       | `src/lib/sync/modules/logbookSync.ts` | Working, Tier 2 incremental     |
| Write queue       | `src/lib/sync/writeQueue.ts`          | Working, localStorage, 500 max  |
| SyncManager       | `src/lib/sync/SyncManager.ts`         | Working, 3-tier orchestrator    |
| Logbook page      | `src/pages/Logbook.tsx`               | Exists (basic)                  |
| PWA config        | `vite.config.ts` (VitePWA)            | Working, prompt update strategy |
| `idb` library     | `package.json` (`idb@8.0.3`)          | Already installed               |
| `vite-plugin-pwa` | `package.json` (`^1.2.0`)             | Already installed               |

### What this plan adds

- **Enhanced `qso_log` Supabase table** with field-level versioning for conflict resolution
- **Hardened Service Worker** with granular cache strategies, background sync, and offline fallback
- **`qsoStore`** — new Zustand store that wraps IndexedDB with reactive state for the QSO entry form and log viewer
- **Field-level conflict detection and resolution** with a GitHub-merge-style diff picker UI
- **QSO Entry UI** — one-click "Log It" flow with callsign auto-fill, rig integration, band/mode auto-detect
- **QSO Log Viewer** — search, filter, sort, statistics dashboard, ADIF export
- **Bridge daemon extension** (Phase 2) to serve the built app on localhost
- **Capacitor outline** (Phase 3) for native mobile

### Design Principles

1. **Offline is the default.** The app must work identically whether connected or not. No loading spinners for core logging.
2. **Local writes are instant.** IndexedDB first, Supabase second. The user never waits for a network round-trip to log a QSO.
3. **Conflicts are rare but handled gracefully.** Field-level merge with operator review.
4. **Zero-config for basic logging.** Open app, type callsign, click Log. Everything else is optional.
5. **Progressive disclosure.** Frequency, RST, notes, grid appear as the operator needs them.

---

## 2. Supabase Migration SQL

### Design Rationale

The existing `log_entries` table works but lacks field-level version tracking needed for conflict resolution. Rather than alter the existing table (which is already in production and synced), we add a **companion sync metadata table** and enhance `log_entries` with a `version` column. The existing `updated_at` trigger remains; the new `version` column increments on each write.

### Migration: `20260216000000_qso_logging_enhancements.sql`

```sql
-- =============================================================================
-- Propulse: QSO Logging Enhancements
-- Created: 2026-02-16
-- Description: Adds field-level versioning, sync conflict tracking,
--              and additional QSO fields for offline-first logging.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend log_entries with versioning and new QSO fields
-- -----------------------------------------------------------------------------

ALTER TABLE public.log_entries
  -- Version counter: incremented on every write (local or remote)
  ADD COLUMN IF NOT EXISTS version        integer NOT NULL DEFAULT 1,
  -- Device that last wrote this row (for conflict attribution)
  ADD COLUMN IF NOT EXISTS last_device_id text,
  -- ADIF-standard fields missing from the original schema
  ADD COLUMN IF NOT EXISTS country        text,
  ADD COLUMN IF NOT EXISTS dxcc           integer,
  ADD COLUMN IF NOT EXISTS cq_zone        integer,
  ADD COLUMN IF NOT EXISTS itu_zone       integer,
  ADD COLUMN IF NOT EXISTS continent      text,
  ADD COLUMN IF NOT EXISTS tx_power       double precision,
  ADD COLUMN IF NOT EXISTS my_grid        text,
  ADD COLUMN IF NOT EXISTS my_rig         text,
  ADD COLUMN IF NOT EXISTS my_antenna     text,
  ADD COLUMN IF NOT EXISTS prop_mode      text,
  ADD COLUMN IF NOT EXISTS sat_name       text,
  ADD COLUMN IF NOT EXISTS sat_mode       text,
  -- Activation fields (POTA/SOTA/IOTA/WWFF)
  ADD COLUMN IF NOT EXISTS my_sig         text,
  ADD COLUMN IF NOT EXISTS my_sig_info    text,
  ADD COLUMN IF NOT EXISTS sig            text,
  ADD COLUMN IF NOT EXISTS sig_info       text,
  -- Contest exchange fields (for unified daily+contest logging)
  ADD COLUMN IF NOT EXISTS contest_id     text,
  ADD COLUMN IF NOT EXISTS srx            text,
  ADD COLUMN IF NOT EXISTS stx            text,
  ADD COLUMN IF NOT EXISTS srx_string     text,
  ADD COLUMN IF NOT EXISTS stx_string     text,
  -- ClubLog/LoTW/QRZ confirmation timestamps
  ADD COLUMN IF NOT EXISTS lotw_qsl_sent  text,
  ADD COLUMN IF NOT EXISTS lotw_qsl_rcvd  text,
  ADD COLUMN IF NOT EXISTS clublog_status text,
  ADD COLUMN IF NOT EXISTS qrzcom_status  text;

-- Index on version for conflict detection queries
CREATE INDEX IF NOT EXISTS log_entries_user_version_idx
  ON public.log_entries (user_id, id, version);

-- Index for POTA/SOTA activation lookups
CREATE INDEX IF NOT EXISTS log_entries_user_sig_idx
  ON public.log_entries (user_id, my_sig, my_sig_info)
  WHERE my_sig IS NOT NULL;

-- Index for contest QSO lookups
CREATE INDEX IF NOT EXISTS log_entries_user_contest_idx
  ON public.log_entries (user_id, contest_id)
  WHERE contest_id IS NOT NULL;

-- Index for DXCC tracking
CREATE INDEX IF NOT EXISTS log_entries_user_dxcc_idx
  ON public.log_entries (user_id, dxcc, band, mode)
  WHERE dxcc IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Sync conflict log — records field-level conflicts for operator review
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_id        uuid NOT NULL,
  -- Snapshot of the local version at conflict time
  local_version   integer NOT NULL,
  local_data      jsonb NOT NULL,
  -- Snapshot of the remote version at conflict time
  remote_version  integer NOT NULL,
  remote_data     jsonb NOT NULL,
  -- Which fields actually differ
  conflicting_fields text[] NOT NULL,
  -- Resolution status
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'resolved_local', 'resolved_remote', 'resolved_merged')),
  resolved_data   jsonb,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_conflicts_user_status_idx
  ON public.sync_conflicts (user_id, status);

CREATE INDEX IF NOT EXISTS sync_conflicts_entry_idx
  ON public.sync_conflicts (user_id, entry_id);

ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_conflicts_all_own ON public.sync_conflicts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. Device registry — tracks device IDs for conflict attribution
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_devices (
  id          text NOT NULL,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  platform    text,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_devices_all_own ON public.user_devices
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update last_seen trigger
CREATE TRIGGER user_devices_last_seen
  BEFORE UPDATE ON public.user_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -----------------------------------------------------------------------------
-- 4. QSO statistics materialized view (refresh via pg_cron or Edge Function)
-- -----------------------------------------------------------------------------

-- This is a function rather than a materialized view to work within
-- Supabase free tier constraints. Called by the client or Edge Function.

CREATE OR REPLACE FUNCTION public.compute_qso_stats(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stats jsonb;
BEGIN
  SELECT jsonb_build_object(
    'totalQsos', COUNT(*),
    'uniqueCallsigns', COUNT(DISTINCT callsign),
    'uniqueDxcc', COUNT(DISTINCT dxcc),
    'uniqueGrids', COUNT(DISTINCT LEFT(grid, 4)),
    'bandBreakdown', (
      SELECT jsonb_object_agg(band, cnt)
      FROM (
        SELECT band, COUNT(*) as cnt
        FROM public.log_entries
        WHERE user_id = target_user_id AND deleted_at IS NULL AND band IS NOT NULL
        GROUP BY band
      ) sub
    ),
    'modeBreakdown', (
      SELECT jsonb_object_agg(mode, cnt)
      FROM (
        SELECT mode, COUNT(*) as cnt
        FROM public.log_entries
        WHERE user_id = target_user_id AND deleted_at IS NULL AND mode IS NOT NULL
        GROUP BY mode
      ) sub
    ),
    'dailyRate', (
      SELECT ROUND(COUNT(*)::numeric /
        GREATEST(1, EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 86400), 1)
      FROM public.log_entries
      WHERE user_id = target_user_id AND deleted_at IS NULL
    ),
    'lastQso', (
      SELECT MAX(created_at)
      FROM public.log_entries
      WHERE user_id = target_user_id AND deleted_at IS NULL
    )
  ) INTO stats
  FROM public.log_entries
  WHERE user_id = target_user_id AND deleted_at IS NULL;

  RETURN stats;
END;
$$;
```

---

## 3. Service Worker Strategy

### Current State

The PWA is already configured in `vite.config.ts` with `vite-plugin-pwa`:

- `registerType: "prompt"` — user must approve updates
- Workbox `globPatterns: ["**/*.{js,css,html,svg,png,jpg,woff2}"]`
- `navigateFallback: "/index.html"` for SPA routing
- Runtime caching for public `/api/*` endpoints (NetworkFirst, 5 min TTL)
- Textures excluded via `globIgnores`

### Enhancements

#### 3.1 Precache Strategy (Build-Time)

Keep the existing glob pattern. Add:

```ts
workbox: {
  globPatterns: ["**/*.{js,css,html,svg,png,jpg,woff2,woff,json}"],
  globIgnores: ["**/textures/**", "**/mockServiceWorker.js"],
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [/^\/api\//],
  // ...
}
```

The app shell (HTML + JS + CSS + fonts + SVG icons) will be precached. This gives us "open the app offline and everything renders" for free.

#### 3.2 Runtime Caching Strategy

```ts
runtimeCaching: [
  // Public data APIs — NetworkFirst with 5min TTL (existing)
  {
    urlPattern:
      /^https:\/\/.*\/api\/(?!log\/|callsign\/qrz|callsign\/hamqth|profile\/heartbeat)/,
    handler: "NetworkFirst",
    options: {
      cacheName: "api-cache",
      expiration: { maxEntries: 50, maxAgeSeconds: 300 },
      networkTimeoutSeconds: 10,
    },
  },
  // Callsign lookup — CacheFirst with 24h TTL (lookups rarely change)
  {
    urlPattern: /\/api\/callsign\/lookup/,
    handler: "CacheFirst",
    options: {
      cacheName: "callsign-cache",
      expiration: { maxEntries: 500, maxAgeSeconds: 86400 },
    },
  },
  // HamQTH/QRZ lookups — NetworkFirst with 1h TTL
  {
    urlPattern: /\/api\/callsign\/(hamqth|qrz)/,
    handler: "NetworkFirst",
    options: {
      cacheName: "callsign-ext-cache",
      expiration: { maxEntries: 200, maxAgeSeconds: 3600 },
      networkTimeoutSeconds: 5,
    },
  },
  // Supabase REST API — NetworkOnly (sync engine handles offline)
  {
    urlPattern: /supabase\.co\/rest\/v1/,
    handler: "NetworkOnly",
  },
  // Google Fonts (if used) — CacheFirst
  {
    urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
    handler: "CacheFirst",
    options: {
      cacheName: "font-cache",
      expiration: { maxEntries: 20, maxAgeSeconds: 31536000 },
    },
  },
];
```

#### 3.3 Update Strategy

Keep `registerType: "prompt"`. The user sees a toast: "New version available. Refresh to update." This is critical because a forced reload during a contest or POTA activation would lose unsaved form state.

Add a custom prompt component (`src/components/pwa/UpdatePrompt.tsx`) that:

- Shows as a non-intrusive toast at the bottom of the screen
- Uses `plasma-orange` accent color
- Persists across page navigations until dismissed or applied
- Includes "Update Now" and "Later" buttons
- If "Later", stores a timestamp and re-prompts after 1 hour

#### 3.4 Background Sync (Future Enhancement)

When the `Background Sync API` is available (Chrome, Edge), register a sync event for QSO pushes:

```ts
// In Service Worker
self.addEventListener("sync", (event) => {
  if (event.tag === "qso-push") {
    event.waitUntil(pushPendingQSOs());
  }
});
```

This is a progressive enhancement — the existing `SyncManager` online/offline listeners handle this today, but Background Sync allows the push to happen even after the tab is closed.

#### 3.5 Offline Indicator

Add a global offline indicator to the app shell:

- Small amber banner at the top of the screen when `navigator.onLine === false`
- Text: "Offline — QSOs are saved locally and will sync when you reconnect"
- Uses existing `caution-amber` color
- Animates in/out with CSS transition

---

## 4. qsoStore Design

### Architecture Decision

The existing `logStore.ts` (IndexedDB CRUD) operates at the data layer with plain async functions. We need a **reactive Zustand store** that:

1. Wraps IndexedDB operations for UI reactivity
2. Manages the QSO entry form state
3. Tracks sync state (pending count, conflicts)
4. Provides dupe checking
5. Integrates with the existing SyncManager via the write queue

We do **NOT** replace the existing `src/lib/db/logStore.ts` or `src/lib/db/types.ts`. Instead, `qsoStore` is a higher-level store that uses those as its persistence layer.

### State Shape

```typescript
// src/stores/qsoStore.ts
// Persists: form defaults to localStorage key 'propulse-qso'
// QSOs persist to IndexedDB via src/lib/db/logStore.ts

interface QSOFormState {
  // Current form fields
  callsign: string;
  frequency: number;
  mode: string;
  band: string;
  rstSent: string;
  rstRcvd: string;
  grid: string;
  name: string;
  qth: string;
  notes: string;
  txPower: number | null;
  // Activation fields (collapsed by default)
  mySig: string; // "POTA" | "SOTA" | "IOTA" | "WWFF" | ""
  mySigInfo: string; // e.g., "K-1234"
  sig: string; // Their activation program
  sigInfo: string; // Their activation reference
  contestId: string;
  stx: string;
  srx: string;
  // Auto-populated from rig/bridge
  rigSource: "manual" | "bridge" | "wsjtx";
}

interface QSOLookupResult {
  callsign: string;
  name?: string;
  grid?: string;
  qth?: string;
  country?: string;
  dxcc?: number;
  cqZone?: number;
  ituZone?: number;
  lat?: number;
  lon?: number;
  imageUrl?: string;
  source: "callook" | "hamqth" | "qrz" | "cache";
}

interface QSODupeInfo {
  isDupe: boolean;
  previousContacts: Array<{
    date: string;
    band: string;
    mode: string;
    rstSent?: string;
  }>;
  workedBands: string[];
  workedModes: string[];
}

interface QSOStoreState {
  // ── Form State ──
  form: QSOFormState;
  formDefaults: Partial<QSOFormState>; // Sticky defaults (persisted)

  // ── Lookup State ──
  lookupResult: QSOLookupResult | null;
  lookupLoading: boolean;
  lookupError: string | null;

  // ── Dupe State ──
  dupeInfo: QSODupeInfo | null;

  // ── Log Viewer State ──
  entries: LogEntry[]; // Current page of log entries
  totalCount: number;
  viewerLoading: boolean;
  filters: QSOFilters;
  sortField: string;
  sortDirection: "asc" | "desc";
  selectedIds: Set<string>;

  // ── Sync State ──
  pendingSyncCount: number;
  conflicts: SyncConflict[];

  // ── Actions ──
  // Form
  setField: <K extends keyof QSOFormState>(
    field: K,
    value: QSOFormState[K],
  ) => void;
  resetForm: () => void;
  setFormDefaults: (defaults: Partial<QSOFormState>) => void;
  applyLookupToForm: (result: QSOLookupResult) => void;

  // Logging
  logQSO: () => Promise<string>; // Returns new entry ID
  quickLog: (callsign: string) => Promise<string>; // One-click: callsign + current rig state
  editQSO: (id: string, updates: Partial<LogEntry>) => Promise<void>;
  deleteQSO: (id: string) => Promise<void>;
  undoDelete: (id: string) => Promise<void>;

  // Lookup
  lookupCallsign: (callsign: string) => Promise<void>;
  clearLookup: () => void;

  // Dupe check
  checkDupe: (callsign: string) => Promise<void>;

  // Viewer
  loadEntries: (offset?: number, limit?: number) => Promise<void>;
  setFilters: (filters: Partial<QSOFilters>) => void;
  setSort: (field: string, direction: "asc" | "desc") => void;
  selectEntry: (id: string) => void;
  deselectEntry: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;

  // Sync
  resolveConflict: (
    conflictId: string,
    resolution: "local" | "remote" | "merged",
    mergedData?: Partial<LogEntry>,
  ) => Promise<void>;
}

interface QSOFilters {
  search: string;
  band: string | null;
  mode: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  mySig: string | null;
  contestId: string | null;
  confirmed: boolean | null; // LoTW/eQSL confirmed
  dupe: boolean | null;
}
```

### Persistence Config

```typescript
export const useQSOStore = create<QSOStoreState>()(
  persist(
    (set, get) => ({
      // ... state and actions
    }),
    {
      name: "propulse-qso",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only persist form defaults, filters, and sort preferences
      // QSO data lives in IndexedDB, not localStorage
      partialize: (state) => ({
        formDefaults: state.formDefaults,
        filters: state.filters,
        sortField: state.sortField,
        sortDirection: state.sortDirection,
      }),
    },
  ),
);
```

### Key Implementation Details

**`logQSO()` flow:**

1. Validate required fields (callsign, date, time, band, mode)
2. Build `LogEntry` from form state + auto-populated fields
3. Write to IndexedDB via `addLogEntry()` -- instant, no network
4. Enqueue write to SyncManager: `syncManager.enqueue('log_entries', 'upsert', rowData)`
5. Reset form (keep sticky defaults like band, mode, power)
6. Play success sound (optional, from settingsStore preference)
7. Update `entries` and `totalCount` for the log viewer

**`quickLog()` flow:**

1. Set callsign in form
2. Auto-fill from rig state (frequency/mode from `useRigStore`) or last QSO defaults
3. Auto-fill RST defaults (59 for SSB, 599 for CW, -10 for FT8)
4. Call `logQSO()`

**Dupe checking:**

- On callsign change (debounced 300ms), query IndexedDB `by-callsign` index
- Return all previous contacts for that callsign
- Highlight if same band+mode already worked
- Show badge: "Worked on 20m CW, 40m SSB" in the entry form

### IndexedDB Schema Extension

The existing `DBSchema` in `src/lib/db/types.ts` needs new fields on `LogEntry` to match the extended Supabase columns. We add them as optional fields to maintain backward compatibility.

```typescript
// Additions to LogEntry in src/lib/db/types.ts
export interface LogEntry {
  // ... existing fields ...

  /** Row version for conflict detection */
  version?: number;
  /** Device that last modified this entry */
  lastDeviceId?: string;
  /** DXCC entity number */
  dxcc?: number;
  /** Country name */
  country?: string;
  /** CQ zone */
  cqZone?: number;
  /** ITU zone */
  ituZone?: number;
  /** Continent code */
  continent?: string;
  /** Transmit power in watts */
  txPower?: number;
  /** My grid square at time of QSO */
  myGrid?: string;
  /** My rig description */
  myRig?: string;
  /** My antenna description */
  myAntenna?: string;
  /** Propagation mode */
  propMode?: string;
  /** Satellite name */
  satName?: string;
  /** Satellite mode */
  satMode?: string;
  /** Activation program (POTA, SOTA, etc.) */
  mySig?: string;
  /** My activation reference */
  mySigInfo?: string;
  /** Their activation program */
  sig?: string;
  /** Their activation reference */
  sigInfo?: string;
  /** Contest ID */
  contestId?: string;
  /** Serial received */
  srx?: string;
  /** Serial sent */
  stx?: string;
  /** Exchange string received */
  srxString?: string;
  /** Exchange string sent */
  stxString?: string;
  /** LoTW QSL sent status */
  lotwQslSent?: string;
  /** LoTW QSL received status */
  lotwQslRcvd?: string;
  /** ClubLog status */
  clublogStatus?: string;
  /** QRZ.com status */
  qrzcomStatus?: string;
}
```

IndexedDB version bump: `DB_CONFIG.version` goes from `3` to `4`. The upgrade handler adds:

- Index `by-dxcc` on `dxcc` field
- Index `by-mySig` on `mySig` field (for POTA/SOTA filtering)
- Index `by-version` on `version` field (for conflict detection)

---

## 5. Sync Engine Design

### Architecture

The sync engine builds on the existing `SyncManager` + `logbookSync` module. The key enhancement is **field-level conflict detection** during pull.

```
┌─────────────────────────────────────────────────────┐
│                    qsoStore                          │
│  (Zustand — reactive UI state)                      │
│                                                      │
│  logQSO() ──► addLogEntry() ──► IndexedDB           │
│           └──► syncManager.enqueue('log_entries')    │
│                                                      │
│  loadEntries() ◄── getAllLogEntries() ◄── IndexedDB  │
└─────────────────────────────────────────────────────┘
         │                              ▲
         ▼                              │
┌─────────────────────────────────────────────────────┐
│              SyncManager (existing)                   │
│                                                      │
│  WriteQueue ──► processQueue() ──► Supabase UPSERT  │
│                                                      │
│  pull() ──► Delta query (updated_at > cursor)        │
│         └──► Conflict detection (version mismatch)   │
│         └──► IndexedDB put() or conflict log         │
└─────────────────────────────────────────────────────┘
```

### 5.1 Queue (Offline Writes)

The existing `WriteQueue` (localStorage, 500 max entries) handles this. When `qsoStore.logQSO()` is called:

1. Entry saved to IndexedDB (instant)
2. `SyncManager.enqueue('log_entries', 'upsert', rowData)` adds to write queue
3. If online: SyncManager's 30s periodic flush picks it up (Tier 2)
4. If offline: entry sits in write queue, survives page refresh

**Enhancement:** Increase `MAX_ENTRIES` from 500 to 2000 for the write queue. A POTA activation can easily produce 100+ QSOs in a session, and operators may be offline for hours.

### 5.2 Push (Local to Remote)

The existing `logbookSync.processQueue()` handles batch upserts. Enhance with version tracking:

```typescript
// Enhanced processQueue in logbookSync.ts
async processQueue(userId: string, entries: WriteQueueEntry[]): Promise<string[]> {
  const supabase = getSupabase();
  const processed: string[] = [];

  for (const entry of entries) {
    if (entry.operation === 'upsert') {
      const data = entry.data as Record<string, unknown>;

      // Optimistic concurrency: only upsert if our version >= server version
      // The Supabase upsert with onConflict handles this
      const { error } = await supabase
        .from('log_entries')
        .upsert({
          ...data,
          user_id: userId,
          version: (data.version as number ?? 0) + 1,
          last_device_id: getDeviceId(),
        }, { onConflict: 'id' });

      if (!error) {
        processed.push(entry.queueId);
      }
    } else if (entry.operation === 'delete') {
      // Soft delete
      const { error } = await supabase
        .from('log_entries')
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: (entry.data.version as number ?? 0) + 1,
        })
        .eq('user_id', userId)
        .eq('id', entry.data.id as string);

      if (!error) {
        processed.push(entry.queueId);
      }
    }
  }

  return processed;
}
```

### 5.3 Pull (Remote to Local)

Enhanced pull with field-level conflict detection:

```typescript
async pull(userId: string, since: string | null): Promise<string | null> {
  // ... existing pagination logic ...

  for (const row of data) {
    const localEntry = await db.get('logEntries', row.id);

    if (row.deleted_at) {
      // Soft delete from remote
      if (localEntry) {
        await tx.store.delete(row.id);
      }
      continue;
    }

    const remoteEntry = rowToLogEntry(row);
    if (!remoteEntry) continue;

    if (!localEntry) {
      // New entry from another device — just save
      await tx.store.put(remoteEntry);
      continue;
    }

    // Entry exists both locally and remotely — check for conflict
    const localVersion = localEntry.version ?? 0;
    const remoteVersion = row.version ?? 0;

    if (remoteVersion > localVersion) {
      // Remote is newer — check if local has unsynced changes
      const hasPendingWrite = writeQueue.hasPendingForId('log_entries', row.id);

      if (hasPendingWrite) {
        // CONFLICT: local has unsaved changes AND remote has newer version
        const conflictingFields = detectFieldConflicts(localEntry, remoteEntry);

        if (conflictingFields.length > 0) {
          // Record conflict for operator review
          await recordConflict(userId, row.id, localEntry, remoteEntry, conflictingFields);
        } else {
          // Fields changed on different sides — auto-merge
          const merged = autoMerge(localEntry, remoteEntry);
          await tx.store.put(merged);
        }
      } else {
        // No local changes pending — accept remote version
        await tx.store.put(remoteEntry);
      }
    }
    // If localVersion >= remoteVersion, local is authoritative (no action needed)
  }
}
```

### 5.4 Conflict Detection

Field-level conflict detection compares individual fields rather than the entire QSO:

```typescript
// src/lib/sync/conflict.ts

/** Fields that participate in conflict detection */
const CONFLICT_FIELDS: (keyof LogEntry)[] = [
  "callsign",
  "frequency",
  "mode",
  "band",
  "date",
  "timeOn",
  "timeOff",
  "rstSent",
  "rstRcvd",
  "grid",
  "name",
  "qth",
  "notes",
  "qslSent",
  "qslRcvd",
  "lotw",
  "eqsl",
  "country",
  "dxcc",
  "txPower",
  "myGrid",
  "propMode",
  "mySig",
  "mySigInfo",
  "sig",
  "sigInfo",
  "contestId",
  "srx",
  "stx",
];

/** Fields that can be auto-merged (additive/non-conflicting) */
const AUTO_MERGE_FIELDS: (keyof LogEntry)[] = [
  "qslSent",
  "qslRcvd",
  "lotw",
  "eqsl",
  "lotwQslSent",
  "lotwQslRcvd",
  "clublogStatus",
  "qrzcomStatus",
  "country",
  "dxcc",
  "cqZone",
  "ituZone",
  "continent",
];

function detectFieldConflicts(local: LogEntry, remote: LogEntry): string[] {
  const conflicts: string[] = [];

  for (const field of CONFLICT_FIELDS) {
    const localVal = local[field];
    const remoteVal = remote[field];

    // Skip if both are null/undefined/empty
    if (!localVal && !remoteVal) continue;

    // Skip if they're the same
    if (String(localVal) === String(remoteVal)) continue;

    // This field differs between local and remote
    // If it's auto-mergeable, don't count as conflict
    if (AUTO_MERGE_FIELDS.includes(field)) continue;

    conflicts.push(field as string);
  }

  return conflicts;
}

function autoMerge(local: LogEntry, remote: LogEntry): LogEntry {
  const merged = { ...local };

  for (const field of AUTO_MERGE_FIELDS) {
    const localVal = local[field];
    const remoteVal = remote[field];

    // Prefer non-null value; prefer "confirmed" over "unconfirmed"
    if (!localVal && remoteVal) {
      (merged as Record<string, unknown>)[field] = remoteVal;
    }
  }

  // Take the higher version number
  merged.version = Math.max(local.version ?? 0, remote.version ?? 0);
  merged.updatedAt = new Date().toISOString();

  return merged;
}
```

### 5.5 Device ID

Each browser/device gets a stable device ID stored in localStorage:

```typescript
// src/lib/sync/deviceId.ts

const DEVICE_ID_KEY = "propulse-device-id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "iOS Device";
  if (/Android/.test(ua)) return "Android Device";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown Device";
}
```

---

## 6. QSO Entry UI

### Design Philosophy

The QSO entry form is the most-used UI in any logging program. It must be:

- **One-handed operable** on mobile (especially for POTA/SOTA)
- **Keyboard-driven** on desktop (Tab between fields, Enter to log)
- **Context-aware**: auto-fill from rig state, auto-lookup callsign
- **Minimal by default**: only 2-3 fields visible; expand on demand

### Layout: Desktop

```
┌──────────────────────────────────────────────────────────────────┐
│  QSO Entry                                           [Expand ▼] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌────────┐  ┌────────┐  ┌─────────────┐  │
│  │ W1AW          ✕ │  │ 14.250 │  │  SSB   │  │  [LOG IT]   │  │
│  │ callsign ▲      │  │ freq   │  │  mode  │  │  ⌘+Enter    │  │
│  └─────────────────┘  └────────┘  └────────┘  └─────────────┘  │
│                                                                  │
│  ┌──────────────── Callsign Info Card ─────────────────┐        │
│  │  W1AW — ARRL Headquarters          📍 Newington, CT │        │
│  │  Grid: FN31pr  CQ: 5  ITU: 8     Worked: 20m SSB  │        │
│  └─────────────────────────────────────────────────────┘        │
│                                                                  │
│  [▸ RST & Exchange]  [▸ Location]  [▸ Activation]  [▸ Notes]   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Collapsed sections** (click to expand):

- **RST & Exchange**: RST Sent, RST Received, Serial TX/RX
- **Location**: Grid, QTH, Country (auto-filled from lookup)
- **Activation**: MY_SIG, MY_SIG_INFO, SIG, SIG_INFO (for POTA/SOTA)
- **Notes**: Free-form text area

### Layout: Mobile

```
┌──────────────────────────────┐
│  ← Log QSO                  │
├──────────────────────────────┤
│                              │
│  ┌────────────────────────┐  │
│  │ W1AW               ✕  │  │
│  │ Callsign              │  │
│  └────────────────────────┘  │
│                              │
│  ┌──── Callsign Card ────┐  │
│  │ ARRL HQ               │  │
│  │ Newington, CT FN31pr  │  │
│  │ Worked: 20m SSB ⚠     │  │
│  └────────────────────────┘  │
│                              │
│  ┌──────────┐ ┌──────────┐  │
│  │  14.250  │ │   SSB    │  │
│  │  Freq    │ │   Mode   │  │
│  └──────────┘ └──────────┘  │
│                              │
│  [▸ More Fields]             │
│                              │
│  ┌────────────────────────┐  │
│  │       LOG QSO          │  │
│  │    (big tap target)    │  │
│  └────────────────────────┘  │
│                              │
└──────────────────────────────┘
```

### Key Interactions

1. **Callsign field has focus on page load.** Always. No exceptions.

2. **Auto-lookup on callsign entry.** After typing 3+ characters and pausing 500ms:
   - Hit local IndexedDB first (dupe check + cached lookup)
   - Then hit `/api/callsign/lookup` (callook.info, cached by Service Worker)
   - Then hit HamQTH/QRZ if configured (via profileStore.serviceCredentials)
   - Populate the Callsign Info Card with results

3. **Frequency/band/mode auto-sync from rig.** If bridge is connected:
   - `rigStore.frequency` populates frequency field
   - Band derived from frequency
   - Mode from rig mode
   - Small "RIG" badge on the field indicates data source

4. **Keyboard shortcuts (desktop):**
   - `Cmd/Ctrl+Enter` — Log QSO
   - `Escape` — Clear form
   - `Tab` — Next field
   - `Shift+Tab` — Previous field
   - `F5` — Toggle between compact/expanded form

5. **RST defaults:**
   - SSB: 59 sent / 59 received
   - CW: 599 / 599
   - FT8/FT4: -10 / -10 (or auto from WSJT-X decode)
   - FM: 5/5

6. **Dupe warning:**
   - If callsign+band+mode matches an existing QSO, show amber warning badge
   - "Already worked W1AW on 20m SSB on 2026-02-10" in `caution-amber`
   - Does NOT block logging (dupes happen legitimately in contests, different dates, etc.)

7. **Success feedback:**
   - Brief green flash on the LOG button
   - Callsign card shows "+1 QSO logged" toast
   - Running QSO count in the header updates
   - Form resets but keeps sticky defaults (band, mode, frequency, power, activation ref)

### Component Structure

```
src/components/qso/
  QSOEntryForm.tsx          — Main form component
  QSOEntryCompact.tsx       — Inline mini-form for embedding in other pages
  CallsignInput.tsx         — Smart input with auto-complete + lookup trigger
  CallsignInfoCard.tsx      — Lookup result display card
  DupeWarningBadge.tsx      — Amber "already worked" indicator
  FrequencyInput.tsx        — Freq input with band auto-detect
  ModeSelector.tsx          — Mode dropdown/segmented control
  RSTInput.tsx              — RST input with mode-aware defaults
  ActivationFields.tsx      — POTA/SOTA/IOTA collapsible section
  QSOSuccessToast.tsx       — Brief confirmation after logging
```

### Styling

- Background: `void-black` (#0a0a1a)
- Card backgrounds: `deep-space` with 1px `panel` border
- Primary action (LOG button): `plasma-orange` background, white text, large tap target (min 48px height)
- Auto-filled fields: subtle `signal-green` left border indicating data source
- Dupe warning: `caution-amber` badge
- Success state: `signal-green` flash animation
- Typography: system font stack, 16px minimum for mobile inputs (prevents iOS zoom)

---

## 7. QSO Log Viewer

### Design

The log viewer is a paginated, filterable, sortable table that works with 100K+ QSOs by querying IndexedDB with cursor-based pagination (not loading all entries into memory).

### Layout: Desktop

```
┌──────────────────────────────────────────────────────────────────────────┐
│  QSO Log                                     Stats ◉  Export ▼  ⚙     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──── Filters Bar ──────────────────────────────────────────────────┐  │
│  │ 🔍 Search callsign...  │ Band ▼ │ Mode ▼ │ Date ▼ │ Clear All  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──── Stats Strip (optional, toggleable) ───────────────────────────┐  │
│  │  Total: 1,247  │  Today: 12  │  DXCC: 89  │  Grids: 203          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──── Log Table ────────────────────────────────────────────────────┐  │
│  │ □ │ Date ▼    │ Time  │ Callsign │ Band │ Mode │ RST │ Grid │ ✓ │  │
│  │───│───────────│───────│──────────│──────│──────│─────│──────│───│  │
│  │ □ │ 2026-02-12│ 14:32 │ W1AW     │ 20m  │ SSB  │ 59  │ FN31 │ L │  │
│  │ □ │ 2026-02-12│ 14:28 │ DL1ABC   │ 20m  │ CW   │ 599 │ JO31 │   │  │
│  │ □ │ 2026-02-12│ 13:55 │ JA1XYZ   │ 15m  │ FT8  │ -12 │ PM95 │LE│  │
│  │   │  ...      │       │          │      │      │     │      │   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──── Pagination ───────────────────────────────────────────────────┐  │
│  │ ◀ Previous  │  Page 1 of 25  │  Next ▶  │  50 per page ▼        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Confirmation column legend:** L = LoTW, E = eQSL, C = ClubLog, Q = QRZ.com

### Layout: Mobile

Entries rendered as cards instead of table rows:

```
┌──────────────────────────────┐
│  W1AW                14:32  │
│  20m SSB  FN31pr     59/59  │
│  ARRL HQ, Newington  [L][E] │
└──────────────────────────────┘
```

### Features

1. **Search**: Full-text search across callsign, name, QTH, notes, grid. Debounced 300ms.

2. **Filters**: Band, mode, date range, activation program, contest, confirmed status. Persist across sessions via `qsoStore.filters`.

3. **Sort**: Click column headers. Default: date descending (most recent first).

4. **Inline edit**: Click a cell to edit in-place. Changes save to IndexedDB immediately and enqueue for sync.

5. **Bulk actions**: Select multiple rows for:
   - Delete (soft delete)
   - Export ADIF
   - Mark QSL sent
   - Upload to LoTW/eQSL/ClubLog

6. **Statistics dashboard** (toggle via Stats button):
   - Total QSOs, unique callsigns, unique DXCC, unique grids
   - Band/mode breakdown (horizontal bar chart)
   - Daily rate trend (sparkline)
   - DXCC map (colored world map showing worked entities)
   - Grid map (colored Maidenhead grid overlay)

7. **Export**:
   - ADIF 3.1.4 export (full log or filtered selection)
   - Cabrillo 3.0 export (for contest sessions)
   - CSV export
   - Clipboard copy (single QSO or selection)

### Component Structure

```
src/components/qso/
  QSOLogViewer.tsx          — Main viewer container
  QSOLogTable.tsx           — Desktop table view
  QSOLogCards.tsx           — Mobile card view
  QSOLogFilters.tsx         — Filter bar
  QSOLogStats.tsx           — Statistics dashboard
  QSOLogPagination.tsx      — Page controls
  QSOInlineEditor.tsx       — In-place cell editor
  QSOBulkActions.tsx        — Multi-select action bar
  QSOExportMenu.tsx         — Export format picker
  QSODetailModal.tsx        — Full QSO detail view (centered modal)
```

### Performance

- **Cursor-based pagination**: Query IndexedDB with `openCursor()` using index, skip `offset`, take `limit`. Never load all entries.
- **Virtual scrolling** (future): For very large logs (50K+), use `@tanstack/virtual` for the table body.
- **Memoized filter/sort**: useMemo on the filtered/sorted dataset within each page.
- **Lazy statistics**: Stats computed on demand (not on every re-render) via a dedicated `useQSOStats()` hook that queries IndexedDB.

---

## 8. Conflict Resolution UI

### When Conflicts Appear

A conflict is recorded when:

1. During a pull, a remote entry has `version > localVersion`
2. AND the local version has unsynced changes in the write queue
3. AND the changes affect the same non-auto-mergeable fields

This is rare in practice (requires editing the same QSO on two devices while both are offline), but must be handled gracefully.

### Conflict Indicator

A persistent badge appears in the app header next to the sync status indicator:

```
┌─────────────────────────────────────────────────────────┐
│  Propulse    [Dashboard] [Log] [Map] ...    🔄 ⚠️ 2    │
└─────────────────────────────────────────────────────────┘
                                              │    └── conflict count
                                              └── sync status
```

Clicking the conflict badge opens the Conflict Resolution Modal.

### Conflict Resolution Modal

A **centered modal** (per CLAUDE.md rules — never a flyout) with a GitHub-merge-style diff view:

```
┌──────────────────────────────────────────────────────────────────┐
│  Resolve Sync Conflict                                     [✕]  │
│  QSO: W1AW on 2026-02-12 14:32 UTC                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ This Device ─────────┐    ┌─ Other Device ───────────┐     │
│  │ (MacBook, 2 hours ago)│    │ (iPad, 30 minutes ago)   │     │
│  └───────────────────────┘    └──────────────────────────┘     │
│                                                                  │
│  ┌──── Conflicting Fields ───────────────────────────────────┐  │
│  │                                                            │  │
│  │  RST Sent                                                  │  │
│  │  ┌──────────┐          ┌──────────┐                       │  │
│  │  │  59      │ ◉ local  │  57      │ ○ remote              │  │
│  │  └──────────┘          └──────────┘                       │  │
│  │                                                            │  │
│  │  Notes                                                     │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ "Great signal, good contact"  │ ◉ local             │  │  │
│  │  │ "Worked during POTA K-1234"   │ ○ remote            │  │  │
│  │  │ [merge both ▼]                │ ○ merge              │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──── Unchanged Fields (collapsed) ─────────────────────────┐  │
│  │  Callsign: W1AW  Band: 20m  Mode: SSB  Freq: 14.250 ... │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  [Keep Mine]      [Keep Theirs]      [Save Merged]        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Resolution Options

For each conflicting field, the operator can choose:

- **Local value** (radio button, default)
- **Remote value** (radio button)
- **Merge** (for text fields like notes — concatenate or custom edit)

Three action buttons at the bottom:

- **Keep Mine**: Accept all local values, push to Supabase
- **Keep Theirs**: Accept all remote values, save to IndexedDB
- **Save Merged**: Apply per-field selections, save and push

### Implementation

```typescript
// src/components/qso/ConflictResolutionModal.tsx

interface ConflictField {
  field: string;
  label: string;
  localValue: string | number | boolean | null;
  remoteValue: string | number | boolean | null;
  resolution: "local" | "remote" | "merged";
  mergedValue?: string;
}
```

After resolution:

1. Update IndexedDB entry with resolved data
2. Increment version to `max(local, remote) + 1`
3. Enqueue push to Supabase
4. Remove conflict from `sync_conflicts` table
5. Update conflict count badge

### Component Structure

```
src/components/qso/
  ConflictResolutionModal.tsx  — Main modal
  ConflictFieldRow.tsx         — Per-field diff view with radio buttons
  ConflictBadge.tsx            — Header badge showing conflict count
```

---

## 9. Phase 2: Daemon Static Serving

### Goal

The bridge daemon (already running on `localhost:9867` for rig control) serves the built Propulse app on `localhost:3173`, enabling fully offline operation without needing Vercel/internet access.

### Architecture

```
┌─────────────────────────────────────┐
│         Bridge Daemon (Node.js)     │
│                                      │
│  :9867 — WebSocket (rig control)    │
│  :3173 — HTTP (static app files)    │  ← NEW
│                                      │
│  dist/                               │
│  ├── index.html                      │
│  ├── assets/                         │
│  │   ├── index-abc123.js             │
│  │   ├── index-def456.css            │
│  │   └── ...                         │
│  └── propulse.svg                    │
└─────────────────────────────────────┘
```

### Changes to `bridge/src/server.ts`

Add an HTTP server alongside the existing WebSocket server:

```typescript
import http from "http";
import fs from "fs";
import path from "path";

const STATIC_PORT = parseInt(process.env.BRIDGE_STATIC_PORT ?? "3173", 10);
const DIST_DIR = path.resolve(__dirname, "../../dist");

function startStaticServer(): void {
  // Only start if dist/ exists (bridge can run without it)
  if (!fs.existsSync(DIST_DIR)) {
    logger.info("No dist/ directory found — static server disabled");
    return;
  }

  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".woff2": "font/woff2",
    ".json": "application/json",
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(
      DIST_DIR,
      req.url === "/" ? "/index.html" : req.url!,
    );

    // SPA fallback: if file doesn't exist and isn't an asset, serve index.html
    if (!fs.existsSync(filePath) && !path.extname(filePath)) {
      filePath = path.join(DIST_DIR, "index.html");
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";

    // Cache static assets aggressively (they have content hashes in filenames)
    const cacheControl =
      ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable";

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  server.listen(STATIC_PORT, "127.0.0.1", () => {
    logger.info("Static server listening", {
      host: "127.0.0.1",
      port: STATIC_PORT,
      distDir: DIST_DIR,
    });
  });
}
```

### Changes to `scripts/setup.sh`

Add an optional step that copies `dist/` into the bridge directory:

```bash
# After bridge build step:
if [ -d "$PROJECT_DIR/dist" ]; then
  info "Copying app files to bridge for offline serving..."
  cp -r "$PROJECT_DIR/dist" "$BRIDGE_DIR/dist"
  success "App files ready for offline serving on localhost:3173"
fi
```

### Changes to `bridge/package.json`

Add a `build:full` script:

```json
{
  "scripts": {
    "build:full": "cd .. && npm run build && cp -r dist bridge/dist && cd bridge && npm run build"
  }
}
```

### Bridge Welcome Message Enhancement

The bridge welcome message already includes `capabilities`. Add `staticServer`:

```typescript
const welcomeMessage = createMessage("bridge.welcome", {
  clientId,
  serverVersion: "0.3.0",
  capabilities: ["rig", "contest", "sync", "cluster", "wsjtx", "static"],
  staticServerUrl: fs.existsSync(DIST_DIR)
    ? `http://127.0.0.1:${STATIC_PORT}`
    : null,
  // ...existing fields...
});
```

---

## 10. Phase 3: Capacitor Outline

### Goal

Wrap Propulse in a native mobile shell using Capacitor for iOS and Android app store distribution, while keeping the same codebase.

### Architecture

```
propulse/
├── src/                    ← Shared React codebase
├── android/                ← Capacitor Android project
├── ios/                    ← Capacitor iOS project
├── capacitor.config.ts     ← Capacitor configuration
└── package.json            ← Add @capacitor/* deps
```

### Key Decisions

1. **Capacitor over React Native**: Same web codebase, no rewrite. IndexedDB, Service Worker, and all existing code works in the WebView.

2. **Native plugins needed**:
   - `@capacitor/filesystem` — ADIF file export/import
   - `@capacitor/share` — Share QSO cards, ADIF files
   - `@capacitor/network` — Better online/offline detection than `navigator.onLine`
   - `@capacitor/local-notifications` — DX alerts, sync complete, QSL confirmations
   - `@capacitor/haptics` — Tactile feedback on QSO log
   - `@capacitor/keyboard` — Keyboard management for QSO entry
   - `@capacitor/status-bar` — Dark status bar matching void-black theme
   - `@capacitor/splash-screen` — Branded launch screen

3. **Bridge communication**: On mobile, there's no localhost bridge daemon. Options:
   - **Option A**: Bluetooth LE bridge (Capacitor BLE plugin) to a Raspberry Pi running the bridge
   - **Option B**: Same-network WebSocket connection to desktop bridge via mDNS discovery
   - **Option C**: No rig control on mobile (manual entry only, which is fine for POTA/SOTA)

4. **Offline behavior**: Identical to PWA. IndexedDB works in Capacitor's WebView. Sync engine unchanged.

5. **App Store considerations**:
   - iOS: Must comply with App Store guidelines. No "thin wrapper" rejection risk because the app has substantial native plugin usage.
   - Android: More lenient. PWA shortcut also an option.

### Implementation Steps (High-Level)

1. `npm install @capacitor/core @capacitor/cli`
2. `npx cap init propulse com.propulse.app`
3. Configure `capacitor.config.ts` with server URL and plugins
4. `npx cap add ios && npx cap add android`
5. Add platform-specific splash screens and icons
6. Implement native plugin wrappers in `src/lib/native/`
7. Conditional imports: `isPlatform('capacitor')` checks
8. Test on physical devices
9. App Store submission

### Timeline Estimate

Phase 3 is future work. No implementation in this plan cycle. Estimated 2-3 weeks of dedicated effort after Phase 1 and 2 are complete.

---

## 11. File Inventory

### New Files to Create

| File                                                              | Purpose                                             |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| `supabase/migrations/20260216000000_qso_logging_enhancements.sql` | Schema migration                                    |
| `src/stores/qsoStore.ts`                                          | Zustand store for QSO entry + log viewer state      |
| `src/lib/sync/conflict.ts`                                        | Field-level conflict detection and auto-merge logic |
| `src/lib/sync/deviceId.ts`                                        | Stable device ID generation and persistence         |
| `src/components/qso/QSOEntryForm.tsx`                             | Main QSO entry form                                 |
| `src/components/qso/QSOEntryCompact.tsx`                          | Inline mini-form for embedding                      |
| `src/components/qso/CallsignInput.tsx`                            | Smart callsign input with auto-lookup               |
| `src/components/qso/CallsignInfoCard.tsx`                         | Lookup result display                               |
| `src/components/qso/DupeWarningBadge.tsx`                         | Dupe indicator                                      |
| `src/components/qso/FrequencyInput.tsx`                           | Frequency input with band auto-detect               |
| `src/components/qso/ModeSelector.tsx`                             | Mode dropdown/segmented control                     |
| `src/components/qso/RSTInput.tsx`                                 | RST input with mode-aware defaults                  |
| `src/components/qso/ActivationFields.tsx`                         | POTA/SOTA collapsible section                       |
| `src/components/qso/QSOSuccessToast.tsx`                          | Log confirmation toast                              |
| `src/components/qso/QSOLogViewer.tsx`                             | Main log viewer container                           |
| `src/components/qso/QSOLogTable.tsx`                              | Desktop table view                                  |
| `src/components/qso/QSOLogCards.tsx`                              | Mobile card view                                    |
| `src/components/qso/QSOLogFilters.tsx`                            | Filter bar                                          |
| `src/components/qso/QSOLogStats.tsx`                              | Statistics dashboard                                |
| `src/components/qso/QSOLogPagination.tsx`                         | Pagination controls                                 |
| `src/components/qso/QSOInlineEditor.tsx`                          | In-place cell editor                                |
| `src/components/qso/QSOBulkActions.tsx`                           | Multi-select action bar                             |
| `src/components/qso/QSOExportMenu.tsx`                            | Export format picker                                |
| `src/components/qso/QSODetailModal.tsx`                           | Full QSO detail (centered modal)                    |
| `src/components/qso/ConflictResolutionModal.tsx`                  | Conflict merge UI                                   |
| `src/components/qso/ConflictFieldRow.tsx`                         | Per-field diff row                                  |
| `src/components/qso/ConflictBadge.tsx`                            | Header conflict count badge                         |
| `src/components/qso/index.ts`                                     | Barrel export                                       |
| `src/components/pwa/UpdatePrompt.tsx`                             | PWA update notification toast                       |
| `src/components/pwa/OfflineIndicator.tsx`                         | Offline status banner                               |
| `src/hooks/useQSOEntry.ts`                                        | Hook wrapping qsoStore form actions                 |
| `src/hooks/useQSOStats.ts`                                        | Hook for computed log statistics                    |
| `src/hooks/useCallsignLookup.ts`                                  | Hook for multi-source callsign lookup               |
| `src/hooks/useDupeCheck.ts`                                       | Hook for real-time dupe checking                    |
| `src/hooks/useConflicts.ts`                                       | Hook for sync conflict state                        |
| `src/hooks/useOfflineStatus.ts`                                   | Hook for online/offline state                       |
| `src/lib/adif/export.ts`                                          | ADIF 3.1.4 export generator                         |
| `src/lib/adif/import.ts`                                          | ADIF import parser with validation                  |
| `src/lib/adif/types.ts`                                           | ADIF field definitions                              |
| `src/lib/adif/cabrillo.ts`                                        | Cabrillo 3.0 export                                 |
| `src/lib/utils/bandFromFreq.ts`                                   | Frequency-to-band mapping utility                   |
| `src/lib/utils/rstDefaults.ts`                                    | Mode-aware RST default values                       |
| `src/types/qso.ts`                                                | QSO-specific TypeScript types                       |
| `src/pages/QSOEntryPage.tsx`                                      | Full-page QSO entry (mobile)                        |

### Existing Files to Modify

| File                                     | Change                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| `src/lib/db/types.ts`                    | Extend `LogEntry` with new fields (version, dxcc, activation, etc.)          |
| `src/lib/db/config.ts`                   | Bump `DB_CONFIG.version` from 3 to 4                                         |
| `src/lib/db/index.ts`                    | Add version 4 upgrade handler (new indexes), add to `ALL_DB_NAMES` if needed |
| `src/lib/db/logStore.ts`                 | Add pagination functions, dupe check queries                                 |
| `src/lib/sync/types.ts`                  | Add `'sync_conflicts'` and `'user_devices'` to `SyncableTable`               |
| `src/lib/sync/modules/logbookSync.ts`    | Add field-level conflict detection, version tracking                         |
| `src/lib/sync/modules/index.ts`          | Register qsoSync module (if separate from logbookSync)                       |
| `src/lib/sync/writeQueue.ts`             | Increase `MAX_ENTRIES` from 500 to 2000, add `hasPendingForId()`             |
| `src/lib/sync/SyncManager.ts`            | Add Background Sync registration (progressive)                               |
| `vite.config.ts`                         | Enhance PWA workbox config (callsign cache, background sync)                 |
| `src/App.tsx`                            | Add routes for `/log/entry`, `/log/view`, register QSO page components       |
| `src/components/layout/Header.tsx`       | Add conflict badge, QSO count, offline indicator                             |
| `src/components/layout/BottomTabBar.tsx` | Add Log tab for mobile                                                       |
| `src/components/layout/ToolsDrawer.tsx`  | Add "QSO Log" entry                                                          |
| `src/pages/Logbook.tsx`                  | Integrate new QSOLogViewer, replace basic implementation                     |
| `package.json`                           | No new deps needed (idb, vite-plugin-pwa, zustand already installed)         |
| `bridge/src/server.ts`                   | (Phase 2) Add static file server on :3173                                    |
| `bridge/src/types.ts`                    | (Phase 2) Add static server capability flag                                  |
| `scripts/setup.sh`                       | (Phase 2) Add dist copy step                                                 |
| `bridge/package.json`                    | (Phase 2) Add `build:full` script                                            |

---

## 12. Implementation Order

### Parallel Execution Strategy

```
Phase A: SEQUENTIAL FOUNDATION (Waves 1→2→3)
  ┌─────────┐   ┌─────────┐   ┌─────────┐
  │ Wave 1  │──▶│ Wave 2  │──▶│ Wave 3  │
  │ Types   │   │  Sync   │   │ qsoStore│
  │ DB/Migr │   │ Conflict│   │  Hooks  │
  │ Utils   │   │ DeviceID│   │         │
  └─────────┘   └─────────┘   └─────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
Phase B: PARALLEL FEATURE FAN-OUT (Waves 4, 5, 6 simultaneously)
  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
  │  Agent B1   │ │  Agent B2   │ │  Agent B3   │
  │  Wave 4     │ │  Wave 5     │ │  Wave 6     │
  │  QSO Entry  │ │  Log Viewer │ │  Conflict + │
  │  UI (11)    │ │  + ADIF(14) │ │  PWA (6)    │
  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
         │               │               │
         └───────────────┼───────────────┘
                         ▼
Phase C: SEQUENTIAL INTEGRATION (Waves 7→8)
  ┌─────────┐   ┌─────────┐
  │ Wave 7  │──▶│ Wave 8  │
  │ Routing │   │ Daemon  │
  │ Wiring  │   │ Static  │
  └─────────┘   └─────────┘
```

**File Ownership Matrix (Phase B — prevents conflicts)**:

| File/Directory                       | Agent B1 (Entry) | Agent B2 (Viewer) | Agent B3 (Conflict+PWA)    |
| ------------------------------------ | ---------------- | ----------------- | -------------------------- |
| `src/components/qso/Callsign*.tsx`   | OWNS             | —                 | —                          |
| `src/components/qso/Frequency*.tsx`  | OWNS             | —                 | —                          |
| `src/components/qso/Mode*.tsx`       | OWNS             | —                 | —                          |
| `src/components/qso/RST*.tsx`        | OWNS             | —                 | —                          |
| `src/components/qso/Dupe*.tsx`       | OWNS             | —                 | —                          |
| `src/components/qso/Activation*.tsx` | OWNS             | —                 | —                          |
| `src/components/qso/QSOSuccess*.tsx` | OWNS             | —                 | —                          |
| `src/components/qso/QSOEntry*.tsx`   | OWNS             | —                 | —                          |
| `src/pages/QSOEntryPage.tsx`         | OWNS             | —                 | —                          |
| `src/components/qso/QSOLog*.tsx`     | —                | OWNS              | —                          |
| `src/components/qso/QSOInline*.tsx`  | —                | OWNS              | —                          |
| `src/components/qso/QSODetail*.tsx`  | —                | OWNS              | —                          |
| `src/components/qso/QSOBulk*.tsx`    | —                | OWNS              | —                          |
| `src/components/qso/QSOExport*.tsx`  | —                | OWNS              | —                          |
| `src/lib/adif/*`                     | —                | OWNS              | —                          |
| `src/components/qso/Conflict*.tsx`   | —                | —                 | OWNS                       |
| `src/components/pwa/*`               | —                | —                 | OWNS                       |
| `src/components/qso/index.ts`        | —                | —                 | OWNS (barrel, after B1+B2) |

### Wave 1: Foundation (IndexedDB + Types + Migration)

**Goal**: Extended data model, ready for QSO storage.

1. `src/types/qso.ts` — TypeScript types
2. `src/lib/db/types.ts` — Extend `LogEntry`
3. `src/lib/db/config.ts` — Version bump to 4
4. `src/lib/db/index.ts` — Version 4 upgrade handler
5. `src/lib/db/logStore.ts` — Add pagination, dupe check
6. `supabase/migrations/20260216000000_qso_logging_enhancements.sql` — Migration
7. `src/lib/utils/bandFromFreq.ts` — Band/frequency utility
8. `src/lib/utils/rstDefaults.ts` — RST defaults

**Verify**: `tsc --noEmit` passes, IndexedDB upgrade works.

**Quality Gate**:

- [ ] Run `principal-code-reviewer` agent on all Wave 1 files
- [ ] Run `final-review-completeness` agent — zero TODOs, zero mocks, zero placeholders
- [ ] Address all critical/high findings before proceeding
- [ ] Confirm types are exhaustive, migrations are reversible, utilities have edge case coverage

### Wave 2: Sync Enhancement

**Goal**: Field-level conflict detection, version tracking, device ID.

1. `src/lib/sync/deviceId.ts`
2. `src/lib/sync/conflict.ts`
3. `src/lib/sync/writeQueue.ts` — MAX_ENTRIES increase, `hasPendingForId()`
4. `src/lib/sync/types.ts` — New SyncableTable entries
5. `src/lib/sync/modules/logbookSync.ts` — Version-aware push/pull

**Verify**: `tsc --noEmit`, manual test with two browser tabs.

**Quality Gate**:

- [ ] Run `principal-code-reviewer` agent on all Wave 2 files
- [ ] Run `final-review-completeness` agent — zero TODOs, zero mocks, zero placeholders
- [ ] Address all critical/high findings before proceeding
- [ ] Verify conflict detection handles: simultaneous edits, offline queue overflow, version gaps, partial sync failures

### Wave 3: qsoStore

**Goal**: Reactive Zustand store with full QSO lifecycle.

1. `src/stores/qsoStore.ts`
2. `src/hooks/useQSOEntry.ts`
3. `src/hooks/useCallsignLookup.ts`
4. `src/hooks/useDupeCheck.ts`
5. `src/hooks/useQSOStats.ts`
6. `src/hooks/useConflicts.ts`
7. `src/hooks/useOfflineStatus.ts`

**Verify**: `tsc --noEmit`, can log QSO from console.

**Quality Gate**:

- [ ] Run `principal-code-reviewer` agent on all Wave 3 files
- [ ] Run `final-review-completeness` agent — zero TODOs, zero mocks, zero placeholders
- [ ] Address all critical/high findings before proceeding
- [ ] Verify store actions: add/edit/delete/quickLog lifecycle, persist migration path, hook reactivity

### Wave 4: QSO Entry UI

**Goal**: The "holy shit" moment — effortless QSO entry.

1. `src/components/qso/CallsignInput.tsx`
2. `src/components/qso/CallsignInfoCard.tsx`
3. `src/components/qso/FrequencyInput.tsx`
4. `src/components/qso/ModeSelector.tsx`
5. `src/components/qso/RSTInput.tsx`
6. `src/components/qso/DupeWarningBadge.tsx`
7. `src/components/qso/ActivationFields.tsx`
8. `src/components/qso/QSOSuccessToast.tsx`
9. `src/components/qso/QSOEntryForm.tsx`
10. `src/components/qso/QSOEntryCompact.tsx`
11. `src/pages/QSOEntryPage.tsx` (mobile)

**Verify**: `tsc --noEmit`, `npm run build`, manual E2E test.

**Quality Gate**:

- [ ] Run `principal-code-reviewer` agent on all Wave 4 files
- [ ] Run `final-review-completeness` agent — zero TODOs, zero mocks, zero placeholders
- [ ] Address all critical/high findings before proceeding
- [ ] UX audit: Tab flow, keyboard navigation, touch targets ≥44px, progressive disclosure, ARIA roles
- [ ] Confirm the "holy shit" moment — entry should feel instant, effortless, delightful
- [ ] Verify responsive layout: desktop compact panel, mobile full-page, tablet hybrid

### Wave 5: QSO Log Viewer

**Goal**: Search, filter, sort, paginate, export.

1. `src/components/qso/QSOLogFilters.tsx`
2. `src/components/qso/QSOLogTable.tsx`
3. `src/components/qso/QSOLogCards.tsx`
4. `src/components/qso/QSOLogPagination.tsx`
5. `src/components/qso/QSOInlineEditor.tsx`
6. `src/components/qso/QSODetailModal.tsx`
7. `src/components/qso/QSOBulkActions.tsx`
8. `src/components/qso/QSOLogStats.tsx`
9. `src/components/qso/QSOExportMenu.tsx`
10. `src/components/qso/QSOLogViewer.tsx`
11. `src/lib/adif/types.ts`
12. `src/lib/adif/export.ts`
13. `src/lib/adif/import.ts`
14. `src/lib/adif/cabrillo.ts`

**Verify**: `tsc --noEmit`, `npm run build`, test with 1000+ QSOs.

**Quality Gate**:

- [ ] Run `principal-code-reviewer` agent on all Wave 5 files
- [ ] Run `final-review-completeness` agent — zero TODOs, zero mocks, zero placeholders
- [ ] Address all critical/high findings before proceeding
- [ ] Performance audit: Virtual scrolling handles 10K+ QSOs without jank, pagination is smooth
- [ ] ADIF import/export round-trip: Export → import produces identical data
- [ ] Bulk actions have proper undo/confirmation, no accidental mass deletion

### Wave 6: Conflict Resolution + PWA Enhancements

**Goal**: Conflict UI, offline indicator, update prompt.

1. `src/components/qso/ConflictFieldRow.tsx`
2. `src/components/qso/ConflictResolutionModal.tsx`
3. `src/components/qso/ConflictBadge.tsx`
4. `src/components/pwa/OfflineIndicator.tsx`
5. `src/components/pwa/UpdatePrompt.tsx`
6. `src/components/qso/index.ts` — Barrel export

**Verify**: Full build, PWA audit (Lighthouse), offline test.

**Quality Gate**:

- [ ] Run `principal-code-reviewer` agent on all Wave 6 files
- [ ] Run `final-review-completeness` agent — zero TODOs, zero mocks, zero placeholders
- [ ] Address all critical/high findings before proceeding
- [ ] Conflict UI: Test with 1, 5, 20+ simultaneous conflicts — "boop boop boop" UX must be fast and satisfying
- [ ] PWA: Lighthouse score ≥90, Service Worker caching verified, update prompt works
- [ ] Offline indicator: Visible but non-intrusive, auto-dismisses on reconnect

### Wave 7: Integration + Routing

**Goal**: Wire everything into the app shell.

1. `src/App.tsx` — Add routes
2. `src/components/layout/Header.tsx` — Conflict badge, offline indicator
3. `src/components/layout/BottomTabBar.tsx` — Log tab
4. `src/components/layout/ToolsDrawer.tsx` — QSO Log entry
5. `src/pages/Logbook.tsx` — Replace with new viewer
6. `vite.config.ts` — Enhanced PWA config

**Verify**: Full build, complete manual walkthrough, lint clean.

**Quality Gate**:

- [ ] Run `principal-code-reviewer` agent on all Wave 7 files
- [ ] Run `final-review-completeness` agent — zero TODOs, zero mocks, zero placeholders
- [ ] Address all critical/high findings before proceeding
- [ ] Full integration walkthrough: New user → first QSO → sync → view log → edit → export → offline → back online
- [ ] Navigation: All routes reachable from header/drawer/bottom bar, no dead ends
- [ ] Mobile: Complete flow on 375px viewport, no horizontal overflow, touch-friendly throughout

### Wave 8: Phase 2 — Daemon Static Server

**Goal**: Bridge serves the app on localhost:3173.

1. `bridge/src/server.ts` — Add HTTP static server
2. `bridge/src/types.ts` — Add capability flag
3. `bridge/package.json` — Add `build:full` script
4. `scripts/setup.sh` — Add dist copy step

**Verify**: `cd bridge && npm run build`, access localhost:3173 in browser.

**Quality Gate**:

- [ ] Run `principal-code-reviewer` agent on all Wave 8 files
- [ ] Run `final-review-completeness` agent — zero TODOs, zero mocks, zero placeholders
- [ ] Address all critical/high findings before proceeding
- [ ] Daemon serves full app at localhost:3173 — all features work identically to hosted version
- [ ] Setup scripts updated and tested on fresh install scenario

### Final Deliverable Review

> **MANDATORY** — After all 8 waves, run both review agents on the ENTIRE deliverable:

- [ ] `final-review-completeness` — Full codebase scan across all 42+ new files and 20+ modified files
- [ ] `principal-code-reviewer` — Comprehensive quality assessment of the complete QSO logging system
- [ ] Address every finding — no exceptions, no deferral
- [ ] Full `tsc --noEmit && npm run build && npm run lint` clean
- [ ] Complete manual E2E walkthrough on desktop and mobile

---

## 13. Quality Philosophy & Review Gates

> _"Every feature should be built with love and care. Take your time, do it right. There is no need to shortcut or bypass. We are all about delighting the users and completing all items."_

### Principles

1. **No shortcuts, no bypasses.** Every component ships complete — no `// TODO` comments, no placeholder UI, no "good enough for now" compromises. If a feature isn't ready, it doesn't ship.

2. **Built with love and care.** Each interaction should feel intentional. Transitions should be smooth, error messages should be helpful, and edge cases should be handled gracefully. The user should never feel like they're fighting the software.

3. **Review agents at every phase.** After each wave, both `principal-code-reviewer` and `final-review-completeness` agents run. All critical and high findings must be resolved before the next wave begins. This is a hard gate, not a suggestion.

4. **Delight is the metric.** The target reaction is "holy shit, I never knew it could be this easy." Every design decision should be measured against this bar. If an interaction feels merely functional, it's not done yet.

5. **Progressive disclosure, not complexity hiding.** Simple things should be simple. Advanced features should be discoverable, not buried. A new operator logs their first QSO in under 30 seconds. A contest veteran finds every power-user feature exactly where they'd expect it.

6. **Accessibility is non-negotiable.** Keyboard navigation, screen reader support, ARIA roles, touch targets ≥44px, color-blind-safe indicators. Ham radio has operators of all abilities — the software should work for all of them.

7. **Performance is a feature.** 10K QSOs load instantly. Conflict resolution is snappy. Offline transitions are seamless. If the user notices the software working, we've already failed.

### Review Gate Protocol

After completing each wave:

```
1. tsc --noEmit          → Zero type errors
2. npm run build         → Clean production build
3. npm run lint          → Zero lint warnings
4. principal-code-reviewer → Engineering quality audit
5. final-review-completeness → No incomplete items
6. Fix all findings      → Hard gate, no exceptions
7. Manual verification   → Wave-specific checks pass
8. Proceed to next wave  → Only after all 7 above pass
```

### What Gets Reviewed

| Aspect            | Criteria                                                                         |
| ----------------- | -------------------------------------------------------------------------------- |
| **Correctness**   | All functions handle edge cases, no silent failures                              |
| **Completeness**  | No TODOs, no mocks, no placeholder text, no stub functions                       |
| **UX Quality**    | Interactions feel polished, transitions are smooth, feedback is immediate        |
| **Accessibility** | Keyboard nav, ARIA roles, focus management, screen reader tested                 |
| **Performance**   | No unnecessary re-renders, efficient queries, smooth scrolling                   |
| **Security**      | Input validation, sanitized output, no XSS vectors, parameterized queries        |
| **Consistency**   | Follows existing codebase patterns, Tailwind color system, component conventions |

---

## Appendix A: ADIF Field Mapping

| LogEntry Field   | ADIF Field       | Notes                                    |
| ---------------- | ---------------- | ---------------------------------------- |
| callsign         | CALL             | Required                                 |
| frequency        | FREQ             | In MHz (we store kHz, convert on export) |
| mode             | MODE             |                                          |
| band             | BAND             |                                          |
| date             | QSO_DATE         | YYYYMMDD format in ADIF                  |
| timeOn           | TIME_ON          | HHMM format in ADIF                      |
| timeOff          | TIME_OFF         |                                          |
| rstSent          | RST_SENT         |                                          |
| rstRcvd          | RST_RCVD         |                                          |
| grid             | GRIDSQUARE       |                                          |
| name             | NAME             |                                          |
| qth              | QTH              |                                          |
| notes            | COMMENT          |                                          |
| qslSent          | QSL_SENT         |                                          |
| qslRcvd          | QSL_RCVD         |                                          |
| lotw             | LOTW_QSL_SENT    |                                          |
| eqsl             | EQSL_QSL_SENT    |                                          |
| stationCallsign  | STATION_CALLSIGN |                                          |
| operatorCallsign | OPERATOR         |                                          |
| country          | COUNTRY          |                                          |
| dxcc             | DXCC             |                                          |
| cqZone           | CQZ              |                                          |
| ituZone          | ITUZ             |                                          |
| txPower          | TX_PWR           |                                          |
| myGrid           | MY_GRIDSQUARE    |                                          |
| propMode         | PROP_MODE        |                                          |
| satName          | SAT_NAME         |                                          |
| satMode          | SAT_MODE         |                                          |
| mySig            | MY_SIG           |                                          |
| mySigInfo        | MY_SIG_INFO      |                                          |
| sig              | SIG              |                                          |
| sigInfo          | SIG_INFO         |                                          |
| contestId        | CONTEST_ID       |                                          |
| srx              | SRX              |                                          |
| stx              | STX              |                                          |
| srxString        | SRX_STRING       |                                          |
| stxString        | STX_STRING       |                                          |

## Appendix B: Competitive Advantage Summary

This implementation directly addresses the top competitive pain points from `docs/research/COMPETITIVE-ANALYSIS-2026.md`:

| Recommendation                 | How This Plan Addresses It                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| #1 Unified Logging Platform    | Single `log_entries` table handles daily, contest, POTA/SOTA via activation fields |
| #2 "Make QSO, Done"            | One-click `quickLog()` with rig auto-fill, auto-lookup, auto-sync                  |
| #3 Transparent QSL             | Unified confirmation columns (LoTW, eQSL, ClubLog, QRZ) in the log viewer          |
| #4 Cross-Platform Cloud-Native | IndexedDB offline-first + Supabase sync + PWA + future Capacitor                   |
| #5 Modern UI                   | Progressive disclosure, Tailwind dark theme, touch-friendly mobile                 |
| #6 Smart Setup                 | Zero-config QSO entry with rig auto-detect via bridge                              |
| #7 Dupe Checking               | Real-time cross-band/mode dupe check from IndexedDB                                |
| #8 Performance at Scale        | Cursor-based pagination, indexed queries, 50K+ local capacity                      |
| #9 POTA/SOTA Mode              | Dedicated activation fields with MY_SIG/SIG_INFO support                           |
| #10 Data Ownership             | Full ADIF export always available, IndexedDB is user's data                        |

## Appendix C: Open Questions

1. **Should the QSO entry form live on its own page (`/log/entry`) or be a collapsible panel on the existing Logbook page?** Recommendation: Both. Full page for mobile, collapsible panel above the log table for desktop.

2. **Should we support ADIF import during Phase 1?** Recommendation: Yes, but as a separate "Import" button on the log viewer, not part of the core entry flow. Critical for onboarding operators migrating from other loggers.

3. **Should contest QSOs from `contestStore` be merged into the same `log_entries` table?** Recommendation: Not yet. Contest QSOs live in `contest_qsos` with their own specialized fields. A future "Promote to Log" action could copy them to `log_entries` with appropriate field mapping.

4. **Background Sync API availability**: Only Chrome/Edge support it reliably. Should we add it as a progressive enhancement in Wave 6, or defer? Recommendation: Defer to a future polish pass. The existing SyncManager online/offline handlers are sufficient.

5. **Callsign lookup caching strategy**: The Service Worker caches callook.info responses for 24h. Should we also maintain a separate IndexedDB lookup cache with longer TTL? Recommendation: Yes — store lookup results in a new `callsignCache` IndexedDB store with 30-day TTL. This provides offline callsign data.
