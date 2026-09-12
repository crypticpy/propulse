/**
 * The circuit leaf the provider refuses to be (PROP-03, #1108).
 *
 * `provider.ts` answers one question about one point and nothing else: it will
 * not load itself, will not remember anything between calls, and will not
 * decide what a caller should do when the coefficient asset is missing. Those
 * three decisions are a circuit's business, and this is where they live.
 *
 * What it does:
 *
 *  - loads the CCIR provider once, behind a dynamic `import()` so the wall
 *    route does not pay for the provider chain until a report opens (#1108
 *    decision O10). A rejected load is not cached: the next call retries, the
 *    same rule `loadNumericalMapAsset` already applies to the asset itself.
 *  - resolves the circuit's short great-circle route and evaluates the
 *    ITU-R P.533-14 section 5.1 F2 mirror height (mathematical contract M05)
 *    at the Table 1c control points. The mode (hop count n and hop length
 *    d0 = D/n) is fixed at the path midpoint M by `f2ReflectionHeight`. For a
 *    circuit up to dmax that is the whole answer: one control point, M. For a
 *    longer circuit Table 1c names three, T + d0/2, M and R - d0/2, and the
 *    height is the mean of the section 5.1 height at each, every point solved
 *    from its own foF2, foE, M(3000)F2 and R12 for the same mode. The mode is
 *    pinned rather than re-derived per point because the height is a property
 *    of one hop geometry, and the trace draws that geometry.
 *  - returns provenance either way. It never throws at the caller and never
 *    returns a bare number: a height with no source is the thing this leaf
 *    exists to stop. The modelled provenance records every control point so
 *    the trace can check it was solved for the circuit being drawn.
 */

import { f2ReflectionHeight } from "@/lib/propagation/geometry/reflectionHeight";
import type { F2ReflectionHeight } from "@/lib/propagation/geometry/reflectionHeight";
import {
  resolveRoute,
  routeSampleAtFraction,
} from "@/lib/propagation/geometry/route";
import type { GeodeticPoint } from "@/lib/propagation/geometry/route";
import {
  declaredMirrorHeightStandin,
  type MirrorHeightControlPoint,
  type MirrorHeightProvenance,
} from "@/lib/utils/rayTrace";
import { canonicalCoordinates, unknown } from "./types";
import type { IonosphereState } from "./types";
// Type-only, so it is erased and the provider chain stays in its own chunk.
import type { IonosphereProvider } from "./provider";

/** What `resolveMirrorHeight` can return: a modelled height, or the stand-in. */
export type ResolvedMirrorHeight = Extract<
  MirrorHeightProvenance,
  { kind: "modelled" | "declared_standin" }
>;

export interface MirrorHeightEndpoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface MirrorHeightQuery {
  /** The transmitter end of the circuit, T in Table 1c. */
  readonly start: MirrorHeightEndpoint;
  /** The receiver end of the circuit, R in Table 1c. */
  readonly end: MirrorHeightEndpoint;
  /** The instant the report is showing, not necessarily the wall clock. */
  readonly at: Date;
  /** The operating frequency the circuit is traced at, MHz. */
  readonly frequencyMHz: number;
}

/** The route the height is solved on. The report only traces short paths. */
const ROUTE_DIRECTION = "short";

/**
 * R12 is left to the provider's bundled climatology rather than guessed from
 * SFI here: the state names the substitution in its own assumptions, which the
 * modelled provenance carries verbatim.
 */
const R12_REASON =
  "no R12 supplied by the circuit; the provider's bundled smoothed sunspot " +
  "climatology is used";

type ProviderModule = typeof import("./provider");

interface LoadedProvider {
  readonly provider: IonosphereProvider;
  readonly digest: ProviderModule["ionosphereStateDigest"];
}

let loading: Promise<LoadedProvider> | null = null;

/**
 * Load the provider once. On failure the memo is dropped so the next call
 * retries, rather than turning one bad fetch into a permanently degraded
 * report. Same shape as `loadNumericalMapAsset`, on purpose.
 */
function loadProvider(): Promise<LoadedProvider> {
  if (loading !== null) return loading;
  const pending = (async (): Promise<LoadedProvider> => {
    const module = await import("./provider");
    return {
      provider: await module.createCcirIonosphereProvider(),
      digest: module.ionosphereStateDigest,
    };
  })();
  loading = pending;
  pending.catch(() => {
    if (loading === pending) loading = null;
  });
  return pending;
}

/** Test-only: drop the memo so a fresh load can be observed. */
export function resetMirrorHeightProviderCache(): void {
  loading = null;
}

/**
 * The state's digest, or the documented `"unknown"` literal.
 *
 * A missing WebCrypto implementation is a reason to lose the cache identity of
 * a correct height, not a reason to throw the height away and draw the circuit
 * at 300 km. `ContextSnapshot.sourceVersion` already spells this fallback.
 */
async function stateDigestOf(
  state: IonosphereState,
  digest: LoadedProvider["digest"],
): Promise<string> {
  try {
    return await digest(state);
  } catch {
    return "unknown";
  }
}

