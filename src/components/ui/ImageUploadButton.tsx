/**
 * ImageUploadButton — File upload trigger with preview, crop flow, and removal.
 *
 * Handles the full lifecycle: file select -> FileReader -> ImageCropDialog ->
 * onImageChange(imageId). Shows a thumbnail preview when an image is set,
 * with a remove button that deletes from IndexedDB.
 */

import { useState, useRef, useCallback } from "react";
import { ImageCropDialog } from "@/components/ui/ImageCropDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteImage } from "@/lib/db/imageStore";
import { useImageUrl } from "@/hooks/useImageUrl";

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
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

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

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setCropSrc(reader.result);
          setCropOpen(true);
        }
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

  // Remove current image
  const handleRemove = useCallback(async () => {
    if (!imageId) return;
    try {
      await deleteImage(imageId);
    } catch (err) {
      console.error("[ImageUploadButton] Failed to delete image:", err);
    }
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

      <div className={`inline-flex items-center gap-2 ${className}`}>
        {/* Preview thumbnail (when image exists) */}
        {imageId && imageUrl && (
          <div className="relative group flex-shrink-0">
            <img
              src={imageUrl}
              alt="Preview"
              className={`object-cover border border-white/10 ${
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
                         bg-void-black border border-white/20
                         flex items-center justify-center
                         text-red-400 hover:text-red-300
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
            className="bg-black/40 hover:bg-black/60 rounded-lg p-2
                       text-gray-400 hover:text-gray-200
                       transition-colors focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label={imageId ? "Change photo" : label}
          >
            <CameraIcon size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            className="bg-white/5 hover:bg-white/10 border border-white/10
                       rounded-lg px-4 py-2 text-sm text-gray-300
                       inline-flex items-center gap-2
                       transition-colors focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <CameraIcon size={16} />
            <span>{imageId ? "Change" : label}</span>
          </button>
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
