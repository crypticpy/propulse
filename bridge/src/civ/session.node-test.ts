import assert from "node:assert/strict";
import test from "node:test";
import { buildFrame, encodeBcdFrequency } from "./codec.js";
import {
  CivSession,
  COMMAND_TIMEOUT_MS,
  type CivSessionHandlers,
  type CivTransport,
} from "./session.js";
import { CivCmd, CIV_NG, CIV_OK } from "./types.js";

const RADIO = 0x94;
const CONTROLLER = 0xe0;

/** A frame from the radio back to the controller. */
function fromRadio(command: number, data?: number[] | Buffer): Buffer {
  const payload = Array.isArray(data) ? Buffer.from(data) : data;
  return buildFrame(CONTROLLER, RADIO, command, payload);
}

/** A frame from the controller to the radio (what the backend would send). */
function toRadio(command: number, data?: number[] | Buffer): Buffer {
  const payload = Array.isArray(data) ? Buffer.from(data) : data;
  return buildFrame(RADIO, CONTROLLER, command, payload);
}

/** Let the command queue's microtasks (and any pending I/O callbacks) run. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

class FakeTransport implements CivTransport {
  readonly logTag = "civ-test";
  ready = true;
  writeError: Error | null = null;
  readonly writes: Buffer[] = [];

  isReady(): boolean {
    return this.ready;
  }

  write(frame: Buffer, done: (err?: Error | null) => void): void {
    this.writes.push(Buffer.from(frame));
    done(this.writeError);
  }
}

interface ScopeHeaderEvent {
  kind: "header";
  scopeData: Buffer;
  scopeIndex: number;
  seqMax: number;
}
interface ScopePixelsEvent {
  kind: "pixels";
  scopeData: Buffer;
  seq: number;
  seqMax: number;
}
interface FrequencyEvent {
  kind: "frequency";
  hz: number;
}
interface ModeEvent {
  kind: "mode";
  mode: string;
}
type SessionEvent =
  ScopeHeaderEvent | ScopePixelsEvent | FrequencyEvent | ModeEvent;

interface Harness {
  session: CivSession;
  transport: FakeTransport;
  events: SessionEvent[];
  /** Deliver bytes from the radio, as the transport would. */
  receive(...frames: Buffer[]): void;
}

function harness(options: { spectrumEnabled?: boolean } = {}): Harness {
  const transport = new FakeTransport();
  const events: SessionEvent[] = [];
  const handlers: CivSessionHandlers = {
    isSpectrumEnabled: () => options.spectrumEnabled ?? false,
    onScopeHeader: (scopeData, scopeIndex, seqMax) =>
      events.push({ kind: "header", scopeData, scopeIndex, seqMax }),
    onScopePixels: (scopeData, seq, seqMax) =>
      events.push({ kind: "pixels", scopeData, seq, seqMax }),
    onUnsolicitedFrequency: (hz) => events.push({ kind: "frequency", hz }),
    onUnsolicitedMode: (mode) => events.push({ kind: "mode", mode }),
  };
  const session = new CivSession(transport, handlers);
  return {
    session,
    transport,
    events,
    receive: (...frames: Buffer[]) =>
      session.handleIncomingData(Buffer.concat(frames)),
  };
}

// ─── Command → response matching ──────────────────────────────────────────────

test("a data read resolves with the matching response frame", async () => {
  const h = harness();
  const pending = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  await tick();
  assert.equal(h.transport.writes.length, 1);

  h.receive(fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(14_074_000)));
  const frame = await pending;
  assert.ok(frame);
  assert.equal(frame.command, CivCmd.READ_FREQ);
});

test("a data read ignores a bare OK and waits for real data", async () => {
  const h = harness();
  const pending = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  await tick();

  h.receive(fromRadio(CIV_OK));
  h.receive(fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(7_074_000)));

  const frame = await pending;
  assert.ok(frame);
  assert.equal(frame.isOk, false);
  assert.equal(frame.command, CivCmd.READ_FREQ);
});

test("a data read fails fast on NG instead of waiting for the timeout", async () => {
  const h = harness();
  const started = Date.now();
  const pending = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  await tick();

  h.receive(fromRadio(CIV_NG));
  const frame = await pending;
  assert.ok(frame);
  assert.equal(frame.isNg, true);
  assert.ok(Date.now() - started < COMMAND_TIMEOUT_MS);
});

