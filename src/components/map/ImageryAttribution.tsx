import type { TileProviderConfig } from "@/lib/tiles/types";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { resolveDisplayQuality } from "@/lib/map/displayQuality";

interface ImageryAttributionProps {
  provider: TileProviderConfig;
  className?: string;
  includeCartoLabels?: boolean;
}

/** Visible imagery provenance and effective rendering quality. */
export function ImageryAttribution({
  provider,
  className = "",
  includeCartoLabels = false,
}: ImageryAttributionProps) {
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const quality = resolveDisplayQuality(displayQuality);
  const surfaceLabel =
    provider.surfaceKind === "declouded-mosaic"
      ? "De-clouded mosaic"
      : "Cartographic";

  return (
    <div
      className={`rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white/55 backdrop-blur-sm select-none ${className}`}
      title={`${provider.name}. ${quality.label} rendering through native zoom ${provider.nativeMaxZoom}. ${provider.coverageNote}. ${provider.freshnessNote}.`}
    >
      <span>{surfaceLabel}</span>
      <span className="mx-1 text-white/25">·</span>
      <span>{quality.label}</span>
      <span className="mx-1 text-white/25">·</span>
      <a
        href={provider.attributionUrl}
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
      >
        {provider.attribution}
      </a>
      {includeCartoLabels && (
        <>
          <span className="mx-1 text-white/25">·</span>
          <a
            href="https://carto.com/attributions"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
          >
            © CARTO · © OpenStreetMap
          </a>
        </>
      )}
    </div>
  );
}
