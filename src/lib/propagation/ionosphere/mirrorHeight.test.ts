// @vitest-environment node
//
// Node, not the repository default of jsdom, for the same reason
// `provider.test.ts` is node: the leaf under test resolves a number a circuit
// is drawn from, and it must resolve the same number on a server and in a
// browser. The asset bytes come off disk through a stubbed `fetch`, which is
// the one thing the leaf reaches the network with.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import manifest from "./assets/manifest.json";
import { resetNumericalMapAssetCache } from "./assets/loader";
import {
  createCcirIonosphereProvider,
  PROVIDER_ID,
  PROVIDER_VERSION,
} from "./provider";
import { canonicalCoordinates, unknown } from "./types";
import { f2ReflectionHeight } from "@/lib/propagation/geometry/reflectionHeight";
import {
  resolveRoute,
  routeSampleAtFraction,
} from "@/lib/propagation/geometry/route";
import {
  resetMirrorHeightProviderCache,
  resolveMirrorHeight,
} from "./mirrorHeight";

/**
 * The provider module is spied on, not replaced: test 24 counts how many times
 * the leaf builds a provider, and a fake provider would count nothing real.
 */
const providerMocks = vi.hoisted(() => ({ create: vi.fn(), state: vi.fn() }));
/**
 * The reflection-height leaf is spied on so one test can hand the resolver a
 * mode that equation (2) geometry would produce (two hops inside dmax) without
 * hunting the climatology for coordinates that happen to do it.
 */
const leafMocks = vi.hoisted(() => ({
  override: null as
    | null
    | ((
        result: import("@/lib/propagation/geometry/reflectionHeight").F2ReflectionHeight,
        input: Parameters<
          typeof import("@/lib/propagation/geometry/reflectionHeight").f2ReflectionHeight
        >[0],
      ) => import("@/lib/propagation/geometry/reflectionHeight").F2ReflectionHeight),
}));
vi.mock(
  "@/lib/propagation/geometry/reflectionHeight",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/propagation/geometry/reflectionHeight")
      >();
    return {
      ...actual,
      f2ReflectionHeight: (
        input: Parameters<typeof actual.f2ReflectionHeight>[0],
      ) => {
        const result = actual.f2ReflectionHeight(input);
        return leafMocks.override ? leafMocks.override(result, input) : result;
      },
    };
  },
);

vi.mock("./provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./provider")>();
  return {
    ...actual,
    createCcirIonosphereProvider: async (
      ...args: Parameters<typeof actual.createCcirIonosphereProvider>
    ) => {
      providerMocks.create();
      const provider = await actual.createCcirIonosphereProvider(...args);
      // Record every query the leaf makes, then answer it for real.
      return {
        ...provider,
        state: (...stateArgs: Parameters<typeof provider.state>) => {
          providerMocks.state(...stateArgs);
          return provider.state(...stateArgs);
        },
      };
    },
  };
});
const stateSpy = providerMocks.state;

async function assetBytes(): Promise<ArrayBuffer> {
  const file = path.join(process.cwd(), manifest.asset.path);
  const bytes = await readFile(file);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** Austin at 18Z, the QTH and instant the wall reports are pinned to. */
const AUSTIN = { latitude: 30.27, longitude: -97.74 };
const LONDON = { latitude: 51.5, longitude: -0.13 };
/** About 1570 km from Austin: one hop, inside dmax. */
const CHICAGO = { latitude: 41.88, longitude: -87.63 };
const AT = new Date("2026-09-05T18:00:00Z");
/** A 20 m circuit from Austin to London, 7880 km, well beyond dmax. */
const CIRCUIT = { start: AUSTIN, end: LONDON, frequencyMHz: 14.1 };

function routeOf(start: typeof AUSTIN, end: typeof AUSTIN) {
  const route = resolveRoute(
    { latitudeDeg: start.latitude, longitudeDeg: start.longitude },
    { latitudeDeg: end.latitude, longitudeDeg: end.longitude },
  );
  if (route.kind !== "resolved") throw new Error("fixture route");
  return route;
}

function servesTheAsset(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(await assetBytes()));
}

