# Selected RF route compiler (W07 / #180)

These pure functions adapt one explicit selected workbench route to the existing station calculation engine. They do not write storage, activate a station, publish a profile, contact hardware or copy `stationChainEngine` physics. W03 `candidate` status is structural documentation only; this package evaluates compatibility and engine support separately.

| Entry point | Responsibility |
| --- | --- |
| `compileSelectedRoute(archive, { revisionId, routeId, options })` | Walk oriented hops on pinned revision inputs, score connector/signal/role/rating compatibility, compile a supported ordered RF chain, or withhold with precise reasons. |
| Analysis fixtures | Synthetic stations for parity, switch, inline, unknown, contradicted, cycle, branch and isolation tests. |

## Inputs and honesty

Callers must name the revision and route. The compiler never selects the first radio, antenna or candidate route. It reads `revision.equipment` / `models` / `evidence`, not live inventory. Factory versus tested receiver groups follow the W02 whole-source rule against those pins and keep `modelCitations` as a bibliography, not proof of a selected metric.

Unknown is not zero. Known zero loss, zero transmit power and signed antenna gain are preserved. Cable-run `lengthMeters` is the only feedline length sent to the engine (`UserFeedline.lengthFeet` via 0.3048 m/ft). Inline pigtail lengths stay off that input. Unwired accessories remain members and are listed on `shackAccessoryIds` without entering RF nodes. Power, audio, control and bonding edges stay in `documentedLayers`.

Compatibility verdicts are `compatible`, `contradicted` or `unknown`. A contradicted or exclusive-switch conflict is not an engine-supported estimate and does not claim that hardware switched. Missing engine-required fields produce `incomplete` plus `integrationProposals` for the coordinator; this package does not invent 1.5 SWR, 100 W, PL-259, peak catalog gain or receiver zeros.

## Engine boundary

When topology and required inputs are known, results come from `computeStationChainPerformance` / `deriveStationFeatureEnvelope`. Gear capability, modeled route numbers, pinned measurements and caller path/time/conditions stay in separate collections. Envelope receiver evidence is omitted when the catalog group is unknown or partial.

Known engine limits reported rather than worked around:

- Band-center MHz instead of revision `frequencyHz`
- Default SWR 1.5 and antenna peak-gain fallback (withheld unless the pin has SWR/gain)
- Required `RadioEquipment.receiver` / `UserAntenna` enum fields
- Feedpoint ferrite loss and pigtail meters not applied by the engine
- Negative amplifier gain clamped by the engine

## Verification

Run `npx vitest run src/lib/station/workbench/analysis` plus `npm run lint` and `npm run build`. Passing tests do not complete W08 operating selection, W14 presentation or issue acceptance. Do not re-export this folder from the workbench root until the coordinator integrates it.
