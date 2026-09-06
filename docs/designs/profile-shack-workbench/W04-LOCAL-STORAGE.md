# W04 local station repository and outbox

> This is the planning checkpoint. The implemented local contract and remaining acceptance gates are recorded in [W04 local verification](W04-LOCAL-VERIFICATION.md) and the [storage package README](../../../src/lib/station/workbench/storage/README.md). Proposed interface names below are not the current API.

Design checkpoint for [W04 / #177](https://github.com/crypticpy/propulse/issues/177), based on `4812bff1`. This document proposes a local implementation and executable verification matrix. It adds no database, runtime import, migration, UI or deployed behavior. The coordinator owns the final shared operation envelope and synchronization protocol; names below are proposed interfaces to freeze before implementation.

The accepted [domain decisions](DOMAIN-DECISIONS.md), [preservation register](FEATURE-PRESERVATION.md) and W01–W03 schemas remain authoritative. A W03 proposal is an immutable candidate plus an expected setup head. W04 must recheck concurrency and references at the actual write boundary. A successful local Save means its IndexedDB transaction completed; cloud acknowledgment is a separate state.

## Repository boundary

Use the existing `idb` dependency in a dedicated `propulse-station-workbench` database, initially structural version 1. Do not change `propulse-db` (logs/alerts/decodes), `propulse-images`, old Zustand keys or `shackSync.ts` while establishing this repository. Structural database version, domain `schemaVersion`, operation-envelope version and dataset generation ID are different concepts.

Bind a repository handle to one authenticated account identity at open time. All persistent keys also contain `ownerId`; the bound handle cannot accept a different operation owner. On sign-out/account switch, close the handle, cancel unsent network work and discard in-memory projections. Preserve the prior account's durable queue for its next authenticated session. Closing a handle does not erase data. Client-side ownership checks prevent accidental mixing; backend authorization must independently derive identity from the verified session.

Use a separate active-generation pointer for each account. A generation represents one imported/restored station dataset. `null` means no new station dataset is active; legacy consumers keep their existing reader. A stale handle rereads the pointer inside every write transaction. It cannot write to a generation that was retired or replaced after preparation.

## Shared operation proposal

Local and backend design work use this provisional shape. The coordinator must freeze the discriminated domain-body union, generation activation protocol and exported names before code lands. This is not a second schema implementation.

```ts
type VersionId = string; // Stable opaque token, generated once; never a timestamp.
type EntityKind =
  | "model" | "equipment" | "evidence" | "location" | "setup"
  | "revision" | "layout" | "experiment" | "operating" | "publication-source";

type Head = { kind: EntityKind; id: string; versionId: VersionId | null };
type VersionedRecord = {
  kind: EntityKind;
  id: string;
  versionId: VersionId;
  body: StationRecord; // Coordinator-owned discriminated union of the W01–W03 records.
};

type StationOperation = {
  schemaVersion: 1;
  operationId: string;
  ownerId: string;
  generationId: string;
  createdAt: string; // Audit instant; does not order writes.
  payloadDigest: string;
  expectedHeads: readonly Head[];
  records: readonly VersionedRecord[];
  nextHeads: readonly ExcludeNullHead[];
  tombstones: readonly {
    kind: EntityKind; id: string;
    expectedVersionId: VersionId;
    versionId: VersionId; // New explicit tombstone version, also stable across retries.
  }[];
};
type ExcludeNullHead = Head & { versionId: VersionId };
```

The digest covers every semantic field other than `payloadDigest` itself, including owner, generation, operation ID, expected versions and ordered payload data. Use one shared canonical encoder/hash implementation for client and server. Preserve JSON keys such as an own `__proto__`, array order, source evidence and raw recovery content; do not obtain a digest by a lossy object mapper. Raw backup bytes have a separate backup digest. Compute cryptographic hashes before opening a write transaction.

Every changed mutable head requires its exact prior storage version, even if its graph revision did not change. For example, checking only `setup.draftRevisionId` lets an old revision proposal overwrite a concurrent setup rename. The repository snapshot exposes storage head tokens; W03's expected draft revision is an additional semantic precondition. New head creation expects absence. Setup/revision proposals must carry both checks when converted to the shared operation.

No extra head may change outside the declared write set; conflicting duplicate targets or targets both advanced and tombstoned reject. Each next head must resolve to the correct owner/generation/kind/ID/version and valid typed body. A record's inner owner/ID must agree with its envelope. Revision IDs are immutable identities: an existing revision body cannot be replaced, even with a fresh outer version token. Equipment, model, evidence, location and layout changes create new immutable storage versions of their stable domain identities.

## Proposed TypeScript API

These are repository methods, not component/store APIs. The coordinator's sync orchestrator constructs and validates `RemoteSyncResult`; an arbitrary component cannot manufacture a cloud acknowledgment.

```ts
type Pointer = { generationId: string | null; versionId: string };
type LocalSnapshot = {
  pointer: Pointer;
  archive: DeepReadonly<WorkbenchArchive>;
  heads: readonly Head[];
  localSequence: number;
};
type LocalCommitReceipt = {
  ownerId: string; generationId: string; operationId: string;
  payloadDigest: string; localSequence: number;
  committedHeads: readonly ExcludeNullHead[];
};
type CommitResult =
  | { status: "committed" | "replayed"; receipt: LocalCommitReceipt }
  | { status: "conflict"; conflictId: string; actualHeads: readonly Head[] }
  | { status: "recovery-required"; reason: string };
type OpenResult =
  | { status: "ready"; repository: StationRepository }
  | { status: "unavailable" | "blocked" | "recovery-required"; reason: string };

interface StationRepository {
  readonly ownerId: string;
  readSnapshot(): Promise<LocalSnapshot | { status: "legacy-active"; pointer: Pointer }>;
  commit(operation: DeepReadonly<StationOperation>): Promise<CommitResult>;
  listOutbox(options: { generationId: string; limit: number }): Promise<readonly PendingOperation[]>;
  recordSyncResult(result: RemoteSyncResult): Promise<void>;
  stageGeneration(input: GenerationStageChunk): Promise<StageReceipt>;
  sealGeneration(input: GenerationSeal): Promise<StageReceipt>;
  activateGeneration(input: {
    operationId: string; expectedPointer: Pointer; stageId: string; sealDigest: string;
  }): Promise<CommitResult>;
  exportRecovery(input: { generationId: string; includeRawSources: boolean }): Promise<RecoveryBundle>;
  close(): void;
}

function openStationRepository(options: {
  ownerId: string;
  onInvalidated?: () => void;
  onBlocked?: () => void;
}): Promise<OpenResult>;
```

`PendingOperation` contains the original immutable envelope plus local sequence, dependency operation IDs and delivery state. `RemoteSyncResult` is a coordinator-validated acknowledgment/conflict/change-page union binding owner, generation, operation ID, digest, committed versions and a server-issued change cursor. Neither type can substitute a whole unversioned archive for the transactional write set. The synchronization adapter owns network requests and translates remote results into this protocol; the local repository owns durable conditional application only.

`GenerationStageChunk` identifies owner, stage/generation ID, chunk ID, schema version, immutable chunk digest and validated records or private raw-recovery records. Identical chunk retry is a no-op; a changed chunk under the same ID rejects. `GenerationSeal` binds the complete manifest/digest, raw-backup reference, source mapping, validation results, media-availability report and selected-context parity evidence. `StageReceipt` reports persisted staging progress and seal identity; it does not claim activation. `RecoveryBundle` includes the generation manifest, retained versions/heads, operation receipts, pending/conflicted outbox, raw source records if requested and media-availability references. W04's migration implementation defines the exact formats alongside the shared envelope, not ad hoc inside UI code.

Do not export a generic `put`, `deleteDatabase`, mutable database handle or callback accepting arbitrary writes. Unsupported operation/schema versions fail closed into recoverable state. Operational storage failures reject without returning a success receipt; distinguish quota, blocked upgrade and transaction abort in the caller's status handling.

## Object stores and indexes

Compound keys use IndexedDB arrays, not delimiter-concatenated strings. Every index queried by the repository begins with its bound owner. Entity bodies retain the canonical records; transport/cache metadata sits outside those records.

| Store | Primary key | Required indexes / purpose |
|---|---|---|
| `accountMeta` | `[ownerId, key]` | Active pointer, local sequence counter and acknowledged sync cursor. Pointer version changes on activation/recovery transitions. |
| `generations` | `[ownerId, generationId]` | By `[ownerId, state]`; state is staging/sealed/active/recovery. Retains source generation and seal, never overwrites an older dataset. |
| `recordVersions` | `[ownerId, generationId, kind, id, versionId]` | By entity `[ownerId, generationId, kind, id]` and kind `[ownerId, generationId, kind]`; immutable domain bodies with digest. |
| `heads` | `[ownerId, generationId, kind, id]` | By `[ownerId, generationId, kind]`; current version token or explicit tombstone token. |
| `operations` | `[ownerId, operationId]` | By `[ownerId, generationId, localSequence]`; permanent payload digest and local result/receipt prevent replay after acknowledgment or generation changes. |
| `outbox` | `[ownerId, operationId]` | By `[ownerId, generationId, state, localSequence]`; pending, acknowledged, blocked/conflicted. Retains original envelope and dependencies. |
| `conflicts` | `[ownerId, generationId, conflictId]` | By `[ownerId, generationId, state]`; both bases, submitted candidate, remote result and explicit resolution lineage. |
| `migrationRecords` | `[ownerId, stageId, chunkId]` | By `[ownerId, stageId]`; immutable source mapping, chunks, validation checkpoints and sealed manifest. |
| `recoveryRecords` | `[ownerId, generationId, recordId]` | By `[ownerId, generationId]`; raw source payloads/manifests and W03 recovery diagnostics kept outside valid topology. |
| `mediaRefs` | `[ownerId, generationId, mediaId]` | By `[ownerId, generationId]`; owner, availability and retained reference metadata, not public grants or image bytes. |

`readSnapshot` reads pointer, heads and their record versions in one readonly transaction, adds all retained immutable setup revisions required by the archive, then validates/reconstructs the W03 archive. It returns detached readonly values. Corrupt/incomplete reconstruction produces recovery-required; it never repairs by dropping records. Current heads and retained identities must coexist so retirement/tombstones do not turn valid historical revision references into missing records. Tombstoning a referenced identity is rejected until the explicit reference-resolution policy permits it; retained historical records are never silently presented as new active inventory.

The existing image database has no account field and lives in another IndexedDB database. It cannot share this repository's transaction. Stage/verify a blob separately, then commit its owner/reference/availability record with the domain operation. Failure may leave an unreferenced blob, not a committed reference falsely reported as available. Preserve missing-media diagnostics. Do not delete blobs on ordinary photo-reference removal, retirement or failed migration. W05 governs public derivatives and access grants.

## Local commit algorithm

1. Parse the envelope, validate operation structure, and calculate/verify its digest outside the write transaction. Do not refresh reviewed snapshot inputs from live inventory.
2. Open one readwrite transaction covering account metadata, generation, versions, heads, operations, outbox and relevant conflict/recovery/reference stores. Verify the active generation and bound owner again.
3. Check `[ownerId, operationId]` first. Matching owner/generation/digest returns the original committed receipt without repeating writes, or the same recorded conflict outcome if that attempt conflicted. A resolution needs a new operation ID. A reused operation ID with a different payload rejects, including after its outbox row was acknowledged. Keep receipts; queue cleanup cannot erase idempotency history.
4. Read actual expected heads and relevant immutable records in that transaction. Check all storage versions, W03 draft-head preconditions, unused revision identity and reference integrity against the complete proposed state. A stale/missing head cannot become an implicit create. Existing immutable versions may be reused only if their bodies/digests match exactly.
5. On valid commit, append immutable versions, advance only declared heads, apply valid tombstones, allocate local sequence, and insert operation receipt plus pending outbox in the same transaction. Never alter old setup revisions or QSO history. Record media references/availability when present.
6. On a valid but stale candidate, preserve a named conflict alternative and original operation envelope without applying any requested head/tombstone. Return conflict only after its recovery transaction completes. Invalid payloads do not become valid graph records; preserve raw input in explicit recovery storage when applicable.
7. Await transaction completion before returning committed/replayed/conflict. A request resolving is not the commit boundary. Publish in-memory notifications only afterward; another tab must reread the repository rather than trust a broadcast payload.

IndexedDB transactions can become inactive when control leaves their request/microtask work. The `idb` documentation specifically warns against awaiting unrelated work inside a transaction and provides `tx.done` for completion. Hashing, network requests, file reads and worker calculations stay outside; only IndexedDB requests and synchronous validation occur within. [Official idb documentation](https://github.com/jakearchibald/idb#transaction-lifetime).

The IndexedDB specification defines atomic transaction commit/abort, upgrade coordination and durability modes. Request strict durability where supported for station writes, but report browser transaction completion accurately; do not promise immunity to device failure, storage eviction or cleared browser data. Backups and acknowledged cloud copies remain separate recovery mechanisms. [IndexedDB specification](https://w3c.github.io/IndexedDB/).

## Offline, conflict and acknowledgment behavior

A and B are local operations on one setup. B expects A's proposed storage token, so reconnect must send A before B; unrelated heads may synchronize independently. Retry the original envelope/operation ID, never rebase or regenerate IDs silently. Server rejection of A blocks its dependents and retains both candidates. Timestamps do not pick the winner. An explicit reviewed resolution creates a new operation with current remote preconditions and retains lineage to the alternatives.

An acknowledgment clears only the exact owner/generation/operation/digest it covers. It cannot erase later outbox work or move the active local head backward to an acknowledged ancestor. Receiving A's acknowledgment while B is locally current records A's cloud status and leaves B current/pending. Apply remote immutable records independently; advance remote heads locally only when their expected bases match and no conflicting local intent exists. A missing record in a paginated/partial pull is not deletion. Store the server change cursor only in the same transaction that durably applies or records the entire page's conflicts.

For multiple tabs, IndexedDB conditional transactions are authoritative. An optional sender lease may reduce duplicate requests, but duplicate sends must remain harmless through server idempotency. A lost/expired lease cannot mean the operation was applied. Account switch cancels the old sender; an in-flight result for that account may only be recorded under its original bound account, never the new account's handle.

A tombstone advances the target's version and remains durable. Old updates cannot resurrect it. Retirement normally updates lifecycle instead of creating a tombstone. Historical referenced entities/revisions remain retained; any hard-delete workflow requires reference resolution and the separately authorized storage policy. Owner/friend/visitor publication and media revocation are not satisfied by locally marking a tombstone. Offline tightening hides local cached content immediately while the server action remains visibly pending.

## Staged activation and failure injection

Staging never changes the active pointer. Capture original local/remote payloads and blob availability before lossy mappers, append chunks with deterministic source-ID mapping, validate full topology, compare metadata and active-context parity, and seal an immutable manifest. The seal must identify the exact backup and records that passed checks. An unsealed, changed or incomplete generation cannot activate.

Activation compares `expectedPointer` and its version in one transaction, verifies the persisted seal and migration evidence, marks the new local generation active, retains the previous one, and writes its operation receipt/history/outbox atomically. Coordinated backend generation activation/acknowledgment is a separate protocol step owned by the coordinator; until it succeeds, the UI must not claim cloud migration complete or send writes into an unrelated server generation. No old writer may continue authoring the newly active station state.

A crash before activation leaves the old pointer; after commit, reopen resumes from the committed generation and pending activation receipt. Recovery to an earlier reader first retains every post-cutover record and outbox operation as a recovery branch. It does not discard unsupported new graph features or rewrite historical contacts. Prefer forward repair when a legacy reader cannot represent the new data.

Inject synchronous failures at transaction checkpoints in tests: after receipt lookup, after head reads, after immutable inserts, after head writes, after tombstones, after outbox insertion and before completion. Injection must abort the actual transaction rather than simulate a successful partial write. Network/error scheduling belongs to fake transport outside it. Real-browser tests separately exercise connection termination, upgrade blocking and reopen; mocks do not prove power-loss durability.

## Executable verification matrix

Implementation target: focused Vitest suites using the installed `fake-indexeddb`, real repository operations and two database handles; browser tests run only in owned isolated sessions following [local testing instructions](../../guides/LOCAL-AGENT-TESTING.md). All rows below are planned, not run at this design checkpoint.

| ID | Reproduction | Required assertion |
|---|---|---|
| L01 | Commit a W03 edit, close/open handle | Head, pinned new revision, receipt and outbox all survive; prior operating/publication/experiment pins unchanged. |
| L02 | Replay same operation before/after acknowledgment and reopen | Same receipt/sequence, one logical write; changed payload under same operation ID rejects. |
| L03 | Prepare two edits at the same head, commit from two handles | One head advance, other named recoverable conflict; neither candidate disappears. |
| L04 | Concurrent rename and graph edit share draftRevisionId | Full storage-version CAS detects stale setup body; newer name/location metadata survives. |
| L05 | Inject each transaction failure checkpoint | No partial head/version/receipt/outbox success; reopening yields previous committed state. |
| L06 | A then B offline; acknowledge A after B is current | B remains pending/current, no head rollback; replay/lost acknowledgment is harmless. |
| L07 | Reject A remotely; B depends on A | Both envelopes and bases retained; B blocked until explicit resolution, no automatic merge. |
| L08 | Account A queue, switch to B, late A network result | No A reads/writes/notifications through B handle; A queue resumes only under A identity. |
| L09 | Tombstone versus stale update and partial pull | Stale resurrection rejects; absent page rows are retained; historical IDs/versions remain readable. |
| L10 | Mutate same revision/version identity with changed private evidence | Immutable collision rejects; clone/restore citations, zero coordinates, raw legacy fields and source order unchanged. |
| L11 | Stage retry, altered same chunk, bad references, incomplete seal | Stable retry succeeds, changed chunk rejects, old reader remains active; raw recovery diagnostics retained. |
| L12 | Crash/reopen before and after pointer activation; stale second activation | Exactly one pointer state is active, receipt/outbox agree, previous generation remains recoverable. |
| L13 | Post-cutover edits then rollback/forward repair | Export includes new versions, conflicts and unsent operations; no lossy down-conversion or QSO rewrite. |
| L14 | Missing image, failed blob staging, clear primary-photo reference | Correct availability status and private reference retention; no false blob transaction or automatic deletion. |
| L15 | Unknown future schema, blocked upgrade, denied storage/quota failure | Explicit unavailable/recovery status; no delete-and-recreate fallback or success receipt. |
| L16 | Paginated remote data plus local conflict and retry | Cursor advances only with applied/retained page; no missing or double-applied operation. |

The matrix complements migration parity and backend concurrency/RLS evidence; it cannot close W04 alone. No UI cutover or W21 completion follows from unit tests passing.

## Outside-agent boundaries

The outside [W07 / #180 route/compiler agent](https://github.com/crypticpy/propulse/issues/180#issuecomment-5555486801), scoped to new `workbench/analysis` files, can consume readonly W03 snapshots and return a supported ordered RF route, precise unit conversions, assumptions, unknowns and diagnostics. It must not read/write IndexedDB, create operation envelopes, refresh pinned inputs, activate a setup, send hardware commands, modify HamClock, change schemas or import arbitrary non-RF documentation into the calculation engine.

The outside [W05 / #178 pure projection-policy agent](https://github.com/crypticpy/propulse/issues/178#issuecomment-5555486880), scoped to new `workbench/publication` files and its verification document, can implement/test an allowlisted owner/friend/visitor projector over explicitly supplied verified audience context and reviewed snapshots. It must not infer friendship from a client claim, issue public/private media URLs, assert RLS or revocation is deployed, mutate storage/outbox, publish live records or widen fields to make a fixture pass. The coordinator retains backend identity/grants/cache implementation and integration review.

Both agents should provide bounded source/tests, the exact input/output contract and unmet integration gates. Their pure helpers must not close persistence, security, operator validation or production cutover issues.
