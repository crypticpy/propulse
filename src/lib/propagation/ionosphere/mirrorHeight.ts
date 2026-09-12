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
 *  - converts the state's M(3000)F2 to a mirror height with
 *    `mirrorHeightFromM3000F2`, which is the ITU-R P.1239 conversion, not a
 *    curve invented here.
 *  - returns provenance either way. It never throws at the caller and never
 *    returns a bare number: a height with no source is the thing this leaf
 *    exists to stop.
 *
 * What it deliberately does not do: pick the point. The midpoint of a circuit,
 * the QTH, or a per-hop reflection point are all defensible, and the choice
 * belongs to whoever is drawing the circuit.
 */

import { mirrorHeightFromM3000F2 } from "@/lib/propagation/geometry/hop";
import {
  declaredMirrorHeightStandin,
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

export interface MirrorHeightQuery {
  readonly latitude: number;
  readonly longitude: number;
  /** The instant the report is showing, not necessarily the wall clock. */
  readonly at: Date;
}

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

/**
 * The mirror reflection height at one point and instant, with its source.
 *
 * Never rejects. Every failure is a `declared_standin` naming which of the
 * three things went wrong.
 */
export async function resolveMirrorHeight({
  latitude,
  longitude,
  at,
}: MirrorHeightQuery): Promise<ResolvedMirrorHeight> {
  let loaded: LoadedProvider;
  try {
    loaded = await loadProvider();
  } catch {
    return declaredMirrorHeightStandin("provider_asset_unavailable");
  }

  try {
    const coordinates = canonicalCoordinates(latitude, longitude);
    const state = loaded.provider.state({
      coordinates,
      validAt: at.toISOString(),
      r12: unknown<number>(R12_REASON),
      // The provider's own rule: `enhanced` unless reproducing an ITU golden.
      // `reference` reaches the coefficients through the mirrored 1.5-degree
      // grid, which is a parity oracle, not a live evaluation.
      mode: "enhanced",
    });
    const heightKm = mirrorHeightFromM3000F2(state.m3000F2);
    return {
      kind: "modelled",
      heightKm,
      m3000F2: state.m3000F2,
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
