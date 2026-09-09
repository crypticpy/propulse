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
 *   rather than a hard-coded `normal`: the target follows the map host this
 *   device actually mounts, and the Apply control names it.
 *
 * Owner binding — the runtime owner and the commit owner are the raw auth id
 * (`useAuthStore`), exactly what `BoundViewHost` hands `ViewProvider`, because
 * `ViewProvider` and `commitViewToFamilySlot` both derive the storage
 * namespace themselves. `viewLibrarySessionStore.ownerId` is already namespaced
 * (`anon:<install>` when signed out) and is used only for the library port.
 */
import { useCallback, useMemo, useState } from "react";
import type { SavedView, ViewConfiguration } from "@/lib/views/contracts";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewScopedStore } from "@/hooks/useViewScopedStore";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";
import { useAuthStore } from "@/stores/authStore";
import { createViewConfiguration } from "@/lib/views/defaults";
import {
  commitViewToFamilySlot,
  readFamilySlotConfig,
  type FamilySlotCommitTarget,
  type FamilySlotId,
} from "@/lib/views/runtime";
import {
  FAMILY_SLOT_LABEL,
  SETTINGS_SPOTS_PREVIEW_SLOT,
  useSpotsPathsTargetSlot,
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

/** What the last Apply did, or "initial" for the configuration as mounted. */
type ApplyOutcome = FamilySlotCommitTarget | "initial";

function statusLine(args: {
  targetSlot: FamilySlotId;
  liveTargetSlot: FamilySlotId;
  outcome: ApplyOutcome | null;
}): string {
  const target = FAMILY_SLOT_LABEL[args.targetSlot];
  if (args.liveTargetSlot !== args.targetSlot) {
    const live = FAMILY_SLOT_LABEL[args.liveTargetSlot];
    return `Your map switched to the ${live} while this section was open. These settings still go to your ${target}; leave and reopen this section to edit the ${live}.`;
  }
  switch (args.outcome) {
    case "runtime":
      return `Applied. Your ${target} is showing these settings now.`;
    case "storage":
      return `Applied. Your ${target} will use these settings the next time you open it.`;
    case "failed":
      return `Not applied. This device would not store the change, so your ${target} is unchanged. Try again, or open the map and apply from there.`;
    default:
      return `These settings will be applied to your ${target}, the map layout you are currently using.`;
  }
}

function SpotsPathsControls({
  ownerId,
  targetSlot,
  liveTargetSlot,
  onOpenPanel,
}: {
  ownerId: string | null;
  targetSlot: FamilySlotId;
  liveTargetSlot: FamilySlotId;
  onOpenPanel: () => void;
}) {
  const { controller } = useSpotsPreferencesContext();
  // Identity, not equality: every runtime write replaces the frozen config
  // object, so "the config I last applied" is exactly "no edits since". Seeded
  // with the configuration as mounted, so Apply is disabled until an edit.
  const [applyState, setApplyState] = useState<{
    config: ViewConfiguration;
    outcome: ApplyOutcome;
  } | null>(() => ({ config: controller.config, outcome: "initial" }));

  // The map layout changed under an open editor. This mount keeps editing the
  // slot its seed came from (remounting would discard unapplied edits), so
  // whatever was applied no longer describes the map the user is on: re-enable
  // Apply and let `statusLine` say which map these settings go to.
  const [seenTargetSlot, setSeenTargetSlot] = useState(liveTargetSlot);
  if (seenTargetSlot !== liveTargetSlot) {
    setSeenTargetSlot(liveTargetSlot);
    setApplyState(null);
  }

  const current =
    applyState && applyState.config === controller.config ? applyState : null;
  const applied = current !== null && current.outcome !== "failed";

  const apply = useCallback(() => {
    const config = controller.config;
    const outcome = commitViewToFamilySlot({ ownerId, slotId: targetSlot, config });
    setApplyState({ config, outcome });
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
        {statusLine({ targetSlot, liveTargetSlot, outcome: current?.outcome ?? null })}
      </p>
    </div>
  );
}

function SpotsPathsEditor({
  ownerId,
  targetSlot,
  liveTargetSlot,
  library,
}: {
  ownerId: string | null;
  targetSlot: FamilySlotId;
  liveTargetSlot: FamilySlotId;
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
        liveTargetSlot={liveTargetSlot}
        onOpenPanel={openPanel}
      />
      <SpotsPreferencesPanel open={open} onClose={closePanel} onLoadView={handleLoadView} />
    </SpotsPreferencesProvider>
  );
}

/**
 * Mounts the preview runtime. One lazy initializer freezes the seed *and* the
 * slot it was read from, so the two can never disagree: the runtime consults
 * the seed only at construction, and a later re-read would edit against a
 * stale baseline. The seed is whatever the target family slot would recover on
 * its next mount, so the panel opens showing the map's current settings rather
 * than package defaults.
 *
 * Deliberately not `key={targetSlot}`: remounting on a layout change would
 * throw away edits the user has not applied yet, with nothing said. When the
 * live target diverges, `SpotsPathsControls` reports it in its status line and
 * re-enables Apply instead.
 */
export function SpotsPathsPreferences({
  ownerId,
  targetSlot,
  library,
}: {
  ownerId: string | null;
  targetSlot: FamilySlotId;
  library: SpotsLibraryPort;
}) {
  const [frozen] = useState<{ slot: FamilySlotId; seed: ViewConfiguration }>(() => ({
    slot: targetSlot,
    seed: readFamilySlotConfig(ownerId, targetSlot) ?? createViewConfiguration(targetSlot),
  }));
  return (
    <ViewProvider
      ownerId={ownerId}
      slot={SETTINGS_SPOTS_PREVIEW_SLOT}
      kind="preview"
      seed={frozen.seed}
    >
      <SpotsPathsEditor
        ownerId={ownerId}
        targetSlot={frozen.slot}
        liveTargetSlot={targetSlot}
        library={library}
      />
    </ViewProvider>
  );
}

function SpotsPathsLibraryGate({
  ownerId,
  libraryOwnerId,
  targetSlot,
  repository,
  library,
}: {
  ownerId: string | null;
  libraryOwnerId: string;
  targetSlot: FamilySlotId;
  repository: RevisionedViewRepository;
  library: IndexedViewLibrary;
}) {
  const port = useMemo(
    () => createRepositoryLibraryPort(repository, library, libraryOwnerId),
    [repository, library, libraryOwnerId],
  );
  return (
    <SpotsPathsPreferences ownerId={ownerId} targetSlot={targetSlot} library={port} />
  );
}

export function SpotsPathsSection() {
  const phase = useViewLibrarySessionStore((s) => s.phase);
  const libraryOwnerId = useViewLibrarySessionStore((s) => s.ownerId);
  const repository = useViewLibrarySessionStore((s) => s.repository);
  const library = useViewLibrarySessionStore((s) => s.library);
  // Runtime and commit owner: the raw auth id, the value space `BoundViewHost`
  // passes to `ViewProvider`. The library session store's ownerId is already
  // namespaced and would be namespaced a second time here.
  const ownerId = useAuthStore((s) => s.user?.id ?? null);
  const targetSlot = useSpotsPathsTargetSlot();

  if (phase !== "ready" || !libraryOwnerId || !repository || !library) {
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
      libraryOwnerId={libraryOwnerId}
      targetSlot={targetSlot}
      repository={repository}
      library={library}
    />
  );
}
