/** Compile-time ledgers also drive field extraction; @ entries are identity/private/nested data. */
import type { LegacyUserRadio, RadioEquipment, RadioDataSource, ReceiverPerformance, TransmitPerformance, UserRadio } from "@/types/radio";
import type {
  UserAntenna, FeedpointFerrite, UserFeedline, AdapterComponent, PigtailComponent,
  ChokeComponent, BalunComponent, FerriteComponent, AmplifierAccessory, TunerAccessory,
  FilterAccessory, SwitchAccessory, PowerSupplyAccessory, GroundingAccessory,
  RotatorAccessory, KeyerAccessory, AudioDspAccessory,
} from "@/types/shack";

export const radioInstanceFields = {
  id: "@id", equipmentId: "@modelId", nickname: "@label", customPowerLimit: "radio.customPowerLimit",
  addedAt: "@addedAt", purchaseDate: "@private.purchaseDate", purchaseLocation: "@private.purchaseLocation",
  firmwareRevision: "@private.firmwareRevision", wiringConfiguration: "@private.wiringConfiguration",
  notes: "@private.notes", imageId: "@primaryImageId", galleryImageIds: "@galleryImageIds", specPreference: "@private.specPreference",
} satisfies Record<keyof UserRadio, string>;
export const oldRadioInstanceFields = {
  radioId: "@modelId", nickname: "@label", customPowerLimit: "radio.customPowerLimit", addedAt: "@addedAt",
} satisfies Record<keyof LegacyUserRadio, string>;
export const receiverFields = {
  rmdr: "rmdr", imdr3: "imdr3", blockingGain: "blockingGain", sensitivity: "sensitivity",
  noiseFloorDbm: "noiseFloorDbm", phaseNoiseDbcHz: "phaseNoiseDbcHz", ip3Dbm: "ip3Dbm",
} satisfies Record<keyof ReceiverPerformance, string>;
export const transmitFields = { imd3Db: "radio.transmit.imd3Db", spuriousDbc: "radio.transmit.spuriousDbc", notes: "radio.transmit.notes" } satisfies Record<keyof TransmitPerformance, string>;
export const radioModelFields = {
  id: "@id", displayName: "radio.displayName", manufacturer: "equipment.manufacturer", model: "radio.model",
  receiver: "@receiver", transmit: "@transmit", testedSpecs: "@testedSpecs", sources: "@sources",
  maxPower: "radio.maxPower", minPower: "radio.minPower", modes: "radio.modes", bands: "radio.bands", tier: "radio.tier", releaseYear: "radio.releaseYear",
} satisfies Record<keyof RadioEquipment, string>;
export const sourceReportFields = { name: "@citation.name", url: "@citation.url", retrievedAt: "@citation.retrievedAt", license: "@citation.license", notes: "@citation.notes" } satisfies Record<keyof RadioDataSource, string>;
const common = { id: "@id", name: "@label", manufacturer: "equipment.manufacturer", notes: "@private.notes", imageId: "@primaryImageId", addedAt: "@addedAt" };
export const antennaFields = {
  ...common, antennaType: "antenna.antennaType", gainPatternType: "antenna.gainPatternType", modelNumber: "equipment.modelNumber",
  bands: "antenna.bands", heightMeters: "antenna.heightMeters", azimuthDeg: "antenna.azimuthDeg", isRotatable: "antenna.isRotatable",
  polarization: "antenna.polarization", mounting: "antenna.mounting", gainDbiOverride: "antenna.gainDbiOverride", swrByBand: "antenna.swrByBand",
  feedpointFerrites: "@feedpointFerrites", galleryImageIds: "@galleryImageIds", retiredAt: "@retiredAt", photos: "@legacyPhotoUrls",
} satisfies Record<keyof UserAntenna, string>;
export const feedpointFerriteFields = {
  type: "antenna.feedpointFerrites.type", material: "antenna.feedpointFerrites.material", turns: "antenna.feedpointFerrites.turns",
  count: "antenna.feedpointFerrites.count", insertionLossDb: "antenna.feedpointFerrites.insertionLossDb", notes: "antenna.feedpointFerrites.notes",
} satisfies Record<keyof FeedpointFerrite, string>;
export const feedlineFields = {
  ...common, feedlineType: "feedline.feedlineType", lengthFeet: "feedline.length", connectorCount: "feedline.connectorCount",
  connectorType: "feedline.connectorType", connectorTypeFarEnd: "feedline.connectorTypeFarEnd", condition: "feedline.condition",
  yearInstalled: "feedline.yearInstalled", retiredAt: "@retiredAt",
} satisfies Record<keyof UserFeedline, string>;
const inline = { ...common, componentType: "inline.componentType", insertionLossDb: "inline.insertionLossDb" };
export const inlineFields = {
  adapter: { ...inline, connectorFrom: "inline.connectorFrom", connectorTo: "inline.connectorTo" } satisfies Record<keyof AdapterComponent, string>,
  pigtail: { ...inline, connectorFrom: "inline.connectorFrom", connectorTo: "inline.connectorTo", lengthInches: "inline.length", cableType: "inline.cableType" } satisfies Record<keyof PigtailComponent, string>,
  choke: { ...inline, chokeType: "inline.chokeType", impedance: "inline.impedance", turns: "inline.turns", bands: "inline.bands" } satisfies Record<keyof ChokeComponent, string>,
  balun: { ...inline, ratio: "inline.ratio", maxPowerWatts: "inline.maxPowerWatts", bands: "inline.bands" } satisfies Record<keyof BalunComponent, string>,
  ferrite: { ...inline, ferriteType: "inline.ferriteType", material: "inline.material", count: "inline.count", turns: "inline.turns", impedanceOhms: "inline.impedanceOhms" } satisfies Record<keyof FerriteComponent, string>,
};
const accessory = { ...common, category: "accessory.category", modelNumber: "equipment.modelNumber", currentDrawAmps: "accessory.currentDrawAmps", galleryImageIds: "@galleryImageIds", retiredAt: "@retiredAt" };
export const accessoryFields = {
  amplifier: { ...accessory, maxPowerWatts: "accessory.maxPowerWatts", gainDb: "accessory.gainDb", bands: "accessory.bands", dutyCycle: "accessory.dutyCycle", warmupTimeSec: "accessory.warmupTimeSec", currentDrawTxAmps: "accessory.currentDrawTxAmps", protectionFeatures: "accessory.protectionFeatures" } satisfies Record<keyof AmplifierAccessory, string>,
  tuner: { ...accessory, type: "accessory.tunerType", maxPowerWatts: "accessory.maxPowerWatts", insertionLossDb: "accessory.insertionLossDb", matchingRangeOhms: "accessory.matchingRangeOhms", lossAtSwr: "accessory.lossAtSwr" } satisfies Record<keyof TunerAccessory, string>,
  filter: { ...accessory, filterType: "accessory.filterType", insertionLossDb: "accessory.insertionLossDb", bands: "accessory.bands", selectivityDb: "accessory.selectivityDb", passbandMHz: "accessory.passband" } satisfies Record<keyof FilterAccessory, string>,
  switch: { ...accessory, ports: "accessory.ports", insertionLossDb: "accessory.insertionLossDb", isolationDb: "accessory.isolationDb", maxPowerWatts: "accessory.maxPowerWatts" } satisfies Record<keyof SwitchAccessory, string>,
  power_supply: { ...accessory, voltageOutput: "accessory.voltageOutput", maxCurrentAmps: "accessory.maxCurrentAmps", rippleMv: "accessory.ripple", regulated: "accessory.regulated" } satisfies Record<keyof PowerSupplyAccessory, string>,
  grounding: { ...accessory, groundType: "accessory.groundType", radialCount: "accessory.radialCount", groundResistanceOhms: "accessory.groundResistanceOhms" } satisfies Record<keyof GroundingAccessory, string>,
  rotator: { ...accessory, rotatorType: "accessory.rotatorType", speedDegPerSec: "accessory.speedDegPerSec", rangeDeg: "accessory.rangeDeg", brakeType: "accessory.brakeType", maxWindLoadSqFt: "accessory.maxWindLoad" } satisfies Record<keyof RotatorAccessory, string>,
  keyer: { ...accessory, keyerType: "accessory.keyerType", speedRangeWpm: "accessory.speedRangeWpm", memorySlots: "accessory.memorySlots" } satisfies Record<keyof KeyerAccessory, string>,
  audio_dsp: { ...accessory, dspType: "accessory.dspType", noiseReduction: "accessory.noiseReduction", notchFilter: "accessory.notchFilter", bandwidthHz: "accessory.bandwidthHz" } satisfies Record<keyof AudioDspAccessory, string>,
};
export const fallbackInlineFields = inline;
export const fallbackAccessoryFields = accessory;
