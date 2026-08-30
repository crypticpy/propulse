/**
 * Layer Legend Builder
 *
 * Builds legend specs (title + color swatches) for every currently-enabled
 * marker layer on the map. Colors are sourced directly from each layer
 * file's own color table (re-exported from those files) so this legend can
 * never drift out of sync with the markers it describes -- the same
 * precedent established by IonosphereLegend / IonosphericShells.tsx.
 *
 * Pure module -- no React or three.js imports of its own. The layer files
 * imported below happen to depend on three.js/react-three-fiber, but only
 * their plain hex-string/table exports are referenced here.
 */

import type { MapState } from "@/stores/mapStore";
import type { SpotColorMode } from "@/lib/utils/spotColors";
import { MODE_COLORS, BAND_COLORS } from "@/lib/utils/spotColors";
import { FT8_DECODE_COLORS } from "@/components/map/layers/Ft8DecodeLayer3D";
import { CATEGORY_META } from "@/lib/utils/satellite";
import type { SatelliteCategory } from "@/types/satellite";
import { CATEGORY_COLORS as SATELLITE_CATEGORY_COLORS } from "@/components/map/SatelliteOverlay";
import {
  BEACON_COLOR_ACTIVE,
  BEACON_COLOR_INACTIVE,
} from "@/components/map/layers/BeaconNetworkOverlay3D";
import { WSPR_BAND_COLORS } from "@/components/map/layers/WSPROverlay3D";
import { getQsoBandColor } from "@/lib/map/qsoBandColors";
import { EQ_MAGNITUDE_COLORS } from "@/components/map/EarthquakeOverlay3D";
import { ALERT_SEVERITY_COLORS } from "@/components/map/WeatherAlerts3D";
import { STORM_CATEGORY_HEX } from "@/components/map/TropicalCycloneOverlay3D";
import { RIVER_STATUS_HEX } from "@/components/map/RiverGaugeOverlay3D";
import {
  COLOR_6M,
  COLOR_DEFAULT,
} from "@/components/map/layers/MeteorShowerOverlay3D";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LegendEntry {
  color: string;
  label: string;
}

export interface LayerLegendSpec {
  key: keyof MapState["layers"];
  title: string;
  entries: LegendEntry[];
  note?: string;
}

// ---------------------------------------------------------------------------
// Fixed ordering tables
// ---------------------------------------------------------------------------

/** Band order for the spots-by-band legend (skips "default"). */
const SPOT_BAND_ORDER = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
] as const;

/** Satellite category display order, matching CATEGORY_COLORS declaration order. */
const SATELLITE_CATEGORY_ORDER: SatelliteCategory[] = [
  "iss",
  "fm",
  "linear",
  "digital",
  "weather",
  "other",
];

/** QSO band order (bare band numbers, no "m" suffix) for getQsoBandColor. */
const QSO_BAND_ORDER = [
  "160",
  "80",
  "40",
  "30",
  "20",
  "17",
  "15",
  "12",
  "10",
  "6",
  "2",
] as const;

// ---------------------------------------------------------------------------
// Spec builders
// ---------------------------------------------------------------------------

function buildSpotsSpec(spotColorMode: SpotColorMode): LayerLegendSpec {
  if (spotColorMode === "snr") {
    return {
      key: "spots",
      title: "DX Spots",
      entries: [],
      note: "Colored by signal strength (dim → bright)",
    };
  }
  if (spotColorMode === "age") {
    return {
      key: "spots",
      title: "DX Spots",
      entries: [],
      note: "Colored by age (bright → faded)",
    };
  }
  if (spotColorMode === "band") {
    return {
      key: "spots",
      title: "DX Spots",
      entries: SPOT_BAND_ORDER.map((band) => ({
        color: BAND_COLORS[band],
        label: band,
      })),
    };
  }
  // "mode" (default): FT8/FT4/DIGI/DATA share one cyan swatch.
  return {
    key: "spots",
    title: "DX Spots",
    entries: [
      { color: MODE_COLORS.FT8, label: "FT8/FT4/Digital" },
      { color: MODE_COLORS.CW, label: "CW" },
      { color: MODE_COLORS.SSB, label: "SSB" },
      { color: MODE_COLORS.RTTY, label: "RTTY" },
    ],
  };
}

