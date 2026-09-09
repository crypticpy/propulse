import { HomeWeather, Surface } from "propulse";

const NOW = Date.UTC(2026, 8, 8, 14, 0, 0);

export function Compact() {
  return (
    <Surface>
      <HomeWeather now={NOW} />
    </Surface>
  );
}

export function Detailed() {
  return (
    <Surface>
      <HomeWeather now={NOW} detailed />
    </Surface>
  );
}
