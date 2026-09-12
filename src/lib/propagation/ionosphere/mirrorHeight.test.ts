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
import { PROVIDER_ID, PROVIDER_VERSION } from "./provider";
import { mirrorHeightFromM3000F2 } from "@/lib/propagation/geometry/hop";
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
  it("resolves a modelled height from M(3000)F2 and carries the provider id, version and artifact hash", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({ ...AUSTIN, at: AT });

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
    // The height is the conversion, not a number this leaf invented.
    expect(provenance.heightKm).toBe(
      mirrorHeightFromM3000F2(provenance.m3000F2),
    );
    // And the conversion was fed a real climatology value, not the stand-in.
    expect(provenance.heightKm).not.toBe(300);
    expect(provenance.heightKm).toBeGreaterThan(0);
    expect(provenance.heightKm).toBeLessThanOrEqual(500);
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

    const provenance = await resolveMirrorHeight({ ...AUSTIN, at: AT });

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
      resolveMirrorHeight({ ...AUSTIN, at: AT }),
      resolveMirrorHeight({ ...AUSTIN, at: AT }),
      resolveMirrorHeight({ latitude: 51.5, longitude: -0.13, at: AT }),
    ]);
    await resolveMirrorHeight({ ...AUSTIN, at: AT });

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
    const first = await resolveMirrorHeight({ ...AUSTIN, at: AT });
    expect(first.kind).toBe("declared_standin");

    vi.stubGlobal("fetch", servesTheAsset());
    const second = await resolveMirrorHeight({ ...AUSTIN, at: AT });

    expect(second.kind).toBe("modelled");
    expect(providerMocks.create).toHaveBeenCalledTimes(2);
  });

  it("never throws at the caller, whatever the query", async () => {
    vi.stubGlobal("fetch", servesTheAsset());

    const provenance = await resolveMirrorHeight({
      latitude: Number.NaN,
      longitude: 0,
      at: AT,
    });

    expect(provenance.kind).toBe("declared_standin");
    if (provenance.kind !== "declared_standin") return;
    expect(provenance.reason).toBe("provider_query_rejected");
  });
});
