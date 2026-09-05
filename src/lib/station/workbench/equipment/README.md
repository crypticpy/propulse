# Equipment contracts and pure services

W02 / [#175](https://github.com/crypticpy/propulse/issues/175) extends the W01 archive with the equipment fields and private records needed by the Station Workbench. This module has no store subscriptions, persistence, cloud requests, hardware commands or application route imports. W04 owns durable migration and recovery; W10 integrates the inventory interface using the approved `station-ui` library.

| Entry point | Responsibility |
| --- | --- |
| `parseEquipmentFields`, `validateEquipmentFields` | Validate explicit typed field edits against the registry. Evidence references are checked by the archive parser. |
| `createEquipment`, `updateEquipment`, `retireEquipment` | Prepare one detached, validated instance against an existing archive. Return the proposed item; the caller still owns the eventual persistence transaction. |
| `instantiateModelPorts` | Map every template port/path to an explicit stable instance ID; validate structural and rating shapes. The archive validates referenced evidence. |
| `resolveCatalogReceiver` | Resolve factory/tested preference as a whole group, with explicit unavailable/fallback results and original evidence. |
| `findEquipmentUsage` | Enumerate owner-only draft, revision, experiment, operating and publication references. |
| `mapLegacyEquipment`, `mapLegacyRadioModel` | Produce typed proposals, evidence, original source envelopes and path-specific diagnostics; return quarantine for an unusable identity or retirement record. |

## Values and sources

The field registry defines each supported key's equipment kind, value shape, canonical unit and bounds. Missing information is an explicit unknown, distinct from a recorded zero, false or empty collection. Explicit edits reject unknown keys and invalid units. Legacy import retains unrecognized source fields in its private recovery envelope rather than silently discarding them.

Catalog specifications and physical-instance facts remain separate. Factory and independent-test receiver groups are retained independently; choosing a source selects a group with an explicit fallback, without filling gaps from another group. A source report is attribution for a claim, not a measurement of this particular physical radio. Incomplete legacy test context stays incomplete.

`resolveCatalogReceiver` returns selected field evidence and a separate `modelCitations` bibliography. The bibliography can overlap field evidence; an unclassified citation is not presented as proof of a selected metric.

A receiver group is available when at least one metric is known. An entirely unknown tested group falls back to available factory values; a partially known tested group retains its missing metrics as unknown. Original legacy citations without an explicit classification remain unclassified reports instead of being guessed from a URL or name.

A physical measurement must carry its own reading, canonical unit, subject, date, method/source and relevant frequency context. A scalar reading cannot substantiate a categorical field, entire per-band map or range. Experiment assumptions remain outside the evidence collection. A generic edit cannot promote hypothetical SWR into a measured reading.

## Identity, privacy and preservation

Creating an instance requires caller-supplied identity and time. Port templates receive explicit stable instance-port IDs. Renaming, reordering or retiring equipment does not change those identities or mutate catalog records, another instance or a pinned setup revision. “Used in” is an owner-scoped inventory reference view; it does not itself authorize deletion or change any setup.

`updateEquipment` merges supplied values and preserves omitted values. Its explicit `clearPrivateMetadata` list removes optional metadata such as a cover-photo reference; a key cannot be set and cleared in the same request. Required image/receipt arrays can be replaced with empty arrays. Clearing a reference does not delete a media blob or alter pinned history.

Private records retain purchase details, serials, receipts, condition, firmware, maintenance/manual notes and media roles. A primary image, ordered gallery, stored image ID and legacy photo URL are different records. The public profile output remains a separate allowlisted type; these owner records are not a publication payload. Server audience and media enforcement still belongs to W05.

Legacy adapters are proposals for W04's staged migration. They accept explicit source context and preserve the original JSON payload. They do not generate replacement identities, invent connector genders or switch wiring, run account migrations, upload media or switch the active station reader. Invalid identities and values produce diagnostics or quarantine results. The amplifier duty-cycle ambiguity is tracked as CR10 in the [preservation register](../../../../../docs/designs/profile-shack-workbench/FEATURE-PRESERVATION.md).

## Verification and remaining gates

Run `npx vitest run src/lib/station/workbench` for field/evidence validation, immutable service behavior and legacy round-trip checks; run `npm run lint` and `npm run build` for application integration checks. Passing these tests does not establish persisted migration, cross-device sync, visitor authorization, electrical compatibility or hardware state.

FP01–FP09 have contract and adapter responsibilities in this package. Their full preservation rows remain Pending until persistence, UI and downstream consumer verification are also complete. The new editor, publication composer and existing operating consumers continue through their separate dependency-tracked issues.
