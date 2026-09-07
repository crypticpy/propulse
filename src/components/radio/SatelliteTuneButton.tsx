import { TuneButton } from "./TuneButton";
import type { TransponderMode } from "@/lib/data/satelliteTransponders";

/** Receive target only; a transponder category does not specify a rig mode. */
export function SatelliteTuneButton({ downlinkHz, mode }: {
  downlinkHz: number;
  mode?: TransponderMode;
}) {
  return <TuneButton frequencyKHz={downlinkHz / 1000} mode={mode === "FM" ? "FM" : null} wall={false} />;
}
