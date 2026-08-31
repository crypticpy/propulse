import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useActivationSpots } from "./useActivationSpots";
import type { ActivationSpotsResponse } from "@/types/activationSpots";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useActivationSpots", () => {
  it("does not request the feed while its consumer is disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result, unmount } = renderHook(() => useActivationSpots(false), {
      wrapper,
    });

    expect(result.current.spots).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();
    queryClient.clear();
  });

  it("fetches once and groups normalized spots by program", async () => {
    const payload: ActivationSpotsResponse = {
      fetchedAt: "2026-08-31T14:00:00.000Z",
      spots: [
        {
          id: "pota-1",
          program: "POTA",
          callsign: "K5ABC",
          reference: "US-1234",
          referenceName: "Test Park",
          frequencyKHz: 14074,
          mode: "FT8",
          comments: "",
          spotter: "W1AW",
          spottedAt: "2026-08-31T13:59:00.000Z",
        },
        {
          id: "wwff-1",
          program: "WWFF",
          callsign: "VE3XYZ",
          reference: "VEFF-0001",
          referenceName: "Test Reserve",
          frequencyKHz: 7185,
          mode: "SSB",
          comments: "",
          spotter: "VE3AAA",
          spottedAt: "2026-08-31T13:58:00.000Z",
        },
      ],
      sources: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result, unmount } = renderHook(() => useActivationSpots(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.spots).toHaveLength(2));
    expect(result.current.spotsByProgram.POTA).toHaveLength(1);
    expect(result.current.spotsByProgram.SOTA).toHaveLength(0);
    expect(result.current.spotsByProgram.WWFF).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/activation/spots",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    unmount();
    queryClient.clear();
  });
});
