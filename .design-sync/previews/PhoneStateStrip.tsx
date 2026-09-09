import { useEffect } from "react";
import { PhoneStateStrip, StationProvider } from "propulse";
import { useOperatingStateStore } from "@/stores/operatingStateStore";

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

export function Empty() {
  useEffect(() => {
    useOperatingStateStore.getState().reset();
  }, []);

  return (
    <StationProvider className="workspace-page workspace-page-phone" style={{ width: 390 }}>
      <PhoneStateStrip />
    </StationProvider>
  );
}
