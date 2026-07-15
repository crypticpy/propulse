import { useCallback, useEffect, useRef, useState } from "react";
import {
  SOLAR_IMAGE_PRODUCTS,
  type SolarImageProductId,
} from "@/lib/solar/mediaProducts";

interface ImageMetadata {
  observedAt: string | null;
  checkedAt: string;
}

type ImageState = "loading" | "fresh" | "stale" | "error" | "retrying";
type MetadataState = "loading" | "ready" | "error";

function ageLabel(timestamp: string): string {
  const age = Math.max(0, Date.now() - Date.parse(timestamp));
  if (age < 60_000) return "under a minute ago";
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
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [metadataState, setMetadataState] = useState<MetadataState>("loading");
  const [now, setNow] = useState(() => Date.now());
  const attempt = useRef(0);
  const imageUrl = `/api/solar/image?product=${encodeURIComponent(productId)}`;

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
    const controller = new AbortController();
    setMetadataState("loading");
    fetch(`/api/solar/image-meta?product=${encodeURIComponent(productId)}`, {
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
      .then((value) => {
        setMetadata(value);
        setMetadataState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setMetadataState("error");
      });
    return () => controller.abort();
  }, [metadataRetryKey, productId]);

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
        (metadataState === "error" ||
          (metadataState === "ready" && timestamp === null))
      ? "partial"
    : state === "fresh" && metadataStale
      ? "stale"
      : state;
  const usableImage = state === "fresh" && !hardExpired;

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
      <div className="relative aspect-[4/3] bg-black/30">
        {(state === "loading" || state === "retrying") && (
          <div className="absolute inset-0 flex items-center justify-center" role="status">
            <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-slate-300">
              {state === "retrying" ? "Retrying image…" : "Loading image…"}
            </span>
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-slate-200">Image temporarily unavailable</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Automatic recovery is active.</p>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-slate-200">Image is too old to use</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              The last published image passed this product’s usability limit.
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
          key={retryKey}
          src={imageUrl}
          alt={product.alt}
          loading="lazy"
          decoding="async"
          className={`pointer-events-none h-full w-full object-contain transition-opacity motion-reduce:transition-none ${usableImage ? "opacity-100" : "opacity-0"}`}
          onLoad={() => {
            attempt.current = 0;
            setState("fresh");
          }}
          onError={() => {
            attempt.current += 1;
            setState("error");
          }}
        />
        <span
          className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider backdrop-blur ${
            visibleState === "fresh"
              ? "border-emerald-300/30 bg-emerald-950/80 text-emerald-200"
              : visibleState === "stale" || visibleState === "partial"
                ? "border-amber-300/30 bg-amber-950/80 text-amber-200"
                : "border-slate-300/20 bg-black/70 text-slate-300"
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
            <h3 className="font-semibold text-white">{product.title}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">{product.description}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpen(productId, false)}
            disabled={state === "error" || hardExpired}
            className="min-h-11 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Enlarge
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3 text-xs text-slate-500">
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
                className="min-h-11 rounded-lg px-2 text-cyan-300 hover:bg-white/5 hover:text-cyan-200 disabled:cursor-not-allowed disabled:text-slate-600"
              >
                Play timeline
              </button>
            )}
            <a href={product.sourceUrl} target="_blank" rel="noreferrer" className="rounded underline decoration-white/20 underline-offset-2 hover:text-slate-300">
              {product.provider}
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}
