/**
 * ImageCropDialog — Centered portal modal with react-easy-crop for cropping
 * images before upload. Crops, compresses via canvas, and stores to IndexedDB.
 *
 * Follows ConfirmDialog modal pattern: portal to body, z-[500], backdrop,
 * escape key, body scroll lock, auto-focus.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { storeImage } from "@/lib/db/imageStore";

// ─── Zoom Slider Styles (injected once) ──────────────────────────────────────

const CROP_STYLE_ID = "image-crop-dialog-styles";

const CROP_SLIDER_CSS = `
.image-crop-zoom-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.1);
  outline: none;
  cursor: pointer;
}
.image-crop-zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f97316;
  border: 2px solid rgba(249, 115, 22, 0.5);
  cursor: pointer;
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.3);
  transition: box-shadow 150ms ease;
}
.image-crop-zoom-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 14px rgba(249, 115, 22, 0.5);
}
.image-crop-zoom-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f97316;
  border: 2px solid rgba(249, 115, 22, 0.5);
  cursor: pointer;
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.3);
}
.image-crop-zoom-slider::-moz-range-track {
  height: 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.1);
}
`;

function ensureCropStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(CROP_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CROP_STYLE_ID;
  style.textContent = CROP_SLIDER_CSS;
  document.head.appendChild(style);
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ImageCropDialogProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  aspect: number;
  cropShape: "round" | "rect";
  maxOutputWidth: number;
  maxOutputHeight: number;
  quality: number;
  onComplete: (imageId: string) => void;
  title?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Loads an HTMLImageElement from a source URL (data URL or object URL).
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) =>
      reject(new Error(`Failed to load image: ${String(e)}`)),
    );
    img.setAttribute("crossOrigin", "anonymous");
    img.src = src;
  });
}

/**
 * Given the original image and cropped area pixels from react-easy-crop,
 * draws the cropped region onto a canvas (capped at max dimensions),
 * then returns a JPEG blob at the given quality.
 */
async function getCroppedBlob(
  imageSrc: string,
  cropPixels: Area,
  maxWidth: number,
  maxHeight: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await loadImage(imageSrc);

  // Determine output dimensions (cap at max)
  let outWidth = cropPixels.width;
  let outHeight = cropPixels.height;

  if (outWidth > maxWidth) {
    const scale = maxWidth / outWidth;
    outWidth = maxWidth;
    outHeight = Math.round(outHeight * scale);
  }
  if (outHeight > maxHeight) {
    const scale = maxHeight / outHeight;
    outHeight = maxHeight;
    outWidth = Math.round(outWidth * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2d context");

  // Draw the cropped region from the source onto the output canvas
  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outWidth,
    outHeight,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob returned null"));
          return;
        }
        resolve({ blob, width: outWidth, height: outHeight });
      },
      "image/jpeg",
      quality,
    );
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ImageCropDialog({
  open,
  onClose,
  imageSrc,
  aspect,
  cropShape,
  maxOutputWidth,
  maxOutputHeight,
  quality,
  onComplete,
  title = "Crop Photo",
}: ImageCropDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset state when dialog opens with new image
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setSaving(false);
    }
  }, [open, imageSrc]);

  // Inject slider CSS
  useEffect(() => {
    ensureCropStyles();
  }, []);

  // Auto-focus cancel button on open
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => cancelRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Escape key closes
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    },
    [onClose, saving],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // react-easy-crop callback
  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  // Save handler: crop -> compress -> store -> callback
  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels || saving) return;
    setSaving(true);

    try {
      const { blob, width, height } = await getCroppedBlob(
        imageSrc,
        croppedAreaPixels,
        maxOutputWidth,
        maxOutputHeight,
        quality,
      );

      const imageId = await storeImage(blob, width, height);
      onComplete(imageId);
      onClose();
    } catch (err) {
      console.error("[ImageCropDialog] Failed to crop/store image:", err);
      setSaving(false);
    }
  }, [
    croppedAreaPixels,
    saving,
    imageSrc,
    maxOutputWidth,
    maxOutputHeight,
    quality,
    onComplete,
    onClose,
  ]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in"
        onClick={saving ? undefined : onClose}
      />

      {/* Modal panel */}
      <div
        className="relative z-10 w-full max-w-lg bg-deep-space border border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-dialog-title"
      >
        {/* Title */}
        <div className="px-5 pt-5 pb-3">
          <h2
            id="image-crop-dialog-title"
            className="text-lg font-bold text-white"
          >
            {title}
          </h2>
        </div>

        {/* Crop area */}
        <div
          className="relative mx-5 rounded-lg overflow-hidden"
          style={{
            height: 320,
            backgroundColor: "#0a0e18",
          }}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape === "rect"}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: {
                borderRadius: "0.5rem",
              },
              mediaStyle: {},
              cropAreaStyle: {
                border: "2px solid rgba(249, 115, 22, 0.6)",
              },
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 pt-4 pb-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Zoom
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="image-crop-zoom-slider mt-2 block w-full"
              aria-label="Zoom level"
            />
          </label>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 px-5 pt-3 pb-5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                       bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !croppedAreaPixels}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                       bg-plasma-orange/20 hover:bg-plasma-orange/30 text-plasma-orange
                       border border-plasma-orange/30
                       disabled:opacity-50 disabled:cursor-not-allowed
                       inline-flex items-center gap-2"
          >
            {saving && (
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {saving ? "Saving\u2026" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default ImageCropDialog;
