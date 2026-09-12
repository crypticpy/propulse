/**
 * Persistent Satellites list for the framed (non-pro) 3D globe (#1083).
 *
 * Pro mode already mounts SatellitePanel inside FullscreenPropSphere's
 * FloatingPanel. Regular globe had no equivalent — only the marker popup
 * and Layers "See full list" dialog. This reuses that same FloatingPanel +
 * SatellitePanel pattern whenever the satellites layer is on.
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { MAP_PAGE_CHROME_Z } from "@/lib/map/globeRenderOrder";
import { FloatingPanel } from "@/components/layout/FloatingPanel";
import { SatellitePanel } from "./SatellitePanel";
import { useMapStore } from "@/stores/mapStore";

const SATELLITES_ICON = (
  <svg
    className="w-3.5 h-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m7.5 3.5 8 8m-2-6 4 4m-8 0 4 4M4.5 19.5l4-4m-2 2 2-2"
    />
  </svg>
);

export function FramedGlobeSatellitesPanel() {
  const layoutMode = useMapStore((s) => s.layoutMode);
  const viewMode = useMapStore((s) => s.viewMode);
  const satellitesOn = useMapStore((s) => s.layers.satellites);
  const [collapsed, setCollapsed] = useState(false);

  if (layoutMode === "pro" || layoutMode === "hamclock") return null;
  if (viewMode !== "globe" || !satellitesOn) return null;

  // Fixed coordinates must resolve against the viewport, not the filtered
  // and clipped map Card that contains this component in the React tree.
  return createPortal(
    <FloatingPanel
      id="satellites"
      title="Satellites"
      defaultPosition={{ x: 62, y: 22 }}
      defaultSize={{ width: 260, height: 360 }}
      minSize={{ width: 220, height: 200 }}
      maxSize={{ width: 400, height: 600 }}
      minTop={72}
      collapsed={collapsed}
      onCollapse={() => setCollapsed((open) => !open)}
      zIndex={MAP_PAGE_CHROME_Z.interactiveChrome}
      icon={SATELLITES_ICON}
    >
      <SatellitePanel className="!bg-transparent !border-0 h-full" />
    </FloatingPanel>,
    document.body,
  );
}
