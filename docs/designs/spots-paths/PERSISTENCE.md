# Saved library persistence (SP-02)

Tracking: [#512](https://github.com/crypticpy/propulse/issues/512). The foundation (#546) implements local storage primitives. The server delivery
adds authenticated transport and atomic publication. Neither claims the entire
SP-02 exit gate or switches production sync/view consumers. Migration and legacy
sync/import isolation follow under the same package.

## Ownership and revisions

`IndexedViewLibrary(ownerId)` opens a dedicated versioned IndexedDB database lazily.
Records are keyed by owner + kind + document ID; view, custom preset and display
assignment revisions are independent. It never imports active runtime stores.
Separate connections/tabs use real read/write transactions, not localStorage
read-modify-write or a process-local mutex. Inputs and persisted reads are validated.

`commitLocal` is an atomic local-only compare-and-swap. Expected revision 0 means
create; matching revision saves at revision+1. Deletion writes a tombstone retaining
the revision, so stale creates cannot resurrect a deleted view. An explicit restore
requires the tombstone revision. Operation receipts make retries idempotent and
reject reuse of an operation ID with different content. Storage failure is reported
as unavailable; it does not report an uncommitted write as saved.

`RevisionedViewRepository` implements the SP-01 view methods and adds custom preset
save, revision-aware deletion and pending replay. In local mode it may save library
records, but cannot publish to paired displays. In account mode it always persists
an immutable pending request before transport. It never silently falls back to a
local confirmed save when cloud service is unavailable.

## Pending requests and conflicts

At most 100 pending requests per owner, one per document. A second save to the same
pending document requires an explicit resolution choice; it cannot silently replace
the previous draft. Requests survive connection restart under their original owner.
Cloud acknowledgement validates owner, kind, document ID, expected resulting revision
and full payload, with order-independent JSON object comparison for JSONB transports.
Successful acknowledgement updates the library cache and removes the pending request
atomically with a receipt, so concurrent replay acknowledgements return the same
confirmed result. A replay never rolls back a newer cache revision. Newer cached revisions cannot be overwritten by older responses.

Offline/uncertain requests remain queued, including a lost acknowledgement after a
server commit. Transport MUST deduplicate operation IDs atomically with server writes;
CAS alone would report a false conflict when retrying a lost successful response.
Conflicts/rejections retain the draft and current server revision for review. Replay
does not automatically overwrite conflicts. An explicit discard/rebase followed by
a new request uses a new operation ID and the newly reviewed expected revision.
Another intervening save still causes a normal conflict.

Discard only removes the local request; it does not promise to cancel a request
already accepted by the server. A late response for a discarded request is not
reported as a still-pending request. Fetching the library later reconciles actual
server state. No operation changes a running view merely because the saved source
record changed.

## Authentication and lifecycle boundary

Owner IDs partition local storage; they are NOT server authorization. An account
repository also checks its supplied `currentOwner` before/after async transport and
before replay. Auth integration MUST dispose the old repository on every auth scope
change, including sign-out/sign-in to the same account. Disposal aborts requests,
closes that connection and prevents old responses from being applied. It preserves
durable drafts under the old owner rather than copying them into the next account.
The server must independently authenticate the actor and authorize document/display
ownership, including token-to-display binding. The authenticated server delivery below implements those checks; runtime auth
lifecycle wiring remains part of the next integration.

`getView` reads the validated owner cache (tombstones return null). Reads distinguish
failure from absence by throwing storage/lifecycle errors. Cloud pull will populate
the cache through `cache()`; cache updates leave pending drafts untouched. The UI
must not describe a cached library read as a fresh server fetch. SP-03 owns working
view slots and explicit load commands, not this saved-library connection.

## Widget validation and rollout

The pure catalog at `src/lib/hamclock/widgetSchemas.ts` shares the existing
recentContacts schema/defaults with its UI config module. Persistence rejects
unknown widget IDs/versions or invalid payloads rather than trusting the outer JSON
envelope. Future widget work must register a pure schema/version in this catalog;
do not import component trees or live Zustand stores into persistence/server code.
The UI reference schema keeps its existing behavior; no new dialog is introduced.

The foundation was additive except moving the existing schema/default pair to that
shared module. No production library/database opens until a caller explicitly
constructs and uses it. Legacy storage and sync remain intact in this first delivery;
the next migration must preserve rollback snapshots and stop migrated presentation
fields from applying to active views before SP-02 is accepted.

Validation covers two-tab CAS, distinct-document saves, owner partitions, tombstones,
operation reuse, storage rollback/recovery, malformed/future snapshots, widget catalog
validation, durable offline replay, lost acknowledgements, conflict retention,
account switches, mismatched responses, in-flight discard and distinct publication.

## Authenticated server delivery

The next delivery provides `/api/views/library` and the separate opt-in
`/api/displays/assignment?id=<uuid>` device endpoint. It adds an authenticated
HTTP transport, bounded pagination, database tables/RPC and database types.
Production runtime sync/migration remains a separate SP-02 delivery; constructing
or refreshing the transport does not alter a working view.

Owner requests reuse the strict verified-user boundary (no development bypass).
The API validates complete v1 payloads and widget schemas before invoking the
service-role-only RPC. The request's owner ID must equal the verified user.
Authenticated database clients can read only their own records via RLS and cannot
write tables, read operation receipts, or invoke trusted RPCs directly. Service
credentials never enter the browser. Request/response bodies are bounded to 600 KiB;
SQL has an additional 1 MiB envelope bound accounting for JSONB formatting.

`commit_view_library` atomically stores the document and idempotency receipt.
Transaction locks cover absent-row creates as well as updates, with separate owner,
document-kind and ID revisions. Conflicts include the current record, including
revisioned deletion tombstones. Same operation ID and same content replay the original
result; changed content is invalid. Receipts remain until account deletion to preserve
replay semantics; future retention must specify an explicit retry horizon first.

A display publication locks/checks the existing paired display row before receipt
replay or mutation. Deleted devices cascade assignment records; unpaired/reassigned
devices cannot replay the former owner's publications. The device read uses a single
SQL statement joining current ownership, token hash and assignment. It returns only
pairing state, a non-secret binding ID, and the complete versioned assignment, never
library records or tokens. The binding ID changes on ownership/token rotation, so
SP-10 can reset its revision baseline after a binding change even if it missed the
unpaired interval. Renames/heartbeats leave binding identity unchanged.
The same publication transaction updates the existing `displays.scene_config` delivery
column with the complete envelope. A trigger prevents older clients from bypassing
CAS once a revisioned assignment exists, and clears scene_config on owner changes.
Legacy scenes remain usable before first publication. The legacy state endpoint
returns 409 for versioned envelopes so older partial-scene consumers retain their
last valid state instead of misinterpreting the new shape. SP-10 will opt new consumers
into versioned assignment handling; saving a library view alone never publishes.

GET library pages contain validated records (including tombstones), at most ten per
page and within the byte budget. The cursor is the last returned kind/ID. Pagination
is a library refresh, not a transactionally frozen account snapshot; concurrent edits
are reconciled by per-record revision and later refresh. Callers must dispose on auth
scope change and check lifecycle before caching a page. Library refresh must never
activate a view. HTTP failures and mismatched acknowledgements leave uncertain saves
pending instead of claiming local-only success.

Apply the reviewed migration before enabling consumers. A missing database migration
returns service unavailable; this delivery does not apply SQL to a live database.
Rollback disables new consumers/endpoints while preserving tables and drafts; do not
drop saved libraries or receipts as an automatic rollback.

Validation commands:

- `npm run check:view-library:types` (also part of `npm run verify`).
- `npm run test:view-library:postgres -- --confirm-disposable-view-postgres` creates
  one ownership-verified PostgreSQL 17 container with no network, mounts or ports,
  runs the explicit view-library bootstrap/migration/fixtures, and removes only that
  container. It tests real concurrent creates, CAS, receipts, deletion/restoration,
  RLS/write denial, display ownership/token binding and post-unpair replay.
- API and transport tests cover strict payload/auth ownership, status/retry mapping,
  source-independent publication, bounded bodies/pages and malformed responses.
  SQL fixtures intentionally test storage primitives; API tests validate full configs.

The existing station SQL harness keeps its default namespace restriction. The new
runner explicitly selects the view-library namespace and an exact file list; neither
runner targets a live listener or replays unrelated migrations. Its synthetic display
bootstrap mirrors only the columns used here, not the entire production schema.

### Session-scoped library refresh

`ViewLibrarySync` owns one account session's repository and refresh cancellation.
Construction performs no I/O. Call `refresh()` explicitly to pull reusable library
records; call `repository.flushPending()` explicitly on reconnect to replay queued
saves. Refresh never sends saves or changes a running view. Concurrent refresh
requests share one pass. Pages commit independently, only advance revisions, and
retain pending drafts. Missing rows are not deletions; versioned tombstones are.
An interrupted pass keeps earlier validated pages and retries from the beginning.

Every auth transition must dispose the old coordinator, including sign-out and
sign-in to the same owner, before creating its replacement. The current-owner
callback also rejects late responses, but does not replace that lifecycle rule.
Disposal cancels network requests and rolls back in-flight cache/settlement
transactions; durable pending operations remain under the original owner.
Page caching checks lifecycle between IndexedDB operations, including after the
last write, so an account transition cannot commit a partially written page.
Production auth subscriptions, legacy migration and runtime integration are still
pending SP-02/SP-03 work; this module does not register global listeners.

### Atomic migration journal (storage v2)

`IndexedViewLibrary.migrateLegacy(plan, mode, lifecycle?)` accepts explicitly
converted complete normal/pro/lite/HamClock `ViewDraft` seeds, copied named
recipes, complete legacy scenes, warnings and a bounded rollback backup. The
capture/conversion adapter must omit credentials and transient values; unknown
non-secret settings stay in backup and are never applied. This transaction does
not read current globals, modify legacy keys, activate a view, or publish a TV.

The first successful transaction writes the journal with all four family seeds
and recipes. Local mode creates revision-1 local records. Account mode enqueues
revision-0 creates for authenticated CAS replay, leaving confirmed records empty
until acknowledgement. `migrated` means the local migration transaction committed,
not that a cloud save or display publication succeeded. Scenes remain complete
journal snapshots for later explicit assignment, subject to assignment limits.
`legacyMigration(source)` reads the original owner-scoped conversion and rollback
data so runtime seeding can use it without re-reading mutable legacy globals.

Retries return the first capture unchanged; new defaults and later legacy edits
cannot silently reseed it. Conflicting destinations (including tombstones/pending
drafts), queue capacity, storage failures and lifecycle cancellation never produce
partial seeds or a completion marker. Named recipe IDs are retained. Device
capture is claimed once across all owners of this local database; another account
cannot automatically inherit it. Account captures are partitioned by owner and
require account mode. A local/account mode change requires explicit copy/import,
not reinterpretation of local records as server-confirmed saves. The caller must
verify the capture's owner and bind every auth transition to cancellation; the
storage API cannot authenticate arbitrary input by itself.

Storage version 2 only adds `migrations`, preserving v1 records, pending saves and
receipts. Existing connections receive version-change closure. A rollback binary
that explicitly opens version 1 cannot open this upgraded library; rollback must
use the untouched legacy keys, not delete/downgrade the library database. There is
no live database migration in this slice. Production raw-key capture/conversion,
auth subscriptions and account/LAN/backup activation boundaries remain pending;
this journal alone does not satisfy the full SP-02 migration gate.

### Read-only device capture and conversion

`captureLegacyViews(localReader, sessionReader)` reads an explicit allowlist of
legacy preference keys. Readers expose `getItem` only. Device credentials, auth
storage, live stores, target histories and observations are never enumerated.
Credential-named properties and transient selection/playback fields are omitted;
unknown non-secret JSON stays in the backup. Corrupt JSON is left in its untouched
original key, with a warning, rather than copying potentially hidden credentials.
Read failure or an aggregate capture over 2 MiB prevents migration.

`convertLegacyViewCapture(capture, options)` creates four independent complete
family seeds and complete scene snapshots from that captured baseline. Known
invalid values retain defaults with warnings; unsupported future store versions
or scene routes prevent commitment. Conversion covers map layers/styles/labels,
spot band/mode/age/grouping preferences, visual controls, theme/text/forecast,
panel geometry/docking and HamClock presentation/widget settings. Newer HamClock
display fields take precedence over older layout fields; inherited text is resolved
once. Actual live camera/selection is not converted into saved camera homes.
Legacy angular cluster radius is explicitly replaced by geographic Regions, not
reinterpreted as a geographic distance. Each scene starts from its own family
baseline, never the previously converted scene.

The integration layer supplies the shipped static legacy layer-preset table and
Agent 4's accepted pure named-profile adapter as explicit inputs where needed.
Missing required recipe conversion fails closed; entries are not silently dropped
or replaced with another built-in. Valid existing profile IDs must survive.
Saved region/history catalogs remain in backup/untouched legacy storage; they do
not become active settings. This converter does not publish scenes to displays.

`migrateLegacyFromStorage(library, readers, options, lifecycle)` is the explicit
bootstrap action connecting capture/conversion to the accepted atomic journal.
It checks for the original capture before reading potentially changed legacy keys,
checks account lifecycle across the asynchronous boundary, and preserves originals
on read/conversion/transaction failure. No global listener or automatic production
bootstrap is registered by these modules. Application auth/bootstrap wiring,
account preference allowlisting and LAN/backup library import remain SP-02 work.

Historical kiosk pins are converted on a copied state before materializing scenes:
pre-v6 shipped default pins and pre-v7 numeric page indexes use their historical
page IDs. This never restores deleted scenes or changes the captured backup.
Persisted Pro panel layout entries own their collapse state; generic panel state
fills only missing entries. Invalid scene duration/transition still aborts the
atomic import rather than silently changing a saved playlist; originals remain
available for explicit recovery.

Named operating profiles now use the accepted preset adapter by default during
capture conversion. Each legacy ID becomes one complete display recipe, retaining
its presentation and captured Spots & Paths baseline with only explicit legacy
band/mode overrides. Unsupported legacy fields remain in backup and generate
omission warnings in the migration plan. Malformed identities or filters abort
before the atomic journal transaction. An explicitly supplied conversion adapter
still takes precedence for callers that require a different import policy.
