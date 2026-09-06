# Proposed W04 Supabase transaction slice

**Design proposal only: no SQL migration, RPC, endpoint, generation provisioning or activation authority is implemented by this document.**

Tracking: [W04 / #177](https://github.com/crypticpy/propulse/issues/177), under [parent #173](https://github.com/crypticpy/propulse/issues/173). This narrows the earlier [backend checkpoint](W04-BACKEND-STORAGE.md) using the executable operation, local repository and [remaining storage gates](W04-NEXT-STORAGE-GATES.md). The proposed names and decisions below require coordinator freeze before implementation.

## Smallest enforceable write boundary

Implement one backend-only apply-operation RPC, first exercised against disposable SQL fixtures. The API derives the owner exclusively from verified authentication, verifies the operation content digest, loads the validation context, and runs shared domain/W03 validation. It derives every relational mutation parameter from that validated operation; it never forwards unchecked client write lists or owner claims.

Revoke table mutation and RPC execution from `PUBLIC`, `anon` and `authenticated`. Grant execution only to the selected backend writer role. Any security-definer function needs a reviewed owner, fixed safe search path and schema-qualified SQL. Owner-scoped reads and RLS require their own tests; a server credential does not itself validate domain content.

SQL enforces ownership binding, immutable uniqueness, foreign keys, token freshness, reference protection, replay and transaction fencing. It does not claim to execute Zod. Do not expose the internal validated-write RPC as a generic browser proxy.

## Proposed tables and exact encodings

`owner_id` is a verified UUID. All domain IDs, including generation, operation and version IDs, use canonical JSON-string `TEXT COLLATE "C"` through `encodeStationId()`. They are not raw PostgreSQL UUIDs or decoded JSON strings. Body/operation/receipt content is exact canonical JSON `TEXT`; never regenerate it through `jsonb::text`. All relational foreign keys include owner and generation; no cascade deletes retained history.

| Table | Primary key and responsibility |
|---|---|
| `station_workbench_accounts` | `owner_id`; current generation pointer, writer/validation fence and server change sequence |
| `station_workbench_generations` | `(owner_id, generation_key)`; supported schema/state and source lineage |
| `station_workbench_entities` | `(owner_id, generation_key, kind, entity_key)`; permanent identity and current version pointer |
| `station_workbench_versions` | `(owner_id, generation_key, kind, entity_key, version_key)`; immutable body or tombstone token, exact body text/digest and originating operation |
| `station_workbench_references` | Source version plus derived reference identity; indexed target identity/version for protection queries |
| `station_workbench_operations` | `(owner_id, operation_key)`; bound generation, original operation text/digests, permanent terminal outcome and exact receipt text |

Use the common version table for immutable revisions, enforcing revision ID = version ID and prohibiting revision tombstones. Keep all tombstone tokens: a fresh operation cannot reuse a previously issued token, even for an identical body. Stable entity rows survive tombstones. The exact reference-key shape, deferrable FK arrangement and indexed deletion policy remain to be frozen with the derived-reference contract.

## Semantic operation digest versus stored-text digest

These are different values and must have different names in both the RPC and SQL schema:

| Proposed API/SQL name | Meaning and verifier |
|---|---|
| `operationPayloadDigest` / `operation_payload_digest` | Existing `StationOperation.payloadDigest`: SHA-256 of the canonical operation **without** its `payloadDigest` field. Verified with `verifyStationOperation()` in the trusted API. |
| `operationCanonicalText` / `operation_canonical_text` | Complete exact canonical operation envelope, including its `payloadDigest` field. |
| `operationTextDigest` / `operation_text_digest` | SHA-256 of UTF-8 bytes of `operationCanonicalText`. Produced by `encodeStationBody(operation).payloadDigest`; SQL recomputes it over the received TEXT bytes. |
| `bodyCanonicalText`, `bodyTextDigest` / corresponding snake-case columns | Exact canonical entity-version body and its UTF-8 text digest. |
| `receiptCanonicalText`, `receiptTextDigest` / corresponding snake-case columns | Exact terminal receipt and its UTF-8 text digest. |

SQL replay compares exact canonical operation text as well as both operation digest fields. It must not substitute the full-text digest for the semantic operation digest or derive a hash by parsing/re-serializing with PostgreSQL JSON functions. Exact relational projections remain a trusted API obligation; the SQL transaction must not pretend a digest alone proves that arbitrary separately supplied rows came from that operation.

## Proposed transaction semantics

1. Lock the existing owner account row. Coarse owner serialization is the smallest first implementation that also covers absent-head creation and prevents validation races. An ordinary operation must not create account/bootstrap authority as a side effect.
2. Look up the owner-global operation ID before active-generation/fence checks. Exact replay returns its original receipt, even after later head advances or generation changes. Changed content or generation under that ID rejects.
3. Require a separately provisioned writable generation, matching active generation and supported schema. Validate the trusted API's fence against the current account state.
4. If the fence changed after API validation, return retry-required without recording a terminal receipt. The API must reload and revalidate. Every writer capable of changing relevant validation context must participate in the same fence.
5. Check all explicit `expectedHeads`, including read dependencies, and `setupDraftPreconditions`. Null means expected absence. Enforce exact record/head correspondence, fresh version tokens and immutable identities. Setup location/draft consistency and clone source-setup dependencies remain W03 validation obligations.
6. Atomically insert immutable versions, derived references, new heads/tombstones and the permanent operation result. Reference checks execute under the same fencing transaction. Injected failure at any write rolls everything back.
7. Advance only the server's audit/change sequence for the applicable durable outcome; never overwrite or reinterpret client `localSequence`. Replay does not allocate another sequence.
8. Return accepted heads in the operation's exact order. A stale operation's terminal rejection retains the original operation text as quarantined evidence and inserts no candidate canonical versions. It must not label an unavailable historical validation context as a valid alternative.

The internal validated-write envelope must bind the API's decision to its validation fence. SQL must reject disagreement between the locked state and that decision. Invalid shape, unsupported schema, impossible lineage or immutable collisions fail without a partial success. Retrying an originally rejected operation never converts it into success; explicit resolution needs a new operation and remains a separate protocol.

## Acceptance evidence required

Use the guarded disposable database harness; this proposal neither connects to production nor applies migrations. Required cases include:

- Exact replay after later edits, generation changes and a lost response; altered payload/generation under the same operation ID rejects.
- A digest fixture proving `operationPayloadDigest` matches the canonical envelope without that field, while `operationTextDigest` matches the complete stored envelope. Substituting either value for the other rejects; changing stored text rejects even when logical JSON content seems equivalent.
- Two-connection first-head creation and same-operation races; stale edit versus concurrent rename; changed read-only dependency between API validation and RPC.
- Same token/same body under a new operation rejects; immutable revision replacement, revision deletion and stale resurrection reject.
- Reference creation versus deletion races; complete rollback at every write checkpoint.
- Wrong-owner/generation FKs, anonymous/client table writes and direct client RPC execution reject. JWT verification and SQL role-policy evidence are distinct tests.
- Real PostgreSQL TEXT round-trips for NUL, lone surrogates, reserved keys and distinct Unicode IDs, preserving exact canonical bytes and digests.
- Terminal head ordering/tombstone flags match the delivery contract; rejected candidates never become canonical. Server sequence changes do not alter client receipts.

## Decisions still requiring freeze

The account/generation provisioning authority, fence representation and validated-write envelope are unresolved. So are complete derived-reference coverage/deletion policy and permanent rejection/quarantine formats. Use synthetic fixture provisioning for the first SQL tests; do not enable a product bootstrap path to make them run.

Existing new-empty, synthetic and import-rehearsal seals grant no generation activation or legacy cutover authority. Activation, remote conflict resolution, authenticated transport, remote-page/cursor application and public projection persistence remain under their separate gates. This proposed slice cannot close #177.