function buildFt8SpotterSpec(): LayerLegendSpec {
  return {
    key: "ft8Spotter",
    title: "FT8 Spotter",
    entries: [
      { color: FT8_DECODE_COLORS.cq, label: "CQ" },
      { color: FT8_DECODE_COLORS.qso, label: "QSO" },
      { color: FT8_DECODE_COLORS.needed, label: "Needed" },
      { color: FT8_DECODE_COLORS.callingMe, label: "Calling me" },
      { color: FT8_DECODE_COLORS.dupe, label: "Dupe" },
    ],
  };
}

function buildSatellitesSpec(): LayerLegendSpec {
  return {
    key: "satellites",
    title: "Satellites",
    entries: SATELLITE_CATEGORY_ORDER.map((category) => ({
      color: SATELLITE_CATEGORY_COLORS[category],
      label: CATEGORY_META[category].label,
    })),
  };
}

function buildBeaconsSpec(): LayerLegendSpec {
  return {
    key: "beacons",
    title: "NCDXF Beacons",
    entries: [
      { color: BEACON_COLOR_ACTIVE, label: "Transmitting now" },
      { color: BEACON_COLOR_INACTIVE, label: "Idle" },
    ],
  };
}

function buildWsprSpec(): LayerLegendSpec {
  return {
    key: "wspr",
    title: "WSPR Paths",
    entries: WSPR_BAND_COLORS.map((band) => ({
      color: band.color,
      label: band.label,
    })),
  };
}

function buildQsoSpec(layers: MapState["layers"]): LayerLegendSpec {
  const title =
    layers.loggedQsos && layers.contestQsos
      ? "QSOs"
      : layers.contestQsos
        ? "Contest QSOs"
        : "Logged QSOs";
  return {
    key: layers.contestQsos && !layers.loggedQsos ? "contestQsos" : "loggedQsos",
    title,
    entries: QSO_BAND_ORDER.map((band) => ({
      color: getQsoBandColor(band),
      label: `${band}m`,
    })),
  };
}

function buildEarthquakesSpec(): LayerLegendSpec {
  return {
    key: "earthquakes",
    title: "Earthquakes",
    entries: EQ_MAGNITUDE_COLORS.map((band) => ({
      color: band.color,
      label: band.label,
    })),
  };
}

const WEATHER_SEVERITY_ORDER = [
  "Extreme",
  "Severe",
  "Moderate",
  "Minor",
] as const;

function buildWeatherSpec(): LayerLegendSpec {
  return {
    key: "weather",
    title: "Weather Alerts",
    entries: WEATHER_SEVERITY_ORDER.map((severity) => ({
      color: ALERT_SEVERITY_COLORS[severity],
      label: severity,
    })),
  };
}

function buildTropicalSpec(): LayerLegendSpec {
  return {
    key: "tropical",
    title: "Tropical Cyclones",
    entries: [
      { color: STORM_CATEGORY_HEX.TD, label: "TD" },
      { color: STORM_CATEGORY_HEX.TS, label: "TS" },
      { color: STORM_CATEGORY_HEX["1"], label: "Cat 1–2" },
      { color: STORM_CATEGORY_HEX["3"], label: "Cat 3" },
      { color: STORM_CATEGORY_HEX["4"], label: "Cat 4" },
      { color: STORM_CATEGORY_HEX["5"], label: "Cat 5" },
    ],
  };
}

