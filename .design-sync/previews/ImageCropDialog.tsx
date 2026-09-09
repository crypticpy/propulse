import { ImageCropDialog } from "propulse";

// A self-contained placeholder image (no network dependency) standing in
// for a station operator photo — an SVG gradient card with a callsign,
// data-URI encoded so it decodes instantly in a headless capture.
const PLACEHOLDER_SRC =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f97316" />
          <stop offset="100%" stop-color="#0b1220" />
        </linearGradient>
      </defs>
      <rect width="640" height="480" fill="url(#g)" />
      <text x="320" y="250" font-family="monospace" font-size="56" fill="white"
        text-anchor="middle" dominant-baseline="middle">JA1XYZ</text>
    </svg>
  `);

export function AvatarCrop() {
  return (
    <ImageCropDialog
      open
      onClose={() => {}}
      imageSrc={PLACEHOLDER_SRC}
      aspect={1}
      cropShape="round"
      maxOutputWidth={512}
      maxOutputHeight={512}
      quality={0.85}
      onComplete={() => {}}
      title="Crop Profile Photo"
    />
  );
}

export function BannerCrop() {
  return (
    <ImageCropDialog
      open
      onClose={() => {}}
      imageSrc={PLACEHOLDER_SRC}
      aspect={16 / 9}
      cropShape="rect"
      maxOutputWidth={1280}
      maxOutputHeight={720}
      quality={0.85}
      onComplete={() => {}}
      title="Crop Shack Photo"
    />
  );
}
