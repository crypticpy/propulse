/**
 * QRCodeModal - Displays a QR code linking to the operator's QRZ.com profile.
 *
 * Generates a QR code data URL on mount / prop change via the `qrcode` package.
 * Handles loading, error, and success states gracefully.
 *
 * Enhancements:
 * - Fullscreen toggle for easy scanning at hamfests
 * - Brightness mode (white background) for bright environments
 * - Share button with Web Share API fallback to clipboard
 */

import { useCallback, useEffect, useState } from "react";
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

  const qrzUrl = `https://www.qrz.com/db/${encodeURIComponent(callsign)}`;

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
    const darkPromise = QRCode.toDataURL(qrzUrl, {
      errorCorrectionLevel: "H",
      color: { dark: "#f97316", light: "#0a0a0f" },
      width: 256,
      margin: 2,
    });

    const brightPromise = QRCode.toDataURL(qrzUrl, {
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
  }, [isOpen, callsign, qrzUrl]);

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
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${callsign} - QRZ.com Profile`,
          url: qrzUrl,
        });
        return;
      }

      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(qrzUrl);
      setShareStatus("Link copied!");
      setTimeout(() => setShareStatus(null), 2000);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        // Try clipboard as final fallback
        try {
          await navigator.clipboard.writeText(qrzUrl);
          setShareStatus("Link copied!");
          setTimeout(() => setShareStatus(null), 2000);
        } catch {
          setShareStatus("Share failed");
          setTimeout(() => setShareStatus(null), 2000);
        }
      }
    }
  }, [callsign, qrzUrl]);

  const activeDataUrl = brightMode ? brightDataUrl : dataUrl;

  // Fullscreen overlay — renders outside the modal when active
  if (isFullscreen && activeDataUrl) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
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
          onClick={toggleFullscreen}
          className="mt-6 px-6 py-2 text-sm rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
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
      subtitle="Share your QRZ.com profile"
      size="md"
    >
      <div className="flex flex-col items-center gap-4 py-4">
        {/* QR Code area */}
        {loading && (
          <div className="w-[256px] h-[256px] rounded-lg bg-panel/30 border border-white/5 animate-pulse" />
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
          Scan to look up on QRZ.com
        </p>

        {/* Toggle row: Brightness + Fullscreen */}
        <div className="flex gap-2">
          {/* Brightness mode toggle */}
          <button
            onClick={() => setBrightMode((b) => !b)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1.5 ${
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
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:border-white/20 transition-colors flex items-center gap-1.5"
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
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
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
            className="flex-1 px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Share status toast */}
        {shareStatus && (
          <p className="text-xs text-signal-green animate-pulse">
            {shareStatus}
          </p>
        )}
      </div>
    </DetailModal>
  );
}