interface EvaluatedPoint {
  readonly state: IonosphereState;
  readonly height: F2ReflectionHeight;
}

function toGeodetic(point: MirrorHeightEndpoint): GeodeticPoint {
  return { latitudeDeg: point.latitude, longitudeDeg: point.longitude };
}

function controlPointOf(
  label: MirrorHeightControlPoint["label"],
  { state, height }: EvaluatedPoint,
): MirrorHeightControlPoint {
  return {
    label,
    latitude: state.coordinates.latitude,
    longitude: state.coordinates.longitude,
    heightKm: height.heightKm,
    m3000F2: state.m3000F2,
    foF2MHz: state.foF2MHz,
    foEMHz: state.foEMHz,
    r12: state.solarIndex.r12,
    branch: height.branch,
  };
}

/**
 * The mirror reflection height for one circuit and instant, with its source.
 *
 * Never rejects. Every failure is a `declared_standin` naming which of the
 * things it needed went wrong.
 */
export async function resolveMirrorHeight({
  start,
  end,
  at,
  frequencyMHz,
}: MirrorHeightQuery): Promise<ResolvedMirrorHeight> {
  const route = resolveRoute(toGeodetic(start), toGeodetic(end), {
    direction: ROUTE_DIRECTION,
  });
  if (route.kind !== "resolved") {
    return declaredMirrorHeightStandin("circuit_unresolvable");
  }

  let loaded: LoadedProvider;
  try {
    loaded = await loadProvider();
  } catch {
    return declaredMirrorHeightStandin("provider_asset_unavailable");
  }

  try {
    const groundDistanceKm = route.groundDistanceKm;
    const validAt = at.toISOString();
    const evaluate = (
      fraction: number,
      hopCount: number | undefined,
    ): EvaluatedPoint => {
      const point = routeSampleAtFraction(route, fraction);
      const state = loaded.provider.state({
        coordinates: canonicalCoordinates(
          point.latitudeDeg,
          point.longitudeDeg,
        ),
        validAt,
        r12: unknown<number>(R12_REASON),
        // The provider's own rule: `enhanced` unless reproducing an ITU
        // golden. `reference` reaches the coefficients through the mirrored
        // 1.5-degree grid, which is a parity oracle, not a live evaluation.
        mode: "enhanced",
      });
      // The R12 is the one the state was evaluated at. When the circuit
      // supplies none, that is the provider's bundled climatology, and the
      // substitution is already named in `state.assumptions`.
      const height = f2ReflectionHeight({
        m3000F2: state.m3000F2,
        foF2MHz: state.foF2MHz,
        foEMHz: state.foEMHz,
        r12: state.solarIndex.r12,
        frequencyMHz,
        groundDistanceKm,
        hopCount,
      });
      return { state, height };
    };

    // The mode is fixed at M: section 5.2.1's lowest-order F2 mode with a hop
    // no longer than dmax evaluated at the midpoint (P.533-14 Table 1c, which
    // puts dmax and the mode at M for every path length).
    const midpoint = evaluate(0.5, undefined);
    const { hopCount, hopGroundDistanceKm, dmaxKm } = midpoint.height;

    // Table 1c: paths up to dmax take M alone; longer paths take T + d0/2, M
    // and R - d0/2, and the mean of the section 5.1 height across them. With
    // d0 = D/n the offsets are the fractions 1/(2n) and 1 - 1/(2n). The
    // branch is the path length against dmax, not the hop count: equation (2)
    // geometry can need two hops inside dmax, and Table 1c still says M.
    const controlPoints: MirrorHeightControlPoint[] =
      groundDistanceKm <= dmaxKm
        ? [controlPointOf("M", midpoint)]
        : [
            controlPointOf("T + d0/2", evaluate(1 / (2 * hopCount), hopCount)),
            controlPointOf("M", evaluate(0.5, hopCount)),
            controlPointOf(
              "R - d0/2",
              evaluate(1 - 1 / (2 * hopCount), hopCount),
            ),
          ];
    const heightKm =
      controlPoints.reduce((sum, point) => sum + point.heightKm, 0) /
      controlPoints.length;

    const state = midpoint.state;
    return {
      kind: "modelled",
      heightKm,
      m3000F2: state.m3000F2,
      foF2MHz: state.foF2MHz,
      foEMHz: state.foEMHz,
      r12: state.solarIndex.r12,
      frequencyMHz,
      groundDistanceKm,
      dmaxKm,
      hopCount,
      hopGroundDistanceKm,
      branch: midpoint.height.branch,
      routeDirection: ROUTE_DIRECTION,
      controlPoints,
      providerId: state.providerId,
      providerVersion: state.providerVersion,
      artifactHash: state.artifactHash,
      validAt: state.validAt,
      coordinates: {
        latitude: state.coordinates.latitude,
        longitude: state.coordinates.longitude,
      },
      stateDigest: await stateDigestOf(state, loaded.digest),
      assumptions: state.assumptions,
    };
  } catch {
    return declaredMirrorHeightStandin("provider_query_rejected");
  }
}
