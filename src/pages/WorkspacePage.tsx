import { useIsMobile } from "@/hooks/useIsMobile";
import { StationProvider, Surface } from "@/components/station-ui";
import { StateStrip } from "@/components/workspace/StateStrip";
import { WorkspaceBar } from "@/components/workspace/WorkspaceBar";
import { WorkspaceCanvas } from "@/components/workspace/WorkspaceCanvas";

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

  if (isMobile) {
    return (
      <Surface className="workspace-phone-placeholder">
        <p>Phone workspace arrives in a later release.</p>
      </Surface>
    );
  }

  return (
    <StationProvider className="workspace-page" role="main">
      <WorkspaceBar />
      <WorkspaceCanvas />
      <StateStrip />
    </StationProvider>
  );
}
