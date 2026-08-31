import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bandVerdictInputsAreReady,
  useBandVerdicts,
} from "./useBandVerdicts";
import { useVerdictStore } from "@/stores/verdictStore";

const hookMocks = vi.hoisted(() => ({
  useKIndex: vi.fn(),
  useSolarFlux: vi.fn(),
  useBandActivity: vi.fn(),
  useProfileStore: vi.fn(),
}));

vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: hookMocks.useKIndex,
  useSolarFlux: hookMocks.useSolarFlux,
}));

vi.mock("@/hooks/useBandActivity", () => ({
  useBandActivity: hookMocks.useBandActivity,
}));

vi.mock("@/stores/profileStore", () => ({
  useProfileStore: hookMocks.useProfileStore,
}));

beforeEach(() => {
  hookMocks.useKIndex.mockReturnValue({ data: [{ kp_index: 2 }] });
  hookMocks.useSolarFlux.mockReturnValue({ data: [{ flux: 145 }] });
  hookMocks.useBandActivity.mockReturnValue({
    data: new Map(),
    isError: false,
  });
  hookMocks.useProfileStore.mockImplementation(
    (selector: (state: { station: null; savedTargets: never[] }) => unknown) =>
      selector({ station: null, savedTargets: [] }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bandVerdictInputsAreReady", () => {
  it("requires current solar and activity inputs before persisted verdicts are live", () => {
    expect(bandVerdictInputsAreReady(2, 145, true)).toBe(true);
    expect(bandVerdictInputsAreReady(null, 145, true)).toBe(false);
    expect(bandVerdictInputsAreReady(2, null, true)).toBe(false);
    expect(bandVerdictInputsAreReady(2, 145, false)).toBe(false);
  });
});

describe("useBandVerdicts scope coordinator", () => {
  it("ingests once per minute across duplicate consumers and survives one unmount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const ingest = vi
      .spyOn(useVerdictStore.getState(), "ingest")
      .mockImplementation(() => undefined);

    const first = renderHook(() => useBandVerdicts());
    const second = renderHook(() => useBandVerdicts());
    expect(ingest).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(60_000));
    expect(ingest).toHaveBeenCalledTimes(2);

    first.unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(ingest).toHaveBeenCalledTimes(3);

    second.unmount();
    const remounted = renderHook(() => useBandVerdicts());
    expect(ingest).toHaveBeenCalledTimes(4);

    remounted.unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(ingest).toHaveBeenCalledTimes(4);
  });

  it("stops presenting and ingesting retained activity after a refetch error", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T13:00:00.000Z"));
    let activityQuery = {
      data: new Map(),
      isError: false,
    };
    hookMocks.useBandActivity.mockImplementation(() => activityQuery);
    const ingest = vi
      .spyOn(useVerdictStore.getState(), "ingest")
      .mockImplementation(() => undefined);

    const hook = renderHook(() => useBandVerdicts());
    expect(hook.result.current.ready).toBe(true);
    expect(ingest).toHaveBeenCalledTimes(1);

    // A failed background fetch leaves the successful Map in React Query.
    // It must not keep the live headline or coordinator reader active.
    activityQuery = { ...activityQuery, isError: true };
    hook.rerender();
    expect(hook.result.current.ready).toBe(false);

    act(() => vi.advanceTimersByTime(60_000));
    expect(ingest).toHaveBeenCalledTimes(1);

    hook.unmount();
  });
});
