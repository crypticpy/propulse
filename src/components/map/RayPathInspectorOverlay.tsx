import { PathPointInspector } from "./PathPointInspector";
import { useRayPathInspectorStore } from "./rayPathInspectorStore";

interface RayPathInspectorOverlayProps {
  portalTarget: HTMLDivElement | null;
}

/**
 * Renders the ray-path bounce-point inspector outside the r3f `<Canvas>` so
 * `MapSurfaceContext` (focus-home protocol) is available to PathPointInspector.
 * RayPathArc publishes state via `rayPathInspectorStore` (#872).
 */
export function RayPathInspectorOverlay({
  portalTarget,
}: RayPathInspectorOverlayProps) {
  const snapshot = useRayPathInspectorStore((state) => state.snapshot);
  if (!snapshot || !portalTarget) return null;

  return <PathPointInspector {...snapshot} portalTarget={portalTarget} />;
}
