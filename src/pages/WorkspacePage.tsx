import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useOperatingScreen } from "@/hooks/useOperatingScreen";
import { useDXCluster } from "@/hooks/useDXCluster";
import { StationProvider } from "@/components/station-ui";
import { HamClockPinnedReportHost } from "@/components/map/hamclock/wall/reports/WallReport";
import { PhonePage } from "@/components/workspace/phone/PhonePage";
import { StateStrip } from "@/components/workspace/StateStrip";
import { WorkspaceBar } from "@/components/workspace/WorkspaceBar";
import { WorkspaceCanvas } from "@/components/workspace/WorkspaceCanvas";
import { DX_SOURCED_WIDGET_IDS } from "@/components/workspace/widgetLoaders";
import { useActivePage, useWorkspaceStore } from "@/stores/workspaceStore";

/**
 * `ClusterTile`/`HeatMapTile` only read the shared `useDXStore` feed; they
 * never start it themselves (the wall relies on the map stage's
 * `useDXCluster` for that). Mounted only while a DX-sourced widget is placed,
 * same pattern as `HomeActivity.tsx`'s `ClusterReportsHost` (#670 review).
 */
function WorkspaceDxFeedHost() {
  useDXCluster();
  return null;
}

/**
 * Tablet viewport band (#661): the issue's 1024x768 reference canvas sits
 * between `useIsMobile`'s phone cutoff (<768px) and the desktop/workstation
 * width. Matches `useIsMobile`'s own matchMedia pattern, one breakpoint up.
 *
 * `max` is inclusive (#686 review P2/Codex): a literal 1024px-wide viewport
 * (iPad landscape, the issue's own 1024x768 reference) must land in the
 * tablet band, not fall through to workstation because the old bound
 * excluded it.
 */
function useIsTabletViewport(min = 768, max = 1024): boolean {
  const [isTablet, setIsTablet] = useState(
    typeof window !== "undefined" ? window.innerWidth >= min && window.innerWidth <= max : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${min}px) and (max-width: ${max}px)`);
    const handler = (e: MediaQueryListEvent) => setIsTablet(e.matches);
    mql.addEventListener("change", handler);
    setIsTablet(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [min, max]);
  return isTablet;
}

/**
 * Resolves the canvas type from the device and renders that workspace.
 * Mobile renders the fixed-page `PhonePage` canvas (#659); everything else
 * renders the workstation canvas below.
 *
 * The desktop shell is scoped in `StationProvider` (the `.station-ui` root),
 * same as every other station-ui page (`ShackPage.tsx`,
 * `DesignSystemPage.tsx`) — `workspace.css`'s classes are written to be read
 * inside that scope. `PhonePage` registers its own, canvas-correct entry on
 * the shared operating-state roster directly (see its own doc comment), so
 * the workstation registration (`useOperatingScreen`) lives in the desktop
 * branch only; a real phone never carries a ghost "workstation" entry.
 */
export default function WorkspacePage() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <StationProvider className="workspace-page workspace-page-phone" role="main">
        <PhonePage />
      </StationProvider>
    );
  }

  return <WorkstationWorkspace />;
}

function WorkstationWorkspace() {
  // #658: registers this workspace with the shared operating state and
  // applies inbound page-flip commands. One self-contained call — the
  // channel itself is held open app-wide by `OperatingTransportHost`.
  useOperatingScreen();
  const isTablet = useIsTabletViewport();
  const activePage = useActivePage();
  const needsDxFeed = activePage.widgetIds.some((id) => DX_SOURCED_WIDGET_IDS.has(id));

  // Shared with every rules-consuming surface (`WorkspaceCanvas`,
  // `WidgetsTab`, `DisplayTab`'s rail-width section, the store's own
  // `addWidget`/`setWidgetOrder`/`addRecipePage`) via
  // `workspaceStore.ts`'s `canvasTypeOverride` (#686 review, Codex
  // PRRT_kwDORFr4R86ggBm7) — a prop threaded only into `WorkspaceCanvas`
  // let mutation paths validate against the stored `"workstation"` shape
  // while this page actually rendered tablet rules, so an operator could
  // add a widget that fit workstation's wider rail budget and then watch
  // it get silently refused at render time. Cleared on unmount so a later
  // mount (a different route, or this one on a real workstation) never
  // inherits a stale override.
  const setCanvasTypeOverride = useWorkspaceStore((s) => s.setCanvasTypeOverride);
  useEffect(() => {
    setCanvasTypeOverride(isTablet ? "tablet" : null);
    return () => setCanvasTypeOverride(null);
  }, [isTablet, setCanvasTypeOverride]);

  return (
    <StationProvider className="workspace-page" role="main">
      {needsDxFeed && <WorkspaceDxFeedHost />}
      {/* The wall's report `PIN` control hands its element to this host,
          normally mounted only by `HamClockWallHeader`; the workspace has no
          equivalent header, so it is mounted here directly (#670 review). */}
      <HamClockPinnedReportHost />
      <WorkspaceBar />
      <WorkspaceCanvas />
      <StateStrip />
    </StationProvider>
  );
}
