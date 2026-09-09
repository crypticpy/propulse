/**
 * SpotsPathsSection — Settings entry point for the Spots & Paths preference
 * package (`src/components/settings/spots/`, SP-08), mounted now that the
 * consumer chain is complete: #603 binds scoped runtimes in the map hosts,
 * #615 applies the bound filters, budget and grouping on the globe and
 * azimuthal projections, and #776 made grouping real on the flat map. A
 * preference set here changes what the map draws.
 *
 * Slot and kind (issue #708's open question) — this edits a **preview** slot
 * and commits explicitly:
 *
 * - `previewSlotId("settings-spots-paths")` with `kind: "preview"` is
 *   non-persisting (`persistsWorkingSlot`), so merely opening Settings writes
 *   nothing to `sessionStorage`; the removed `slot="normal"` implementation
 *   wrote a full default configuration into the map's own working slot at
 *   construction (`createViewRuntime`'s `persistNow()`).
 * - The registry key is `ownerId\0slotId\0kind`, and `registerRuntimeWriter`
 *   disposes whoever held the key before. A preview slot cannot collide with
 *   a mounted host's `<family>/interactive` key, so neither surface can
 *   dispose the other's runtime out from under its consumers.
 * - Which family the edit lands in is therefore an explicit, labelled choice
 *   rather than a hard-coded `normal`: the target follows the map layout the
 *   user is actually on, and the Apply control names it.
 */
import { useCallback, useMemo, useState } from "react";
import type { SavedView, ViewConfiguration } from "@/lib/views/contracts";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewScopedStore } from "@/hooks/useViewScopedStore";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";
import { useMapStore } from "@/stores/mapStore";
import { createViewConfiguration } from "@/lib/views/defaults";
import {
  commitViewToFamilySlot,
  readFamilySlotConfig,
  type FamilySlotId,
} from "@/lib/views/runtime";
import {
  familySlotForLayout,
  FAMILY_SLOT_LABEL,
  SETTINGS_SPOTS_PREVIEW_SLOT,
} from "./spotsPathsTarget";
import type { IndexedViewLibrary } from "@/lib/views/persistence/indexedLibrary";
import type { RevisionedViewRepository } from "@/lib/views/persistence/repository";
import {
  SpotsPreferencesProvider,
  SpotsPreferencesPanel,
  createRepositoryLibraryPort,
  useSpotsPreferencesContext,
  type SpotsLibraryPort,
} from "@/components/settings/spots";

const PRIMARY_BUTTON =
  "min-h-[48px] rounded-lg bg-plasma-orange px-5 py-3 text-sm font-semibold text-su-on-accent transition-colors hover:bg-plasma-orange/90 focus:outline-none focus:ring-2 focus:ring-plasma-orange/60 disabled:opacity-40 disabled:cursor-not-allowed";
const SECONDARY_BUTTON =
  "min-h-[48px] rounded-lg border border-su-line/40 bg-void-black px-5 py-3 text-sm font-semibold text-su-text transition-colors hover:border-plasma-orange/60 focus:outline-none focus:ring-2 focus:ring-plasma-orange/60";

function SpotsPathsControls({
  ownerId,
  targetSlot,
  onOpenPanel,
}: {
  ownerId: string;
  targetSlot: FamilySlotId;
  onOpenPanel: () => void;
}) {
  const { controller } = useSpotsPreferencesContext();
  // Identity, not equality: every runtime write replaces the frozen config
  // object, so "the config I last applied" is exactly "no edits since".
  const [appliedConfig, setAppliedConfig] = useState<ViewConfiguration | null>(null);
  const [landedOn, setLandedOn] = useState<"runtime" | "storage" | null>(null);
  const applied = appliedConfig === controller.config;

  const apply = useCallback(() => {
    const target = commitViewToFamilySlot({
      ownerId,
      slotId: targetSlot,
      config: controller.config,
    });
    setAppliedConfig(controller.config);
    setLandedOn(target);
  }, [controller.config, ownerId, targetSlot]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-su-muted">
        Choose which reports appear on the map, how they are grouped, how paths
        move, and manage named views and custom presets. Changes are held here
        until you apply them to your map.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onOpenPanel} className={SECONDARY_BUTTON}>
          Open Spots &amp; paths preferences
        </button>
        <button type="button" onClick={apply} disabled={applied} className={PRIMARY_BUTTON}>
          Apply to {FAMILY_SLOT_LABEL[targetSlot]}
        </button>
      </div>
      <p className="text-xs text-su-muted" role="status">
        {applied
          ? landedOn === "runtime"
            ? `Applied. Your ${FAMILY_SLOT_LABEL[targetSlot]} is showing these settings now.`
            : `Applied. Your ${FAMILY_SLOT_LABEL[targetSlot]} will use these settings the next time you open it.`
          : `These settings will be applied to your ${FAMILY_SLOT_LABEL[targetSlot]}, the map layout you are currently using.`}
      </p>
    </div>
  );
}

