# Open WX Globe reuse audit

Read-only inspection on 2026-09-07 of
`/Users/crypticpy/Projects/OpenWeather/openwxglobe`, HEAD
`17bb7a04e72b15c608f3b1ed99144f6fcd817247`. The root license is Apache-2.0.
No source was copied, no files were edited there, and no services were started.
This is preparation for the deferred weather batches, not a batch claim or a
statement that their prerequisites are merged.

## Reproduce the source audit

Source repository: [crypticpy/openwxglobe](https://github.com/crypticpy/openwxglobe).
Audited revision: [`17bb7a04e72b15c608f3b1ed99144f6fcd817247`](https://github.com/crypticpy/openwxglobe/commit/17bb7a04e72b15c608f3b1ed99144f6fcd817247).
The repository and commit were verified through GitHub on 2026-09-07. It is a
**private repository**: a contributor needs access granted by its owner before
cloning. The local path above is an inspection location, not a dependency.

From a directory chosen by the contributor, use a fresh checkout:

```sh
git clone https://github.com/crypticpy/openwxglobe.git openwxglobe-reuse-audit
cd openwxglobe-reuse-audit
git checkout --detach 17bb7a04e72b15c608f3b1ed99144f6fcd817247
git rev-parse HEAD
```

The final command must print the audited revision. All candidate paths below
are relative to that checkout and were verified in that commit's tree. Review
its [root license](https://github.com/crypticpy/openwxglobe/blob/17bb7a04e72b15c608f3b1ed99144f6fcd817247/LICENSE)
and applicable file/provider notices before adapting code. If access is missing,
record the source-access blocker; do not substitute current-main files or infer
compatibility from this summary. A later revision needs a refreshed audit.
No vendored source or new runtime dependency is introduced here.

| Candidate | Relevant work | Compatibility finding |
| --- | --- | --- |
| `apps/web/src/components/alerts/alertScope.ts` and its test | B11 alert area, B22 Alerts report | Small TypeScript utility: Polygon/MultiPolygon point containment, polygon holes, viewport overlap. Adapt types to ProPulse if reused. Route scope is bounding-box overlap, not exact route intersection; null geometry is excluded. County coverage needs an explicit geographic contract, and dateline/boundary cases need coverage before adoption. |
| `pipelines/src/pipelines/ingest/nws_alerts/` | B11/B22 alert normalization | Python pipeline separates client, normalization, manifest and storage. Useful contract reference; it is not a Vercel endpoint adapter. Keep the existing ProPulse NWS fetch path and port only a verified missing normalization rule. |
| `packages/layer-registry/schema/layer_manifest.schema.json` and `ts/layer_manifest.d.ts` | B13/B15 layer controls and provenance | Source attribution, units, derivation, safety classification, run/valid times and rendering metadata are explicit. The TypeScript file is generated from schema; do not hand-edit or import the full registry as a shortcut. Map only fields required by existing ProPulse layer contracts. |
| `apps/api/src/openwx_api/routers/weather_availability.py` | B14 animation/time controls | Distinguishes retained source runs, manifest-only current runs, missing availability and labeled synthetic fallbacks. Depends on FastAPI, the layer catalog and SamplingEngine. Reuse the time/provenance contract concept, not its backend or synthetic fallback as live ProPulse weather. |
| `docs/adr/ADR-003-official-alert-authority.md` | Weather and EmComm presentation | Keeps official alerts separate from derived/model hazards. Preserve that distinction when presenting NowCast alongside weather alerts. |

Current ProPulse `useWeatherAlerts` returns alerts/loading/error from a global
query. Its fetch adapter discards alerts lacking valid geometry and extracts
display polygons. Adding county/area scope therefore requires preserving source
coverage information; an empty mapped array cannot establish that no alerts
exist in the requested county. Open WX Globe's point/viewport utility alone does
not close that gap.

Before copying any utility, inspect its current revision, applicable notices and
provider attribution, adapt only the needed piece, and run ProPulse contract
tests. No claim of live provider availability or production compatibility follows
from this local source inspection. Globe renderer integration remains with the
existing 3D owner.
