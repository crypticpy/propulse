import type { TileProviderConfig } from "@/lib/tiles/types";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";
import type { ImagerySourceCredit } from "@/lib/map/imagerySources";

interface ImageryAttributionProps {
  provider?: TileProviderConfig;
  baseSource?: ImagerySourceCredit;
  className?: string;
  includeCartoLabels?: boolean;
  mapboxFeedbackUrl?: string;
}

/** Visible imagery provenance and effective rendering quality. */
export function ImageryAttribution({
  provider,
  baseSource,
  className = "",
  includeCartoLabels = false,
  mapboxFeedbackUrl = "https://apps.mapbox.com/feedback/",
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

  if (provider?.id === "mapbox-satellite") {
    return (
      <div
        className={`flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded bg-black/65 px-2 py-1 text-[9px] leading-tight text-white/70 backdrop-blur-sm select-none ${className}`}
        title={title}
      >
        <span>{surfaceLabel}</span>
        <span className="text-white/25">·</span>
        <span>{quality.label}</span>
        {baseSource && (
          <>
            <span className="text-white/25">·</span>
            <a
              href={baseSource.attributionUrl}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
            >
              {baseSource.attribution}
            </a>
            <span className="text-white/25">·</span>
            <span>Detail:</span>
          </>
        )}
        <a
          href="https://www.mapbox.com/"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto shrink-0"
          aria-label="Mapbox"
        >
          <img
            src="/mapbox-logo-white.svg"
            alt="Mapbox"
            width="81"
            height="20"
            className="h-5 w-[81px]"
          />
        </a>
        <a
          href="https://www.mapbox.com/about/maps/"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
        >
          © Mapbox
        </a>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
        >
          © OpenStreetMap
        </a>
        <a
          href="https://www.maxar.com/"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
        >
          © Maxar
        </a>
        <a
          href={mapboxFeedbackUrl}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto font-semibold underline decoration-white/20 underline-offset-2 hover:text-white"
        >
          Improve this map
        </a>
        {includeCartoLabels && (
          <>
            <span className="text-white/25">· Labels:</span>
            <a
              href="https://carto.com/attributions"
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
            >
              © CARTO
            </a>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
            >
              © OpenStreetMap contributors
            </a>
          </>
        )}
      </div>
    );
  }

  if (provider?.id === "carto-dark") {
    return (
      <div
        className={`flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] leading-tight text-white/55 backdrop-blur-sm select-none ${className}`}
        title={title}
      >
        <span>{surfaceLabel}</span>
        <span className="text-white/25">·</span>
        <span>{quality.label}</span>
        <span className="text-white/25">·</span>
        <a
          href="https://carto.com/attributions"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
        >
          © CARTO
        </a>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
        >
          © OpenStreetMap contributors
        </a>
      </div>
    );
  }

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
          <span className="mx-1 text-white/25">· Labels:</span>
          <a
            href="https://carto.com/attributions"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
          >
            © CARTO
          </a>
          <span className="mx-1 text-white/25">·</span>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto underline decoration-white/20 underline-offset-2 hover:text-white"
          >
            © OpenStreetMap contributors
          </a>
        </>
      )}
    </div>
  );
}
