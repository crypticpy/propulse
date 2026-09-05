import { useEffect, useMemo, useState } from "react";
import { useRadioStore } from "@/stores/radioStore";
import { useSdrStore } from "@/stores/sdrStore";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";

/** Points drawn across the strip; more is invisible from ten feet. */
const RESOLUTION = 72;

/**
 * How old the last frame may be before the strip stops calling itself live.
 * The daemon pushes several frames a second, so five seconds of silence means
 * the stream has stopped rather than merely paused.
 */
const STALE_MS = 5_000;

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
 *
 * `lastFftFrame` survives the stream stopping, so "live" needs three things to
 * hold at once: a connected receiver, the spectrum switched on, and a frame
 * that arrived within `STALE_MS`. Otherwise the wall would keep advertising a
 * frozen trace as `SDR · LIVE` long after the radio went away.
 */
export function SdrScopeTile({ title = "Band scope" }: WallTileProps) {
  const frame = useSdrStore((state) => state.lastFftFrame);
  const frameAt = useSdrStore((state) => state.lastFftFrameAt);
  const fftEnabled = useSdrStore((state) => state.fftEnabled);
  const connectedDeviceId = useRadioStore((state) => state.connectedDeviceId);
  const connected = connectedDeviceId != null;

  // Frames stop arriving silently, so nothing else would re-render this tile
  // once the stream dies. One slow local timer is enough to age it out.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), STALE_MS);
    return () => clearInterval(timer);
  }, []);

  const scope = useMemo(
    () => (frame ? scopePath(frame.bins) : null),
    [frame],
  );

  const fresh = frameAt != null && now - frameAt <= STALE_MS;
  const live = connected && fftEnabled && fresh;

  if (!frame || !scope || !live) {
    const stalled = connected && fftEnabled && frame != null && !fresh;
    return (
      <HamClockTile title={title} source={connected ? "IDLE" : "OFFLINE"}>
        <TileHero tone="hc-dim-text">
          {connected ? "NO SIGNAL" : "NO RECEIVER"}
        </TileHero>
        <p className="hcf-idle">
          {!connected
            ? "Connect the bridge to see the band scope."
            : !fftEnabled
              ? "Receiver connected — turn on the spectrum in SDR Console."
              : stalled
                ? "Spectrum stalled — no frame in the last five seconds."
                : "Receiver connected — waiting for the first spectrum frame."}
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
