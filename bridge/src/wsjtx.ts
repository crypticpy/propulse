/**
 * ProPulse Bridge — WSJT-X UDP Protocol Parser
 *
 * Listens for WSJT-X UDP datagrams and parses the QDataStream binary
 * format. Extracts Status, Decode, Clear, and QSO Logged messages.
 *
 * Protocol reference:
 *   https://sourceforge.net/p/wsjt/wsjtx/ci/master/tree/Network/NetworkMessage.hpp
 *
 * QDataStream encoding (big-endian):
 *   - uint32:  4 bytes
 *   - utf8:    uint32 length + bytes  (0xFFFFFFFF = null)
 *   - bool:    uint8
 *   - double:  8 bytes IEEE 754
 *   - QTime:   uint32 milliseconds since midnight
 */

import { createSocket, type Socket as UDPSocket } from "node:dgram";
import type { WSJTXStatus, WSJTXDecode, WSJTXQSOLogged } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const WSJTX_MAGIC = 0xadbccbda;
const WSJTX_SCHEMA_VERSION = 2;

/** WSJT-X network message types */
const enum WSJTXMessageType {
  Heartbeat = 0,
  Status = 1,
  Decode = 2,
  Clear = 3,
  // Reply = 4,  (outbound only)
  QSOLogged = 5,
  // Close = 6,
  // Replay = 7,
  // HaltTx = 8,
  // FreeText = 9,
  // WSPRDecode = 10,
  // Location = 11,
  LoggedADIF = 12,
}

// ============================================================================
// QDataStream Reader
// ============================================================================

class QDataStreamReader {
  private offset = 0;

  constructor(private readonly buf: Buffer) {}

  get remaining(): number {
    return this.buf.length - this.offset;
  }

