import type { WizardMode } from "./types";

export function getModeTips(
  mode: WizardMode,
): Array<{ label: string; value: string }> {
  switch (mode) {
    case "FT8":
      return [
        { label: "Bandwidth", value: "50 Hz filter (as narrow as stable)" },
        { label: "Power", value: "Run steady power (avoid ALC pumping)" },
        { label: "Audio", value: "Keep TX audio clean; avoid clipping" },
      ];
    case "FT4":
      return [
        { label: "Timing", value: "7.5s cycles — stay NTP-synced" },
        { label: "Power", value: "Similar to FT8; steady drive, no ALC" },
        { label: "Use", value: "Faster QSOs when SNR margin allows" },
      ];
    case "CW":
      return [
        { label: "Bandwidth", value: "300–500 Hz filter" },
        { label: "Pitch", value: "Match RX/TX sidetone to your filter peak" },
        { label: "Timing", value: "Send slightly slower when QRN/QRQ" },
      ];
    case "SSB":
      return [
        { label: "Bandwidth", value: "2.1–2.4 kHz (narrower if noisy)" },
        {
          label: "Compression",
          value: "Moderate processing; avoid distortion",
        },
        { label: "Technique", value: "Short calls, listen between overs" },
      ];
    case "RTTY":
      return [
        { label: "Shift", value: "170 Hz standard amateur shift" },
        { label: "Power", value: "Keep ALC flat — RTTY is 100% duty" },
        { label: "Filter", value: "250–500 Hz; watch for QRM in contests" },
      ];
  }
}
