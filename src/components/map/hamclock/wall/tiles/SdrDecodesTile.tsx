import { useUTCClock } from "@/hooks/useUTCClock";
import type { WsjtxDecode } from "@/lib/radio/protocol";
import { getSnrColor } from "@/lib/utils/spotColors";
import { useFt8DecoderStore } from "@/stores/ft8DecoderStore";
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";

/** The rail cannot scroll, so render a slice and let CSS clip the rest. */
const MAX_ROWS = 9;

function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

/** `epochMs` is stamped at ingest, but the type marks it optional. */
function decodeAge(decode: WsjtxDecode, now: number): string {
  if (decode.epochMs == null) return "—";
  return formatAge((now - decode.epochMs) / 1000);
}

/** Prefer the parsed callsign; fall back to the raw message. */
function decodeCall(decode: WsjtxDecode): string {
  return decode.callsign ?? decode.message.trim() ?? "—";
}

/**
 * Last decodes from the in-app FT8 decoder.
 *
 * The tile reads `ft8DecoderStore` directly rather than calling
 * `useFt8Decoder`, which would start a decoder worker and a `getUserMedia`
 * capture from the wall. Nothing on the /map route feeds that store today —
 * the producer is mounted by the SDR console and resets the store when it
 * unmounts — so the idle copy says where decoding actually happens instead of
 * telling the operator to flip a switch that would not reach this tile. The
 * live branch below stays ready for a shared receiver.
 */
export function SdrDecodesTile({ title = "Decodes" }: WallTileProps) {
  const decodes = useFt8DecoderStore((state) => state.decodes);
  const enabled = useFt8DecoderStore((state) => state.enabled);
  const stats = useFt8DecoderStore((state) => state.stats);
  const now = useUTCClock(10_000);

  if (decodes.length === 0) {
    return (
      <HamClockTile title={title} source={enabled ? "LISTENING" : "OFF"}>
        <TileHero tone="hc-dim-text">{enabled ? "—" : "OFF"}</TileHero>
        <p className="hcf-idle">
          {enabled
            ? "Decoder running — waiting for the next 15 s cycle."
            : "FT8 decoding runs in the SDR console; wall decodes arrive with the shared receiver."}
        </p>
      </HamClockTile>
    );
  }

  const rows = decodes.slice(0, MAX_ROWS);

  return (
    <HamClockTile
      title={title}
      source={`${stats.totalDecodes} TOTAL`}
      state={enabled ? "var(--hc-good)" : undefined}
    >
      <div className="hc-heroline">
        <TileHero tone="hc-good" flush>
          {stats.lastCycleDecodes}
        </TileHero>
        <div className="hc-verdict hc-glow hc-dim-text">CYCLE</div>
      </div>
      <TileSub>
        <span>{rows[0]?.mode?.toUpperCase() ?? "FT8"}</span>
        <span>{stats.cyclesCompleted} CYCLES</span>
      </TileSub>

      <div className="hc-rows">
        {rows.map((decode, index) => (
          <div
            className="hc-row"
            key={`${decode.epochMs ?? index}-${decode.deltaFrequency}-${decode.message}`}
          >
            <span
              className="hc-chip"
              style={{ background: getSnrColor(decode.snr) }}
            >
              {decode.snr > 0 ? `+${decode.snr}` : decode.snr}
            </span>
            <span className="hc-row-call">
              {decodeCall(decode)}
              <small>
                {decode.grid ? `${decode.grid} · ` : ""}
                {decode.deltaFrequency} Hz
              </small>
            </span>
            <span className="hc-row-age">
              {decodeAge(decode, now.getTime())}
            </span>
          </div>
        ))}
      </div>
    </HamClockTile>
  );
}
