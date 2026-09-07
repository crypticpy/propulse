import { afterEach, expect, it } from "vitest";
import { ingestWSJTXMessage, wsjtxDecodedAt, wsjtxFrequencyHz } from "./wsjtxIngestion";
import { useWSJTXStore } from "@/stores/wsjtxStore";
const initial = useWSJTXStore.getState();
afterEach(() => useWSJTXStore.setState(initial));
const payload = { instanceId: "A", isNew: true, time: 50_000, snr: -10, deltaTime: 0.2, deltaFrequency: 1234, mode: "~", message: "CQ N0TEST EM38", lowConfidence: false, callsign: "N0TEST", dialFrequencyHz: 7_074_000, dialMode: "FT8" };
it("ingests every decode in a burst and clears only the named instance", () => {
  for (let i = 0; i < 40; i++) ingestWSJTXMessage({ type: "wsjtx.decode", payload: { ...payload, message: `CQ N${i}TEST EM38` } });
  ingestWSJTXMessage({ type: "wsjtx.decode", payload: { ...payload, instanceId: "B", dialFrequencyHz: 14_074_000 } });
  expect(useWSJTXStore.getState().decodes).toHaveLength(41);
  ingestWSJTXMessage({ type: "wsjtx.clear", payload: { instanceId: "A" } });
  const remaining = useWSJTXStore.getState().decodes;
  expect(remaining).toHaveLength(1);
  expect(wsjtxFrequencyHz(remaining[0])).toBe(14_075_234);
  expect(useWSJTXStore.getState().decodeRate).toBe(1);
});
it("never uses a status frequency for missing or replayed dial metadata", () => {
  ingestWSJTXMessage({ type: "wsjtx.status", payload: { instanceId: "A", frequency: 21_074_000, mode: "FT8", txEnabled: false, decoding: true, rxDF: 1200, txDF: 1200 } });
  for (const change of [{ dialFrequencyHz: undefined }, { isNew: false }, { offAir: true }]) ingestWSJTXMessage({ type: "wsjtx.decode", payload: { ...payload, ...change } });
  expect(useWSJTXStore.getState().decodes.map(wsjtxFrequencyHz)).toEqual([null, null, null]);
  expect(useWSJTXStore.getState().decodeRate).toBe(1);
});
it("rejects malformed payloads and bounds retained decodes", () => {
  for (const invalid of [null, [], { ...payload, deltaFrequency: NaN }, { ...payload, time: -1 }, { ...payload, message: "x".repeat(1025) }, { ...payload, instanceId: [] }]) ingestWSJTXMessage({ type: "wsjtx.decode", payload: invalid });
  expect(useWSJTXStore.getState().decodes).toEqual([]);
  for (let i = 0; i < 501; i++) ingestWSJTXMessage({ type: "wsjtx.decode", payload });
  expect(useWSJTXStore.getState().decodes).toHaveLength(500);
});


it("resolves a just-before-midnight decode against its reception date without redating old packets", () => {
  ingestWSJTXMessage({ type: "wsjtx.decode", payload: { ...payload, time: 86_385_000, receivedAt: Date.parse("2026-08-31T00:00:02Z") } });
  const decode = useWSJTXStore.getState().decodes[0];
  expect(wsjtxDecodedAt(decode)).toBe(Date.parse("2026-08-30T23:59:45Z"));
  expect(decode.receivedAt).toBe(Date.parse("2026-08-31T00:00:02Z"));
});
