import { WeatherTile } from "propulse";

/**
 * WeatherTile has no props — conditions come from Open-Meteo keyed to
 * `useActiveLocation`. With no QTH set in the preview harness it renders the
 * tile's designed "set your QTH" idle state rather than a blank card.
 */
export function Default() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <WeatherTile />
    </div>
  );
}

export function RailWidth() {
  return (
    <div style={{ width: 320, height: 260, background: "var(--hc-bg)" }}>
      <WeatherTile />
    </div>
  );
}
