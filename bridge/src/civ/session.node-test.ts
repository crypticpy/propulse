import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFrame,
  encodeBcdFrequency,
  encodeBcdLevel,
  encodeBcdOffset,
} from "./codec.js";
import {
  ASSEMBLY_TIMEOUT_MS,
  CivSession,
  COMMAND_TIMEOUT_MS,
  OPTIONAL_POLL_INTERVAL_CYCLES,
  type CivSessionHandlers,
  type CivTransport,
} from "./session.js";
import {
  CivCmd,
  CIV_FUNC_SUB,
  CIV_LEVEL_SUB,
  CIV_METER_SUB,
  CIV_NG,
  CIV_OK,
  CIV_SCOPE_SUB,
  rawSmeterToDbm,
  ScopeMode,
  type CivAddress,
  type CivSpectrumLine,
} from "./types.js";
import type { RigStatus } from "../types.js";

const RADIO = 0x94;
const CONTROLLER = 0xe0;
const ADDR: CivAddress = { radio: RADIO, controller: CONTROLLER };

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
        options.scopeIndex ?? 0x00,
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
  reply: ((frame: Buffer) => void) | null = null;

  isReady(): boolean {
    return this.ready;
  }

  write(frame: Buffer, done: (err?: Error | null) => void): void {
    this.writes.push(Buffer.from(frame));
    done(this.writeError);
    if (!this.writeError) this.reply?.(frame);
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
  const session = new CivSession(transport, handlers, ADDR);
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
  assert.equal(line.scopeIndex, 0x00);
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

// ─── Polling ─────────────────────────────────────────────────────────────────

interface RadioState {
  frequencyHz: number;
  modeByte: number;
  ptt: boolean;
  smeterRaw: number;
  split: boolean;
  ritEnabled: boolean;
  ritOffsetHz: number;
  xitEnabled: boolean;
  anf: boolean;
  qsk: boolean;
  vox: boolean;
  agcMode: number;
  cwSpeed: number;
  ifShiftRaw: number;
  powerRaw: number;
  swrRaw: number;
  alcRaw: number;
  silent: Set<string>;
}

function defaultRadio(overrides: Partial<RadioState> = {}): RadioState {
  return {
    frequencyHz: 14_074_000,
    modeByte: 0x01, // USB
    ptt: false,
    smeterRaw: 120,
    split: false,
    ritEnabled: false,
    ritOffsetHz: 0,
    xitEnabled: false,
    anf: false,
    qsk: false,
    vox: false,
    agcMode: 2,
    cwSpeed: 20,
    ifShiftRaw: 128,
    powerRaw: 0,
    swrRaw: 0,
    alcRaw: 0,
    silent: new Set<string>(),
    ...overrides,
  };
}

function cmdSubKey(cmd: number, sub?: number): string {
  return sub === undefined ? `${cmd}` : `${cmd}:${sub}`;
}

function meterFrame(sub: number, raw: number): Buffer {
  return fromRadio(
    CivCmd.METERS,
    Buffer.concat([Buffer.from([sub]), encodeBcdLevel(raw)]),
  );
}

function replyTo(request: Buffer, radio: RadioState): Buffer | null {
  const cmd = request[4];
  const sub = request.length > 6 ? request[5] : undefined;
  if (radio.silent.has(cmdSubKey(cmd, sub))) return null;

  switch (cmd) {
    case CivCmd.READ_FREQ:
      return fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(radio.frequencyHz));
    case CivCmd.READ_MODE:
      return fromRadio(CivCmd.READ_MODE, [radio.modeByte, 0x01]);
    case CivCmd.PTT:
      return fromRadio(CivCmd.PTT, [0x00, radio.ptt ? 0x01 : 0x00]);
    case CivCmd.SPLIT:
      return fromRadio(CivCmd.SPLIT, [radio.split ? 0x01 : 0x00]);
    case CivCmd.METERS: {
      if (sub === CIV_METER_SUB.SMETER)
        return meterFrame(sub, radio.smeterRaw);
      if (sub === CIV_METER_SUB.RFPOWER)
        return meterFrame(sub, radio.powerRaw);
      if (sub === CIV_METER_SUB.SWR) return meterFrame(sub, radio.swrRaw);
      if (sub === CIV_METER_SUB.ALC)
        return meterFrame(sub, radio.alcRaw);
      return null;
    }
    case CivCmd.RIT_XIT: {
      if (sub === 0x01)
        return fromRadio(CivCmd.RIT_XIT, [
          0x01,
          radio.ritEnabled ? 0x01 : 0x00,
        ]);
      if (sub === 0x02)
        return fromRadio(CivCmd.RIT_XIT, [
          0x02,
          radio.xitEnabled ? 0x01 : 0x00,
        ]);
      if (sub === 0x03)
        return fromRadio(
          CivCmd.RIT_XIT,
          Buffer.concat([Buffer.from([0x03]), encodeBcdOffset(radio.ritOffsetHz)]),
        );
      return null;
    }
    case CivCmd.FUNCTIONS: {
      if (sub === CIV_FUNC_SUB.ANF)
        return fromRadio(CivCmd.FUNCTIONS, [sub, radio.anf ? 0x01 : 0x00]);
      if (sub === CIV_FUNC_SUB.BKIN)
        return fromRadio(CivCmd.FUNCTIONS, [sub, radio.qsk ? 0x01 : 0x00]);
      if (sub === CIV_FUNC_SUB.VOX)
        return fromRadio(CivCmd.FUNCTIONS, [sub, radio.vox ? 0x01 : 0x00]);
      if (sub === CIV_FUNC_SUB.AGC)
        return fromRadio(CivCmd.FUNCTIONS, [sub, radio.agcMode]);
      return null;
    }
    case CivCmd.LEVELS: {
      if (sub === CIV_LEVEL_SUB.KEYSPD)
        return fromRadio(
          CivCmd.LEVELS,
          Buffer.concat([Buffer.from([sub]), encodeBcdLevel(radio.cwSpeed)]),
        );
      if (sub === CIV_LEVEL_SUB.IF_SHIFT)
        return fromRadio(
          CivCmd.LEVELS,
          Buffer.concat([
            Buffer.from([sub]),
            encodeBcdLevel(radio.ifShiftRaw),
          ]),
        );
      return null;
    }
    default:
      return null;
  }
}

