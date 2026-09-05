# Station Workbench executable contracts

W01 / #174 establishes proposed boundaries and executable fixtures. Nothing here is imported by the running app. These contracts do not implement W02–W22, storage, migration cutover, a graph editor, electrical analysis, access control or hardware commands. The accepted [domain decisions](../../../../docs/designs/profile-shack-workbench/DOMAIN-DECISIONS.md) and [preservation register](../../../../docs/designs/profile-shack-workbench/FEATURE-PRESERVATION.md) govern subsequent implementation.

`contracts.ts` exports strict Zod shapes and `workbenchArchiveSchema`, which checks aggregate references and ownership. Individual shape schemas do not validate references outside their own record. `parseWorkbenchArchive` validates, copies and recursively freezes an archive; revisions pin equipment, catalog model specifications, evidence and resolved location values independently from live inventory. Runtime immutability requires this parser; calling a shape schema alone does not freeze a value. Storage must enforce immutable revision IDs and transactional version checks in W03/W04.

Stable instance/port/connection IDs define topology. Layout records contain positions/groups/viewport only and reference a particular revision. Diagram and rack layouts can coexist. Setup draft selection, experiment candidates, operating selection and private publication source references each name their own revision. Changing a draft or an inventory input cannot replace those snapshots by object aliasing. The archive rejects dangling references, duplicate identities, cyclic revision ancestry and mixed account ownership; server authorization remains W05 work.

Connections have RF, power, audio, control, bonding or unknown signal types. Physical cable references are optional but, when present, must refer to a cable snapshot. Inline devices have their own ports and internal paths. RF route hops explicitly orient each connection and internal path, including a switch's intended pair. A route must be continuous; non-RF hops cannot enter it. An exclusive switch conflict or unmodeled branch can remain documented with a reason, but cannot be marked a candidate or selected for operation. `candidate` means structurally eligible for downstream review, **not** an engine-supported result, verified compatibility, permitted transmission or actual hardware state. W07/W08 must evaluate ratings, direction, connectors, complete source/load routes, operating inputs and engine limits before use. Unknown connectors remain unknown.

Quantities explicitly distinguish unknown from a known zero. Frequency, requested power and cable length enforce canonical Hz/W/m fields. Measurement evidence owns its value/unit, date, source, method and stable port/equipment point. A fact citing a measurement must match that immutable reading. SWR, gain, loss and RF power require RF frequency context and their canonical units; a non-RF measurement can record an explicit not-applicable reason, rather than invent a frequency. Experiment assumptions are a different shape and cannot carry a measured discriminator. General specification keys remain extensible; W02 defines the full dimension/range registry from existing equipment fields.

`publishedProfileSchema` is a deliberately small **output example**, with strict allowlisted fields. It rejects accidental spreads of private inventory, location and raw import data. `publicationSourceSchema` retains owner/setup/reviewed-revision/audience/version lineage privately. Neither authorizes a visitor, resolves friendship, verifies media grants nor proves that user-authored free text is suitable to publish. W05 implements those boundaries. Its sample module kinds are not the complete profile contract: W15/W16 must preserve and represent every existing biography, callsign/license, contact/social, award, rank, activity, net, statistics, media and visibility capability recorded in FP23–FP40 before cutover.

`legacy.ts` demonstrates a radio mapping, with a compile-time ledger covering every current `UserRadio` field. Every persisted JSON field, including unknown nested fields, is retained in a private `legacy` envelope. Media references and notes remain private; a legacy power limit becomes a declaration, never an invented measurement. The example does not infer ports/connectors or run an account migration. Non-JSON values are rejected. Equipment, setup and location records can retain their original payloads. Location kind, timezone, activation reference and creation date also have explicit pinned fields. Invalid/dangling source graphs belong in raw backup/quarantine envelopes, not valid topology; `captureLegacyRecord` demonstrates preserving those payloads independently of graph validation. W04 owns the full staged transform, source-ID mapping, diagnostics, media retention, recovery and parity comparison.

## Representative synthetic fixtures

`fixtures.ts` exports factories returning fresh independent data; none is installed into user storage.

| Factory | Boundary exercised |
|---|---|
| `createHfFixture` | Partial/custom radio and antenna, optional catalog model, private media, RF cable, pinned inputs |
| `createPortableSharedFixture` | One physical radio across home/portable setups, separate location and power, POTA metadata |
| `createReceiveOnlyFixture` | Explicit receive direction and known zero transmit power |
| `createSwitchedFixture` | Actual common/throw ports, intended selected internal switch pair, alternative antenna retained |
| `createInlineAndLayersFixture` | Inline device insertion plus power/audio/control/bonding documentation and an unwired accessory |
| `createUnknownLegacyFixture` | Unknown power/gain/connectors, custom legacy model and exact private raw payload |
| `createUnsupportedBranchFixture` | Unsupported fanout retained as documentation and withheld from operation |
| `createExperimentFixture` | Isolated candidate and assumptions while operation remains pinned to its baseline |

Run `npx vitest run src/lib/station/workbench/contracts.test.ts` for adversarial reference, route, provenance, privacy-shape, preservation and isolation tests. Run `npm run lint` and `npm run build` for integration checks. Schema success is contract evidence only; downstream service, migration, real-operator and deployed cutover evidence remains required.
