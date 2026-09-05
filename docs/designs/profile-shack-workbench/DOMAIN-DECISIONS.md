# Station Workbench domain and delivery decisions

Accepted implementation direction for W01 / #174, 5 September 2026. Baseline: `1b61f7ff`. This defines the contracts for subsequent work; it does not enable a new database, replace the current editor, or certify the later release gates.

The owner approved carrying the published [station-ui library](../station-ui/README.md) and [visual-comfort requirements](../station-ui/VISUAL-COMFORT.md) through the remaining refactor, preserving current features. The coordinator owns integration and evidence; agents take bounded file scopes. [Feature preservation](FEATURE-PRESERVATION.md) is a required companion to S01–S17, not an optional cleanup list. The [editor decision](EDITOR-ARCHITECTURE.md) establishes the renderer boundary.

## 1. Ownership and identity

A catalog model describes equipment; a physical instance represents one particular item, including custom, borrowed, planned and retired gear. Two identical radios have different instance IDs. Catalog edits do not silently overwrite an instance's declared specifications or any pinned revision. A model match is optional. Manufacturer, measured, declared, estimated and unknown evidence remain distinct.

The authenticated account owns its equipment, setup identities, drafts, revisions, experiments, locations, private media references and publication choices. Shared gear means one owner's instance referenced in several setups; it does not introduce multi-account editing or club ACLs implicitly. A club station can be documented by its owning account. Multi-account collaboration requires a separately reviewed access contract.

Use stable opaque IDs generated once, never equipment names, array positions or DOM IDs. Ports are first-class instance endpoints with stable IDs and domain/connector declarations; renaming or moving a port does not reconnect it. Migration keeps original entity IDs where namespaces permit and persists a deterministic source-kind/source-ID mapping otherwise. Re-running an import reuses that mapping. IDs are scoped to the account at storage and API boundaries even if globally random.

A setup identity owns its name and revision history. A draft owns mutable equipment membership, port connections, intended routes and operating assumptions. A committed revision pins the topology and resolved equipment, model/evidence and location inputs used for review. Updating any live source record creates reviewable divergence, not a mutation of that revision. A layout is a separate canvas or rack/bench view over stable member IDs. Coordinates, viewport, focus and editor selection never define electrical connectivity.

A cable run identifies the particular cable and ordered inline items on that connection. Non-RF accessories remain setup members even without documented edges. RF, power, audio, control/data and bonding edges are explicitly typed. Unsupported documentation may be saved; no successful schema parse establishes installation safety or calculation support.

Historical revision references cannot be physically deleted while operating selections, experiments, published revisions or logs need them. Retirement and removal from a draft are ordinary separate operations. Hard deletion requires an impact result enumerating references and explicit resolution; media cleanup also observes retained revision and publication references.

## 2. Draft, use and telemetry transitions

| Action | Draft / inventory result | Operating / historical result |
|---|---|---|
| Open, select, inspect or switch editor tab | Change local editor selection only | Unchanged |
| Add, connect, reconnect, remove, reorder, move or auto-layout | One reversible command; moving only changes layout | Unchanged |
| Save draft or duplicate setup | Persist draft / create new setup identity | Unchanged |
| Edit the currently used setup | New draft marked **Changes not yet in use** | Continues using pinned reviewed revision |
| Save shared gear or measurement | New inventory/evidence version; enumerate affected drafts and revisions for review | Existing revisions and QSO stamps remain unchanged |
| Use in ProPulse | Validate selected route and inputs; show location, power, missing inputs and impacted app contexts | Atomically select a reviewed revision and route; preserve previous selection for recovery |
| Change selection while offline | Persist explicit local selection and sync intent with expected prior head | Never discard a newer remote selection on reconnect; resolve conflict visibly |
| Preview experiment | Apply assumptions to isolated candidate | No inventory, measurement, use or log mutation |
| Save experiment as new setup | Create new draft identity from reviewed candidate | No automatic use |
| Apply selected experiment changes to shared inventory | Preview affected setups and exact fields, then explicit transaction | Marks affected configurations for review; does not rewrite their pins |
| Remove setup or retire equipment | Reference impact and explicit choice; retained history remains accessible | Cannot silently clear or substitute an in-use revision |
| New QSO | Snapshot reviewed station inputs plus explicit logging overrides | Later inventory, setup or location edits never rewrite the stamp |
| Live frequency, power or rotor telemetry | Separate hardware source with observation time and freshness | Does not modify the reviewed setup; any live value used in a QSO is recorded with its source |

