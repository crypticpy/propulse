import { renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useFt8DecoderStore } from "@/stores/ft8DecoderStore";
import { useWSJTXStore, type WSJTXDecode } from "@/stores/wsjtxStore";
import type { WsjtxDecode } from "@/lib/radio/protocol";
import { useFt8SpotterData } from "./useFt8SpotterData";

const midnight = Date.parse("2026-09-07T00:00:00Z");
const native = (callsign: string, epochMs: number | undefined): WsjtxDecode => ({
  callsign, epochMs, time: epochMs == null ? 0 : epochMs % 86_400_000,
  isNew: true, mode: "FT8", grid: "FN31", snr: -5, deltaTime: 0.1,
  deltaFrequency: 500, message: `CQ ${callsign} FN31`, lowConfidence: false,
});
const bridge = (callsign: string, epochMs: number): WSJTXDecode => ({
  ...native(callsign, epochMs), mode: "~", receivedAt: epochMs + 2_000,
  dialFrequencyHz: 14_074_000, dialMode: "FT8",
});

afterEach(() => {
  useFt8DecoderStore.setState({ decodes: [] });
  useWSJTXStore.setState({ decodes: [], status: null });
});

it("merges absolute native and bridge times across midnight and keeps native-first cycle deduplication", () => {
  useFt8DecoderStore.setState({ decodes: [native("W1AW", midnight), native("K2ABC", midnight - 15_000)] });
  useWSJTXStore.setState({ decodes: [bridge("W1AW", midnight), bridge("K3ABC", midnight)], status: null });
  const { result } = renderHook(() => useFt8SpotterData());
  expect(result.current.allRecentDecodes.map(d => [d.callsign, d.source, d.time])).toEqual([
    ["W1AW", "native", midnight], ["K3ABC", "bridge", midnight], ["K2ABC", "native", midnight - 15_000],
  ]);
  expect(result.current.currentCycleDecodes.map(d => d.callsign)).toEqual(["W1AW", "K3ABC"]);
});

it("excludes native records without an absolute anchor and ages both sources against the same recent cutoff", () => {
  useFt8DecoderStore.setState({ decodes: [native("W1AW", midnight), native("K2ABC", midnight - 301_000), native("K4ABC", undefined)] });
  useWSJTXStore.setState({ decodes: [bridge("K3ABC", midnight - 301_000)] });
  const { result } = renderHook(() => useFt8SpotterData());
  expect(result.current.allRecentDecodes.map(d => d.callsign)).toEqual(["W1AW"]);
});
