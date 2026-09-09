import { HamClockTile } from "propulse";

/**
 * HamClockTile is the generic wall-tile shell: title row (with optional
 * source/provenance), a `--hc-state` colour bar, and a report-open overlay
 * when `onOpen` is set. `TileHero`/`TileSub` are internal helpers (not
 * exported from the bundle), so hero/sub content is hand-composed here with
 * the same `hc-hero` / `hc-sub` classes the real tiles render, matching the
 * hero-size classes (`hc-hero--short` / `--medium` / `--long`) the tile
 * system's style guide documents for a value of that length.
 */

export function SpaceWeatherReading() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <HamClockTile
        title="Space weather"
        source="NOAA SWPC"
        state="var(--hc-good)"
        onOpen={() => {}}
        openLabel="Space weather: Kp 3.3, quiet. Open the solar report"
      >
        <div className="hc-hero hc-glow hc-hero--short hc-good">
          3.3<span className="hc-hero-unit">Kp</span>
        </div>
        <div className="hc-sub">
          <span>QUIET · SFI 142</span>
        </div>
      </HamClockTile>
    </div>
  );
}

export function XrayFlareState() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <HamClockTile
        title="X-ray flux"
        source="GOES-18"
        state="var(--hc-warn)"
        onOpen={() => {}}
        openLabel="X-ray flux M1.2. Open the X-ray report"
      >
        <div className="hc-hero hc-glow hc-hero--short hc-warn">M1.2</div>
        <div className="hc-sub">
          <span>
            6H MAX <b>X1.4</b> 18:42Z
          </span>
        </div>
      </HamClockTile>
    </div>
  );
}

export function SunsetCountdown() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <HamClockTile
        title="Sunset"
        source="DE · LOCAL"
        state="var(--hc-accent)"
        onOpen={() => {}}
        openLabel="Sunset in 1 hour 42 minutes. Open the sun report"
      >
        <div className="hc-media">
          <div className="hc-sunico" aria-hidden="true" />
          <div>
            <div className="hc-hero hc-glow hc-hero--flush hc-hero--medium hc-accent-text">
              1H 42M
            </div>
            <div className="hc-sub">
              <span>
                AT <b>20:14</b>
              </span>
              <span>06:12 / 20:14</span>
            </div>
          </div>
        </div>
      </HamClockTile>
    </div>
  );
}

export function RecentContactsGrow() {
  return (
    <div style={{ width: 480, height: 340, background: "var(--hc-bg)" }}>
      <HamClockTile
        grow
        title="Recent contacts"
        source="4 · TODAY"
        onOpen={() => {}}
        openLabel="Open recent contacts report"
      >
        <div className="hc-rows">
          <div className="hc-row">
            <span className="hc-chip" style={{ background: "#ffb020" }}>
              20m
            </span>
            <span className="hc-row-call">
              JA1XYZ
              <small>FT8 · PM95</small>
            </span>
            <span className="hc-row-age">2m</span>
          </div>
          <div className="hc-row">
            <span className="hc-chip" style={{ background: "#3ddc84" }}>
              40m
            </span>
            <span className="hc-row-call">
              VK6LC
              <small>CW · OF87</small>
            </span>
            <span className="hc-row-age">11m</span>
          </div>
          <div className="hc-row">
            <span className="hc-chip" style={{ background: "#5eb1ff" }}>
              15m
            </span>
            <span className="hc-row-call">
              DL2ABC
              <small>SSB · JO31</small>
            </span>
            <span className="hc-row-age">24m</span>
          </div>
          <div className="hc-row">
            <span className="hc-chip" style={{ background: "#ffb020" }}>
              20m
            </span>
            <span className="hc-row-call">
              W1AW
              <small>FT8 · FN31</small>
            </span>
            <span className="hc-row-age">41m</span>
          </div>
        </div>
      </HamClockTile>
    </div>
  );
}

export function IdleFeed() {
  return (
    <div style={{ width: 480, height: 300, background: "var(--hc-bg)" }}>
      <HamClockTile title="Solar wind" source="L1">
        <div className="hc-hero hc-glow hc-hero--short hc-dim-text">—</div>
        <div className="hc-sub">
          <span>Waiting for the L1 solar-wind feed…</span>
        </div>
      </HamClockTile>
    </div>
  );
}
