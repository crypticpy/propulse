import {
  LAYER_CATEGORIES,
  effectiveLayerCaveat,
  formatLayerProvenance,
  isLayerToggleDisabled,
  layersInCategory,
  type LayerCategoryId,
} from "@/lib/map/layerRegistry";
import { useMapStore } from "@/stores/mapStore";
import { HamClockTabs, HamClockToggleRow } from "../controls";

/**
 * One category's rows, guide §8 anatomy: icon · name · provenance line
 * (`source · cadence · coverage`) · optional caveat · big ON/OFF. Every row
 * is bound live to `useMapStore().layers` / `toggleLayer`, so a toggle here
 * changes the map immediately — there is no separate "apply" step. A layer
 * the current projection cannot show is disabled with the reason in the
 * caveat slot instead of hidden, so switching projection never makes a row
 * disappear out from under a reader mid-glance.
 */
function LayerCategoryPanel({ category }: { category: LayerCategoryId }) {
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const viewMode = useMapStore((s) => s.viewMode);

  return (
    <div className="hcc-layers-grid">
      {layersInCategory(category).map((entry) => (
        <HamClockToggleRow
          key={entry.key}
          icon={<span className="hcc-layer-icon">{entry.icon}</span>}
          label={entry.name}
          detail={formatLayerProvenance(entry)}
          caveat={effectiveLayerCaveat(entry.key, viewMode)}
          checked={layers[entry.key]}
          disabled={isLayerToggleDisabled(entry.key, viewMode)}
          onChange={() => toggleLayer(entry.key)}
        />
      ))}
    </div>
  );
}

/**
 * Layers tab (B6/HW-21, HW-39): category sub-tabs over the one layer
 * registry that also feeds the PropSphere help page, so a layer's source,
 * cadence and coverage read the same everywhere instead of the popover, the
 * help page and the status line each describing it differently. Categories
 * are sized in the registry so none exceeds eight rows — the ceiling a
 * non-scrolling tab can hold (guide §8).
 */
export function LayersTab() {
  return (
    <HamClockTabs
      label="Layer categories"
      tabs={LAYER_CATEGORIES.map((category) => ({
        id: category.id,
        label: category.label,
        content: <LayerCategoryPanel category={category.id} />,
      }))}
    />
  );
}
