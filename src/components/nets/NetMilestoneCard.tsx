/**
 * NetMilestoneCard — Digital commemorative QSL-style card for net check-in
 * milestones. Renders as an inline CSS card with a Canvas-based PNG export
 * for download/sharing.
 *
 * Milestones: 10th, 25th, 50th, 100th, 250th check-in; 1-year anniversary.
 */

import { useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NetMilestoneCardProps {
  callsign: string;
  netName: string;
  frequency: string;
  mode: string;
  milestoneType: "10" | "25" | "50" | "100" | "250" | "1year";
  checkinCount: number;
  date: string; // ISO date of the milestone
  onDownload?: () => void; // triggers PNG download
}

// ─── Milestone Config ────────────────────────────────────────────────────────

interface MilestoneConfig {
  label: string;
  badge: string;
  borderClass: string;
  borderRgba: string;
  animated: boolean;
}

const MILESTONE_CONFIG: Record<
  NetMilestoneCardProps["milestoneType"],
  MilestoneConfig
> = {
  "10": {
    label: "10th CHECK-IN",
    badge: "Bronze",
    borderClass: "border-amber-500/30",
    borderRgba: "rgba(245, 158, 11, 0.3)",
    animated: false,
  },
  "25": {
    label: "25th CHECK-IN",
    badge: "Silver",
    borderClass: "border-gray-300/30",
    borderRgba: "rgba(209, 213, 219, 0.3)",
    animated: false,
  },
  "50": {
    label: "50th CHECK-IN",
    badge: "Gold",
    borderClass: "border-yellow-500/30",
    borderRgba: "rgba(234, 179, 8, 0.3)",
    animated: false,
  },
  "100": {
    label: "100th CHECK-IN",
    badge: "Platinum",
    borderClass: "border-plasma-orange/50",
    borderRgba: "rgba(255, 107, 53, 0.5)",
    animated: true,
  },
  "250": {
    label: "250th CHECK-IN",
    badge: "Diamond",
    borderClass: "border-red-500/30",
    borderRgba: "rgba(239, 68, 68, 0.3)",
    animated: true,
  },
  "1year": {
    label: "1-YEAR ANNIVERSARY",
    badge: "Anniversary",
    borderClass: "border-nebula-blue/30",
    borderRgba: "rgba(26, 26, 46, 0.5)",
    animated: true,
  },
};

const BADGE_COLORS: Record<string, string> = {
  Bronze: "bg-amber-700/30 text-amber-400 border-amber-500/30",
  Silver: "bg-gray-500/20 text-gray-300 border-gray-400/30",
  Gold: "bg-yellow-600/20 text-yellow-400 border-yellow-500/30",
  Platinum: "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30",
  Diamond: "bg-red-500/20 text-red-400 border-red-500/30",
  Anniversary: "bg-nebula-blue/30 text-blue-300 border-blue-400/30",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── Canvas Renderer ─────────────────────────────────────────────────────────

function renderMilestoneToCanvas(
  canvas: HTMLCanvasElement,
  props: NetMilestoneCardProps,
): void {
  const ctx = canvas.getContext("2d")!;
  canvas.width = 900;
  canvas.height = 600;

  const config = MILESTONE_CONFIG[props.milestoneType];
  const formattedDate = formatDate(props.date);

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 900, 600);
  grad.addColorStop(0, "#0a0a1a");
  grad.addColorStop(0.5, "#0d0d1f");
  grad.addColorStop(1, "#0a0a1a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 900, 600);

  // Outer border
  ctx.strokeStyle = config.borderRgba;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 860, 560);

  // Inner border (double)
  ctx.strokeRect(28, 28, 844, 544);

  // Corner ornaments (small L-shapes at each corner)
  const ornamentLen = 30;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  // Top-left
  ctx.beginPath();
  ctx.moveTo(36, 56);
  ctx.lineTo(36, 36);
  ctx.lineTo(56, 36);
  ctx.stroke();
  // Top-right
  ctx.beginPath();
  ctx.moveTo(864 - ornamentLen + 28, 36);
  ctx.lineTo(864, 36);
  ctx.lineTo(864, 36 + ornamentLen - 8);
  ctx.stroke();
  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(36, 564 - ornamentLen + 8);
  ctx.lineTo(36, 564);
  ctx.lineTo(36 + ornamentLen - 8, 564);
  ctx.stroke();
  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(864, 564 - ornamentLen + 8);
  ctx.lineTo(864, 564);
  ctx.lineTo(864 - ornamentLen + 8, 564);
  ctx.stroke();

  // Header text
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PROPULSE NET MILESTONE", 450, 80);

  // Badge text
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "bold 14px system-ui";
  ctx.fillText(config.badge.toUpperCase(), 450, 110);

  // Milestone text
  ctx.fillStyle = "rgb(255, 107, 53)";
  ctx.font = "bold 48px system-ui";
  ctx.fillText(config.label, 450, 200);

  // Callsign
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px monospace";
  ctx.fillText(props.callsign.toUpperCase(), 450, 280);

  // Net name
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = "18px system-ui";
  ctx.fillText(props.netName, 450, 330);

  // Frequency + mode
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "14px monospace";
  ctx.fillText(`${props.frequency} \u2022 ${props.mode}`, 450, 370);

  // Check-in count
  ctx.fillStyle = "rgba(255, 107, 53, 0.6)";
  ctx.font = "13px system-ui";
  ctx.fillText(
    `${props.checkinCount} total check-in${props.checkinCount !== 1 ? "s" : ""}`,
    450,
    420,
  );

  // Divider line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(250, 460);
  ctx.lineTo(650, 460);
  ctx.stroke();

  // Date
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.font = "14px monospace";
  ctx.fillText(formattedDate, 450, 500);

  // Watermark
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.font = "10px monospace";
  ctx.fillText("PROPULSE \u2022 propulse.app", 450, 560);
}

function downloadAsPNG(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NetMilestoneCard(props: NetMilestoneCardProps) {
  const {
    callsign,
    netName,
    frequency,
    mode,
    milestoneType,
    checkinCount,
    date,
    onDownload,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const config = MILESTONE_CONFIG[milestoneType];
  const formattedDate = formatDate(date);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    renderMilestoneToCanvas(canvas, props);
    const filename = `${callsign}-${netName.replace(/\s+/g, "-").toLowerCase()}-milestone-${milestoneType}.png`;
    downloadAsPNG(canvas, filename);
    onDownload?.();
  }, [props, callsign, netName, milestoneType, onDownload]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* ── CSS QSL Card ── */}
      <div
        className={[
          "relative aspect-[3/2] max-w-md w-full overflow-hidden rounded-lg",
          "bg-gradient-to-br from-deep-space via-void to-deep-space",
          "border-2",
          config.borderClass,
        ].join(" ")}
        role="img"
        aria-label={`${config.label} milestone card for ${callsign} on ${netName}`}
      >
        {/* Animated gradient border for 100+ milestones */}
        {config.animated && (
          <div
            className="absolute inset-0 pointer-events-none rounded-lg opacity-40"
            style={{
              background: `conic-gradient(from 0deg, transparent, ${config.borderRgba}, transparent, ${config.borderRgba}, transparent)`,
              animation: "spin 8s linear infinite",
              mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              WebkitMask:
                "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              maskComposite: "xor",
              WebkitMaskComposite: "xor" as never,
              padding: "2px",
            }}
          />
        )}

        {/* Inner double border */}
        <div className="absolute inset-2 border border-white/[0.06] rounded pointer-events-none" />

        {/* Corner brackets — top-left */}
        <div className="absolute top-3 left-3 w-4 h-4 border-t border-l border-white/[0.12] pointer-events-none" />
        {/* Corner brackets — top-right */}
        <div className="absolute top-3 right-3 w-4 h-4 border-t border-r border-white/[0.12] pointer-events-none" />
        {/* Corner brackets — bottom-left */}
        <div className="absolute bottom-3 left-3 w-4 h-4 border-b border-l border-white/[0.12] pointer-events-none" />
        {/* Corner brackets — bottom-right */}
        <div className="absolute bottom-3 right-3 w-4 h-4 border-b border-r border-white/[0.12] pointer-events-none" />

        {/* Card content */}
        <div className="relative z-[1] flex flex-col items-center justify-center h-full px-6 py-5 text-center">
          {/* Header */}
          <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 mb-1">
            PROPULSE NET MILESTONE
          </span>

          {/* Badge */}
          <span
            className={`inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border mb-3 ${BADGE_COLORS[config.badge]}`}
          >
            {config.badge}
          </span>

          {/* Milestone text */}
          <h2 className="text-2xl sm:text-3xl font-bold text-plasma-orange mb-2 tracking-wide">
            {config.label}
          </h2>

          {/* Callsign */}
          <p className="font-mono text-2xl text-white font-bold mb-1">
            {callsign.toUpperCase()}
          </p>

          {/* Net name */}
          <p className="text-sm text-gray-300 mb-1">{netName}</p>

          {/* Frequency + mode */}
          <p className="font-mono text-xs text-gray-400 mb-2">
            {frequency} &bull; {mode}
          </p>

          {/* Check-in count */}
          <p className="text-xs text-plasma-orange/60 mb-3">
            {checkinCount} total check-in{checkinCount !== 1 ? "s" : ""}
          </p>

          {/* Divider */}
          <div className="w-32 h-px bg-white/[0.08] mb-3" />

          {/* Date */}
          <p className="font-mono text-xs text-gray-400">{formattedDate}</p>
        </div>
      </div>

      {/* ── Download Button ── */}
      <button
        type="button"
        onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-plasma-orange hover:bg-plasma-orange/80 text-white transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Download as PNG
      </button>

      {/* Hidden canvas for PNG export */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}

export default NetMilestoneCard;
