/**
 * WAV file encoder — converts raw PCM Float32 samples to a downloadable WAV blob.
 *
 * Outputs standard RIFF/WAV format:
 * - PCM encoding (no compression)
 * - Mono channel
 * - Configurable sample rate (default 48000)
 * - 16-bit integer samples
 */

/** Encode Float32 audio samples to a WAV Blob. */
export function encodeWav(samples: Float32Array, sampleRate = 48000): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // ─── RIFF header ──────────────────────────────────────────────────
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true); // file size - 8
  writeString(view, 8, "WAVE");

  // ─── fmt chunk ────────────────────────────────────────────────────
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // ─── data chunk ───────────────────────────────────────────────────
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
  let offset = headerSize;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
