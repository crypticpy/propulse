# Saved library persistence (SP-02)

Tracking: [#512](https://github.com/crypticpy/propulse/issues/512). This first delivery
implements storage primitives; it does not claim the entire SP-02 exit gate or
switch production sync/view consumers. Server transport, migration and legacy
sync/import isolation follow in sequential PRs under the same package.

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
atomically. Newer cached revisions cannot be overwritten by older responses.

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
ownership, including token-to-display binding. Those implementations are still the
next SP-02 delivery.

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

All changes are additive except moving the existing schema/default pair to that
shared module. No production library/database opens until a caller explicitly
constructs and uses it. Legacy storage and sync remain intact in this first delivery;
the next migration must preserve rollback snapshots and stop migrated presentation
fields from applying to active views before SP-02 is accepted.

Validation covers two-tab CAS, distinct-document saves, owner partitions, tombstones,
operation reuse, storage rollback/recovery, malformed/future snapshots, widget catalog
validation, durable offline replay, lost acknowledgements, conflict retention,
account switches, mismatched responses, in-flight discard and distinct publication.