test("a sub-commanded read only matches its own sub-command", async () => {
  const h = harness();
  // Read AF level: cmd 0x14, sub 0x01.
  const pending = h.session.sendCommand(toRadio(CivCmd.LEVELS, [0x01]));
  await tick();

  // RF level (sub 0x02) is a different read and must not resolve it.
  h.receive(fromRadio(CivCmd.LEVELS, [0x02, 0x00, 0x99]));
  h.receive(fromRadio(CivCmd.LEVELS, [0x01, 0x00, 0x47]));

  const frame = await pending;
  assert.ok(frame);
  assert.equal(frame.subCommand, 0x01);
  assert.equal(frame.data[2], 0x47);
});

// ─── OK / NG handling ─────────────────────────────────────────────────────────

test("sendAndWaitOk resolves on OK", async () => {
  const h = harness();
  const pending = h.session.sendAndWaitOk(
    toRadio(CivCmd.SET_FREQ, encodeBcdFrequency(14_074_000)),
    "Set frequency",
  );
  await tick();
  h.receive(fromRadio(CIV_OK));
  await pending;
});

test("sendAndWaitOk resolves on an echoed command response", async () => {
  const h = harness();
  // Some radios echo the command instead of sending 0xFB.
  const pending = h.session.sendAndWaitOk(
    toRadio(CivCmd.SET_MODE, [0x01]),
    "Set mode",
  );
  await tick();
  h.receive(fromRadio(CivCmd.SET_MODE, [0x01]));
  await pending;
});

test("sendAndWaitOk rejects on NG", async () => {
  const h = harness();
  const pending = h.session.sendAndWaitOk(
    toRadio(CivCmd.SET_VFO, [0x00]),
    "Set VFO",
  );
  await tick();
  h.receive(fromRadio(CIV_NG));
  await assert.rejects(pending, /Set VFO rejected by radio/);
});

// ─── Timeouts ─────────────────────────────────────────────────────────────────

test("sendCommand resolves null when the radio never answers", async () => {
  const h = harness();
  const frame = await h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  assert.equal(frame, null);
});

test("sendAndWaitOk rejects with a timeout when the radio never answers", async () => {
  const h = harness();
  await assert.rejects(
    h.session.sendAndWaitOk(toRadio(CivCmd.PTT, [0x00, 0x01]), "Set PTT"),
    /Set PTT timed out/,
  );
});

test("a response that arrives after its command timed out is treated as unsolicited", async () => {
  const h = harness();
  const frame = await h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  assert.equal(frame, null);

  // The radio finally answers — nothing is pending, so it must not be swallowed.
  h.receive(fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(21_074_000)));
  assert.deepEqual(h.events, [{ kind: "frequency", hz: 21_074_000 }]);
});

// ─── Transport failures ───────────────────────────────────────────────────────

test("sendCommand resolves null without writing when the transport is not ready", async () => {
  const h = harness();
  h.transport.ready = false;
  const frame = await h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  assert.equal(frame, null);
  assert.equal(h.transport.writes.length, 0);
});

test("a write error resolves the command immediately", async () => {
  const h = harness();
  h.transport.writeError = new Error("port closed");
  const started = Date.now();
  const frame = await h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  assert.equal(frame, null);
  assert.ok(Date.now() - started < COMMAND_TIMEOUT_MS);
});

test("cancelPending fails the in-flight command", async () => {
  const h = harness();
  const pending = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  await tick();
  h.session.cancelPending();
  assert.equal(await pending, null);
});

// ─── Queue ordering ───────────────────────────────────────────────────────────

test("back-to-back sends stay half-duplex: one frame on the wire at a time", async () => {
  const h = harness();
  const first = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  const second = h.session.sendCommand(toRadio(CivCmd.READ_MODE));
  await tick();

  assert.equal(h.transport.writes.length, 1);
  assert.equal(h.transport.writes[0][4], CivCmd.READ_FREQ);

  h.receive(fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(14_074_000)));
  assert.ok(await first);
  await tick();

  assert.equal(h.transport.writes.length, 2);
  assert.equal(h.transport.writes[1][4], CivCmd.READ_MODE);

  h.receive(fromRadio(CivCmd.READ_MODE, [0x01, 0x01]));
  assert.ok(await second);
});

