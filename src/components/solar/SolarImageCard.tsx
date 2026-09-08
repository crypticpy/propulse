import { useCallback, useEffect, useRef, useState } from "react";
import {
  SOLAR_IMAGE_PRODUCTS,
  solarImageMetadataUrl,
  solarImageUrl,
  type SolarImageProductId,
} from "@/lib/solar/mediaProducts";
import { useRetainedSolarImage } from "./useRetainedSolarImage";
import { useSolarImageMetadata } from "./useSolarImageMetadata";

type ImageState = "loading" | "fresh" | "stale" | "error" | "retrying";

function ageLabel(timestamp: string): string {
  const age = Math.max(0, Date.now() - Date.parse(timestamp));
  if (age < 60_000) return "just now";
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m ago`;
  return `${Math.floor(age / 3_600_000)}h ago`;
}

export function SolarImageCard({
  productId,
  onOpen,
}: {
  productId: SolarImageProductId;
  onOpen: (productId: SolarImageProductId, animation: boolean) => void;
}) {
  const product = SOLAR_IMAGE_PRODUCTS[productId];
  const [state, setState] = useState<ImageState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [metadataRetryKey, setMetadataRetryKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const attempt = useRef(0);
  const imageUrl = solarImageUrl(productId, now, retryKey);
  const retainedImage = useRetainedSolarImage(
    productId,
    imageUrl,
    imageUrl,
    product.hardTtlSeconds * 1_000,
  );
  const metadataUrl = solarImageMetadataUrl(
    productId,
    now,
    metadataRetryKey,
  );
  const refreshBucket = Math.floor(now / (product.softTtlSeconds * 1_000));
  const { metadata, metadataState } = useSolarImageMetadata(
    imageUrl,
    retainedImage.visibleUrl,
    metadataUrl,
    refreshBucket,
  );

  const retry = useCallback(() => {
    setState((current) => (current === "loading" ? "loading" : "retrying"));
    setRetryKey((value) => value + 1);
    setMetadataRetryKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (state !== "error") return;
    const delay = Math.min(60_000, 8_000 * 2 ** Math.min(attempt.current, 3));
    const timer = window.setTimeout(retry, delay);
    return () => window.clearTimeout(timer);
  }, [retry, state]);

  useEffect(() => {
    if (metadataState !== "error") return;
    const timer = window.setTimeout(
      () => setMetadataRetryKey((value) => value + 1),
      30_000,
    );
    return () => window.clearTimeout(timer);
  }, [metadataState]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const parsedTimestamp = metadata?.observedAt
    ? Date.parse(metadata.observedAt)
    : Number.NaN;
  const timestamp = Number.isFinite(parsedTimestamp)
    ? metadata?.observedAt ?? null
    : null;
  const metadataStale = timestamp
    ? now - parsedTimestamp > product.softTtlSeconds * 1_000
    : false;
  const hardExpired = timestamp
    ? now - parsedTimestamp > product.hardTtlSeconds * 1_000
    : false;
  const visibleState = hardExpired
    ? "unavailable"
    : state === "fresh" &&
        (metadataState !== "ready" || timestamp === null)
      ? "partial"
    : state === "fresh" && metadataStale
      ? "stale"
      : state;
  const usableImage = state === "fresh" && !hardExpired;

  return (
    <article className="overflow-hidden rounded-2xl border border-su-line/40 bg-su-panel/40">
      <div className="relative aspect-[4/3] bg-su-input">
        {(state === "loading" || state === "retrying") && (
          <div className="absolute inset-0 flex items-center justify-center" role="status">
            <span className="rounded-full border border-su-line/40 bg-su-panel/90 px-3 py-1.5 text-xs text-su-muted">
              {state === "retrying" ? "Retrying image…" : "Loading image…"}
            </span>
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-su-text">Image temporarily unavailable</p>
            <p className="mt-1 text-xs leading-5 text-su-muted/80">Automatic recovery is active.</p>
            <button
              type="button"
              onClick={retry}
              className="mt-4 min-h-11 rounded-xl border border-su-line/40 bg-su-input px-4 text-sm text-su-text hover:bg-su-line/20"
            >
              Retry now
            </button>
          </div>
        )}
        {hardExpired && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-su-text">Image is too old to use</p>
            <p className="mt-1 text-xs leading-5 text-su-muted/80">
              The last published image passed this product’s usability limit.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-4 min-h-11 rounded-xl border border-su-line/40 bg-su-input px-4 text-sm text-su-text hover:bg-su-line/20"
            >
              Check again
            </button>
          </div>
        )}
        <img
          src={retainedImage.visibleUrl ?? undefined}
          alt={product.alt}
          loading="lazy"
          decoding="async"
          className={`pointer-events-none h-full w-full object-contain transition-opacity motion-reduce:transition-none ${usableImage ? "opacity-100" : "opacity-0"}`}
          onLoad={() => {
            retainedImage.handleVisibleLoad();
            attempt.current = 0;
            setState("fresh");
          }}
          onError={() => {
            retainedImage.handleVisibleError();
            attempt.current += 1;
            setState("error");
          }}
        />
        {retainedImage.probeUrl && (
          <img
            key={retainedImage.probeUrl}
            src={retainedImage.probeUrl}
            alt=""
            aria-hidden="true"
            decoding="async"
            data-solar-image-probe="true"
            className="pointer-events-none absolute h-px w-px opacity-0"
            onLoad={() => {
              retainedImage.handleProbeLoad();
              attempt.current = 0;
              setState("fresh");
            }}
            onError={() => {
              // A cadence miss must not evict a still-usable decoded frame.
              // The next cadence key (or an explicit retry) can probe again.
              retainedImage.handleProbeError();
              attempt.current += 1;
            }}
          />
        )}
        <span
          className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider backdrop-blur ${
            visibleState === "fresh"
              ? "border-su-success/40 bg-su-panel/90 text-su-success"
              : visibleState === "stale" || visibleState === "partial"
                ? "border-su-warning/40 bg-su-panel/90 text-su-warning"
                : "border-su-line/30 bg-su-panel/90 text-su-muted"
          }`}
        >
          {visibleState === "fresh"
            ? "Current"
            : visibleState === "stale"
              ? "Stale"
              : visibleState === "partial"
                ? "Age unknown"
                : visibleState}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-su-text">{product.title}</h3>
            <p className="mt-1 text-xs leading-5 text-su-muted">{product.description}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpen(productId, false)}
            disabled={state === "error" || hardExpired}
            className="min-h-11 shrink-0 rounded-xl border border-su-line/40 bg-su-input px-3 text-sm text-su-muted hover:bg-su-line/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Enlarge
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-su-line/20 pt-3 text-xs text-su-muted/80">
          <span>
            {timestamp
              ? `Image time ${ageLabel(timestamp)}`
              : metadataState === "error"
                ? "Image loaded · timestamp temporarily unavailable"
                : metadata
                ? `Timestamp not published · checked ${ageLabel(metadata.checkedAt)}`
                : "Checking product timestamp…"}
          </span>
          <div className="flex items-center gap-3">
            {product.animation && (
              <button
                type="button"
                onClick={() => onOpen(productId, true)}
                disabled={hardExpired}
                className="min-h-11 rounded-lg px-2 text-su-info hover:bg-su-line/10 hover:text-su-text disabled:cursor-not-allowed disabled:text-su-muted/40"
              >
                Play timeline
              </button>
            )}
            <a href={product.sourceUrl} target="_blank" rel="noreferrer" className="rounded underline decoration-su-line/40 underline-offset-2 hover:text-su-text">
              {product.provider}
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
