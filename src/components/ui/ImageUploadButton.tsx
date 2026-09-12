/**
 * ImageUploadButton — File upload trigger with preview, crop flow, and removal.
 *
 * Handles the full lifecycle: file select -> FileReader -> ImageCropDialog ->
 * onImageChange(imageId). Shows a thumbnail preview when an image is set,
 * with a remove button that deletes from IndexedDB.
 */

import { useState, useRef, useCallback, useId } from "react";
import { ImageCropDialog } from "@/components/ui/ImageCropDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useImageUrl } from "@/hooks/useImageUrl";

function readFailureMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Could not read the selected photo. Try another file or try again.";
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ImageUploadButtonProps {
  imageId?: string;
  onImageChange: (imageId: string | undefined) => void;
  aspect: number;
  cropShape: "round" | "rect";
  maxOutputWidth: number;
  maxOutputHeight: number;
  quality: number;
  label?: string;
  compact?: boolean;
  className?: string;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function CameraIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ImageUploadButton({
  imageId,
  onImageChange,
  aspect,
  cropShape,
  maxOutputWidth,
  maxOutputHeight,
  quality,
  label = "Upload Photo",
  compact = false,
  className = "",
}: ImageUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readErrorId = useId();
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const { url: imageUrl } = useImageUrl(imageId);

  // Trigger hidden file input
  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Read selected file as data URL, then open crop dialog
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset the input so the same file can be re-selected
      e.target.value = "";
      setReadError(null);

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setCropSrc(reader.result);
          setCropOpen(true);
          return;
        }
        console.error(
          "[ImageUploadButton] FileReader returned a non-string result",
        );
        setReadError(
          "Could not read the selected photo. Try another file or try again.",
        );
      };
      reader.onerror = () => {
        console.error("[ImageUploadButton] FileReader failed:", reader.error);
        setReadError(readFailureMessage(reader.error));
      };
      reader.onabort = () => {
        setReadError("Photo read was cancelled. Choose a file to try again.");
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  // Crop completed — store imageId
  const handleCropComplete = useCallback(
    (newImageId: string) => {
      onImageChange(newImageId);
      setCropOpen(false);
      setCropSrc(null);
    },
    [onImageChange],
  );

  // Close crop dialog without saving
  const handleCropClose = useCallback(() => {
    setCropOpen(false);
    setCropSrc(null);
  }, []);

  // Detach from this context; store actions purge orphaned blobs.
  const handleRemove = useCallback(() => {
    if (!imageId) return;
    onImageChange(undefined);
  }, [imageId, onImageChange]);

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className={className}>
        <div className="inline-flex items-center gap-2">
        {/* Preview thumbnail (when image exists) */}
        {imageId && imageUrl && (
          <div className="relative group flex-shrink-0">
            <img
              src={imageUrl}
              alt="Preview"
              className={`object-cover border border-su-line/40 ${
                cropShape === "round"
                  ? "w-10 h-10 rounded-full"
                  : "w-12 h-9 rounded-md"
              }`}
            />
            {/* Remove overlay */}
            <button
              type="button"
              onClick={() => setShowRemoveConfirm(true)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                         bg-void-black border border-su-line/50
                         flex items-center justify-center
                         text-alert-red hover:text-alert-red/80
                         opacity-0 group-hover:opacity-100
                         transition-opacity focus:opacity-100
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
              aria-label="Remove image"
            >
              <RemoveIcon />
            </button>
          </div>
        )}

        {/* Upload / Change button */}
        {compact ? (
          <button
            type="button"
            onClick={handleClick}
            className="bg-su-input hover:bg-su-panel/60 rounded-lg p-2
                       text-su-muted hover:text-su-text
                       transition-colors focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-su-line/60"
            aria-label={imageId ? "Change photo" : label}
          >
            <CameraIcon size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            className="bg-su-line/10 hover:bg-su-line/20 border border-su-line/40
                       rounded-lg px-4 py-2 text-sm text-su-muted
                       inline-flex items-center gap-2
                       transition-colors focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-su-line/60"
          >
            <CameraIcon size={16} />
            <span>{imageId ? "Change" : label}</span>
          </button>
        )}
        </div>

        {readError && (
          <div
            id={readErrorId}
            role="alert"
            aria-live="polite"
            className="mt-2 max-w-sm rounded-lg border border-alert-red/20 bg-alert-red/10 px-3 py-2"
          >
            <p className="text-sm font-medium text-su-text">{readError}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleClick}
                className="rounded-md border border-alert-red/30 bg-alert-red/20 px-3 py-1 text-xs font-medium text-su-text hover:bg-alert-red/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-alert-red/40"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => setReadError(null)}
                className="rounded-md border border-su-line/40 bg-su-line/10 px-3 py-1 text-xs font-medium text-su-muted hover:bg-su-line/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-su-line/60"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Crop dialog */}
      {cropSrc && (
        <ImageCropDialog
          open={cropOpen}
          onClose={handleCropClose}
          imageSrc={cropSrc}
          aspect={aspect}
          cropShape={cropShape}
          maxOutputWidth={maxOutputWidth}
          maxOutputHeight={maxOutputHeight}
          quality={quality}
          onComplete={handleCropComplete}
        />
      )}

      <ConfirmDialog
        open={showRemoveConfirm}
        title="Remove Image"
        message="Remove this image? This cannot be undone."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          handleRemove();
          setShowRemoveConfirm(false);
        }}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </>
  );
}

export default ImageUploadButton;
