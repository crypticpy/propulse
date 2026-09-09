import { SatelliteLogButton, Surface } from "propulse";

export function FmPass() {
  return (
    <Surface style={{ width: 280 }}>
      <SatelliteLogButton
        satelliteName="ISS (ZARYA)"
        transponderMode="FM"
        downlinkFrequencyHz={145_800_000}
        passStartTime={new Date(Date.now() - 3 * 60 * 1000)}
        isAboveHorizon
      />
    </Surface>
  );
}

export function LinearTransponder() {
  return (
    <Surface style={{ width: 280 }}>
      <SatelliteLogButton
        satelliteName="SO-50"
        transponderMode="SSB"
        downlinkFrequencyHz={436_795_000}
        passStartTime={new Date(Date.now() - 90 * 1000)}
        isAboveHorizon
      />
    </Surface>
  );
}
