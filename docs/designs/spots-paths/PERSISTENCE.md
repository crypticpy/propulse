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
HTTP transport, bounded pagination, database tables/RPC and generated-shape types.
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
pairing state and the complete versioned assignment, never library records or tokens.
Legacy `scene_config` is not overwritten; SP-10 will opt new consumers into this endpoint.
An old running display continues its existing scene until that integration.

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
