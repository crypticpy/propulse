import { ANTENNA_TYPES, getAntennaGain } from "@/lib/data/antennas";
import {
  BAND_CENTER_FREQUENCIES,
  calculateTotalFeedlineLoss,
} from "@/lib/data/feedlines";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type {
  InlineComponent,
  StationPreset,
  UserAccessory,
  UserAntenna,
  UserFeedline,
} from "@/types/shack";
import type {
  ChainNode,
  StationChain,
} from "@/types/stationChain";
import { stationPresetToChain } from "@/lib/station/stationPresetToChain";

const ISOTROPIC_TO_DIPOLE_DB = 2.15;
const DEFAULT_SWR = 1.5;

const DIRECTIONAL_BEAMWIDTH_DEG: Partial<Record<UserAntenna["gainPatternType"], number>> = {
  yagi_3el: 60,
  yagi_5el: 45,
  hex_beam: 70,
};

export type StationWarningSeverity = "info" | "warning" | "error";

export interface StationWarning {
  code: string;
  severity: StationWarningSeverity;
  message: string;
  equipmentId?: string;
  band?: string;
}

export interface ResolvedUserRadio {
  userRadio: UserRadio;
  equipment: RadioEquipment | undefined;
}

export interface StationInventory {
  radios: ResolvedUserRadio[];
  antennas: UserAntenna[];
  feedlines: UserFeedline[];
  accessories: UserAccessory[];
  inlineComponents: InlineComponent[];
}

export interface StationCalculationOptions {
  bands?: string[];
  targetBearingDeg?: number;
  takeoffAngleDeg?: number;
  mode?: string;
  preferTestedSpecs?: boolean;
  localNoiseFloorDbm?: number;
}

export interface StationFeatureEnvelope {
  featureContract: "station-chain-v1";
  chainFingerprint: string;
  band: string;
  frequencyMHz: number;
  mode: string;
  requestedPowerWatts: number;
  conductedPowerWatts: number;
  powerAtAntennaWatts: number;
  eirpWatts: number;
  erpWatts: number;
  totalPassiveLossDb: number;
  feedlineLossDb: number;
  inlineLossDb: number;
  amplifierGainDb: number;
  antennaGainTowardPathDbi: number;
  targetBearingDeg: number | null;
  takeoffAngleDeg: number | null;
  receiverNoiseFloorDbm: number | null;
  receiverEvidence: "independent_test" | "manufacturer_claim" | "unknown";
  receiverEvidenceIsRelative: true;
  localSystemNoiseFloorDbm: number | null;
  modeBandwidthHz: number;
  modeSnrThresholdDb: number;
  supported: boolean;
  warningCodes: string[];
  assumptions: string[];
}

export interface NodePerformance {
  nodeIndex: number;
  nodeType: ChainNode["type"];
  label: string;
  inputPowerWatts: number;
  lossDb: number;
  gainDb: number;
  netDb: number;
  outputPowerWatts: number;
  supported: boolean;
  warnings: StationWarning[];
}

export interface BandChainPerformance {
  band: string;
  freqMHz: number;
  requestedPowerWatts: number;
  txPowerWatts: number;
  nodes: NodePerformance[];
  totalSystemGainDb: number;
  totalPassiveLossDb: number;
  totalAmplifierGainDb: number;
  feedlineLossDb: number;
  inlineLossDb: number;
  accessoryGainDb: number;
  antennaGainDbi: number;
  powerAtAntennaWatts: number;
  eirpWatts: number;
  erpWatts: number;
  supported: boolean;
  warnings: StationWarning[];
}

export interface ChainPerformanceResult {
  chain: StationChain | null;
  bands: BandChainPerformance[];
  bestBand: BandChainPerformance | null;
  worstBand: BandChainPerformance | null;
  warnings: StationWarning[];
}

export interface PresetPerformanceResult {
  preset: StationPreset | null;
  bands: BandChainPerformance[];
  bestBand: BandChainPerformance | null;
  worstBand: BandChainPerformance | null;
  totalLossRangeDb: string;
  warnings: StationWarning[];
}

export const EMPTY_CHAIN_PERFORMANCE: ChainPerformanceResult = {
  chain: null,
  bands: [],
  bestBand: null,
  worstBand: null,
  warnings: [],
};