Use in ProPulse selects software operating context. It does not claim physical power, switch movement, cable changes or hardware control. Existing explicit radio/rotor actions keep their separate workflows. Activation/kit suggestions remain suggestions until the relevant existing action explicitly chooses them; merely viewing an activation must not silently activate a setup.

The initial scope has one primary operating selection per account and a durable local pending selection when offline. Editor selection is per local session. Account synchronization of the operating selection is explicit and revision-checked. Do not infer a separate multi-station/session operating model from device IDs.

Migration and W08 introduce a compatibility adapter for every current consumer listed in FEATURE-PRESERVATION.md. It must preserve existing precedence (active chain, applicable preset fallback, active-radio fallback) until the owner reviews an explicit correction. `mapStore.activePresetId` is a camera-view preset and must not be migrated as station selection. HamClock consumers are audited but changes to their presentation belong to Claude; coordinate adapter adoption through shared contracts.

## 3. Quantities and evidence

Canonical quantities use explicit units: Hz for frequency, W for power, m for length/height, dB for loss, dBi for gain, degrees for angle, ohm for impedance, V/A for supply, and dimensionless ratio for SWR. Conversion occurs at the legacy adapter and display boundary, not repeatedly in stored values. Preserve the original numeric value/unit in import provenance. A feet-based input round-trip must not accumulate rounding. Engine MHz/kHz interfaces receive explicit conversions.

Unknown uses an explicit unknown record/reason; it is never a fabricated zero, 1:1 SWR, generic 100 W, PL-259 connector or confirmed compatibility. Zero may be valid for a known loss/gain/height and must survive. Non-finite values and wrong units are invalid. Physical quantity validation is separate from schema/reference validation and calculation support. A receive-only setup may omit transmit power; it cannot claim transmit capability from missing data.

Measurements require value/unit, observed time, frequency where relevant, a stable measurement point, method/source and ownership. Owner-entered legacy SWR without provenance remains a legacy declaration needing context, not an invented instrument reading. An experiment's hypothetical SWR is an assumption. Recording a real measurement is a dedicated operation; a generic Apply action cannot change provenance to measured.

Validation results distinguish:

- Invalid document/reference: reject persistence of the proposed transaction and retain the previous state.
- Incomplete documentation / unknown compatibility: save the draft, expose the missing input and withhold dependent results.
- Unsupported graph or route: retain the drawing and explain why the existing engine cannot evaluate it.
- Conflicting selected switch paths: reject use/promotion of that intended route, without discarding other saved branches.
- Supported estimate: show the selected route, band/power, input evidence, assumptions and warning codes beside the result.

The existing station engine remains the calculation authority. W07 compiles one explicit selected RF route into it and reports unsupported cases. A valid contract fixture is not an engineering certification or proof that the route can be evaluated. No new propagation model is introduced by this refactor.

## 4. Durable storage and sync policy

W04 uses a versioned IndexedDB repository for inventory versions, setup heads, immutable revisions, layouts, experiments, migration records and an outbox. Zustand exposes projections/actions; React components do not write database records directly. Images remain blobs in the image repository with explicit owner and reference records. Small preferences can keep their existing store until W15 provides their migration. A successful Save means the local transaction committed, with cloud state reported separately.

