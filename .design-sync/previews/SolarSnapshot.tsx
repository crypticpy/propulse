import { SolarSnapshot } from "propulse";

export function USToJapan() {
  return (
    <div style={{ width: 360, height: 220 }}>
      <SolarSnapshot
        homeLat={32.5}
        homeLon={-86.0}
        targetLat={35.68}
        targetLon={139.65}
        displayTime={new Date()}
        className="h-full"
      />
    </div>
  );
}

export function EuropeToAustralia() {
  return (
    <div style={{ width: 360, height: 220 }}>
      <SolarSnapshot
        homeLat={51.5}
        homeLon={7.0}
        targetLat={-33.87}
        targetLon={151.21}
        displayTime={new Date()}
        className="h-full"
      />
    </div>
  );
}
