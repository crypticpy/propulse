import { useCallback, useEffect, useRef, useState } from "react";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { PresentableSpot } from "@/lib/map/spotPresentation";

export type SpotHoverSurface = "endpoint" | "label";

/**
 * Identifies the concrete interaction surface that reported a spot hover.
 * A single report can have several surfaces (DX label, spotter label, live
 * endpoint, and animated-trace endpoint), so report identity alone is not
 * enough to decide whether a leave event still owns the active preview.
 */
export interface SpotHoverInteraction {
  surface: SpotHoverSurface;
  interactionId: string;
}

export interface HoveredSpotData {
  spot: PresentableSpot;
  screenPos: ScreenAnchor;
}

export type SpotPreviewInteraction = "pointer" | "focus";

interface HoverCandidate extends HoveredSpotData {
  interaction: SpotHoverInteraction;
  spotKey: string;
}

const DISMISS_DELAY_MS = 260;
const ENDPOINT_OVERLAP_RADIUS_PX = 14;

function spotKey(spot: PresentableSpot): string {
  return `${spot.source ?? "Cluster"}:${spot.id}`;
}

function surfacePriority(surface: SpotHoverSurface): number {
  return surface === "label" ? 2 : 1;
}

function anchorBounds(anchor: ScreenAnchor) {
  return {
    left: anchor.x,
    top: anchor.y,
    right: anchor.x + (anchor.width ?? 0),
    bottom: anchor.y + (anchor.height ?? 0),
  };
}

/**
 * Returns true when two surfaces represent the same crowded screen region.
 * Endpoint anchors are cursor points; label anchors include measured bounds.
 */
export function spotHoverAnchorsOverlap(
  a: ScreenAnchor,
  b: ScreenAnchor,
): boolean {
  const aHasArea = (a.width ?? 0) > 0 && (a.height ?? 0) > 0;
  const bHasArea = (b.width ?? 0) > 0 && (b.height ?? 0) > 0;

  if (!aHasArea && !bHasArea) {
    return Math.hypot(a.x - b.x, a.y - b.y) <= ENDPOINT_OVERLAP_RADIUS_PX;
  }

  const aBounds = anchorBounds(a);
  const bBounds = anchorBounds(b);
  const padding = 6;
  return !(
    aBounds.right + padding < bBounds.left ||
    bBounds.right + padding < aBounds.left ||
    aBounds.bottom + padding < bBounds.top ||
    bBounds.bottom + padding < aBounds.top
  );
}

function sameAnchor(a: ScreenAnchor, b: ScreenAnchor): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

function toCandidate(
  spot: PresentableSpot,
  screenPos: ScreenAnchor,
  interaction: SpotHoverInteraction,
): HoverCandidate {
  return {
    spot,
    screenPos,
    interaction,
    spotKey: spotKey(spot),
  };
}

/**
 * Orders candidates without relying on R3F/DOM event arrival order. Labels are
 * the most precise user target, then report identity and concrete surface
 * identity provide stable tie breaks for dense co-located endpoints.
 */
function compareCandidates(a: HoverCandidate, b: HoverCandidate): number {
  const priorityDelta =
    surfacePriority(b.interaction.surface) -
    surfacePriority(a.interaction.surface);
  if (priorityDelta !== 0) return priorityDelta;

  const spotDelta = a.spotKey.localeCompare(b.spotKey);
  if (spotDelta !== 0) return spotDelta;
  return a.interaction.interactionId.localeCompare(
    b.interaction.interactionId,
  );
}

/**
 * Central hover arbiter for every globe spot surface.
 *
 * R3F can emit alternating enter/leave events when transparent raycast spheres
 * overlap. Drei labels add a second DOM interaction surface for the same
 * report. The arbiter keeps the current preview mounted, promotes labels over
 * endpoints, deterministically breaks equal-priority overlap ties, and retains
 * every active concrete surface so handoffs never insert a null/hidden frame.
 */
