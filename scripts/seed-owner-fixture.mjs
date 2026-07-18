#!/usr/bin/env node

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

export const FIXTURE_VERSION = "v1";
export const FIXTURE_PREFIX = `owner-fixture-${FIXTURE_VERSION}`;
export const FIXTURE_MARKER = `[PROPULSE SYNTHETIC OWNER FIXTURE ${FIXTURE_VERSION}]`;
export const DEFAULT_PROJECT_REF = "jikgeihhyluuonqdwlrr";

const DEFAULT_PROFILE = {
  callsign: "KB0EL",
  operatorName: "Clark B Ashworth",
  grid: "DM79",
  lat: 39.74,
  lon: -104.99,
  timezone: "America/Denver",
};

const DXCC_ENTITIES = [
  { id: 1, name: "Canada", continent: "NA", cqZone: 5, ituZone: 9, lat: 45, lon: -75 },
  { id: 6, name: "Mexico", continent: "NA", cqZone: 6, ituZone: 10, lat: 19.4, lon: -99.1 },
  { id: 110, name: "Hawaii", continent: "OC", cqZone: 31, ituZone: 61, lat: 21.3, lon: -157.8 },
  { id: 9, name: "American Samoa", continent: "OC", cqZone: 32, ituZone: 62, lat: -14.3, lon: -170.7 },
  { id: 43, name: "Guam", continent: "OC", cqZone: 27, ituZone: 64, lat: 13.4, lon: 144.8 },
  { id: 103, name: "Alaska", continent: "NA", cqZone: 1, ituZone: 1, lat: 61.2, lon: -149.9 },
  { id: 182, name: "US Virgin Islands", continent: "NA", cqZone: 8, ituZone: 11, lat: 18.3, lon: -64.9 },
  { id: 249, name: "Trinidad & Tobago", continent: "SA", cqZone: 9, ituZone: 11, lat: 10.5, lon: -61.3 },
  { id: 86, name: "Costa Rica", continent: "NA", cqZone: 7, ituZone: 11, lat: 10, lon: -84 },
  { id: 108, name: "Brazil", continent: "SA", cqZone: 11, ituZone: 15, lat: -15.8, lon: -47.9 },
  { id: 100, name: "Argentina", continent: "SA", cqZone: 13, ituZone: 14, lat: -34.6, lon: -58.4 },
  { id: 104, name: "Chile", continent: "SA", cqZone: 12, ituZone: 14, lat: -33.4, lon: -70.7 },
  { id: 136, name: "Peru", continent: "SA", cqZone: 10, ituZone: 12, lat: -12, lon: -77 },
  { id: 227, name: "England", continent: "EU", cqZone: 14, ituZone: 27, lat: 51.5, lon: -0.1 },
  { id: 224, name: "Italy", continent: "EU", cqZone: 15, ituZone: 28, lat: 41.9, lon: 12.5 },
  { id: 239, name: "Greece", continent: "EU", cqZone: 20, ituZone: 28, lat: 37.9, lon: 23.7 },
  { id: 54, name: "European Russia", continent: "EU", cqZone: 16, ituZone: 29, lat: 55.8, lon: 37.6 },
  { id: 15, name: "Asiatic Russia", continent: "AS", cqZone: 19, ituZone: 33, lat: 55, lon: 73 },
  { id: 242, name: "Iceland", continent: "EU", cqZone: 40, ituZone: 17, lat: 64.1, lon: -21.9 },
  { id: 339, name: "Japan", continent: "AS", cqZone: 25, ituZone: 45, lat: 35.7, lon: 139.8 },
  { id: 318, name: "China", continent: "AS", cqZone: 24, ituZone: 44, lat: 39.9, lon: 116.4 },
  { id: 324, name: "India", continent: "AS", cqZone: 22, ituZone: 41, lat: 28.6, lon: 77.2 },
  { id: 372, name: "Thailand", continent: "AS", cqZone: 26, ituZone: 49, lat: 13.8, lon: 100.5 },
  { id: 370, name: "Indonesia", continent: "OC", cqZone: 28, ituZone: 51, lat: -6.2, lon: 106.8 },
  { id: 391, name: "United Arab Emirates", continent: "AS", cqZone: 21, ituZone: 39, lat: 24, lon: 54 },
  { id: 312, name: "Mongolia", continent: "AS", cqZone: 23, ituZone: 32, lat: 47.9, lon: 106.9 },
  { id: 292, name: "Uzbekistan", continent: "AS", cqZone: 17, ituZone: 30, lat: 41.3, lon: 69.3 },
  { id: 150, name: "Australia", continent: "OC", cqZone: 30, ituZone: 59, lat: -33.9, lon: 151.2 },
  { id: 462, name: "South Africa", continent: "AF", cqZone: 38, ituZone: 57, lat: -29, lon: 24 },
  { id: 400, name: "Morocco", continent: "AF", cqZone: 33, ituZone: 37, lat: 33.9, lon: -6.9 },
  { id: 478, name: "Egypt", continent: "AF", cqZone: 34, ituZone: 38, lat: 30, lon: 31.2 },
  { id: 430, name: "Kenya", continent: "AF", cqZone: 37, ituZone: 48, lat: -1.3, lon: 36.8 },
  { id: 450, name: "Nigeria", continent: "AF", cqZone: 35, ituZone: 46, lat: 9.1, lon: 7.5 },
  { id: 404, name: "Madagascar", continent: "AF", cqZone: 39, ituZone: 53, lat: -18.9, lon: 47.5 },
  { id: 414, name: "Cameroon", continent: "AF", cqZone: 36, ituZone: 47, lat: 3.9, lon: 11.5 },
];

