/**
 * ShareCard - Profile card generator with template selection, live preview,
 * download, and sharing via Web Share API.
 *
 * Pulls card data from profileStore, useLogbookStats, and useAwardProgress
 * to populate the rendered card.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useAwardProgress } from "@/hooks/useAwardProgress";
import {
  renderProfileCard,
  renderProfileCardPreview,
  CARD_TEMPLATES,
  type CardData,
  type CardTemplate,
} from "@/lib/profile/cardRenderer";

export function ShareCard() {
  const station = useProfileStore((s) => s.station);
  const license = useProfileStore((s) => s.license);
  const requireAuth = useRequireAuth();
  const { totalQSOs } = useLogbookStats();
  const { dxccWorkedCount } = useAwardProgress();

  const [template, setTemplate] = useState<CardTemplate>("minimalist");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Track the previous object URL so we can revoke it
  const prevUrlRef = useRef<string | null>(null);

  const cardData: CardData = {
    callsign: station?.callsign ?? "N0CALL",
    operatorName: station?.operatorName ?? station?.name,
    grid: station?.grid,
    licenseClass: license?.class,
    country: undefined,
    totalQSOs,
    dxccCount: dxccWorkedCount,
  };

  // Re-render preview whenever card data or template changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    renderProfileCardPreview(cardData, template)
      .then((url) => {
        if (!cancelled) {
          // Revoke previous URL to prevent memory leaks
          if (prevUrlRef.current) {
            URL.revokeObjectURL(prevUrlRef.current);
          }
          prevUrlRef.current = url;
          setPreviewUrl(url);
          setLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    template,
    cardData.callsign,
    cardData.operatorName,
    cardData.grid,
    cardData.licenseClass,
    cardData.totalQSOs,
    cardData.dxccCount,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
      }
    };
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      const blob = await renderProfileCard(cardData, template);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${cardData.callsign}-profile-card.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate profile card:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, cardData.callsign]);

  const handleShare = useCallback(async () => {
    try {
      const blob = await renderProfileCard(cardData, template);
      const file = new File([blob], `${cardData.callsign}-profile-card.png`, {
        type: "image/png",
      });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${cardData.callsign} - Ham Radio Profile`,
          files: [file],
        });
        return;
      }

      // Fallback: copy image blob to clipboard
      if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setShareStatus("Copied to clipboard!");
        setTimeout(() => setShareStatus(null), 2000);
        return;
      }

      // Final fallback: download
      handleDownload();
    } catch (err) {
      // User cancelled share dialog or other error
      if (err instanceof Error && err.name !== "AbortError") {
        setShareStatus("Share failed");
        setTimeout(() => setShareStatus(null), 2000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, cardData.callsign, handleDownload]);

  return (
    <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-1">Share Card</h3>
      <p className="text-sm text-gray-400 mb-4">
        Generate a profile card image for sharing
      </p>

      {/* Template selector */}
      <div className="flex gap-2 mb-4">
        {CARD_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplate(t.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none ${
              template === t.id
                ? "border-plasma-orange bg-plasma-orange/10 text-plasma-orange"
                : "border-white/10 bg-white/5 text-gray-400 hover:text-white hover:border-white/20"
            }`}
            title={t.description}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Live preview */}
      <div className="relative aspect-[1200/630] w-full rounded-lg overflow-hidden border border-white/5 bg-black mb-4">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-plasma-orange/30 border-t-plasma-orange rounded-full animate-spin motion-reduce:animate-none" />
          </div>
        )}
        {previewUrl && (
          <img
            src={previewUrl}
            alt={`Profile card preview - ${template}`}
            className={`w-full h-full object-contain transition-opacity ${
              loading ? "opacity-30" : "opacity-100"
            }`}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-plasma-orange hover:bg-plasma-orange/80 text-white transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
        >
          {/* Download icon */}
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
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Download PNG
        </button>

        <button
          onClick={() =>
            requireAuth(
              () => void handleShare(),
              "Sign in to share your profile",
            )
          }
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-plasma-orange hover:bg-plasma-orange/80 text-white transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
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
      </div>

      {/* Share status toast */}
      {shareStatus && (
        <p className="mt-2 text-xs text-center text-signal-green animate-pulse motion-reduce:animate-none">
          {shareStatus}
        </p>
      )}
    </div>
  );
}
