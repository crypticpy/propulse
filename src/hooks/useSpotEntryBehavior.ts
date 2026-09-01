import { useCallback } from "react";
import type { DXSpot } from "@/types/dxcluster";
import type { TargetLocation } from "@/stores/mapStore";
import { commitMapSpotSelection } from "@/hooks/useMapSpotSelection";

interface UseSpotEntryBehaviorArgs {
  sessionId: string | null;
  runMode: "run" | "sp";
  draft: string;
  draftHasFocus: boolean;
  draftUpdatedAt: number;
  spotPrefillInRun: boolean;
  adoptBandFromSpot: boolean;
  adoptModeFromSpot: boolean;
  focusEntryOnSpotPrefill: boolean;
  setSelectedSpot: (spot: DXSpot) => void;
  setTarget: (target: TargetLocation | null) => void;
  setBand: (sessionId: string, band: string) => void;
  setMode: (sessionId: string, mode: string) => void;
  setDraft: (sessionId: string, draft: string) => void;
  requestEntryFocus: () => void;
  requestDraftReplace: (args: {
    sessionId: string;
    nextText: string;
    source: "spot";
  }) => void;
}

export function useSpotEntryBehavior(args: UseSpotEntryBehaviorArgs) {
  const {
    sessionId,
    runMode,
    draft,
    draftHasFocus,
    draftUpdatedAt,
    spotPrefillInRun,
    adoptBandFromSpot,
    adoptModeFromSpot,
    focusEntryOnSpotPrefill,
    setSelectedSpot,
    setTarget,
    setBand,
    setMode,
    setDraft,
    requestEntryFocus,
    requestDraftReplace,
  } = args;

  return useCallback(
    (spot: DXSpot) => {
      // Map targeting + selection are always safe
      commitMapSpotSelection(spot, { setSelectedSpot, setTarget });

      if (!sessionId) {
        return;
      }

      const shouldPrefill =
        runMode === "sp" || (runMode === "run" && spotPrefillInRun);

      if (!shouldPrefill) {
        if (focusEntryOnSpotPrefill) {
          requestEntryFocus();
        }
        return;
      }

      if (adoptBandFromSpot && spot.band) {
        setBand(sessionId, spot.band);
      }
      if (adoptModeFromSpot && spot.mode) {
        setMode(sessionId, spot.mode);
      }

      const nextDraft = spot.dx.toUpperCase();
      const isActivelyTyping =
        draft.trim().length > 0 &&
        (draftHasFocus || Date.now() - draftUpdatedAt < 15_000);

      if (isActivelyTyping && draft.toUpperCase() !== nextDraft) {
        requestDraftReplace({
          sessionId,
          nextText: nextDraft,
          source: "spot",
        });
      } else {
        setDraft(sessionId, nextDraft);
      }

      if (focusEntryOnSpotPrefill) {
        requestEntryFocus();
      }
    },
    [
      adoptBandFromSpot,
      adoptModeFromSpot,
      draft,
      draftHasFocus,
      draftUpdatedAt,
      focusEntryOnSpotPrefill,
      requestDraftReplace,
      requestEntryFocus,
      runMode,
      sessionId,
      setBand,
      setDraft,
      setMode,
      setSelectedSpot,
      setTarget,
      spotPrefillInRun,
    ],
  );
}

export default useSpotEntryBehavior;