const BAND_MODES = [
  { band: "160m", mode: "CW", frequency: 1810, rst: "599" },
  { band: "80m", mode: "FT8", frequency: 3573, rst: "-12" },
  { band: "40m", mode: "SSB", frequency: 7200, rst: "59" },
  { band: "30m", mode: "FT8", frequency: 10136, rst: "-14" },
  { band: "20m", mode: "CW", frequency: 14030, rst: "599" },
  { band: "17m", mode: "SSB", frequency: 18130, rst: "59" },
  { band: "15m", mode: "FT4", frequency: 21080, rst: "-06" },
  { band: "12m", mode: "RTTY", frequency: 24920, rst: "599" },
  { band: "10m", mode: "AM", frequency: 29000, rst: "57" },
  { band: "6m", mode: "FT8", frequency: 50313, rst: "-15" },
  { band: "2m", mode: "FM", frequency: 146520, rst: "59" },
  { band: "70cm", mode: "FM", frequency: 446000, rst: "59" },
];

const RADIO_INPUTS = [
  ["icom-ic7300", "HF Workhorse", 100],
  ["yaesu-ft991a", "All-Band Base", 100],
  ["elecraft-kx3", "Portable QRP", 15],
  ["kenwood-ts590sg", "Contest Backup", 100],
  ["elecraft-k4", "DX Chaser", 100],
];

const ANTENNA_INPUTS = [
  {
    name: "Hex Beam (20m-10m)", antennaType: "hex_beam", gainPatternType: "hex_beam",
    bands: ["20m", "17m", "15m", "12m", "10m"], heightMeters: 12,
    polarization: "horizontal", mounting: "tower", manufacturer: "Hex-Beam.com",
    gainDbiOverride: { "20m": 4.2, "17m": 4.8, "15m": 5.2, "12m": 5.5, "10m": 6 },
    swrByBand: { "20m": 1.3, "17m": 1.2, "15m": 1.4, "12m": 1.3, "10m": 1.5 },
    isRotatable: true,
  },
  {
    name: "EFHW 80m-10m", antennaType: "efhw", gainPatternType: "dipole",
    bands: ["80m", "40m", "20m", "15m", "10m"], heightMeters: 10,
    polarization: "horizontal", mounting: "tree", manufacturer: "MyAntennas",
    modelNumber: "EFHW-8010", gainDbiOverride: { "80m": 0.5, "40m": 2, "20m": 2.5, "15m": 3, "10m": 3.5 },
  },
  {
    name: "2m/70cm Dual-Band Vertical", antennaType: "vertical", gainPatternType: "vertical",
    bands: ["2m", "70cm"], heightMeters: 5, polarization: "vertical", mounting: "roof",
    manufacturer: "Diamond", modelNumber: "X-510N", gainDbiOverride: { "2m": 6, "70cm": 8 },
    swrByBand: { "2m": 1.2, "70cm": 1.3 },
  },
  {
    name: "40m Dipole", antennaType: "dipole", gainPatternType: "dipole", bands: ["40m"],
    heightMeters: 15, polarization: "horizontal", mounting: "other",
    gainDbiOverride: { "40m": 2.15 }, swrByBand: { "40m": 1.1 },
  },
  {
    name: "SteppIR 3-Element (20m-6m)", antennaType: "steppir", gainPatternType: "yagi_3el",
    bands: ["20m", "17m", "15m", "12m", "10m", "6m"], heightMeters: 20,
    polarization: "horizontal", mounting: "tower", manufacturer: "SteppIR", modelNumber: "DB18E",
    isRotatable: true,
    gainDbiOverride: { "20m": 6.5, "17m": 7, "15m": 7.2, "12m": 7, "10m": 7.5, "6m": 7.8 },
    swrByBand: { "20m": 1.2, "17m": 1.1, "15m": 1.1, "12m": 1.2, "10m": 1.1, "6m": 1.3 },
  },
];

