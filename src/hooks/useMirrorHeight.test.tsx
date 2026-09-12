import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useMirrorHeight } from "./useMirrorHeight";

const resolveMocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/lib/propagation/ionosphere/mirrorHeight", () => ({
  resolveMirrorHeight: resolveMocks.resolve,
}));

const AT = new Date("2026-09-05T18:00:00Z");

const MODELLED = {
  kind: "modelled" as const,
  heightKm: 328.4,
  m3000F2: 3.04,
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

    const { result } = renderHook(() => useMirrorHeight(30.27, -97.74, AT), {
      wrapper,
    });

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

  it("stays on the declared stand-in without a position, and never queries", async () => {
    resolveMocks.resolve.mockClear();
    resolveMocks.resolve.mockResolvedValue(MODELLED);

    const { result } = renderHook(() => useMirrorHeight(null, null, AT), {
      wrapper,
    });

    expect(result.current.kind).toBe("declared_standin");
    await waitFor(() => expect(resolveMocks.resolve).not.toHaveBeenCalled());
  });

  it("keys on the rounded position and the hour, so a minute of clock drift is not a refetch", async () => {
    resolveMocks.resolve.mockClear();
    resolveMocks.resolve.mockResolvedValue(MODELLED);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = renderHook(() => useMirrorHeight(30.271, -97.744, AT), {
      wrapper: sharedWrapper,
    });
    await waitFor(() => expect(first.result.current.kind).toBe("modelled"));

    renderHook(
      () =>
        useMirrorHeight(
          30.269,
          -97.742,
          new Date("2026-09-05T18:59:00.000Z"),
        ),
      { wrapper: sharedWrapper },
    );

    await waitFor(() => expect(resolveMocks.resolve).toHaveBeenCalledTimes(1));
  });
});
