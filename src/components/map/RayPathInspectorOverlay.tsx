import { PathPointInspector } from "./PathPointInspector";
import { useRayPathInspectorStore } from "./rayPathInspectorStore";

interface RayPathInspectorOverlayProps {
  portalTarget: HTMLDivElement | null;
}

/**
 * Renders the ray-path bounce-point inspector outside the r3f `<Canvas>` so
 * `MapSurfaceContext` (focus-home protocol) is available to PathPointInspector.
 * RayPathArc publishes state via `rayPathInspectorStore` (#872) -- including
 * while the inspector is closed, so its always-rendered "Path points"
 * keyboard trigger stays mounted (the in-scene hit areas are not
 * DOM-focusable, so it is the only keyboard entry point).
 */
export function RayPathInspectorOverlay({
  portalTarget,
}: RayPathInspectorOverlayProps) {
  const snapshot = useRayPathInspectorStore((state) => state.active);
  if (!snapshot || !portalTarget) return null;

  return <PathPointInspector {...snapshot} portalTarget={portalTarget} />;
}
