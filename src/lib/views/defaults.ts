import { WALL_PAGES } from "@/lib/hamclock/wallPages";
import { viewConfigurationSchema, viewLayersSchema, type ViewConfiguration, type ViewFamily } from "./contracts";
import type { SpotPresentationPreferences } from "./spotContracts";

/** Fresh values, not a mutable singleton or a subscription to an account preset. */
export function createSpotPreferences(): SpotPresentationPreferences {
  return {
    filters: {
      modes: { all: true, categories: [], modes: [], includeUnknown: true, includeInferred: true },
      bands: [], sources: [], maxAgeMinutes: 30, spotLimit: 50,
    },
    grouping: { enabled: true, detail: "regions", minGroupSize: 3 },
    paths: {
      background: {
        shape: "simple-arc", style: "quick-sweep", travelSeconds: 0.6,
        trailSeconds: 1, fadeSeconds: 0.5, repeatSeconds: 3,
        arrivalPulse: true, bounceGlow: false,
      },
      selected: {
        shape: "ionospheric-hops", style: "traveling-pulse", travelSeconds: 1.5,
        trailSeconds: 1, fadeSeconds: 0.5, repeatSeconds: 3,
        arrivalPulse: false, bounceGlow: true,
      },
      animate: "new-spots", reduceMotion: false, maxActive: 12, maxPending: 100,
    },
  };
}

/** Complete fallback seed. SP-08 owns named recipes; migration preserves existing user values. */
export function createViewConfiguration(family: ViewFamily = "pro"): ViewConfiguration {
  const wall = family === "hamclock";
  const home = () => ({
    center: { lat: 0, lon: -90 }, zoom: 1, tiltDegrees: 0, rotationDegrees: 0,
    latitudeSpan: 120, longitudeSpan: 240,
  });
  const on = new Set(["terminator", "greyline", "nightLights", "spots", "gridActivity"]);
  const spots = createSpotPreferences();
  if (wall) {
    spots.paths.background.style = "off";
    spots.paths.background.arrivalPulse = false;
    spots.paths.selected = null;
  }
  return viewConfigurationSchema.parse({
    schemaVersion: 1, family, route: family === "route" ? "/solar" : "/map",
    spots,
    presentation: {
      projection: wall ? "flat" : "globe",
      cameraHomes: { globe: home(), flat: home(), azimuthal: home() },
      layers: Object.fromEntries(viewLayersSchema.keyof().options.map((key) => [key, on.has(key)])),
      mapStyle: "satellite", tileProviderId: null, quality: "auto", fit: "auto", nightDarkness: 0.5,
      autoRotate: { enabled: false, secondsPerRevolution: 240 },
      textScale: wall ? "lg" : "md", smartScaling: true,
      forecast: { bandMode: "common", customBands: ["80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"], showSnrValues: false, detailedFooter: true, hoursToShow: 13 },
      ticker: { position: "bottom", coverageArea: "regional" },
      theme: { id: "dark", accentId: "plasma", customPrimary: null },
      labels: {
        borders: true, stateBorders: false, countryNames: true, cities: false,
        maidenheadGrid: false, gridLabels: false, wasOverlay: false, tileLabels: true,
        callsigns: true, endpoints: true, scale: 1, gridDetail: 2,
      },
      panels: [], dockGroups: [], proRibbonExpanded: true, pathMode: "short",
      spotColorMode: "mode", visualStyle: "realistic",
      controls: {
        globeOrientation: "natural", holdDurationMs: 500, flyoutAutoDismissMs: 2500,
        flyoutAutoDismissEnabled: true, spotHitRadiusMultiplier: 1, spotDotScale: 1,
        mapPinScale: 1, showHoverTooltips: true, mapAspectRatio: 2, bandHeightArcs: false,
        spotAgeDecay: true, showAgeColumn: true,
        compassRose: { enabled: true, beamWidth: 60, showBeamWidth: false }, timeFormat: "24h",
      },
      overlays: {
        nvisEnabled: false, nvisOpacity: 0.35, beaconInactiveOpacity: 0.6,
        gridActivityEndpoint: "dx", showEsLayer: false, observedMUFMode: "off",
        showCorrelation: false, satelliteCategoryFilter: "all", satelliteShowAll: false,
      },
      hamclock: {
        mode: "traffic", density: "wall", theme: "pulse", units: "auto", mapContent: "activity",
        panelCollapsed: {}, bandFocus: [], crawlHamNews: true, crawlWorldNews: false,
        reliability: { mode: "FT8", powerWatts: 100, antennaType: "dipole" },
        hiddenPanels: [], spotsSide: "right", spotsSidebarCollapsed: false, infoSidebarCollapsed: false,
        railLayout: {
          left: WALL_PAGES.map((page) => ({ pageId: page.id, tileIds: [...page.left] })),
          right: WALL_PAGES.map((page) => ({ pageId: page.id, tileIds: [...page.right] })),
        },
        autoPage: { enabled: false, dwellSeconds: 120 },
        initialPageId: WALL_PAGES[0]?.id ?? null, pinnedTile: null, widgets: [],
      },
    },
    context: {
      scope: "observation", followOperatingSession: false, followRadio: false,
      stationId: null, radioId: null, displayTime: { kind: "live" },
    },
  });
}