Use one local transaction for a command's data changes, history entry and sync outbox item. Every mutation has a stable operation ID, account ID, expected prior head/version and payload schema version. Retry with the same operation ID is idempotent. The server verifies ownership and applies expected-head comparison transactionally; a client-provided owner ID is not authorization. Immutable revision inserts may coexist, but changing a mutable head uses compare-and-swap. Timestamps are audit information, not a conflict resolution algorithm.

Conflict policy:

1. Acknowledged local operations are removed only by their own operation ID/version; an older acknowledgment cannot clear a newer edit.
2. Nonconflicting new immutable revisions can be retained together. Concurrent edits to the same head become named recoverable alternatives with an explicit choice; neither branch disappears.
3. Concurrent inventory, route, layout, profile audience or operating-selection changes do not use silent last-write-wins. Fetch both bases, show the relevant difference and require an explicit resolution transaction. Layout-only conflicts may offer Keep this layout / Use other layout without changing topology.
4. Explicit deletion uses tombstones and reference checks. A missing row in a partial pull is not a deletion. Replaying an older update cannot resurrect a tombstoned entity.
5. Offline publication creates a pending request, not a claim of successful public visibility. Offline privacy tightening immediately hides locally cached content, but the UI must distinguish the pending server revocation. W05 verifies server, cache and media invalidation before reporting completion.
6. Sign-out/account switch isolates database/outbox/cache ownership. Do not replay another account's queue or mix visitor/friend cached projections. Corrupt or newer unsupported schema versions open recovery mode instead of overwriting the store.

Current `shackSync.ts` uses full-blob pushes across nine tables with `_snapshot` fields for several object types. It is not an implementation of this conflict policy. W04 adds new versioned persistence and server transactions; it must not simply register the new graph in the old full-blob writer. Legacy and new writers cannot both author the same station state. Unmigrated clients require a schema/capability gate at the new write boundary before cutover. Exact DDL/index sizing is implementation work in W04, not an unresolved product decision.

## 5. Migration and recovery strategy

No live users does not mean disposable owner/development data. Before conversion, capture an account-scoped versioned backup manifest of the original persisted shack/profile/location data, raw remote rows, media IDs/blob availability and active selection. Preserve the unmodified source payload and a digest in the migration record; never commit actual personal backups to GitHub. The backup is private and exportable locally.

Import from raw values before existing lossy fallback mappers. For example, `shackSync.rowToPreset` currently supplies 100 W and omits linked location/inline metadata from its signature; antenna and feedline fallbacks can synthesize height/connectors. Prefer intact local and `_snapshot` values, record their provenance and discrepancies, and mark genuinely absent inputs unknown. A cloud row that lacks a local field cannot erase the richer local value. Conflicting real values need a review item rather than an arbitrary source preference.

Migration stages are capture → transform into staging → validate → compare/report → commit new active schema pointer. Each is checkpointed and restartable with a stable migration ID and mapping. No cleanup of original stores/tables/media occurs during transform. One ordered legacy chain becomes one explicit path preserving node order, cable runs, inline order, non-signal accessories, notes, power and location association. Duplicate, missing or ambiguous endpoints remain in a private quarantine/recovery envelope with the original payload, source IDs and diagnostics. They are not admitted as dangling references to a valid topology. The repair UI builds a candidate from that envelope and retains the original until repaired validation passes; never invent branches or selected switch routes. Existing preset-to-chain identity relationships prevent double-importing one logical setup.

An existing valid selected setup can be pinned to its migrated resolved inputs after a parity comparison. If the selected source is ambiguous, incomplete or differs from reconstructed inputs, keep the legacy reader active for operating consumers and present a migration review; do not substitute a different station or empty selection. Logging during coexistence retains the exact source/version used. Historical logs stay as recorded, with optional legacy identity mapping for navigation only.

The cutover pointer is changed only after staged data, reference validation, media/reference counts, selected-context parity and recoverability pass. A crash before pointer change leaves the legacy reader intact; a crash after it resumes from the recorded committed generation. A rollback preserves all post-cutover data/outbox operations as an exportable recovery branch. Switching back to a legacy reader must never discard new records or pretend it can represent new graph features; prefer forward repair where down-conversion is lossy.

