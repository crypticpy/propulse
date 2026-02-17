/**
 * ProPulse Bridge — CI-V Spectrum Client
 *
 * Connects to a WFView TCP CI-V server (raw CI-V byte pass-through),
 * parses ICOM CI-V spectrum data (command 0x27 0x00), and emits
 * typed spectrum line events for waterfall display.
 *
 * Refactored to use the shared CI-V protocol library (civ/) for frame
 * parsing, while keeping the same public API for backward compatibility.
 */

import { Socket } from "node:net";
import {
  CivFrameParser,
  decodeBcdFrequency,
  decodeBcdByte,
} from "./civ/codec.js";
import { CivCmd, CIV_SCOPE_SUB, ScopeMode, pixelToDb } from "./civ/types.js";

// Re-export types that consumers depend on
export { ScopeMode, pixelToDb };

// ============================================================================
// Constants
// ============================================================================

/** Stale assembly timeout — discard incomplete lines after this (ms) */
const ASSEMBLY_TIMEOUT_MS = 500;

/** Maximum reconnect delay (ms) */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Base reconnect delay (ms) */
const BASE_RECONNECT_DELAY_MS = 1_000;

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
  private frameParser = new CivFrameParser();
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

    this.frameParser.reset();
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
    this.frameParser.reset();
    this.assembly = null;

    // Binary mode — do NOT call setEncoding
    this.socket.setTimeout(30_000);

    this.socket.on("connect", () => {
      this.reconnectAttempt = 0;
      this.emitStatus(true);
    });

    this.socket.on("data", (data: Buffer) => {
      this.handleData(data);
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
  // Frame Processing (using shared CivFrameParser)
  // --------------------------------------------------------------------------

  private handleData(data: Buffer): void {
    const frames = this.frameParser.append(data);

    for (const frame of frames) {
      // Only process scope wave data (cmd 0x27, sub 0x00)
      if (
        frame.command === CivCmd.SCOPE_DATA &&
        frame.subCommand === CIV_SCOPE_SUB.WAVE_DATA
      ) {
        // Scope data is in frame.data starting from sub-command onward
        // We need the raw scope payload: [mainSub] [seq] [seqMax] [...]
        // frame.data includes [sub(0x00)] [mainSub] [seq] [seqMax] [...]
        const scopeData = frame.data.subarray(1); // skip sub-command byte
        if (scopeData.length < 3) continue;

        const scopeIndex = scopeData[0];
        const seq = decodeBcdByte(scopeData[1]);
        const seqMax = decodeBcdByte(scopeData[2]);

        if (seq < 1 || seqMax < 1) continue;

        if (seq === 1) {
          this.handleSequenceHeader(scopeData, scopeIndex, seqMax);
        } else {
          this.handleSequencePixels(scopeData, seq, seqMax);
        }
      }
    }
  }

  /**
   * Handle sequence 1 (header) of a spectrum line.
   *
   * Header layout (after mainSub, seq, seqMax):
   *   [scopeMode] [startFreq 5B BCD] [endFreq 5B BCD] [oorFlag]
   */
  private handleSequenceHeader(
    scopeData: Buffer,
    scopeIndex: number,
    seqMax: number,
  ): void {
    // Minimum: mainSub(1) + seq(1) + seqMax(1) + mode(1) + startFreq(5) + endFreq(5) + oor(1) = 15
    if (scopeData.length < 15) return;

    const scopeMode = scopeData[3] as ScopeMode;
    const startFreqHz = decodeBcdFrequency(scopeData, 4);
    const endFreqHz = decodeBcdFrequency(scopeData, 9);

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

    // LAN mode: seq==1 and seqMax==1 means all data in one packet
    if (seqMax === 1) {
      for (let i = 15; i < scopeData.length; i++) {
        this.assembly.pixels.push(scopeData[i]);
      }
      this.emitCompleteLine();
      return;
    }

    this.resetAssemblyTimeout();
  }

  /**
   * Handle sequences 2..N (pixel data).
   * Pixel data starts at offset 3 (after mainSub, seq, seqMax).
   */
  private handleSequencePixels(
    scopeData: Buffer,
    seq: number,
    seqMax: number,
  ): void {
    if (!this.assembly) return;

    if (seq !== this.assembly.lastSeq + 1) {
      this.assembly = null;
      this.framesDropped++;
      return;
    }

    this.assembly.lastSeq = seq;
    this.assembly.lastUpdateMs = Date.now();

    for (let i = 3; i < scopeData.length; i++) {
      this.assembly.pixels.push(scopeData[i]);
    }

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

    let centerHz: number;
    let spanHz: number;

    if (scopeMode === ScopeMode.Center) {
      centerHz = startFreqHz;
      spanHz = endFreqHz * 2;
    } else {
      centerHz = (startFreqHz + endFreqHz) / 2;
      spanHz = endFreqHz - startFreqHz;
    }

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
