/**
 * Built-in Operating Profiles
 *
 * Five pre-configured profiles that bundle layer visibility, display
 * preferences, spot filtering, and panel layout for common operating styles.
 */

import type {
  OperatingProfile,
  BuiltinProfileId,
} from "@/types/operatingProfile";

// ─── Built-in Profile Definitions ─────────────────────────────────────────────

const dxHunter: OperatingProfile = {
  id: "dx-hunter",
  name: "DX Hunter",
  shortLabel: "DX",
  description:
    "Chase rare DX with propagation overlays that show where the bands are open. Spots auto-follow so you never miss an opening.",
  iconPath: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  activeColor: "plasma-orange",

  layers: {
    terminator: true,
    greyline: true,
    aurora: false,
    muf: true,
    nvis: false,
    spots: true,
    spotTraces: false,
    nightLights: true,
    labels: false,
    satellites: false,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: false,
    gridActivity: true,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: false,
    beacons: true,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: true,
  },

  spotColorMode: "band",
  visualStyle: "realistic",
  mapStyle: "satellite",

  spotFilters: { bands: [], modes: [] },

  panelConfig: {
    bandConditions: { visible: true, collapsed: false },
    pathAnalysis: { visible: true, collapsed: false },
    dxCluster: { visible: true, collapsed: false },
    satellites: { visible: false, collapsed: true },
  },

  autoFollow: true,
};

const contest: OperatingProfile = {
  id: "contest",
  name: "Contest",
  shortLabel: "CTST",
  description:
    "Clean, focused view for contest operating. High-contrast spots filtered to CW, SSB, RTTY, and FT8 \u2014 no distractions.",
  iconPath:
    "M6 9H4.5a2.5 2.5 0 010-5C6 4 6 2 12 2s6 2 7.5 2a2.5 2.5 0 010 5H18m-12 0v7a4 4 0 004 4h4a4 4 0 004-4V9M6 9h12",
  activeColor: "caution-amber",

  layers: {
    terminator: true,
    greyline: false,
    aurora: false,
    muf: false,
    nvis: false,
    spots: true,
    spotTraces: false,
    nightLights: false,
    labels: false,
    satellites: false,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: true,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: false,
    gridActivity: false,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: false,
    beacons: false,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
  },

  spotColorMode: "mode",
  visualStyle: "high-viz",
  mapStyle: "standard",

  spotFilters: { bands: [], modes: ["CW", "SSB", "RTTY", "FT8"] },

  panelConfig: {
    bandConditions: { visible: true, collapsed: true },
    pathAnalysis: { visible: false, collapsed: true },
    dxCluster: { visible: true, collapsed: false },
    satellites: { visible: false, collapsed: true },
  },

  autoFollow: false,
  suggestedLayoutMode: "lite",
};

const vhf: OperatingProfile = {
  id: "vhf",
  name: "VHF/UHF",
  shortLabel: "VHF",
  description:
    "Watch for aurora scatter, track satellites, and monitor the VHF/UHF weak-signal bands for openings.",
  iconPath:
    "M9.348 14.651a3.75 3.75 0 010-5.302m5.302 0a3.75 3.75 0 010 5.302m-7.424 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  activeColor: "cosmic-cyan",

  layers: {
    terminator: true,
    greyline: false,
    aurora: true,
    muf: false,
    nvis: false,
    spots: false,
    spotTraces: false,
    nightLights: false,
    labels: false,
    satellites: true,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: false,
    gridActivity: false,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: true,
    beacons: false,
    spectrumRing: false,
    ducting: true,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
  },

  spotColorMode: "band",
  visualStyle: "realistic",
  mapStyle: "satellite",

  spotFilters: { bands: ["6m", "2m", "70cm", "23cm"], modes: [] },

  panelConfig: {
    bandConditions: { visible: true, collapsed: false },
    pathAnalysis: { visible: true, collapsed: true },
    dxCluster: { visible: false, collapsed: true },
    satellites: { visible: true, collapsed: false },
  },

  autoFollow: false,
  defaultZoomLevel: 3,
};

