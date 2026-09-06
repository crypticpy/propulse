import { afterEach, expect, it } from "vitest";
import { useWSJTXStore, type WSJTXDecode } from "./wsjtxStore";
const initial = useWSJTXStore.getState();
afterEach(() => useWSJTXStore.setState(initial));
const decode: WSJTXDecode = { isNew: true, time: 50_000, snr: -10, deltaTime: 0.2, deltaFrequency: 1234, mode: "~", message: "CQ N0TEST EM38", lowConfidence: false, receivedAt: Date.now(), instanceId: "A", dialFrequencyHz: 7_074_000, dialMode: "FT8" };
it("filters each decode by its captured band even after the current instance changes bands", () => {
  const store = useWSJTXStore.getState();
  store.addDecode(decode);
  store.addDecode({ ...decode, instanceId: "B", dialFrequencyHz: 14_074_000 });
  store.setStatus({ instanceId: "A", frequency: 21_074_000, mode: "FT8", txEnabled: false, decoding: false, rxDF: 1234, txDF: 1234, lastUpdate: Date.now() });
  expect(store.getDecodesByBand("40m")).toEqual([decode]);
  expect(store.getDecodesByBand("20m")).toHaveLength(1);
  expect(store.getDecodesByBand("15m")).toEqual([]);
});
it("does not assign replay, off-air or unknown-context decodes to a live band", () => {
  const store = useWSJTXStore.getState();
  store.addDecode({ ...decode, dialFrequencyHz: undefined });
  store.addDecode({ ...decode, isNew: false });
  store.addDecode({ ...decode, offAir: true });
  expect(store.getDecodesByBand("40m")).toEqual([]);
});
