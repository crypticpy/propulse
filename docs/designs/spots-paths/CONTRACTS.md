# Spots & Paths contracts v1 (SP-01)

Tracking and acceptance: [epic #510](https://github.com/crypticpy/propulse/issues/510),
[SP-01 #511](https://github.com/crypticpy/propulse/issues/511). GitHub holds the product
specification, assignments, blockers and progress; these files document shipped code.

## Public boundaries

`src/lib/views/contracts.ts` supplies strict Zod runtime schemas and inferred types;
`src/types/viewConfiguration.ts` provides type-only imports. `spotContracts.ts` and
`src/types/spotPresentation.ts` do the same for reports, grouping and paths. These
modules import no stores, React, transport, credentials or current clock.

`ViewConfiguration` is a complete snapshot, not a patch. All known values must be
present; unknown keys/versions are rejected. `createViewConfiguration(family)` is a
fresh fallback seed, not an active singleton, shipped preset, or migration policy.
Migration preserves validated old choices; it does not overwrite them with seeds.
Map families use `/map`; the `route` family supports the existing kiosk allowlist.
PropSphere normal/pro/lite and HamClock have separate working slots. Projection
changes stay within the current slot. Preview/display instances get separate IDs.

`WorkingViewPatch` replaces entire `spots`, `presentation` or `context` slices.
Arrays are replaced, never index-merged. A caller must read its own runtime snapshot,
construct its next slice and submit it. `ViewRuntime` methods have no account/global
fallback. `getSnapshot` must return an immutable stable snapshot until a successful
command changes it; listeners are synchronous and disposal removes subscriptions.
Implementations, not this package, provide those behaviors in SP-03.

`ViewRepository.saveView` and `publishDisplay` use expected revisions (0=create,
otherwise compare-and-swap). Save results distinguish saved, conflict, pending,
invalid, unavailable and forbidden. Owner IDs identify partitions, never confer
authorization: SP-02 must authenticate and authorize on the server. A conflict is
not last-writer-wins. Pending requires durable operation identity; it is not success.
Saving a library record never activates it in another instance.

Display assignments contain complete scene snapshots, source-view revision metadata,
rotation/break-in/header settings and a valid enabled starting scene. Source metadata
is informational; no live inheritance. Maximum 24 scenes, 64 KiB/config, 512 KiB/
assignment. Device bearer tokens never enter these records. Runtime scene position,
selected reports/target, expanded groups and animation queues are ephemeral.

HamClock widget payloads are bounded plain JSON with a tile ID and schema version.
The outer envelope is not widget validation: SP-02/SP-03 must resolve the registered
tile schema and validate each payload before applying it, rejecting unknown versions.
Do not use this envelope to smuggle runtime state, device credentials or arbitrary
other feature state. It rejects accessors, cycles, sparse arrays and non-JSON values.

## Reports, modes and geography

All frequencies are kHz, times epoch milliseconds, coordinates degrees, path-point
heights km. Pipeline time is an explicit input. IDs use a bounded URL/storage-safe
alphabet. SourceReportId retains raw source identity separately. SP-04 owns stable
normalized report IDs/deduplication, retaining distinct receivers and provenance.

Deduplication policy: canonical DX/reporter callsigns, exact observed timestamp,
frequency and canonical mode identify an observation when receiver identity is
known. Do not round time/frequency to manufacture duplicate matches. An unknown
reporter/posting service cannot establish cross-feed reception identity; retain
separate reports unless shared upstream identity proves a copy. Source-local IDs
alone are namespaced by source and cannot merge different observations. Preserve
all contributing `sourceRefs`; source filtering matches any contributing authorized
feed. Select primary source/data with a documented deterministic precedence, retaining
the most precise supported location without upgrading an approximate origin.
Stable report IDs must survive feed ordering, camera and budget changes; hash-based
IDs require collision handling/tests. Sort newest first, stable ID tie-break.

Shared query/cache identity includes actual upstream request parameters, source,
authorization/data scope and time window; it excludes the current map budget,
camera, grouping and presentation preferences. Derived view memoization includes
normalized report revision, explicit now/age bucket, operating scope and that
runtime's filter/budget/grouping choices. A 50-report consumer must not populate a
shared 200-report cache with a truncated response. SP-04 owns pure derivation;
Codex SP-09 owns production fetch/query wiring and any existing renderer adapter.

Mode categories are phone/cw/digital/unknown. Generic PHONE is not SSB; generic
DIGITAL is not FT8. UNKNOWN must retain unknown name/category/provenance. Alias
normalization and selection normalization belong to SP-04: persisted selections
cannot simultaneously specify All and individual modes, or an empty specific set.
UI categories expand to concrete selections; deselecting a child must not leave a
hidden category OR. Include unknown/inferred are explicit independent flags.

Locations discriminate reported-coordinate, reported-grid, approximate and unavailable.
Prefix centroids remain approximate. Resolution validates grid precision against the
source; the schema validates syntax, not whether a coordinate lies in that grid.
Country-only US observations cannot be assigned Kansas or a Maidenhead square.
Groups are keyed by stable geography version/region/detail, never the camera.
Region membership, licensed datasets, safe anchors and tie-breaks are SP-05 work.
`reportIds.length` is the badge count; no second mutable count exists.

The scene contains only budget-selected mapped reports, each represented exactly
once in groups or singles. Counts satisfy loaded >= deduplicated >= scopeEligible
>= matching, and matching = unlocated + mapped + budgetOmitted. Unlocated reports
remain available to full source lists; no fictitious map coordinate is synthesized.
The map limit applies after normalization, scope, filtering and deduplication.
Filtering never changes shared ingestion or analytical evidence.

Observed directional paths require explicit transmitter and receiver roles. Cluster
posting services are not reception proof. Modeled paths require model provenance;
point descriptors distinguish ray apex, shell highlight and ground point, separating
drawn height from model-supplied height. Animation timing is visual, not RF speed.

## Defaults and related issue decision

v1 retains the current 50-report default and 10–200 control range, age 30 minutes,
group minimum 3 (range 2–50). Detail is explicitly regions/grid4/grid6; passing 50
reports does not trigger automatic subdivision. #288's suggested 150–200 default is
not a new global default: SP-08 may use higher named activity presets per the epic.
Keep #288 open for its remaining geometry/glyph/age work. The 60-minute schema bound
does not promise 60 minutes of source history; UI must disclose actual availability.

Motion defaults: quick sweep for background, selected modeled hops with traveling
pulse; wall fallback is static. Maximum 12 active/100 pending, reduced motion is an
additional restriction. SP-06 must also honor OS/device comfort restrictions and
stop motion when hidden. Six activity recipes and four display templates are SP-08
deliverables; fallback factories are not substitutes for that catalog.

## Fixtures and benchmark protocol

`fixtures.ts`: `SPOT_FIXTURE_NOW_MS`, `SPOT_FIXTURE_GEOGRAPHY_VERSION`,
`createSpotInput`, `createNormalizedSpot`, `createSpotFixtures`,
`createSpotLoadFixture(500|5000)`, `createDisplayAssignmentFixture`.
Fixtures are synthetic and deterministic, including Spain50, Norway20, US states,
US prefix/approximate locations, dateline, poles, exact zero, grid-only/unlocated,
aliases, duplicates/distinct receivers, age boundary/expired/future timestamps.

Reference machine: Apple M5 Max, 18 CPU cores, 128 GB memory, macOS 26.6.2; Chrome
152.0.7977.76 (record actual GPU renderer from browser when measuring). Reference
viewport 1920x1080, DPR1, quality auto; also validate wall 3840x2160/DPR1 and compact
1280x720. Input matrix 500/5000 x display budget50/100/200 x globe/flat/azimuthal.
Fixed batches every 5 seconds, deterministic IDs; 10s warmup + 60s sample. Compare
off, quick-sweep, traveling-pulse, flowing-dashes; selected hops separately. Record
frame p50/p95, long tasks, pipeline time, active/pending maxima and heap before/after
ten scene changes. Test hidden/resume and reduced motion. Do not claim performance
from schema tests; SP-09/SP-11 collect real renderer baseline and post-change traces.