const FEEDLINE_INPUTS = [
  ["LMR-400 50ft (Tower Run)", "lmr400", 50, "pl259", "n_type", "new", "Times Microwave"],
  ["RG-213 100ft (EFHW Run)", "rg213", 100, "pl259", null, "good", null],
  ["LMR-600 75ft (SteppIR Run)", "lmr600", 75, "n_type", null, "new", "Times Microwave"],
  ["RG-8X 25ft (Shack Patch)", "rg8x", 25, "pl259", null, "good", null],
  ["RG-58 15ft (VHF Jumper)", "rg58", 15, "bnc", null, "new", null],
];

const ACCESSORY_INPUTS = [
  { category: "amplifier", name: "Ameritron AL-811H", manufacturer: "Ameritron", gainDb: 10, maxPowerWatts: 800, bands: ["160m", "80m", "40m", "20m", "15m", "10m"], dutyCycle: 0.5 },
  { category: "amplifier", name: "Elecraft KPA1500", manufacturer: "Elecraft", gainDb: 13, maxPowerWatts: 1500, bands: ["160m", "80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m", "6m"], dutyCycle: 1 },
  { category: "tuner", name: "Palstar AT2K", manufacturer: "Palstar", type: "manual", maxPowerWatts: 2000, insertionLossDb: 0.5 },
  { category: "filter", name: "DX Engineering BPF-1 (20m)", manufacturer: "DX Engineering", filterType: "bandpass", insertionLossDb: 0.3, bands: ["20m"] },
  { category: "switch", name: "MFJ-1700C", manufacturer: "MFJ", ports: 6, insertionLossDb: 0.1, isolationDb: 60, maxPowerWatts: 2500 },
  { category: "audio_dsp", name: "Diamond SX-200 SWR/Power Meter", manufacturer: "Diamond", modelNumber: "SX-200", dspType: "external_speaker" },
  { category: "power_supply", name: "Astron RS-35M", manufacturer: "Astron", voltageOutput: 13.8, maxCurrentAmps: 35, regulated: true },
  { category: "rotator", name: "Yaesu G-800DXA", manufacturer: "Yaesu", rotatorType: "azimuth", speedDegPerSec: 1.5, rangeDeg: 450 },
];

const INLINE_INPUTS = [
  { componentType: "adapter", name: "PL-259 to N Adapter", insertionLossDb: 0.05, connectorFrom: "pl259", connectorTo: "n_type", manufacturer: "Amphenol" },
  { componentType: "choke", name: "Polyphaser IS-50NX-C2 Lightning Arrestor", insertionLossDb: 0.1, chokeType: "feed_through", impedance: 50, manufacturer: "Polyphaser" },
  { componentType: "balun", name: "1:1 Current Balun", insertionLossDb: 0.3, ratio: "1:1_current", maxPowerWatts: 3000, manufacturer: "Balun Designs" },
  { componentType: "ferrite", name: "Fair-Rite Snap-On Choke (x4)", insertionLossDb: 0.2, ferriteType: "snap_on", material: "31", count: 4, turns: 1, manufacturer: "Fair-Rite" },
];

function fixtureId(kind, index) {
  return `${FIXTURE_PREFIX}-${kind}-${String(index + 1).padStart(2, "0")}`;
}