function buildRiverGaugesSpec(): LayerLegendSpec {
  return {
    key: "riverGauges",
    title: "River Gauges",
    entries: [
      { color: RIVER_STATUS_HEX.normal, label: "Normal" },
      { color: RIVER_STATUS_HEX.action, label: "Action" },
      { color: RIVER_STATUS_HEX.minor, label: "Minor flood" },
      { color: RIVER_STATUS_HEX.moderate, label: "Moderate flood" },
      { color: RIVER_STATUS_HEX.major, label: "Major flood" },
    ],
  };
}

function buildMeteorShowersSpec(): LayerLegendSpec {
  return {
    key: "meteorShowers",
    title: "Meteor Showers",
    entries: [
      { color: COLOR_6M, label: "6m-favorable" },
      { color: COLOR_DEFAULT, label: "Other showers" },
    ],
  };
}

// Single-color layers -- literal hex values kept in sync by hand with the
// small standalone marker files listed in each comment, to keep this PR
// from having to touch every overlay file.
function buildIssTrackerSpec(): LayerLegendSpec {
  return {
    key: "issTracker",
    title: "ISS",
    // keep in sync with src/components/map/ISSTrackerOverlay.tsx
    entries: [{ color: "#ffffff", label: "ISS" }],
  };
}

function buildRepeatersSpec(): LayerLegendSpec {
  return {
    key: "repeaters",
    title: "Repeaters",
    // keep in sync with src/components/map/RepeaterOverlay3D.tsx
    entries: [{ color: "#9333ea", label: "Repeaters" }],
  };
}

function buildAprsSpec(): LayerLegendSpec {
  return {
    key: "aprs",
    title: "APRS Stations",
    // keep in sync with src/components/map/APRSOverlay3D.tsx
    entries: [{ color: "#22c55e", label: "APRS Stations" }],
  };
}

function buildTimeStationsSpec(): LayerLegendSpec {
  return {
    key: "timeStations",
    title: "Time Stations",
    // keep in sync with src/components/map/layers/TimeStationsOverlay3D.tsx
    entries: [{ color: "#44ddff", label: "Time Stations" }],
  };
}

function buildFiresSpec(): LayerLegendSpec {
  return {
    key: "fires",
    title: "Fires",
    // keep in sync with src/components/map/FireOverlay3D.tsx
    entries: [{ color: "#ff6600", label: "Fires" }],
  };
}

function buildLightningSpec(): LayerLegendSpec {
  return {
    key: "lightning",
    title: "Lightning",
    entries: [],
    note: "Blue = weak strike → white = strong",
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Build legend specs for every currently-enabled marker layer, in a fixed
 * display order. Layers that are off are omitted entirely.
 */
export function buildLayerLegends(
  layers: MapState["layers"],
  opts: { spotColorMode: SpotColorMode },
): LayerLegendSpec[] {
  const specs: LayerLegendSpec[] = [];

  if (layers.spots) specs.push(buildSpotsSpec(opts.spotColorMode));
  if (layers.ft8Spotter) specs.push(buildFt8SpotterSpec());
  if (layers.satellites) specs.push(buildSatellitesSpec());
  if (layers.beacons) specs.push(buildBeaconsSpec());
  if (layers.wspr) specs.push(buildWsprSpec());
  if (layers.contestQsos || layers.loggedQsos)
    specs.push(buildQsoSpec(layers));
  if (layers.earthquakes) specs.push(buildEarthquakesSpec());
  if (layers.weather) specs.push(buildWeatherSpec());
  if (layers.tropical) specs.push(buildTropicalSpec());
  if (layers.riverGauges) specs.push(buildRiverGaugesSpec());
  if (layers.meteorShowers) specs.push(buildMeteorShowersSpec());
  if (layers.issTracker) specs.push(buildIssTrackerSpec());
  if (layers.repeaters) specs.push(buildRepeatersSpec());
  if (layers.aprs) specs.push(buildAprsSpec());
  if (layers.timeStations) specs.push(buildTimeStationsSpec());
  if (layers.fires) specs.push(buildFiresSpec());
  if (layers.lightning) specs.push(buildLightningSpec());

  return specs;
}
