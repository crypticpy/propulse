import React, { useEffect, useCallback } from "react";

export interface ImageModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Image URL to display */
  imageUrl: string;
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
}

/**
 * ImageModal Component
 *
 * A modal for displaying enlarged NOAA/SWPC images with source attribution.
 * Features smooth animations, keyboard support, and responsive sizing.
 */
export const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  alt,
  title,
  caption,
  sourceUrl,
  sourceLabel = "View source at NOAA",
}) => {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
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

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col bg-gradient-to-br from-[#0f0f23] to-[#1a1a2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
          <h2
            id="image-modal-title"
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

        {/* Image container */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center bg-black/20">
          <img
            src={imageUrl}
            alt={alt}
            className="max-w-full max-h-[calc(90vh-12rem)] w-auto h-auto object-contain rounded-lg shadow-lg"
            loading="eager"
          />
        </div>

        {/* Caption footer */}
        {caption && (
          <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02]">
            <p className="text-sm text-gray-400 text-center">{caption}</p>
          </div>
        )}
      </div>

      {/* Global styles for animations */}
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

ImageModal.displayName = "ImageModal";

export default ImageModal;
