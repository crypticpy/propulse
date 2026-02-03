import React, { useState, useEffect, useRef, useCallback } from "react";

export interface AnimationFrame {
  url: string;
  time_tag: string;
}

export interface AnimatedImagePlayerProps {
  /** Static thumbnail image URL (shown before playing) */
  thumbnailUrl: string;
  /** URL to the JSON animation manifest */
  animationJsonUrl: string;
  /** Base URL prefix for frame URLs (frames have relative paths) */
  baseUrl?: string;
  /** Alt text for accessibility */
  alt: string;
  /** Caption below the image */
  caption?: string;
  /** Playback speed in frames per second (default: 10) */
  defaultFps?: number;
  /** Whether to loop the animation (default: true) */
  loop?: boolean;
  /** Callback when clicked in thumbnail mode (for modal expansion) */
  onExpand?: () => void;
  /** Additional CSS classes */
  className?: string;
}

type PlayerState = "thumbnail" | "loading" | "playing" | "paused" | "error";

/**
 * AnimatedImagePlayer Component
 *
 * Displays a static thumbnail with a play button overlay.
 * On play, fetches the animation JSON and plays through frames.
 * Includes playback controls, speed adjustment, and timeline scrubber.
 *
 * Handles edge cases:
 * - Slow connections: Shows loading progress
 * - Large files: Preloads frames ahead of playback
 * - Mobile: Touch-friendly controls, no autoplay
 * - Errors: Graceful fallback to static image
 */
