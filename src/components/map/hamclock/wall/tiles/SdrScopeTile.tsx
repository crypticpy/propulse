import { useMemo } from "react";
import { useRadioStore } from "@/stores/radioStore";
import { useSdrStore } from "@/stores/sdrStore";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";

/** Points drawn across the strip; more is invisible from ten feet. */
const RESOLUTION = 72;

/** Build a filled area path from the FFT bins, normalised to the frame. */
function scopePath(bins: Float32Array): { d: string; peakDb: number } | null {
  if (bins.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const value of bins) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const span = max - min || 1;
  const step = bins.length / RESOLUTION;

  let d = "M0,40";
  for (let i = 0; i < RESOLUTION; i++) {
    // Peak-hold each bucket so a narrow carrier survives the downsample.
    let peak = -Infinity;
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    for (let j = start; j < end && j < bins.length; j++) {
      if (bins[j] > peak) peak = bins[j];
    }
    if (!Number.isFinite(peak)) peak = min;
    const x = (i / (RESOLUTION - 1)) * 100;
    const y = 40 - ((peak - min) / span) * 38;
    d += ` L${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return { d: `${d} L100,40 Z`, peakDb: max };
}

/**
 * A thin live spectrum strip.
 *
 * This reads the SDR store passively — it never opens a socket, starts the
 * radio daemon or touches an AudioContext. Frames only land in the store while
 * something else (today, the SDR console) is running the daemon connection, so
 * the honest default on the map is a designed "no receiver" state.
 */
export function SdrScopeTile({ title = "Band scope" }: WallTileProps) {
  const frame = useSdrStore((state) => state.lastFftFrame);
  const fftEnabled = useSdrStore((state) => state.fftEnabled);
  const connectedDeviceId = useRadioStore((state) => state.connectedDeviceId);

  const scope = useMemo(
    () => (frame ? scopePath(frame.bins) : null),
    [frame],
  );

  if (!frame || !scope) {
    const connected = connectedDeviceId != null;
    return (
      <HamClockTile title={title} source={connected ? "IDLE" : "OFFLINE"}>
        <TileHero tone="hc-dim-text">
          {connected ? "NO SIGNAL" : "NO RECEIVER"}
        </TileHero>
        <p className="hcf-idle">
          {connected
            ? fftEnabled
              ? "Receiver connected — waiting for the first spectrum frame."
              : "Receiver connected — turn on the spectrum in SDR Console."
            : "Connect the bridge to see the band scope."}
        </p>
      </HamClockTile>
    );
  }

  const centerMhz = frame.centerHz / 1_000_000;
  const spanKhz = frame.spanHz / 1000;

  return (
    <HamClockTile title={title} source="SDR · LIVE" state="var(--hc-info)">
      <TileHero tone="hc-info-text">
        {centerMhz.toFixed(3)}
        <span className="hcf-unit">MHz</span>
      </TileHero>
      <svg
        className="hcf-scope hc-info-text"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Live spectrum centred on ${centerMhz.toFixed(3)} megahertz`}
      >
        <path d={scope.d} />
      </svg>
      <TileSub>
        <span>
          SPAN <b>{spanKhz.toFixed(0)}</b> kHz
        </span>
        <span>
          PEAK <b>{scope.peakDb.toFixed(0)}</b> dB
        </span>
      </TileSub>
    </HamClockTile>
  );
}