export const EMPTY_PRESET_PERFORMANCE: PresetPerformanceResult = {
  preset: null,
  bands: [],
  bestBand: null,
  worstBand: null,
  totalLossRangeDb: "",
  warnings: [],
};

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

// snrThresholdDb values use the WSJT-X convention: SNR referenced to a
// 2500 Hz noise bandwidth, so thresholds are directly comparable across modes.
const MODE_LINK_ASSUMPTIONS: Record<
  string,
  { bandwidthHz: number; snrThresholdDb: number }
> = {
  WSPR: { bandwidthHz: 6, snrThresholdDb: -28 },
  FT8: { bandwidthHz: 50, snrThresholdDb: -21 },
  FT4: { bandwidthHz: 90, snrThresholdDb: -17.5 },
  CW: { bandwidthHz: 100, snrThresholdDb: -15 },
  DATA: { bandwidthHz: 500, snrThresholdDb: -10 },
  RTTY: { bandwidthHz: 250, snrThresholdDb: -5 },
  SSB: { bandwidthHz: 2400, snrThresholdDb: 10 },
  AM: { bandwidthHz: 6000, snrThresholdDb: 15 },
  FM: { bandwidthHz: 12000, snrThresholdDb: 19 },
};

function stableFingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index++) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function dbForRatio(output: number, input: number): number {
  if (input <= 0 || output <= 0) return 0;
  return 10 * Math.log10(output / input);
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angularDifferenceDeg(a: number, b: number): number {
  const delta = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(delta, 360 - delta);
}

function equipmentLabel(equipment: RadioEquipment | undefined): string {
  if (!equipment) return "Unknown Radio";
  return equipment.displayName ?? `${equipment.manufacturer} ${equipment.model}`;
}

function warning(
  code: string,
  severity: StationWarningSeverity,
  message: string,
  equipmentId?: string,
  band?: string,
): StationWarning {
  return { code, severity, message, equipmentId, band };
}

function resolveRadioPower(
  chain: StationChain,
  radioId: string,
  inventory: StationInventory,
  band: string,
): {
  requestedPowerWatts: number;
  txPowerWatts: number;
  label: string;
  supported: boolean;
  warnings: StationWarning[];
} {
  const requestedPowerWatts = clampNonNegative(chain.operatingPowerWatts);
  const resolved = inventory.radios.find((entry) => entry.userRadio.id === radioId);
  if (!resolved?.equipment) {
    return {
      requestedPowerWatts,
      txPowerWatts: 0,
      label: "Unknown Radio",
      supported: false,
      warnings: [
        warning(
          "radio_missing",
          "error",
          "The station chain references a radio that is not available.",
          radioId,
          band,
        ),
      ],
    };
  }

  const { equipment, userRadio } = resolved;
  const warnings: StationWarning[] = [];
  const supported = equipment.bands.includes(band);
  if (!supported) {
    warnings.push(
      warning(
        "radio_band_unsupported",
        "error",
        `${equipmentLabel(equipment)} does not declare support for ${band}.`,
        radioId,
        band,
      ),
    );
  }

  const userLimit = userRadio.customPowerLimit;
  const maxPower = Math.max(
    0,
    Math.min(
      equipment.maxPower,
      userLimit == null ? equipment.maxPower : clampNonNegative(userLimit),
    ),
  );
  const txPowerWatts = supported ? Math.min(requestedPowerWatts, maxPower) : 0;

  if (requestedPowerWatts > maxPower) {
    warnings.push(
      warning(
        "radio_power_capped",
        "warning",
        `Requested power was capped from ${requestedPowerWatts.toFixed(1)} W to ${maxPower.toFixed(1)} W.`,
        radioId,
        band,
      ),
    );
  }
  if (requestedPowerWatts > 0 && requestedPowerWatts < equipment.minPower) {
    warnings.push(
      warning(
        "radio_below_declared_minimum",
        "warning",
        `Requested power is below the radio's declared ${equipment.minPower.toFixed(1)} W minimum.`,
        radioId,
        band,
      ),
    );
  }

  return {
    requestedPowerWatts,
    txPowerWatts,
    label: equipmentLabel(equipment),
    supported,
    warnings,
  };
}
function accessoryEffect(
  accessory: UserAccessory,
  inputPowerWatts: number,
  band: string,
): {
  outputPowerWatts: number;
  gainDb: number;
  lossDb: number;
  supported: boolean;
  warnings: StationWarning[];
} {
  const warnings: StationWarning[] = [];
  const declaredBands = "bands" in accessory ? accessory.bands : undefined;
  if (declaredBands?.length && !declaredBands.includes(band)) {
    return {
      outputPowerWatts: 0,
      gainDb: 0,
      lossDb: 0,
      supported: false,
      warnings: [
        warning(
          "accessory_band_unsupported",
          "error",
          `${accessory.name} does not declare support for ${band}.`,
          accessory.id,
          band,
        ),
      ],
    };
  }

  if (accessory.category === "amplifier") {
    const declaredGainDb = clampNonNegative(accessory.gainDb);
    const idealOutput = inputPowerWatts * Math.pow(10, declaredGainDb / 10);
    const maxOutput = clampNonNegative(accessory.maxPowerWatts);
    const outputPowerWatts = Math.min(idealOutput, maxOutput);
    if (idealOutput > maxOutput) {
      warnings.push(
        warning(
          "amplifier_output_capped",
          "warning",
          `${accessory.name} output was capped at ${maxOutput.toFixed(1)} W.`,
          accessory.id,
          band,
        ),
      );
    }
    return {
      outputPowerWatts,
      gainDb: dbForRatio(outputPowerWatts, inputPowerWatts),
      lossDb: 0,
      supported: true,
      warnings,
    };
  }

  let declaredLossDb = 0;
  if (accessory.category === "tuner") {
    declaredLossDb = accessory.insertionLossDb ?? 0;
  } else if (
    accessory.category === "filter" ||
    accessory.category === "switch"
  ) {
    declaredLossDb = accessory.insertionLossDb;
  }
  if (declaredLossDb < 0) {
    warnings.push(
      warning(
        "negative_passive_loss_rejected",
        "error",
        `${accessory.name} had a negative passive loss; zero was used.`,
        accessory.id,
        band,
      ),
    );
  }
  const lossDb = clampNonNegative(declaredLossDb);
  return {
    outputPowerWatts: inputPowerWatts * Math.pow(10, -lossDb / 10),
    gainDb: 0,
    lossDb,
    supported: true,
    warnings,
  };
}

function antennaGainForPath(
  antenna: UserAntenna,
  band: string,
  options: StationCalculationOptions,
): { gainDbi: number; warnings: StationWarning[] } {
  const definition = ANTENNA_TYPES.find(
    (candidate) => candidate.type === antenna.gainPatternType,
  );
  const peakGainDbi = antenna.gainDbiOverride?.[band] ?? definition?.peakGainDbi ?? 0;
  let gainDbi = peakGainDbi;
  const warnings: StationWarning[] = [];

  if (options.takeoffAngleDeg != null && definition) {
    const modeledGain = getAntennaGain(
      antenna.gainPatternType,
      options.takeoffAngleDeg,
    );
    gainDbi = peakGainDbi + (modeledGain - definition.peakGainDbi);
  }

  const beamwidth = DIRECTIONAL_BEAMWIDTH_DEG[antenna.gainPatternType];
  if (beamwidth != null) {
    if (options.targetBearingDeg == null) {
      warnings.push(
        warning(
          "peak_directional_gain_assumed",
          "info",
          `${antenna.name} uses peak forward gain because no target bearing was supplied.`,
          antenna.id,
          band,
        ),
      );
    } else if (antenna.azimuthDeg != null) {
      const offset = angularDifferenceDeg(
        antenna.azimuthDeg,
        options.targetBearingDeg,
      );
      const halfPowerOffset = beamwidth / 2;
      const attenuationDb = Math.min(25, 3 * Math.pow(offset / halfPowerOffset, 2));
      gainDbi -= attenuationDb;
    } else if (antenna.isRotatable) {
      warnings.push(
        warning(
          "rotor_heading_assumed",
          "warning",
          `${antenna.name} is assumed to be pointed toward the target because no rotor heading is recorded.`,
          antenna.id,
          band,
        ),
      );
    } else {
      warnings.push(
        warning(
          "antenna_azimuth_unknown",
          "warning",
          `${antenna.name} has no azimuth, so directional gain is uncertain.`,
          antenna.id,
          band,
        ),
      );
    }
  }

  return { gainDbi, warnings };
}

function findAntenna(chain: StationChain, inventory: StationInventory): UserAntenna | undefined {
  const node = chain.nodes.find((candidate) => candidate.type === "antenna");
  return node?.type === "antenna"
    ? inventory.antennas.find((antenna) => antenna.id === node.antennaId)
    : undefined;
}

function evaluateBand(
  chain: StationChain,
  inventory: StationInventory,
  antenna: UserAntenna,
  band: string,
  options: StationCalculationOptions,
): BandChainPerformance | null {
  const freqMHz = BAND_CENTER_FREQUENCIES[band];
  if (freqMHz == null) return null;

  const nodes: NodePerformance[] = [];
  const warnings: StationWarning[] = [];
  let currentPowerWatts = clampNonNegative(chain.operatingPowerWatts);
  let requestedPowerWatts = currentPowerWatts;
  let txPowerWatts = 0;
  let feedlineLossDb = 0;
  let inlineLossDb = 0;
  let totalPassiveLossDb = 0;
  let totalAmplifierGainDb = 0;
  let antennaGainDbi = 0;
  let powerAtAntennaWatts = 0;
  let supported = true;

  for (let nodeIndex = 0; nodeIndex < chain.nodes.length; nodeIndex++) {
    const node = chain.nodes[nodeIndex];
    const inputPowerWatts = currentPowerWatts;
    let label = "Unknown Equipment";
    let gainDb = 0;
    let lossDb = 0;
    let nodeSupported = true;
    let nodeWarnings: StationWarning[] = [];

    if (node.type === "radio") {
      const radio = resolveRadioPower(chain, node.radioId, inventory, band);
      requestedPowerWatts = radio.requestedPowerWatts;
      txPowerWatts = radio.txPowerWatts;
      currentPowerWatts = radio.txPowerWatts;
      label = radio.label;
      nodeSupported = radio.supported;
      nodeWarnings = radio.warnings;
    } else if (node.type === "accessory") {
      const accessory = inventory.accessories.find(
        (candidate) => candidate.id === node.accessoryId,
      );
      if (!accessory) {
        currentPowerWatts = 0;
        nodeSupported = false;
        label = "Unknown Accessory";
        nodeWarnings = [
          warning(
            "accessory_missing",
            "error",
            "The station chain references an accessory that is not available.",
            node.accessoryId,
            band,
          ),
        ];
      } else {
        label = accessory.name;
        const effect = accessoryEffect(accessory, inputPowerWatts, band);
        currentPowerWatts = effect.outputPowerWatts;
        gainDb = effect.gainDb;
        lossDb = effect.lossDb;
        nodeSupported = effect.supported;
        nodeWarnings = effect.warnings;
        totalAmplifierGainDb += effect.gainDb;
        totalPassiveLossDb += effect.lossDb;
      }
    } else if (node.type === "feedline_run") {
      const run = chain.feedlineRuns.find(
        (candidate) => candidate.id === node.feedlineRunId,
      );
      const feedline = run
        ? inventory.feedlines.find(
            (candidate) => candidate.id === run.feedlineId,
          )
        : undefined;
      if (!run || !feedline) {
        currentPowerWatts = 0;
        nodeSupported = false;
        label = "Unknown Feedline Run";
        nodeWarnings = [
          warning(
            "feedline_missing",
            "error",
            "The station chain references a feedline run that is not available.",
            node.feedlineRunId,
            band,
          ),
        ];
      } else {
        label = feedline.name;
        const sanitizedFeedline = {
          ...feedline,
          lengthFeet: clampNonNegative(feedline.lengthFeet),
          connectorCount: Math.floor(clampNonNegative(feedline.connectorCount)),
        };
        if (feedline.lengthFeet < 0 || feedline.connectorCount < 0) {
          nodeWarnings.push(
            warning(
              "feedline_input_clamped",
              "error",
              `${feedline.name} contained a negative length or connector count.`,
              feedline.id,
              band,
            ),
          );
        }
        feedlineLossDb = calculateTotalFeedlineLoss(
          sanitizedFeedline,
          freqMHz,
          antenna.swrByBand?.[band] ?? DEFAULT_SWR,
        );
        const components = run.inlineComponentIds.map((id) =>
          inventory.inlineComponents.find((candidate) => candidate.id === id),
        );
        for (let index = 0; index < components.length; index++) {
          const component = components[index];
          if (!component) {
            nodeSupported = false;
            nodeWarnings.push(
              warning(
                "inline_component_missing",
                "error",
                "The feedline run references an inline component that is not available.",
                run.inlineComponentIds[index],
                band,
              ),
            );
            continue;
          }
          if (component.insertionLossDb < 0) {
            nodeWarnings.push(
              warning(
                "negative_inline_loss_rejected",
                "error",
                `${component.name} had a negative insertion loss; zero was used.`,
                component.id,
                band,
              ),
            );
          }
          inlineLossDb += clampNonNegative(component.insertionLossDb);
        }
        lossDb = feedlineLossDb + inlineLossDb;
        totalPassiveLossDb += lossDb;
        currentPowerWatts = inputPowerWatts * Math.pow(10, -lossDb / 10);
      }
    } else {
      label = antenna.name;
      if (!antenna.bands.includes(band)) {
        currentPowerWatts = 0;
        nodeSupported = false;
        nodeWarnings = [
          warning(
            "antenna_band_unsupported",
            "error",
            `${antenna.name} does not declare support for ${band}.`,
            antenna.id,
            band,
          ),
        ];
      } else {
        powerAtAntennaWatts = inputPowerWatts;
        const antennaGain = antennaGainForPath(antenna, band, options);
        antennaGainDbi = antennaGain.gainDbi;
        gainDb = antennaGainDbi;
        nodeWarnings = antennaGain.warnings;
        currentPowerWatts =
          powerAtAntennaWatts * Math.pow(10, antennaGainDbi / 10);
      }
    }

    supported &&= nodeSupported;
    warnings.push(...nodeWarnings);
    nodes.push({
      nodeIndex,
      nodeType: node.type,
      label,
      inputPowerWatts,
      lossDb,
      gainDb,
      netDb: gainDb - lossDb,
      outputPowerWatts: currentPowerWatts,
      supported: nodeSupported,
      warnings: nodeWarnings,
    });
  }

  const eirpWatts = supported
    ? powerAtAntennaWatts * Math.pow(10, antennaGainDbi / 10)
    : 0;
  const erpWatts = eirpWatts / Math.pow(10, ISOTROPIC_TO_DIPOLE_DB / 10);

  return {
    band,
    freqMHz,
    requestedPowerWatts,
    txPowerWatts,
    nodes,
    totalSystemGainDb: totalAmplifierGainDb - totalPassiveLossDb + antennaGainDbi,
    totalPassiveLossDb,
    totalAmplifierGainDb,
    feedlineLossDb,
    inlineLossDb,
    accessoryGainDb: totalAmplifierGainDb - (totalPassiveLossDb - feedlineLossDb - inlineLossDb),
    antennaGainDbi,
    powerAtAntennaWatts,
    eirpWatts,
    erpWatts,
    supported,
    warnings,
  };
}

export function computeStationChainPerformance(
  chain: StationChain | null,
  inventory: StationInventory,
  options: StationCalculationOptions = {},
): ChainPerformanceResult {
  if (!chain) return EMPTY_CHAIN_PERFORMANCE;

  const antenna = findAntenna(chain, inventory);
  if (!antenna) {
    const missingAntenna = warning(
      "antenna_missing",
      "error",
      "The station chain has no available antenna.",
    );
    return {
      chain,
      bands: [],
      bestBand: null,
      worstBand: null,
      warnings: [missingAntenna],
    };
  }

  const requestedBands = options.bands ?? antenna.bands;
  const bands = requestedBands
    .map((band) => evaluateBand(chain, inventory, antenna, band, options))
    .filter((result): result is BandChainPerformance => result != null)
    .sort((a, b) => b.eirpWatts - a.eirpWatts);
  const warnings = bands.flatMap((band) => band.warnings);

  return {
    chain,
    bands,
    bestBand: bands[0] ?? null,
    worstBand: bands.at(-1) ?? null,
    warnings,
  };
}

export { stationPresetToChain } from "@/lib/station/stationPresetToChain";

export function computeStationPresetPerformance(
  preset: StationPreset | null,
  inventory: StationInventory,
  options: StationCalculationOptions = {},
): PresetPerformanceResult {
  if (!preset) return EMPTY_PRESET_PERFORMANCE;
  const result = computeStationChainPerformance(
    stationPresetToChain(preset),
    inventory,
    options,
  );
  const losses = result.bands.map((band) => band.feedlineLossDb);
  const totalLossRangeDb = losses.length
    ? `${Math.min(...losses).toFixed(1)} - ${Math.max(...losses).toFixed(1)}`
    : "";

  return {
    preset,
    bands: result.bands,
    bestBand: result.bestBand,
    worstBand: result.worstBand,
    totalLossRangeDb,
    warnings: result.warnings,
  };
}

export function deriveStationFeatureEnvelope(
  chain: StationChain,
  inventory: StationInventory,
  band: string,
  options: StationCalculationOptions = {},
): StationFeatureEnvelope | null {
  const result = computeStationChainPerformance(chain, inventory, {
    ...options,
    bands: [band],
  });
  const performance = result.bands[0];
  if (!performance) return null;

  const radioNode = chain.nodes.find((node) => node.type === "radio");
  const resolved = radioNode?.type === "radio"
    ? inventory.radios.find((entry) => entry.userRadio.id === radioNode.radioId)
    : undefined;
  const preference = resolved?.userRadio.specPreference;
  const useTested = preference === "tested"
    || (preference !== "factory" && options.preferTestedSpecs === true);
  const receiver = useTested && resolved?.equipment?.testedSpecs
    ? resolved.equipment.testedSpecs
    : resolved?.equipment?.receiver;
  const receiverEvidence = receiver == null
    ? "unknown"
    : receiver === resolved?.equipment?.testedSpecs
      ? "independent_test"
      : "manufacturer_claim";
  const mode = (options.mode ?? "WSPR").toUpperCase();
  const modeAssumption = MODE_LINK_ASSUMPTIONS[mode] ?? {
    bandwidthHz: 500,
    snrThresholdDb: 0,
  };
  const assumptions = [
    "receiver_measurement_is_relative_not_local_noise",
    "mode_threshold_is_engineering_estimate_until_mode_head_validation",
  ];
  if (options.targetBearingDeg == null) {
    assumptions.push("target_bearing_not_supplied");
  }
  if (options.localNoiseFloorDbm == null) {
    assumptions.push("local_noise_not_measured");
  }
  const fingerprintValues = {
    featureContract: "station-chain-v1",
    band,
    mode,
    requestedPowerWatts: performance.requestedPowerWatts,
    conductedPowerWatts: performance.txPowerWatts,
    powerAtAntennaWatts: performance.powerAtAntennaWatts,
    eirpWatts: performance.eirpWatts,
    totalPassiveLossDb: performance.totalPassiveLossDb,
    feedlineLossDb: performance.feedlineLossDb,
    inlineLossDb: performance.inlineLossDb,
    amplifierGainDb: performance.totalAmplifierGainDb,
    antennaGainTowardPathDbi: performance.antennaGainDbi,
    targetBearingDeg: options.targetBearingDeg ?? null,
    takeoffAngleDeg: options.takeoffAngleDeg ?? null,
    receiverNoiseFloorDbm: receiver?.noiseFloorDbm ?? null,
    receiverEvidence,
    localSystemNoiseFloorDbm: options.localNoiseFloorDbm ?? null,
  };

  return {
    featureContract: "station-chain-v1",
    chainFingerprint: stableFingerprint(fingerprintValues),
    band,
    frequencyMHz: performance.freqMHz,
    mode,
    requestedPowerWatts: performance.requestedPowerWatts,
    conductedPowerWatts: performance.txPowerWatts,
    powerAtAntennaWatts: performance.powerAtAntennaWatts,
    eirpWatts: performance.eirpWatts,
    erpWatts: performance.erpWatts,
    totalPassiveLossDb: performance.totalPassiveLossDb,
    feedlineLossDb: performance.feedlineLossDb,
    inlineLossDb: performance.inlineLossDb,
    amplifierGainDb: performance.totalAmplifierGainDb,
    antennaGainTowardPathDbi: performance.antennaGainDbi,
    targetBearingDeg: options.targetBearingDeg ?? null,
    takeoffAngleDeg: options.takeoffAngleDeg ?? null,
    receiverNoiseFloorDbm: receiver?.noiseFloorDbm ?? null,
    receiverEvidence,
    receiverEvidenceIsRelative: true,
    localSystemNoiseFloorDbm: options.localNoiseFloorDbm ?? null,
    modeBandwidthHz: modeAssumption.bandwidthHz,
    modeSnrThresholdDb: modeAssumption.snrThresholdDb,
    supported: performance.supported,
    warningCodes: [...new Set(performance.warnings.map((item) => item.code))].sort(),
    assumptions,
  };
}