function isWrite(cmd: number, sub?: number) {
  return (frame: Buffer) => {
    if (frame[4] !== cmd) return false;
    if (sub === undefined) return true;
    return frame.length > 6 && frame[5] === sub;
  };
}

interface PollHarness {
  session: CivSession;
  transport: FakeTransport;
  radio: RadioState;
  statuses: RigStatus[];
  smeters: number[];
  events: SessionEvent[];
}

function pollHarness(radio: RadioState = defaultRadio()): PollHarness {
  const transport = new FakeTransport();
  const statuses: RigStatus[] = [];
  const smeters: number[] = [];
  const events: SessionEvent[] = [];
  const session = new CivSession(
    transport,
    {
      onSpectrumLine: () => undefined,
      onUnsolicitedFrequency: (hz) => events.push({ kind: "frequency", hz }),
      onUnsolicitedMode: (mode) => events.push({ kind: "mode", mode }),
      onStatus: (status) => {
        statuses.push(status);
      },
      onSmeter: (dbm) => smeters.push(dbm),
    },
    ADDR,
  );
  transport.reply = (frame) => {
    const response = replyTo(frame, radio);
    if (response) session.handleIncomingData(response);
  };
  return { session, transport, radio, statuses, smeters, events };
}

test("the first poll cycle emits frequency, mode, and optional fields", async () => {
  const h = pollHarness();
  await h.session.pollNow();

  assert.equal(h.statuses.length, 1);
  const status = h.statuses[0];
  assert.equal(status.connected, true);
  assert.equal(status.frequency, 14_074_000);
  assert.equal(status.mode, "USB");
  assert.equal(status.ptt, false);
  assert.equal(status.split, false);
  assert.equal(status.rit?.enabled, false);
  assert.equal(status.rit?.offsetHz, 0);
  assert.equal(status.xit?.enabled, false);
  assert.equal(status.anf, false);
  assert.equal(status.qsk, false);
  assert.equal(status.vox, false);
  assert.equal(status.agcMode, 2);
  assert.equal(status.cwSpeed, 20);
  assert.equal(status.ifShift, Math.round((128 / 255) * 2400 - 1200));
  assert.equal(h.smeters.length, 1);
  assert.equal(h.smeters[0], rawSmeterToDbm(120));
  assert.equal(h.session.getLastStatus(), status);
});

test("an unchanged second poll does not re-emit status or S-meter", async () => {
  const h = pollHarness();
  await h.session.pollNow();
  await h.session.pollNow();
  assert.equal(h.statuses.length, 1);
  assert.equal(h.smeters.length, 1);
});

