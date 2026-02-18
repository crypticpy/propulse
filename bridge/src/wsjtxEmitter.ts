/**
 * ProPulse Bridge — WSJT-X UDP Protocol Emitter
 *
 * Encodes and sends WSJT-X binary protocol datagrams via UDP so that
 * external applications (GridTracker, JTAlert, etc.) can consume
 * ProPulse native FT8 decodes as if they came from WSJT-X itself.
 *
 * Protocol reference:
 *   https://sourceforge.net/p/wsjt/wsjtx/ci/master/tree/Network/NetworkMessage.hpp
 *
 * QDataStream encoding (big-endian):
 *   - uint8:   1 byte
 *   - uint32:  4 bytes
 *   - int32:   4 bytes (signed)
 *   - uint64:  8 bytes
 *   - double:  8 bytes IEEE 754
 *   - utf8:    uint32 length + bytes  (0xFFFFFFFF = null)
 */

import { createSocket, type Socket as UDPSocket } from "node:dgram";

// ============================================================================
// Constants
// ============================================================================

const WSJTX_MAGIC = 0xadbccbda;
const WSJTX_SCHEMA_VERSION = 2;
const CLIENT_ID = "Propulse";

/** WSJT-X network message types (outbound) */
const enum WSJTXOutMessageType {
  Heartbeat = 0,
  Status = 1,
  Decode = 2,
  Clear = 3,
  QSOLogged = 5,
}

// ============================================================================
// QDataStreamWriter
// ============================================================================

/**
 * Builds a binary buffer using Qt QDataStream big-endian encoding.
 * This is the inverse of the QDataStreamReader in wsjtx.ts.
 */
export class QDataStreamWriter {
  private chunks: Buffer[] = [];

  writeUint8(value: number): void {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(value & 0xff, 0);
    this.chunks.push(buf);
  }

