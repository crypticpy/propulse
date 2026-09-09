import { GlobeWeatherAlertFlow } from "propulse";

export function SevereThunderstormAlert() {
  return (
    <GlobeWeatherAlertFlow
      selection={{
        alert: {
          id: "alert-1",
          event: "Severe Thunderstorm Warning",
          headline: "Severe Thunderstorm Warning issued for Wake County NC",
          severity: "Severe",
          lat: 35.78,
          lon: -78.64,
          areaDesc: "Wake County, NC",
          urgency: "Immediate",
          certainty: "Observed",
          response: "Shelter",
          instruction: "Move to an interior room on the lowest floor of a building.",
          polygon: null,
        },
        screenPos: { x: 60, y: 60 },
      }}
      onFlyoutClose={() => {}}
    />
  );
}

export function MinorAdvisory() {
  return (
    <GlobeWeatherAlertFlow
      selection={{
        alert: {
          id: "alert-2",
          event: "Small Craft Advisory",
          headline: "Small Craft Advisory in effect until 6 PM EDT",
          severity: "Minor",
          lat: 41.7,
          lon: -72.7,
          areaDesc: "Long Island Sound",
          urgency: "Expected",
          certainty: "Likely",
          response: "Avoid",
          instruction: "Inexperienced mariners should avoid navigating in hazardous seas.",
          polygon: null,
        },
        screenPos: { x: 60, y: 60 },
      }}
      onFlyoutClose={() => {}}
    />
  );
}
