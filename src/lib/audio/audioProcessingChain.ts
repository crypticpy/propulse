// ---------------------------------------------------------------------------
// AudioProcessingChain — Modular Web Audio DSP chain with notch filter management
// ---------------------------------------------------------------------------

import {
  createNoiseGateNode,
  updateNoiseGateParams as updateGateParams,
  type NoiseGateParams,
} from "./noiseGate";
import {
  createSpectralNrNode,
  updateSpectralNrParams as updateNrParams,
  type SpectralNrParams,
} from "./spectralNr";

export type { NoiseGateParams } from "./noiseGate";
export type { SpectralNrParams } from "./spectralNr";

export interface NotchFilterConfig {
  id: string;
  freqHz: number;
  q: number;
  enabled: boolean;
}

interface InternalNotchFilter {
  config: NotchFilterConfig;
  node: BiquadFilterNode;
}

const MAX_NOTCH_FILTERS = 8;

export class AudioProcessingChain {
  private readonly ctx: AudioContext;
  private readonly inputGain: GainNode;
  private readonly outputGain: GainNode;
  private notchFilters: InternalNotchFilter[] = [];
  private noiseGateNode: AudioWorkletNode | null = null;
  private spectralNrNode: AudioWorkletNode | null = null;
  private idCounter = 0;
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.inputGain = ctx.createGain();
    this.outputGain = ctx.createGain();

