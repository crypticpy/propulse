import { useIsMobile } from "@/hooks/useIsMobile";
import { useDXCluster } from "@/hooks/useDXCluster";
import { StationProvider, Surface } from "@/components/station-ui";
import { HamClockPinnedReportHost } from "@/components/map/hamclock/wall/reports/WallReport";
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
 * Resolves the canvas type from the device and renders that workspace. This
 * PR ships the workstation canvas only — phone is #659 — so mobile gets a
 * one-line placeholder rather than a broken layout.
 *
 * The desktop shell is scoped in `StationProvider` (the `.station-ui` root),
 * same as every other station-ui page (`ShackPage.tsx`,
 * `DesignSystemPage.tsx`) — `workspace.css`'s classes are written to be read
 * inside that scope.
 */
export default function WorkspacePage() {
  const isMobile = useIsMobile();
  const activePage = useActivePage();
  const needsDxFeed = activePage.widgetIds.some((id) => DX_SOURCED_WIDGET_IDS.has(id));

  if (isMobile) {
    return (
      <Surface className="workspace-phone-placeholder">
        <p>Phone workspace arrives in a later release.</p>
      </Surface>
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
