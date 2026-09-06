# Acceptance register

Proposed extension to the existing S01–S17 register; IDs here use the explicit SX2 namespace and do not replace prior criteria. Every row needs implementation and verification evidence before it can be marked delivered. The primary issue for each ID is recorded in [coverage.json](coverage.json).

## Canvas editor

| ID | Requirement and acceptance evidence |
| --- | --- |
| SX2:C01 | Render a controlled flowchart canvas with equipment-specific nodes and stable named ports. A radio → tuner → switch → two antennas fixture must show each recorded endpoint, cable/run and branch without deriving connections from node position. Custom and unknown gear use useful generic glyphs. |
| SX2:C02 | Support add, connect, reconnect, insert into a chosen cable/run, inspect, swap and remove through visible controls and the shared command service. A connection preview names From, To, ports and cable; incompatibility and unknown compatibility differ. Cancel or rejection leaves the graph unchanged. |
| SX2:C03 | Provide pan/zoom/fit/reset, snap/alignment guides, multi-select, align/distribute, groups, annotations and explicit auto-arrange. Node movement, grouping, resizing and connector waypoints change only layout. One completed gesture is one undo step; auto-arrange previews or can be undone. |
| SX2:C04 | Connectors have readable labels, generous hit areas, intentional crossings and selected/alternate styles. Collapsed groups expose valid boundary ports rather than inventing bypass cables. A port's orientation must not imply a signal direction that the record does not declare. |
| SX2:C05 | Editing revision, pending changes, Using in ProPulse, and published presentation are distinct visible states. Selecting, opening, moving or presenting a setup never activates it or issues hardware commands. Switching views retains selection/viewport where useful and never silently discards edits. |
| SX2:C06 | Provide full Connections-list and click/tap alternatives to drag operations, including connect/reconnect, move, group membership and undo/redo. Keyboard users can perform the same task; focus follows a stable item after changes or returns to the initiating control after cancellation. |
| SX2:C07 | Preserve existing metadata, photos, all equipment categories, inline components, warnings, band/loss/power detail, multiple paths, duplication, ground/documentation layers, experiments and downstream consumers. A parity checklist and representative fixtures must pass before replacing the old canvas. |

## Station presentation

| ID | Requirement and acceptance evidence |
| --- | --- |
| SX2:P01 | Offer Edit / Present / Photos views of a setup. Present removes authoring chrome and arranges the recorded topology for reading; owner reference mode works without publishing. Editor and presentation layouts are separate records referencing the same setup/revision. |
| SX2:P02 | Present a named featured route first, with a clear entry-to-antenna reading order, port/cable labels and optional alternate branches. Clicking a node gives readable equipment detail and photos; a route selector changes the viewed route only. Missing/unsupported connections remain explicit rather than being visually repaired. |
| SX2:P03 | Owner-only presentation and audience-correct published presentation share a renderer but consume different projections. Publication pins a selected revision, route, captions, chosen media and layout. Draft edits do not change the published page; show when a newer private revision exists to the owner only. |
| SX2:P04 | Add a setup photo gallery, captions, optional equipment hotspots and a short story explaining purpose/constraints. A hotspot points to a stable setup item; missing or hidden targets degrade to a caption. Gallery covers and diagram thumbnails are not personal-profile banner photos unless explicitly chosen. |
| SX2:P05 | Support desktop, mobile, fullscreen reference and sanitized image/PDF export through existing W19 work. Include legend and readable labels; redact private/hidden material before layout/export. Hiding a component must not create an apparent direct connection across it. Export/public views exclude private notes, serials and exact location by default. |

## Shared media foundation

