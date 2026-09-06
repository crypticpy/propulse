import type { SolarSourceId } from "./contracts";
import type { SolarSourceGroup } from "./sourcePolicies";

export type SolarWidgetGroup = SolarSourceGroup | "imagery";
export type SolarModalKind = "metric" | "alert" | "image" | "animation" | "none";

export interface SolarWidgetDefinition {
  id: string;
  title: string;
  group: SolarWidgetGroup;
  requiredSources: readonly SolarSourceId[];
  optionalSources: readonly SolarSourceId[];
  desktopPlacement: "primary" | "secondary" | "detail";
  mobilePlacement: "summary" | "disclosure";
  essentialOnMobile: boolean;
  renderOnExpand: boolean;
  helpKey: string;
  detailModal: SolarModalKind;
  refresh: "source" | "dependencies" | "media";
  emptyPolicy: "unavailable" | "successful-empty";
}

function widget(
  definition: Omit<SolarWidgetDefinition, "optionalSources" | "renderOnExpand" | "emptyPolicy"> &
    Partial<Pick<SolarWidgetDefinition, "optionalSources" | "renderOnExpand" | "emptyPolicy">>,
): SolarWidgetDefinition {
  return {
    optionalSources: [],
    renderOnExpand: definition.group !== "now",
    emptyPolicy: "unavailable",
    ...definition,
  };
}

/**
 * Declarative dependency and presentation contract for every active Solar Pulse
 * widget family. Rendering remains in the page, while query enablement,
 * refresh coverage, and source health derive from these dependencies.
 */
