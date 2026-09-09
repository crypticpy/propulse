import { WeatherAlertFlyout, Surface } from "propulse";

// WeatherAlertFlyout portals to document.body and positions itself relative
// to the viewport (viewport-aware flip logic), so it renders outside this
// Surface's box. The wrapper still gives the cell a dark backdrop to sit on.
const severeThunderstorm = {
  id: "nws-severe-tstm-001",
  event: "Severe Thunderstorm Warning",
  headline:
    "Severe Thunderstorm Warning issued for Cleveland County until 8:15 PM CDT",
  severity: "Severe" as const,
  lat: 35.22,
  lon: -97.44,
  areaDesc: "Cleveland County, OK",
  urgency: "Immediate" as const,
  certainty: "Observed" as const,
  response: "Shelter",
  instruction: "Move to an interior room on the lowest floor.",
  polygon: null,
};

const tornadoWatch = {
  id: "nws-tornado-002",
  event: "Tornado Warning",
  headline: "Tornado Warning issued for Grady County until 8:45 PM CDT",
  severity: "Extreme" as const,
  lat: 35.02,
  lon: -97.96,
  areaDesc: "Grady County, OK; McClain County, OK",
  urgency: "Immediate" as const,
  certainty: "Observed" as const,
  response: "Shelter",
  instruction: "TAKE COVER NOW. A tornado has been spotted.",
  polygon: null,
};

export function SevereThunderstorm() {
  return (
    <Surface style={{ width: 480, height: 260, position: "relative" }}>
      <WeatherAlertFlyout
        visible
        position={{ x: 260, y: 140 }}
        alert={severeThunderstorm}
        onClose={() => {}}
        onViewDetails={() => {}}
      />
    </Surface>
  );
}

export function TornadoExtreme() {
  return (
    <Surface style={{ width: 480, height: 260, position: "relative" }}>
      <WeatherAlertFlyout
        visible
        position={{ x: 260, y: 140 }}
        alert={tornadoWatch}
        onClose={() => {}}
        onViewDetails={() => {}}
      />
    </Surface>
  );
}
