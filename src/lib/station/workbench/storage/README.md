# W04 storage foundation — in progress

This internal package establishes additive storage for [W04 / #177](https://github.com/crypticpy/propulse/issues/177). It is not imported by the application writer, and does not replace legacy station data or activate a generation merely by opening a database. Backend authorization/sync, migration cutover and real owner recovery evidence remain separate completion gates.

| Module | Boundary |
| --- | --- |
| `serialization.ts` | Deterministic plain JSON encoding and SHA-256 outside write transactions. |
| `operations.ts` | Strict typed operation envelopes, complete declared write sets, storage-head expectations, W03 draft preconditions, owner/body identity checks and digest preparation/verification. |
| `database.ts` | Internal owner-bound IndexedDB connection, ten additive stores, explicit absence pointer and lifecycle/upgrade failure handling. Its transaction bridge is not a UI write API or an authorization boundary. |
| `state.ts` | Synchronous full-state validation inside the repository transaction: storage/semantic conflicts, append-only revision history, W03 clone/restore source preservation, reference-aware deletion and reviewed-selection gates. |
| `repository.ts` | Atomic local save, permanent replay receipts, conflict alternatives and outbox; full snapshot reads and account/generation fencing. |
| `outbox.ts` | Indexed owner/generation/state reads; per-state limits bound materialized rows for audit listings. |
| `staging.ts` | Pure supplied-archive/manifest validation and derived seals; external artifacts remain unverified and legacy cutover unauthorized. |

`serialization.ts` defines the shared canonical JSON encoding and SHA-256 digest helper for future operation envelopes. It sorts object keys by UTF-16 code units, preserves array order and finite JSON scalar values, retains own reserved property names, and reads data descriptors without invoking getters or `toJSON`. JSON.stringify escaping preserves lone UTF-16 surrogate code units before UTF-8 hashing. Negative zero uses JSON's zero representation; no Unicode normalization occurs.

Non-JSON values, cycles, sparse or decorated arrays, accessors, hidden/symbol properties and nesting beyond 128 containers are rejected, never silently omitted or truncated. Original migration backup bytes need their own byte-level digest; a canonical operation digest does not replace an exact source backup.

`prepareStationOperation` normalizes and detaches an unsigned proposal before hashing it. `verifyStationOperation` rejects changed digests and signed content that would change under schema normalization. Neither function authenticates an owner or proves that current storage heads match. Ordinary operations cannot author operating/publication-source records; W08/W05 own those gates. An immutable revision uses its domain ID as its version ID.

`evaluateStationChange` must receive the complete current archive and storage heads from the write transaction. It detects a concurrent setup rename even when the draft graph ID is unchanged, requires newly appended revisions for changed draft heads, and rejects source-forged clones/restores by replaying the W03 services. Independent transition/lineage invariants reject before CAS. Stale operations retain an explicit quarantined classification because a complete historical validation context is unavailable; they cannot become canonical history or sendable work. A new reviewed replacement still requires full aggregate validation. Full aggregate validation rejects deletions that would strand retained references.

Only the dedicated database name or a disposable `propulse-station-workbench-test-*` name is allowed. The database requests strict write durability where supported and preserves real storage errors. It uses compound owner-first keys, closes/invalidates handles on version changes or termination, and aborts in-flight work on close. It preserves blocked, future or corrupt databases for recovery instead of deleting and recreating them. Opening does not initialize a generation, active pointer, sequence or legacy data.

Run `npm test -- src/lib/station/workbench/storage`, scoped ESLint and `npm run build` while developing; the final delivery record includes full required checks. [W04 local verification](../../../../../docs/designs/profile-shack-workbench/W04-LOCAL-VERIFICATION.md) maps implemented tests and the reproducible Chromium runner to remaining gates. These checks do not establish cloud durability, deployed access control, migration parity or immunity to browser storage eviction. Activation, synchronization, migration recovery and UI cutover remain in progress.

Before each new commit, the repository hashes retained bodies and verifies queued operation envelopes after a readonly snapshot. The write transaction rereads and compares that exact state and dependency snapshot before accepting a save. Concurrent changes retry the audit up to three times; continuing contention returns `retry-required`, not corruption. Exact prior-operation replay remains first. Conflict receipts bind their retained ledger, target identities, validation classification and available base bodies.

The [next storage gates](../../../../../docs/designs/profile-shack-workbench/W04-NEXT-STORAGE-GATES.md) record remaining acknowledgment, conflict-resolution, staging and activation dependencies.
