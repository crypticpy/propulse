import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  psk: {
    data: undefined as undefined,
    dataUpdatedAt: 0,
    isError: true,
    isLoading: false,
    refetch: vi.fn(),
  },
  rbn: {
    data: undefined as undefined,
    dataUpdatedAt: 0,
    isError: true,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) =>
    options.queryKey[1] === "pskreporter" ? mocks.psk : mocks.rbn,
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: { displayDensity: number }) => unknown) =>
    selector({ displayDensity: 100 }),
}));
vi.mock("@/stores/wsjtxStore", () => ({
  useWSJTXStore: (
    selector: (state: {
      connected: boolean;
      decodes: unknown[];
      status: null;
    }) => unknown,
  ) => selector({ connected: false, decodes: [], status: null }),
}));

import { useLiveSpots } from "./useLiveSpots";

describe("useLiveSpots feed readiness", () => {
  beforeEach(() => {
    mocks.psk.dataUpdatedAt = 0;
    mocks.psk.isError = true;
    mocks.psk.isLoading = false;
    mocks.rbn.dataUpdatedAt = 0;
    mocks.rbn.isError = true;
    mocks.rbn.isLoading = false;
  });

  it("does not mark an initially errored feed ready until every requested source succeeds", () => {
    const { result, rerender } = renderHook(() => useLiveSpots());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(true);
    expect(result.current.isFeedReady).toBe(false);

    mocks.psk.dataUpdatedAt = 100;
    mocks.psk.isError = false;
    rerender();
    expect(result.current.isFeedReady).toBe(false);

    mocks.rbn.dataUpdatedAt = 200;
    mocks.rbn.isError = false;
    rerender();
    expect(result.current.isFeedReady).toBe(true);
  });

  it("requires success only from requested remote sources", () => {
    mocks.rbn.dataUpdatedAt = 200;
    mocks.rbn.isError = false;

    const { result } = renderHook(() =>
      useLiveSpots({ sources: ["RBN"] }),
    );

    expect(result.current.isFeedReady).toBe(true);
  });
});
