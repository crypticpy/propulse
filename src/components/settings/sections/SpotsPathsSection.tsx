/**
 * SpotsPathsSection — Settings entry point for the Spots & Paths preference
 * package (SP-08, `src/components/settings/spots/`).
 *
 * SP-08 shipped the provider, quick popover and detailed panel as an
 * explicit-input package with no global active-view lookup, but left it
 * unmounted: SP-09/SP-10 own wiring it into the map toolbar and Display
 * Center. Until that lands, this section is the one reachable entry point —
 * a button that opens the same centered `SpotsPreferencesPanel` dialog,
 * following the same pattern as `CredentialsSection`'s
 * `CredentialUnlockDialog` trigger.
 *
 * The panel needs a `ViewScopedStoreHandle`, which only exists under a
 * `ViewProvider`. Nothing in the app mounts one yet (see
 * `src/components/views/ViewProvider.tsx`), so this section mounts its own,
 * scoped to the "normal" family working slot — the same slot the primary
 * flat/globe map will read once SP-09 wires it up. Editing here already
 * persists to that slot's storage, so preferences set from Settings are not
 * lost once the map is wired to render them.
 */
import { useCallback, useMemo, useState } from "react";
import type { SavedView } from "@/lib/views/contracts";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewScopedStore } from "@/hooks/useViewScopedStore";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";
import type { IndexedViewLibrary } from "@/lib/views/persistence/indexedLibrary";
import type { RevisionedViewRepository } from "@/lib/views/persistence/repository";
import {
  SpotsPreferencesProvider,
  SpotsPreferencesPanel,
  createRepositoryLibraryPort,
} from "@/components/settings/spots";

const OPEN_BUTTON =
  "min-h-[44px] rounded-lg bg-plasma-orange px-4 py-2.5 text-sm font-medium text-su-on-accent transition-colors hover:bg-plasma-orange/90 focus:outline-none focus:ring-2 focus:ring-plasma-orange/60";

function SpotsPathsLauncher({
  ownerId,
  repository,
  library,
}: {
  ownerId: string;
  repository: RevisionedViewRepository;
  library: IndexedViewLibrary;
}) {
  const view = useViewScopedStore();
  const port = useMemo(
    () => createRepositoryLibraryPort(repository, library, ownerId),
    [repository, library, ownerId],
  );
  const [open, setOpen] = useState(false);
  const [loadedView, setLoadedView] = useState<SavedView | null>(null);

  const handleLoadView = useCallback(
    (saved: SavedView) => {
      view.replaceWorkingView(saved.config);
      setLoadedView(saved);
    },
    [view],
  );

  return (
    <SpotsPreferencesProvider view={view} library={port} savedView={loadedView}>
      <p className="mb-3 text-sm text-su-muted">
        Choose which reports appear on the map, how they are grouped, how paths
        move, and manage named views and custom presets.
      </p>
      <button type="button" onClick={() => setOpen(true)} className={OPEN_BUTTON}>
        Open Spots &amp; paths preferences
      </button>
      <SpotsPreferencesPanel open={open} onClose={() => setOpen(false)} onLoadView={handleLoadView} />
    </SpotsPreferencesProvider>
  );
}

export function SpotsPathsSection() {
  const phase = useViewLibrarySessionStore((s) => s.phase);
  const ownerId = useViewLibrarySessionStore((s) => s.ownerId);
  const repository = useViewLibrarySessionStore((s) => s.repository);
  const library = useViewLibrarySessionStore((s) => s.library);

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
    <ViewProvider ownerId={ownerId} slot="normal">
      <SpotsPathsLauncher ownerId={ownerId} repository={repository} library={library} />
    </ViewProvider>
  );
}