  writeUint32(value: number): void {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value >>> 0, 0);
    this.chunks.push(buf);
  }

  writeInt32(value: number): void {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(value, 0);
    this.chunks.push(buf);
  }

  writeUint64(value: bigint): void {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt.asUintN(64, value), 0);
    this.chunks.push(buf);
  }

  writeFloat64(value: number): void {
    const buf = Buffer.alloc(8);
    buf.writeDoubleBE(value, 0);
    this.chunks.push(buf);
  }

  /**
   * Write a QDataStream UTF-8 string.
   * A null value is encoded as length 0xFFFFFFFF.
   */
  writeString(value: string | null): void {
    if (value === null || value === undefined) {
      this.writeUint32(0xffffffff);
      return;
    }
    const encoded = Buffer.from(value, "utf-8");
    this.writeUint32(encoded.length);
    this.chunks.push(encoded);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

// ============================================================================
// Frame Builder Helpers
// ============================================================================

/**
 * Write the common WSJT-X message header:
 * magic (uint32) + schema (uint32) + message type (uint32) + client id (string)
 */
function writeHeader(w: QDataStreamWriter, messageType: number): void {
  w.writeUint32(WSJTX_MAGIC);
  w.writeUint32(WSJTX_SCHEMA_VERSION);
  w.writeUint32(messageType);
  w.writeString(CLIENT_ID);
}

// ============================================================================
// Emitter Input Types
// ============================================================================

export interface EmitDecodeInput {
  isNew: boolean;
  time: number; // ms since midnight UTC
  snr: number;
  deltaTime: number;
  deltaFrequency: number;
  mode: string;
  message: string;
  lowConfidence: boolean;
}

export interface EmitStatusInput {
  frequency: number;
  mode: string;
  dxCall?: string;
  dxGrid?: string;
  txEnabled: boolean;
  decoding: boolean;
  rxDF: number;
  txDF: number;
}

// ============================================================================
// WSJTXEmitter
// ============================================================================

export class WSJTXEmitter {
  private socket: UDPSocket | null = null;
  private _port: number;
  private readonly _host: string;
  private _active = false;

  constructor(port: number, host = "127.0.0.1") {
    this._port = port;
    this._host = host;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  start(): void {
    if (this.socket) return;

    this.socket = createSocket("udp4");

    this.socket.on("error", (err: Error) => {
      // Log but do not crash — UDP send failures are non-fatal
      console.error("[WSJTXEmitter] Socket error:", err.message);
    });

    this._active = true;
  }

  stop(): void {
    this._active = false;

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Already closed — ignore
      }
      this.socket = null;
    }
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  setPort(port: number): void {
    this._port = port;
  }

  get active(): boolean {
    return this._active;
  }

  // --------------------------------------------------------------------------
  // Emitters
  // --------------------------------------------------------------------------

  /**
   * Emit a WSJT-X Decode message (type 2).
   *
   * Field order per the protocol spec:
   *   isNew (bool), time (QTime/uint32), snr (int32), deltaTime (double),
   *   deltaFrequency (uint32), mode (string), message (string),
   *   lowConfidence (bool), offAir (bool)
   */
  emitDecode(decode: EmitDecodeInput): void {
    const w = new QDataStreamWriter();
    writeHeader(w, WSJTXOutMessageType.Decode);

    w.writeUint8(decode.isNew ? 1 : 0);
    w.writeUint32(decode.time >>> 0);
    w.writeInt32(decode.snr);
    w.writeFloat64(decode.deltaTime);
    w.writeUint32(decode.deltaFrequency >>> 0);
    w.writeString(decode.mode);
    w.writeString(decode.message);
    w.writeUint8(decode.lowConfidence ? 1 : 0);
    w.writeUint8(0); // offAir — always 0

    this.send(w.toBuffer());
  }

  /**
   * Emit a WSJT-X Status message (type 1).
   *
   * Field order per the protocol spec (full 22-field layout):
   *   id, frequency (uint64), mode, dxCall, report, txMode, txEnabled,
   *   transmitting, decoding, rxDF, txDF, deCall, deGrid, dxGrid,
   *   txWatchdog, subMode, fastMode, specialOperationMode,
   *   frequencyTolerance, trPeriod, configurationName, txMessage
   */
  emitStatus(status: EmitStatusInput): void {
    const w = new QDataStreamWriter();
    writeHeader(w, WSJTXOutMessageType.Status);

    // id — dial frequency as a simple uint32 identifier
    w.writeUint32(0);
    // frequency — uint64
    w.writeUint64(BigInt(Math.round(status.frequency)));
    // mode
    w.writeString(status.mode);
    // dxCall
    w.writeString(status.dxCall ?? null);
    // report
    w.writeString(null);
    // txMode
    w.writeString(status.mode);
    // txEnabled
    w.writeUint8(status.txEnabled ? 1 : 0);
    // transmitting
    w.writeUint8(0);
    // decoding
    w.writeUint8(status.decoding ? 1 : 0);
    // rxDF
    w.writeUint32(status.rxDF >>> 0);
    // txDF
    w.writeUint32(status.txDF >>> 0);
    // deCall (our callsign — not available at emitter level, send null)
    w.writeString(null);
    // deGrid
    w.writeString(null);
    // dxGrid
    w.writeString(status.dxGrid ?? null);
    // txWatchdog
    w.writeUint8(0);
    // subMode
    w.writeString(null);
    // fastMode
    w.writeUint8(0);
    // specialOperationMode
    w.writeUint8(0);
    // frequencyTolerance
    w.writeUint32(0);
    // trPeriod
    w.writeUint32(0);
    // configurationName
    w.writeString("Default");
    // txMessage
    w.writeString(null);

    this.send(w.toBuffer());
  }

  // --------------------------------------------------------------------------
  // UDP Send
  // --------------------------------------------------------------------------

  private send(buf: Buffer): void {
    if (!this.socket || !this._active) return;

    this.socket.send(buf, 0, buf.length, this._port, this._host, (err) => {
      if (err) {
        console.error("[WSJTXEmitter] UDP send failed:", err.message);
      }
    });
  }
}