beforeEach(() => {
  providerMocks.create.mockClear();
  providerMocks.state.mockClear();
  resetNumericalMapAssetCache();
  resetMirrorHeightProviderCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  leafMocks.override = null;
});

describe("resolveMirrorHeight", () => {
  it("evaluates a circuit beyond dmax at the three Table 1c control points and returns their mean, with every point recorded", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({ ...CIRCUIT, at: AT });

    expect(provenance.kind).toBe("modelled");
    if (provenance.kind !== "modelled") return;
    // A live report evaluates the map at the point, not through the mirrored
    // parity grid that `reference` mode exists to reproduce.
    expect(stateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "enhanced" }),
    );
    expect(provenance.providerId).toBe(PROVIDER_ID);
    expect(provenance.providerVersion).toBe(PROVIDER_VERSION);
    expect(provenance.artifactHash).toBe(manifest.asset.sha256);

    // The circuit is the short route between the two ends, the same great
    // circle the trace walks, and the distance is that route's.
    const route = routeOf(AUSTIN, LONDON);
    expect(provenance.routeDirection).toBe("short");
    expect(provenance.groundDistanceKm).toBe(route.groundDistanceKm);
    expect(provenance.groundDistanceKm).toBeGreaterThan(provenance.dmaxKm);
    expect(provenance.frequencyMHz).toBe(CIRCUIT.frequencyMHz);

    // The mode is fixed at the midpoint: section 5.2.1's lowest hop count
    // with a hop no longer than dmax, evaluated from the midpoint's state.
    const provider = await createCcirIonosphereProvider();
    const stateAt = (fraction: number) => {
      const point = routeSampleAtFraction(route, fraction);
      return provider.state({
        coordinates: canonicalCoordinates(
          point.latitudeDeg,
          point.longitudeDeg,
        ),
        validAt: AT.toISOString(),
        r12: unknown<number>("test: bundled climatology"),
        mode: "enhanced",
      });
    };
    const midpoint = stateAt(0.5);
    const mode = f2ReflectionHeight({
      m3000F2: midpoint.m3000F2,
      foF2MHz: midpoint.foF2MHz,
      foEMHz: midpoint.foEMHz,
      r12: midpoint.solarIndex.r12,
      frequencyMHz: CIRCUIT.frequencyMHz,
      groundDistanceKm: route.groundDistanceKm,
    });
    expect(mode.hopCount).toBeGreaterThan(1);
    expect(provenance.hopCount).toBe(mode.hopCount);
    expect(provenance.dmaxKm).toBe(mode.dmaxKm);
    expect(provenance.hopGroundDistanceKm).toBe(
      route.groundDistanceKm / mode.hopCount,
    );
    expect(provenance.branch).toBe(mode.branch);
    // The midpoint inputs are the state's own, R12 included: the value the
    // provider actually evaluated the map at, not one invented here.
    expect(provenance.m3000F2).toBe(midpoint.m3000F2);
    expect(provenance.foF2MHz).toBe(midpoint.foF2MHz);
    expect(provenance.foEMHz).toBe(midpoint.foEMHz);
    expect(provenance.r12).toBe(midpoint.solarIndex.r12);
    expect(provenance.coordinates.latitude).toBe(midpoint.coordinates.latitude);
    expect(provenance.coordinates.longitude).toBe(
      midpoint.coordinates.longitude,
    );

    // Table 1c: T + d0/2, M and R - d0/2, in path order, each solved from
    // its own state for the midpoint's mode.
    const n = mode.hopCount;
    const fractions = [1 / (2 * n), 0.5, 1 - 1 / (2 * n)];
    expect(provenance.controlPoints.map((p) => p.label)).toEqual([
      "T + d0/2",
      "M",
      "R - d0/2",
    ]);
    provenance.controlPoints.forEach((point, index) => {
      const state = stateAt(fractions[index]);
      expect(point.latitude).toBe(state.coordinates.latitude);
      expect(point.longitude).toBe(state.coordinates.longitude);
      expect(point.m3000F2).toBe(state.m3000F2);
      expect(point.foF2MHz).toBe(state.foF2MHz);
      expect(point.foEMHz).toBe(state.foEMHz);
      expect(point.r12).toBe(state.solarIndex.r12);
      const expected = f2ReflectionHeight({
        m3000F2: state.m3000F2,
        foF2MHz: state.foF2MHz,
        foEMHz: state.foEMHz,
        r12: state.solarIndex.r12,
        frequencyMHz: CIRCUIT.frequencyMHz,
        groundDistanceKm: route.groundDistanceKm,
        hopCount: n,
      });
      expect(point.heightKm).toBe(expected.heightKm);
      expect(point.branch).toBe(expected.branch);
    });
    // The points sit at different places on a 7880 km path, so the map gives
    // them visibly different heights, and the height is their mean, not the
    // midpoint's alone.
    const heights = provenance.controlPoints.map((p) => p.heightKm);
    expect(new Set(heights.map((h) => h.toFixed(1))).size).toBe(3);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1);
    expect(provenance.heightKm).toBeCloseTo(
      (heights[0] + heights[1] + heights[2]) / 3,
      12,
    );
    expect(provenance.heightKm).not.toBe(heights[1]);
    expect(provenance.heightKm).not.toBe(1490 / provenance.m3000F2 - 176);
    // And the leaf was fed a real climatology value, not the stand-in.
    expect(provenance.heightKm).not.toBe(300);
    expect(provenance.heightKm).toBeGreaterThan(0);
    expect(provenance.heightKm).toBeLessThanOrEqual(800);
    expect(provenance.validAt).toBe("2026-09-05T18:00:00.000Z");
    expect(provenance.stateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(provenance.assumptions.length).toBeGreaterThan(0);
  });

  it("evaluates a circuit within dmax at the midpoint alone and records that one control point", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({
      start: AUSTIN,
      end: CHICAGO,
      frequencyMHz: 14.1,
      at: AT,
    });

    expect(provenance.kind).toBe("modelled");
    if (provenance.kind !== "modelled") return;
    const route = routeOf(AUSTIN, CHICAGO);
    expect(route.groundDistanceKm).toBeLessThan(provenance.dmaxKm);
    expect(provenance.hopCount).toBe(1);
    expect(provenance.hopGroundDistanceKm).toBe(route.groundDistanceKm);
    expect(provenance.controlPoints).toHaveLength(1);
    const [point] = provenance.controlPoints;
    expect(point.label).toBe("M");
    const midpoint = routeSampleAtFraction(route, 0.5);
    expect(point.latitude).toBeCloseTo(midpoint.latitudeDeg, 9);
    expect(point.longitude).toBeCloseTo(midpoint.longitudeDeg, 9);
    expect(point.heightKm).toBe(provenance.heightKm);
    expect(point.m3000F2).toBe(provenance.m3000F2);
    // One point, so the provider was asked once.
    expect(stateSpy).toHaveBeenCalledTimes(1);
  });

  it("chooses the control points by distance against dmax, not by hop count: two hops inside dmax still take M alone", async () => {
    vi.stubGlobal("fetch", servesTheAsset());
    // Equation (2) geometry can need two hops at a low height even though the
    // path is inside dmax (reflectionHeight.test case 7). Table 1c keys the
    // control points on the distance, so this must be one point, M, with the
    // two-hop mode carried through.
    leafMocks.override = (result, input) =>
      input.hopCount === undefined
        ? {
            ...result,
            hopCount: 2,
            hopGroundDistanceKm: input.groundDistanceKm / 2,
          }
        : result;

    const provenance = await resolveMirrorHeight({
      start: AUSTIN,
      end: CHICAGO,
      frequencyMHz: 14.1,
      at: AT,
    });

    expect(provenance.kind).toBe("modelled");
    if (provenance.kind !== "modelled") return;
    const route = routeOf(AUSTIN, CHICAGO);
    expect(route.groundDistanceKm).toBeLessThanOrEqual(provenance.dmaxKm);
    expect(provenance.hopCount).toBe(2);
    expect(provenance.controlPoints).toHaveLength(1);
    expect(provenance.controlPoints[0].label).toBe("M");
    expect(stateSpy).toHaveBeenCalledTimes(1);
  });

  it("returns a declared_standin with circuit_unresolvable when the endpoints determine no route", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({
      start: AUSTIN,
      end: AUSTIN,
      frequencyMHz: 14.1,
      at: AT,
    });

    expect(provenance.kind).toBe("declared_standin");
    if (provenance.kind !== "declared_standin") return;
    expect(provenance.reason).toBe("circuit_unresolvable");
    expect(provenance.detail).toContain("coincident or antipodal");
  });

  it("returns a declared_standin with provider_asset_unavailable when the asset fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );

    const provenance = await resolveMirrorHeight({ ...CIRCUIT, at: AT });

    expect(provenance.kind).toBe("declared_standin");
    if (provenance.kind !== "declared_standin") return;
    expect(provenance.reason).toBe("provider_asset_unavailable");
    expect(provenance.heightKm).toBe(300);
    expect(provenance.detail).toContain("300 km");
    expect(provenance.detail.length).toBeGreaterThan(0);
  });

  it("loads the provider once across repeated resolves", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const [first, second, third] = await Promise.all([
      resolveMirrorHeight({ ...CIRCUIT, at: AT }),
      resolveMirrorHeight({ ...CIRCUIT, at: AT }),
      resolveMirrorHeight({ ...CIRCUIT, start: CHICAGO, at: AT }),
    ]);
    await resolveMirrorHeight({ ...CIRCUIT, at: AT });

    expect(providerMocks.create).toHaveBeenCalledTimes(1);
    expect(first.kind).toBe("modelled");
    expect(second.kind).toBe("modelled");
    expect(third.kind).toBe("modelled");
  });

  it("retries the load on the next call after a failure rather than caching the rejection", async () => {
    const failing = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", failing);
    const first = await resolveMirrorHeight({ ...CIRCUIT, at: AT });
    expect(first.kind).toBe("declared_standin");

    vi.stubGlobal("fetch", servesTheAsset());
    const second = await resolveMirrorHeight({ ...CIRCUIT, at: AT });

    expect(second.kind).toBe("modelled");
    expect(providerMocks.create).toHaveBeenCalledTimes(2);
  });

  it("evaluates the state at the instant given, not a truncated hour", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({
      ...CIRCUIT,
      at: new Date("2026-09-05T18:37:00Z"),
    });

    expect(provenance.kind).toBe("modelled");
    if (provenance.kind !== "modelled") return;
    expect(provenance.validAt).toBe("2026-09-05T18:37:00.000Z");
  });

  it("returns a declared_standin with provider_query_rejected when the circuit inputs are outside the leaf's domain", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({
      ...CIRCUIT,
      frequencyMHz: 0,
      at: AT,
    });

    expect(provenance.kind).toBe("declared_standin");
    if (provenance.kind !== "declared_standin") return;
    expect(provenance.reason).toBe("provider_query_rejected");
  });

  it("never throws at the caller, whatever the query", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({
      ...CIRCUIT,
      start: { latitude: Number.NaN, longitude: 0 },
      at: AT,
    });

    expect(provenance.kind).toBe("declared_standin");
    if (provenance.kind !== "declared_standin") return;
    expect(provenance.reason).toBe("provider_query_rejected");
  });
});