  readUInt8(): number {
    if (this.remaining < 1) throw new RangeError("Buffer underflow: uint8");
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readUInt32(): number {
    if (this.remaining < 4) throw new RangeError("Buffer underflow: uint32");
    const v = this.buf.readUInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  readInt32(): number {
    if (this.remaining < 4) throw new RangeError("Buffer underflow: int32");
    const v = this.buf.readInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  readBool(): boolean {
    return this.readUInt8() !== 0;
  }

  readDouble(): number {
    if (this.remaining < 8) throw new RangeError("Buffer underflow: double");
    const v = this.buf.readDoubleBE(this.offset);
    this.offset += 8;
    return v;
  }

  readQTime(): number {
    return this.readUInt32(); // ms since midnight
  }

  /**
   * Read a QDataStream UTF-8 string.
   * Length prefix of 0xFFFFFFFF means null/empty.
   */
  readUtf8(): string | null {
    const len = this.readUInt32();
    if (len === 0xffffffff) return null;
    if (this.remaining < len)
      throw new RangeError("Buffer underflow: utf8 string");
    const s = this.buf.toString("utf-8", this.offset, this.offset + len);
    this.offset += len;
    return s;
  }

  /**
   * Skip forward by `n` bytes.
   */
  skip(n: number): void {
    if (this.remaining < n) throw new RangeError("Buffer underflow: skip");
    this.offset += n;
  }
}

// ============================================================================
// FT8/FT4 Message Text Parsing
// ============================================================================

/** Regex: CQ CALLSIGN GRID */
const CQ_REGEX =
  /^CQ\s+(?:(\w{2,4})\s+)?([A-Z0-9/]{3,})\s+([A-R]{2}\d{2}(?:[a-x]{2})?)$/i;

/** Regex: CALL1 CALL2 GRID */
const QSO_GRID_REGEX =
  /^([A-Z0-9/]{3,})\s+([A-Z0-9/]{3,})\s+([A-R]{2}\d{2}(?:[a-x]{2})?)$/i;

/** Regex: CALL1 CALL2 REPORT  (e.g. +05 or -15 or R+05 or R-15 or RR73 or 73) */
const QSO_REPORT_REGEX =
  /^([A-Z0-9/]{3,})\s+([A-Z0-9/]{3,})\s+(R?[+-]\d{2}|RR73|RRR|73)$/i;

interface ExtractedCall {
  callsign?: string;
  grid?: string;
}

function extractCallInfo(message: string): ExtractedCall {
  const trimmed = message.trim();

  // CQ [directed] CALL GRID
  const cqMatch = trimmed.match(CQ_REGEX);
  if (cqMatch) {
    return { callsign: cqMatch[2], grid: cqMatch[3] };
  }

  // CALL1 CALL2 GRID
  const gridMatch = trimmed.match(QSO_GRID_REGEX);
  if (gridMatch) {
    return { callsign: gridMatch[2], grid: gridMatch[3] };
  }

  // CALL1 CALL2 REPORT
  const reportMatch = trimmed.match(QSO_REPORT_REGEX);
  if (reportMatch) {
    return { callsign: reportMatch[2] };
  }

  return {};
}

// ============================================================================
// Decode Statistics Tracker
// ============================================================================

interface DecodeStats {
  recentDecodes: number[];
  uniqueCallsigns: Map<string, number>;
}

const STATS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function createDecodeStats(): DecodeStats {
  return {
    recentDecodes: [],
    uniqueCallsigns: new Map(),
  };
}

function recordDecode(stats: DecodeStats, callsign?: string): void {
  const now = Date.now();
  stats.recentDecodes.push(now);

  if (callsign) {
    stats.uniqueCallsigns.set(callsign, now);
  }

  // Prune old entries
  const cutoff = now - STATS_WINDOW_MS;
  stats.recentDecodes = stats.recentDecodes.filter((t) => t > cutoff);
  for (const [call, ts] of stats.uniqueCallsigns) {
    if (ts < cutoff) stats.uniqueCallsigns.delete(call);
  }
}

// ============================================================================
// Event Handler Types
// ============================================================================

type StatusHandler = (status: WSJTXStatus, instanceId: string) => void;
type DecodeHandler = (decode: WSJTXDecode, instanceId: string) => void;
type QSOLoggedHandler = (qso: WSJTXQSOLogged, instanceId: string) => void;
type ClearHandler = (window: string | undefined, instanceId: string) => void;
type ErrorHandler = (error: Error) => void;

// ============================================================================
// WSJTXListener
// ============================================================================

export class WSJTXListener {
  private socket: UDPSocket | null = null;
  private readonly port: number;
  private readonly statsPerInstance = new Map<string, DecodeStats>();

  // Event handlers
  private statusHandlers: StatusHandler[] = [];
  private decodeHandlers: DecodeHandler[] = [];
  private qsoLoggedHandlers: QSOLoggedHandler[] = [];
  private clearHandlers: ClearHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];

  constructor(port = 2237) {
    this.port = port;
  }

  // --------------------------------------------------------------------------
  // Event Registration
  // --------------------------------------------------------------------------

  onStatus(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  onDecode(handler: DecodeHandler): void {
    this.decodeHandlers.push(handler);
  }

  onQSOLogged(handler: QSOLoggedHandler): void {
    this.qsoLoggedHandlers.push(handler);
  }

  onClear(handler: ClearHandler): void {
    this.clearHandlers.push(handler);
  }

  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  start(): void {
    if (this.socket) return;

    this.socket = createSocket("udp4");

    this.socket.on("message", (msg: Buffer) => {
      try {
        this.handleDatagram(msg);
      } catch (err) {
        this.emitError(err instanceof Error ? err : new Error(String(err)));
      }
    });

    this.socket.on("error", (err: Error) => {
      this.emitError(err);
    });

    this.socket.bind(this.port, "127.0.0.1");
  }

  stop(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.statsPerInstance.clear();
  }

  /** Returns decode statistics for all known instances */
  getStats(): Record<
    string,
    { decodesPerMinute: number; uniqueCallsigns: number }
  > {
    const result: Record<
      string,
      { decodesPerMinute: number; uniqueCallsigns: number }
    > = {};
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;

    for (const [id, stats] of this.statsPerInstance) {
      const recentCount = stats.recentDecodes.filter(
        (t) => t > oneMinuteAgo,
      ).length;
      result[id] = {
        decodesPerMinute: recentCount,
        uniqueCallsigns: stats.uniqueCallsigns.size,
      };
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // Datagram Handling
  // --------------------------------------------------------------------------

  private handleDatagram(buf: Buffer): void {
    if (buf.length < 12) return; // too short for header

    const reader = new QDataStreamReader(buf);

    // Validate magic number
    const magic = reader.readUInt32();
    if (magic !== WSJTX_MAGIC) return;

    // Schema version
    const schema = reader.readUInt32();
    if (schema > WSJTX_SCHEMA_VERSION + 1) return; // allow minor future versions

    // Message type
    const msgType = reader.readUInt32();

    // Instance ID
    const instanceId = reader.readUtf8() ?? "WSJT-X";

    switch (msgType) {
      case WSJTXMessageType.Heartbeat:
        // Heartbeat — no action needed (could track liveness)
        break;

      case WSJTXMessageType.Status:
        this.parseStatus(reader, instanceId);
        break;

      case WSJTXMessageType.Decode:
        this.parseDecode(reader, instanceId);
        break;

      case WSJTXMessageType.Clear:
        this.parseClear(reader, instanceId);
        break;

      case WSJTXMessageType.QSOLogged:
        this.parseQSOLogged(reader, instanceId);
        break;

      case WSJTXMessageType.LoggedADIF:
        this.parseLoggedADIF(reader, instanceId);
        break;

      default:
        // Unknown or unhandled message type — silently ignore
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Message Parsers
  // --------------------------------------------------------------------------

  private parseStatus(reader: QDataStreamReader, instanceId: string): void {
    const dialFrequency = Number(this.readUInt64(reader)); // QDataStream encodes as uint64
    const mode = reader.readUtf8() ?? "";
    const dxCall = reader.readUtf8();
    reader.readUtf8(); // report — skip
    reader.readUtf8(); // tx mode — skip
    const txEnabled = reader.readBool();
    reader.readBool(); // transmitting — skip
    const decoding = reader.readBool();
    const rxDF = reader.readUInt32();
    const txDF = reader.readUInt32();
    reader.readUtf8(); // DE call — skip
    reader.readUtf8(); // DE grid — skip
    const dxGrid = reader.readUtf8();

    const status: WSJTXStatus = {
      frequency: dialFrequency,
      mode,
      dxCall: dxCall ?? undefined,
      dxGrid: dxGrid ?? undefined,
      txEnabled,
      decoding,
      rxDF,
      txDF,
    };

    for (const handler of this.statusHandlers) {
      try {
        handler(status, instanceId);
      } catch {
        /* swallow */
      }
    }
  }

  private parseDecode(reader: QDataStreamReader, instanceId: string): void {
    const isNew = reader.readBool();
    const time = reader.readQTime();
    const snr = reader.readInt32();
    const deltaTime = reader.readDouble();
    const deltaFrequency = reader.readUInt32();
    const mode = reader.readUtf8() ?? "";
    const message = reader.readUtf8() ?? "";
    const lowConfidence = reader.readBool();

    // Extract callsign and grid from the FT8/FT4 message text
    const { callsign, grid } = extractCallInfo(message);

    // Track statistics
    if (!this.statsPerInstance.has(instanceId)) {
      this.statsPerInstance.set(instanceId, createDecodeStats());
    }
    recordDecode(this.statsPerInstance.get(instanceId)!, callsign);

    const decode: WSJTXDecode = {
      isNew,
      time,
      snr,
      deltaTime,
      deltaFrequency,
      mode,
      message,
      lowConfidence,
      callsign,
      grid,
    };

    for (const handler of this.decodeHandlers) {
      try {
        handler(decode, instanceId);
      } catch {
        /* swallow */
      }
    }
  }

  private parseClear(reader: QDataStreamReader, instanceId: string): void {
    // Optional window field (added in later schema versions)
    let window: string | undefined;
    try {
      if (reader.remaining >= 1) {
        const windowId = reader.readUInt8();
        window =
          windowId === 0
            ? "band_activity"
            : windowId === 1
              ? "rx_frequency"
              : undefined;
      }
    } catch {
      // older WSJT-X versions may not include the window field
    }

    for (const handler of this.clearHandlers) {
      try {
        handler(window, instanceId);
      } catch {
        /* swallow */
      }
    }
  }

  private parseQSOLogged(reader: QDataStreamReader, instanceId: string): void {
    this.readQDateTime(reader); // dateTimeOff — skip
    const callsign = reader.readUtf8() ?? "";
    const grid = reader.readUtf8();
    const dialFrequency = Number(this.readUInt64(reader));
    const mode = reader.readUtf8() ?? "";
    const reportSent = reader.readUtf8() ?? "";
    const reportReceived = reader.readUtf8() ?? "";
    const txPower = reader.readUtf8() ?? "";
    const comments = reader.readUtf8() ?? "";
    reader.readUtf8(); // op name — skip
    this.readQDateTime(reader); // dateTimeOn — skip

    const qso: WSJTXQSOLogged = {
      callsign,
      grid: grid ?? undefined,
      frequency: dialFrequency,
      mode,
      reportSent,
      reportReceived,
      txPower,
      comments,
      timestamp: new Date().toISOString(),
    };

    for (const handler of this.qsoLoggedHandlers) {
      try {
        handler(qso, instanceId);
      } catch {
        /* swallow */
      }
    }
  }

  private parseLoggedADIF(reader: QDataStreamReader, instanceId: string): void {
    const adifRecord = reader.readUtf8();

    // We emit this as a QSO logged event with just the ADIF record
    // Parse basic fields from ADIF
    const callsign = extractAdifField(adifRecord, "CALL") ?? "";
    const grid = extractAdifField(adifRecord, "GRIDSQUARE");
    const freqStr = extractAdifField(adifRecord, "FREQ");
    const mode = extractAdifField(adifRecord, "MODE") ?? "";

    const qso: WSJTXQSOLogged = {
      callsign,
      grid: grid ?? undefined,
      frequency: freqStr ? parseFloat(freqStr) * 1_000_000 : 0, // MHz to Hz
      mode,
      reportSent: extractAdifField(adifRecord, "RST_SENT") ?? "",
      reportReceived: extractAdifField(adifRecord, "RST_RCVD") ?? "",
      txPower: extractAdifField(adifRecord, "TX_PWR") ?? "",
      comments: extractAdifField(adifRecord, "COMMENT") ?? "",
      timestamp: new Date().toISOString(),
      adifRecord: adifRecord ?? undefined,
    };

    for (const handler of this.qsoLoggedHandlers) {
      try {
        handler(qso, instanceId);
      } catch {
        /* swallow */
      }
    }
  }

  // --------------------------------------------------------------------------
  // QDataStream Helpers
  // --------------------------------------------------------------------------

  /**
   * Read a uint64 from the stream. JavaScript doesn't have native uint64
   * support, so we read as two uint32 values and combine.
   * Frequencies fit comfortably in Number's safe integer range.
   */
  private readUInt64(reader: QDataStreamReader): number {
    const high = reader.readUInt32();
    const low = reader.readUInt32();
    return high * 0x100000000 + low;
  }

  /**
   * Read a QDateTime from the stream.
   * Format: int64 Julian Day Number + uint32 ms since midnight + uint8 timespec
   */
  private readQDateTime(reader: QDataStreamReader): Date {
    const julianHigh = reader.readInt32();
    const julianLow = reader.readUInt32();
    const julianDay = julianHigh * 0x100000000 + julianLow;
    const msFromMidnight = reader.readUInt32();
    reader.readUInt8(); // timeSpec — skip

    // Convert Julian Day to Unix timestamp
    // Julian Day 2440587.5 = Unix epoch (1970-01-01T00:00:00Z)
    const unixDays = julianDay - 2440588;
    const ms = unixDays * 86400000 + msFromMidnight;
    return new Date(ms);
  }

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        /* swallow */
      }
    }
  }
}

// ============================================================================
// ADIF Field Extraction Helper
// ============================================================================

function extractAdifField(adif: string | null, field: string): string | null {
  if (!adif) return null;
  const regex = new RegExp(`<${field}:\\d+(?::[^>]*)?>([^<]*)`, "i");
  const match = adif.match(regex);
  return match ? match[1].trim() : null;
}
