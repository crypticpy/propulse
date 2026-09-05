# Publication policy foundation (W05 slice)

This package is the pure allowlist projector for [W05 / #178](https://github.com/crypticpy/propulse/issues/178). It evaluates pinned publication source data against an explicit **server-resolved** access context. It is not a secured endpoint, does not read cookies or JWTs, and does not perform RLS, storage or cache I/O.

The caller must resolve verified account identity, current friendship, publication presence/version and current media grants before invoking `evaluatePublicationPolicy`. A client-provided audience or owner ID is not authorization. `PUBLICATION_POLICY_TRUST_BOUNDARY` records that contract.

## Entry points

| Export | Responsibility |
| --- | --- |
| `evaluatePublicationPolicy(source, access)` | Validate inputs, resolve owner/friend/visitor/signed-out, and construct the allowlisted `publishedProfileSchema` projection. |
| `publicationPolicySourceSchema` | Pinned composition, featured selection, section visibility, location disclosure, intended media IDs and private snapshots. |
| `publicationAccessContextSchema` | Strict server context. Extra client fields such as `claimedAudience` are rejected. |
| `PUBLICATION_POLICY_TRUST_BOUNDARY` | Documents that this function is a policy component, not access control by itself. |

Successful results include a private `lineage` object (`sourceId`, `setupId`, `revisionId`, `publicationVersion`) for the trusted caller. That lineage must not be serialized to visitors. Denials and the public `projection` omit working revision IDs, exact coordinates, serials, receipts, purchase details, private notes, wiring, recovery envelopes and raw inventory.

## Access rules

- Missing `sectionVisibility` keys are withheld, not treated as public.
- Featured setup summaries copy selected equipment **labels** only. Inventory objects cannot be spread into the public featured shape.
- Public location is the chosen disclosure grid truncated to field/square/extended precision. Hidden precision publishes no region. Private `pinnedLocation` coordinates, including valid `0,0`, are never copied and never converted into a grid by default.
- Media output lists **current** grant `derivativeId` values whose grant audience is allowed for the projected shape. Revoked/absent grants and private original URLs are omitted. The policy does not claim that an already issued URL has been revoked.
- Owner preview uses `ownerPreviewAs` only when `verifiedAccountId` matches the pinned publication owner. The projected fields follow the previewed audience, including denying a visitor preview of a friends-only publication.
- `pending`, `revoked` and `absent` friendship are visitor, not friend. Signed-out viewers use the visitor field allowlist and `audience: "visitor"` because the W01 output enum has no signed-out member.

## Covered modules versus future contract extensions

This slice projects the skeletal W01 output: `identity`, `station`, `activity`, `projects`, `qsl` and `interests` module kinds, featured labels, `regionLabel` and `publicMediaIds`.

| Existing profile capability | This package | Future contract |
| --- | --- | --- |
| Display name, biography, identity module | Covered | Keep |
| Featured reviewed-setup labels | Covered | Keep |
| Section visibility for equipment/activity/location | Covered as withhold/allow | W15 should add stats/awards/on-air/nets payloads |
| Chosen Maidenhead precision | Covered | Keep; do not add implicit coordinate derivation |
| Grant-mediated derivative IDs | Covered as IDs only | Server must mint/mediate URLs (DOMAIN-DECISIONS current-grant mediation) |
| FP23 routes, FP24–FP25 license/identity editing, FP27 social links, FP28 on-air, FP29–FP31 stats/awards/rank, FP32 follow UI, FP33 event payloads, FP34 nets, FP35 contact analysis, FP36 public shack cache, FP38 share-card pixels, FP40 QSL credentials | Not represented in the skeletal DTO | Propose additions on `publishedProfileSchema` / publication source rather than dropping the rows |

Proposed coordinator additions (not made here): `signed-out` on the output audience enum; explicit stats/awards/on-air/nets/license/contact modules; media grant records on `publicationSourceSchema`; section visibility and location disclosure on the shared publication source.

## Verification

Run `npx vitest run src/lib/station/workbench/publication`. These tests are not API, RLS, cache or media-revocation evidence. See [W05-ACCESS-VERIFICATION.md](../../../../../docs/designs/profile-shack-workbench/W05-ACCESS-VERIFICATION.md).
