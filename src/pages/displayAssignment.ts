import type { DisplaySceneConfig } from "@/stores/displayStore";
import type { KioskScene } from "@/stores/kioskStore";
import type { DisplayFit } from "@/stores/mapStore";
import type { TextScale } from "@/types/user";

export interface DisplayAssignmentDraft {
  selectedIds: ReadonlySet<string>;
  rotationEnabled: boolean;
  intervalSec: number;
  layoutFit: DisplayFit;
  wallTextScale: TextScale | "";
}

function normalizeRotationInterval(value: number): number {
  if (!Number.isFinite(value)) return 120;
  return Math.min(3600, Math.max(15, Math.round(value)));
}

/**
 * Build the complete remote assignment payload. `scenes` is deliberately
 * present even when empty: omitting it would preserve a previous assignment
 * in jsonb-aware consumers instead of communicating an explicit clear.
 */
export function buildDisplaySceneConfig(
  existing: DisplaySceneConfig | null,
  kioskScenes: readonly KioskScene[],
  draft: DisplayAssignmentDraft,
): DisplaySceneConfig {
  const selectedScenes = kioskScenes.filter(
    (scene) =>
      scene.enabled !== false && draft.selectedIds.has(scene.id),
  );
  return {
    ...(existing ?? {}),
    scenes: selectedScenes,
    rotation: {
      enabled: draft.rotationEnabled,
      intervalSec: normalizeRotationInterval(draft.intervalSec),
    },
    layout: {
      fit: draft.layoutFit,
      ...(draft.wallTextScale !== "" && {
        textScale: draft.wallTextScale,
      }),
    },
  };
}
