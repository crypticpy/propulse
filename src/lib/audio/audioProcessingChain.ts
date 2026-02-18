// ---------------------------------------------------------------------------
// AudioProcessingChain — Modular Web Audio DSP chain with EQ and notch filter management
// ---------------------------------------------------------------------------

import type { EqBand } from "./eqTypes";
import {
  EQ_FILTER_TO_BIQUAD,
  MAX_EQ_BANDS,
  filterTypeUsesGain,
} from "./eqTypes";
import {
  createNoiseGateNode,
  updateNoiseGateParams as updateGateParams,
  type NoiseGateParams,
} from "./noiseGate";
import {
  createExpanderNode,
  updateExpanderParams as updateExpanderParams,
  type ExpanderParams,
} from "./expander";
import {
  createSpectralNrNode,
  updateSpectralNrParams as updateNrParams,
  type SpectralNrParams,
} from "./spectralNr";
import {
  createSweetenerNodes,
  updateSweetenerNodes,
  type SweetenerParams,
} from "./sweetener";
import {
  createSpectralTamingNode,
  updateSpectralTamingParams,
  type SpectralTamingParams,
} from "./spectralTaming";
import {
  createPsychoacousticLevelerNode,
  updatePsychoacousticLevelerParams,
  type PsychoacousticLevelerParams,
} from "./psychoacousticLeveler";

export type { NoiseGateParams } from "./noiseGate";
export type { ExpanderParams } from "./expander";
export type { SpectralNrParams } from "./spectralNr";
export type { SweetenerParams } from "./sweetener";
export type { SpectralTamingParams } from "./spectralTaming";
export type { PsychoacousticLevelerParams } from "./psychoacousticLeveler";

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

interface InternalEqBand {
  config: EqBand;
  nodes: BiquadFilterNode[];
}

const MAX_NOTCH_FILTERS = 8;

export class AudioProcessingChain {
  private readonly ctx: AudioContext;
  private readonly inputGain: GainNode;
  private readonly outputGain: GainNode;
  private notchFilters: InternalNotchFilter[] = [];
  private eqBands: InternalEqBand[] = [];
  private sweetenerNodes: BiquadFilterNode[] | null = null;
  private expanderNode: AudioWorkletNode | null = null;
  private noiseGateNode: AudioWorkletNode | null = null;
  private spectralNrNode: AudioWorkletNode | null = null;
  private spectralTamingNode: AudioWorkletNode | null = null;
  private levelerNode: AudioWorkletNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private compressorMakeupGain: GainNode | null = null;
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
  // Unified EQ bands (supports all BiquadFilterNode types)
  // ---------------------------------------------------------------------------

  /**
   * Synchronise the internal EQ band set with an external array of EqBand configs.
   * Adds, removes, and updates bands as needed so the chain matches `configs`.
   */
  syncEqBands(configs: EqBand[]): void {
    if (this.disposed) return;

    const incomingIds = new Set(configs.map((c) => c.id));
    const currentIds = new Set(this.eqBands.map((f) => f.config.id));

    // Remove bands not in incoming
    const toRemove = this.eqBands.filter((f) => !incomingIds.has(f.config.id));
    for (const entry of toRemove) {
      for (const node of entry.nodes) node.disconnect();
    }
    this.eqBands = this.eqBands.filter((f) => incomingIds.has(f.config.id));

    let needsRebuild = toRemove.length > 0;

    for (const cfg of configs) {
      const stageCount = Math.max(1, Math.min(4, (cfg.slope ?? 12) / 12));

      if (currentIds.has(cfg.id)) {
        // Update existing
        const entry = this.eqBands.find((f) => f.config.id === cfg.id)!;
        const oldStageCount = entry.nodes.length;

        if (oldStageCount !== stageCount) {
          // Slope changed — recreate nodes
          for (const node of entry.nodes) node.disconnect();
          entry.nodes = [];
          for (let i = 0; i < stageCount; i++) {
            const node = this.ctx.createBiquadFilter();
            this.configureBiquadNode(node, cfg);
            entry.nodes.push(node);
          }
          needsRebuild = true;
        } else {
          // Same slope — just reconfigure each node
          for (const node of entry.nodes) {
            this.configureBiquadNode(node, cfg);
          }
        }
        entry.config = { ...cfg };
      } else {
        // Add new (with MAX_EQ_BANDS limit)
        if (this.eqBands.length >= MAX_EQ_BANDS) continue;
        const nodes: BiquadFilterNode[] = [];
        for (let i = 0; i < stageCount; i++) {
          const node = this.ctx.createBiquadFilter();
          this.configureBiquadNode(node, cfg);
          nodes.push(node);
        }
        this.eqBands.push({ config: { ...cfg }, nodes });
        needsRebuild = true;
      }
    }

    // Reorder to match incoming
    const orderMap = new Map(configs.map((c, i) => [c.id, i]));
    this.eqBands.sort(
      (a, b) =>
        (orderMap.get(a.config.id) ?? 0) - (orderMap.get(b.config.id) ?? 0),
    );

    if (needsRebuild) this.rebuildChain();
  }

