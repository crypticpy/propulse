import { useSolarResource } from "@/hooks/useSolarResource";
import type {
  KpPoint,
  NoaaScalesProduct,
  SolarFluxPoint,
} from "@/lib/solar/dataTypes";
import { currentKp, latestByTime } from "@/lib/solar/selectors";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";

/** The plain-language name every operator already uses for a Kp band. */
function kpDescriptor(kp: number): string {
  if (kp < 2) return "QUIET";
  if (kp < 3) return "UNSETTLED";
  if (kp < 4) return "ACTIVE";
  if (kp < 5) return "MINOR UNREST";
  return `G${Math.min(5, Math.floor(kp) - 4)} STORM`;
}

function kpTone(kp: number): { tone: string; state: string } {
  if (kp >= 5) return { tone: "hc-bad", state: "var(--hc-bad)" };
  if (kp >= 4) return { tone: "hc-warn", state: "var(--hc-warn)" };
  return { tone: "hc-good", state: "var(--hc-good)" };
}

function scaleTone(level: number): string {
  if (level >= 3) return "hc-bad";
  if (level >= 1) return "hc-warn";
  return "hc-good";
}

interface ScaleChipProps {
  letter: "G" | "S" | "R";
  level: number;
  title: string;
}

/** One NOAA scale as a filled disc plus its letter. */
export function ScaleChip({ letter, level, title }: ScaleChipProps) {
  return (
    <div className={`hc-scale ${scaleTone(level)}`} title={title}>
      <b>{level}</b>
      {letter}
    </div>
  );
}

/**
 * The planetary Kp headline with NOAA's three storm scales beside it. Kp comes
 * from the observed series; the G/S/R levels are NOAA's own published scales,
 * so the tile never invents a severity the agency has not issued.
 */
export function SpaceWxTile() {
  const kpQuery = useSolarResource<KpPoint[]>("noaa-k-index");
  const scalesQuery = useSolarResource<NoaaScalesProduct>("swpc-scales");
  const fluxQuery = useSolarResource<SolarFluxPoint[]>("noaa-solar-flux");

  const kpPoint = currentKp(kpQuery.data?.envelope.data);
  const scales = scalesQuery.data?.envelope.data;
  const flux = latestByTime(
    fluxQuery.data?.envelope.data,
    (point) => point.time_tag,
  );

  if (!kpPoint) {
    return (
      <HamClockTile title="Space weather" source="NOAA SWPC">
        <TileHero tone="hc-dim-text">—</TileHero>
        <TileSub>
          <span>
            {kpQuery.isError
              ? "NOAA planetary Kp feed unavailable"
              : "Waiting for the NOAA Kp feed…"}
          </span>
        </TileSub>
      </HamClockTile>
    );
  }

  const kp = kpPoint.kp;
  const { tone, state } = kpTone(kp);

  return (
    <HamClockTile title="Space weather" source="NOAA SWPC" state={state}>
      <div className="hc-gsr">
        <div>
          <TileHero tone={tone}>
            {kp.toFixed(1)}
            <span className="hc-hero-unit">Kp</span>
          </TileHero>
          <TileSub>
            <span>
              {kpDescriptor(kp)}
              {flux ? (
                <>
                  {" · SFI "}
                  <b>{Math.round(flux.flux)}</b>
                </>
              ) : null}
            </span>
          </TileSub>
        </div>
        {scales && (
          <div className="hc-gsr-scales">
            <ScaleChip
              letter="G"
              level={scales.geomagnetic_storm.scale ?? 0}
              title="Geomagnetic storm scale"
            />
            <ScaleChip
              letter="S"
              level={scales.solar_radiation.scale ?? 0}
              title="Solar radiation storm scale"
            />
            <ScaleChip
              letter="R"
              level={scales.radio_blackout.scale ?? 0}
              title="Radio blackout scale"
            />
          </div>
        )}
      </div>
    </HamClockTile>
  );
}
