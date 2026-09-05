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
const MAP_CONTENT_LABELS: Record<(typeof MAP_CONTENT_VALUES)[number], string> = {
  activity: "ACTIVITY",
  contacts: "MY CONTACTS",
  both: "BOTH",
};

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
 * anything else at 1366×768. They do not have a home in the six tabs this
 * batch defines and are left for a later batch to place deliberately.
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