function SpotsPathsEditor({
  ownerId,
  targetSlot,
  library,
}: {
  ownerId: string;
  targetSlot: FamilySlotId;
  library: SpotsLibraryPort;
}) {
  const view = useViewScopedStore();
  const [open, setOpen] = useState(false);
  const [loadedView, setLoadedView] = useState<SavedView | null>(null);
  const openPanel = useCallback(() => setOpen(true), []);
  const closePanel = useCallback(() => setOpen(false), []);

  const handleLoadView = useCallback(
    (saved: SavedView) => {
      view.replaceWorkingView(saved.config);
      setLoadedView(saved);
    },
    [view],
  );

  return (
    <SpotsPreferencesProvider view={view} library={library} savedView={loadedView}>
      <SpotsPathsControls
        ownerId={ownerId}
        targetSlot={targetSlot}
        onOpenPanel={openPanel}
      />
      <SpotsPreferencesPanel open={open} onClose={closePanel} onLoadView={handleLoadView} />
    </SpotsPreferencesProvider>
  );
}

/**
 * Mounts the preview runtime. The seed is whatever the target family slot
 * would recover on its next mount, so the panel opens showing the map's
 * current settings rather than package defaults. Read once per mount: the
 * seed is only consulted when the runtime is constructed.
 */
export function SpotsPathsPreferences({
  ownerId,
  targetSlot,
  library,
}: {
  ownerId: string;
  targetSlot: FamilySlotId;
  library: SpotsLibraryPort;
}) {
  const [seed] = useState<ViewConfiguration>(
    () => readFamilySlotConfig(ownerId, targetSlot) ?? createViewConfiguration(targetSlot),
  );
  return (
    <ViewProvider
      ownerId={ownerId}
      slot={SETTINGS_SPOTS_PREVIEW_SLOT}
      kind="preview"
      seed={seed}
    >
      <SpotsPathsEditor ownerId={ownerId} targetSlot={targetSlot} library={library} />
    </ViewProvider>
  );
}

function SpotsPathsLibraryGate({
  ownerId,
  targetSlot,
  repository,
  library,
}: {
  ownerId: string;
  targetSlot: FamilySlotId;
  repository: RevisionedViewRepository;
  library: IndexedViewLibrary;
}) {
  const port = useMemo(
    () => createRepositoryLibraryPort(repository, library, ownerId),
    [repository, library, ownerId],
  );
  return (
    <SpotsPathsPreferences ownerId={ownerId} targetSlot={targetSlot} library={port} />
  );
}

export function SpotsPathsSection() {
  const phase = useViewLibrarySessionStore((s) => s.phase);
  const ownerId = useViewLibrarySessionStore((s) => s.ownerId);
  const repository = useViewLibrarySessionStore((s) => s.repository);
  const library = useViewLibrarySessionStore((s) => s.library);
  const layoutMode = useMapStore((s) => s.layoutMode);
  const targetSlot = familySlotForLayout(layoutMode);

  if (phase !== "ready" || !ownerId || !repository || !library) {
    return (
      <div className="rounded-xl border border-su-line/40 bg-su-panel/60 p-4 text-sm text-su-muted">
        {phase === "unavailable"
          ? "The saved view library is unavailable right now. Try again once the connection returns."
          : "Preparing your saved view library…"}
      </div>
    );
  }

  return (
    <SpotsPathsLibraryGate
      ownerId={ownerId}
      targetSlot={targetSlot}
      repository={repository}
      library={library}
    />
  );
}