export const AnimatedImagePlayer: React.FC<AnimatedImagePlayerProps> = ({
  thumbnailUrl,
  animationJsonUrl,
  baseUrl = "https://services.swpc.noaa.gov",
  alt,
  caption,
  defaultFps = 10,
  loop = true,
  onExpand,
  className = "",
}) => {
  const [state, setState] = useState<PlayerState>("thumbnail");
  const [frames, setFrames] = useState<AnimationFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [fps, setFps] = useState(defaultFps);
  const [loadProgress, setLoadProgress] = useState(0);
  const [preloadedFrames, setPreloadedFrames] = useState<Set<number>>(
    new Set(),
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Preload buffer size (frames ahead of current position)
  const PRELOAD_BUFFER = 20;

  // Fetch animation manifest
  const loadAnimation = useCallback(async () => {
    setState("loading");
    setLoadProgress(0);
    setErrorMessage("");

    try {
      const response = await fetch(animationJsonUrl);
      if (!response.ok) {
        throw new Error(`Failed to load animation: ${response.status}`);
      }

      const data: AnimationFrame[] = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Invalid animation data");
      }

      setFrames(data);
      setLoadProgress(10);

      // Preload first few frames before starting
      await preloadFrames(data, 0, Math.min(PRELOAD_BUFFER, data.length));
      setLoadProgress(100);

      setState("playing");
      setCurrentFrameIndex(0);
    } catch (err) {
      console.error("Animation load error:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load animation",
      );
      setState("error");
    }
  }, [animationJsonUrl]);

  // Preload a range of frames
  const preloadFrames = useCallback(
    async (frameList: AnimationFrame[], start: number, count: number) => {
      const promises: Promise<void>[] = [];
      const newPreloaded = new Set(preloadedFrames);

      for (let i = start; i < Math.min(start + count, frameList.length); i++) {
        if (newPreloaded.has(i)) continue;

        const frame = frameList[i];
        const fullUrl = frame.url.startsWith("http")
          ? frame.url
          : `${baseUrl}${frame.url}`;

        if (!imageCache.current.has(fullUrl)) {
          promises.push(
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                imageCache.current.set(fullUrl, img);
                newPreloaded.add(i);
                resolve();
              };
              img.onerror = () => {
                // Still mark as "preloaded" to avoid retrying
                newPreloaded.add(i);
                resolve();
              };
              img.src = fullUrl;
            }),
          );
        } else {
          newPreloaded.add(i);
        }
      }

      await Promise.all(promises);
      setPreloadedFrames(newPreloaded);
    },
    [baseUrl, preloadedFrames],
  );

  // Animation loop
  useEffect(() => {
    if (state !== "playing" || frames.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameDuration = 1000 / fps;

    const animate = (timestamp: number) => {
      if (timestamp - lastFrameTimeRef.current >= frameDuration) {
        lastFrameTimeRef.current = timestamp;

        setCurrentFrameIndex((prev) => {
          const next = prev + 1;
          if (next >= frames.length) {
            if (loop) {
              return 0;
            } else {
              setState("paused");
              return prev;
            }
          }

          // Preload ahead
          if (next % 5 === 0) {
            preloadFrames(frames, next, PRELOAD_BUFFER);
          }

          return next;
        });
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state, frames, fps, loop, preloadFrames]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      imageCache.current.clear();
    };
  }, []);

  // Get current frame URL
  const currentFrame = frames[currentFrameIndex];
  const currentFrameUrl = currentFrame
    ? currentFrame.url.startsWith("http")
      ? currentFrame.url
      : `${baseUrl}${currentFrame.url}`
    : thumbnailUrl;

  // Format timestamp for display
  const formatTimestamp = (timeTag: string) => {
    try {
      const date = new Date(timeTag);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return "";
    }
  };

  // Handle play/pause toggle
  const togglePlayback = () => {
    if (state === "thumbnail" || state === "error") {
      loadAnimation();
    } else if (state === "playing") {
      setState("paused");
    } else if (state === "paused") {
      setState("playing");
    }
  };

  // Handle timeline scrub
  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    setCurrentFrameIndex(newIndex);
    preloadFrames(frames, newIndex, PRELOAD_BUFFER);
  };

  // Speed controls
  const speeds = [5, 10, 20, 30];
  const cycleSpeed = () => {
    const currentIndex = speeds.indexOf(fps);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setFps(speeds[nextIndex]);
  };

  // Reset to thumbnail
  const resetPlayer = () => {
    setState("thumbnail");
    setFrames([]);
    setCurrentFrameIndex(0);
    setPreloadedFrames(new Set());
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  return (
    <figure className={`group ${className}`}>
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
        {/* Main image/animation display */}
        <img
          src={
            state === "thumbnail" || state === "loading"
              ? thumbnailUrl
              : currentFrameUrl
          }
          alt={alt}
          className="w-full h-auto"
          loading="lazy"
        />

        {/* Thumbnail overlay - play button */}
        {state === "thumbnail" && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer transition-all duration-200 hover:bg-black/40"
            onClick={togglePlayback}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && togglePlayback()}
            aria-label="Play animation"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center transition-transform hover:scale-110">
                <svg
                  className="w-7 h-7 text-white ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <span className="text-xs text-white/80 font-medium">
                Play Animation
              </span>
            </div>
            {/* Expand button */}
            {onExpand && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand();
                }}
                className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white/70 hover:text-white transition-all"
                aria-label="Expand image"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Loading overlay */}
        {state === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-12 h-12 border-3 border-white/20 border-t-plasma-orange rounded-full animate-spin" />
            <div className="mt-3 text-sm text-white/80">
              Loading animation...
            </div>
            <div className="mt-2 w-32 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-plasma-orange transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error overlay */}
        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <svg
              className="w-10 h-10 text-alert-red"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="mt-2 text-sm text-white/80">{errorMessage}</div>
            <button
              onClick={resetPlayer}
              className="mt-3 px-4 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Playback controls (when playing or paused) */}
        {(state === "playing" || state === "paused") && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-3 pt-8">
            {/* Timeline scrubber */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-white/60 font-mono w-10">
                {currentFrameIndex + 1}/{frames.length}
              </span>
              <input
                type="range"
                min="0"
                max={frames.length - 1}
                value={currentFrameIndex}
                onChange={handleTimelineChange}
                className="flex-1 h-1 bg-white/20 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:bg-plasma-orange [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
              />
              <span className="text-xs text-white/60 font-mono min-w-[80px] text-right">
                {currentFrame ? formatTimestamp(currentFrame.time_tag) : ""}
              </span>
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Play/Pause */}
                <button
                  onClick={togglePlayback}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                  aria-label={state === "playing" ? "Pause" : "Play"}
                >
                  {state === "playing" ? (
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* Stop/Reset */}
                <button
                  onClick={resetPlayer}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                  aria-label="Stop"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 6h12v12H6z" />
                  </svg>
                </button>

                {/* Speed control */}
                <button
                  onClick={cycleSpeed}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs font-mono transition-colors min-w-[50px]"
                  aria-label="Change speed"
                >
                  {fps} fps
                </button>
              </div>

              {/* Expand button */}
              {onExpand && (
                <button
                  onClick={onExpand}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                  aria-label="Expand"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Caption */}
      {caption && (
        <figcaption className="text-xs text-gray-500 mt-2 text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
};

AnimatedImagePlayer.displayName = "AnimatedImagePlayer";

export default AnimatedImagePlayer;
