import assert from "node:assert/strict";
import test from "node:test";
import { buildFrame, encodeBcdFrequency } from "./codec.js";
import {
  ASSEMBLY_TIMEOUT_MS,
  CivSession,
  COMMAND_TIMEOUT_MS,
  type CivSessionHandlers,
  type CivTransport,
} from "./session.js";
import {
  CivCmd,
  CIV_NG,
  CIV_OK,
  CIV_SCOPE_SUB,
  ScopeMode,
  type CivSpectrumLine,
} from "./types.js";

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

/** Wait out a real timer (the session uses real timeouts, not fake ones). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** CI-V counts sequences in BCD: 11 travels as 0x11. */
function bcd(value: number): number {
  return Math.floor(value / 10) * 16 + (value % 10);
}

/**
 * The first frame of a scope sweep. After the sub-command byte the radio sends
 * scope index, sequence, max sequence, scope mode, the two 5-byte BCD band
 * edges, one reserved byte, then the first pixel run.
 */
function scopeHeader(options: {
  seqMax: number;
  startHz: number;
  endHz: number;
  pixels?: number[];
  scopeMode?: ScopeMode;
  scopeIndex?: number;
}): Buffer {
  return fromRadio(
    CivCmd.SCOPE_DATA,
    Buffer.concat([
      Buffer.from([
        CIV_SCOPE_SUB.WAVE_DATA,
        options.scopeIndex ?? 0x01,
        bcd(1),
        bcd(options.seqMax),
        options.scopeMode ?? ScopeMode.Fixed,
      ]),
      encodeBcdFrequency(options.startHz),
      encodeBcdFrequency(options.endHz),
      Buffer.from([0x00]), // reserved byte the assembler skips
      Buffer.from(options.pixels ?? []),
    ]),
  );
}

