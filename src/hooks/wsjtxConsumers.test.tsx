import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWSJTXStore, type WSJTXDecode } from "@/stores/wsjtxStore";
import { useBandMapSpots } from "./useBandMapSpots";
import { useFt8SpotterData } from "./useFt8SpotterData";
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [], isLoading: false, refetch: () => {} }) }));
vi.mock("@/hooks/useContestContext", () => ({ useContestContext: () => ({ activeContests: [], isContestWeekend: false }) }));
const initial = useWSJTXStore.getState();
afterEach(() => useWSJTXStore.setState(initial));
function seed() {
  const now = Date.now();
  const time = (now - 15_000) % 86_400_000;
  const decode: WSJTXDecode = { instanceId: "A", isNew: true, time, snr: -10, deltaTime: 0.2, deltaFrequency: 1234, mode: "~", message: "CQ N0TEST EM38", lowConfidence: false, receivedAt: now, callsign: "N0TEST", grid: "EM38", dialFrequencyHz: 7_074_000, dialMode: "FT8" };
  useWSJTXStore.setState({ connected: true, decodes: [decode, { ...decode, callsign: "N1TEST", isNew: false }], status: { instanceId: "B", frequency: 14_074_000, mode: "FT8", txEnabled: false, decoding: false, rxDF: 0, txDF: 0, lastUpdate: now } });
  return now - 15_000;
}
it("keeps a prior 40m decode on 40m after the latest status moves to 20m", () => {
  seed();
  const { result } = renderHook(() => useBandMapSpots("40m"));
  expect(result.current.spots).toHaveLength(1);
  expect(result.current.spots[0]).toMatchObject({ callsign: "N0TEST", frequency: 7075.234, mode: "FT8" });
  const other = renderHook(() => useBandMapSpots("20m"));
  expect(other.result.current.spots).toEqual([]);
});
it("converts QTime to the decode date and uses the captured mode in FT8 spotter data", () => {
  const observedAt = seed();
  const { result } = renderHook(() => useFt8SpotterData());
  expect(result.current.allRecentDecodes).toHaveLength(1);
  expect(result.current.allRecentDecodes[0]).toMatchObject({ callsign: "N0TEST", mode: "FT8", time: observedAt });
});
