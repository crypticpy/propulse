/**
 * ProPulse Bridge — CI-V Spectrum Client
 *
 * Connects to a WFView TCP CI-V server (raw CI-V byte pass-through),
 * parses ICOM CI-V spectrum data (command 0x27 0x00), and emits
 * typed spectrum line events for waterfall display.
 *
 * CI-V frame format: FE FE <to> <from> <cmd> [<sub>] [<data>] FD
 * Spectrum data: cmd=0x27, sub=0x00, multi-sequence with BCD fields.
 */

import { Socket } from "node:net";

// ============================================================================
// Constants
// ============================================================================

/** CI-V preamble byte */
const CIV_PREAMBLE = 0xfe;

/** CI-V end-of-message delimiter */
const CIV_EOM = 0xfd;

/** CI-V scope wave data command */
const CIV_CMD_SCOPE = 0x27;

/** CI-V scope wave data sub-command */
const CIV_SUB_SCOPE_DATA = 0x00;

/** Maximum buffer size before truncation (64 KB) */
const MAX_BUFFER_SIZE = 65_536;

/** Stale assembly timeout — discard incomplete lines after this (ms) */
const ASSEMBLY_TIMEOUT_MS = 500;

/** Maximum reconnect delay (ms) */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Base reconnect delay (ms) */
const BASE_RECONNECT_DELAY_MS = 1_000;

/** dB floor for pixel-to-dB mapping */
const DB_FLOOR = -125;

/** dB range for pixel-to-dB mapping (ceiling - floor) */
const DB_RANGE = 85; // -125 to -40

/** Maximum pixel value from CI-V spectrum */
const MAX_PIXEL_VALUE = 200;

// ============================================================================
// Types
// ============================================================================

export interface CivClientConfig {
  /** CI-V server host (default "127.0.0.1") */
  host: string;
  /** CI-V server port (default 4580) */
  port: number;
  /** CI-V address of the target radio (optional — accept any if omitted) */
  civAddress?: number;
}

/** Scope display mode from CI-V header */
export enum ScopeMode {
  Center = 0x00,
  Fixed = 0x01,
  ScrollCenter = 0x02,
  ScrollFixed = 0x03,
}

/** A completed spectrum line ready for conversion to FFT frame */
export interface CivSpectrumLine {
  /** Center frequency in Hz */
  centerHz: number;
  /** Total span width in Hz */
  spanHz: number;
  /** Raw pixel amplitudes (0-200) */
  pixels: Uint8Array;
  /** Scope display mode */
  scopeMode: ScopeMode;
  /** Whether main (0) or sub (1) scope */
  scopeIndex: number;
}

type SpectrumHandler = (line: CivSpectrumLine) => void;
type StatusHandler = (connected: boolean) => void;
type ErrorHandler = (error: Error) => void;

// ============================================================================
// BCD Helpers
// ============================================================================

/**
 * Parse a 5-byte BCD-encoded frequency (little-endian, 10 digits).
 * CI-V encodes frequencies as BCD with the least significant byte first.
 *
 * Example: 14.074.000 Hz = bytes [00, 40, 07, 14, 00] → 14074000
 */
function parseBcdFrequency(buf: Buffer, offset: number): number {
  let freq = 0;
  let multiplier = 1;
  for (let i = 0; i < 5; i++) {
    const byte = buf[offset + i];
    const lo = byte & 0x0f;
    const hi = (byte >> 4) & 0x0f;
    freq += lo * multiplier;
    multiplier *= 10;
    freq += hi * multiplier;
    multiplier *= 10;
  }
  return freq;
}

/**
 * Parse a BCD sequence number.
 * Sequence numbers are 2 BCD digits packed into bytes.
 * Examples: 0x01 = 1, 0x11 = 11, 0x02 = 2
 */
function parseBcdByte(byte: number): number {
  const lo = byte & 0x0f;
  const hi = (byte >> 4) & 0x0f;
  return hi * 10 + lo;
}

