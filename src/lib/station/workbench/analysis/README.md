# Selected RF route compiler (W07 / #180)

These pure functions adapt one explicit selected workbench route to the existing station calculation engine. They do not write storage, activate a station, publish a profile, contact hardware or copy `stationChainEngine` physics. W03 `candidate` status is structural documentation only; this package evaluates compatibility and engine support separately.

| Entry point | Responsibility |
| --- | --- |
| `compileSelectedRoute(archive, { revisionId, routeId, options })` | Walk oriented hops on pinned revision inputs, score connector/signal/role/rating compatibility, compile a supported ordered RF chain, or withhold with precise reasons. |
| Analysis fixtures | Synthetic stations for parity, switch, inline, unknown, contradicted, cycle, branch and isolation tests. |

## Inputs and honesty

Callers must name the revision and route. The compiler never selects the first radio, antenna or candidate route. It reads `revision.equipment` / `models` / `evidence`, not live inventory. Factory versus tested receiver groups follow the W02 whole-source rule against those pins and keep `modelCitations` as a bibliography, not proof of a selected metric.

Unknown is not zero. Known zero loss, zero transmit power and signed antenna gain are preserved. Cable-run `lengthMeters` is the only feedline length sent to the engine (`UserFeedline.lengthFeet` via 0.3048 m/ft). Inline pigtail lengths stay off that input. Unwired accessories remain members and are listed on `shackAccessoryIds` without entering RF nodes. Power, audio, control and bonding edges stay in `documentedLayers`.

Compatibility verdicts are `compatible`, `contradicted` or `unknown`. A contradicted or exclusive-switch conflict is not an engine-supported estimate and does not claim that hardware switched. Port power ratings are compared to modeled hop input/output from the engine, not the revision's requested power. Missing engine-required fields produce `incomplete` plus `integrationProposals` for the coordinator; this package does not invent 1.5 SWR, 100 W, PL-259, peak catalog gain or receiver zeros.

## Engine boundary

When topology and required inputs are known, results come from `computeStationChainPerformance` / `deriveStationFeatureEnvelope`. Gear capability, modeled route numbers, pinned measurements and caller path/time/conditions stay in separate collections. Envelope receiver evidence is withheld when the catalog group is unknown, partial, or lacks the report attribution that the engine would claim. Declared evidence remains available in pinned gear capability; it never becomes a manufacturer claim. Mode uses the explicit override or the pinned setting. Absent or unsupported pinned modes withhold the mode-dependent envelope; they never default to WSPR.

Known engine limits reported rather than worked around:

- Band-center MHz instead of revision `frequencyHz`
- Default SWR 1.5 and antenna peak-gain fallback (withheld unless the pin has SWR/gain)
- Required `RadioEquipment.receiver` / `UserAntenna` enum fields
- Nonzero feedpoint ferrite loss and negative amplifier gain (dependent numerical estimates withheld because the engine cannot preserve them)
- Pigtail meters not separately added to the base cable length

## Verification

Run `npx vitest run src/lib/station/workbench/analysis` plus `npm run lint` and `npm run build`. Passing tests do not complete W08 operating selection, W14 presentation or issue acceptance. Do not re-export this folder from the workbench root until the coordinator integrates it.

## Explicit interfaces and calculation gates

A run-associated connection needs a pinned `connectorInterface`: `direct` means the two equipment ports physically mate; `cable` binds `fromPortId`, `toPortId` and `internalPathId` on the run's base cable. Those IDs correspond to the connection's stored from/to orientation, and reverse route hops swap them. Missing bindings remain unknown. The compiler does not choose cable ends from labels, array order or connector gender. Cable ports/path must explicitly support RF, and their ratings are checked too. Engine stages that combine cable and inline losses cannot establish individual cable-port power; a recorded maximum at such a point remains unresolved.

Receive port directions follow the already oriented signal flow. Only `port.maxPower` establishes a power limit; `port.rfPower` remains a reading. Compatibility covers both the pinned operating frequency and every engine band-center frequency. Unsupported stages/bands and nonfinite output cannot produce known numerical metrics or power-rating passes. Gain/SWR maps resolve each requested band explicitly, using a recorded scalar only for missing keys; absent values withhold dependent results.

