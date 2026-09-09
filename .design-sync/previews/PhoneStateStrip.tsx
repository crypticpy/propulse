import { useEffect } from "react";
import { PhoneStateStrip, StationProvider } from "propulse";
import { useOperatingStateStore } from "@/stores/operatingStateStore";

// Single-story card (Opus review, #699 fix round): this file originally
// also exported `Empty()`, but both cells share one page-lifetime Zustand
// singleton — `Empty`'s `reset()` wipes `Populated`'s already-rendered seed
// via the live store subscription (not just its initial props), so a
// two-cell capture showed the wrong state on whichever cell mounted first.
// No `config.json` shape exists yet for splitting one file's stories into
// isolated single-story cards, so `Empty` was dropped rather than invented
// one; see `.design-sync/NOTES.md`'s 2026-09-09 wave entry.
//
// No props — three read lines off the shared operating-state cursor
// (session, band, target), none of it persisted, so seeding it here is
// contained to this capture.
export function Populated() {
  useEffect(() => {
    const store = useOperatingStateStore.getState();
    store.reset();
    store.setSessionId("field-day-2026");
    store.setBand("20m");
    store.setTarget({ callsign: "PY2ABC", grid: "GG66", lat: null, lon: null, spotId: "s1" });
  }, []);

  return (
    <StationProvider className="workspace-page workspace-page-phone" style={{ width: 390 }}>
      <PhoneStateStrip />
    </StationProvider>
  );
}