export const SOLAR_WIDGETS: readonly SolarWidgetDefinition[] = [
  widget({ id: "kp-current", title: "Planetary Kp", group: "now", requiredSources: ["noaa-k-index"], desktopPlacement: "primary", mobilePlacement: "summary", essentialOnMobile: true, helpKey: "planetary-kp", detailModal: "metric", refresh: "source" }),
  widget({ id: "sfi-current", title: "10.7 cm solar flux", group: "now", requiredSources: ["noaa-solar-flux"], desktopPlacement: "primary", mobilePlacement: "summary", essentialOnMobile: true, helpKey: "solar-flux", detailModal: "metric", refresh: "source" }),
  widget({ id: "bz-current", title: "IMF Bz", group: "now", requiredSources: ["noaa-magnetometer"], desktopPlacement: "primary", mobilePlacement: "summary", essentialOnMobile: true, helpKey: "imf-bz", detailModal: "metric", refresh: "source" }),
  widget({ id: "xray-current", title: "GOES long X-ray", group: "now", requiredSources: ["noaa-xray"], desktopPlacement: "primary", mobilePlacement: "summary", essentialOnMobile: true, helpKey: "xray", detailModal: "metric", refresh: "source" }),
  widget({ id: "global-guidance", title: "General HF guidance", group: "now", requiredSources: ["noaa-k-index", "noaa-solar-flux"], optionalSources: ["noaa-magnetometer"], desktopPlacement: "secondary", mobilePlacement: "summary", essentialOnMobile: true, helpKey: "general-guidance", detailModal: "none", refresh: "dependencies" }),
  widget({ id: "noaa-scales", title: "Official NOAA scales", group: "now", requiredSources: ["swpc-scales"], desktopPlacement: "secondary", mobilePlacement: "summary", essentialOnMobile: true, helpKey: "noaa-scales", detailModal: "none", refresh: "source" }),
  widget({ id: "official-alerts", title: "Recent official SWPC bulletins", group: "now", requiredSources: ["swpc-alerts"], desktopPlacement: "secondary", mobilePlacement: "summary", essentialOnMobile: true, helpKey: "official-alerts", detailModal: "alert", refresh: "source", emptyPolicy: "successful-empty" }),

  widget({ id: "protons", title: ">=10 MeV proton flux", group: "impacts", requiredSources: ["noaa-protons"], desktopPlacement: "secondary", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "proton-flux", detailModal: "none", refresh: "source" }),
  widget({ id: "dst", title: "Dst index", group: "impacts", requiredSources: ["noaa-dst"], desktopPlacement: "secondary", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "dst", detailModal: "none", refresh: "source" }),
  widget({ id: "latest-flare", title: "Latest classified flare", group: "impacts", requiredSources: ["swpc-xray-latest"], desktopPlacement: "secondary", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "latest-flare", detailModal: "none", refresh: "source" }),
  widget({ id: "drap-grid", title: "D-RAP grid", group: "impacts", requiredSources: ["noaa-drap"], desktopPlacement: "secondary", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "drap", detailModal: "none", refresh: "source" }),
  widget({ id: "cme", title: "Recent CME analyses", group: "impacts", requiredSources: ["nasa-cme"], desktopPlacement: "secondary", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "cme", detailModal: "none", refresh: "source", emptyPolicy: "successful-empty" }),

  widget({ id: "kp-forecast", title: "Planetary Kp timeline", group: "forecast", requiredSources: ["noaa-k-index"], desktopPlacement: "secondary", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "kp-forecast", detailModal: "none", refresh: "source" }),
  widget({ id: "event-probabilities", title: "One-day event probabilities", group: "forecast", requiredSources: ["noaa-probabilities"], desktopPlacement: "secondary", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "probabilities", detailModal: "none", refresh: "source" }),
  widget({ id: "three-day-forecast", title: "Three-day solar / geomagnetic prediction", group: "forecast", requiredSources: ["noaa-flux-forecast"], desktopPlacement: "secondary", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "three-day-forecast", detailModal: "none", refresh: "source" }),

  widget({ id: "sfi-history", title: "Observed solar flux history", group: "details", requiredSources: ["noaa-solar-flux"], desktopPlacement: "detail", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "sfi-history", detailModal: "none", refresh: "source" }),
  widget({ id: "bz-history", title: "IMF Bz history", group: "details", requiredSources: ["noaa-magnetometer"], desktopPlacement: "detail", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "bz-history", detailModal: "none", refresh: "source" }),
  widget({ id: "solar-cycle", title: "Solar cycle context", group: "details", requiredSources: ["noaa-sunspots"], desktopPlacement: "detail", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "solar-cycle", detailModal: "none", refresh: "source" }),
  widget({ id: "wind-mag", title: "Solar-wind magnetic summary", group: "details", requiredSources: ["swpc-solar-wind-mag"], desktopPlacement: "detail", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "wind-mag", detailModal: "none", refresh: "source" }),
  widget({ id: "wind-plasma", title: "Solar-wind speed summary", group: "details", requiredSources: ["swpc-solar-wind-plasma"], desktopPlacement: "detail", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "wind-plasma", detailModal: "none", refresh: "source" }),
  widget({ id: "xray-24h", title: "24-hour X-ray flux", group: "details", requiredSources: ["noaa-xray-24h"], desktopPlacement: "detail", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "xray-24h", detailModal: "none", refresh: "source" }),
  widget({ id: "bz-24h", title: "24-hour IMF Bz", group: "details", requiredSources: ["noaa-magnetometer-24h"], desktopPlacement: "detail", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "bz-24h", detailModal: "none", refresh: "source" }),
  widget({ id: "flux-outlook", title: "27-day solar and geomagnetic outlook", group: "forecast", requiredSources: ["noaa-flux-outlook"], desktopPlacement: "secondary", mobilePlacement: "disclosure", essentialOnMobile: false, helpKey: "flux-outlook", detailModal: "none", refresh: "source" }),
];

export function sourceIdsForVisibleGroups(
  groups: ReadonlySet<SolarSourceGroup>,
): SolarSourceId[] {
  const ids = new Set<SolarSourceId>();
  for (const definition of SOLAR_WIDGETS) {
    if (definition.group === "imagery" || !groups.has(definition.group)) continue;
    for (const source of [...definition.requiredSources, ...definition.optionalSources]) {
      ids.add(source);
    }
  }
  return [...ids];
}
