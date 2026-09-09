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
import { useActivePage } from "@/stores/workspaceStore";

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
 * Resolves the canvas type from the device and renders that workspace.
 * Mobile renders the fixed-page `PhonePage` canvas (#659); everything else
 * renders the workstation canvas below.
 *
 * The desktop shell is scoped in `StationProvider` (the `.station-ui` root),
 * same as every other station-ui page (`ShackPage.tsx`,
 * `DesignSystemPage.tsx`) — `workspace.css`'s classes are written to be read
 * inside that scope. `PhonePage` registers its own, canvas-correct entry on
 * the shared operating-state roster directly (see its own doc comment); the
 * `useOperatingScreen()` call below still runs unconditionally on mobile too
 * (pre-existing), which leaves a duplicate "workstation" registration behind
 * a real phone until that hook becomes canvas-aware — tracked as a #659
 * follow-up, not fixed here.
 */
export default function WorkspacePage() {
  const isMobile = useIsMobile();
  // #658: registers this workspace with the shared operating state and
  // applies inbound page-flip commands. One self-contained call — the
  // channel itself is held open app-wide by `OperatingTransportHost`.
  useOperatingScreen();
  const activePage = useActivePage();
  const needsDxFeed = activePage.widgetIds.some((id) => DX_SOURCED_WIDGET_IDS.has(id));

  if (isMobile) {
    return (
      <StationProvider className="workspace-page workspace-page-phone" role="main">
        <PhonePage />
      </StationProvider>
    );
  }

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