/**
 * Convert a CI-V pixel amplitude (0-200) to a dBm value.
 * Maps linearly: 0 → -125 dBm, 200 → -40 dBm.
 */
export function pixelToDb(pixel: number): number {
  return DB_FLOOR + (pixel / MAX_PIXEL_VALUE) * DB_RANGE;
}

// ============================================================================
// Line Assembler State
// ============================================================================

interface LineAssembly {
  scopeMode: ScopeMode;
  scopeIndex: number;
  startFreqHz: number;
  endFreqHz: number;
  seqMax: number;
  lastSeq: number;
  pixels: number[];
  lastUpdateMs: number;
}

// ============================================================================
// CivSpectrumClient
// ============================================================================

export class CivSpectrumClient {
  private readonly config: Required<CivClientConfig>;
  private socket: Socket | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private intentionalDisconnect = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Multi-sequence line assembler
  private assembly: LineAssembly | null = null;
  private assemblyTimer: ReturnType<typeof setTimeout> | null = null;

  // Event handlers
  private spectrumHandlers: SpectrumHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];

  // Statistics
  private linesEmitted = 0;
  private framesDropped = 0;

  constructor(config?: Partial<CivClientConfig>) {
    this.config = {
      host: config?.host ?? "127.0.0.1",
      port: config?.port ?? 4580,
      civAddress: config?.civAddress ?? 0x94,
    };
  }

  // --------------------------------------------------------------------------
  // Event Registration (returns disposer)
  // --------------------------------------------------------------------------

  onSpectrum(handler: SpectrumHandler): () => void {
    this.spectrumHandlers.push(handler);
    return () => {
      const idx = this.spectrumHandlers.indexOf(handler);
      if (idx >= 0) this.spectrumHandlers.splice(idx, 1);
    };
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      const idx = this.statusHandlers.indexOf(handler);
      if (idx >= 0) this.statusHandlers.splice(idx, 1);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      const idx = this.errorHandlers.indexOf(handler);
      if (idx >= 0) this.errorHandlers.splice(idx, 1);
    };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  connect(): void {
    this.intentionalDisconnect = false;
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.assemblyTimer) {
      clearTimeout(this.assemblyTimer);
      this.assemblyTimer = null;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    this.buffer = Buffer.alloc(0);
    this.assembly = null;

    this.emitStatus(false);
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  getStats(): { linesEmitted: number; framesDropped: number } {
    return {
      linesEmitted: this.linesEmitted,
      framesDropped: this.framesDropped,
    };
  }

  // --------------------------------------------------------------------------
  // Internal Connection Logic
  // --------------------------------------------------------------------------

  private doConnect(): void {
    if (this.intentionalDisconnect) return;

    this.socket = new Socket();
    this.buffer = Buffer.alloc(0);
    this.assembly = null;

    // Binary mode — do NOT call setEncoding (unlike DXClusterClient)
    this.socket.setTimeout(30_000);

    this.socket.on("connect", () => {
      this.reconnectAttempt = 0;
      this.emitStatus(true);
    });

    this.socket.on("data", (data: Buffer) => {
      this.appendAndParse(data);
    });

    this.socket.on("timeout", () => {
      // TCP CI-V is a passive stream — timeout just means no data
      // Don't destroy, radio scope might be paused
    });

    this.socket.on("error", (err: Error) => {
      this.emitError(err);
    });

    this.socket.on("close", () => {
      this.socket = null;
      this.emitStatus(false);

      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    });

    this.socket.connect(this.config.port, this.config.host);
  }

  // --------------------------------------------------------------------------
  // CI-V Frame Parser
  // --------------------------------------------------------------------------

  /**
   * Append incoming bytes to the buffer and extract complete CI-V frames.
   *
   * CI-V frames are delimited by:
   *   Start: FE FE (two consecutive 0xFE bytes)
   *   End:   FD (single 0xFD byte)
   *
   * The payload between the preamble and EOM contains:
   *   [to_addr] [from_addr] [command] [sub_command?] [data...?]
   */
  private appendAndParse(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    // Guard against unbounded buffer growth
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      // Truncate from front, keeping the most recent data
      this.buffer = this.buffer.subarray(
        this.buffer.length - MAX_BUFFER_SIZE / 2,
      );
      this.framesDropped++;
    }

    // Extract all complete CI-V frames from the buffer
    let searchStart = 0;

    while (searchStart < this.buffer.length - 3) {
      // Find FE FE preamble
      const preambleIdx = this.findPreamble(searchStart);
      if (preambleIdx < 0) break;

      // Find FD terminator after preamble
      const eomIdx = this.buffer.indexOf(CIV_EOM, preambleIdx + 2);
      if (eomIdx < 0) {
        // No terminator yet — keep buffered data from preamble onward
        if (preambleIdx > 0) {
          this.buffer = this.buffer.subarray(preambleIdx);
        }
        return;
      }

      // Extract frame payload (between FE FE and FD, exclusive)
      const payload = this.buffer.subarray(preambleIdx + 2, eomIdx);
      searchStart = eomIdx + 1;

      // Process the CI-V frame
      if (payload.length >= 4) {
        this.processCivFrame(payload);
      }
    }

    // Remove consumed bytes
    if (searchStart > 0) {
      this.buffer = this.buffer.subarray(searchStart);
    }
  }

  /** Find two consecutive 0xFE bytes starting from the given offset. */
  private findPreamble(start: number): number {
    for (let i = start; i < this.buffer.length - 1; i++) {
      if (
        this.buffer[i] === CIV_PREAMBLE &&
        this.buffer[i + 1] === CIV_PREAMBLE
      ) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Process a single CI-V frame payload.
   *
   * Payload layout: [to_addr] [from_addr] [command] [sub_command] [data...]
   * We only care about command 0x27 sub 0x00 (scope wave data).
   */
  private processCivFrame(payload: Buffer): void {
    // payload[0] = to address (0xE0 = computer, or broadcast 0x00)
    // payload[1] = from address (e.g. 0x94 = IC-7300)
    const command = payload[2];
    const subCommand = payload[3];

    // Only process scope wave data
    if (command !== CIV_CMD_SCOPE || subCommand !== CIV_SUB_SCOPE_DATA) {
      return;
    }

    // Scope data starts at payload[4]
    // Layout: [mainSub] [seq BCD] [seqMax BCD] [data...]
    const scopeData = payload.subarray(4);
    if (scopeData.length < 3) return;

    const scopeIndex = scopeData[0]; // 0 = main, 1 = sub
    const seq = parseBcdByte(scopeData[1]);
    const seqMax = parseBcdByte(scopeData[2]);

    if (seq < 1 || seqMax < 1) return;

    if (seq === 1) {
      // First sequence: contains header, no pixel data
      this.handleSequenceHeader(scopeData, scopeIndex, seqMax);
    } else {
      // Subsequent sequences: pixel data
      this.handleSequencePixels(scopeData, seq, seqMax);
    }
  }

  /**
   * Handle sequence 1 (header) of a spectrum line.
   *
   * Header layout (after mainSub, seq, seqMax):
   *   [scopeMode] [startFreq 5B BCD] [endFreq 5B BCD] [oorFlag]
   *
   * For LAN connections with seq==seqMax==1, pixels follow immediately
   * after the header (no separate pixel sequences).
   */
  private handleSequenceHeader(
    scopeData: Buffer,
    scopeIndex: number,
    seqMax: number,
  ): void {
    // Minimum: mainSub(1) + seq(1) + seqMax(1) + mode(1) + startFreq(5) + endFreq(5) + oor(1) = 15
    if (scopeData.length < 15) return;

    const scopeMode = scopeData[3] as ScopeMode;
    const startFreqHz = parseBcdFrequency(scopeData, 4);
    const endFreqHz = parseBcdFrequency(scopeData, 9);
    // oorFlag = scopeData[14] — out of range, we note but don't filter

    // Reset the line assembler
    this.assembly = {
      scopeMode,
      scopeIndex,
      startFreqHz,
      endFreqHz,
      seqMax,
      lastSeq: 1,
      pixels: [],
      lastUpdateMs: Date.now(),
    };

    // For LAN connections: seq==1 and seqMax==1 means all data in one packet
    // Pixels start after the header (offset 15)
    if (seqMax === 1) {
      // All pixels in this single packet
      for (let i = 15; i < scopeData.length; i++) {
        this.assembly.pixels.push(scopeData[i]);
      }
      this.emitCompleteLine();
      return;
    }

    // Multi-sequence: start the assembly timeout
    this.resetAssemblyTimeout();
  }

  /**
   * Handle sequences 2..N (pixel data) of a spectrum line.
   *
   * Pixel data starts at offset 3 (after mainSub, seq, seqMax).
   */
  private handleSequencePixels(
    scopeData: Buffer,
    seq: number,
    seqMax: number,
  ): void {
    if (!this.assembly) return;

    // Validate sequence continuity
    if (seq !== this.assembly.lastSeq + 1) {
      // Out of sequence — discard the partial assembly
      this.assembly = null;
      this.framesDropped++;
      return;
    }

    this.assembly.lastSeq = seq;
    this.assembly.lastUpdateMs = Date.now();

    // Append pixel bytes (offset 3 = after mainSub, seq, seqMax)
    for (let i = 3; i < scopeData.length; i++) {
      this.assembly.pixels.push(scopeData[i]);
    }

    // Check if this is the last sequence
    if (seq === seqMax) {
      this.emitCompleteLine();
    } else {
      this.resetAssemblyTimeout();
    }
  }

  /** Emit a completed spectrum line and reset the assembler. */
  private emitCompleteLine(): void {
    if (this.assemblyTimer) {
      clearTimeout(this.assemblyTimer);
      this.assemblyTimer = null;
    }

    if (!this.assembly || this.assembly.pixels.length === 0) {
      this.assembly = null;
      return;
    }

    const { scopeMode, scopeIndex, startFreqHz, endFreqHz, pixels } =
      this.assembly;

    // Compute center and span
    let centerHz: number;
    let spanHz: number;

    if (scopeMode === ScopeMode.Center) {
      // In center mode: startFreq = center, endFreq = half-span
      centerHz = startFreqHz;
      spanHz = endFreqHz * 2;
    } else {
      // Fixed/Scroll modes: startFreq = lower edge, endFreq = upper edge
      centerHz = (startFreqHz + endFreqHz) / 2;
      spanHz = endFreqHz - startFreqHz;
    }

    // Guard against zero or negative span
    if (spanHz <= 0) {
      this.assembly = null;
      this.framesDropped++;
      return;
    }

    const line: CivSpectrumLine = {
      centerHz,
      spanHz,
      pixels: new Uint8Array(pixels),
      scopeMode,
      scopeIndex,
    };

    this.assembly = null;
    this.linesEmitted++;
    this.emitSpectrum(line);
  }

  /** Reset (or start) the assembly timeout timer. */
  private resetAssemblyTimeout(): void {
    if (this.assemblyTimer) {
      clearTimeout(this.assemblyTimer);
    }

    this.assemblyTimer = setTimeout(() => {
      this.assemblyTimer = null;
      if (this.assembly) {
        this.framesDropped++;
        this.assembly = null;
      }
    }, ASSEMBLY_TIMEOUT_MS);
  }

  // --------------------------------------------------------------------------
  // Reconnection with Exponential Backoff
  // --------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) return;

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempt),
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  private emitSpectrum(line: CivSpectrumLine): void {
    for (const handler of this.spectrumHandlers) {
      try {
        handler(line);
      } catch {
        // Swallow handler errors to protect the client loop
      }
    }
  }

  private emitStatus(connected: boolean): void {
    for (const handler of this.statusHandlers) {
      try {
        handler(connected);
      } catch {
        // Swallow handler errors
      }
    }
  }

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // Swallow handler errors
      }
    }
  }
}
