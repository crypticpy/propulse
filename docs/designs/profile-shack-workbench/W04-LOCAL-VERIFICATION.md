# W04 local repository verification

Tracking: [#177](https://github.com/crypticpy/propulse/issues/177), parent #173. This slice implements an internal additive browser repository and pure generation-candidate seals. **W04 remains open.** The application still uses its existing writer; no legacy generation is activated, replaced or deleted by this slice.

This matrix records the initial foundation boundary. The subsequent [durable local delivery slice](W04-DURABLE-DELIVERY.md) adds acknowledgment/rejection recording, dependency blocking, readiness and the additive v2 schema upgrade; its evidence supplements the L02/L06/L07/L08 rows below. Authenticated synchronization and cutover remain incomplete.

## Implemented boundary

- A dedicated IndexedDB schema uses owner-first compound keys and an explicit per-account generation pointer. Opening does not initialize a generation or write legacy data.
- Strict operation envelopes bind owner, generation, operation ID, exact storage expectations, W03 draft preconditions and declared writes. Digests are calculated before opening a write transaction.
- An atomic save appends immutable versions, advances declared heads/tombstones, stores its exact receipt and pending outbox, and increments the account sequence together. Failure aborts the actual transaction.
- Stale writes preserve a named quarantined proposal, original operation and expected/actual bases; aggregate validity remains unproven without a complete historical validation context, and the outbox is unsendable; they do not change canonical heads. Reusing an operation ID replays its original outcome or rejects changed content.
- Full aggregate validation protects owner/reference closure and historical pins. W03 clone/restore content is regenerated from its named source and compared, preventing forged source provenance or a historical head rewind.
- Incoming record digests and fresh version tokens are checked. Retained bodies and queued dependency envelopes are hashed/verified after a readonly snapshot, then bound by exact state comparison inside the write transaction. Concurrent changes trigger a bounded retry; continued contention returns `retry-required`. `readSnapshot` also rehashes retained bodies after its readonly transaction completes. No WebCrypto/network work is awaited inside a write transaction.
- Generation candidate seals recompute supplied archive, manifest, record and canonical raw-payload digests. They always declare external artifacts unverified and legacy cutover unauthorized. They do not authenticate an owner, fetch a backup, verify actual media bytes or prove legacy source parity.

Top-level archive collections reconstruct in storage identity order. Per-record arrays, private recovery payloads and pinned graph data remain unchanged. Layout ordering comes from the explicit layout records, not the order of IndexedDB rows. An exact original legacy export still requires the retained original backup and source mapping.

## Reproducible checks

```sh
npm test -- src/lib/station/workbench/storage
npm run lint
npm run build
python3 docs/designs/profile-shack-workbench/verify-plan.py
python3 -m unittest discover -s docs/designs/profile-shack-workbench -p 'test_*.py'
```

For real-browser verification, follow [local testing](../../guides/LOCAL-AGENT-TESTING.md), start an owned local server from this checkout and pass its exact printed origin:

```sh
node scripts/check-station-storage-browser.mjs http://127.0.0.1:5181
```

The script verifies the managed server identity, checkout and local profile. It creates a disposable Chromium context and a uniquely named synthetic database. Direct fixture seeding is test setup, **not** product activation. It checks a real IndexedDB commit, close/reopen, two-handle conflict, exact replay, forced write-transaction rollback, durable outbox, reviewed-pin preservation and account isolation. It does not use authenticated browser state, personal records, hardware, cloud sync or owner fixture provisioning. The coordinator stops only that script's owned server afterward.

Reserved application database names are rejected before opening. Strict write durability is requested where supported, lifecycle closure propagates without classifying healthy data as damaged, and outbox listings use bounded indexed reads. Conflict receipt tampering and old-version token reuse reject. Receipt availability is a bound historical observation, not a label recomputed from later state; outbox audit rows must match their permanent receipts. Clone proposals declare the mutable source setup head as a read dependency, and nested legacy/publication integer identities are bounded before sealing. See [next storage gates](W04-NEXT-STORAGE-GATES.md) for remaining work.

The delivery comment records exact final test counts and CI/deployment evidence. The initial integrated checkpoint passed 133 storage tests and all eight browser checks with no page errors; these results do not replace the final full-repository gates.

## W04 verification matrix status

| Plan IDs | Evidence in this slice | Remaining boundary |
| --- | --- | --- |
| L01, L03, L04 | Local saves/reopen, competing handles and rename-versus-edit conflicts; historical pins retained | Cloud concurrency and cross-device evidence |
| L02 | Exact replay before and after later local edits; changed operation payload rejects; receipt/write-set binding tested | Acknowledgment handling and replay after actual cloud acknowledgment |
| L05 | Failure after reads, versions, heads, receipt and outbox rolls back; Chromium confirms a forced transaction abort | Device power-loss durability is not promised |
| L06, L07 | Durable pending dependencies and conflicting alternatives retained | Network ordering, late acknowledgments, rejected-parent dependency blocking and explicit conflict resolution |
| L08 | Bound account handles, separate generations and close/abort isolation | In-flight network responses after sign-out/account switch |
| L09, L10 | Tombstones, stale resurrection, referenced-deletion rejection, immutable collisions and exact source pins | Remote partial pulls/cursors and complete recovery export |
| L11, L14 | Pure supplied-record/media-reference coverage and candidate seal verification | Durable staged chunks, actual artifact/blob checks, capture completeness and source parity |
| L12, L13 | No activation or rollback API in this slice | Atomic pointer activation, interruption/reopen at every migration checkpoint and post-cutover recovery |
| L15 | Missing IndexedDB, blocked/future/corrupt schema, invalid metadata, transaction abort and forced connection termination | Browser eviction/quota scenarios and user recovery presentation |
| L16 | No remote page/cursor application | Atomic remote page/conflict application and pagination/retry proof |

Backend API authentication, SQL/RLS, immutable server writes, real two-connection database races, current-grant media enforcement and an actual owner backup recovery rehearsal remain tracked gates. Unit tests, local browser tests and a merged helper library do not close them. W08 selection, W10 equipment UI and W11–W14 editors/presentation remain separate delivery packages.