`analysis/request.ts` validates caller input without coercing unknown bands, modes, or nonfinite options into defaults. Band labels must exist in the engine table. Explicit mode labels are normalized to supported engine names. `compileSelectedRoute` returns an invalid result for invalid requests instead of throwing from an unchecked options object.

An absent canonical far-end field preserves the engine's single connector-type input. W02 legacy import intentionally represents an unrecorded far end as an explicit unknown; that imported value remains incomplete until reviewed. The compiler does not inspect old raw payloads or erase an unknown to recover a default. This distinction preserves the approved migration rule that missing source information remains unknown.

Impedance checks follow the actual equipment-to-cable mating interfaces as well as cable continuity; cable-separated equipment jacks are not compared as a direct joint. Matching known near/far connector types preserve the engine's existing connector-loss calculation. Different recorded end types withhold estimates until the engine supports both ends; an explicitly unknown far end stays unknown, while an absent legacy far-end field remains compatible with the existing near-end representation.

Recorded inline band support is checked against every requested band. Explicitly unknown support withholds dependent estimates. Recorded inline maximum power requires an isolated component power stage, which the engine currently does not expose; the compiler reports that unresolved limit instead of comparing it with requested power or the combined run output. Optional constraints absent from legacy records are not fabricated.

Both bound physical cable ends must normalize to the same connector type used by the engine's uniform connector-loss input. Normalization accepts only explicit family aliases (for example N-type/N and PL-259/SO-239); reverse-polarity SMA remains distinct from SMA, and labels never supply missing gender. Custom families without an engine mapping leave loss unresolved. This does not override the legacy-imported unknown far-end rule above.

An emitted inline component must match the cable run's exact internal path ID and effective orientation. Run storage direction and receive-route direction are handled explicitly; reversing storage order does not change the physical path or substitute another exclusive path with the same endpoints. Engine inline ordering follows the emitted route.

A mode-dependent envelope additionally requires the effective mode to be explicitly supported by the pinned radio's mode list. An absent/unknown list or an unsupported mode withholds that envelope; mode-independent engine power/loss metrics remain available. Neither generic DATA capability nor a receive route supplies an unrecorded mode capability.

A cable assembly is emitted only when the selected route contains its complete ordered connection/internal-hop sequence contiguously in the effective traversal direction. Selecting one segment or exiting through an alternate inline path cannot pull the unused assembly's length or component losses into the model. Reverse-stored runs and receive routes pass the same complete-coverage check.

Recorded accessory band constraints apply to every selected RF category, including switches and tuners. An explicitly unknown list remains unresolved, and an empty known list supports no requested band; absent optional legacy lists do not create constraints. Passive accessory maximum power is checked against the canonical engine's modeled input at that device, including upstream amplification. An unknown recorded maximum stays unresolved. Amplifier maximum power retains its distinct engine-enforced output-cap meaning.

A recorded filter passband must include both the pinned operating frequency and every engine evaluation frequency. Explicitly unknown passbands stay unresolved. Recorded tuner matching ranges and SWR-dependent loss maps cannot be verified by the current constant-loss engine, so dependent estimates are withheld with an integration proposal instead of dropping those constraints. Constant-loss tuners without those optional declarations retain existing supported behavior. DC supply capacity, warmup/duty-cycle behavior and non-RF accessory fields remain outside this RF path calculation; the compiler does not claim those checks passed.

Unsupported pinned band labels withhold engine estimates after assembling route context. Purpose, topology members, cable assemblies, documented layers, gear capability and pinned measurements remain reviewable; an explicit valid caller band still overrides the pin.

Canonical `radio.modes` permits explicitly recorded WSPR capability. The envelope checks that canonical list directly; SSB/DATA never imply WSPR support and unknown capability stays unknown. The existing engine's legacy radio mode array remains filtered to its narrower type because neither its power calculation nor its envelope reads that array; WSPR's explicit engine mode assumptions are selected through the validated mode option. No legacy display vocabulary changes are needed.

The recorded feedline connector count must cover each explicitly bound connector-bearing cable end, counted once per cable termination rather than once per side of the mating joint. Two physical connectors cannot compile with a count of zero or one. Known zero remains valid when both physical ends and the engine type explicitly record `none`; unknown ends remain unresolved. Larger recorded counts retain their uniform-type engine losses, while mixed or unmappable physical families still trigger the existing representation gates.