export function stableUuid(label) {
  const bytes = Buffer.from(
    createHash("sha256").update(`${FIXTURE_PREFIX}:${label}`).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function maidenheadGrid4(lat, lon) {
  const adjustedLon = Math.min(359.999999, Math.max(0, lon + 180));
  const adjustedLat = Math.min(179.999999, Math.max(0, lat + 90));
  return `${String.fromCharCode(65 + Math.floor(adjustedLon / 20))}${String.fromCharCode(65 + Math.floor(adjustedLat / 10))}${Math.floor((adjustedLon % 20) / 2)}${Math.floor(adjustedLat % 10)}`;
}

function snapshotNotes(label) {
  return `${FIXTURE_MARKER} ${label}; safe to replace by rerunning the fixture.`;
}

function updatedAt(runMs, index) {
  return new Date(runMs - 2_000 + index).toISOString();
}

function buildProfilePatch(userId, profile, runIso) {
  const hasInterests = Array.isArray(profile.interests) && profile.interests.length > 0;
  return {
    id: userId,
    callsign: profile.callsign || DEFAULT_PROFILE.callsign,
    operator_name: profile.operator_name || DEFAULT_PROFILE.operatorName,
    grid: profile.grid || DEFAULT_PROFILE.grid,
    lat: profile.lat ?? DEFAULT_PROFILE.lat,
    lon: profile.lon ?? DEFAULT_PROFILE.lon,
    timezone: profile.timezone || DEFAULT_PROFILE.timezone,
    home_location_id: profile.home_location_id || fixtureId("location", 0),
    active_location_id: profile.active_location_id || fixtureId("location", 0),
    operator_rank: "ethereal",
    rank_points: 50_000,
    rank_override: "ethereal",
    interests: hasInterests ? profile.interests : ["DXing", "Digital Modes", "Contesting", "Propagation"],
    updated_at: runIso,
  };
}

function buildEquipment(userId, runIso) {
  const addedAt = "2026-02-18T12:00:00.000Z";
  const radios = RADIO_INPUTS.map(([equipmentId, nickname, power], index) => {
    const id = fixtureId("radio", index);
    const snapshot = {
      id,
      equipmentId,
      nickname,
      customPowerLimit: power,
      notes: snapshotNotes("built-in radio"),
      addedAt,
    };
    return {
      instance_id: id,
      user_id: userId,
      equipment_id: equipmentId,
      nickname,
      tx_power_setting: power,
      notes: snapshot.notes,
      specs_override: { _snapshot: snapshot },
      created_at: addedAt,
      updated_at: runIso,
    };
  });

  const antennas = ANTENNA_INPUTS.map((input, index) => {
    const id = fixtureId("antenna", index);
    const snapshot = { ...input, id, notes: snapshotNotes("antenna"), addedAt };
    return {
      id,
      user_id: userId,
      name: input.name,
      type: input.antennaType,
      manufacturer: input.manufacturer ?? null,
      bands: input.bands,
      height_agl: input.heightMeters,
      gain_dbi: input.gainDbiOverride ?? null,
      polarization: input.polarization,
      mounting: input.mounting,
      swr_data: { swr: input.swrByBand ?? null, _snapshot: snapshot },
      notes: snapshot.notes,
      is_rotatable: input.isRotatable ?? false,
      is_portable: input.mounting === "portable",
      created_at: addedAt,
      updated_at: runIso,
    };
  });

  const feedlines = FEEDLINE_INPUTS.map((input, index) => {
    const [name, type, lengthFeet, connectorType, connectorTypeFarEnd, condition, manufacturer] = input;
    const id = fixtureId("feedline", index);
    const snapshot = {
      id,
      name,
      feedlineType: type,
      lengthFeet,
      connectorCount: 2,
      connectorType,
      ...(connectorTypeFarEnd ? { connectorTypeFarEnd } : {}),
      condition,
      ...(manufacturer ? { manufacturer } : {}),
      notes: snapshotNotes("feedline"),
      addedAt,
    };
    return {
      id,
      user_id: userId,
      type,
      length_meters: lengthFeet * 0.3048,
      connectors: { connectorType, connectorTypeFarEnd, connectorCount: 2, _snapshot: snapshot },
      manufacturer,
      condition,
      notes: snapshot.notes,
      created_at: addedAt,
      updated_at: runIso,
    };
  });

  const accessories = ACCESSORY_INPUTS.map((input, index) => {
    const id = fixtureId("accessory", index);
    const snapshot = { ...input, id, notes: snapshotNotes("accessory"), addedAt };
    return {
      id,
      user_id: userId,
      category: input.category,
      model: input.name,
      manufacturer: input.manufacturer ?? null,
      specs: { _snapshot: snapshot },
      bands: input.bands ?? [],
      notes: snapshot.notes,
      created_at: addedAt,
      updated_at: runIso,
    };
  });

  const inlineComponents = INLINE_INPUTS.map((input, index) => {
    const id = fixtureId("inline", index);
    const snapshot = { ...input, id, notes: snapshotNotes("inline component"), addedAt };
    return {
      id,
      user_id: userId,
      name: input.name,
      component_type: input.componentType,
      insertion_loss_db: input.insertionLossDb,
      manufacturer: input.manufacturer ?? null,
      notes: snapshot.notes,
      specs: { _snapshot: snapshot },
      created_at: addedAt,
      updated_at: runIso,
    };
  });

  return { radios, antennas, feedlines, accessories, inlineComponents };
}

function buildStationConfigurations(userId, equipment, runIso) {
  const createdAt = "2026-02-18T12:30:00.000Z";
  const homeId = fixtureId("location", 0);
  const radio = equipment.radios.map((item) => item.instance_id);
  const antenna = equipment.antennas.map((item) => item.id);
  const feedline = equipment.feedlines.map((item) => item.id);
  const accessory = equipment.accessories.map((item) => item.id);
  const inline = equipment.inlineComponents.map((item) => item.id);

  const definitions = [
    {
      name: "Legal-Limit DX Chain",
      radioId: radio[4], antennaId: antenna[4], feedlineId: feedline[2],
      accessoryIds: [accessory[1], accessory[2]], inlineIds: [inline[0], inline[1]],
      power: 1_000, shackAccessoryIds: [accessory[6], accessory[7]],
    },
    {
      name: "General HF Chain",
      radioId: radio[0], antennaId: antenna[0], feedlineId: feedline[0],
      accessoryIds: [accessory[3], accessory[4]], inlineIds: [inline[0], inline[3]],
      power: 100, shackAccessoryIds: [accessory[5], accessory[6]],
    },
    {
      name: "Portable QRP Chain",
      radioId: radio[2], antennaId: antenna[1], feedlineId: feedline[3],
      accessoryIds: [], inlineIds: [inline[2]], power: 10, shackAccessoryIds: [],
    },
  ];

  const chains = definitions.map((item, index) => {
    const id = fixtureId("chain", index);
    const runId = fixtureId("feedline-run", index);
    return {
      id,
      user_id: userId,
      name: item.name,
      nodes: [
        { type: "radio", radioId: item.radioId },
        ...item.accessoryIds.map((accessoryId) => ({ type: "accessory", accessoryId })),
        { type: "feedline_run", feedlineRunId: runId },
        { type: "antenna", antennaId: item.antennaId },
      ],
      feedline_runs: [{ id: runId, feedlineId: item.feedlineId, inlineComponentIds: item.inlineIds }],
      operating_power_watts: item.power,
      linked_location_id: homeId,
      shack_accessory_ids: item.shackAccessoryIds,
      notes: snapshotNotes("complete station chain for personalized propagation testing"),
      created_at: createdAt,
      updated_at: runIso,
    };
  });

  const presets = definitions.map((item, index) => ({
    id: fixtureId("preset", index),
    user_id: userId,
    name: item.name,
    description: snapshotNotes("station preset"),
    radio_instance_id: item.radioId,
    antenna_id: item.antennaId,
    feedline_id: item.feedlineId,
    accessory_ids: item.accessoryIds,
    linked_location_id: homeId,
    is_active: index === 1,
    created_at: createdAt,
    updated_at: runIso,
  }));

  return { chains, presets };
}

function buildQsos(userId, stationCallsign, myGrid, runMs) {
  const firstContactMs = Date.UTC(2026, 1, 18, 0, 0, 0);
  return Array.from({ length: 600 }, (_, index) => {
    const entity = DXCC_ENTITIES[index % DXCC_ENTITIES.length];
    const bandMode = BAND_MODES[index % BAND_MODES.length];
    const day = Math.floor(index / 4);
    const contactMs = firstContactMs + day * 86_400_000 + (index % 4) * 18_000_000;
    const contact = new Date(contactMs);
    const confirmed = index % 4 !== 0;
    return {
      id: stableUuid(`qso-${index}`),
      user_id: userId,
      callsign: `TST${String(index + 1).padStart(4, "0")}`,
      frequency: bandMode.frequency,
      mode: bandMode.mode,
      band: bandMode.band,
      date: contact.toISOString().slice(0, 10),
      time_on: contact.toISOString().slice(11, 19),
      rst_sent: bandMode.rst,
      rst_rcvd: bandMode.rst,
      grid: maidenheadGrid4(entity.lat, entity.lon),
      qth: entity.name,
      country: entity.name,
      dxcc: entity.id,
      cq_zone: entity.cqZone,
      itu_zone: entity.ituZone,
      continent: entity.continent,
      tx_power: index % 5 === 0 ? 10 : 100,
      my_grid: myGrid,
      my_rig: RADIO_INPUTS[index % RADIO_INPUTS.length][1],
      my_antenna: ANTENNA_INPUTS[index % ANTENNA_INPUTS.length].name,
      qsl_sent: confirmed ? "Y" : "N",
      qsl_rcvd: confirmed ? "Y" : "N",
      lotw_status: confirmed,
      eqsl_status: index % 3 === 0,
      lotw_qsl_sent: confirmed ? "Y" : "N",
      lotw_qsl_rcvd: confirmed ? "Y" : "N",
      station_callsign: stationCallsign,
      operator_callsign: stationCallsign,
      notes: `${FIXTURE_MARKER} Generated test contact; not an on-air record.`,
      version: 1,
      last_device_id: FIXTURE_PREFIX,
      is_guest_entry: false,
      created_at: contact.toISOString(),
      updated_at: updatedAt(runMs, index),
    };
  });
}

function buildDxcc(userId, qsos, runIso) {
  return DXCC_ENTITIES.map((entity, index) => {
    const qso = qsos.find((item) => item.dxcc === entity.id);
    return {
      id: stableUuid(`dxcc-${entity.id}`),
      user_id: userId,
      entity_id: entity.id,
      band: qso.band,
      mode: qso.mode,
      callsign: qso.callsign,
      worked_at: qso.created_at,
      confirmed: index % 5 !== 0,
      confirmation_method: `${FIXTURE_PREFIX}:synthetic`,
      created_at: qso.created_at,
      updated_at: runIso,
    };
  });
}

function buildAchievements(userId, runIso) {
  const inputs = [
    ["qso_count", "silver", 600],
    ["daily_warrior", "silver", 150],
    ["band_explorer", "platinum", 12],
    ["mode_master", "platinum", 8],
    ["unique_calls", "silver", 600],
    ["dxcc_hunter", "bronze", DXCC_ENTITIES.length],
    ["dxcc_confirmed", "bronze", 28],
    ["waz_progress", "gold", new Set(DXCC_ENTITIES.map((item) => item.cqZone)).size],
    ["waz_confirmed", "silver", 28],
    ["night_owl", "silver", 150],
  ];
  return inputs.map(([badgeId, tier, progress], index) => ({
    id: fixtureId("achievement", index),
    user_id: userId,
    badge_id: badgeId,
    tier,
    progress,
    earned_at: "2026-07-17T12:00:00.000Z",
    created_at: "2026-07-17T12:00:00.000Z",
    updated_at: runIso,
  }));
}

function buildHistory(userId) {
  return [...RADIO_INPUTS, ...ANTENNA_INPUTS.slice(0, 3)].map((item, index) => {
    const isRadio = Array.isArray(item);
    return {
      id: fixtureId("history", index),
      user_id: userId,
      timestamp: new Date(Date.UTC(2026, 1, 18, 13, index)).toISOString(),
      action: "added",
      equipment_type: isRadio ? "radio" : "antenna",
      equipment_id: fixtureId(isRadio ? "radio" : "antenna", isRadio ? index : index - RADIO_INPUTS.length),
      equipment_name: isRadio ? item[1] : item.name,
      details: snapshotNotes("equipment history"),
      created_at: new Date(Date.UTC(2026, 1, 18, 13, index)).toISOString(),
    };
  });
}

export function buildFixture(userId, profile = {}, runAt = new Date()) {
  const runIso = runAt.toISOString();
  const runMs = runAt.getTime();
  const profilePatch = buildProfilePatch(userId, profile, runIso);
  const locations = [
    {
      id: fixtureId("location", 0), user_id: userId, name: "Home QTH (Synthetic Fixture)",
      grid: "DM79", lat: 39.74, lon: -104.99, timezone: "America/Denver", type: "home",
      created_at: "2026-02-18T12:00:00.000Z",
    },
    {
      id: fixtureId("location", 1), user_id: userId, name: "Portable Test Site",
      grid: "DM78", lat: 38.83, lon: -104.82, timezone: "America/Denver", type: "portable",
      activation_ref: "SYNTHETIC-TEST", created_at: "2026-02-18T12:05:00.000Z",
    },
  ];
  const equipment = buildEquipment(userId, runIso);
  const stations = buildStationConfigurations(userId, equipment, runIso);
  const qsos = buildQsos(userId, profilePatch.callsign, profilePatch.grid, runMs);
  return {
    profile: profilePatch,
    locations,
    ...equipment,
    ...stations,
    qsos,
    dxcc: buildDxcc(userId, qsos, runIso),
    achievements: buildAchievements(userId, runIso),
    history: buildHistory(userId),
  };
}

export function fixtureCounts(fixture) {
  return {
    profiles: 1,
    saved_locations: fixture.locations.length,
    user_radios: fixture.radios.length,
    antennas: fixture.antennas.length,
    feedlines: fixture.feedlines.length,
    accessories: fixture.accessories.length,
    inline_components: fixture.inlineComponents.length,
    station_presets: fixture.presets.length,
    station_chains: fixture.chains.length,
    equipment_history: fixture.history.length,
    log_entries: fixture.qsos.length,
    dxcc_worked: fixture.dxcc.length,
    achievements: fixture.achievements.length,
  };
}

export function validateFixture(fixture) {
  const counts = fixtureCounts(fixture);
  if (counts.log_entries !== 600) throw new Error("fixture must contain exactly 600 QSOs");
  if (new Set(fixture.qsos.map((item) => item.id)).size !== fixture.qsos.length) {
    throw new Error("fixture QSO IDs must be unique");
  }
  const timestamps = fixture.qsos.map((item) => item.updated_at);
  if (new Set(timestamps).size !== timestamps.length) {
    throw new Error("fixture QSO sync timestamps must be unique");
  }
  if (!fixture.qsos.every((item) => item.notes.startsWith(FIXTURE_MARKER))) {
    throw new Error("every fixture QSO must be clearly marked synthetic");
  }
  if (!fixture.chains.every((chain) => chain.linked_location_id && chain.nodes.length >= 3)) {
    throw new Error("every fixture station chain must be complete and location-linked");
  }
  return counts;
}

async function findUserByEmail(client, email) {
  const matches = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    matches.push(...data.users.filter((user) => user.email?.toLowerCase() === email.toLowerCase()));
    if (data.users.length < 100) break;
  }
  if (matches.length !== 1) {
    throw new Error(`expected exactly one Auth user for ${email}; found ${matches.length}`);
  }
  if (!matches[0].email_confirmed_at) {
    throw new Error(`Auth user ${email} is not email-confirmed`);
  }
  return matches[0];
}

async function selectProfile(client, userId) {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

async function upsertRows(client, table, rows, onConflict, batchSize = 100) {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const { error } = await client
      .from(table)
      .upsert(rows.slice(offset, offset + batchSize), { onConflict });
    if (error) throw new Error(`${table} upsert failed at offset ${offset}: ${error.message}`);
  }
}

async function countRows(query, label) {
  const { count, error } = await query;
  if (error) throw new Error(`${label} verification failed: ${error.message}`);
  return count ?? 0;
}

async function assertFixtureOwnership(client, userId, fixture) {
  const probes = [
    ["inline_components", "id", fixture.inlineComponents[0].id],
    ["station_chains", "id", fixture.chains[0].id],
    ["equipment_history", "id", fixture.history[0].id],
    ["log_entries", "id", fixture.qsos[0].id],
    ["dxcc_worked", "id", fixture.dxcc[0].id],
  ];
  for (const [table, idColumn, id] of probes) {
    const { data, error } = await client
      .from(table)
      .select("user_id")
      .eq(idColumn, id)
      .maybeSingle();
    if (error) throw new Error(`${table} ownership check failed: ${error.message}`);
    if (data && data.user_id !== userId) {
      throw new Error(`refusing to reassign the existing ${FIXTURE_PREFIX} from another user`);
    }
  }
}

async function verifyRemote(client, userId, fixture) {
  const expected = fixtureCounts(fixture);
  const idPattern = `${FIXTURE_PREFIX}-%`;
  const actual = {
    profiles: await countRows(
      client.from("profiles").select("id", { count: "exact", head: true }).eq("id", userId).eq("rank_override", "ethereal"),
      "profiles",
    ),
    saved_locations: await countRows(client.from("saved_locations").select("id", { count: "exact", head: true }).eq("user_id", userId).like("id", idPattern), "saved_locations"),
    user_radios: await countRows(client.from("user_radios").select("instance_id", { count: "exact", head: true }).eq("user_id", userId).like("instance_id", idPattern), "user_radios"),
    antennas: await countRows(client.from("antennas").select("id", { count: "exact", head: true }).eq("user_id", userId).like("id", idPattern), "antennas"),
    feedlines: await countRows(client.from("feedlines").select("id", { count: "exact", head: true }).eq("user_id", userId).like("id", idPattern), "feedlines"),
    accessories: await countRows(client.from("accessories").select("id", { count: "exact", head: true }).eq("user_id", userId).like("id", idPattern), "accessories"),
    inline_components: await countRows(client.from("inline_components").select("id", { count: "exact", head: true }).eq("user_id", userId).like("id", idPattern), "inline_components"),
    station_presets: await countRows(client.from("station_presets").select("id", { count: "exact", head: true }).eq("user_id", userId).like("id", idPattern), "station_presets"),
    station_chains: await countRows(client.from("station_chains").select("id", { count: "exact", head: true }).eq("user_id", userId).like("id", idPattern), "station_chains"),
    equipment_history: await countRows(client.from("equipment_history").select("id", { count: "exact", head: true }).eq("user_id", userId).like("id", idPattern), "equipment_history"),
    log_entries: await countRows(client.from("log_entries").select("id", { count: "exact", head: true }).eq("user_id", userId).like("notes", `${FIXTURE_MARKER}%`), "log_entries"),
    dxcc_worked: await countRows(client.from("dxcc_worked").select("id", { count: "exact", head: true }).eq("user_id", userId).like("confirmation_method", `${FIXTURE_PREFIX}%`), "dxcc_worked"),
    achievements: await countRows(client.from("achievements").select("id", { count: "exact", head: true }).eq("user_id", userId).like("id", idPattern), "achievements"),
  };
  const mismatches = Object.entries(expected).filter(([table, count]) => actual[table] !== count);
  if (mismatches.length > 0) {
    throw new Error(`remote verification mismatch: ${JSON.stringify({ expected, actual })}`);
  }
  return actual;
}

export async function seedOwnerFixture({ email, apply, projectRef = DEFAULT_PROJECT_REF }) {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url.startsWith("https://") || !serviceRoleKey) {
    throw new Error("SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  const actualProjectRef = new URL(url).hostname.split(".")[0];
  if (actualProjectRef !== projectRef) {
    throw new Error(`refusing to seed project ${actualProjectRef}; expected ${projectRef}`);
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const user = await findUserByEmail(client, email);
  const profile = await selectProfile(client, user.id);
  const fixture = buildFixture(user.id, profile);
  const counts = validateFixture(fixture);
  await assertFixtureOwnership(client, user.id, fixture);

  if (!apply) return { applied: false, userId: user.id, counts };

  const { error: profileError } = await client.from("profiles").update(fixture.profile).eq("id", user.id);
  if (profileError) throw new Error(`profile update failed: ${profileError.message}`);

  await upsertRows(client, "saved_locations", fixture.locations, "user_id,id");
  await upsertRows(client, "user_radios", fixture.radios, "user_id,instance_id");
  await upsertRows(client, "antennas", fixture.antennas, "user_id,id");
  await upsertRows(client, "feedlines", fixture.feedlines, "user_id,id");
  await upsertRows(client, "accessories", fixture.accessories, "user_id,id");
  await upsertRows(client, "inline_components", fixture.inlineComponents, "id");
  await upsertRows(client, "station_presets", fixture.presets, "user_id,id");
  await upsertRows(client, "station_chains", fixture.chains, "id");
  await upsertRows(client, "equipment_history", fixture.history, "id");
  await upsertRows(client, "log_entries", fixture.qsos, "id");
  await upsertRows(client, "dxcc_worked", fixture.dxcc, "id");
  await upsertRows(client, "achievements", fixture.achievements, "user_id,id");

  const { error: statsError } = await client.rpc("update_profile_stats", { target_user_id: user.id });
  if (statsError) throw new Error(`profile stats refresh failed: ${statsError.message}`);

  const verified = await verifyRemote(client, user.id, fixture);
  return { applied: true, userId: user.id, counts: verified };
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      apply: { type: "boolean", default: false },
      "project-ref": { type: "string", default: DEFAULT_PROJECT_REF },
    },
  });
  if (!values.email) throw new Error("--email is required");
  const result = await seedOwnerFixture({
    email: values.email,
    apply: values.apply,
    projectRef: values["project-ref"],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.applied) {
    process.stdout.write("Dry run only. Rerun with --apply to write the fixture.\n");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
