# W04 backend boundary and PostgreSQL test foundation

Tracking: [W04 #177](https://github.com/crypticpy/propulse/issues/177), [workbench delivery #173](https://github.com/crypticpy/propulse/issues/173).

This dependency slice supplies strict authentication helpers, lossless SQL storage codecs and a disposable PostgreSQL test runner. It does not enable an endpoint or apply a production migration. W04 remains open.

## Verified owner boundary

`api/_lib/stationAuth.ts` verifies an explicit bearer token with Supabase `auth.getUser()` using server-side `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Only the verified user's UUID becomes `ownerId`. Missing configuration fails closed; no browser configuration, request-body owner, decoded JWT claims or local-development identity supplies authority. Client session persistence and refresh are disabled.

A verified owner is an authentication result. Each eventual endpoint must separately validate its domain input, owner binding and authorized operation. Mocked unit tests cover this helper; they do not establish live GoTrue, signed-JWT or RLS behavior.

## Lossless storage representation

`api/_lib/stationEncoding.ts` snapshots canonical workbench JSON synchronously before hashing. The returned `canonicalText` must be stored as exact PostgreSQL `TEXT`; `payloadDigest` is lowercase SHA-256 over its UTF-8 bytes. Decode requires exact canonical JSON and the matching digest, then returns a detached, deeply frozen unknown for the caller's domain schema to validate.

Do not regenerate hashes from `jsonb::text`. Existing records can contain NUL characters and lone UTF-16 surrogates; JSON escaping preserves them in SQL text while a JSONB conversion can reject or change the representation. Canonical decoding rejects alternate whitespace, duplicate keys and other aliases even if their supplied digest matches.

Opaque domain IDs are stored as canonical JSON-string text with future SQL `COLLATE "C"`. They remain nonempty and unpadded; the codec does not trim, normalize or coerce them to UUIDs. Verified account owner UUIDs are separate from these opaque IDs. Encoded relational sorting is not domain collection order; callers must retain or reconstruct the contract's explicit order.

These codecs are not schema validation, owner authorization, operation verification or a transaction fence.

## Disposable PostgreSQL gate

Run from this checkout with Docker already running:

```sh
node scripts/check-station-postgres.mjs --confirm-disposable-station-postgres
```

The runner uses explicit Docker context `desktop-linux` and a cached, digest-pinned Supabase PostgreSQL 17 image. It creates one uniquely labeled container with no network, published ports or mounts, runs as the image's PostgreSQL UID with dropped capabilities, and starts a fresh cluster directly. It loads only the pinned initial role/extension and auth schema files, then verifies PostgreSQL 17, isolated settings, roles, `auth.users` and the authenticated `auth.uid()` singular claim setting.

Every execution and cleanup verifies the exact container ID and ownership labels. Cleanup removes that container on success, failure or handled interruption; a cleanup failure retains its CID file for diagnosis. Existing containers and databases are outside this runner's scope.

Optional repeated `--migration` and `--fixture` flags select individual station-named SQL files inside the checkout, in the supplied order. The runner never discovers or replays the repository's complete migration directory. Selected files are detached before Docker starts and checked against the harness ownership marker. This intentionally restricted SQL subset rejects every backslash and NUL character, including those inside strings or comments, so a file cannot issue psql control commands; use SQL expressions such as `chr(92)` when a literal backslash is required. Each selected file’s remaining transaction is explicitly committed before the ownership check and completion sentinel, so an accidentally unclosed transaction cannot silently roll back after a PASS. Fixtures must explicitly `ROLLBACK` their transient changes. Every SQL invocation requires successful exit and a fresh exact completion sentinel after the same-session ownership check.

The resulting evidence is PostgreSQL-only. It does not establish HTTP authentication, PostgREST, Storage, full application migration replay, remote synchronization or production deployment.

## Next dependency

The [proposed Supabase transaction slice](W04-SUPABASE-TRANSACTION-PLAN.md) records the next contract decisions. Implement owner-scoped immutable versions, heads and permanent operation receipts after those transaction and fencing decisions are frozen. Exercise real SQL ownership isolation, exact replay, conflicting replay, stale head CAS, tombstones, account/generation scope, concurrent writers and rollback with this runner. Direct authenticated writes and privileged RPC execution must be tested explicitly against the pinned bootstrap's grants.

Remote conflict preconditions, sender ownership, durable staging, activation authorization and migration/feature parity remain governed by [W04 remaining storage gates](W04-NEXT-STORAGE-GATES.md). No current synthetic generation seal authorizes product cutover.
