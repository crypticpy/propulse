import { useNavigate } from "react-router-dom";
import { pageTitle } from "@/lib/hamclock/wallPages";
import { useKioskStore } from "@/stores/kioskStore";
import { HamClockButton } from "../controls";

/**
 * Read-only: what the active kiosk scene is pinning the wall to, if
 * anything. Editing a scene's pin is kiosk work, not wall-settings work — the
 * one action here hands off to the kiosk editor rather than duplicating it.
 */
export function KioskTab() {
  const navigate = useNavigate();
  const active = useKioskStore((s) => s.active);
  const activeSceneId = useKioskStore((s) => s.activeSceneId);
  const scenes = useKioskStore((s) => s.scenes);
  const stop = useKioskStore((s) => s.stop);
  // `stop()` keeps `activeSceneId` around so a paused kiosk can resume where
  // it left off — that means a stopped kiosk still has a non-null
  // `activeSceneId`, so the pin summary below must gate on `active` too, or
  // this reads as "pinning the wall" when kiosk playback isn't even running.
  const scene = active
    ? scenes.find((candidate) => candidate.id === activeSceneId)
    : undefined;
  const pin =
    scene?.map?.layoutMode === "hamclock" ? scene.map.hamclock : undefined;

  let summary = "No kiosk scene is pinning the wall.";
  if (scene && pin) {
    const leftTitle = pageTitle(pin.leftPage ?? pin.rightPage ?? "spots");
    const rightTitle = pageTitle(pin.rightPage ?? pin.leftPage ?? "spots");
    summary =
      leftTitle === rightTitle
        ? `"${scene.name}" pins the wall to ${leftTitle}.`
        : `"${scene.name}" pins the wall to ${leftTitle} (left) / ${rightTitle} (right).`;
  }

  function openEditor() {
    // Kiosk playback rotates scenes on its own timer (`KioskChrome`), which
    // would navigate away from the editor mid-edit if left running.
    if (active) stop();
    navigate("/kiosk");
  }

  return (
    <div className="hcc-kiosk-tab">
      <p className="hcc-kiosk-summary">{summary}</p>
      <HamClockButton onClick={openEditor}>OPEN KIOSK EDITOR</HamClockButton>
    </div>
  );
}
