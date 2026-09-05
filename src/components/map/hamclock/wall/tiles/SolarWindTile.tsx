import { useSolarResource } from "@/hooks/useSolarResource";
import type {
  SolarWindMagPoint,
  SolarWindPlasmaPoint,
} from "@/lib/solar/dataTypes";
import { latestByTime } from "@/lib/solar/selectors";
import { HamClockTile, TileSub } from "../HamClockTile";

/** Displayed gauge span: below 250 km/s and above 800 km/s both peg the arc. */
const SPEED_MIN = 250;
const SPEED_MAX = 800;
/** Bz is symmetric; ±20 nT covers everything short of an extreme storm. */
const BZ_LIMIT = 20;

const ARC_R = 40;
const ARC_CX = 50;
const ARC_CY = 55;

/** Point on the 180° gauge arc at `fraction` of full scale, left to right. */
function arcPoint(fraction: number): string {
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, fraction)));
  const x = ARC_CX + ARC_R * Math.cos(angle);
  const y = ARC_CY - ARC_R * Math.sin(angle);
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

interface ArcGaugeProps {
  /** 0…1 of full scale; the filled sweep is hidden below ~1%. */
  fraction: number;
  value: string;
  label: string;
  tone: string;
}

/** One half-ring gauge: track, filled sweep, value, unit caption. */
export function ArcGauge({ fraction, value, label, tone }: ArcGaugeProps) {
  const filled = Math.min(0.999, Math.max(0, fraction));
  return (
    <div className="hc-gauge">
      <svg viewBox="0 0 100 60" aria-hidden="true">
        <path
          d={`M10,${ARC_CY} A${ARC_R},${ARC_R} 0 0,1 90,${ARC_CY}`}
          fill="none"
          stroke="var(--hc-line)"
          strokeWidth={7}
          strokeLinecap="round"
        />
        {filled > 0.01 && (
          <path
            className={tone}
            d={`M10,${ARC_CY} A${ARC_R},${ARC_R} 0 0,1 ${arcPoint(filled)}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={7}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className={`hc-gauge-val hc-glow ${tone}`}>{value}</div>
      <div className="hc-gauge-lbl">{label}</div>
    </div>
  );
}

/** Fast wind stresses the magnetosphere; slow wind is the quiet baseline. */
function speedTone(speed: number): string {
  if (speed >= 600) return "hc-bad";
  if (speed >= 450) return "hc-warn";
  return "hc-good";
}

/** Southward (negative) Bz opens the door to geomagnetic storming. */
function bzTone(bz: number): string {
  if (bz <= -10) return "hc-bad";
  if (bz < 0) return "hc-warn";
  return "hc-good";
}

/** ACE/DSCOVR solar wind at L1: bulk speed and the IMF Bz component. */
export function SolarWindTile() {
  const plasmaQuery =
    useSolarResource<SolarWindPlasmaPoint[]>("swpc-solar-wind-plasma");
  const magQuery = useSolarResource<SolarWindMagPoint[]>("swpc-solar-wind-mag");

  const plasma = latestByTime(
    plasmaQuery.data?.envelope.data,
    (point) => point.time_tag,
    (point) => point.speed !== null,
  );
  const mag = latestByTime(
    magQuery.data?.envelope.data,
    (point) => point.time_tag,
    (point) => point.bz_gsm !== null,
  );
  const speed = plasma?.speed ?? null;
  const bz = mag?.bz_gsm ?? null;

  if (speed === null && bz === null) {
    const failed = plasmaQuery.isError && magQuery.isError;
    return (
      <HamClockTile title="Solar wind" source="L1">
        <div className="hc-gauges">
          <ArcGauge fraction={0} value="—" label="KM/S · SPEED" tone="hc-dim-text" />
          <ArcGauge fraction={0} value="—" label="nT · Bz" tone="hc-dim-text" />
        </div>
        <TileSub>
          <span>
            {failed
              ? "L1 solar-wind feed unavailable"
              : "Waiting for the L1 solar-wind feed…"}
          </span>
        </TileSub>
      </HamClockTile>
    );
  }

  const state =
    bz !== null && bz <= -10
      ? "var(--hc-bad)"
      : speed !== null && speed >= 600
        ? "var(--hc-warn)"
        : "var(--hc-good)";

  return (
    <HamClockTile title="Solar wind" source="L1" state={state}>
      <div className="hc-gauges">
        <ArcGauge
          fraction={
            speed === null ? 0 : (speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)
          }
          value={speed === null ? "—" : Math.round(speed).toString()}
          label="KM/S · SPEED"
          tone={speed === null ? "hc-dim-text" : speedTone(speed)}
        />
        <ArcGauge
          fraction={bz === null ? 0 : (bz + BZ_LIMIT) / (2 * BZ_LIMIT)}
          value={bz === null ? "—" : `${bz >= 0 ? "+" : ""}${bz.toFixed(1)}`}
          label="nT · Bz"
          tone={bz === null ? "hc-dim-text" : bzTone(bz)}
        />
      </div>
      <TileSub>
        <span>
          {bz !== null && bz < 0
            ? "Bz SOUTH · COUPLING"
            : speed !== null && speed >= 600
              ? "HIGH-SPEED STREAM"
              : "QUIET STREAM"}
        </span>
        {plasma?.density != null && (
          <span>{plasma.density.toFixed(1)} p/cm³</span>
        )}
      </TileSub>
    </HamClockTile>
  );
}