| ID | Requirement and acceptance evidence |
| --- | --- |
| SX2:M01 | Model an owned media asset separately from its use as avatar, banner, album item, setup photo, gear photo or listing photo. Each attachment has its own order, caption, crop/focal point and audience. Reusing a photo does not copy unrelated album content or metadata into the destination. |
| SX2:M02 | Provide multi-file selection, validation, upload progress, retry/cancel, thumbnail/large renditions and recoverable draft state. Proposed initial limits are configurable: 20 MB per image, 50 images per album, 12 per listing. Validate decoded format/dimensions and pixel budget server-side; do not rely only on file extensions. JPEG/PNG/WebP are initial targets; unsupported formats get a useful explanation. |
| SX2:M03 | Preserve existing equipment photo IDs/order and optional galleries through a migration/compatibility layer. Capture provenance and ownership without copying private purchase data. Inventory photos must keep working during migration; fallback and rollback need evidence. |
| SX2:M04 | Personal/album originals default private. Public and friend views are authorized through attachment projections and storage access, including thumbnails, full-size images, exports and direct URL requests. UI filtering alone is insufficient. Validate owner/friend/visitor and revoked-access cases through API and storage tests. |
| SX2:M05 | Show all public uses of an asset before reuse/removal. Unpublishing an album revokes that attachment, not an independently published listing attachment. Global removal reviews affected references; new requests stop granting access, bounded URL/cache expiry is tested, and removed images show intentional placeholders. Do not promise recall of downloaded copies. |
| SX2:M06 | Strip embedded location metadata from shared renditions, preserve original only for its owner when retained, and allow alt text plus captions. Coarse displayed location is chosen separately. Renditions honor EXIF orientation before stripping metadata; portrait/landscape crops remain editable independently. |
| SX2:M07 | Concurrent edits, interrupted uploads, duplicate retries and orphan cleanup are safe and idempotent. Publication never points at unfinished uploads. Quotas, rendition jobs, cleanup and access audit events have operational visibility; an upload failure does not erase the user's description or selection. |
| SX2:M08 | Accept a pasted image URL as an alternative to uploading. Preview and explicitly import a permitted image into the owner's media library, retaining source metadata privately by default. Provide a separate owner-reviewed public credit field when a permitted image requires attribution; never expose private source URLs or access tokens as credit. The saved showcase uses a managed rendition, not a tracking/breakable third-party hotlink. Server-side import permits HTTPS image fetches only, rejects credentials/private or reserved network destinations, revalidates redirects/DNS, enforces time/byte/decoded-pixel limits, and gives useful inaccessible/expired/non-image errors. Test redirect loops, changing DNS, unsupported formats and a source disappearing after successful import. |
| SX2:M09 | Every gear category exposes a visible Add photos action in empty state and Manage photos on populated items, accessible from inventory and create/edit/detail flows. A centered photo manager offers Upload images and Paste image link, preview/import, multiple photos, cover choice, order, captions/alt text, crop and removal. Saving an item without photos remains valid; cancelling photo work does not discard other unsaved gear fields. Chosen images appear in owner gear detail and only explicitly selected setup/profile/listing showcases. Verify all categories, mobile, keyboard, failures and existing image-ID migration. |

## Profile, personal photos and viewer

| ID | Requirement and acceptance evidence |
| --- | --- |
| SX2:F01 | Support an independent profile banner and avatar, cover crop/focal point, replace/remove/reset, and desktop/mobile preview. Essential identity text sits on a controlled readable surface rather than depending on photo contrast. Changing a crop is non-destructive and must not change another attachment's crop. |
| SX2:F02 | Personal albums have a name, optional story, ordered photos, cover and private/friends/public audience where supported by the real projection contract. Profile Photos and My shack remain distinct; private albums are absent from visitor metadata and counters. Empty profiles and modest stations receive a useful first-class layout. |
| SX2:F03 | A thumbnail opens a large accessible viewer: Previous/Next, Close, position/total, captions, optional zoom/pan/reset and thumbnails. Keyboard arrows/Escape work without interfering with text inputs; focus is contained and restored. Swipe has button alternatives. No autoplay by default, reduced motion is respected, mobile zoom remains available, and a broken image has retry/skip behavior. |

## Sell an owned item

