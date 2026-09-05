# W05 access verification plan

Status: **policy/projection foundation only**. This document maps [issue #178](https://github.com/crypticpy/propulse/issues/178) acceptance criteria to (1) implemented pure policy tests and (2) remaining real owner/friend/visitor/signed-out API, SQL, storage, cache and old-URL evidence. It does **not** close W05.

Parent: #173. Requirements: S06, S12, S16. Coordinator: Codex (storage/backend integration). HamClock remains independently owned. No real owner data, tokens or credentials are recorded here.

Pure tests live in `src/lib/station/workbench/publication/evaluate.test.ts`. They use synthetic fixtures from `src/lib/station/workbench/fixtures.ts`. Passing them is not RLS, CDN, signed-URL or application-cache evidence.

## Trust boundary

`evaluatePublicationPolicy` is a policy component. The server caller must supply:

- `verifiedAccountId` from a verified session, or `null` when signed out
- `friendship.state` from a current server relationship query (`current` / `pending` / `revoked` / `absent`)
- `publicationPresent` and `publicationVersion` from the pinned publication row
- `mediaGrants` from the current grant table, not from a client body

`publicationAccessContextSchema` is `.strict()`. Client fields such as `claimedAudience` or `claimedOwnerId` are invalid input. `publication.ownerId` on the source must be the pinned server record, not a request-body owner id. `PUBLICATION_POLICY_TRUST_BOUNDARY` states that this function is not a secured endpoint.

## Acceptance criteria map

### 1. Owner/friend/visitor allowlists, section visibility, grid precision, featured summaries

Issue text: define owner/friend/visitor field allowlists and enforce them server-side, including section visibility, chosen grid precision and featured setup summaries.

| Evidence | Where | Status |
| --- | --- | --- |
| Owner / friend / visitor / signed-out field allowlists | `evaluatePublicationPolicy` + tests for friend summaries, visitor/signed-out withholding, owner preview matching visitor shape | **Policy tests only** |
| Missing visibility is withheld, not public | `withholds sections when visibility is missing instead of defaulting to public` | **Policy tests only** |
| Featured labels from selected instances, no inventory spread | friend featured-summary test; `rejects inventory spreads into featured selection` | **Policy tests only** |
| Chosen grid precision; no implicit private-location derivation | precision tests; zero-coordinate test | **Policy tests only** |
| Server-side enforcement on API responses | No route calls this projector yet | **Remaining** |
| Owner/friend/visitor/signed-out HTTP tests against deployed or local API | Remaining for Codex | **Remaining** |

### 2. Audit Friends rendering, row policies, media bucket, URL delivery and caches

Issue text: audit current Friends rendering, row policies, media bucket policy, URL delivery and caches; distinguish established defects from unverified baseline observations.

See [Baseline audit](#baseline-audit). Policy tests do not exercise those paths. Remaining work is real API/SQL/storage/cache evidence.

### 3. Exact location, serials, receipts, purchase/private notes and raw wiring stay private

Issue text: exact location, serials, receipts, purchase/private notes and raw wiring/inventory stay private by default, including nested responses, exports and thumbnails.

| Evidence | Where | Status |
| --- | --- | --- |
| Synthetic nested private fields never appear in projection, denials or media IDs | `expectNoLeaks` across success, denial, media and malformed-input tests | **Policy tests only** |
| Owner preview uses the same public shape | owner-preview-as-visitor test | **Policy tests only** |
| Nested exports / share-card pixels / thumbnails | FP38 / W19; not this package | **Remaining** |
| Real API nested JSON, storage objects and caches | Remaining for Codex | **Remaining** |

### 4. Visibility changes, revoked friendship, cached responses, previously obtained image URLs

Issue text: test visibility changes, revoked friendship, cached responses and previously obtained image URLs against the documented access/expiry contract.

| Evidence | Where | Status |
| --- | --- | --- |
| Section visibility change changes featured/modules | `changes featured and module output when section visibility changes` | **Policy tests only** |
| Revoked/pending/absent friendship is visitor, not friend | parameterized friendship test | **Policy tests only** |
| Friends-only publication denied to visitor/signed-out/pending | friends-only denial test | **Policy tests only** |
| Revoked media grant omitted; no implication that an old URL is revoked | media grant test (`old-cover-url` / `revoked` absent from output) | **Policy tests only** |
| Application caches after visibility/friendship change | none | **Remaining** |
| Previously obtained / signed / public URL fetch after grant revocation | none; DOMAIN-DECISIONS current-grant mediation is unimplemented | **Remaining** |
| `Cache-Control: no-store` on restricted media | none | **Remaining** |

Required verification on the issue: negative API/RLS/media tests for owner, friend, visitor and signed-out. **Not started.** Preserve this matrix; do not treat the vitest file as that evidence.

## Baseline audit

Source revision for this checkout: `origin/main` including PR #237 (`4812bff113bf7a728fc5c98269177fe4321b3988`). Observations below are from reading current source. They are not production-incident reports.

### Confirmed source defects (no runtime fetch performed)

| ID | Finding | Paths | Treatment |
| --- | --- | --- | --- |
| CR01 | Visitor rendering and the public equipment cache treat any non-`private` visibility as visible/publishable. A `friends` setting is not distinguished from `public` on these paths. Missing `visibilitySettings` also renders the section (`!vis \|\| vis.* !== "private"`). | `src/pages/ProfilePage.tsx` (stats/location/activity/equipment/awards/grid checks), `src/lib/sync/modules/profileEquipmentCache.ts` (`visibilitySettings.equipment !== "private"` then writes `stats_cache.equipment`), `src/types/social.ts` (`DEFAULT_VISIBILITY.equipment` / `activity` are `"friends"`) | Policy now withholds missing and friends-only sections from visitor/signed-out shapes. W16 must render the server projection instead of repeating the predicate. Runtime API/RLS tests still required. |
| CR02 | Visitor `MyNetsSection` ignores its reserved `userId` and reads the viewer's `netStore.subscriptions`. Visitor social tab mounts owner-oriented `FriendList` without a target id. | `src/components/nets/MyNetsSection.tsx`, `src/pages/ProfilePage.tsx` (visitor tab mounts) | Policy does not yet emit nets modules (skeletal DTO). W05 server must not return another operator's subscriptions; W16 must scope target-owner data. |
| CR07 (related) | `ContactThisStation` treats coordinates as missing when `lat`/`lon` are `0` (`!!profile.lat && !!profile.lon`). | `src/components/profile/ContactThisStation.tsx` | Policy accepts finite `0,0` as private input and still withholds coordinates. W16/W19 own the contact UI fix. |

### Observations that need runtime evidence

| Observation | Paths | Why it is not yet a confirmed leak |
| --- | --- | --- |
| `profiles_select` keys on `visibility_settings->>'profile'`, but `VisibilitySettings` has `stats` / `awards` / `equipment` / `activity` / `location` and no `profile` field. | `supabase/migrations/20260210020000_rls_performance.sql`, `src/types/social.ts` | Whether stored JSON includes a `profile` key, and who can `SELECT` a row, needs SQL tests with real roles. If the key is absent, the policy may over-restrict rather than leak; unverified. |
| Achievements and activity-feed SELECT also use the same `profile` visibility key plus `follows.follower_id → following_id`. | same migration | Follows are one-directional. DOMAIN-DECISIONS requires authenticated **friend** verification. Whether one-way follow equals friend access needs an explicit server rule and tests. |
| `user_images` RLS is owner-only; `equipment-images` bucket is created `public: false` with owner-folder SELECT. | `supabase/migrations/20260208010000_user_images_and_storage.sql` | Suggests originals are not anonymously readable **if** the live bucket still matches the migration. Confirm with storage tests as each role. |
| `usePublicEquipmentImage` builds `getPublicUrl("{userId}/{imageId}.jpg")` for the private bucket. | `src/hooks/usePublicEquipmentImage.ts`, `src/lib/sync/modules/imageSync.ts` | `getPublicUrl` constructs a URL; it does not prove the object is fetchable. If the bucket is private, visitors likely get 400 rather than bytes. If the bucket was later made public, this would expose raw originals. Runtime GET as owner/friend/visitor/signed-out is required. It is **not** current-grant mediation. |
| Equipment summaries in `profiles.stats_cache` ride on the profile row. Combined with CR01, friends-visible equipment may be written into a cache that any successful profile SELECT can read. | `src/lib/sync/modules/profileEquipmentCache.ts`, profile SELECT policy | Leak vs empty cache depends on who can read `profiles` and whether `stats_cache` is stripped per audience. Needs API/SQL tests. |
| No publication grant table, mediated media route, or audience-specific cache invalidation exists in this checkout. | workbench contracts only demonstrate `publishedProfileSchema` / `publicationSourceSchema` | W01 shapes are not access control (`src/lib/station/workbench/README.md`). |

## Remaining real access-control evidence (coordinator)

Each row needs owner, friend, visitor and signed-out actors. Use disposable test accounts, not production owner data.

### API

- Request the published profile without a session, with a non-friend session, with a current friend session, and as the owner.
- Repeat after changing section visibility and after revoking friendship.
- Owner preview endpoints must return the same allowlisted body as the previewed audience.
- Confirm request-body `audience` / `ownerId` cannot widen access.
- Nested JSON, error bodies and exports must omit serials, receipts, exact coordinates, wiring, recovery envelopes and private image paths.

### SQL / RLS

- `profiles`, `achievements`, `activity_feed`, `follows`, `user_images`, and future publication/grant tables: SELECT/INSERT/UPDATE/DELETE as each role.
- Prove friends-only rows are absent for visitor/signed-out, not merely hidden in UI.
- Resolve whether relationship is mutual friendship or one-way `follows`; document the chosen query.
- Reconcile `visibility_settings->>'profile'` with the actual settings shape.

### Storage / media

- Bucket remains private; owner can read own originals; friend/visitor/signed-out cannot.
- Restricted derivatives are delivered only through authenticated mediation that **re-checks the current grant** (DOMAIN-DECISIONS). Do not issue durable public URLs for private originals.
- Restricted responses use `no-store`. Versioned public derivatives revalidate grants at the delivery boundary.
- After revocation: future GET of the mediated URL fails; a previously copied URL is documented as “already issued bytes cannot be recalled”, not as a revoked-but-still-valid URL.
- If signed storage URLs are used, their expiry and delayed-revocation behavior need a documented contract update before W05 can pass.

### Cache

- Audience-specific application caches drop friends-only content after visibility tightening or friendship revocation.
- Offline privacy tightening hides local copies while distinguishing pending server revocation (DOMAIN-DECISIONS §5).
- `profileEquipmentCache` must not keep publishing friends equipment as if it were public.

### Old URLs

- Capture a derivative URL while a grant is current, revoke the grant, then fetch again as each role.
- Do not count a policy unit test that omits a revoked id as this evidence.

## Policy tests that already exist (not a substitute)

Command: `npx vitest run src/lib/station/workbench/publication`

Covered negatives: synthetic private nested fields; wrong-account `ownerPreviewAs`; extra client audience fields; absent/pending/revoked friendship; missing publication; version mismatch; missing/revoked/absent grants; section changes; grid precision; malformed grids; hidden+grid; unknown featured ids; mixed equipment ownership; owner preview; visitor and signed-out shapes; input immutability; no leakage through errors or media metadata.

## Proposed shared-contract additions (not applied)

This slice did not edit `src/lib/station/workbench/contracts.ts` or root exports. Coordinator integration should consider:

- `signed-out` on `publishedProfileSchema.audience`
- section visibility, location disclosure and intended media IDs on `publicationSourceSchema`
- grant records (`assetId`, `derivativeId`, audience, status) as server tables, not client DTO fields
- W15/W16 module payloads for FP23–FP40 (license, contact/social, awards, rank, on-air, nets, stats, QSL, share-card inputs) without putting private credentials or exact coordinates on the public type
