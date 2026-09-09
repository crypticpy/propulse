import { useIsMobile } from "@/hooks/useIsMobile";
import { Surface } from "@/components/station-ui";
import { StateStrip } from "@/components/workspace/StateStrip";
import { WorkspaceBar } from "@/components/workspace/WorkspaceBar";
import { WorkspaceCanvas } from "@/components/workspace/WorkspaceCanvas";

/**
 * Resolves the canvas type from the device and renders that workspace. This
 * PR ships the workstation canvas only — phone is #659 — so mobile gets a
 * one-line placeholder rather than a broken layout.
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
    <div className="su-stack workspace-page">
      <WorkspaceBar />
      <WorkspaceCanvas />
      <StateStrip />
    </div>
  );
}
