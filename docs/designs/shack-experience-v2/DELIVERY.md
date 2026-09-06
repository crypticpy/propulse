# Dependency-based delivery proposal

This extends the existing workbench plan without renumbering S/W/P IDs or changing its completion rules. Reuse existing issues for canvas/commands/accessibility; add focused work packages for presentation, media and classifieds. The scope is requirements and sketches in this PR, not implementation or database deployment.

## Technical order

| Phase | Work and dependency gate | What it enables |
| --- | --- | --- |
| A — Reconcile shared contracts | Finish existing revision persistence/access/commands (#177, #178, #179) against the implemented equipment/graph contracts (#175, #176). Define media attachments and sale snapshots with migrations/recovery before dependent publication. | Reliable graph edits, independent layouts, reusable media and owner-authorized records |
| B — Build independent UI tracks | Canvas/list refinement in #184/#185; media storage/processing and gear upload/URL-import UI; owner presentation over graph revisions. These can proceed with contract fixtures once interfaces are stable. | A real flowchart workspace, reusable photo library and polished reference diagram |
| C — Publish composed experiences | Audience-correct presentation, banner/albums/viewer and listing preparation. Require tested media grants, revision publication and lifecycle behavior. | Deliberately shared stations, personal photos and individual gear listings |
| D — Discover and contact | Search/indexing, seller contact relay, expiry and moderation; require reliable listing projection and invalidation. | A master available-gear directory with useful contact and administration |
| E — Integrated evidence | Existing #185/#194/#195 gates plus media/sale scenarios; migration, access, rollback, bundle and real-operator checks. | Evidence-based cutover with all retained capabilities accounted for |

Public sales need not wait for advanced RF analysis or every optional station documentation layer. Conversely the editor should not wait for a marketplace. Dependencies are shared records and authorization, not a single long feature train.

## Proposed records and boundaries

| Record | Responsibility | Invariants |
| --- | --- | --- |
| Equipment / setup instance / port / connection | Existing domain contracts | Stable identities; moving nodes cannot change topology or ownership |
| EditorLayout / PresentationLayout | Separate versioned layout kinds | Reference canonical IDs; route selection and diagram grouping have distinct meaning; viewport preference is not a setup revision |
| PresentationPublication | Reviewed revision + featured route + allowed metadata/media/layout | Updates require explicit publication; public projection never reads mutable private editor state |
| MediaAsset / MediaRendition | Owner, storage identity, status, dimensions/format and processing outputs | Original ownership and completion state checked server-side; no secrets/public URLs baked into durable domain records |
| MediaAttachment / Album | Context, order, caption, alt text, crop/focal point and visibility | Personal, setup, gear, banner and sale uses have independent grants; detaching one use does not delete another |
| GearListing / ListingRevision | Owner/item link, selected public content, asking terms, availability, timestamps | Public snapshot is an allowlist; stable listing URL; optimistic concurrency and transactional state transitions |
| ListingProjection / search document | Published available discovery fields | Rebuildable projection, no private inventory columns; withdrawal/sold/expiry invalidate detail/search/cache |
| Inquiry / report / moderation event | Authorized contact, abuse controls and auditable actions | Idempotent sends and delivery outcomes; private contact not disclosed by default; no payment/order/escrow semantics |

Supabase remains the database/storage platform. Proposed new schema and storage policies belong in migrations with RLS/API/storage tests, not browser-only assertions. Storage keys and renderer types must not become public domain identities.

The current `usePublicEquipmentImage` constructs owner-bound public URLs in `equipment-images`, and existing radio/antenna/amplifier records can hold up to five gallery IDs. This source audit does **not** verify deployed bucket policy or establish an album system. Audit deployed access and preserve old references before migration. Do not put new private originals into a bucket assumed private merely because its UI says so.

For new media, prefer private originals and authorized rendition access. Public projections mint only permitted rendition access; private/friend scopes receive their own authorization. A proposed maximum signed-URL lifetime of five minutes bounds residual access after revocation; new authorization requests must reject immediately. Review CDN/cache policy together with that bound. Shared assets can legitimately remain public through another active attachment, which must be shown to the owner. Public downloads already made cannot be recalled.

## Renderer decision

Continue the recorded controlled React Flow adapter, custom station nodes and shared command/undo service. Named handle IDs map to domain ports. Orthogonal routing, crossing treatment and multi-port/group layout need an integration evaluation; external auto-layout is an optional measured dependency, not an assumption that the renderer supplies it. Presentation should use a lightweight read-only renderer that does not load the editor package on public profiles. Both consume domain projections and share node/line typography and glyph definitions.

Official references checked for this proposal: [named handles](https://reactflow.dev/learn/customization/handles), [layout options](https://reactflow.dev/learn/layouting/layouting), [carousel accessibility](https://www.w3.org/WAI/tutorials/carousels/), [Supabase public/private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals). Exact dependency versions and measured transfer costs are implementation evidence still to collect.

## Decisions before implementation

| Proposal | Why / decision still needed |
| --- | --- |
| No photo autoplay | Lets the operator choose pace; accessible controls and reduced-motion behavior are simpler |
| 20 MB/image, 50 images/album, 12/listing; JPEG/PNG/WebP initially | Starting capacity assumptions only; confirm supported formats, decoded-pixel limits, processing cost and user-facing quotas |
| 60-day listing expiry with renewal | Avoids stale available stock; confirm expiry notifications and reminder cadence without sending notifications during planning |
| One live listing per owned physical item | Keeps availability comprehensible; multi-item kits and quantity stock need explicit later rules |
| Authenticated inquiry relay initially | Avoids default public contact disclosure; choose delivery provider/reply route and operating limits before launch |
| Public directory browse, authenticated seller/contact actions | Proposed access model; existing configured-client profile gates remain until an explicit product/access change is implemented and tested |
| Public photo renditions with bounded access/cache expiry | Confirm revocation SLA, quotas and retention. Existing public URLs need a migration audit and cannot be assumed revocable by changing profile flags |

## Required fixtures and proof

1. Linear HF, switched antennas, shared gear, inline run, receive-only, portable, unknown/custom equipment and unsupported analysis branches. Verify editor/list parity and unchanged operating selection after arranging/presenting.
2. Independent presentation layouts, publish revision A, edit private B, visitor still sees A, then explicitly publish B. A redacted internal node must never create a fabricated direct link.
3. Empty profile, private album, friend-only album, public album, reused banner/gear/listing photo, failed upload, removed cover, hidden neighbor and access revoked while viewer is open. Check direct URLs and counters as well as UI.
4. Listing draft, published edit, reservation, sale, expiry, withdrawal, concurrent edit and relisting. Assert no implicit setup mutation and no private fields in search/API/rendered metadata.
5. Inquiry retries, delivery failure, abuse throttling, blocked users, moderator hide/restore and immediate available-index removal after a status change. Make the index repairable and observable.
6. Actual keyboard, click/tap, touch, screen-reader, text-zoom and four-theme checks plus consenting operators using their own displays. Follow existing W22 protocol; no simulated participant outcomes are claimed.

## Accountability

`coverage.json` maps each requirement to one primary issue; dependencies may be shared. New implementation work starts as Todo/unclaimed, with @crypticpy as accountable coordinator. An implementer must claim file scope, branch and isolated worktree before edits. A proposal/image PR records planning delivery only. Completion requires the issue's full criteria, passing tests, screenshots where relevant, migration/access evidence where relevant, merge and deployment proof. Existing #173 and W01–W22 work remain the parent preservation/cutover contract.

## Tracked implementation packages

| Issue | Scope | Prerequisites |
| --- | --- | --- |
| [#277](https://github.com/crypticpy/propulse/issues/277) | Shared media and URL import | [#177](https://github.com/crypticpy/propulse/issues/177), [#178](https://github.com/crypticpy/propulse/issues/178) |
| [#283](https://github.com/crypticpy/propulse/issues/283) | Visible gear photo controls | [#277](https://github.com/crypticpy/propulse/issues/277) |
| [#278](https://github.com/crypticpy/propulse/issues/278) | Station presentation and setup gallery | [#176](https://github.com/crypticpy/propulse/issues/176), [#177](https://github.com/crypticpy/propulse/issues/177), [#178](https://github.com/crypticpy/propulse/issues/178), [#187](https://github.com/crypticpy/propulse/issues/187), [#277](https://github.com/crypticpy/propulse/issues/277) |
| [#279](https://github.com/crypticpy/propulse/issues/279) | Profile banner, albums and viewer | [#188](https://github.com/crypticpy/propulse/issues/188), [#277](https://github.com/crypticpy/propulse/issues/277) |
| [#280](https://github.com/crypticpy/propulse/issues/280) | Owned-gear sale listings | [#175](https://github.com/crypticpy/propulse/issues/175), [#177](https://github.com/crypticpy/propulse/issues/177), [#178](https://github.com/crypticpy/propulse/issues/178), [#277](https://github.com/crypticpy/propulse/issues/277) |
| [#281](https://github.com/crypticpy/propulse/issues/281) | Directory, contact and moderation | [#280](https://github.com/crypticpy/propulse/issues/280) |

Canvas refinement remains in #184 and accessible interaction in #185; real-operator review and cutover remain #194/#195. New packages are children of #276, which extends #173. Closed contract prerequisites remain recorded because implementation depends on their delivered contracts. Native GitHub dependencies and Project 3 track readiness; this table and coverage register define requirement ownership.