test("an S-meter-only change emits S-meter but not status", async () => {
  const h = pollHarness();
  await h.session.pollNow();
  h.radio.smeterRaw = 80;
  await h.session.pollNow();
  assert.equal(h.statuses.length, 1);
  assert.deepEqual(h.smeters, [rawSmeterToDbm(120), rawSmeterToDbm(80)]);
});

test("a frequency change on the next poll emits a new status", async () => {
  const h = pollHarness();
  await h.session.pollNow();
  h.radio.frequencyHz = 7_074_000;
  await h.session.pollNow();
  assert.equal(h.statuses.length, 2);
  assert.equal(h.statuses[1].frequency, 7_074_000);
  assert.equal(h.statuses[1].mode, "USB");
});

test("unsolicited frequency before the first poll does not emit status", async () => {
  const h = pollHarness();
  h.session.handleIncomingData(
    fromRadio(CivCmd.READ_FREQ, encodeBcdFrequency(21_074_000)),
  );
  assert.deepEqual(h.events, [{ kind: "frequency", hz: 21_074_000 }]);
  assert.equal(h.statuses.length, 0);
  assert.equal(h.session.getLastStatus(), null);
});

test("unsolicited frequency after a poll updates lastStatus and emits status", async () => {
  const h = pollHarness();
  await h.session.pollNow();
  h.session.handleIncomingData(
    fromRadio(0x00, encodeBcdFrequency(21_074_000)),
  );
  assert.equal(h.statuses.length, 2);
  assert.equal(h.statuses[1].frequency, 21_074_000);
  assert.equal(h.session.getLastStatus()?.frequency, 21_074_000);
});

test("PTT on brings TX meters into the status snapshot", async () => {
  const h = pollHarness(defaultRadio({ ptt: true, powerRaw: 120 }));
  await h.session.pollNow();
  assert.equal(h.statuses[0].ptt, true);
  assert.ok(h.statuses[0].txMeter);
  assert.equal(h.statuses[0].txMeter?.powerW, (120 / 241) * 100);
  assert.ok(
    h.transport.writes.some(isWrite(CivCmd.METERS, CIV_METER_SUB.RFPOWER)),
  );
  assert.ok(
    h.transport.writes.some(isWrite(CivCmd.METERS, CIV_METER_SUB.SWR)),
  );
});

test("optional fields are skipped on cycles that are not the interval", async () => {
  const h = pollHarness();
  await h.session.pollNow();
  h.transport.writes.length = 0;
  await h.session.pollNow();
  assert.equal(
    h.transport.writes.some(isWrite(CivCmd.RIT_XIT, 0x01)),
    false,
  );
  assert.equal(
    h.transport.writes.some(isWrite(CivCmd.FUNCTIONS, CIV_FUNC_SUB.ANF)),
    false,
  );
});

test("a timed-out optional field is not polled again", async () => {
  const h = pollHarness(
    defaultRadio({ silent: new Set([cmdSubKey(CivCmd.RIT_XIT, 0x01)]) }),
  );
  await h.session.pollNow();
  assert.ok(h.transport.writes.some(isWrite(CivCmd.RIT_XIT, 0x01)));
  assert.equal(h.statuses[0].rit, undefined);

  for (let i = 0; i < OPTIONAL_POLL_INTERVAL_CYCLES - 2; i++) {
    await h.session.pollNow();
  }
  h.transport.writes.length = 0;
  await h.session.pollNow();
  assert.equal(
    h.transport.writes.some(isWrite(CivCmd.RIT_XIT, 0x01)),
    false,
  );
});

test("pollNow is a no-op when the transport is not ready", async () => {
  const h = pollHarness();
  h.transport.ready = false;
  await h.session.pollNow();
  assert.equal(h.statuses.length, 0);
  assert.equal(h.transport.writes.length, 0);
});

test("startPolling runs immediately and stopPolling cancels the timer", async () => {
  const h = pollHarness();
  h.session.startPolling(40);
  await delay(20);
  assert.equal(h.statuses.length, 1);
  h.session.stopPolling();
  await delay(80);
  assert.equal(h.statuses.length, 1);
});

test("resetPollState drops lastStatus so the next poll emits again", async () => {
  const h = pollHarness();
  await h.session.pollNow();
  h.session.resetPollState();
  assert.equal(h.session.getLastStatus(), null);
  await h.session.pollNow();
  assert.equal(h.statuses.length, 2);
});

// ─── Rig control ────────────────────────────────────────────────────────────

function ackWrites(h: { session: CivSession; transport: FakeTransport }): void {
  h.transport.reply = () => {
    h.session.handleIncomingData(fromRadio(CIV_OK));
  };
}

