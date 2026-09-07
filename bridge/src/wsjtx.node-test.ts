import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { WSJTXListener } from "./wsjtx.js";
import type { WSJTXDecode } from "./types.js";

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u64 = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; };
const f64 = (n: number) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b; };
const str = (s: string) => { const b = Buffer.from(s); return Buffer.concat([u32(b.length), b]); };
const bool = (v: boolean) => Buffer.from([v ? 1 : 0]);
const header = (type: number, id: string) => Buffer.concat([u32(0xadbccbda), u32(2), u32(type), str(id)]);
const status = (id: string, frequency: number, mode = "FT8") => Buffer.concat([
  header(1, id), u64(frequency), str(mode), str(""), str(""), str(mode), bool(false), bool(false), bool(true), u32(1200), u32(1200), str("N0TEST"), str("EM38"), str(""),
]);
const decode = (id: string, isNew = true, offAir = false) => Buffer.concat([
  header(2, id), bool(isNew), u32(50_000), u32(0xfffffff6), f64(0.2), u32(1234), str("~"), str("CQ N0TEST EM38"), bool(false), bool(offAir),
]);
function fixture() {
  const listener = new WSJTXListener();
  const decodes: WSJTXDecode[] = [];
  listener.onDecode(value => decodes.push(value));
  // Exercise the actual datagram parser without opening a UDP socket.
  const send = (data: Buffer) => (listener as unknown as { handleDatagram(data: Buffer): void }).handleDatagram(data);
  return { listener, decodes, send };
}

test("captures dial context per instance and preserves previous decodes after retuning", () => {
  const { send, decodes } = fixture();
  send(status("A", 7_074_125)); send(status("B", 14_074_000, "FT4"));
  send(decode("A")); send(decode("B")); send(status("A", 21_074_000)); send(decode("A"));
  assert.deepEqual(decodes.map(d => [d.dialFrequencyHz, d.dialMode]), [[7_074_125, "FT8"], [14_074_000, "FT4"], [21_074_000, "FT8"]]);
  assert.equal(decodes[0].deltaFrequency, 1234);
  assert.equal(decodes[0].mode, "~");
  assert.ok(Number.isFinite(decodes[0].receivedAt));
});

test("does not infer dial context for unknown, replayed, off-air or invalid-frequency decodes", () => {
  const { send, decodes } = fixture();
  send(decode("unknown")); send(status("A", 7_074_000));
  send(decode("A", false)); send(decode("A", true, true));
  send(status("A", 0)); send(decode("A"));
  assert.ok(decodes.every(d => d.dialFrequencyHz === undefined && d.dialMode === undefined));
  assert.equal(decodes[2].offAir, true);
});

test("drops context after inactivity, close and stop but retains it across active heartbeats", () => {
  let now = 1_000_000;
  const clock = mock.method(Date, "now", () => now);
  try {
    const { send, decodes, listener } = fixture();
    send(status("A", 7_074_000));
    for (let i = 0; i < 10; i++) { now += 15_000; send(header(0, "A")); }
    send(decode("A")); assert.equal(decodes.at(-1)?.dialFrequencyHz, 7_074_000);
    now += 120_000; send(decode("A")); assert.equal(decodes.at(-1)?.dialFrequencyHz, undefined);
    send(status("A", 14_074_000)); send(header(6, "A")); send(decode("A"));
    assert.equal(decodes.at(-1)?.dialFrequencyHz, undefined);
    send(status("A", 21_074_000)); listener.stop(); send(decode("A"));
    assert.equal(decodes.at(-1)?.dialFrequencyHz, undefined);
  } finally { clock.mock.restore(); }
});

test("bounds retained contexts and keeps the most recently active instances", () => {
  const { send, decodes } = fixture();
  for (let i = 0; i < 65; i++) send(status(String(i), 7_074_000));
  send(decode("64")); assert.equal(decodes.at(-1)?.dialFrequencyHz, 7_074_000);
  send(decode("0")); assert.equal(decodes.at(-1)?.dialFrequencyHz, undefined);
});
