# W04 durable local delivery bookkeeping

Tracking: [W04 / #177](https://github.com/crypticpy/propulse/issues/177), under [parent #173](https://github.com/crypticpy/propulse/issues/173). This extends the [pure contracts delivered in #251](https://github.com/crypticpy/propulse/pull/251), documented in [W04 delivery contracts](W04-DELIVERY-CONTRACTS.md). It adds durable local outcomes and dependency state; authenticated synchronization and W04 completion remain separate gates.

## Repository APIs and storage

The owner-bound [repository](../../../src/lib/station/workbench/storage/repository.ts) exposes:

- `recordDeliveryResult(input)`: validate and durably record an accepted/rejected terminal result, or replay the identical retained outcome. Returns `{ status: "recorded" | "replayed", result }`, or `retry-required` after repeated concurrent graph changes. Invalid binding or contradictory outcomes throw.
- `readDeliveryReadiness({ generationId })`: return a detached readonly readiness snapshot for the complete retained generation, including acknowledged prerequisites. It does not reserve outgoing work or authorize a sender.
- Existing `commit(operation)`: preserve its original permanent receipt and inherit blocking when a new operation depends on rejected or blocked work. `listOutbox()` remains an audit listing, not a readiness-filtered sender queue.

IndexedDB schema v2 adds `deliveryResults`, keyed by `[ownerId, operationId]`, with a nonunique `[ownerId, generationId]` index. The [database layer](../../../src/lib/station/workbench/storage/database.ts) upgrades only the exact supported v1 structure, without rewriting its ten existing stores or their records. An invalid structure or failed addition aborts the upgrade transaction; unsupported future versions are not downgraded. A blocked request cannot perform a late upgrade after it has returned `blocked`.

## Binding, replay and atomicity

Terminal results must match trusted permanent local operation metadata: owner, generation, operation ID and payload digest. Acceptance also matches the exact ordered local receipt heads, including tombstone flags: `nextHeads` followed by tombstones. A local conflict cannot receive a server terminal outcome. Identical outcomes replay; contradictory acceptance/rejection or changed rejection details cannot replace the first result.

Recording an outcome and updating affected outbox states occur in one IndexedDB transaction. The transaction adds the terminal result and updates only delivery state. Rejection retains the original operation and blocks its transitive dependents. Failure at a terminal-result or descendant-write checkpoint aborts the entire change. Completion is reported only after transaction completion.

Permanent local commit/conflict receipts, immutable record bodies, canonical heads, generation pointers and account sequences remain unchanged. Delivery does not advance a remote cursor. A late acknowledgment for A cannot roll a later local B back to A; replaying `commit(A)` still returns A's original receipt. Correctly bound late results for a retained old generation remain scoped to that generation, while another owner's result is rejected by the bound repository.

## Audited dependency graph

The repository reads all retained operations, outbox rows and terminal results for the owner/generation. It binds queue rows to permanent receipts, checks original conflict evidence, and validates dependency edges against earlier committed-head tokens named in the signed operation's expectations. Missing/orphan rows, duplicate sequences, invalid references and forged queue states fail closed.

Original operation digests are verified after the readonly transaction. The exact audited graph is reread and compared inside the write transaction before any mutation. Concurrent changes trigger another audit rather than using stale validation; repeated contention returns `retry-required`. Web Crypto does not run inside write transactions. Ordinary `commit()` additionally audits retained record-body digests and compares canonical state together with the dependency graph.

Readiness uses the [pure graph evaluator](W04-DELIVERY-CONTRACTS.md): `ready`, `waiting`, `acknowledged`, `rejected`, `conflicted` or `blocked`. Every prerequisite must be acknowledged before a node is ready. In storage, `ready`/`waiting` map to `pending`, `acknowledged` maps to `acknowledged`, `conflicted` maps to `conflicted`, and `rejected`/`blocked` map to `blocked`. Terminal results preserve the distinction between direct rejection and inherited blocking.

For A → B → C with independent D, rejecting A blocks B/C while D remains ready. A subsequently committed E depending on B/C also starts blocked. No operation is automatically rebased, re-signed, discarded or marked remotely resolved.

## Reproduction and evidence scope

Unit coverage can be reproduced with:

```sh
npm test -- src/lib/station/workbench/storage
```

For real IndexedDB checks, follow [local agent testing](../../guides/LOCAL-AGENT-TESTING.md), claim a server from this checkout and use its printed URL:

```sh
npm run dev:session -- status
npm run dev:session -- start --owner station-delivery-review --task "W04 local delivery verification" --profile local
node scripts/check-station-delivery-browser.mjs "$STATION_DELIVERY_URL"
```

Set `STATION_DELIVERY_URL` to that owned session's URL before the final command. The runner verifies checkout/session identity, uses an isolated Chromium context and disposable synthetic station databases, and exercises local repository behavior without owner credentials or server synchronization. Preserve the printed owner/session/URL with the evidence.

| Local matrix row | Progress exercised by this slice |
|---|---|
| L02 | Permanent operation receipt replay survives terminal acknowledgment and reopen; altered outcomes reject. |
| L06 | Acknowledging A after B preserves B's canonical state and pending delivery. |
| L07 | Rejected A blocks B/C and new E atomically; independent D remains eligible. Explicit conflict resolution is still separate. |
| L08 | Owner-bound late responses, retained old-generation outcomes and closed-handle behavior preserve account isolation. Authenticated account switching remains a transport integration gate. |

Tests also cover v1 preservation, failed upgrades, malformed receipt/graph data, two-handle races, exact audit rechecks and transaction rollback. The final delivery comment records actual unit counts, browser results, CI and deployment evidence. This document does not assert that the browser runner has passed.

## Remaining gates

Parsing a terminal response is not proof of server authority. No authenticated transport, sender lease, backend SQL/RLS deployment, remote-page application or remote-cursor protocol is provided here. UI/editor integration, operating/publication owner gates and real backend concurrency evidence remain outstanding.

Remote conflict resolution still needs distinct digest-bound local and remote preconditions. Durable staging, activation authorization and generation cutover remain governed by [W04 remaining storage gates](W04-NEXT-STORAGE-GATES.md); this slice neither activates a generation nor authorizes legacy replacement. A schema upgrade and passing local tests do not close #177.
