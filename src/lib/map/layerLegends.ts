/**
 * Layer Legend Builder
 *
 * Builds legend specs (title + color swatches) for every currently-enabled
 * colored map layer. Colors are sourced directly from each layer
 * file's own color table (re-exported from those files) so this legend can
 * never drift out of sync with the markers it describes -- the same
 * precedent established by IonosphereLegend / IonosphericShells.tsx.
 *
 * Pure module -- no React or three.js imports of its own. The layer files
 * imported below happen to depend on three.js/react-three-fiber, but only
 * their plain hex-string/table exports are referenced here.
 */

import type { MapState, ViewMode } from "@/stores/mapStore";
import type { SpotColorMode } from "@/lib/utils/spotColors";
import {
  MODE_COLORS,
  BAND_COLORS,
  SNR_COLOR_STOPS,
  AGE_COLOR_STOPS,
  SPOT_REPLAY_COLOR,
} from "@/lib/utils/spotColors";
import { FT8_DECODE_COLORS } from "@/components/map/layers/Ft8DecodeLayer3D";
import { CATEGORY_META } from "@/lib/utils/satellite";
import type { SatelliteCategory } from "@/types/satellite";
import { CATEGORY_COLORS as SATELLITE_CATEGORY_COLORS } from "@/components/map/SatelliteOverlay";
import {
  BEACON_COLOR_ACTIVE,
  BEACON_COLOR_INACTIVE,
} from "@/components/map/layers/BeaconNetworkOverlay3D";
import { WSPR_BAND_COLORS } from "@/lib/map/wsprBandColors";
import { getQsoBandColor } from "@/lib/map/qsoBandColors";
import { EQ_MAGNITUDE_COLORS } from "@/components/map/EarthquakeOverlay3D";
import { ALERT_SEVERITY_COLORS } from "@/components/map/WeatherAlerts3D";
import { STORM_CATEGORY_HEX } from "@/components/map/TropicalCycloneOverlay3D";
import { RIVER_STATUS_HEX } from "@/components/map/RiverGaugeOverlay3D";
import {
  COLOR_6M,
  COLOR_DEFAULT,
} from "@/components/map/layers/MeteorShowerOverlay3D";
import { FIRE_CORE_COLOR } from "@/components/map/FireOverlay3D";
import {
  LIGHTNING_COLOR_FLAT,
  LIGHTNING_COLOR_STRONG,
  LIGHTNING_COLOR_WEAK,
  LIGHTNING_STRONG_KA,
} from "@/lib/map/lightningColors";
import { LUNAR_SUBPOINT_COLOR } from "@/lib/map/lunarSubpointMarker";
import { GEOMAG_FIELD_COLORS } from "@/components/map/layers/GeomagneticFieldLines3D";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LegendEntry {
  color: string;
  label: string;
}

