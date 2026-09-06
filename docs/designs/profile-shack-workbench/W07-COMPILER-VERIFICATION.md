# W07 selected-route compiler verification

Issue: [#180](https://github.com/crypticpy/propulse/issues/180). Requirements: S06, S08, S09, S13, S14. Implementation: PR #241 and its coordinator review follow-up. This is a pure compiler delivery; W08 operating selection and W14 presentation remain separate dependencies.

## Acceptance evidence

| Criterion | Implementation and regression evidence |
| --- | --- |
| Explicit switch ports, selected route and exclusive conflicts | `analysis/compile.ts` walks the named revision/route and oriented hops. Tests select each switch throw and reject conflicting exclusive paths without claiming hardware moved. |
| Role, signal, connector and relevant ratings with three verdicts | Tests cover receive direction, RF/non-RF signals, direct versus explicitly bound cable ends, mismatched/unknown connectors, frequency bounds at the pinned frequency and actual engine band centers, and modeled stage power versus declared maxima. RF readings are not maxima. |
| Supported ordered routes; unsupported documentation retained | Simple, switch and inline fixtures retain numerical parity with the existing engine. Cycles, branches, unsupported selected devices, unknown interfaces and unrepresentable signed amplifier gain/nonzero ferrite loss withhold dependent estimates and return reasons. Non-RF layers and unwired accessories remain documented. Cable meters enter the feedline calculation once. |
| Metrics, units, evidence, missing inputs and assumptions separated | Tests preserve pinned catalog groups and bibliography, known zero and signed antenna gain, per-band metric labels and path conditions. Declared receiver evidence cannot become manufacturer attribution. Missing gain/SWR band values cannot become engine defaults. Pinned mode is honored; unknown modes withhold the dependent envelope. Invalid caller input and unsupported/nonfinite engine outputs cannot become known metrics. |

The regression suites are `src/lib/station/workbench/analysis/*.test.ts` and `connectorInterface.test.ts`. Run `npm test -- src/lib/station/workbench`, `npm run lint`, and `npm run build`. The delivery comment on #180 records the final merged commit, exact test counts, CI and deployment evidence.

## Deliberate engine boundaries

- Calculations use the canonical engine's band centers, reported separately from the pinned operating frequency; both are checked against recorded bounds.
- Nonzero feedpoint ferrite loss and negative amplifier gain are unsupported by that engine. The adapter withholds dependent estimates instead of implementing different physics.
- A combined feedline/inline engine stage cannot prove power at an individual cable termination. A maximum at that point remains unresolved.
- Ratings apply at each actual equipment/cable mating pair. Recorded inline band support is checked for every requested band, and a recorded inline power maximum remains unresolved without an isolated engine stage. Mixed near/far connector types withhold estimates because the current engine applies the near-end loss to every connector.
- Missing or incorrectly attributed receiver evidence withholds the path envelope while preserving the original evidence in gear capability.
- Structurally valid documentation is not a declaration of RF safety, real switching, propagation conditions or hardware activation.

These boundaries are returned as calculation limits/integration proposals. Extending engine coverage, persistence, UI cutover and live operator verification belong to the tracked downstream packages. Publication API/RLS/media/cache enforcement remains W05; its pure policy tests are not access-control deployment evidence.
