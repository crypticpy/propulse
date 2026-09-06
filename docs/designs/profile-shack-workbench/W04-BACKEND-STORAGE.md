# W04 backend storage checkpoint

> This is the planning checkpoint. The implemented local contract and remaining acceptance gates are recorded in [W04 local verification](W04-LOCAL-VERIFICATION.md) and the [storage package README](../../../src/lib/station/workbench/storage/README.md). Proposed interface names below are not the current API.

Proposed implementation boundary for [W04 / #177](https://github.com/crypticpy/propulse/issues/177), inspected at `4812bff1` on 2026-09-05 UTC. This is a design checkpoint, not an applied migration or a verified durability claim. The coordinator must freeze the shared operation contract before implementation. [DOMAIN-DECISIONS](DOMAIN-DECISIONS.md), [FEATURE-PRESERVATION](FEATURE-PRESERVATION.md), and the W03 executable proposal contracts remain authoritative.

## Existing storage and constraints

| Concern | Current source and behavior |
| --- | --- |
| Station sync | `src/lib/sync/modules/shackSync.ts` sequentially upserts `user_radios`, `antennas`, `feedlines`, `accessories`, `station_presets`, `inline_components`, `station_chains`, `equipment_history`, and `custom_radios`. No atomic revision/head transaction or operation ledger exists here. |
| Initial owner tables | `supabase/migrations/20260207000000_initial_schema.sql` defines profiles, saved locations and the earlier equipment tables with owner policies and composite owner/entity keys. |
| Later station tables | `20260208000000_sync_expansion.sql` adds inline components, chains, history and custom models with globally unique text IDs and owner RLS. History permits owner updates/deletes; it is not immutable revision storage. |
| RLS updates | `20260210020000_rls_performance.sql` revises the policies using `(select auth.uid())`. |
| Linked location | `20260712001000_propagation_v4_product.sql` adds `(user_id, linked_location_id)` referencing `saved_locations(user_id, id)`, clearing the link when the location is deleted. New historical pins must not inherit that deletion behavior. |
| Profile and images | `profileSync.ts` writes `profiles` and `saved_locations`; `imageSync.ts` writes `user_images` and the private `equipment-images` bucket defined in `20260208010000_user_images_and_storage.sql`. |
| Authentication | `api/_lib/auth.ts` verifies Supabase JWTs when configured, but returns a `local-dev` identity when configuration is absent. A durable station endpoint must fail closed instead. |

W04 is additive. Leave legacy station tables, readers, writers and media intact until the staged migration/capability gate explicitly changes the authoritative writer. New tables must not be registered in the old full-blob sync module.

Capture raw local state, remote rows and embedded `_snapshot` objects before legacy mappers. Their fallback values can invent power, antenna height, connectors and receiver specifications; the existing history pull also caps results at 200. Preserve unknown fields, original values, source IDs, discrepancies and missing-media diagnostics in private recovery records. FP41–FP45 and CR05–CR08 describe the required migration coverage.

## Proposed additive tables

Use a dedicated `station_workbench_*` namespace. `owner_id` is an authenticated UUID; all domain IDs remain opaque text. Every entity relationship includes owner and generation in its foreign key. A generation identifies a staged/committed migration lineage, not a device or an implicit new operating station. No cascading deletion may erase retained domain history.

| Proposed table | Minimum responsibility |
| --- | --- |
| `station_workbench_generations` | Account-scoped generation identity, supported schema/capability version, staged/committed state and migration lineage. |
| `station_workbench_accounts` | One owner row naming the active generation and its compare-and-swap version. Switching this pointer does not erase prior generations. |
| `station_workbench_entities` | Stable `(owner_id, generation_id, kind, id)` identities. Kind is a closed discriminator, not an arbitrary table name. Retired identities remain addressable. |
| `station_workbench_versions` | Append-only version bodies for models, physical inventory, evidence, locations, setups, layouts, experiments and private selection/source records. Primary key includes identity and `version_id`; a digest prevents same-ID/different-body insertion. |
| `station_workbench_revisions` | Immutable setup snapshots, unique revision identity, owning setup, parent/source lineage, payload schema version and digest. Revision ID is already its version identity; never create a second body under the same ID. |
| `station_workbench_heads` | Mutable pointers to exact entity versions/revisions. Draft, inventory and layout heads are distinct. A draft save cannot move operating or publication-source heads. |
| `station_workbench_references` | Owner-scoped retained-reference index from immutable source versions/revisions to identities, revisions and media references. Derived by the trusted validator, never accepted as a client assertion. Needed for deletion impact and historical retention. |
| `station_workbench_operations` | Stable operation ID, generation, canonical request digest, terminal outcome, exact receipt and server audit time. Acknowledgements are retained independently from a client's outbox lifecycle. |
| `station_workbench_tombstones` | Explicit logical deletion with prior version, operation and server ordering metadata. Does not delete immutable bodies; blocks stale resurrection. |
| `station_workbench_migrations` | Stable import mapping, capture/staging/validation/commit checkpoints, source digests and private recovery manifest/envelopes. Private media blobs stay in their existing blob repository. |

This version spine avoids a table per equipment subtype while retaining relational identity, lineage and authorization constraints. JSON bodies do not replace those constraints. Add owner/generation indexes to every pull and reference query; index reference targets for deletion impact. Catalog records copied into an owner's archive keep their provenance without granting shared catalog writes.

The operation ledger's uniqueness is `(owner_id, operation_id)`, with generation bound into its digest and receipt. Entity/version keys also include generation. Accidental reuse of an operation ID in another generation is rejected rather than treated as a fresh mutation.

## Shared operation envelope — pending coordinator freeze

Aligned with the local-repository agent's proposal:

```ts
{
  schemaVersion: 1,
  operationId,
  ownerId,
  generationId,
  payloadDigest,
  createdAt,
  expectedHeads: [{ kind, id, versionId: null | string }],
  records: [{ kind, id, versionId, body }],
  nextHeads: [{ kind, id, versionId }],
  tombstones: [{ kind, id, versionId, expectedVersionId }],
  provenance?
}
```

All kinds and bodies must form a closed typed union. `null` means expected absence, not an instruction to ignore concurrency. Every head/tombstone mutation requires exactly one matching expectation; duplicate targets or contradictory actions reject the entire request. Operation ID and version IDs are supplied once and reused on retry. `createdAt` is audit information, never conflict ordering.

Canonical serialization and digest rules must be shared and tested across client/backend: bind every semantic field except `payloadDigest` itself, preserve explicit null/false/zero, retain array ordering, and reject non-JSON data. The backend recomputes the digest rather than trusting the client's string. A version digest covers its full body, including private recovery values. Valid JSON keys in raw recovery payloads must survive serialization; explicit field APIs still reject reserved keys before schema stripping.

Receipts bind `ownerId`, `generationId`, `operationId`, request digest, outcome and the exact resulting head versions. A replay returns the stored receipt even if heads subsequently advanced. Only that operation's acknowledgement can clear its local outbox entry. An acknowledgement for another account/generation or an older edit cannot clear newer pending work.

## Authentication and validation boundary

Recommended minimal implementation: an authenticated station API validates the domain request, then invokes an internal database RPC. The browser has no direct table mutation privilege and cannot execute the privileged write RPC. This makes TypeScript validation part of an enforceable write boundary rather than an optional client convention.

1. The API fails closed on missing configuration, missing/invalid JWT or account mismatch. It verifies the JWT with Supabase, derives the owner, and compares the request's claimed owner. It does not accept a client owner ID as authority. Apply payload limits and the existing rate-limit pattern before expensive validation.
2. Load the exact owner-scoped bases and retained reference closure needed by the operation. Run the shared W01/W02 aggregate, field/provenance and W03 transition validation against the proposed state. Reject unknown schema/kind/version instead of stripping or downgrading it. New operating/promotion semantics remain gated until their owning packages implement them.
3. Call an internal `station_workbench_apply_operation` RPC using a backend-only credential. Revoke execution from `PUBLIC`, `anon` and `authenticated`; grant only the backend writer role. With the existing deployment, `service_role` can be the initial backend role, but must remain server-only. Never expose a generic client proxy to this RPC. The owner parameter passed here is the identity established by the API, not copied unchecked from the payload.
4. The RPC validates envelope structure, limits, supported schema/generation, body identity consistency and relational references again; locks relevant account/identity/head rows; rechecks every read dependency version used by validation; then commits atomically. Rechecking only written heads is insufficient when another transaction can change an input used to validate the request. Immutable version dependencies avoid that race where possible.

Use explicit schema-qualified SQL and a fixed safe `search_path`. Prefer the least privileged writer role; if a security-definer function is needed, review its owner, grants and every dynamic input. No caller-controlled SQL identifiers. Owner RLS applies to authenticated reads with both owner matching and generation scoping in repository queries. Revoke client INSERT/UPDATE/DELETE, including direct head updates and operation receipt writes. Private implementation tables may live outside exposed schemas with a narrowly granted read surface.

The API owns complete domain/quantity/evidence/topology validation. SQL independently owns atomic ownership, immutable uniqueness, foreign keys, head comparisons, tombstones and operation replay. SQL must not claim to run Zod. Conversely, an API schema test cannot establish RLS correctness. If the implementation instead exposes a JWT-callable mutation RPC, it must move all required validation into that trusted RPC; client-only validation is not an acceptable shortcut.

## Transaction and conflict behavior

Acquire locks in a deterministic owner/generation/kind/ID order. Serialize same-account operation-ID replay before applying changes. Account/generation locks cover initial absent-head creation and cutover; targeted entity locks cover ordinary mutations. Recheck uniqueness after locking. Use server-managed monotonic change cursors for pull, not client timestamps; page against a stable upper bound, include tombstones, and never infer deletion from a missing page.

| Result | Durable effect |
| --- | --- |
| Same operation ID and same digest | Return the original terminal receipt; no second history entry or head change. |
| Same operation ID and different digest | Reject operation-ID reuse; retain the original receipt and data. |
| Valid proposal and all expectations match | Insert immutable records, derived references, heads/tombstones and receipt in one transaction. Failure at any step rolls all of them back. |
| Valid proposal but stale head | Retain the submitted immutable candidate and conflict provenance as a named recoverable alternative, with a conflict receipt. Apply none of the requested mutable heads or tombstones. The current reviewed selection remains intact. Conflict retention is an explicit outcome, not a partially successful save. |
| Invalid shape, references, ownership or immutable-ID collision | Reject mutation with structured diagnostics. Do not admit invalid bodies as canonical history. The client retains the raw private recovery payload/outbox intent for repair. |

Valid new immutable records can coexist across clients. Resolving a conflict uses a new operation ID and explicit expected current heads; retrying the old operation never turns its recorded conflict into a later success. Conflict branches retain physical IDs and pinned historical inputs. Recovery storage can preserve an invalid raw document without labelling it a valid revision.

Reference deletion checks include draft/retained revisions, experiments, operating pins, publication sources, migration recovery and historical log associations. A tombstone removes a live listing only after the impact policy allows it; it cannot make referenced history unreadable. Retirement and draft removal remain separate operations. W04 initially refuses hard purge through ordinary client operations. A later reviewed cleanup path must demonstrate that no retained references or media grants depend on the object. Generation rollback retains post-cutover versions, operations and exportable recovery branches.

## Real test harness and evidence

Use a disposable Supabase local project on explicitly assigned ports because production uses PostgreSQL 17 plus Supabase auth/storage roles and extensions. A plain mocked store or SQL text matcher cannot verify this boundary. Create a task-owned temporary project/config with a unique project ID and ports; never reset an existing listener merely because it uses 54322. Record owner/project/ports in the test report.

The smallest proposed harness is:

- `scripts/check-station-storage.py`: Python with the existing project's `psycopg` tooling; explicit `--confirm-disposable-local-database`, loopback validation and an expected project/database marker. Do not print connection credentials. Refuse an unrecognized database before applying fixtures. Use two independent connections for race tests. No dependency on propagation archive tables or dataset runners.
- `supabase/tests/station_workbench_storage.sql`: `ON_ERROR_STOP`, transactional fixture identities, actual `SET LOCAL ROLE` and JWT claim settings for owner/other-owner/anonymous read and privilege checks. Roll back fixtures after assertions. Calls through the trusted writer role are tested separately from ordinary authenticated calls.
- API tests for JWT/config rejection, owner mismatch, strict contract/provenance rejection and constrained RPC invocation; local HTTP/PostgREST checks establish that clients cannot bypass the API. An actual signed JWT is required for the HTTP checks; SQL claim-setting alone tests database policy, not token verification.
- A migration replay gate against a fresh owned local project, followed by the focused SQL/API/concurrency checks. Repeated application or retry is tested using the supported migration procedure, not assuming every DDL statement may be executed twice manually.

Required database cases: own read/write via the allowed boundary; other-owner and anonymous denial; same opaque IDs in two accounts; cross-owner/generation FK rejection; direct client table/RPC rejection; immutable same-ID/different-body rejection; wrong quantity/provenance rejected at the API; retained-reference deletion; stale update after tombstone; unsupported/new schema rejection; complete rollback on injected transaction failure; exact receipt replay and operation-ID payload mismatch.

Required two-connection cases: simultaneous first-head creation; two edits of one head (one committed head plus recoverable alternative); simultaneous same-operation replay (one result); independent setup edits (both retained); delete/update and reference-creation/delete races; concurrent generation change; timeout/retry after the server committed but before acknowledgement delivery. Assert resulting rows and references, not only response status codes.

Client integration additionally tests account switch, offline edit/reconnect, out-of-order acknowledgements, paginated pulls and missing rows, migration interruption at every checkpoint, exact raw metadata parity, media upload/metadata partial failure, and restoration of a complete owner backup. These are shared W04 completion requirements, not claims made by the backend slice alone.

### Observed local infrastructure

Read-only checks found Docker CLI 29.5.2, Supabase CLI at `/opt/homebrew/bin/supabase`, and psql 18.4. The configured Docker socket had no running daemon. Supabase `--version` attempted a telemetry file write outside the workspace and failed under the sandbox; its version is therefore unverified. No runtime was started, database contacted, migration applied or secret read.

`supabase/config.toml` specifies PostgreSQL 17, API 54321, database 54322 and shadow 54320, with migrations enabled. It references `./seed.sql`, which is not tracked here; an isolated replay configuration must account for that explicitly. Existing runbooks document `supabase db reset`. `archive-worker/tests/*integration.sql` and `run_lock_integration.py` provide useful SQL assertion and two-connection patterns, but target propagation data. The current `npm run verify` does not run these real database integration suites, and `.github/workflows/station-workbench-plan.yml` verifies documentation traceability only.

Before backend verification can be marked complete, provision the owned disposable runtime, pin a usable Supabase CLI, prove historical migration replay on it, add the focused runner to the appropriate gate/CI, and run the real authorization/concurrency cases. Deployed migration state and production policy behavior were not inspected in this checkpoint.

## File ownership and W05 boundary

The backend implementation owner can exclusively take the new migration, station API/auth adapter, SQL tests and focused test runner after the operation contract freezes. The local repository owner takes versioned IndexedDB/outbox/transport composition; the migration owner takes raw capture/staging/parity/recovery. The coordinator owns shared storage types, package scripts, CI and integration documentation. Shared schema changes must be coordinated before editing.

W05 owns allowlisted owner/friend/visitor projections, publication delivery, media derivatives/grants and revocation. It must use separate projection/grant tables and dedicated API paths; it does not broaden SELECT policies on W04 private versions, revisions, recovery or inventory tables. W04 may retain private publication-source identities for reference protection, but storing one does not publish it or establish friend access. W05 consumes the frozen reviewed-revision/reference interface and requests any persistence/auth changes through the backend owner. Neither task changes HamClock presentation or activates the new writer merely by landing its schemas.
