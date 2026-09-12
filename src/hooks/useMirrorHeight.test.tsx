import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useMirrorHeight } from "./useMirrorHeight";
import { declaredMirrorHeightStandin } from "@/lib/utils/rayTrace";

const resolveMocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/propagation/ionosphere/mirrorHeight", () => ({
  resolveMirrorHeight: resolveMocks.resolve,
}));

const AT = new Date("2026-09-05T18:00:00Z");
const FREQUENCY_MHZ = 18.4;
const DISTANCE_KM = 7880;
const AUSTIN = { lat: 30.27, lon: -97.74 };
const LONDON = { lat: 51.5, lon: -0.13 };

const MODELLED = {
  kind: "modelled" as const,
  heightKm: 328.4,
  m3000F2: 3.04,
  foF2MHz: 6.4,
  foEMHz: 2.2,
  r12: 61.5,
  frequencyMHz: FREQUENCY_MHZ,
  groundDistanceKm: DISTANCE_KM,
  dmaxKm: 4000,
  hopCount: 2,
  hopGroundDistanceKm: DISTANCE_KM / 2,
  branch: "5.1a" as const,
  routeDirection: "short" as const,
  controlPoints: [],
  providerId: "ccir-numerical-map",
  providerVersion: "1.0.0",
  artifactHash: "sha256:" + "a".repeat(64),
  validAt: "2026-09-05T18:00:00.000Z",
  coordinates: { latitude: 30.27, longitude: -97.74 },
  stateDigest: "sha256:" + "b".repeat(64),
  assumptions: ["adopted model"],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useMirrorHeight", () => {
  it("reports the declared stand-in before the asset resolves and the modelled height after", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    resolveMocks.resolve.mockImplementation(async () => {
      await gate;
      return MODELLED;
    });

    const { result } = renderHook(
      () =>
        useMirrorHeight(
          AUSTIN.lat,
          AUSTIN.lon,
          LONDON.lat,
          LONDON.lon,
          AT,
          FREQUENCY_MHZ,
        ),
      {
        wrapper,
      },
    );

    // First frame: nothing has resolved, and the hook says so rather than
    // handing the engine a number with no source.
    expect(result.current.kind).toBe("declared_standin");
    if (result.current.kind === "declared_standin") {
      expect(result.current.heightKm).toBe(300);
      expect(result.current.reason).toBe("no_provider_supplied");
    }

    release();
    await waitFor(() => expect(result.current.kind).toBe("modelled"));
    expect(result.current.heightKm).toBe(MODELLED.heightKm);
  });

  it("stays on the declared stand-in without a home position, and never queries", async () => {
    resolveMocks.resolve.mockClear();
    resolveMocks.resolve.mockResolvedValue(MODELLED);

    const { result } = renderHook(
      () =>
        useMirrorHeight(null, null, LONDON.lat, LONDON.lon, AT, FREQUENCY_MHZ),
      { wrapper },
    );

    expect(result.current.kind).toBe("declared_standin");
    await waitFor(() => expect(resolveMocks.resolve).not.toHaveBeenCalled());
  });

  it("stays on the declared stand-in without a target or a frequency, and never queries", async () => {
    resolveMocks.resolve.mockClear();
    resolveMocks.resolve.mockResolvedValue(MODELLED);

    // A circuit needs two ends: without a target there is nothing to solve.
    const noTarget = renderHook(
      () =>
        useMirrorHeight(AUSTIN.lat, AUSTIN.lon, null, null, AT, FREQUENCY_MHZ),
      { wrapper },
    );
    const noFrequency = renderHook(
      () =>
        useMirrorHeight(
          AUSTIN.lat,
          AUSTIN.lon,
          LONDON.lat,
          LONDON.lon,
          AT,
          null,
        ),
      { wrapper },
    );

    expect(noTarget.result.current.kind).toBe("declared_standin");
    expect(noFrequency.result.current.kind).toBe("declared_standin");
    await waitFor(() => expect(resolveMocks.resolve).not.toHaveBeenCalled());
  });

  it("keys on the endpoints to a thousandth of a degree, the frequency and the minute: jitter inside those is not a refetch, a new minute is", async () => {
    resolveMocks.resolve.mockClear();
    resolveMocks.resolve.mockResolvedValue(MODELLED);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = renderHook(
      () =>
        useMirrorHeight(
          30.2714,
          -97.7444,
          51.5044,
          -0.1314,
          new Date("2026-09-05T18:37:10.000Z"),
          18.401,
        ),
      { wrapper: sharedWrapper },
    );
    await waitFor(() => expect(first.result.current.kind).toBe("modelled"));

    renderHook(
      () =>
        useMirrorHeight(
          30.2706,
          -97.7436,
          51.5036,
          -0.1306,
          new Date("2026-09-05T18:37:29.000Z"),
          18.404,
        ),
      { wrapper: sharedWrapper },
    );
    await waitFor(() => expect(resolveMocks.resolve).toHaveBeenCalledTimes(1));

    renderHook(
      () =>
        useMirrorHeight(
          30.2714,
          -97.7444,
          51.5044,
          -0.1314,
          new Date("2026-09-05T18:38:00.000Z"),
          18.401,
        ),
      { wrapper: sharedWrapper },
    );
    await waitFor(() => expect(resolveMocks.resolve).toHaveBeenCalledTimes(2));
  });

  it("evaluates the leaf at the displayed instant rounded to the minute, not the truncated hour", async () => {
    resolveMocks.resolve.mockClear();
    resolveMocks.resolve.mockResolvedValue(MODELLED);

    renderHook(
      () =>
        useMirrorHeight(
          30.2714,
          -97.7444,
          51.5044,
          -0.1314,
          new Date("2026-09-05T18:37:41.000Z"),
          18.404,
        ),
      { wrapper },
    );

    await waitFor(() => expect(resolveMocks.resolve).toHaveBeenCalledTimes(1));
    const query = resolveMocks.resolve.mock.calls[0][0] as {
      start: { latitude: number; longitude: number };
      end: { latitude: number; longitude: number };
      at: Date;
      frequencyMHz: number;
    };
    expect(query.at.toISOString()).toBe("2026-09-05T18:38:00.000Z");
    // The leaf gets the same rounded inputs the key was built from, so the
    // cached answer is a pure function of its key.
    expect(query.start).toEqual({ latitude: 30.271, longitude: -97.744 });
    expect(query.end).toEqual({ latitude: 51.504, longitude: -0.131 });
    expect(query.frequencyMHz).toBe(18.4);
  });

  it("asks again on the next mount when the last answer was a stand-in, so a transient load failure is not cached for the hour", async () => {
    resolveMocks.resolve.mockClear();
    const standin = declaredMirrorHeightStandin("provider_asset_unavailable");
    resolveMocks.resolve
      .mockResolvedValueOnce(standin)
      .mockResolvedValueOnce(MODELLED);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = renderHook(
      () =>
        useMirrorHeight(
          AUSTIN.lat,
          AUSTIN.lon,
          LONDON.lat,
          LONDON.lon,
          AT,
          FREQUENCY_MHZ,
        ),
      {
        wrapper: sharedWrapper,
      },
    );
    await waitFor(() => expect(resolveMocks.resolve).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const value = first.result.current;
      expect(
        value.kind === "declared_standin" &&
          value.reason === "provider_asset_unavailable",
      ).toBe(true);
    });
    first.unmount();

    const second = renderHook(
      () =>
        useMirrorHeight(
          AUSTIN.lat,
          AUSTIN.lon,
          LONDON.lat,
          LONDON.lon,
          AT,
          FREQUENCY_MHZ,
        ),
      {
        wrapper: sharedWrapper,
      },
    );
    await waitFor(() => expect(resolveMocks.resolve).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.kind).toBe("modelled"));
  });

  it("keeps a modelled height for the hour across mounts", async () => {
    resolveMocks.resolve.mockClear();
    resolveMocks.resolve.mockResolvedValue(MODELLED);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = renderHook(
      () =>
        useMirrorHeight(
          AUSTIN.lat,
          AUSTIN.lon,
          LONDON.lat,
          LONDON.lon,
          AT,
          FREQUENCY_MHZ,
        ),
      {
        wrapper: sharedWrapper,
      },
    );
    await waitFor(() => expect(first.result.current.kind).toBe("modelled"));
    first.unmount();

    const second = renderHook(
      () =>
        useMirrorHeight(
          AUSTIN.lat,
          AUSTIN.lon,
          LONDON.lat,
          LONDON.lon,
          AT,
          FREQUENCY_MHZ,
        ),
      {
        wrapper: sharedWrapper,
      },
    );
    await waitFor(() => expect(second.result.current.kind).toBe("modelled"));
    expect(resolveMocks.resolve).toHaveBeenCalledTimes(1);
  });
});
