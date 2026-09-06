import { useActiveLocation } from "@/hooks/useActiveLocation";
import {
  hamClockHomeRegion,
  hamClockProjectionContent,
} from "@/lib/hamclock/displayLayout";
import {
  useHamClockDisplayStore,
  type HamClockDensity,
  type HamClockUnits,
} from "@/stores/hamclockDisplayStore";
import { useMapStore } from "@/stores/mapStore";
import {
  HamClockButton,
  HamClockSegmented,
  HamClockToggleRow,
} from "../controls";

const DENSITY_OPTIONS: { value: HamClockDensity; label: string }[] = [
  { value: "wall", label: "WALL" },
  { value: "desk", label: "DESK" },
];

const UNITS_OPTIONS: { value: HamClockUnits; label: string }[] = [
  { value: "auto", label: "AUTO" },
  { value: "imperial", label: "IMPERIAL" },
  { value: "metric", label: "METRIC" },
];

const MAP_CONTENT_VALUES = ["activity", "contacts", "both"] as const;
const MAP_CONTENT_LABELS: Record<(typeof MAP_CONTENT_VALUES)[number], string> =
  {
    activity: "ACTIVITY",
    contacts: "MY CONTACTS",
    both: "BOTH",
  };

type DwellSeconds = "15" | "30" | "45" | "60" | "120";
const DWELL_OPTIONS: { value: DwellSeconds; label: string }[] = [
  { value: "15", label: "15 S" },
  { value: "30", label: "30 S" },
  { value: "45", label: "45 S" },
  { value: "60", label: "60 S" },
  { value: "120", label: "120 S" },
];

/**
 * Density, units, map content, smart scaling and the home-region re-frame —
 * the display choices that used to live behind the header's buried
 * `HamClockDisplaySettings` popout (B1/HW-22 already put density itself in
 * the fixed header slot at both densities; it is repeated here so the whole
 * set is discoverable from one settings surface).
 *
 * Cut for this shell (see B5 report): text size, the desk accordion's
 * per-panel visibility list and "Reset display" — the panel list alone is
 * eleven `HamClockToggleRow`s, which cannot share a non-scrolling tab with
 * anything else at 1366×768. Follow radio (#160) is on the Kiosk tab for the
 * same reason: a third toggle on this tab overflows the panel.
 */
export function DisplayTab() {
  const density = useHamClockDisplayStore((s) => s.density);
  const setDensity = useHamClockDisplayStore((s) => s.setDensity);
  const units = useHamClockDisplayStore((s) => s.units);
  const setUnits = useHamClockDisplayStore((s) => s.setUnits);
  const mapContent = useHamClockDisplayStore((s) => s.mapContent);
  const setMapContent = useHamClockDisplayStore((s) => s.setMapContent);
  const smartScaling = useHamClockDisplayStore((s) => s.smartScaling);
  const setSmartScaling = useHamClockDisplayStore((s) => s.setSmartScaling);
  const autoPage = useHamClockDisplayStore((s) => s.autoPage);
  const setAutoPage = useHamClockDisplayStore((s) => s.setAutoPage);
  const frameHome = useHamClockDisplayStore((s) => s.frameHome);
  const viewMode = useMapStore((s) => s.viewMode);
  const location = useActiveLocation();

  const effectiveMapContent = hamClockProjectionContent(viewMode, mapContent);

  return (
    <div className="hcc-tabgrid">
      <HamClockSegmented
        label="Density"
        value={density}
        onChange={setDensity}
        options={DENSITY_OPTIONS}
      />
      <HamClockSegmented
        label="Units"
        value={units}
        onChange={setUnits}
        options={UNITS_OPTIONS}
      />
      <HamClockSegmented
        label="Map content"
        value={effectiveMapContent}
        onChange={setMapContent}
        options={MAP_CONTENT_VALUES.map((value) => ({
          value,
          label: MAP_CONTENT_LABELS[value],
          disabled: viewMode === "azimuthal" && value !== "activity",
        }))}
      />
      <HamClockToggleRow
        label="Smart scaling"
        detail="Fits panel widths and spacing to the desk text size"
        checked={smartScaling}
        onChange={setSmartScaling}
      />
      <HamClockToggleRow
        label="Auto-page"
        detail="Rotates both rails through the wall's pages on a timer"
        caveat="Pauses on any touch, click or key and resumes after a minute of quiet"
        checked={autoPage.enabled}
        onChange={(enabled) => setAutoPage({ ...autoPage, enabled })}
        options={
          <HamClockSegmented
            label="Dwell"
            value={String(autoPage.dwellSeconds) as DwellSeconds}
            onChange={(value) =>
              setAutoPage({ ...autoPage, dwellSeconds: Number(value) })
            }
            options={DWELL_OPTIONS}
          />
        }
      />
      <div className="hcc-row hcc-action-row">
        <div className="hcc-row-main">
          <div className="hcc-row-text">
            <span className="hcc-row-label">Home region</span>
            <span className="hcc-row-detail">
              {location
                ? "Re-centers the map on your station"
                : "Set a station location first"}
            </span>
          </div>
          <HamClockButton
            disabled={!location}
            onClick={() => {
              if (!location) return;
              const map = useMapStore.getState();
              if (map.observatoryMode) map.exitObservatory();
              frameHome(hamClockHomeRegion(location.lat, location.lon));
            }}
          >
            SET HOME
          </HamClockButton>
        </div>
      </div>
    </div>
  );
}