export interface LayerLegendSpec {
  key: keyof MapState["layers"] | "replay";
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
  "60",
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
  // "mode" (default): FT8/FT4/DIGI/DATA share one cyan swatch.
  if (spotColorMode === "mode") {
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

  if (spotColorMode === "snr") {
    return {
      key: "spots",
      title: "DX Spots",
      entries: SNR_COLOR_STOPS.map((stop) => ({
        color: stop.color,
        label: stop.label,
      })),
      // Not every feed reports SNR -- those spots keep their band color.
      note: "Spots without a reported SNR stay band-colored",
    };
  }

  if (spotColorMode === "age") {
    return {
      key: "spots",
      title: "DX Spots",
      entries: AGE_COLOR_STOPS.map((stop) => ({
        color: stop.color,
        label: stop.label,
      })),
      note: "Time since the spot was posted",
    };
  }

  return {
    key: "spots",
    title: "DX Spots",
    entries: SPOT_BAND_ORDER.map((band) => ({
      color: BAND_COLORS[band],
      label: band,
    })),
  };
}

function buildActivationsSpec(): LayerLegendSpec {
  return {
    key: "activations",
    title: "Activations",
    entries: [
      ...SPOT_BAND_ORDER.map((band) => ({
        color: BAND_COLORS[band],
        label: band,
      })),
      { color: BAND_COLORS.default, label: "Other" },
    ],
    note: "POTA/SOTA/WWFF callsign pills use band colors",
  };
}

function buildReplaySpec(): LayerLegendSpec {
  return {
    key: "replay",
    title: "Spot Replay",
    entries: [{ color: SPOT_REPLAY_COLOR, label: "Historical route" }],
    note: "Past reports; hover or click either endpoint to inspect",
  };
}

function buildGeomagneticFieldSpec(): LayerLegendSpec {
  return {
    key: "geomagField",
    title: "Magnetic Field",
    entries: [
      { color: GEOMAG_FIELD_COLORS.quiet, label: "Quiet Kp 0-3" },
      { color: GEOMAG_FIELD_COLORS.active, label: "Active Kp 4-5" },
      { color: GEOMAG_FIELD_COLORS.storm, label: "Storm Kp 6-7" },
      { color: GEOMAG_FIELD_COLORS.severe, label: "Severe Kp 8-9" },
    ],
    note: "Modeled physics lines, not radio paths or stations",
  };
}

function buildLunarSubpointSpec(): LayerLegendSpec {
  return {
    key: "lunarSubpoint",
    title: "Lunar Subpoint",
    entries: [
      { color: LUNAR_SUBPOINT_COLOR, label: "Moon directly overhead" },
    ],
    note: "Geocentric sublunar point at the displayed time",
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
    key:
      layers.contestQsos && !layers.loggedQsos ? "contestQsos" : "loggedQsos",
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
    // The core is the dot the user sees; #ff6600 is only the translucent glow.
    entries: [{ color: FIRE_CORE_COLOR, label: "Active fire" }],
  };
}

function buildLightningSpec(viewMode: ViewMode): LayerLegendSpec {
  // The globe interpolates the core color continuously by peak current; the
  // 2D renderers draw amber and switch to white only above the threshold.
  const entries =
    viewMode === "globe"
      ? [
          { color: LIGHTNING_COLOR_WEAK, label: "Weak strike" },
          { color: LIGHTNING_COLOR_STRONG, label: "Strong strike" },
        ]
      : [
          { color: LIGHTNING_COLOR_FLAT, label: "Strike" },
          {
            color: LIGHTNING_COLOR_STRONG,
            label: `Over ${LIGHTNING_STRONG_KA} kA`,
          },
        ];
  return {
    key: "lightning",
    title: "Lightning",
    entries,
    note: "Strikes fade out over 10 minutes",
  };
}

// ---------------------------------------------------------------------------
// Per-view support
// ---------------------------------------------------------------------------

/**
 * Layers each renderer actually draws. A layer flag staying enabled while the
 * user switches views must not put an entry in the legend for markers that
 * view never paints.
 *
 * Globe draws everything in this module. FlatMapView and AzimuthalView have no
 * code path at all for the layers omitted below -- verified by their absence
 * from those files, not merely by a missing mount.
 */
const FLAT_SUPPORTED = new Set<keyof MapState["layers"]>([
  "spots",
  "activations",
  "lunarSubpoint",
  "ft8Spotter",
  "satellites",
  "wspr",
  "contestQsos",
  "loggedQsos",
  "earthquakes",
  "weather",
  "fires",
  "lightning",
  "issTracker", // page-level ISSSkyTracker, mounted outside the view component
]);

const AZIMUTHAL_SUPPORTED = new Set<keyof MapState["layers"]>([
  "spots",
  "activations",
  "lunarSubpoint",
  "earthquakes",
  "weather",
  "fires",
  "lightning",
  "issTracker", // page-level ISSSkyTracker, mounted outside the view component
]);

/** Does `viewMode`'s renderer draw markers for `layer`? */
export function isLayerVisibleInView(
  layer: keyof MapState["layers"],
  viewMode: ViewMode,
): boolean {
  if (viewMode === "flat") return FLAT_SUPPORTED.has(layer);
  if (viewMode === "azimuthal") return AZIMUTHAL_SUPPORTED.has(layer);
  return true; // globe renders every legend-able layer
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Build legend specs for every marker layer that is both enabled and drawn by
 * the active renderer, in a fixed display order.
 */
export function buildLayerLegends(
  layers: MapState["layers"],
  opts: {
    spotColorMode: SpotColorMode;
    viewMode: ViewMode;
    replayEnabled?: boolean;
    replaySpotCount?: number;
  },
): LayerLegendSpec[] {
  const specs: LayerLegendSpec[] = [];
  const on = (layer: keyof MapState["layers"]) =>
    layers[layer] && isLayerVisibleInView(layer, opts.viewMode);

  if (on("spots")) specs.push(buildSpotsSpec(opts.spotColorMode));
  if (on("activations")) specs.push(buildActivationsSpec());
  // Replay geometry lives inside the globe's spots renderer. Requiring the
  // same layer gate plus a non-empty effective replay set prevents the legend
  // from advertising cached or currently unrendered historical routes.
  if (
    on("spots") &&
    opts.replayEnabled &&
    (opts.replaySpotCount ?? 0) > 0 &&
    opts.viewMode === "globe"
  ) {
    specs.push(buildReplaySpec());
  }
  if (on("lunarSubpoint")) specs.push(buildLunarSubpointSpec());
  if (on("ft8Spotter")) specs.push(buildFt8SpotterSpec());
  if (on("satellites")) specs.push(buildSatellitesSpec());
  if (on("beacons")) specs.push(buildBeaconsSpec());
  if (on("geomagField")) specs.push(buildGeomagneticFieldSpec());
  if (on("wspr")) specs.push(buildWsprSpec());
  if (on("contestQsos") || on("loggedQsos")) specs.push(buildQsoSpec(layers));
  if (on("earthquakes")) specs.push(buildEarthquakesSpec());
  if (on("weather")) specs.push(buildWeatherSpec());
  if (on("tropical")) specs.push(buildTropicalSpec());
  if (on("riverGauges")) specs.push(buildRiverGaugesSpec());
  if (on("meteorShowers")) specs.push(buildMeteorShowersSpec());
  if (on("issTracker")) specs.push(buildIssTrackerSpec());
  if (on("repeaters")) specs.push(buildRepeatersSpec());
  if (on("aprs")) specs.push(buildAprsSpec());
  if (on("timeStations")) specs.push(buildTimeStationsSpec());
  if (on("fires")) specs.push(buildFiresSpec());
  if (on("lightning")) specs.push(buildLightningSpec(opts.viewMode));

  return specs;
}
