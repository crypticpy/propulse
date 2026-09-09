import { WeatherAlertModal } from "propulse";

const severeThunderstorm = {
  id: "nws-severe-tstm-001",
  event: "Severe Thunderstorm Warning",
  headline:
    "Severe Thunderstorm Warning issued for Cleveland County until 8:15 PM CDT",
  severity: "Severe" as const,
  lat: 35.22,
  lon: -97.44,
  areaDesc: "Cleveland County, OK; south Oklahoma County, OK",
  urgency: "Immediate" as const,
  certainty: "Observed" as const,
  response: "Shelter",
  instruction:
    "Move to an interior room on the lowest floor. Large hail and 70 mph wind gusts possible.",
  polygon: null,
};

const winterStorm = {
  id: "nws-winter-004",
  event: "Winter Storm Warning",
  headline:
    "Winter Storm Warning in effect from 6 PM this evening to 6 AM CST Thursday",
  severity: "Moderate" as const,
  lat: 41.88,
  lon: -87.63,
  areaDesc: "Cook County, IL; DuPage County, IL",
  urgency: "Expected" as const,
  certainty: "Likely" as const,
  response: "Prepare",
  instruction:
    "Plan on slippery road conditions. Heavy snow accumulations of 6 to 10 inches expected.",
  polygon: null,
};

// AccessibleDialog owns focus trap / backdrop / escape handling and renders
// inline (not via a raw fixed-position portal outside app flow), so this
// mirrors the ConfirmDialog preview pattern -- no wrapping Surface needed.
export function SevereThunderstorm() {
  return <WeatherAlertModal alert={severeThunderstorm} onClose={() => {}} />;
}

export function WinterStorm() {
  return <WeatherAlertModal alert={winterStorm} onClose={() => {}} />;
}
