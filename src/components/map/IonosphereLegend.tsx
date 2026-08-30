/**
 * IonosphereLegend Component
 *
 * Explains the D/E/F1/F2 ionospheric layer colors used by the ray-path
 * bounce-point markers (RayPathArc's ReflectionMarker instances). Reuses
 * the shared color/name maps from IonosphericShells.tsx so the legend can
 * never drift out of sync with the markers it describes.
 */

import {
  IONOSPHERE_LAYER_COLORS,
  IONOSPHERE_LAYER_NAMES,
} from "./IonosphericShells";

interface IonosphereLegendProps {
  /** Additional CSS classes */
  className?: string;
}

const IONOSPHERE_LAYERS = (
  Object.keys(IONOSPHERE_LAYER_COLORS) as Array<
    keyof typeof IONOSPHERE_LAYER_COLORS
  >
).map((layer) => ({
  layer,
  color: IONOSPHERE_LAYER_COLORS[layer],
  name: IONOSPHERE_LAYER_NAMES[layer],
}));

export function IonosphereLegend({ className = "" }: IonosphereLegendProps) {
  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <span className="text-gray-500 font-medium">Bounce:</span>
      {IONOSPHERE_LAYERS.map(({ layer, color, name }) => (
        <div key={layer} className="flex items-center gap-1">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-gray-400">{name}</span>
        </div>
      ))}
    </div>
  );
}
