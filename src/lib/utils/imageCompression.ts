/**
 * Canvas-based image compression utility.
 * Resizes and compresses images to JPEG using an offscreen canvas.
 * Zero external dependencies.
 */

/** Result of a compression operation */
export interface CompressedImage {
  /** Compressed JPEG blob */
  blob: Blob;
  /** Final width in pixels */
  width: number;
  /** Final height in pixels */
  height: number;
}

/**
 * Compress and resize an image file to JPEG.
 *
 * Implementation:
 * 1. Loads the file via `createImageBitmap` for efficient decoding
 * 2. Calculates scaled dimensions maintaining aspect ratio (never upscales)
 * 3. Draws to an offscreen canvas at the target size
 * 4. Exports as JPEG at the specified quality
 *
 * @param file - Source image file (any browser-supported format)
 * @param maxWidth - Maximum output width in pixels
 * @param maxHeight - Maximum output height in pixels
 * @param quality - JPEG quality from 0 to 1 (e.g. 0.85)
 * @returns Compressed image blob with final dimensions
 */
export async function compressImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number,
): Promise<CompressedImage> {
  // Decode image off the main thread where supported
  const bitmap = await createImageBitmap(file);

  try {
    const { width: srcW, height: srcH } = bitmap;

    // Calculate target dimensions — maintain aspect ratio, never upscale
    let targetW = srcW;
    let targetH = srcH;

    if (targetW > maxWidth) {
      targetH = Math.round(targetH * (maxWidth / targetW));
      targetW = maxWidth;
    }
    if (targetH > maxHeight) {
      targetW = Math.round(targetW * (maxHeight / targetH));
      targetH = maxHeight;
    }

    // Guard against degenerate dimensions
    targetW = Math.max(1, targetW);
    targetH = Math.max(1, targetH);

    // Draw to offscreen canvas
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D canvas context");
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    // Export as JPEG
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("canvas.toBlob returned null"));
          }
        },
        "image/jpeg",
        quality,
      );
    });

    return { blob, width: targetW, height: targetH };
  } finally {
    // Always release the ImageBitmap to free memory
    bitmap.close();
  }
}