test("sendRaw takes its turn in the queue and reports write errors", async () => {
  const h = harness();
  const pending = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  const raw = h.session.sendRaw(toRadio(CivCmd.RIT_XIT, [0x00, 0x01]));
  await tick();

  assert.equal(h.transport.writes.length, 1, "raw write waits for the read");
  h.receive(fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(14_074_000)));
  await pending;
  await raw;
  assert.equal(h.transport.writes.length, 2);

  h.transport.writeError = new Error("socket closed");
  await assert.rejects(
    h.session.sendRaw(toRadio(CivCmd.RIT_XIT)),
    /socket closed/,
  );
});

// ─── Unsolicited frames ───────────────────────────────────────────────────────

test("front-panel frequency and mode changes reach the handlers", () => {
  const h = harness();
  // 0x00 / 0x01 are the transceive broadcasts; 0x03 / 0x04 are read echoes.
  h.receive(fromRadio(0x00, encodeBcdFrequency(18_100_000)));
  h.receive(fromRadio(0x01, [0x03, 0x01]));
  h.receive(fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(18_110_000)));
  h.receive(fromRadio(CivCmd.READ_MODE, [0x01, 0x01]));

  assert.deepEqual(h.events, [
    { kind: "frequency", hz: 18_100_000 },
    { kind: "mode", mode: "CW" },
    { kind: "frequency", hz: 18_110_000 },
    { kind: "mode", mode: "USB" },
  ]);
});

test("an unknown mode byte is dropped rather than reported", () => {
  const h = harness();
  h.receive(fromRadio(0x01, [0x7f, 0x01]));
  assert.deepEqual(h.events, []);
});

test("scope frames are split into header and pixel runs when the scope is on", () => {
  const h = harness({ spectrumEnabled: true });
  // data = [sub, scopeIndex, seq(BCD), seqMax(BCD), ...payload]
  h.receive(fromRadio(CivCmd.SCOPE_DATA, [0x00, 0x01, 0x01, 0x11, 0xaa]));
  h.receive(fromRadio(CivCmd.SCOPE_DATA, [0x00, 0x01, 0x02, 0x11, 0xbb]));

  assert.equal(h.events.length, 2);
  const header = h.events[0] as ScopeHeaderEvent;
  assert.equal(header.kind, "header");
  assert.equal(header.scopeIndex, 0x01);
  assert.equal(header.seqMax, 11);
  assert.equal(header.scopeData[0], 0x01, "sub-command byte is stripped");

  const pixels = h.events[1] as ScopePixelsEvent;
  assert.equal(pixels.kind, "pixels");
  assert.equal(pixels.seq, 2);
  assert.equal(pixels.seqMax, 11);
});

test("scope frames are ignored while the scope is off", () => {
  const h = harness({ spectrumEnabled: false });
  h.receive(fromRadio(CivCmd.SCOPE_DATA, [0x00, 0x01, 0x01, 0x11, 0xaa]));
  assert.deepEqual(h.events, []);
});

test("an unsolicited frame arriving mid-command does not steal the response", async () => {
  const h = harness();
  const pending = h.session.sendCommand(toRadio(CivCmd.READ_MODE));
  await tick();

  // A front-panel frequency change lands while a mode read is outstanding.
  h.receive(fromRadio(0x00, encodeBcdFrequency(50_313_000)));
  h.receive(fromRadio(CivCmd.READ_MODE, [0x05, 0x01]));

  const frame = await pending;
  assert.ok(frame);
  assert.equal(frame.command, CivCmd.READ_MODE);
  assert.deepEqual(h.events, [{ kind: "frequency", hz: 50_313_000 }]);
});

// ─── Framing ──────────────────────────────────────────────────────────────────

test("frames split across two reads are reassembled", async () => {
  const h = harness();
  const pending = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  await tick();

  const response = fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(14_074_000));
  h.session.handleIncomingData(response.subarray(0, 4));
  h.session.handleIncomingData(response.subarray(4));

  assert.ok(await pending);
});

test("resetParser drops a half-received frame", async () => {
  const h = harness({ spectrumEnabled: true });
  const response = fromRadio(0x00, encodeBcdFrequency(14_074_000));
  h.session.handleIncomingData(response.subarray(0, 4));
  h.session.resetParser();
  h.session.handleIncomingData(response.subarray(4));

  assert.deepEqual(h.events, []);
});