  /** Return a snapshot of all current EQ band configs. */
  getEqBands(): EqBand[] {
    return this.eqBands.map((f) => ({ ...f.config }));
  }

  // ---------------------------------------------------------------------------
  // Sweetener
  // ---------------------------------------------------------------------------

  /** Enable/disable the "sweetener" fixed EQ preset and update its amount. */
  setSweetener(enabled: boolean, params?: Partial<SweetenerParams>): void {
    if (this.disposed) return;

    if (enabled) {
      const amount = params?.amount ?? 0.5;
      if (!this.sweetenerNodes) {
        this.sweetenerNodes = createSweetenerNodes(this.ctx, { amount });
        this.rebuildChain();
      } else {
        updateSweetenerNodes(this.sweetenerNodes, { amount });
      }
      return;
    }

    if (this.sweetenerNodes) {
      for (const node of this.sweetenerNodes) node.disconnect();
      this.sweetenerNodes = null;
      this.rebuildChain();
    }
  }

  // ---------------------------------------------------------------------------
  // Expander
  // ---------------------------------------------------------------------------

  /** Enable/disable downward expander and optionally update its parameters. */
  async setExpander(
    enabled: boolean,
    params?: Partial<ExpanderParams>,
  ): Promise<void> {
    if (this.disposed) return;

    if (enabled) {
      if (!this.expanderNode) {
        const node = await createExpanderNode(this.ctx, params);
        if (this.disposed) {
          try {
            node.disconnect();
          } catch {
            // ignore
          }
          return;
        }
        this.expanderNode = node;
        this.rebuildChain();
      } else if (params) {
        updateExpanderParams(this.expanderNode, params);
      }
    } else {
      if (this.expanderNode) {
        this.expanderNode.disconnect();
        this.expanderNode = null;
        this.rebuildChain();
      }
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
        const node = await createNoiseGateNode(this.ctx, params);
        if (this.disposed) {
          try {
            node.disconnect();
          } catch {
            // ignore
          }
          return;
        }
        this.noiseGateNode = node;
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
  // Spectral Taming
  // ---------------------------------------------------------------------------

  /** Enable/disable spectral taming and update its parameters. */
  async setSpectralTaming(
    enabled: boolean,
    params: SpectralTamingParams,
  ): Promise<void> {
    if (this.disposed) return;

    if (enabled) {
      if (!this.spectralTamingNode) {
        const node = await createSpectralTamingNode(this.ctx, params);
        if (this.disposed) {
          try {
            node.disconnect();
          } catch {
            // ignore
          }
          return;
        }
        this.spectralTamingNode = node;
        this.rebuildChain();
      } else {
        updateSpectralTamingParams(this.spectralTamingNode, params);
      }
    } else {
      if (this.spectralTamingNode) {
        this.spectralTamingNode.disconnect();
        this.spectralTamingNode = null;
        this.rebuildChain();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Psychoacoustic Leveler
  // ---------------------------------------------------------------------------

  /** Enable/disable the psychoacoustic leveler and update its parameters. */
  async setPsychoacousticLeveler(
    enabled: boolean,
    params: PsychoacousticLevelerParams,
  ): Promise<void> {
    if (this.disposed) return;

    if (enabled) {
      if (!this.levelerNode) {
        const node = await createPsychoacousticLevelerNode(this.ctx, params);
        if (this.disposed) {
          try {
            node.disconnect();
          } catch {
            // ignore
          }
          return;
        }
        this.levelerNode = node;
        this.rebuildChain();
      } else {
        updatePsychoacousticLevelerParams(this.levelerNode, params);
      }
    } else {
      if (this.levelerNode) {
        this.levelerNode.disconnect();
        this.levelerNode = null;
        this.rebuildChain();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Compressor
  // ---------------------------------------------------------------------------

  /**
   * Enable/disable the compressor and optionally update its parameters.
   *
   * Uses the built-in DynamicsCompressorNode plus a makeup GainNode.
   */
  setCompressor(
    enabled: boolean,
    params?: Partial<{
      threshold: number; // dB
      ratio: number;
      attackMs: number;
      releaseMs: number;
      knee: number; // dB
      makeupDb: number;
    }>,
  ): void {
    if (this.disposed) return;

    if (enabled) {
      if (!this.compressorNode || !this.compressorMakeupGain) {
        this.compressorNode = this.ctx.createDynamicsCompressor();
        this.compressorMakeupGain = this.ctx.createGain();
        this.applyCompressorParams(params);
        this.rebuildChain();
      } else {
        this.applyCompressorParams(params);
      }
      return;
    }

    if (this.compressorNode) {
      this.compressorNode.disconnect();
      this.compressorNode = null;
    }
    if (this.compressorMakeupGain) {
      this.compressorMakeupGain.disconnect();
      this.compressorMakeupGain = null;
    }
    this.rebuildChain();
  }

  private applyCompressorParams(
    params?: Partial<{
      threshold: number;
      ratio: number;
      attackMs: number;
      releaseMs: number;
      knee: number;
      makeupDb: number;
    }>,
  ): void {
    if (!params || !this.compressorNode) return;

    if (params.threshold !== undefined) {
      this.compressorNode.threshold.value = params.threshold;
    }
    if (params.ratio !== undefined) {
      this.compressorNode.ratio.value = params.ratio;
    }
    if (params.knee !== undefined) {
      this.compressorNode.knee.value = params.knee;
    }
    if (params.attackMs !== undefined) {
      this.compressorNode.attack.value = Math.max(0, params.attackMs / 1000);
    }
    if (params.releaseMs !== undefined) {
      this.compressorNode.release.value = Math.max(0, params.releaseMs / 1000);
    }
    if (params.makeupDb !== undefined && this.compressorMakeupGain) {
      this.compressorMakeupGain.gain.value = Math.pow(10, params.makeupDb / 20);
    }
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
    this.notchFilters = [];
    for (const entry of this.eqBands) {
      for (const node of entry.nodes) node.disconnect();
    }
    this.eqBands = [];
    if (this.sweetenerNodes) {
      for (const node of this.sweetenerNodes) node.disconnect();
      this.sweetenerNodes = null;
    }
    if (this.expanderNode) {
      this.expanderNode.disconnect();
      this.expanderNode = null;
    }
    if (this.noiseGateNode) {
      this.noiseGateNode.disconnect();
      this.noiseGateNode = null;
    }
    if (this.spectralNrNode) {
      this.spectralNrNode.disconnect();
      this.spectralNrNode = null;
    }
    if (this.spectralTamingNode) {
      this.spectralTamingNode.disconnect();
      this.spectralTamingNode = null;
    }
    if (this.levelerNode) {
      this.levelerNode.disconnect();
      this.levelerNode = null;
    }
    if (this.compressorNode) {
      this.compressorNode.disconnect();
      this.compressorNode = null;
    }
    if (this.compressorMakeupGain) {
      this.compressorMakeupGain.disconnect();
      this.compressorMakeupGain = null;
    }
    this.outputGain.disconnect();
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

  private configureBiquadNode(node: BiquadFilterNode, band: EqBand): void {
    node.type = EQ_FILTER_TO_BIQUAD[band.filterType];
    node.frequency.value = band.freqHz;

    if (band.enabled) {
      node.Q.value = band.q;
      if (filterTypeUsesGain(band.filterType)) {
        node.gain.value = band.gainDb;
      } else {
        node.gain.value = 0;
      }
    } else {
      // Bypass: move cutoff to extreme so all frequencies pass through
      if (band.filterType === "lowpass") {
        node.frequency.value = 24000; // Pass everything
        node.Q.value = 0.0001;
      } else if (band.filterType === "highpass") {
        node.frequency.value = 1; // Pass everything
        node.Q.value = 0.0001;
      } else {
        node.Q.value = 0.0001;
      }
      node.gain.value = 0;
    }
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
   *   inputGain → notch → eq → sweetener → expander → noiseGate → spectralNR → spectralTaming → leveler → compressor → outputGain
   */
  private rebuildChain(): void {
    // Disconnect everything first
    this.inputGain.disconnect();
    for (const entry of this.notchFilters) {
      entry.node.disconnect();
    }
    for (const entry of this.eqBands) {
      for (const node of entry.nodes) node.disconnect();
    }
    if (this.sweetenerNodes) {
      for (const node of this.sweetenerNodes) node.disconnect();
    }
    if (this.spectralTamingNode) this.spectralTamingNode.disconnect();
    if (this.expanderNode) this.expanderNode.disconnect();
    if (this.noiseGateNode) this.noiseGateNode.disconnect();
    if (this.spectralNrNode) this.spectralNrNode.disconnect();
    if (this.levelerNode) this.levelerNode.disconnect();
    if (this.compressorNode) this.compressorNode.disconnect();
    if (this.compressorMakeupGain) this.compressorMakeupGain.disconnect();
    // Note: we do NOT disconnect outputGain — it may be connected to destination

    // Build the ordered list of nodes between inputGain and outputGain
    const chain: AudioNode[] = [
      ...this.notchFilters.map((f) => f.node),
      ...this.eqBands.flatMap((f) => f.nodes),
      ...(this.sweetenerNodes ? this.sweetenerNodes : []),
      ...(this.expanderNode ? [this.expanderNode] : []),
      ...(this.noiseGateNode ? [this.noiseGateNode] : []),
      ...(this.spectralNrNode ? [this.spectralNrNode] : []),
      ...(this.spectralTamingNode ? [this.spectralTamingNode] : []),
      ...(this.levelerNode ? [this.levelerNode] : []),
      ...(this.compressorNode && this.compressorMakeupGain
        ? [this.compressorNode, this.compressorMakeupGain]
        : []),
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
