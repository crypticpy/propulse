# W04 remaining storage gates

Tracking: [#177](https://github.com/crypticpy/propulse/issues/177), implementation foundation [PR #245](https://github.com/crypticpy/propulse/pull/245). This checkpoint records the coordinator and independent-agent review of the next dependency slices. It is not an implemented API or evidence of migration/sync completion. The current boundary remains [W04 local verification](W04-LOCAL-VERIFICATION.md).

## Delivery acknowledgments and rejected dependencies

Implement terminal delivery outcomes separately from the permanent local commit receipt. Bind every outcome to the owner, generation, operation ID, payload digest and exact committed-head set, including tombstones. Parsing a response is not server authentication.

An acknowledgment changes delivery state only; a late acknowledgment must not overwrite a later local head, advance a remote cursor or replace the active generation. Identical outcomes replay; altered or contradictory terminal outcomes reject. Preserve the original `commit()` receipt through acknowledgment and recovery.

A rejection must atomically retain the rejected operation and block all transitive dependents without changing canonical local heads. New operations depending on a rejected or blocked operation must also become blocked. Independent operations remain eligible for delivery. A sender must require acknowledged dependencies and reject missing, cyclic or cross-generation references; the current audit-oriented `listOutbox()` is not a sender queue.

Tests must include A→B→C rejection with independent D and later dependent E, acknowledgment after later edits, close/reopen, changed receipts, exact tombstone sets, two-handle races, transaction abort at each checkpoint and account-switch late responses. These establish L02/L06/L07/L08 locally; authenticated transport and actual backend evidence remain additional gates.

## Local and remote conflict bases

A new local operation can bind current local heads while retaining the named stale alternative and resolution provenance. Recording that provenance and committing the replacement must be atomic; a stale replacement leaves the original alternative unresolved.

Remote resolution needs a further protocol decision before implementation. After local A→B and server rejection of A, current local heads and server heads differ. The existing `expectedHeads` cannot serve both CAS conditions. Freeze separate digest-bound remote preconditions and retained remote-base evidence before authoring remote resolutions. Never rewrite/re-sign a queued envelope or label a new local commit as successful remote conflict resolution.

## Durable inactive generation staging

Verify a detached candidate and derive a deterministic, versioned chunk plan before write transactions. Persist an immutable owner/stage/generation/seal binding and exact chunk inventory. Each chunk and its completion marker must commit together. Retrying exact content resumes the same stage; changed IDs/content reject using both digest and canonical equality.

After all writes, reread and verify complete durable coverage, hashes, aggregate references and recovery metadata. Compare that exact verified state again inside the final sealing transaction. Missing/extra chunks, forged completion records or changes between verification and sealing prevent sealing. Keep hashing, network and blob awaits outside write transactions.

The archive digest preserves supplied top-level collection order while repository snapshots reconstruct identity order. The stage plan must retain the original collection identity order (or equivalent exact candidate data) so sealing does not compare an independently reordered archive. Arrays inside record bodies remain unchanged.

Tests must cover interrupted chunks, reopen/resume, content collisions, two handles, corrupt markers, missing/extra chunks and changes after readback. These establish the local C03–C07/L11–L12 staging mechanics, not external artifact or owner parity verification.

## Activation authorization and atomicity

Current generation seals always declare `legacyCutoverAuthorized: false` and `externalArtifactsVerified: false`. A `new-empty` candidate proves only supplied-archive emptiness. An absent account pointer does not prove an owner has no legacy records. Production activation must remain denied until independently verified bootstrap or migration evidence exists; caller booleans are not authority.

Freeze a distinct generation-activation operation variant in the shared owner-global operation ledger. Do not disguise pointer activation as an ordinary empty record operation. Its digest binds stage/seal, exact expected pointer, next pointer token and operation identity. Replay the original receipt first, then check pointer CAS, durable sealed state and authorization atomically with pointer/generation state, account sequence, receipt and outbox. Preserve prior generations and never reset the account sequence.

An isolated synthetic harness can verify the activation transaction without enabling product cutover. Tests must cover lost responses, exact replay, two-handle pointer races, rollback after pointer/receipt/outbox writes, wrong owner, stale pointer and reserved tokens. All current production proof classes remain denied.

Generation-to-generation replacement remains outside the current candidate format: it contains one version per live archive identity, not all retained storage versions, tombstones, operation receipts or pending outbox. Those records cannot be stranded by a pointer change.

Real migration additionally requires verified backup bytes, complete raw captures, explicit media dispositions, feature/operating-consumer parity, source-version rechecks and an old-writer barrier. These are delivery gates, not reasons to discard the existing data or silently relax W04 acceptance.
