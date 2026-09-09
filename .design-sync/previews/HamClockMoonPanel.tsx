import { HamClockMoonPanel } from "propulse";

/** Compact lunar ephemeris for the HamClock information rail, sharing the
 * home-dashboard Moon card's calculation path. */
export function WithStation() {
  return (
    <div style={{ width: 300, background: "var(--hc-bg)", padding: 12 }}>
      <HamClockMoonPanel
        displayTime={new Date("2024-05-15T18:00:00Z")}
        latitude={35.68}
        longitude={139.65}
        timeZone="Asia/Tokyo"
      />
    </div>
  );
}

export function NoStation() {
  return (
    <div style={{ width: 300, background: "var(--hc-bg)", padding: 12 }}>
      <HamClockMoonPanel displayTime={new Date("2024-05-15T18:00:00Z")} />
    </div>
  );
}