/** A continuation frame of a scope sweep: header fields, then pixels. */
function scopePixels(
  seq: number,
  seqMax: number,
  pixels: number[],
  scopeIndex = 0x01,
): Buffer {
  return fromRadio(
    CivCmd.SCOPE_DATA,
    Buffer.concat([
      Buffer.from([CIV_SCOPE_SUB.WAVE_DATA, scopeIndex, bcd(seq), bcd(seqMax)]),
      Buffer.from(pixels),
    ]),
  );
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

interface SpectrumLineEvent {
  kind: "line";
  line: CivSpectrumLine;
}
interface FrequencyEvent {
  kind: "frequency";
  hz: number;
}
interface ModeEvent {
  kind: "mode";
  mode: string;
}
type SessionEvent = SpectrumLineEvent | FrequencyEvent | ModeEvent;

interface Harness {
  session: CivSession;
  transport: FakeTransport;
  events: SessionEvent[];
  /** Deliver bytes from the radio, as the transport would. */
  receive(...frames: Buffer[]): void;
  /** Just the assembled spectrum lines, in order. */
  lines(): CivSpectrumLine[];
}

function harness(options: { spectrumEnabled?: boolean } = {}): Harness {
  const transport = new FakeTransport();
  const events: SessionEvent[] = [];
  const handlers: CivSessionHandlers = {
    onSpectrumLine: (line) => events.push({ kind: "line", line }),
    onUnsolicitedFrequency: (hz) => events.push({ kind: "frequency", hz }),
    onUnsolicitedMode: (mode) => events.push({ kind: "mode", mode }),
  };
  const session = new CivSession(transport, handlers);
  if (options.spectrumEnabled) session.setSpectrumEnabled(true);
  return {
    session,
    transport,
    events,
    receive: (...frames: Buffer[]) =>
      session.handleIncomingData(Buffer.concat(frames)),
    lines: () =>
      events
        .filter((event): event is SpectrumLineEvent => event.kind === "line")
        .map((event) => event.line),
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

// ─── Timer cleanup ────────────────────────────────────────────────────────────

test("a matching response clears the pending command's timeout timer", async (t) => {
  const h = harness();
  const setTimeoutSpy = t.mock.method(globalThis, "setTimeout");
  const clearTimeoutSpy = t.mock.method(globalThis, "clearTimeout");

  const pending = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  await tick();

  assert.equal(setTimeoutSpy.mock.calls.length, 1);
  const timerHandle = setTimeoutSpy.mock.calls[0].result;

  h.receive(fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(14_074_000)));
  const frame = await pending;
  assert.ok(frame);

  const clearedHandles = clearTimeoutSpy.mock.calls.map((c) => c.arguments[0]);
  assert.ok(
    clearedHandles.includes(timerHandle),
    "expected clearTimeout to be called with the resolved command's timer",
  );

  // The queue must still be healthy afterward: nothing left dangling.
  const next = h.session.sendCommand(toRadio(CivCmd.READ_MODE));
  await tick();
  h.receive(fromRadio(CivCmd.READ_MODE, [0x01, 0x01]));
  assert.ok(await next);
});

test("cancelPending clears the pending command's timeout timer", async (t) => {
  const h = harness();
  const setTimeoutSpy = t.mock.method(globalThis, "setTimeout");
  const clearTimeoutSpy = t.mock.method(globalThis, "clearTimeout");

  const pending = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  await tick();

  assert.equal(setTimeoutSpy.mock.calls.length, 1);
  const timerHandle = setTimeoutSpy.mock.calls[0].result;

  h.session.cancelPending();
  assert.equal(await pending, null);

  const clearedHandles = clearTimeoutSpy.mock.calls.map((c) => c.arguments[0]);
  assert.ok(
    clearedHandles.includes(timerHandle),
    "expected cancelPending to clear the pending command's timer",
  );

  // The queue must still accept and resolve the next command normally.
  const next = h.session.sendCommand(toRadio(CivCmd.READ_MODE));
  await tick();
  h.receive(fromRadio(CivCmd.READ_MODE, [0x01, 0x01]));
  assert.ok(await next);
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

test("write is called exactly once per sendCommand, in order, and cancelling adds no write", async () => {
  const h = harness();

  const first = h.session.sendCommand(toRadio(CivCmd.READ_FREQ));
  const second = h.session.sendCommand(toRadio(CivCmd.READ_MODE));
  await tick();

  assert.equal(h.transport.writes.length, 1, "second write waits its turn");
  assert.equal(h.transport.writes[0][4], CivCmd.READ_FREQ);

  h.receive(fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(14_074_000)));
  assert.ok(await first);
  await tick();

  assert.equal(h.transport.writes.length, 2);
  assert.equal(h.transport.writes[1][4], CivCmd.READ_MODE);

  // Cancel the (now in-flight) second command instead of answering it.
  h.session.cancelPending();
  assert.equal(await second, null);
  await tick();

  assert.equal(
    h.transport.writes.length,
    2,
    "cancelling a pending command must not produce an additional write",
  );
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

test("scope frames are ignored while the scope is off", () => {
  const h = harness({ spectrumEnabled: false });
  h.receive(
    scopeHeader({ seqMax: 2, startHz: 14_000_000, endHz: 14_100_000 }),
    scopePixels(2, 2, [1, 2, 3]),
  );
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

// ─── Scope assembly ───────────────────────────────────────────────────────────

test("a sweep assembles into one line across its header and pixel frames", () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(
    scopeHeader({ seqMax: 3, startHz: 14_000_000, endHz: 14_100_000 }),
    scopePixels(2, 3, [3, 4]),
    scopePixels(3, 3, [5, 6]),
  );

  assert.equal(h.events.length, 1, "one line, not one event per frame");
  const [line] = h.lines();
  assert.equal(line.centerHz, 14_050_000);
  assert.equal(line.spanHz, 100_000);
  assert.deepEqual(Array.from(line.pixels), [3, 4, 5, 6]);
  assert.equal(line.scopeMode, ScopeMode.Fixed);
  assert.equal(line.scopeIndex, 0x01);
});

test("a multi-frame header contributes no pixels of its own", () => {
  const h = harness({ spectrumEnabled: true });
  // Only a seqMax-of-1 header carries pixels; in a run the pixel frames do.
  h.receive(
    scopeHeader({
      seqMax: 2,
      startHz: 14_000_000,
      endHz: 14_100_000,
      pixels: [1, 2],
    }),
    scopePixels(2, 2, [3, 4]),
  );

  const [line] = h.lines();
  assert.deepEqual(Array.from(line.pixels), [3, 4]);
});

test("a single-frame sweep emits from the header alone", () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(
    scopeHeader({
      seqMax: 1,
      startHz: 7_000_000,
      endHz: 7_200_000,
      pixels: [10, 20, 30],
    }),
  );

  const [line] = h.lines();
  assert.equal(line.centerHz, 7_100_000);
  assert.equal(line.spanHz, 200_000);
  assert.deepEqual(Array.from(line.pixels), [10, 20, 30]);
});

test("centre mode reads the edges as centre and half-span", () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(
    scopeHeader({
      seqMax: 1,
      scopeMode: ScopeMode.Center,
      startHz: 14_074_000,
      endHz: 25_000,
      pixels: [7],
    }),
  );

  const [line] = h.lines();
  assert.equal(line.centerHz, 14_074_000);
  assert.equal(line.spanHz, 50_000);
});

test("a sweep with no span is dropped", () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(
    scopeHeader({
      seqMax: 1,
      startHz: 14_000_000,
      endHz: 14_000_000,
      pixels: [1, 2],
    }),
  );
  assert.deepEqual(h.events, []);
});

test("a header too short to carry the band edges is dropped", () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(fromRadio(CivCmd.SCOPE_DATA, [0x00, 0x01, 0x01, 0x03, 0x01]));
  h.receive(scopePixels(2, 3, [1, 2]));
  assert.deepEqual(h.events, []);
});

test("an out-of-order pixel frame drops the partial line", () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(
    scopeHeader({ seqMax: 3, startHz: 14_000_000, endHz: 14_100_000 }),
    scopePixels(3, 3, [5, 6]), // sequence 2 never arrived
    scopePixels(2, 3, [3, 4]), // too late: the assembly is gone
  );
  assert.deepEqual(h.events, [], "no line is emitted from a gapped sweep");

  // The next sweep still assembles.
  h.receive(
    scopeHeader({ seqMax: 2, startHz: 21_000_000, endHz: 21_100_000 }),
    scopePixels(2, 2, [2]),
  );
  assert.equal(h.lines().length, 1);
});

test("a sweep that stalls mid-run is discarded after the assembly timeout", async () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(scopeHeader({ seqMax: 3, startHz: 14_000_000, endHz: 14_100_000 }));

  await delay(ASSEMBLY_TIMEOUT_MS + 50);

  // The rest of the sweep finally turns up; the partial line is long gone.
  h.receive(scopePixels(2, 3, [3, 4]), scopePixels(3, 3, [5, 6]));
  assert.deepEqual(h.events, []);
});

