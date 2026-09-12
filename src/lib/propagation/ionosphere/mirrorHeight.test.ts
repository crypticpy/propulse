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
  resetMirrorHeightProviderCache,
  resolveMirrorHeight,
} from "./mirrorHeight";

/**
 * The provider module is spied on, not replaced: test 24 counts how many times
 * the leaf builds a provider, and a fake provider would count nothing real.
 */
const providerMocks = vi.hoisted(() => ({ create: vi.fn(), state: vi.fn() }));
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
const AT = new Date("2026-09-05T18:00:00Z");
/** A 20 m circuit of about the Austin to London ground distance. */
const CIRCUIT = { frequencyMHz: 14.1, groundDistanceKm: 7880 };

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
});

describe("resolveMirrorHeight", () => {
  it("resolves a modelled height from the full P.533 section 5.1 parameter set and carries the provider id, version and artifact hash", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({
      ...AUSTIN,
      ...CIRCUIT,
      at: AT,
    });

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

    // The ionospheric inputs are the state's own, R12 included: the value the
    // provider actually evaluated the map at, not one invented here.
    const provider = await createCcirIonosphereProvider();
    const state = provider.state({
      coordinates: canonicalCoordinates(AUSTIN.latitude, AUSTIN.longitude),
      validAt: AT.toISOString(),
      r12: unknown<number>("test: bundled climatology"),
      mode: "enhanced",
    });
    expect(provenance.m3000F2).toBe(state.m3000F2);
    expect(provenance.foF2MHz).toBe(state.foF2MHz);
    expect(provenance.foEMHz).toBe(state.foEMHz);
    expect(provenance.r12).toBe(state.solarIndex.r12);
    expect(provenance.frequencyMHz).toBe(CIRCUIT.frequencyMHz);
    expect(provenance.groundDistanceKm).toBe(CIRCUIT.groundDistanceKm);

    // The height is the section 5.1 leaf evaluated on exactly those inputs,
    // not a number this leaf invented and not the equation (2) shortcut.
    const expected = f2ReflectionHeight({
      m3000F2: provenance.m3000F2,
      foF2MHz: provenance.foF2MHz,
      foEMHz: provenance.foEMHz,
      r12: provenance.r12,
      frequencyMHz: provenance.frequencyMHz,
      groundDistanceKm: provenance.groundDistanceKm,
    });
    expect(provenance.heightKm).toBe(expected.heightKm);
    expect(provenance.dmaxKm).toBe(expected.dmaxKm);
    expect(provenance.hopCount).toBe(expected.hopCount);
    expect(provenance.branch).toBe(expected.branch);
    expect(provenance.heightKm).not.toBe(1490 / provenance.m3000F2 - 176);
    // And the leaf was fed a real climatology value, not the stand-in.
    expect(provenance.heightKm).not.toBe(300);
    expect(provenance.heightKm).toBeGreaterThan(0);
    expect(provenance.heightKm).toBeLessThanOrEqual(800);
    expect(provenance.validAt).toBe("2026-09-05T18:00:00.000Z");
    // Canonicalised, so the longitude round-trips to within a float wobble.
    expect(provenance.coordinates.latitude).toBe(AUSTIN.latitude);
    expect(provenance.coordinates.longitude).toBeCloseTo(AUSTIN.longitude, 9);
    expect(provenance.stateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(provenance.assumptions.length).toBeGreaterThan(0);
  });

  it("returns a declared_standin with provider_asset_unavailable when the asset fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );

    const provenance = await resolveMirrorHeight({
      ...AUSTIN,
      ...CIRCUIT,
      at: AT,
    });

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
      resolveMirrorHeight({ ...AUSTIN, ...CIRCUIT, at: AT }),
      resolveMirrorHeight({ ...AUSTIN, ...CIRCUIT, at: AT }),
      resolveMirrorHeight({
        latitude: 51.5,
        longitude: -0.13,
        ...CIRCUIT,
        at: AT,
      }),
    ]);
    await resolveMirrorHeight({ ...AUSTIN, ...CIRCUIT, at: AT });

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
    const first = await resolveMirrorHeight({ ...AUSTIN, ...CIRCUIT, at: AT });
    expect(first.kind).toBe("declared_standin");

    vi.stubGlobal("fetch", servesTheAsset());
    const second = await resolveMirrorHeight({ ...AUSTIN, ...CIRCUIT, at: AT });

    expect(second.kind).toBe("modelled");
    expect(providerMocks.create).toHaveBeenCalledTimes(2);
  });

  it("evaluates the state at the instant given, not a truncated hour", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({
      ...AUSTIN,
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
      ...AUSTIN,
      frequencyMHz: 0,
      groundDistanceKm: 7880,
      at: AT,
    });

    expect(provenance.kind).toBe("declared_standin");
    if (provenance.kind !== "declared_standin") return;
    expect(provenance.reason).toBe("provider_query_rejected");
  });

  it("never throws at the caller, whatever the query", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({
      latitude: Number.NaN,
      longitude: 0,
      ...CIRCUIT,
      at: AT,
    });

    expect(provenance.kind).toBe("declared_standin");
    if (provenance.kind !== "declared_standin") return;
    expect(provenance.reason).toBe("provider_query_rejected");
  });
});