const emergency: OperatingProfile = {
  id: "emergency",
  name: "Emergency",
  shortLabel: "EMRG",
  description:
    "Emergency communications setup with NVIS propagation for regional coverage on 40m, 60m, and 80m.",
  iconPath:
    "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  activeColor: "alert-red",

  layers: {
    terminator: true,
    greyline: true,
    aurora: false,
    muf: false,
    nvis: true,
    spots: false,
    spotTraces: false,
    nightLights: true,
    labels: true,
    satellites: false,
    earthquakes: true,
    weather: true,
    lightning: true,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: true,
    radar: true,
    issTracker: false,
    gridActivity: false,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: false,
    beacons: false,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
  },

  spotColorMode: "mode",
  visualStyle: "high-viz",
  mapStyle: "standard",

  spotFilters: { bands: ["40m", "60m", "80m"], modes: [] },

  panelConfig: {
    bandConditions: { visible: true, collapsed: false },
    pathAnalysis: { visible: true, collapsed: false },
    dxCluster: { visible: false, collapsed: true },
    satellites: { visible: false, collapsed: true },
  },

  autoFollow: false,
};

const listener: OperatingProfile = {
  id: "listener",
  name: "Listener/SWL",
  shortLabel: "SWL",
  description:
    "Watch the bands come alive \u2014 auto-follow spots with band coloring. Perfect for shortwave listeners and new hams.",
  // Headphones icon (24x24 viewBox)
  iconPath:
    "M3 18v-6a9 9 0 0118 0v6M3 18a3 3 0 003 3h1a1 1 0 001-1v-4a1 1 0 00-1-1H4a1 1 0 00-1 1v2zm18 0a3 3 0 01-3 3h-1a1 1 0 01-1-1v-4a1 1 0 011-1h3a1 1 0 011 1v2z",
  activeColor: "signal-green",

  layers: {
    terminator: true,
    greyline: true,
    aurora: false,
    muf: false,
    nvis: false,
    spots: true,
    spotTraces: false,
    nightLights: true,
    labels: false,
    satellites: false,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: false,
    gridActivity: false,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: false,
    beacons: false,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
  },

  spotColorMode: "band",
  visualStyle: "realistic",
  mapStyle: "satellite",

  spotFilters: { bands: [], modes: [] },

  panelConfig: {
    bandConditions: { visible: true, collapsed: false },
    pathAnalysis: { visible: true, collapsed: true },
    dxCluster: { visible: true, collapsed: true },
    satellites: { visible: false, collapsed: true },
  },

  autoFollow: true,
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const BUILTIN_PROFILES: Record<BuiltinProfileId, OperatingProfile> = {
  "dx-hunter": dxHunter,
  contest,
  vhf,
  emergency,
  listener,
};

export const BUILTIN_PROFILE_ORDER: BuiltinProfileId[] = [
  "dx-hunter",
  "contest",
  "vhf",
  "emergency",
  "listener",
];

/**
 * Returns display metadata for a built-in profile, compatible with the
 * legacy PRESET_CONFIG shape from mapPresets.ts.
 */
export function getProfileConfig(id: BuiltinProfileId): {
  label: string;
  shortLabel: string;
  description: string;
  iconPath: string;
  activeColor: string;
  layerSummary: string;
} {
  const profile = BUILTIN_PROFILES[id];

  // Build a human-readable summary of enabled layers
  const layerNames: Record<keyof OperatingProfile["layers"], string> = {
    terminator: "Day/Night",
    greyline: "Greyline",
    aurora: "Aurora",
    muf: "MUF",
    nvis: "NVIS",
    spots: "Spots",
    spotTraces: "Spot Traces",
    nightLights: "Lights",
    labels: "Labels",
    satellites: "Satellites",
    earthquakes: "Earthquakes",
    weather: "Weather",
    lightning: "Lightning",
    wspr: "WSPR",
    contestQsos: "Contest QSOs",
    loggedQsos: "Logged QSOs",
    fires: "Fires",
    radar: "Radar",
    issTracker: "ISS Tracker",
    gridActivity: "Grid Activity",
    ionosphere: "Ionosphere",
    rayPath: "Ray Path",
    drap: "DRAP",
    geomagField: "Geomag Field",
    noiseFloor: "Noise Floor",
    meteorShowers: "Meteor Showers",
    beacons: "Beacons",
    spectrumRing: "Spectrum Ring",
    ducting: "Ducting",
    sporadicE: "Sporadic E",
    satelliteFootprints: "Sat Footprints",
    ft8Spotter: "FT8 Spotter",
  };

  const enabledLayers = (
    Object.entries(profile.layers) as [
      keyof OperatingProfile["layers"],
      boolean,
    ][]
  )
    .filter(([, enabled]) => enabled)
    .map(([key]) => layerNames[key]);

  return {
    label: profile.name,
    shortLabel: profile.shortLabel,
    description: profile.description,
    iconPath: profile.iconPath,
    activeColor: profile.activeColor,
    layerSummary: enabledLayers.join(" + "),
  };
}
