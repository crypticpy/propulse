import { createPortal } from "react-dom";
import { PathPointInspector } from "./PathPointInspector";
import {
  selectTriggers,
  useRayPathInspectorStore,
} from "./rayPathInspectorStore";

interface RayPathInspectorOverlayProps {
  portalTarget: HTMLDivElement | null;
}

/**
 * Renders the ray-path bounce-point inspector outside the r3f `<Canvas>` so
 * `MapSurfaceContext` (focus-home protocol) is available to PathPointInspector.
 * RayPathArc publishes state via `rayPathInspectorStore` (#872) -- including
 * while the inspector is closed, so the keyboard triggers below stay mounted
 * (the in-scene hit areas are Three.js objects and not DOM-focusable).
 *
 * One panel, one trigger per arc: the visible card follows the single
 * arbitrated snapshot (only one panel can be open at a time), but every arc
 * that has points gets its own sr-only trigger. With `pathMode: "both"` a
 * single trigger would open only the arbitrated owner's list and the other
 * route's points would be reachable by pointer only (#872 review round 3).
 */
export function RayPathInspectorOverlay({
  portalTarget,
}: RayPathInspectorOverlayProps) {
  const snapshot = useRayPathInspectorStore((state) => state.active);
  const entries = useRayPathInspectorStore((state) => state.entries);
  if (!portalTarget) return null;

  const triggers = selectTriggers(entries);
  if (!snapshot && triggers.length === 0) return null;

  return (
    <>
      {createPortal(
        <>
          {triggers.map((trigger) => (
            <button
              key={trigger.ownerId}
              type="button"
              className="pointer-events-auto sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[80] focus:rounded-md focus:border focus:border-cyan-400/40 focus:bg-su-canvas focus:px-3 focus:py-2 focus:text-xs focus:text-su-text"
              onClick={() => trigger.onOpenList?.()}
            >
              {trigger.label}
            </button>
          ))}
        </>,
        portalTarget,
      )}
      {snapshot && (
        <PathPointInspector
          {...snapshot}
          portalTarget={portalTarget}
          hideTrigger
        />
      )}
    </>
  );
}
