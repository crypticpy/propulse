import React, { useState, useEffect, useRef, useCallback } from "react";

export interface AnimationFrame {
  url: string;
  time_tag: string;
}

export interface AnimationModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Thumbnail/static image URL (shown while loading or if no animation) */
  thumbnailUrl: string;
  /** Optional animation JSON URL - if provided, enables animation playback */
  animationJsonUrl?: string;
  /** Base URL for frame URLs (frames often have relative paths) */
  baseUrl?: string;
  /** Alt text for the image */
  alt: string;
  /** Title displayed in the modal header */
  title: string;
  /** Caption/description below the image */
  caption?: string;
  /** External source URL (opens in new tab) */
  sourceUrl?: string;
  /** Label for the source link */
  sourceLabel?: string;
  /** Default playback speed in FPS */
  defaultFps?: number;
}

type PlayerState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "error";

/**
 * AnimationModal Component
 *
 * A modal for displaying NOAA/SWPC images with optional frame animation.
 * Opens immediately with thumbnail, then loads animation data if available.
 *
 * Edge cases handled:
 * - Slow connections: Shows loading progress
 * - Failed animation load: Falls back to static thumbnail
 * - No animation URL: Shows static image
 * - Mobile/desktop: Touch-friendly controls
 */
export const AnimationModal: React.FC<AnimationModalProps> = ({
  isOpen,
  onClose,
  thumbnailUrl,
  animationJsonUrl,
  baseUrl = "https://services.swpc.noaa.gov",
  alt,
  title,
  caption,
  sourceUrl,
  sourceLabel = "View at NOAA",
  defaultFps = 10,
}) => {
  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const [frames, setFrames] = useState<AnimationFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [fps, setFps] = useState(defaultFps);
  const [loadProgress, setLoadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [preloadedFrames, setPreloadedFrames] = useState<Set<number>>(
    new Set(),
  );

  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const PRELOAD_BUFFER = 30;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Clean up on close
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setPlayerState("idle");
      setFrames([]);
      setCurrentFrameIndex(0);
      setPreloadedFrames(new Set());
      setLoadProgress(0);
      setErrorMessage("");
    }
  }, [isOpen]);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === " " && animationJsonUrl) {
        e.preventDefault();
        togglePlayback();
      }
    },
    [onClose, animationJsonUrl],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  // Preload frames
  const preloadFrames = useCallback(
    async (frameList: AnimationFrame[], start: number, count: number) => {
      const promises: Promise<void>[] = [];
      const newPreloaded = new Set(preloadedFrames);

      for (let i = start; i < Math.min(start + count, frameList.length); i++) {
        if (newPreloaded.has(i)) {
          continue;
        }

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

  // Load animation data
  const loadAnimation = useCallback(async () => {
    if (!animationJsonUrl) {
      return;
    }

    setPlayerState("loading");
    setLoadProgress(0);
    setErrorMessage("");

    try {
      const response = await fetch(animationJsonUrl);
      if (!response.ok) {
        throw new Error(`Failed to load: ${response.status}`);
      }

      const data: AnimationFrame[] = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Invalid animation data");
      }

      setFrames(data);
      setLoadProgress(20);

      // Preload first batch of frames
      await preloadFrames(data, 0, Math.min(PRELOAD_BUFFER, data.length));
      setLoadProgress(100);

      setPlayerState("ready");
    } catch (err) {
      console.error("Animation load error:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load animation",
      );
      setPlayerState("error");
    }
  }, [animationJsonUrl, preloadFrames]);

  // Animation loop
  useEffect(() => {
    if (playerState !== "playing" || frames.length === 0) {
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
            return 0; // Loop
          }

          // Preload ahead periodically
          if (next % 10 === 0) {
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
  }, [playerState, frames, fps, preloadFrames]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      imageCache.current.clear();
    };
  }, []);

  // Get current display URL
  const currentFrame = frames[currentFrameIndex];
  const displayUrl =
    playerState === "playing" || playerState === "paused"
      ? currentFrame
        ? currentFrame.url.startsWith("http")
          ? currentFrame.url
          : `${baseUrl}${currentFrame.url}`
        : thumbnailUrl
      : thumbnailUrl;

  // Format timestamp
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

  // Toggle playback
  const togglePlayback = () => {
    if (playerState === "idle" && animationJsonUrl) {
      loadAnimation();
    } else if (playerState === "ready" || playerState === "paused") {
      setPlayerState("playing");
    } else if (playerState === "playing") {
      setPlayerState("paused");
    } else if (playerState === "error") {
      // Retry
      loadAnimation();
    }
  };

  // Handle timeline scrub
  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    setCurrentFrameIndex(newIndex);
    preloadFrames(frames, newIndex, PRELOAD_BUFFER);
  };

  // Speed controls
  const speeds = [5, 10, 15, 20];
  const cycleSpeed = () => {
    const currentIndex = speeds.indexOf(fps);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setFps(speeds[nextIndex]);
  };

  // Stop animation
  const stopAnimation = () => {
    setPlayerState("ready");
    setCurrentFrameIndex(0);
  };

  if (!isOpen) {
    return null;
  }

  const hasAnimation = !!animationJsonUrl;
  const isAnimating = playerState === "playing" || playerState === "paused";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="animation-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-md animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div className="relative z-10 w-full max-w-5xl max-h-[95vh] flex flex-col bg-gradient-to-br from-[#0a0a18] to-[#12121f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
          <h2
            id="animation-modal-title"
            className="font-sans text-lg font-semibold text-white tracking-wide"
          >
            {title}
          </h2>
          <div className="flex items-center gap-3">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-plasma-orange hover:text-white bg-plasma-orange/10 hover:bg-plasma-orange/20 border border-plasma-orange/30 rounded-lg transition-all duration-200"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                {sourceLabel}
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Image/Animation container */}
        <div className="flex-1 relative overflow-hidden bg-black/40 flex items-center justify-center min-h-[300px]">
          <img
            src={displayUrl}
            alt={alt}
            className="max-w-full max-h-[calc(95vh-14rem)] w-auto h-auto object-contain"
            loading="eager"
          />

          {/* Loading overlay */}
          {playerState === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="w-12 h-12 border-3 border-white/20 border-t-plasma-orange rounded-full animate-spin" />
              <div className="mt-4 text-sm text-white/80">
                Loading animation frames...
              </div>
              <div className="mt-3 w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-plasma-orange transition-all duration-300"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-white/50">
                {loadProgress < 20
                  ? "Fetching manifest..."
                  : "Preloading frames..."}
              </div>
            </div>
          )}

          {/* Error overlay */}
          {playerState === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
              <svg
                className="w-12 h-12 text-alert-red"
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
              <div className="mt-3 text-sm text-white/80">{errorMessage}</div>
              <div className="mt-1 text-xs text-white/50">
                Static image is shown instead
              </div>
              <button
                onClick={togglePlayback}
                className="mt-4 px-4 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Play button overlay for animation (when idle or ready) */}
          {hasAnimation &&
            (playerState === "idle" || playerState === "ready") && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer transition-all hover:bg-black/40"
                onClick={togglePlayback}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && togglePlayback()}
                aria-label="Play animation"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center transition-transform hover:scale-110">
                    <svg
                      className="w-8 h-8 text-white ml-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <span className="text-sm text-white/90 font-medium">
                    {playerState === "ready"
                      ? "Play Animation"
                      : "Load Animation"}
                  </span>
                  {playerState === "idle" && (
                    <span className="text-xs text-white/50">
                      Press Space or click to start
                    </span>
                  )}
                </div>
              </div>
            )}
        </div>

        {/* Playback controls (when animating) */}
        {isAnimating && frames.length > 0 && (
          <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02]">
            {/* Timeline */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs text-white/60 font-mono w-16">
                {currentFrameIndex + 1} / {frames.length}
              </span>
              <input
                type="range"
                min="0"
                max={frames.length - 1}
                value={currentFrameIndex}
                onChange={handleTimelineChange}
                className="flex-1 h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:bg-plasma-orange [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg
                  [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
              />
              <span className="text-xs text-white/60 font-mono min-w-[100px] text-right">
                {currentFrame ? formatTimestamp(currentFrame.time_tag) : ""}
              </span>
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Play/Pause */}
                <button
                  onClick={togglePlayback}
                  className="p-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                  aria-label={playerState === "playing" ? "Pause" : "Play"}
                >
                  {playerState === "playing" ? (
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

                {/* Stop */}
                <button
                  onClick={stopAnimation}
                  className="p-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
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

                {/* Speed */}
                <button
                  onClick={cycleSpeed}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm font-mono transition-colors min-w-[60px]"
                  aria-label="Change speed"
                >
                  {fps} fps
                </button>
              </div>

              <div className="text-xs text-white/40">Space to play/pause</div>
            </div>
          </div>
        )}

        {/* Caption footer */}
        {caption && !isAnimating && (
          <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02]">
            <p className="text-sm text-gray-400 text-center">{caption}</p>
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.25s ease-out;
        }
      `}</style>
    </div>
  );
};

AnimationModal.displayName = "AnimationModal";

export default AnimationModal;
