import { useCallback, useEffect, useRef, useState } from "react";
import {
  SOLAR_IMAGE_PRODUCTS,
  solarImageMetadataUrl,
  solarImageUrl,
  type SolarImageProductId,
} from "@/lib/solar/mediaProducts";
import { useRetainedSolarImage } from "./useRetainedSolarImage";
import { useSolarImageMetadata } from "./useSolarImageMetadata";

type DetailImageState = "loading" | "ready" | "error" | "retrying";

export function SolarImageDetail({
  productId,
}: {
  productId: SolarImageProductId;
}) {
  const product = SOLAR_IMAGE_PRODUCTS[productId];
  const [state, setState] = useState<DetailImageState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const attempts = useRef(0);
  const imageUrl = solarImageUrl(productId, now, retryKey);
  const retainedImage = useRetainedSolarImage(
    productId,
    imageUrl,
    imageUrl,
    product.hardTtlSeconds * 1_000,
  );
  const metadataUrl = solarImageMetadataUrl(productId, now, retryKey);
  const refreshBucket = Math.floor(now / (product.softTtlSeconds * 1_000));
  const { metadata, metadataState } = useSolarImageMetadata(
    imageUrl,
    retainedImage.visibleUrl,
    metadataUrl,
    refreshBucket,
  );

  const retry = useCallback(() => {
    setState((current) => (current === "loading" ? "loading" : "retrying"));
    setRetryKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const observedTime = metadata?.observedAt
    ? Date.parse(metadata.observedAt)
    : Number.NaN;
  const hardExpired = Number.isFinite(observedTime)
    ? now - observedTime > product.hardTtlSeconds * 1_000
    : false;

  useEffect(() => {
    if (state !== "error") return;
    const delay = Math.min(60_000, 8_000 * 2 ** Math.min(attempts.current, 3));
    const timer = window.setTimeout(retry, delay);
    return () => window.clearTimeout(timer);
  }, [retry, state]);

  return (
    <div>
      <div className="relative min-h-64 overflow-hidden rounded-2xl bg-su-input sm:min-h-96">
        {(state === "loading" || state === "retrying") && (
          <div className="absolute inset-0 flex items-center justify-center" role="status">
            <span className="rounded-full border border-su-line/40 bg-su-panel/90 px-3 py-1.5 text-xs text-su-muted">
              {state === "retrying" ? "Retrying full image…" : "Loading full image…"}
            </span>
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="text-sm font-semibold text-su-text">Full image temporarily unavailable</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-su-muted">
              The surrounding widget remains usable, and automatic recovery is active.
            </p>
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
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="text-sm font-semibold text-su-text">Image is too old to use</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-su-muted">
              The last published image passed this product’s approved usability limit.
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
          decoding="async"
          className={`pointer-events-none mx-auto max-h-[68dvh] w-full object-contain transition-opacity motion-reduce:transition-none ${state === "ready" && !hardExpired ? "opacity-100" : "opacity-0"}`}
          onLoad={() => {
            retainedImage.handleVisibleLoad();
            attempts.current = 0;
            setState("ready");
          }}
          onError={() => {
            retainedImage.handleVisibleError();
            attempts.current += 1;
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
              attempts.current = 0;
              setState("ready");
            }}
            onError={() => {
              // Retain the decoded detail image on a background refresh miss;
              // hardExpired still owns its scientific usability boundary.
              retainedImage.handleProbeError();
              attempts.current += 1;
            }}
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-su-muted">
        <span>
          {Number.isFinite(observedTime)
            ? `Image time ${new Date(observedTime).toLocaleString(undefined, { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}`
            : metadataState === "error"
              ? "Image loaded; observation timestamp is temporarily unavailable."
              : metadata
                ? "The provider did not publish an observation timestamp."
                : "Checking observation timestamp…"}
          {" "}Legends and map edges remain intact.
        </span>
        <a
          href={product.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded text-su-info underline decoration-su-info/40 underline-offset-2 hover:text-su-text"
        >
          View source at {product.provider}
        </a>
      </div>
    </div>
  );
}
