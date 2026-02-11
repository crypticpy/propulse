/**
 * QRCodeModal - Displays a QR code linking to the operator's profile.
 *
 * Two modes:
 *   - ProPulse profile (default): links to propulse.app/profile/{callsign}
 *   - QRZ.com lookup: links to qrz.com/db/{callsign}
 *
 * Generates a QR code data URL on mount / prop change via the `qrcode` package.
 * Handles loading, error, and success states gracefully.
 *
 * Enhancements:
 * - Fullscreen toggle for easy scanning at hamfests
 * - Brightness mode (white background) for bright environments
 * - Share button with Web Share API fallback to clipboard
 */

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DetailModal } from "@/components/ui/DetailModal";

export interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  callsign: string;
  grid?: string;
}

export function QRCodeModal({
  isOpen,
  onClose,
  callsign,
  grid,
}: QRCodeModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [brightDataUrl, setBrightDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [brightMode, setBrightMode] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [qrTarget, setQrTarget] = useState<"propulse" | "qrz">("propulse");

  const propulseUrl = `https://propulse.app/profile/${encodeURIComponent(callsign)}`;
  const qrzUrl = `https://www.qrz.com/db/${encodeURIComponent(callsign)}`;
  const activeUrl = qrTarget === "propulse" ? propulseUrl : qrzUrl;

  useEffect(() => {
    if (!isOpen || !callsign) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDataUrl(null);
    setBrightDataUrl(null);

    // Generate both dark and bright variants in parallel
    const darkPromise = QRCode.toDataURL(activeUrl, {
      errorCorrectionLevel: "H",
      color: { dark: "#f97316", light: "#0a0a0f" },
      width: 256,
      margin: 2,
    });

    const brightPromise = QRCode.toDataURL(activeUrl, {
      errorCorrectionLevel: "H",
      color: { dark: "#111111", light: "#ffffff" },
      width: 256,
      margin: 2,
    });

    Promise.all([darkPromise, brightPromise])
      .then(([darkUrl, brightUrl]) => {
        if (!cancelled) {
          setDataUrl(darkUrl);
          setBrightDataUrl(brightUrl);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to generate QR code",
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, callsign, activeUrl]);

  // Listen for fullscreen exit via Esc or browser controls
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not supported or blocked
    }
  }, []);

  const handleShare = useCallback(async () => {
    const title =
      qrTarget === "propulse"
        ? `${callsign} - ProPulse Profile`
        : `${callsign} - QRZ.com Profile`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url: activeUrl });
        return;
      }

      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(activeUrl);
      setShareStatus("Link copied!");
      setTimeout(() => setShareStatus(null), 2000);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(activeUrl);
          setShareStatus("Link copied!");
          setTimeout(() => setShareStatus(null), 2000);
        } catch {
          setShareStatus("Share failed");
          setTimeout(() => setShareStatus(null), 2000);
        }
      }
    }
  }, [callsign, activeUrl, qrTarget]);

  const activeDataUrl = brightMode ? brightDataUrl : dataUrl;

  // Refs for fullscreen focus management
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const exitBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the exit button when entering fullscreen
  useEffect(() => {
    if (isFullscreen && exitBtnRef.current) {
      exitBtnRef.current.focus();
    }
  }, [isFullscreen]);

  // Tab-trap handler for fullscreen overlay
  const handleFullscreenKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      const container = fullscreenRef.current;
      if (!container) return;

      const focusable = container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [],
  );

  // Fullscreen overlay — renders outside the modal when active
  if (isFullscreen && activeDataUrl) {
    return (
      <div
        ref={fullscreenRef}
        tabIndex={-1}
        onKeyDown={handleFullscreenKeyDown}
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
      >
        {/* Large QR code on white for maximum contrast */}
        <img
          src={brightDataUrl ?? activeDataUrl}
          alt={`QR code for ${callsign}`}
          className="w-[80vmin] h-[80vmin] max-w-[512px] max-h-[512px]"
        />
        <p className="mt-4 text-3xl font-mono font-bold text-gray-900">
          {callsign}
        </p>
        {grid && <p className="mt-1 text-lg font-mono text-gray-500">{grid}</p>}
        <button
          ref={exitBtnRef}
          onClick={toggleFullscreen}
          className="mt-6 px-6 py-2 text-sm rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
        >
          Exit Fullscreen
        </button>
      </div>
    );
  }

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Station QR Code"
      subtitle="Share your operator profile"
      size="md"
    >
      <div className="flex flex-col items-center gap-4 py-4">
        {/* QR Code area */}
        {loading && (
          <div className="w-[256px] h-[256px] rounded-lg bg-panel/30 border border-white/5 animate-pulse motion-reduce:animate-none" />
        )}

        {error && (
          <div className="w-[256px] h-[256px] rounded-lg bg-panel/30 border border-white/5 flex items-center justify-center p-4">
            <p className="text-sm text-alert-red text-center">{error}</p>
          </div>
        )}

        {activeDataUrl && !loading && !error && (
          <div
            className={`rounded-lg border p-2 transition-colors ${
              brightMode
                ? "bg-white border-gray-200"
                : "bg-transparent border-white/5"
            }`}
          >
            <img
              src={activeDataUrl}
              alt={`QR code for ${callsign}`}
              width={256}
              height={256}
              className="rounded"
            />
          </div>
        )}

        {/* Callsign */}
        <p className="text-2xl font-mono font-bold text-plasma-orange">
          {callsign}
        </p>

        {/* Grid locator */}
        {grid && <p className="text-sm font-mono text-gray-400">{grid}</p>}

        {/* Description */}
        <p className="text-sm text-gray-400 text-center">
          {qrTarget === "propulse"
            ? "Scan to view ProPulse profile"
            : "Scan to look up on QRZ.com"}
        </p>

        {/* Target toggle: ProPulse vs QRZ */}
        <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg border border-white/5">
          <button
            onClick={() => setQrTarget("propulse")}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none ${
              qrTarget === "propulse"
                ? "bg-plasma-orange/15 text-plasma-orange font-medium"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            ProPulse
          </button>
          <button
            onClick={() => setQrTarget("qrz")}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none ${
              qrTarget === "qrz"
                ? "bg-plasma-orange/15 text-plasma-orange font-medium"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            QRZ.com
          </button>
        </div>

        {/* Toggle row: Brightness + Fullscreen */}
        <div className="flex gap-2">
          {/* Brightness mode toggle */}
          <button
            onClick={() => setBrightMode((b) => !b)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none ${
              brightMode
                ? "border-plasma-orange bg-plasma-orange/10 text-plasma-orange"
                : "border-white/10 bg-white/5 text-gray-400 hover:text-white hover:border-white/20"
            }`}
            title="Toggle white background for easier scanning"
          >
            {/* Sun icon */}
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
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            Bright
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:border-white/20 transition-colors flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
            title="Fullscreen mode for easy scanning"
          >
            {/* Expand icon */}
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
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
            Fullscreen
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 w-full max-w-xs">
          {/* Share button */}
          <button
            onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
          >
            {/* Share icon */}
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
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            Share
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
          >
            Close
          </button>
        </div>

        {/* Share status toast */}
        {shareStatus && (
          <p className="text-xs text-signal-green animate-pulse motion-reduce:animate-none">
            {shareStatus}
          </p>
        )}
      </div>
    </DetailModal>
  );
}