    // Initial chain: input → output (no filters yet)
    this.inputGain.connect(this.outputGain);
  }

  // ---------------------------------------------------------------------------
  // Notch filter management
  // ---------------------------------------------------------------------------

  /** Add a notch filter and return its unique ID. */
  addNotchFilter(freqHz: number, q: number): string {
    if (this.disposed) throw new Error("AudioProcessingChain is disposed");

    if (this.notchFilters.length >= MAX_NOTCH_FILTERS) {
      console.warn(
        `AudioProcessingChain: cannot add notch filter — maximum of ${MAX_NOTCH_FILTERS} reached`,
      );
      throw new Error(`Maximum of ${MAX_NOTCH_FILTERS} notch filters reached`);
    }

    const id = this.generateId();
    const node = this.createNotchNode(freqHz, q);
    const config: NotchFilterConfig = { id, freqHz, q, enabled: true };

    this.notchFilters.push({ config, node });
    this.rebuildChain();

    return id;
  }

  /** Remove a notch filter by ID. */
  removeNotchFilter(id: string): void {
    if (this.disposed) return;

    const index = this.notchFilters.findIndex((f) => f.config.id === id);
    if (index === -1) return;

    this.notchFilters[index].node.disconnect();
    this.notchFilters.splice(index, 1);
    this.rebuildChain();
  }

  /** Update frequency and Q of an existing notch filter (no reconnect needed). */
  updateNotchFilter(id: string, freqHz: number, q: number): void {
    if (this.disposed) return;

    const entry = this.notchFilters.find((f) => f.config.id === id);
    if (!entry) return;

    entry.config.freqHz = freqHz;
    entry.config.q = q;
    entry.node.frequency.value = freqHz;

    // Only apply Q directly if the filter is enabled; otherwise keep bypass Q
    if (entry.config.enabled) {
      entry.node.Q.value = q;
    }
  }

  /** Enable or disable a notch filter. Disabled filters use near-zero Q to bypass. */
  setNotchFilterEnabled(id: string, enabled: boolean): void {
    if (this.disposed) return;

    const entry = this.notchFilters.find((f) => f.config.id === id);
    if (!entry) return;

    entry.config.enabled = enabled;

    if (enabled) {
      entry.node.Q.value = entry.config.q;
    } else {
      // Q ≈ 0 effectively disables the notch (flat response)
      entry.node.Q.value = 0.0001;
    }
  }

  /** Return a snapshot of all current notch filter configs. */
  getNotchFilters(): NotchFilterConfig[] {
    return this.notchFilters.map((f) => ({ ...f.config }));
  }

  /**
   * Synchronise the internal filter set with an external array of configs.
   * Adds, removes, and updates filters as needed so the chain matches `configs`.
   */
  syncNotchFilters(configs: NotchFilterConfig[]): void {
    if (this.disposed) return;

    const incomingIds = new Set(configs.map((c) => c.id));
    const currentIds = new Set(this.notchFilters.map((f) => f.config.id));

    // Remove filters not present in incoming configs
    const toRemove = this.notchFilters.filter(
      (f) => !incomingIds.has(f.config.id),
    );
    for (const entry of toRemove) {
      entry.node.disconnect();
    }
    this.notchFilters = this.notchFilters.filter((f) =>
      incomingIds.has(f.config.id),
    );

    // Add or update filters from incoming configs
    let needsRebuild = toRemove.length > 0;

    for (const cfg of configs) {
      if (currentIds.has(cfg.id)) {
        // Update existing
        const entry = this.notchFilters.find((f) => f.config.id === cfg.id)!;
        entry.config.freqHz = cfg.freqHz;
        entry.config.q = cfg.q;
        entry.config.enabled = cfg.enabled;
        entry.node.frequency.value = cfg.freqHz;
        entry.node.Q.value = cfg.enabled ? cfg.q : 0.0001;
      } else {
        // Add new
        if (this.notchFilters.length >= MAX_NOTCH_FILTERS) {
          console.warn(
            `AudioProcessingChain: syncNotchFilters skipping filter "${cfg.id}" — maximum of ${MAX_NOTCH_FILTERS} reached`,
          );
          continue;
        }
        const node = this.createNotchNode(
          cfg.freqHz,
          cfg.enabled ? cfg.q : 0.0001,
        );
        this.notchFilters.push({ config: { ...cfg }, node });
        needsRebuild = true;
      }
    }

    // Reorder to match incoming order
    const orderMap = new Map(configs.map((c, i) => [c.id, i]));
    this.notchFilters.sort(
      (a, b) =>
        (orderMap.get(a.config.id) ?? 0) - (orderMap.get(b.config.id) ?? 0),
    );

    if (needsRebuild) {
      this.rebuildChain();
    }
  }

  // ---------------------------------------------------------------------------
  // Noise Gate
  // ---------------------------------------------------------------------------

  /** Enable/disable the noise gate and optionally update its parameters. */
  async setNoiseGate(
    enabled: boolean,
    params?: Partial<NoiseGateParams>,
  ): Promise<void> {
    if (this.disposed) return;

    if (enabled) {
      if (!this.noiseGateNode) {
        this.noiseGateNode = await createNoiseGateNode(this.ctx, params);
        this.rebuildChain();
      } else if (params) {
        updateGateParams(this.noiseGateNode, params);
      }
    } else {
      if (this.noiseGateNode) {
        this.noiseGateNode.disconnect();
        this.noiseGateNode = null;
        this.rebuildChain();
      }
    }
  }

  /** Update noise gate parameters without changing topology. */
  updateNoiseGateParams(params: Partial<NoiseGateParams>): void {
    if (this.disposed || !this.noiseGateNode) return;
    updateGateParams(this.noiseGateNode, params);
  }

  // ---------------------------------------------------------------------------
  // Spectral NR
  // ---------------------------------------------------------------------------

  /** Enable/disable spectral noise reduction and optionally update its parameters. */
  async setSpectralNr(
    enabled: boolean,
    params?: Partial<SpectralNrParams>,
  ): Promise<void> {
    if (this.disposed) return;

    if (enabled) {
      if (!this.spectralNrNode) {
        this.spectralNrNode = await createSpectralNrNode(this.ctx, params);
        this.rebuildChain();
      } else if (params) {
        updateNrParams(this.spectralNrNode, params);
      }
    } else {
      if (this.spectralNrNode) {
        this.spectralNrNode.disconnect();
        this.spectralNrNode = null;
        this.rebuildChain();
      }
    }
  }

  /** Update spectral NR parameters without changing topology. */
  updateSpectralNrParams(params: Partial<SpectralNrParams>): void {
    if (this.disposed || !this.spectralNrNode) return;
    updateNrParams(this.spectralNrNode, params);
  }

  // ---------------------------------------------------------------------------
  // Gain
  // ---------------------------------------------------------------------------

  /** Set the output gain (0 = silent, 1 = unity). Applies to outputGain node. */
  setGain(value: number): void {
    if (this.disposed) return;
    this.outputGain.gain.value = value;
  }

  // ---------------------------------------------------------------------------
  // Chain connection points
  // ---------------------------------------------------------------------------

  /** Node to connect upstream sources into (e.g. MediaStreamSource → inputNode). */
  getInputNode(): AudioNode {
    return this.inputGain;
  }

  /** Node to connect downstream to (e.g. outputNode → ctx.destination). */
  getOutputNode(): AudioNode {
    return this.outputGain;
  }

  /** The AudioContext this chain was created with. */
  getAudioContext(): AudioContext {
    return this.ctx;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /** Disconnect all nodes and mark chain as disposed. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.inputGain.disconnect();
    for (const entry of this.notchFilters) {
      entry.node.disconnect();
    }
    if (this.noiseGateNode) {
      this.noiseGateNode.disconnect();
      this.noiseGateNode = null;
    }
    if (this.spectralNrNode) {
      this.spectralNrNode.disconnect();
      this.spectralNrNode = null;
    }
    this.outputGain.disconnect();
    this.notchFilters = [];
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private generateId(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    this.idCounter += 1;
    return `notch-${this.idCounter}-${Date.now()}`;
  }

  private createNotchNode(freqHz: number, q: number): BiquadFilterNode {
    const node = this.ctx.createBiquadFilter();
    node.type = "notch";
    node.frequency.value = freqHz;
    node.Q.value = q;
    return node;
  }

  /**
   * Disconnect the entire chain and reconnect in order:
   *   inputGain → notch[0] → ... → noiseGate → spectralNR → outputGain
   */
  private rebuildChain(): void {
    // Disconnect everything first
    this.inputGain.disconnect();
    for (const entry of this.notchFilters) {
      entry.node.disconnect();
    }
    if (this.noiseGateNode) this.noiseGateNode.disconnect();
    if (this.spectralNrNode) this.spectralNrNode.disconnect();
    // Note: we do NOT disconnect outputGain — it may be connected to destination

    // Build the ordered list of nodes between inputGain and outputGain
    const chain: AudioNode[] = [
      ...this.notchFilters.map((f) => f.node),
      ...(this.noiseGateNode ? [this.noiseGateNode] : []),
      ...(this.spectralNrNode ? [this.spectralNrNode] : []),
    ];

    if (chain.length === 0) {
      this.inputGain.connect(this.outputGain);
      return;
    }

    // Connect: input → first node
    this.inputGain.connect(chain[0]);

    // Connect nodes in series
    for (let i = 0; i < chain.length - 1; i++) {
      chain[i].connect(chain[i + 1]);
    }

    // Connect last node → output
    chain[chain.length - 1].connect(this.outputGain);
  }
}
