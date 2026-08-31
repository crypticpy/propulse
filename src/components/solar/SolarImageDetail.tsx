import { useCallback, useEffect, useRef, useState } from "react";
import {
  SOLAR_IMAGE_PRODUCTS,
  solarImageMetadataUrl,
  solarImageUrl,
  type SolarImageProductId,
} from "@/lib/solar/mediaProducts";

type DetailImageState = "loading" | "ready" | "error" | "retrying";
interface ImageMetadata {
  observedAt: string | null;
  checkedAt: string;
}

export function SolarImageDetail({
  productId,
}: {
  productId: SolarImageProductId;
}) {
  const product = SOLAR_IMAGE_PRODUCTS[productId];
  const [state, setState] = useState<DetailImageState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [metadataFailed, setMetadataFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const attempts = useRef(0);
  const imageUrl = solarImageUrl(productId, now, retryKey);
  const metadataUrl = solarImageMetadataUrl(productId, now, retryKey);
  const refreshBucket = Math.floor(now / (product.softTtlSeconds * 1_000));

  const retry = useCallback(() => {
    setState((current) => (current === "loading" ? "loading" : "retrying"));
    setRetryKey((current) => current + 1);
    setMetadataFailed(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(metadataUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("metadata unavailable");
        const value = (await response.json()) as ImageMetadata;
        if (
          !value ||
          !Number.isFinite(Date.parse(value.checkedAt)) ||
          (value.observedAt !== null &&
            !Number.isFinite(Date.parse(value.observedAt)))
        ) {
          throw new Error("metadata contract mismatch");
        }
        return value;
      })
      .then(setMetadata)
      .catch(() => {
        if (!controller.signal.aborted) setMetadataFailed(true);
      });
    return () => controller.abort();
  }, [metadataUrl, refreshBucket]);

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
      <div className="relative min-h-64 overflow-hidden rounded-2xl bg-black/35 sm:min-h-96">
        {(state === "loading" || state === "retrying") && (
          <div className="absolute inset-0 flex items-center justify-center" role="status">
            <span className="rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-slate-300">
              {state === "retrying" ? "Retrying full image…" : "Loading full image…"}
            </span>
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="text-sm font-semibold text-slate-100">Full image temporarily unavailable</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">
              The surrounding widget remains usable, and automatic recovery is active.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-4 min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white hover:bg-white/10"
            >
              Retry now
            </button>
          </div>
        )}
        {hardExpired && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="text-sm font-semibold text-slate-100">Image is too old to use</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-400">
              The last published image passed this product’s approved usability limit.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-4 min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white hover:bg-white/10"
            >
              Check again
            </button>
          </div>
        )}
        <img
          key={imageUrl}
          src={imageUrl}
          alt={product.alt}
          decoding="async"
          className={`pointer-events-none mx-auto max-h-[68dvh] w-full object-contain transition-opacity motion-reduce:transition-none ${state === "ready" && !hardExpired ? "opacity-100" : "opacity-0"}`}
          onLoad={() => {
            attempts.current = 0;
            setState("ready");
          }}
          onError={() => {
            attempts.current += 1;
            setState("error");
          }}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <span>
          {Number.isFinite(observedTime)
            ? `Image time ${new Date(observedTime).toLocaleString(undefined, { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}`
            : metadataFailed
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
          className="rounded text-cyan-300 underline decoration-cyan-300/30 underline-offset-2 hover:text-cyan-200"
        >
          View source at {product.provider}
        </a>
      </div>
    </div>
  );
}
