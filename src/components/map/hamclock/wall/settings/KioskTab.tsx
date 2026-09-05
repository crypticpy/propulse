import { useNavigate } from "react-router-dom";
import { useKioskStore } from "@/stores/kioskStore";
import { HamClockButton } from "../controls";
import { HAMCLOCK_WALL_PAGES, wallPageIndex } from "../pages";

/**
 * Read-only: what the active kiosk scene is pinning the wall to, if
 * anything. Editing a scene's pin is kiosk work, not wall-settings work — the
 * one action here hands off to the kiosk editor rather than duplicating it.
 */
export function KioskTab() {
  const navigate = useNavigate();
  const activeSceneId = useKioskStore((s) => s.activeSceneId);
  const scenes = useKioskStore((s) => s.scenes);
  const scene = scenes.find((candidate) => candidate.id === activeSceneId);
  const pin =
    scene?.map?.layoutMode === "hamclock" ? scene.map.hamclock : undefined;

  let summary = "No kiosk scene is pinning the wall.";
  if (scene && pin) {
    const leftTitle = HAMCLOCK_WALL_PAGES[wallPageIndex(pin.leftPage ?? 0)].title;
    const rightTitle = HAMCLOCK_WALL_PAGES[wallPageIndex(pin.rightPage ?? 0)].title;
    summary =
      leftTitle === rightTitle
        ? `"${scene.name}" pins the wall to ${leftTitle}.`
        : `"${scene.name}" pins the wall to ${leftTitle} (left) / ${rightTitle} (right).`;
  }

  return (
    <div className="hcc-kiosk-tab">
      <p className="hcc-kiosk-summary">{summary}</p>
      <HamClockButton onClick={() => navigate("/kiosk")}>
        OPEN KIOSK EDITOR
      </HamClockButton>
    </div>
  );
}