| ID | Requirement and acceptance evidence |
| --- | --- |
| SX2:S01 | “Sell this gear” starts from one owned inventory item of any supported category, including homebrew gear. It creates a private listing draft with an owner-authorized source link. Server-side ownership checks prevent listing someone else's item. One live listing per physical item is the proposed initial rule; kits/multiple quantities need a later explicit model. |
| SX2:S02 | Listing fields include title, category, description/write-up, condition, known faults, included items, selected photos/order/cover, asking-price amount and currency or Contact for price, negotiation preference, pickup/shipping options, coarse region and contact preference. Required fields and unknown values are explicit. Prices are seller statements, not ProPulse valuations. |
| SX2:S03 | Use an allowlisted published snapshot; never serialize the inventory object wholesale. Purchase price/place, serials, receipts, private notes, precise coordinates and private filenames are excluded by default. Changes to private inventory do not silently rewrite published claims; relevant differences can prompt an owner-reviewed refresh. |
| SX2:S04 | Draft → Published → Reserved / Sold / Withdrawn / Expired, with reviewed republish/relist paths. Save draft is distinct from Publish. Editing a published listing creates a previewable revision; failed publication leaves the prior version intact. Reopening an expired listing revalidates availability and terms. |
| SX2:S05 | Marking gear for sale does not change active operation or any setup. Marking sold updates listing availability, then offers a separate impact-reviewed inventory lifecycle action. Historical setups retain their references/snapshots; current setups using unavailable gear display a useful notice rather than silently removing/reconnecting nodes. |
| SX2:S06 | Listing publication explicitly selects public photos and acknowledges the public preview. Removing source gear or a referenced image follows an impact flow: withdraw, retain a permitted public snapshot or replace media. Never leave a discoverable listing with a broken ownership link or stale availability; lifecycle and publication writes are transactional/idempotent. |

## Shared directory and contact

| ID | Requirement and acceptance evidence |
| --- | --- |
| SX2:D01 | Provide a master Gear for sale directory, seller-profile listing section and individual listing URLs, all backed by the same published projection. Only eligible Published listings appear as available by default; reserved/sold/expired states are unmistakable and excluded from available-only searches. Private inventory and drafts are never indexable. |
| SX2:D02 | Search title/model/write-up and filter by category, condition, price/currency, coarse region and pickup/shipping; sort by newest or price within a currency. Pagination and URL-backed filters survive Back/reload. Unknown price is separate from zero; do not silently compare different currencies or infer exact seller distance. |
| SX2:D03 | Listing detail offers large gallery/viewer, complete description, known faults, inclusions, terms, seller profile, last-updated/availability and an honest link to the seller's shared shack if permitted. A badge on owner gear opens its own listing; a public badge appears only where that item is independently shared. |
| SX2:D04 | Proposed initial contact is an authenticated inquiry relay bound to a listing, with send confirmation, owner reply route, retry/duplicate-send handling, blocking/reporting and rate limits. Seller email/phone are not disclosed by default. Delivery failure is visible. No checkout, escrow or implied buyer protection is presented. No messages are sent by this design task. |
| SX2:D05 | Owners can withdraw/mark sold promptly; proposed 60-day expiry needs renewal. Reporting, moderation hide/restore with reason, appeal/contact route, abuse limits and stale-search/cache invalidation exist before public discovery launches. Define product listing eligibility and prohibited-content handling before launch without pretending this proposal is a legal policy. |

## Quality and delivery gates

| ID | Requirement and acceptance evidence |
| --- | --- |
| SX2:Q01 | Every new surface follows shipped semantic station tokens, real header, four themes, comfortable touch targets, 16/18/20 px text preferences, non-color state cues and reduced motion. Verify contrast on real composed nodes/forms/viewers, not just palettes or generated images. |
| SX2:Q02 | Check 320 px layouts, 200% browser/text scaling, increased text spacing, keyboard-only and non-drag pointer tasks, screen-reader dialog/list behavior and consenting operators' actual displays/lenses. Generated people and agent critiques are not participant research. |
| SX2:Q03 | Keep the editor library lazy-loaded out of profile/directory routes; record incremental JS/CSS/rendition request budgets without silently increasing existing limits. Test representative setups and the existing 100-node/200-edge stress fixture; virtualize/paginate media and listings where measurements justify it. |
| SX2:Q04 | Verify tenant isolation, audience transitions, public URLs, publication/index consistency, stale revisions, interrupted upload/save, removed gear/media, stale listings and rollback using fixtures. No production migration or data mutation is implied by these planning artifacts. |
| SX2:Q05 | Each issue names an implementation owner, dependencies, scope, requirement IDs, tests and delivery evidence. Keep existing issues open until their full criteria pass; maintain a feature-preservation comparison. A mockup, merged PR or green unit suite alone is not release completion. |