export function useSpotHoverArbitration() {
  const [hoveredSpotData, setHoveredSpotData] =
    useState<HoveredSpotData | null>(null);
  const currentRef = useRef<HoverCandidate | null>(null);
  const activeCandidatesRef = useRef(new Map<string, HoverCandidate>());
  const dismissTimerRef = useRef<number | null>(null);
  const anchorFrameRef = useRef<number | null>(null);
  const queuedAnchorRef = useRef<HoverCandidate | null>(null);

  const cancelSpotHoverDismiss = useCallback(() => {
    if (dismissTimerRef.current === null) return;
    window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null;
  }, []);

  const cancelQueuedAnchor = useCallback(() => {
    queuedAnchorRef.current = null;
    if (anchorFrameRef.current === null) return;
    window.cancelAnimationFrame(anchorFrameRef.current);
    anchorFrameRef.current = null;
  }, []);

  const commitCandidate = useCallback(
    (candidate: HoverCandidate) => {
      cancelSpotHoverDismiss();
      cancelQueuedAnchor();
      currentRef.current = candidate;
      setHoveredSpotData({
        spot: candidate.spot,
        screenPos: candidate.screenPos,
      });
    },
    [cancelQueuedAnchor, cancelSpotHoverDismiss],
  );

  const queueAnchorUpdate = useCallback((candidate: HoverCandidate) => {
    queuedAnchorRef.current = candidate;
    if (anchorFrameRef.current !== null) return;

    anchorFrameRef.current = window.requestAnimationFrame(() => {
      anchorFrameRef.current = null;
      const queued = queuedAnchorRef.current;
      queuedAnchorRef.current = null;
      const current = currentRef.current;
      if (
        !queued ||
        !current ||
        queued.interaction.interactionId !==
          current.interaction.interactionId ||
        sameAnchor(queued.screenPos, current.screenPos)
      ) {
        return;
      }
      currentRef.current = queued;
      setHoveredSpotData({ spot: queued.spot, screenPos: queued.screenPos });
    });
  }, []);

  const handleSpotHover = useCallback(
    (
      spot: PresentableSpot,
      screenPos: ScreenAnchor,
      interaction: SpotHoverInteraction,
    ) => {
      const candidate = toCandidate(spot, screenPos, interaction);
      activeCandidatesRef.current.set(interaction.interactionId, candidate);
      const current = currentRef.current;

      if (!current) {
        commitCandidate(candidate);
        return;
      }

      if (
        current.interaction.interactionId === interaction.interactionId
      ) {
        cancelSpotHoverDismiss();
        queueAnchorUpdate(candidate);
        return;
      }

      // Once the current surface has actually left, its dismissal timer is the
      // handoff signal. Choose from every surface still under the pointer so an
      // arrival can replace it immediately without ever unmounting the preview.
      if (dismissTimerRef.current !== null) {
        const winner = [...activeCandidatesRef.current.values()].sort(
          compareCandidates,
        )[0];
        if (winner) commitCandidate(winner);
        return;
      }

      const candidatePriority = surfacePriority(interaction.surface);
      const currentPriority = surfacePriority(current.interaction.surface);
      const overlaps = spotHoverAnchorsOverlap(
        current.screenPos,
        candidate.screenPos,
      );
      const winsStableTie =
        candidatePriority === currentPriority &&
        overlaps &&
        compareCandidates(candidate, current) < 0;

      if (candidatePriority > currentPriority || winsStableTie) {
        commitCandidate(candidate);
        return;
      }
    },
    [cancelSpotHoverDismiss, commitCandidate, queueAnchorUpdate],
  );

  const scheduleDismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) return;
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      if (activeCandidatesRef.current.size > 0) return;
      currentRef.current = null;
      setHoveredSpotData(null);
    }, DISMISS_DELAY_MS);
  }, []);

  const handleSpotHoverEnd = useCallback(
    (
      _spot?: PresentableSpot,
      interaction?: SpotHoverInteraction,
    ) => {
      const current = currentRef.current;
      if (!current) return;

      if (interaction) {
        activeCandidatesRef.current.delete(interaction.interactionId);
        if (
          current.interaction.interactionId !== interaction.interactionId
        ) {
          return;
        }
      } else {
        // Callers normally provide a concrete interaction. Retain the optional
        // form as an explicit "all spot surfaces left" escape hatch.
        activeCandidatesRef.current.clear();
      }

      cancelQueuedAnchor();
      const winner = [...activeCandidatesRef.current.values()].sort(
        compareCandidates,
      )[0];
      if (winner) {
        commitCandidate(winner);
        return;
      }
      scheduleDismiss();
    },
    [cancelQueuedAnchor, commitCandidate, scheduleDismiss],
  );

  const holdSpotHoverForPreview = useCallback(() => {
    cancelSpotHoverDismiss();
  }, [cancelSpotHoverDismiss]);

  const releaseSpotHoverFromPreview = useCallback(() => {
    scheduleDismiss();
  }, [scheduleDismiss]);

  const clearSpotHover = useCallback(() => {
    cancelSpotHoverDismiss();
    cancelQueuedAnchor();
    activeCandidatesRef.current.clear();
    currentRef.current = null;
    setHoveredSpotData(null);
  }, [cancelQueuedAnchor, cancelSpotHoverDismiss]);

  useEffect(
    () => () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
      if (anchorFrameRef.current !== null) {
        window.cancelAnimationFrame(anchorFrameRef.current);
      }
    },
    [],
  );

  return {
    hoveredSpotData,
    handleSpotHover,
    handleSpotHoverEnd,
    holdSpotHoverForPreview,
    releaseSpotHoverFromPreview,
    clearSpotHover,
  };
}

export default useSpotHoverArbitration;
