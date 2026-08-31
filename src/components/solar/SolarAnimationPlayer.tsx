import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SOLAR_IMAGE_PRODUCTS,
  solarImageUrl,
  type SolarAnimationProductId,
  type SolarImageProductId,
} from "@/lib/solar/mediaProducts";
import { useRetainedSolarImage } from "./useRetainedSolarImage";

interface AnimationFrame {
  url: string;
  time_tag: string;
}

const CACHE_LIMIT = 12;
const PRELOAD_RADIUS = 3;

export function SolarAnimationPlayer({
  animationId,
  thumbnailProductId,
  alt,
}: {
  animationId: SolarAnimationProductId;
  thumbnailProductId: SolarImageProductId;
  alt: string;
}) {
  const [frames, setFrames] = useState<AnimationFrame[]>([]);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "playing" | "paused" | "error">("loading");
  const [message, setMessage] = useState("");
  const [manifestRetry, setManifestRetry] = useState(0);
  const [frameRetry, setFrameRetry] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cache = useRef(new Map<string, HTMLImageElement>());
  const frameFailures = useRef(new Map<string, number>());
  const frameRetryTimer = useRef<number | null>(null);
  const framesRef = useRef(frames);
  const indexRef = useRef(index);
  framesRef.current = frames;
  indexRef.current = index;
  const thumbnailProduct = SOLAR_IMAGE_PRODUCTS[thumbnailProductId];
  const thumbnail = solarImageUrl(thumbnailProductId, now, frameRetry);
  const refreshBucket = Math.floor(
    now / (thumbnailProduct.softTtlSeconds * 1_000),
  );
  // The edge manifest deliberately permits stale-while-revalidate. Give each
  // publication window its own CDN key so this mounted player receives the
  // newly revalidated timeline instead of remaining one cadence behind.
  const manifestUrl = `/api/solar/animation?product=${encodeURIComponent(animationId)}&refresh=${refreshBucket}-${manifestRetry}`;

  const retryManifest = useCallback(() => {
    setManifestRetry((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | null = null;
    // Cadence refreshes are background revalidations once a usable timeline
    // exists. Do not reuse the initial-load UI transitions here: doing so
    // pauses active playback every publication window and lets a transient
    // manifest failure replace healthy frames with the error presentation.
    const isBackgroundRefresh = framesRef.current.length > 0;
    if (!isBackgroundRefresh) {
      setState("loading");
      setMessage("");
    }
    fetch(manifestUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Timeline returned HTTP ${response.status}`);
        return (await response.json()) as { frames?: AnimationFrame[] };
      })
      .then((value) => {
        if (!Array.isArray(value.frames) || value.frames.length === 0) {
          throw new Error("Timeline contains no usable frames");
        }
        const currentUrl = framesRef.current[indexRef.current]?.url;
        const matchingIndex = currentUrl
          ? value.frames.findIndex((frame) => frame.url === currentUrl)
          : -1;
        const nextIndex =
          matchingIndex >= 0
            ? matchingIndex
            : isBackgroundRefresh
              ? Math.min(indexRef.current, value.frames.length - 1)
              : value.frames.length - 1;
        setFrames(value.frames);
        setIndex(nextIndex);
        if (!isBackgroundRefresh) setState("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (!isBackgroundRefresh) {
          setMessage(error instanceof Error ? error.message : "Timeline unavailable");
          setState("error");
        }
        if (manifestRetry < 3) {
          retryTimer = window.setTimeout(
            retryManifest,
            Math.min(12_000, 1_500 * 2 ** manifestRetry),
          );
        }
      });
    return () => {
      controller.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [manifestRetry, manifestUrl, retryManifest]);

  useEffect(() => {
    // Keep both the static fallback and the animation manifest moving while
    // this player stays mounted. The cadence bucket prevents needless URL
    // churn between provider publication windows.
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const imageCache = cache.current;
    return () => {
      imageCache.clear();
      if (frameRetryTimer.current !== null) {
        window.clearTimeout(frameRetryTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (frames.length === 0) return;
    const indexes = Array.from({ length: PRELOAD_RADIUS * 2 + 1 }, (_, offset) =>
      (index - PRELOAD_RADIUS + offset + frames.length) % frames.length,
    );
    let cancelled = false;
    const pendingImages: HTMLImageElement[] = [];
    void Promise.all(
      indexes.slice(0, 6).map(
        (frameIndex) =>
          new Promise<void>((resolve) => {
            const frame = frames[frameIndex];
            if (!frame || imageCacheHas(cache.current, frame.url)) {
              resolve();
              return;
            }
            const image = new Image();
            pendingImages.push(image);
            image.onload = () => {
              if (!cancelled) {
                cache.current.set(frame.url, image);
                while (cache.current.size > CACHE_LIMIT) {
                  const oldest = cache.current.keys().next().value as string | undefined;
                  if (!oldest) break;
                  cache.current.delete(oldest);
                }
              }
              resolve();
            };
            image.onerror = () => resolve();
            image.src = frame.url;
          }),
      ),
    );
    return () => {
      cancelled = true;
      for (const image of pendingImages) {
        image.onload = null;
        image.onerror = null;
        image.src = "";
      }
    };
  }, [frames, index]);

  useEffect(() => {
    if (state !== "playing" || frames.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((value) => (value + 1) % frames.length);
    }, 400);
    return () => window.clearInterval(timer);
  }, [frames.length, state]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setState((current) => (current === "playing" ? "paused" : current));
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  const current = frames[index];
  const currentUrl = current?.url ?? thumbnail;
  // Timeline frames already preload around the playhead, but the static
  // fallback has a cadence-keyed URL and can encounter the same cross-bucket
  // stale-if-error gap as the image cards. Use the retention gate for both so
  // neither a failed fallback refresh nor a failed next frame blanks the last
  // successfully decoded image.
  const retainedImage = useRetainedSolarImage(
    `${animationId}:${thumbnailProductId}`,
    currentUrl,
    frameRetry,
    thumbnailProduct.hardTtlSeconds * 1_000,
  );
  const timestamp = useMemo(
    () => (current ? new Date(current.time_tag).toLocaleString(undefined, {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }) : "Static fallback"),
    [current],
  );

  return (
    <div>
      <div className="relative flex min-h-72 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <img
          key={
            retainedImage.hasLoadedImage
              ? retainedImage.visibleUrl ?? "loaded-solar-image"
              : `${retainedImage.visibleUrl ?? "missing-solar-image"}-${frameRetry}`
          }
          src={retainedImage.visibleUrl ?? undefined}
          alt={alt}
          className="max-h-[65dvh] w-full object-contain"
          onError={() => {
            retainedImage.handleVisibleError();
            setState("paused");
            setMessage("This frame did not load. The timeline is paused for retry.");
            const failedUrl = retainedImage.visibleUrl ?? currentUrl;
            const failures = (frameFailures.current.get(failedUrl) ?? 0) + 1;
            frameFailures.current.set(failedUrl, failures);
            if (failures <= 3) {
              if (frameRetryTimer.current !== null) {
                window.clearTimeout(frameRetryTimer.current);
              }
              frameRetryTimer.current = window.setTimeout(() => {
                setFrameRetry((value) => value + 1);
              }, Math.min(12_000, 1_500 * 2 ** (failures - 1)));
            }
          }}
          onLoad={() => {
            retainedImage.handleVisibleLoad();
            frameFailures.current.delete(retainedImage.visibleUrl ?? currentUrl);
            if (frameRetryTimer.current !== null) {
              window.clearTimeout(frameRetryTimer.current);
              frameRetryTimer.current = null;
            }
            if (current) setMessage("");
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
              frameFailures.current.delete(currentUrl);
              if (frameRetryTimer.current !== null) {
                window.clearTimeout(frameRetryTimer.current);
                frameRetryTimer.current = null;
              }
              if (current) setMessage("");
            }}
            onError={() => {
              // Keep the decoded fallback/frame visible, but preserve the
              // player's bounded retry and pause behavior for the failed URL.
              retainedImage.handleProbeError();
              setState("paused");
              setMessage("This frame did not load. The timeline is paused for retry.");
              const failures = (frameFailures.current.get(currentUrl) ?? 0) + 1;
              frameFailures.current.set(currentUrl, failures);
              if (failures <= 3) {
                if (frameRetryTimer.current !== null) {
                  window.clearTimeout(frameRetryTimer.current);
                }
                frameRetryTimer.current = window.setTimeout(() => {
                  setFrameRetry((value) => value + 1);
                }, Math.min(12_000, 1_500 * 2 ** (failures - 1)));
              }
            }}
          />
        )}
        {state === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-slate-200" role="status">
            Loading timeline manifest…
          </div>
        )}
        {state === "error" && (
          <div className="absolute inset-x-4 bottom-4 rounded-xl border border-amber-300/20 bg-black/85 p-4 text-center">
            <p className="text-sm text-amber-100">{message}</p>
            <p className="mt-1 text-xs text-slate-400">The current static product remains available.</p>
            <button type="button" onClick={retryManifest} className="mt-3 min-h-11 rounded-xl border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15">
              Retry timeline
            </button>
          </div>
        )}
      </div>

      {frames.length > 0 && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-sm text-white">{timestamp}</p>
              <p className="mt-1 text-xs text-slate-500">Frame {index + 1} of {frames.length}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setState((currentState) => currentState === "playing" ? "paused" : "playing")}
                className="min-h-11 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15"
              >
                {state === "playing" ? "Pause" : "Play"}
              </button>
              {message && (
                <button
                  type="button"
                  onClick={() => {
                    setMessage("");
                    setFrameRetry((value) => value + 1);
                  }}
                  className="min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-slate-200 hover:bg-white/10"
                >
                  Retry frame
                </button>
              )}
            </div>
          </div>
          <label className="mt-4 block text-xs font-medium text-slate-400" htmlFor={`solar-timeline-${animationId}`}>
            Timeline position
          </label>
          <input
            id={`solar-timeline-${animationId}`}
            type="range"
            min="0"
            max={Math.max(0, frames.length - 1)}
            value={index}
            onChange={(event) => {
              setIndex(Number(event.target.value));
              setState("paused");
            }}
            className="mt-2 min-h-11 w-full accent-cyan-300"
            aria-valuetext={timestamp}
          />
          {message && <p className="mt-2 text-xs text-amber-200" role="status">{message}</p>}
        </div>
      )}
    </div>
  );
}

function imageCacheHas(cache: Map<string, HTMLImageElement>, url: string): boolean {
  return cache.has(url);
}
