import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { usePskStation } from "./usePskStation";
import { selectPskStationReports, pskStationState, type PskStationSnapshot } from "@/lib/hamclock/pskStation";

const now = Date.now();
const snapshot: PskStationSnapshot = {
  callsign: "N0TEST", status: "ok", fetchedAt: now, checkedAt: now,
  retryAt: now + 300_000, windowMinutes: 1440, limit: 1000, limited: false, discarded: 0,
  reports: [
    { senderCallsign: "N0TEST", receiverCallsign: "W1AW", senderLocator: "EM38", receiverLocator: "FN31", frequencyHz: 14_074_125, mode: "FT8", snr: -10, observedAt: now - 60_000 },
    { senderCallsign: "K2ABC", receiverCallsign: "N0TEST", senderLocator: null, receiverLocator: "EM38", frequencyHz: 7_074_000, mode: "FT8", snr: null, observedAt: now - 31 * 60_000 },
  ],
};
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

it("shares a canonical callsign query between mounted surfaces and never requests an invalid call", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(snapshot)));
  vi.stubGlobal("fetch", fetcher);
  const { client, wrapper } = setup();
  const first = renderHook(() => usePskStation(" n0test "), { wrapper });
  const second = renderHook(() => usePskStation("N0TEST"), { wrapper });
  const invalid = renderHook(() => usePskStation(""), { wrapper });
  await waitFor(() => expect(first.result.current.data?.status).toBe("ok"));
  expect(second.result.current.data).toEqual(snapshot);
  expect(invalid.result.current.callsign).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  first.unmount(); second.unmount(); invalid.unmount(); client.clear();
});

it("keeps unavailable as source state and rejects a mismatched callsign response", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...snapshot, status: "unavailable", fetchedAt: null, reports: [] }), { status: 502 })));
  const { client, wrapper } = setup();
  const hook = renderHook(() => usePskStation("N0TEST"), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.status).toBe("unavailable"));
  hook.unmount(); client.clear();
  const wrong = renderHook(() => usePskStation("W1AW"), { wrapper });
  await waitFor(() => expect(wrong.result.current.isError).toBe(true));
  wrong.unmount(); client.clear();
});

it("filters OF/BY and all windows using original observation time even when refresh fails", () => {
  expect(selectPskStationReports(snapshot, "of", 15, now)).toHaveLength(1);
  expect(selectPskStationReports(snapshot, "by", 30, now)).toHaveLength(0);
  expect(selectPskStationReports(snapshot, "by", 60, now)).toHaveLength(1);
  expect(selectPskStationReports(snapshot, "of", 360, now)).toHaveLength(1);
  expect(selectPskStationReports(snapshot, "of", 1440, now + 86_400_000)).toHaveLength(0);
  expect(pskStationState(snapshot, now)).toBe("UPDATED");
  expect(pskStationState(snapshot, now + 300_000)).toBe("STALE");
  expect(pskStationState({ ...snapshot, status: "stale" }, now)).toBe("STALE");
});
