// @vitest-environment-options {"url":"https://propulse.test"}
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useBridge } from "./useBridge";
import { ingestWSJTXMessage } from "@/lib/radio/wsjtxIngestion";
import { useWSJTXStore } from "@/stores/wsjtxStore";
const initial = useWSJTXStore.getState();
afterEach(() => { cleanup(); useWSJTXStore.setState(initial); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const packet = (n: number) => JSON.stringify({ type: "wsjtx.decode", payload: { instanceId: "A", isNew: true, time: 50_000, snr: -10, deltaTime: 0.2, deltaFrequency: 1200, mode: "~", message: `CQ N${n}TEST EM38`, lowConfidence: false, dialFrequencyHz: 7_074_000, dialMode: "FT8" } });
class FakeSocket {
  static OPEN = 1; static CONNECTING = 0; static CLOSED = 3;
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  constructor() { FakeSocket.instances.push(this); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: "test", wasClean: true }); }
}
it("delivers an entire WebSocket burst before React batches lastMessage", async () => {
  FakeSocket.instances = []; vi.stubGlobal("WebSocket", FakeSocket);
  const { result } = renderHook(() => useBridge({ url: "wss://bridge.invalid", autoReconnect: false, pingInterval: 0, onMessage: ingestWSJTXMessage }));
  await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
  const socket = FakeSocket.instances[0];
  act(() => { socket.readyState = 1; socket.onopen?.(); for (let i = 0; i < 40; i++) socket.onmessage?.({ data: packet(i) }); });
  expect(useWSJTXStore.getState().decodes).toHaveLength(40);
  expect(result.current.lastMessage?.payload).toMatchObject({ message: "CQ N39TEST EM38" });
});
it("delivers an extension burst only from its active session", async () => {
  const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
  renderHook(() => useBridge({ url: "ws://127.0.0.1:9867", autoReconnect: false, pingInterval: 0, onMessage: ingestWSJTXMessage }));
  await waitFor(() => expect(post).toHaveBeenCalled());
  const connect = post.mock.calls.map(call => call[0]).find((value: { type?: string }) => value.type === "connect") as { sessionId: string };
  expect(connect).toBeTruthy();
  const emit = (data: Record<string, unknown>) => window.dispatchEvent(new MessageEvent("message", { source: window, data: { source: "propulse-daemon-bridge", sessionId: connect.sessionId, ...data } }));
  act(() => {
    emit({ type: "open" });
    emit({ type: "message", sessionId: "wrong-session", text: packet(99) });
    for (let i = 0; i < 40; i++) emit({ type: "message", text: packet(i) });
  });
  expect(useWSJTXStore.getState().decodes).toHaveLength(40);
});
