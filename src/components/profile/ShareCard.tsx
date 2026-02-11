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
import { useOperatorRank } from "@/hooks/useOperatorRank";
import {
  renderProfileCard,
  renderProfileCardPreview,
  CARD_TEMPLATES,
  getUnlockedTemplates,
  type CardData,
  type CardTemplate,
} from "@/lib/profile/cardRenderer";

export function ShareCard() {
  const station = useProfileStore((s) => s.station);
  const license = useProfileStore((s) => s.license);
  const requireAuth = useRequireAuth();
  const { totalQSOs } = useLogbookStats();
  const { dxccWorkedCount } = useAwardProgress();

  const { rank } = useOperatorRank();
  const [template, setTemplate] = useState<CardTemplate>("minimalist");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(true);

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
    rank,
  };

  const unlockedTemplates = getUnlockedTemplates(rank);
  const isTemplateUnlocked = (id: CardTemplate) =>
    unlockedTemplates.some((t) => t.id === id);

  // Re-render preview whenever card data or template changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    renderProfileCardPreview(cardData, template, { showQR })
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
    showQR,
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
      const blob = await renderProfileCard(cardData, template, { showQR });
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
      const blob = await renderProfileCard(cardData, template, { showQR });
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

      {/* Template gallery */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
        {CARD_TEMPLATES.map((t) => {
          const unlocked = isTemplateUnlocked(t.id);
          const isSelected = template === t.id;
          return (
            <button
              key={t.id}
              onClick={() => unlocked && setTemplate(t.id)}
              disabled={!unlocked}
              className={[
                "relative px-3 py-2.5 text-left rounded-lg border transition-all",
                "focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none",
                isSelected
                  ? "border-plasma-orange bg-plasma-orange/10"
                  : unlocked
                    ? "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
                    : "border-white/5 bg-white/[0.02] cursor-not-allowed opacity-50",
              ].join(" ")}
              title={t.description}
            >
              <span
                className={`block text-xs font-medium truncate ${isSelected ? "text-plasma-orange" : unlocked ? "text-gray-300" : "text-gray-500"}`}
              >
                {t.label}
              </span>
              <span className="block text-[10px] text-gray-500 truncate mt-0.5">
                {t.description}
              </span>
              {!unlocked && (
                <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-gray-500"
                  >
                    <rect x="3" y="8" width="10" height="7" rx="1.5" />
                    <path d="M5 8V5a3 3 0 016 0v3" />
                  </svg>
                  <span className="text-[9px] text-gray-500 capitalize">
                    {t.minRank}
                  </span>
                </span>
              )}
            </button>
          );
        })}
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

      {/* QR code toggle */}
      <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showQR}
          onChange={(e) => setShowQR(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-plasma-orange focus:ring-plasma-orange/50 focus:ring-offset-0"
        />
        <span className="text-xs text-gray-400">Include QR code link</span>
      </label>

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
