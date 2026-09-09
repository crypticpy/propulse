import { useEffect } from "react";
import { FilterControls, Surface } from "propulse";

const bandPresets = [
  { id: "hf-low", name: "HF Low", bands: ["160m", "80m", "40m"] },
  { id: "contest", name: "Contest", bands: ["20m", "15m", "10m"] },
];

const base = {
  onSearchChange: () => {},
  onGridFilterChange: () => {},
  onMaxAgeChange: () => {},
  onBandToggle: () => {},
  onModeToggle: () => {},
  onSourceToggle: () => {},
  onNeededOnlyToggle: () => {},
  onSortByNeededToggle: () => {},
  onSavePreset: () => {},
  onApplyPreset: () => {},
  onDeletePreset: () => {},
  availableBands: ["160m", "80m", "40m", "20m", "17m", "15m", "10m"],
  availableModes: ["CW", "SSB", "FT8", "RTTY"],
  bandPresets,
};

// isCollapsed is internal useState(true) with no controlling prop — this
// cell shows the real default collapsed bar (search + grid + filter badge).
export function Collapsed() {
  return (
    <Surface style={{ width: 360 }}>
      <FilterControls
        {...base}
        searchText=""
        gridFilter=""
        maxAge={30}
        selectedBands={[]}
        selectedModes={[]}
        selectedSources={[]}
        neededOnly={false}
        sortByNeeded={false}
        neededCount={0}
      />
    </Surface>
  );
}

// Simulates the operator clicking the "Filters" toggle to expand the panel
// — the same click that reveals band/mode/source pills and presets.
export function Expanded() {
  return (
    <Surface style={{ width: 360 }}>
      <ExpandedInner />
    </Surface>
  );
}

function ExpandedInner() {
  useEffect(() => {
    document.querySelector("button")?.click();
  }, []);
  return (
    <div>
      <FilterControls
        {...base}
        searchText="W1AW"
        gridFilter="EM12"
        maxAge={30}
        selectedBands={["20m", "40m"]}
        selectedModes={["FT8", "CW"]}
        selectedSources={["Cluster", "PSKReporter"]}
        neededOnly
        sortByNeeded={false}
        neededCount={12}
      />
    </div>
  );
}