Required W04/W21 evidence includes interrupted migration at every stage, repeated import idempotence, malformed and unknown-version data, missing media, remote/local disagreement, two concurrent clients, offline edit/retry, account switch, delete/update races, active context preservation, post-cutover edit recovery and backup restore. Verify raw metadata parity using the preservation register, not just item counts.

## 6. Publication boundary

A published profile/setup is a deliberate projection of a reviewed revision, independent of the editing draft and the currently used setup. Audience is owner, friend or visitor; friend access requires authenticated relationship verification on the server. Preview uses the same projector and resolved audience rules as actual delivery. Public types use an allowlist and cannot contain the private inventory object, legacy payload, raw location, private image ID or arbitrary notes by accidental spread.

Exact location, serials, receipts, purchase/maintenance/manual details, private notes and detailed wiring remain private by default. Chosen grid precision, approved profile modules, equipment labels and sanitized diagram detail are explicit projection inputs. Export runs through the same boundary, including image metadata and monochrome labeling. An image's public derivative has its own reference; exposing a private blob URL is not sanitization.

Publication transaction records a new projection/version and its media grants. Deliver restricted friend/owner media through authenticated mediation that checks the current grant on every request; do not issue durable public URLs for private originals. Use no-store for restricted responses and versioned public derivatives with revalidated grants at the delivery boundary. Revocation invalidates future server responses, audience-specific application caches and media grants; report completion only after that server transaction succeeds. Already downloaded/copied bytes cannot be recalled. If implementation needs signed storage URLs, their bounded expiry and delayed-revocation behavior require a documented contract update before W05 can pass; do not describe a still-valid URL as revoked. W05 supplies RLS/API/media tests with actual owner/friend/visitor accounts and rejection cases. W01 schemas only demonstrate allowable shapes; they are not an access-control implementation. Existing `profileEquipmentCache.ts` treats equipment visibility other than private as publishable; W05 must verify/correct friend-vs-visitor delivery, rather than preserve that predicate as the new policy.

## 7. Requirement and implementation gates

| Requirements | W01 decision | Implementation / verification owner |
|---|---|---|
| S01, S05 | Pinned revisions; explicit use; isolated experiments and reviewed shared updates | W03/W04/W08/W09; QSO/consumer parity in W21 |
| S02, S03, S04, S10 | Commands independent of renderer; explicit insertion and complete non-drag forms; separate layout undo | W06/W11/W12/W13 and editor ADR |
| S06, S12, S16 | Allowlisted audience projection, media/cache revocation, chosen modules, same export boundary | W05/W15/W16/W19 |
| S07, S11 | Model/instance separation, partial/custom gear, one editor after guided start, metadata parity | W02/W10/W13 |
| S08, S09 | Stable endpoints, selected route, immutable snapshot and recovery mapping | W02/W03/W04/W07 |
| S13 | Measurement provenance distinct from assumptions; explicit units | W02/W09/W14 |
| S14 | Typed documentation preserved even when unsupported by RF engine | W02/W07/W18 |
| S15 | Named experiment and revision recall without mutating history | W03/W09/W17 |
| S17 | Rack/bench layout references the same topology and membership | W03/W06/W20 |

The W01 fixtures exercise the proposed boundaries; downstream packages implement persistence, commands, engine integration and UI. No downstream task is Done because its type appears in W01. Integration PRs must name the preservation rows they cover, reuse station-ui, keep the actual shared header and readable themes/text sizing, and provide relevant tests/evidence. The coordinator checks each agent's diff and bot feedback before merge.

An implementation discovering a contract conflict must open/link a blocking issue on the affected package and update this decision before integrating a workaround. Do not invent hidden defaults, broaden publication, drop features or waive W22's actual-operator study. W21 remains open until every S01–S17 requirement and preservation row is verified at the deployed revision, or the owner explicitly approves a documented scope change.