test("disabling the scope mid-assembly drops the partial line", () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(scopeHeader({ seqMax: 3, startHz: 14_000_000, endHz: 14_100_000 }));

  h.session.setSpectrumEnabled(false);
  h.receive(scopePixels(2, 3, [3, 4]), scopePixels(3, 3, [5, 6]));
  assert.deepEqual(h.events, [], "frames after the stop are dropped");

  // Re-enabling must not resurrect the half-built line.
  h.session.setSpectrumEnabled(true);
  h.receive(scopePixels(2, 3, [3, 4]), scopePixels(3, 3, [5, 6]));
  assert.deepEqual(h.events, []);
});

test("resetSpectrum drops scope state when the link closes", () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(scopeHeader({ seqMax: 2, startHz: 14_000_000, endHz: 14_100_000 }));

  h.session.resetSpectrum();
  h.receive(scopePixels(2, 2, [2]));
  assert.deepEqual(h.events, []);
});

test("a second header before the first completes starts a fresh line", () => {
  const h = harness({ spectrumEnabled: true });
  h.receive(
    scopeHeader({
      seqMax: 3,
      startHz: 14_000_000,
      endHz: 14_100_000,
      pixels: [1, 2],
    }),
    // The radio restarts the sweep: a new header, a shorter run.
    scopeHeader({ seqMax: 2, startHz: 21_000_000, endHz: 21_200_000 }),
    scopePixels(2, 2, [8]),
  );

  assert.equal(h.events.length, 1);
  const [line] = h.lines();
  assert.equal(line.centerHz, 21_100_000, "the second header's edges win");
  assert.deepEqual(
    Array.from(line.pixels),
    [8],
    "the abandoned sweep contributes no pixels",
  );
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
