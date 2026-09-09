import { useEffect } from "react";
import { BandModeModal } from "propulse";

// isOpen/onClose are the only props. Band/mode grid content is the static
// ALL_BANDS / ALL_UI_MODES list, so the modal is fully populated by default
// (activeBand/activeMode default to the operatingStore's DEFAULT_BAND/MODE).
export function Open() {
  return <BandModeModal isOpen onClose={() => {}} />;
}

// Simulates the operator tapping a different band tile.
export function BandTapped() {
  useEffect(() => {
    const target = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("10m"),
    );
    target?.click();
  }, []);
  return <BandModeModal isOpen onClose={() => {}} />;
}