test("setFrequency sends the set-freq frame and waits for OK", async () => {
  const h = harness();
  ackWrites(h);
  await h.session.setFrequency(14_074_000);
  assert.equal(h.transport.writes.length, 1);
  assert.equal(h.transport.writes[0][4], CivCmd.SET_FREQ);
});

test("setPTT, setVFO, setSplit, setAgc, setFunc and setLevel wait for OK", async () => {
  const h = harness();
  ackWrites(h);
  await h.session.setPTT(true);
  await h.session.setVFO("B");
  await h.session.setSplit(true);
  await h.session.setAgc(2);
  await h.session.setFunc("NB", true);
  await h.session.setLevel("AF", 64);
  assert.equal(h.transport.writes.length, 6);
});

test("getLevel returns 0 when the radio does not answer", async () => {
  const h = harness();
  assert.equal(await h.session.getLevel("AF"), 0);
});

test("getFunc returns false when the radio does not answer", async () => {
  const h = harness();
  assert.equal(await h.session.getFunc("NB"), false);
});

test("setPassband is a no-op until a poll has populated the current mode", async () => {
  const h = harness();
  ackWrites(h);
  await h.session.setPassband(2400);
  assert.equal(h.transport.writes.length, 0);
});

test("setPassband maps USB widths onto FIL1–3 and re-sends the current mode", async () => {
  const h = pollHarness();
  await h.session.pollNow();
  ackWrites(h);
  h.transport.writes.length = 0;

  await h.session.setPassband(2400);
  assert.equal(h.transport.writes[0][4], CivCmd.SET_MODE);
  assert.equal(h.transport.writes[0][5], 0x01); // USB
  assert.equal(h.transport.writes[0][6], 1);

  h.transport.writes.length = 0;
  await h.session.setPassband(1500);
  assert.equal(h.transport.writes[0][6], 2);

  h.transport.writes.length = 0;
  await h.session.setPassband(500);
  assert.equal(h.transport.writes[0][6], 3);
});

test("setPassband uses the CW/RTTY filter breakpoints", async () => {
  const h = pollHarness(defaultRadio({ modeByte: 0x03 })); // CW
  await h.session.pollNow();
  ackWrites(h);
  h.transport.writes.length = 0;

  await h.session.setPassband(500);
  assert.equal(h.transport.writes[0][5], 0x03); // CW
  assert.equal(h.transport.writes[0][6], 1);

  h.transport.writes.length = 0;
  await h.session.setPassband(200);
  assert.equal(h.transport.writes[0][6], 2);

  h.transport.writes.length = 0;
  await h.session.setPassband(50);
  assert.equal(h.transport.writes[0][6], 3);
});

test("setAntenna ignores a non-numeric index", async () => {
  const h = harness();
  ackWrites(h);
  await h.session.setAntenna("rear");
  assert.equal(h.transport.writes.length, 0);
});

test("setRit and setXit write without waiting for an ACK", async () => {
  const h = harness();
  await h.session.setRit(true, 100);
  await h.session.setXit(false);
  assert.equal(h.transport.writes.length, 2);
  assert.equal(h.transport.writes[0][4], CivCmd.RIT_XIT);
  assert.equal(h.transport.writes[1][4], CivCmd.RIT_XIT);
});

test("startSpectrum enables assembly and sends scope on then data-output on", async () => {
  const h = harness();
  ackWrites(h);
  await h.session.startSpectrum();
  assert.equal(h.transport.writes.length, 2);
  assert.equal(h.transport.writes[0][4], CivCmd.SCOPE_CTRL);
  assert.equal(h.transport.writes[0][5], CIV_SCOPE_SUB.ON);
  assert.equal(h.transport.writes[1][5], CIV_SCOPE_SUB.DATA_OUTPUT);
});

test("startSpectrum rethrows when the radio rejects the scope-on command", async () => {
  const h = harness();
  h.transport.reply = () => {
    h.session.handleIncomingData(fromRadio(CIV_NG));
  };
  await assert.rejects(h.session.startSpectrum(), /Enable scope display rejected/);
});

test("stopSpectrum disables assembly and sends data-output off then scope off", async () => {
  const h = harness({ spectrumEnabled: true });
  ackWrites(h);
  await h.session.stopSpectrum();
  assert.equal(h.transport.writes.length, 2);
  assert.equal(h.transport.writes[0][5], CIV_SCOPE_SUB.DATA_OUTPUT);
  assert.equal(h.transport.writes[1][5], CIV_SCOPE_SUB.ON);
});
