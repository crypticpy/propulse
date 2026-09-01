import type { TileProviderConfig } from "@/lib/tiles/types";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";
import type { ImagerySourceCredit } from "@/lib/map/imagerySources";

interface ImageryAttributionProps {
  provider?: TileProviderConfig;
  baseSource?: ImagerySourceCredit;
  className?: string;
  includeCartoLabels?: boolean;
}

/** Visible imagery provenance and effective rendering quality. */
export function ImageryAttribution({
  provider,
  baseSource,
  className = "",
  includeCartoLabels = false,
}: ImageryAttributionProps) {
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const quality = useResolvedDisplayQuality(displayQuality);
  const primarySource = baseSource ?? provider;
  if (!primarySource) return null;
  const surfaceLabel =
    primarySource.surfaceKind === "declouded-mosaic"
      ? "De-clouded mosaic"
      : "Cartographic";
  const title = provider
    ? `${primarySource.name}. ${quality.label} rendering${baseSource ? `; close-up detail from ${provider.name}` : ` through native zoom ${provider.nativeMaxZoom}`}. ${provider.coverageNote}. ${provider.freshnessNote}.`
    : `${primarySource.name}. ${quality.label} rendering.`;

  return (
    <div
      className={`rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white/55 backdrop-blur-sm select-none ${className}`}
      title={title}
    >
      <span>{surfaceLabel}</span>
      <span className="mx-1 text-white/25">·</span>
      <span>{quality.label}</span>
      <span className="mx-1 text-white/25">·</span>
      <a
        href={primarySource.attributionUrl}
        target="_blank"
        rel="noreferrer"
        className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
      >
        {primarySource.attribution}
      </a>
      {baseSource && provider && (
        <>
          <span className="mx-1 text-white/25">·</span>
          <a
            href={provider.attributionUrl}
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
          >
            Detail: {provider.attribution}
          </a>
        </>
      )}
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
