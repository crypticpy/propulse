import { useState, useCallback, useRef } from "react";
import { useMapStore, type DockGroup } from "@/stores/mapStore";

// ── Exported types ────────────────────────────────────────────────────────────

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapTarget {
  edge: "top" | "bottom" | "left" | "right";
  position: number; // pixel position for the snap indicator line
}

export interface PanelSnapInfo {
  targetPanelId: string;
  side: "below" | "above"; // dragging panel goes below/above target
}

export interface UsePanelDockingReturn {
  /** Call during drag -- detects snap targets, returns snapped position */
  onDragMove: (
    panelId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => { x: number; y: number };
  /** Call on drag end -- commits docking if snap is active */
  onDragEnd: (
    panelId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  /** Active snap indicator for the dragging panel (for visual feedback) */
  activeSnapTarget: SnapTarget | null;
  /** Handle width resize from a panel in a dock group */
  onGroupWidthResize: (panelId: string, newWidth: number) => void;
  /** Get dock-group-controlled width for a panel (null if not in a group) */
  getDockGroupWidth: (panelId: string) => number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EDGE_SNAP_THRESHOLD = 15;
const PANEL_SNAP_THRESHOLD = 20;
const HORIZONTAL_OVERLAP_MIN = 0.5; // 50%
const UNDOCK_DISTANCE = 40;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Calculate horizontal overlap ratio between two rectangles (0..1) */
function horizontalOverlapRatio(
  ax: number,
  aWidth: number,
  bx: number,
  bWidth: number,
): number {
  const overlapLeft = Math.max(ax, bx);
  const overlapRight = Math.min(ax + aWidth, bx + bWidth);
  const overlap = Math.max(0, overlapRight - overlapLeft);
  const minWidth = Math.min(aWidth, bWidth);
  return minWidth > 0 ? overlap / minWidth : 0;
}

/** Find the dock group containing a given panel */
function findGroupForPanel(
  dockGroups: DockGroup[],
  panelId: string,
): DockGroup | undefined {
  return dockGroups.find((g) => g.panelIds.includes(panelId));
}

/** Compute where a docked panel should be (its expected y position) based on
 *  the panel rects of the panels above it in the dock group. */
function getDockedPosition(
  panelId: string,
  group: DockGroup,
  panelRects: Record<string, PanelRect>,
): { x: number; y: number } | null {
  const idx = group.panelIds.indexOf(panelId);
  if (idx < 0) return null;

  // The first panel in the group: its current position is the anchor
  if (idx === 0) {
    const rect = panelRects[panelId];
    return rect ? { x: group.sharedX, y: rect.y } : null;
  }

  // For subsequent panels, stack below the previous one
  const prevId = group.panelIds[idx - 1];
  const prevRect = panelRects[prevId];
  if (!prevRect) return null;

  return {
    x: group.sharedX,
    y: prevRect.y + prevRect.height,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePanelDocking(
  panelRects: Record<string, PanelRect>,
): UsePanelDockingReturn {
  const [activeSnapTarget, setActiveSnapTarget] = useState<SnapTarget | null>(
    null,
  );

  // Ref to track the current panel-to-panel snap info without causing re-renders
  // during rapid drag events
  const snapInfoRef = useRef<PanelSnapInfo | null>(null);

  // Ref to track whether the dragging panel was undocked during this drag session
  const undockedDuringDragRef = useRef(false);

  // ── onDragMove ────────────────────────────────────────────────────────────

  const onDragMove = useCallback(
    (
      panelId: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ): { x: number; y: number } => {
      const { dockGroups, removePanelFromDockGroup } = useMapStore.getState();

      let snappedX = x;
      let snappedY = y;
      let newSnapTarget: SnapTarget | null = null;
      let newSnapInfo: PanelSnapInfo | null = null;

      // ── Undock logic ──────────────────────────────────────────────────────
      // If this panel is in a dock group, check if it should be freed
      const currentGroup = findGroupForPanel(dockGroups, panelId);
      if (currentGroup && !undockedDuringDragRef.current) {
        const dockedPos = getDockedPosition(panelId, currentGroup, panelRects);
        if (dockedPos) {
          const dx = x - dockedPos.x;
          const dy = y - dockedPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > UNDOCK_DISTANCE) {
            removePanelFromDockGroup(panelId);
            undockedDuringDragRef.current = true;
          }
        }
      }

      // ── Panel-to-panel snapping ───────────────────────────────────────────
      // Only check if we haven't already snapped to a viewport edge
      const draggingBottom = y + height;
      const draggingTop = y;

      for (const [otherId, otherRect] of Object.entries(panelRects)) {
        if (otherId === panelId) continue;

        const overlap = horizontalOverlapRatio(
          x,
          width,
          otherRect.x,
          otherRect.width,
        );
        if (overlap < HORIZONTAL_OVERLAP_MIN) continue;

        const otherBottom = otherRect.y + otherRect.height;
        const otherTop = otherRect.y;

        // Check: dragging panel snaps BELOW other panel
        // (dragging panel's top meets other panel's bottom)
        if (Math.abs(draggingTop - otherBottom) < PANEL_SNAP_THRESHOLD) {
          snappedX = otherRect.x; // Align horizontally with target
          snappedY = otherBottom;
          newSnapTarget = { edge: "top", position: otherBottom };
          newSnapInfo = { targetPanelId: otherId, side: "below" };
          break;
        }

        // Check: dragging panel snaps ABOVE other panel
        // (dragging panel's bottom meets other panel's top)
        if (Math.abs(draggingBottom - otherTop) < PANEL_SNAP_THRESHOLD) {
          snappedX = otherRect.x; // Align horizontally with target
          snappedY = otherTop - height;
          newSnapTarget = { edge: "bottom", position: otherTop };
          newSnapInfo = { targetPanelId: otherId, side: "above" };
          break;
        }
      }

      // ── Viewport edge snapping ────────────────────────────────────────────
      // Only apply if no panel-to-panel snap was found
      if (!newSnapInfo) {
        const viewportWidth =
          typeof window !== "undefined" ? window.innerWidth : 1920;
        const viewportHeight =
          typeof window !== "undefined" ? window.innerHeight : 1080;

        // Left edge
        if (x < EDGE_SNAP_THRESHOLD) {
          snappedX = 0;
          newSnapTarget = { edge: "left", position: 0 };
        }
        // Right edge
        else if (x + width > viewportWidth - EDGE_SNAP_THRESHOLD) {
          snappedX = viewportWidth - width;
          newSnapTarget = { edge: "right", position: viewportWidth };
        }

        // Top edge
        if (y < EDGE_SNAP_THRESHOLD) {
          snappedY = 0;
          newSnapTarget = { edge: "top", position: 0 };
        }
        // Bottom edge
        else if (y + height > viewportHeight - EDGE_SNAP_THRESHOLD) {
          snappedY = viewportHeight - height;
          newSnapTarget = { edge: "bottom", position: viewportHeight };
        }
      }

      // Update snap info ref (no re-render) and snap target state (for UI)
      snapInfoRef.current = newSnapInfo;

      // Only update state if the snap target actually changed to avoid
      // unnecessary re-renders during rapid drag
      setActiveSnapTarget((prev) => {
        if (prev === null && newSnapTarget === null) return prev;
        if (
          prev !== null &&
          newSnapTarget !== null &&
          prev.edge === newSnapTarget.edge &&
          prev.position === newSnapTarget.position
        ) {
          return prev;
        }
        return newSnapTarget;
      });

      return { x: snappedX, y: snappedY };
    },
    [panelRects],
  );

  // ── onDragEnd ─────────────────────────────────────────────────────────────

  const onDragEnd = useCallback(
    (
      panelId: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ): void => {
      const {
        dockGroups,
        addDockGroup,
        updateDockGroup,
        removePanelFromDockGroup,
        updateProPanelLayout,
      } = useMapStore.getState();

      const currentSnapInfo = snapInfoRef.current;

      // Reset drag-session state
      snapInfoRef.current = null;
      undockedDuringDragRef.current = false;
      setActiveSnapTarget(null);

      if (!currentSnapInfo) {
        // No panel-to-panel snap active -- just persist position as-is
        updateProPanelLayout(panelId, { x, y, width, height });
        return;
      }

      const { targetPanelId, side } = currentSnapInfo;
      const targetRect = panelRects[targetPanelId];
      if (!targetRect) {
        updateProPanelLayout(panelId, { x, y, width, height });
        return;
      }

      // Remove dragging panel from any existing dock group before reassigning
      const existingGroup = findGroupForPanel(dockGroups, panelId);
      if (existingGroup) {
        removePanelFromDockGroup(panelId);
      }

      // Re-read dock groups after potential removal (state may have changed)
      const freshDockGroups = useMapStore.getState().dockGroups;
      const targetGroup = findGroupForPanel(freshDockGroups, targetPanelId);

      // Use target panel's X and width as shared dimensions
      const sharedX = targetRect.x;
      const sharedWidth = targetRect.width;

      if (targetGroup) {
        // Target is already in a dock group -- add dragging panel to it
        const targetIdx = targetGroup.panelIds.indexOf(targetPanelId);
        const newPanelIds = [...targetGroup.panelIds];

        if (side === "below") {
          // Insert after target
          newPanelIds.splice(targetIdx + 1, 0, panelId);
        } else {
          // Insert before target (above)
          newPanelIds.splice(targetIdx, 0, panelId);
        }

        updateDockGroup(targetGroup.id, {
          panelIds: newPanelIds,
          sharedX,
          sharedWidth,
        });
      } else {
        // Create a new dock group with both panels
        const panelIds =
          side === "below"
            ? [targetPanelId, panelId]
            : [panelId, targetPanelId];

        const newGroup: DockGroup = {
          id: crypto.randomUUID(),
          orientation: "vertical",
          panelIds,
          sharedX,
          sharedWidth,
        };

        addDockGroup(newGroup);
      }

      // Reposition the dragging panel to its snapped location and shared width
      const finalY =
        side === "below"
          ? targetRect.y + targetRect.height
          : targetRect.y - height;

      updateProPanelLayout(panelId, {
        x: sharedX,
        y: finalY,
        width: sharedWidth,
        height,
      });
    },
    [panelRects],
  );

  // ── onGroupWidthResize ────────────────────────────────────────────────────

  const onGroupWidthResize = useCallback(
    (panelId: string, newWidth: number): void => {
      const {
        dockGroups,
        updateDockGroup,
        updateProPanelLayout,
        proPanelLayout,
      } = useMapStore.getState();

      const group = findGroupForPanel(dockGroups, panelId);
      if (!group) return;

      // Update the group's shared width
      updateDockGroup(group.id, { sharedWidth: newWidth });

      // Propagate to all panels in the group
      for (const memberId of group.panelIds) {
        const layout = proPanelLayout[memberId];
        if (layout) {
          updateProPanelLayout(memberId, {
            x: group.sharedX,
            y: layout.y,
            width: newWidth,
            height: layout.height,
          });
        }
      }
    },
    [],
  );

  // ── getDockGroupWidth ─────────────────────────────────────────────────────

  const getDockGroupWidth = useCallback((panelId: string): number | null => {
    const { dockGroups } = useMapStore.getState();
    const group = findGroupForPanel(dockGroups, panelId);
    return group ? group.sharedWidth : null;
  }, []);

  return {
    onDragMove,
    onDragEnd,
    activeSnapTarget,
    onGroupWidthResize,
    getDockGroupWidth,
  };
}
