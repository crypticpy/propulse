import { useGOESImagery } from "@/hooks/useGOESImagery";
import { useMapStore } from "@/stores/mapStore";

/** Visible provenance and freshness companion for the optional live-cloud layer. */
export function CloudImageryAttribution() {
  const enabled = useMapStore((s) => s.layers.goesCloud);
  const { error, isLoading } = useGOESImagery(enabled);
  if (!enabled) return null;

  const status = error
    ? "unavailable"
    : isLoading
      ? "loading latest"
      : "latest slot";

  return (
    <div
      className={`rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight backdrop-blur-sm select-none ${
        error ? "text-amber-400" : "text-white/55"
      }`}
      title="GOES-East infrared cloud imagery. NASA GIBS resolves the latest observation; PropSphere checks for a newer slot every 10 minutes."
    >
      <span>Live clouds · {status}</span>
      <span className="mx-1 text-white/25">·</span>
      <a
        href="https://www.earthdata.nasa.gov/data/tools/gibs"
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
      >
        NASA GIBS
      </a>
    </div>
  );
}
