# W04 pure delivery contracts

Tracking: [W04 / #177](https://github.com/crypticpy/propulse/issues/177), under [delivery parent #173](https://github.com/crypticpy/propulse/issues/173). This implements the pure acknowledgment/dependency contract slice of [remaining storage gates](W04-NEXT-STORAGE-GATES.md). It does not complete W04 or enable synchronization.

## Implemented API

Implementation: [delivery.ts](../../../src/lib/station/workbench/storage/delivery.ts); verification: [delivery.test.ts](../../../src/lib/station/workbench/storage/delivery.test.ts).

| API | Behavior |
|---|---|
| `stationDeliveryResultSchema` / `parseStationDeliveryResult(input)` | Strictly parse terminal `accepted` or `rejected` responses. The helper returns detached, deeply frozen data. |
| `stationDeliveryBindingSchema` / `bindStationDeliveryResult(input, trustedLocalMetadata)` | Match owner, generation, operation ID and operation payload digest; acceptance also requires exact committed heads. |
| `compareStationDeliveryResults(previous, incoming, trustedLocalMetadata)` | With `previous: null`, return `recorded`; an identical prior terminal result returns `replayed`. Altered or contradictory terminal outcomes throw. These labels describe a pure comparison, not a durable write. |
| `stationDeliveryGraphSchema` / `evaluateStationDeliveryGraph(input)` | Parse a complete supplied owner/generation graph and evaluate reference validity, result binding and dependency readiness. The evaluator returns detached, deeply frozen rows in input operation order. |

The module exports inferred `StationDeliveryResult`, `StationDeliveryBinding`, `StationDeliveryGraph` types and `StationDeliveryReadiness`. Schemas establish structural shape; cross-record binding and graph semantics require the corresponding helpers.

Every response contains `schemaVersion: 1`, `ownerId`, `generationId`, `operationId` and lowercase SHA-256 `payloadDigest`. Accepted responses add `committedHeads`; rejected responses add `reason: { code, message }`. There are no cursor, pointer or remote-resolution fields. Plain JSON validation precedes schema property access, so getters do not execute. Unknown fields, malformed identities/digests and duplicate head targets reject.

## Receipt binding and terminal outcomes

The binding is trusted local metadata supplied by the caller: `{ ownerId, generationId, operationId, payloadDigest, committedHeads }`. The caller must obtain and verify it from the permanent local commit ledger. The helpers do not independently verify the original operation digest, authenticate the server, establish account authorization, or prove that a server applied anything. A digest-shaped string and a parsed response are not authority.

Each committed head is `{ kind, id, versionId, deleted }`. Acceptance preserves the exact local receipt order: `nextHeads` followed by tombstones. Missing, extra, reordered or altered heads reject, including changed deletion flags and server-replaced version tokens. Rejection does not carry or replace committed heads.

Terminal replay compares the entire parsed outcome using canonical JSON. Object key order is insignificant; array order and rejection reason content are significant. An acknowledgment cannot overwrite an earlier rejection, and changed rejection details cannot replace the first terminal outcome. Transport failure or a retryable network error must not be invented as a terminal server rejection.

No helper mutates its inputs, the original receipt, local heads, account sequence, active generation or sync cursor. A late acknowledgment for A therefore cannot roll a later local B back to A. Durable acknowledgment and permanent receipt replay still require repository integration.

## Dependency readiness

The graph contains `ownerId`, `generationId` and `operations`. Each operation supplies the binding fields plus `localStatus: "committed" | "conflict"`, `dependencyOperationIds` and `terminalResult: null | StationDeliveryResult`. Include acknowledged prerequisite operations from the retained ledger; an unacknowledged-only outbox listing is insufficient.

| Status | Meaning |
|---|---|
| `ready` | Locally committed, no terminal result, and every prerequisite acknowledged. This grants no sender lease or transport authority. |
| `waiting` | At least one prerequisite lacks acknowledgment, with no rejected or locally conflicted ancestor. |
| `acknowledged` | An exactly bound accepted result exists and every prerequisite is acknowledged. |
| `rejected` | An exactly bound terminal rejection exists. |
| `conflicted` | The original operation failed local commit. It cannot have committed heads or any terminal server result. |
| `blocked` | A rejected or locally conflicted ancestor prevents delivery. |

Rows include immediate `waitingForOperationIds` in declared dependency order and transitive `blockedByOperationIds` in lexical order. Missing references, duplicate operation/dependency IDs, cycles and cross-owner/generation nodes throw. An acknowledged child with an unacknowledged prerequisite also throws.

For A → B → C and independent D, rejection of A yields `rejected`, `blocked`, `blocked`, `ready`. A later E depending on B or C is also blocked. Re-evaluation preserves all supplied envelopes; it does not automatically rebase, rewrite IDs, discard candidates, or resolve conflicts.

## Remaining integration gates

- Freeze the durable delivery-result representation and any required stored-record/schema upgrade before changing repository storage. Preserve permanent local outcomes and replay receipts.
- Record terminal outcomes, conflict evidence and transitive blocking atomically; compare verified state inside the transaction. New commits must inherit blocked dependencies, and duplicate/concurrent responses need durable idempotency.
- Implement authenticated transport/account binding and generation handshake separately. Close/reopen, two-handle races, transaction rollback and account-switch late-response tests remain required.
- Add repository acknowledgment/readiness integration before using this evaluator to select outgoing work. No network sequence, account sequence or remote cursor advancement is implemented here.
- Keep remote conflict resolution, durable staging and activation under their separate gates in [W04 remaining storage gates](W04-NEXT-STORAGE-GATES.md). No local helper authorizes legacy cutover.

## Verification

Run `./node_modules/.bin/vitest run src/lib/station/workbench/storage/delivery.test.ts`.

The 35 focused tests cover exact ordered receipt/tombstone binding, terminal replay and contradiction, malformed inputs and getter rejection, A → B → C plus D/E, late acknowledgment without local-head changes, missing/duplicate/cyclic/cross-scope dependencies, local-conflict exclusion and detached readonly results. This is pure-contract evidence, not proof of durable acknowledgment or backend synchronization.
