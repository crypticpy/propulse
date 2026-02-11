/**
 * Canvas-based profile card renderer for sharing.
 *
 * Generates 1200x630px card images (OG image size) using the Canvas 2D API.
 * Seven templates with rank-gated access: free (minimalist, classic, contest)
 * plus premium (signal-wave, golden-plate, aurora-field, ethereal-rift).
 * Returns a Blob suitable for download or Web Share API.
 */

import type { RankTier } from "@/types/rank";
import { isRankAtLeast } from "@/lib/data/rankConstants";
import QRCode from "qrcode";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CardTemplate =
  | "minimalist"
  | "classic"
  | "contest"
  | "signal-wave"
  | "golden-plate"
  | "aurora-field"
  | "ethereal-rift";

export interface CardData {
  callsign: string;
  operatorName?: string;
  grid?: string;
  licenseClass?: string;
  country?: string;
  totalQSOs?: number;
  dxccCount?: number;
  rank?: RankTier;
}

export const CARD_TEMPLATES: {
  id: CardTemplate;
  label: string;
  description: string;
  minRank: RankTier;
}[] = [
  {
    id: "minimalist",
    label: "Minimalist Dark",
    description: "Clean dark background with plasma-orange callsign",
    minRank: "novice",
  },
  {
    id: "classic",
    label: "Classic Ham",
    description: "Traditional ham radio style with amber/gold tones",
    minRank: "novice",
  },
  {
    id: "contest",
    label: "Contest Fighter",
    description: "Bold, high-contrast with prominent stats",
    minRank: "novice",
  },
  {
    id: "signal-wave",
    label: "Signal Wave",
    description: "Animated wave pattern with rank color accents",
    minRank: "journeyman",
  },
  {
    id: "golden-plate",
    label: "Golden Plate",
    description: "Engraved gold QSL card aesthetic",
    minRank: "master",
  },
  {
    id: "aurora-field",
    label: "Aurora Field",
    description: "Northern lights gradient backdrop",
    minRank: "legendary",
  },
  {
    id: "ethereal-rift",
    label: "Ethereal Rift",
    description: "Chromatic rift with aurora palette",
    minRank: "ethereal",
  },
];

export function getUnlockedTemplates(rank: RankTier) {
  return CARD_TEMPLATES.filter((t) => isRankAtLeast(rank, t.minRank));
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const COLORS = {
  plasmaOrange: "#ff6b35",
  plasmaOrangeLight: "#ff8c5a",
  voidBlack: "#0a0a0f",
  voidDark: "#111118",
  amber: "#f59e0b",
  gold: "#d4a017",
  goldLight: "#fbbf24",
  white: "#ffffff",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  contestRed: "#ef4444",
  contestCyan: "#06b6d4",
  deepSpace: "#0c1222",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create blob from canvas"));
        }
      },
      "image/png",
      1.0,
    );
  });
}

/**
 * Draw rounded rectangle (used for stat boxes and borders).
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Draw a subtle CRT scanline effect overlay.
 */
function drawScanlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha = 0.03,
): void {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 1);
  }
}

// ─── Template: Minimalist Dark ───────────────────────────────────────────────

function renderMinimalist(ctx: CanvasRenderingContext2D, data: CardData): void {
  // Background
  ctx.fillStyle = COLORS.voidBlack;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  grad.addColorStop(0, "rgba(255, 107, 53, 0.03)");
  grad.addColorStop(1, "rgba(255, 107, 53, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Thin top accent line
  ctx.fillStyle = COLORS.plasmaOrange;
  ctx.fillRect(0, 0, CARD_WIDTH, 3);

  // Callsign
  ctx.font = "bold 120px monospace";
  ctx.fillStyle = COLORS.plasmaOrange;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(data.callsign, CARD_WIDTH / 2, CARD_HEIGHT * 0.38);

  // Operator name
  if (data.operatorName) {
    ctx.font = "300 28px sans-serif";
    ctx.fillStyle = COLORS.gray300;
    ctx.fillText(data.operatorName, CARD_WIDTH / 2, CARD_HEIGHT * 0.52);
  }

  // Grid locator + license class
  const infoLine = [data.grid, data.licenseClass].filter(Boolean).join("  |  ");
  if (infoLine) {
    ctx.font = "500 22px monospace";
    ctx.fillStyle = COLORS.gray400;
    ctx.fillText(infoLine, CARD_WIDTH / 2, CARD_HEIGHT * 0.62);
  }

  // Stats row at bottom
  const stats: { label: string; value: string }[] = [];
  if (data.totalQSOs !== undefined) {
    stats.push({ label: "QSOs", value: formatNumber(data.totalQSOs) });
  }
  if (data.dxccCount !== undefined) {
    stats.push({ label: "DXCC", value: data.dxccCount.toString() });
  }
  if (data.country) {
    stats.push({ label: "QTH", value: data.country });
  }

  if (stats.length > 0) {
    const statWidth = 200;
    const totalWidth = stats.length * statWidth;
    const startX = (CARD_WIDTH - totalWidth) / 2;

    stats.forEach((stat, i) => {
      const cx = startX + i * statWidth + statWidth / 2;
      ctx.font = "bold 32px monospace";
      ctx.fillStyle = COLORS.white;
      ctx.fillText(stat.value, cx, CARD_HEIGHT * 0.78);
      ctx.font = "400 14px sans-serif";
      ctx.fillStyle = COLORS.gray500;
      ctx.fillText(stat.label.toUpperCase(), cx, CARD_HEIGHT * 0.85);
    });
  }

  // ProPulse watermark
  ctx.font = "400 12px sans-serif";
  ctx.fillStyle = COLORS.gray600;
  ctx.textAlign = "right";
  ctx.fillText("ProPulse", CARD_WIDTH - 24, CARD_HEIGHT - 18);

  drawScanlines(ctx, CARD_WIDTH, CARD_HEIGHT);
}

// ─── Template: Classic Ham ───────────────────────────────────────────────────

function renderClassic(ctx: CanvasRenderingContext2D, data: CardData): void {
  // Background - warm dark
  ctx.fillStyle = "#0f0d0a";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Decorative border
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  roundRect(ctx, 16, 16, CARD_WIDTH - 32, CARD_HEIGHT - 32, 8);
  ctx.stroke();

  // Inner border
  ctx.strokeStyle = "rgba(212, 160, 23, 0.3)";
  ctx.lineWidth = 1;
  roundRect(ctx, 28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56, 4);
  ctx.stroke();

  // Diamond pattern in corners (decorative)
  const diamondSize = 6;
  ctx.fillStyle = COLORS.gold;
  for (const [cx, cy] of [
    [40, 40],
    [CARD_WIDTH - 40, 40],
    [40, CARD_HEIGHT - 40],
    [CARD_WIDTH - 40, CARD_HEIGHT - 40],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - diamondSize);
    ctx.lineTo(cx + diamondSize, cy);
    ctx.lineTo(cx, cy + diamondSize);
    ctx.lineTo(cx - diamondSize, cy);
    ctx.closePath();
    ctx.fill();
  }

  // "AMATEUR RADIO STATION" header
  ctx.font = "500 16px sans-serif";
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = "center";
  ctx.letterSpacing = "4px";
  ctx.fillText("AMATEUR RADIO STATION", CARD_WIDTH / 2, 70);
  ctx.letterSpacing = "0px";

  // Horizontal rule
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(300, 88);
  ctx.lineTo(CARD_WIDTH - 300, 88);
  ctx.stroke();

  // Callsign - large prominent
  ctx.font = "bold 110px monospace";
  ctx.fillStyle = COLORS.goldLight;
  ctx.textAlign = "center";
  ctx.fillText(data.callsign, CARD_WIDTH / 2, 210);

  // Operator name
  if (data.operatorName) {
    ctx.font = "italic 30px serif";
    ctx.fillStyle = COLORS.gray300;
    ctx.fillText(data.operatorName, CARD_WIDTH / 2, 270);
  }

  // Grid + license + country info line
  const details: string[] = [];
  if (data.grid) details.push(`Grid: ${data.grid}`);
  if (data.licenseClass) details.push(`Class: ${data.licenseClass}`);
  if (data.country) details.push(data.country);

  if (details.length > 0) {
    ctx.font = "400 20px monospace";
    ctx.fillStyle = COLORS.amber;
    ctx.fillText(details.join("    "), CARD_WIDTH / 2, 330);
  }

  // Bottom stat row in boxes
  const stats: { label: string; value: string }[] = [];
  if (data.totalQSOs !== undefined) {
    stats.push({ label: "Total QSOs", value: formatNumber(data.totalQSOs) });
  }
  if (data.dxccCount !== undefined) {
    stats.push({ label: "DXCC Entities", value: data.dxccCount.toString() });
  }

  if (stats.length > 0) {
    const boxWidth = 220;
    const boxHeight = 80;
    const gap = 40;
    const totalWidth = stats.length * boxWidth + (stats.length - 1) * gap;
    const startX = (CARD_WIDTH - totalWidth) / 2;

    stats.forEach((stat, i) => {
      const bx = startX + i * (boxWidth + gap);
      const by = CARD_HEIGHT - 160;

      ctx.strokeStyle = "rgba(212, 160, 23, 0.4)";
      ctx.lineWidth = 1;
      roundRect(ctx, bx, by, boxWidth, boxHeight, 6);
      ctx.stroke();

      ctx.font = "bold 30px monospace";
      ctx.fillStyle = COLORS.goldLight;
      ctx.textAlign = "center";
      ctx.fillText(stat.value, bx + boxWidth / 2, by + 34);

      ctx.font = "400 13px sans-serif";
      ctx.fillStyle = COLORS.gray400;
      ctx.fillText(stat.label.toUpperCase(), bx + boxWidth / 2, by + 60);
    });
  }

  // Horizontal rule above footer
  ctx.strokeStyle = "rgba(212, 160, 23, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, CARD_HEIGHT - 55);
  ctx.lineTo(CARD_WIDTH - 60, CARD_HEIGHT - 55);
  ctx.stroke();

  // ProPulse watermark
  ctx.font = "400 12px sans-serif";
  ctx.fillStyle = COLORS.gray600;
  ctx.textAlign = "right";
  ctx.fillText("ProPulse", CARD_WIDTH - 40, CARD_HEIGHT - 35);
}

// ─── Template: Contest Fighter ───────────────────────────────────────────────

function renderContest(ctx: CanvasRenderingContext2D, data: CardData): void {
  // Bold dark background with gradient
  const bgGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  bgGrad.addColorStop(0, COLORS.deepSpace);
  bgGrad.addColorStop(1, "#0a0514");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Aggressive diagonal stripe accent
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = COLORS.contestRed;
  for (let i = -CARD_HEIGHT; i < CARD_WIDTH + CARD_HEIGHT; i += 60) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 20, 0);
    ctx.lineTo(i + 20 - CARD_HEIGHT, CARD_HEIGHT);
    ctx.lineTo(i - CARD_HEIGHT, CARD_HEIGHT);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Top red accent bar
  const topGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  topGrad.addColorStop(0, COLORS.contestRed);
  topGrad.addColorStop(0.5, COLORS.plasmaOrange);
  topGrad.addColorStop(1, COLORS.contestRed);
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, 5);

  // "CONTEST STATION" tag if QSO count present
  if (data.totalQSOs !== undefined && data.totalQSOs > 0) {
    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = COLORS.contestRed;
    ctx.textAlign = "left";
    ctx.letterSpacing = "3px";
    ctx.fillText("CONTEST STATION", 60, 50);
    ctx.letterSpacing = "0px";
  }

  // Callsign - extra large and bold
  ctx.font = "bold 140px monospace";
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Glow effect
  ctx.shadowColor = COLORS.contestRed;
  ctx.shadowBlur = 20;
  ctx.fillText(data.callsign, CARD_WIDTH / 2, 190);
  ctx.shadowBlur = 0;

  // Operator name + grid inline
  const subParts = [data.operatorName, data.grid].filter(Boolean);
  if (subParts.length > 0) {
    ctx.font = "400 22px sans-serif";
    ctx.fillStyle = COLORS.gray400;
    ctx.fillText(subParts.join("  //  "), CARD_WIDTH / 2, 280);
  }

  // Large stats display
  const statsY = 390;
  const statEntries: { label: string; value: string; color: string }[] = [];

  if (data.totalQSOs !== undefined) {
    statEntries.push({
      label: "QSOs",
      value: formatNumber(data.totalQSOs),
      color: COLORS.contestCyan,
    });
  }
  if (data.dxccCount !== undefined) {
    statEntries.push({
      label: "DXCC",
      value: data.dxccCount.toString(),
      color: COLORS.plasmaOrange,
    });
  }
  if (data.licenseClass) {
    statEntries.push({
      label: "CLASS",
      value: data.licenseClass,
      color: COLORS.contestRed,
    });
  }
  if (data.country) {
    statEntries.push({
      label: "QTH",
      value: data.country,
      color: COLORS.gray300,
    });
  }

  if (statEntries.length > 0) {
    // Divider line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, statsY - 50);
    ctx.lineTo(CARD_WIDTH - 60, statsY - 50);
    ctx.stroke();

    const colWidth = (CARD_WIDTH - 120) / statEntries.length;

    statEntries.forEach((stat, i) => {
      const cx = 60 + i * colWidth + colWidth / 2;

      // Value
      ctx.font = "bold 52px monospace";
      ctx.fillStyle = stat.color;
      ctx.textAlign = "center";
      ctx.fillText(stat.value, cx, statsY);

      // Label
      ctx.font = "600 13px sans-serif";
      ctx.fillStyle = COLORS.gray500;
      ctx.letterSpacing = "2px";
      ctx.fillText(stat.label, cx, statsY + 32);
      ctx.letterSpacing = "0px";
    });
  }

  // Bottom bar
  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  ctx.fillRect(0, CARD_HEIGHT - 50, CARD_WIDTH, 50);

  // ProPulse watermark
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = COLORS.gray600;
  ctx.textAlign = "right";
  ctx.fillText("PROPULSE", CARD_WIDTH - 30, CARD_HEIGHT - 20);

  drawScanlines(ctx, CARD_WIDTH, CARD_HEIGHT, 0.02);
}

// ─── Shared Helpers (used by premium templates) ─────────────────────────────

async function drawQRCode(
  ctx: CanvasRenderingContext2D,
  url: string,
  x: number,
  y: number,
  size: number,
): Promise<void> {
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: { dark: "#ffffffcc", light: "#00000000" },
      errorCorrectionLevel: "M",
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = qrDataUrl;
    });
    ctx.drawImage(img, x, y, size, size);
  } catch {
    // QR rendering is non-critical — silently skip
  }
}

/** Get accent color for a rank tier (for canvas rendering) */
function getRankAccent(rank: RankTier): string {
  const colors: Record<RankTier, string> = {
    novice: "#9CA3AF",
    apprentice: "#38BDF8",
    journeyman: "#34D399",
    expert: "#A78BFA",
    master: "#FCD34D",
    legendary: "#FFD700",
    ethereal: "#A78BFA",
  };
  return colors[rank];
}

/** Draw a stats row at the bottom of the card (shared by multiple templates) */
function drawStatsRow(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  valueColor: string,
  labelColor: string,
): void {
  const stats: { label: string; value: string }[] = [];
  if (data.totalQSOs !== undefined) {
    stats.push({ label: "QSOs", value: formatNumber(data.totalQSOs) });
  }
  if (data.dxccCount !== undefined) {
    stats.push({ label: "DXCC", value: data.dxccCount.toString() });
  }
  if (data.country) {
    stats.push({ label: "QTH", value: data.country });
  }

  if (stats.length > 0) {
    const statWidth = 200;
    const totalWidth = stats.length * statWidth;
    const startX = (CARD_WIDTH - totalWidth) / 2;

    stats.forEach((stat, i) => {
      const cx = startX + i * statWidth + statWidth / 2;
      ctx.font = "bold 32px monospace";
      ctx.fillStyle = valueColor;
      ctx.textAlign = "center";
      ctx.fillText(stat.value, cx, CARD_HEIGHT * 0.78);
      ctx.font = "400 14px sans-serif";
      ctx.fillStyle = labelColor;
      ctx.fillText(stat.label.toUpperCase(), cx, CARD_HEIGHT * 0.85);
    });
  }
}

// ─── Template: Signal Wave (Journeyman+) ───────────────────────────────────

function renderSignalWave(ctx: CanvasRenderingContext2D, data: CardData): void {
  // Deep navy background
  ctx.fillStyle = "#0a1628";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Wave pattern in rank-colored accent
  const rankColor = data.rank ? getRankAccent(data.rank) : COLORS.plasmaOrange;
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = rankColor;
  ctx.lineWidth = 2;
  for (let wave = 0; wave < 6; wave++) {
    ctx.beginPath();
    for (let x = 0; x <= CARD_WIDTH; x += 4) {
      const y =
        CARD_HEIGHT * 0.5 +
        Math.sin((x + wave * 80) * 0.015) * (80 + wave * 20) +
        Math.sin((x + wave * 40) * 0.008) * 40;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Top accent bar with rank color
  const topGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH, 0);
  topGrad.addColorStop(0, "transparent");
  topGrad.addColorStop(0.3, rankColor);
  topGrad.addColorStop(0.7, rankColor);
  topGrad.addColorStop(1, "transparent");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, 3);

  // Callsign
  ctx.font = "bold 110px monospace";
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = rankColor;
  ctx.shadowBlur = 15;
  ctx.fillText(data.callsign, CARD_WIDTH / 2, CARD_HEIGHT * 0.35);
  ctx.shadowBlur = 0;

  // Operator name
  if (data.operatorName) {
    ctx.font = "300 26px sans-serif";
    ctx.fillStyle = COLORS.gray300;
    ctx.fillText(data.operatorName, CARD_WIDTH / 2, CARD_HEIGHT * 0.5);
  }

  // Info line
  const infoLine = [data.grid, data.licenseClass].filter(Boolean).join("  |  ");
  if (infoLine) {
    ctx.font = "500 20px monospace";
    ctx.fillStyle = `${rankColor}cc`;
    ctx.fillText(infoLine, CARD_WIDTH / 2, CARD_HEIGHT * 0.6);
  }

  // Stats at bottom
  drawStatsRow(ctx, data, COLORS.white, COLORS.gray500);

  // Watermark
  ctx.font = "400 12px sans-serif";
  ctx.fillStyle = COLORS.gray600;
  ctx.textAlign = "right";
  ctx.fillText("ProPulse", CARD_WIDTH - 24, CARD_HEIGHT - 18);

  drawScanlines(ctx, CARD_WIDTH, CARD_HEIGHT, 0.02);
}

// ─── Template: Golden Plate (Master+) ──────────────────────────────────────

function renderGoldenPlate(
  ctx: CanvasRenderingContext2D,
  data: CardData,
): void {
  // Rich dark background
  ctx.fillStyle = "#0c0a06";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Gold brushed texture effect
  ctx.save();
  ctx.globalAlpha = 0.03;
  for (let y = 0; y < CARD_HEIGHT; y += 2) {
    ctx.fillStyle = y % 4 === 0 ? "#FFD700" : "#B8860B";
    ctx.fillRect(0, y, CARD_WIDTH, 1);
  }
  ctx.restore();

  // Ornate double border
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 3;
  roundRect(ctx, 20, 20, CARD_WIDTH - 40, CARD_HEIGHT - 40, 12);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 215, 0, 0.3)";
  ctx.lineWidth = 1;
  roundRect(ctx, 32, 32, CARD_WIDTH - 64, CARD_HEIGHT - 64, 8);
  ctx.stroke();

  // Corner ornaments (L-shaped brackets)
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 2;
  const bracketLen = 30;
  const corners = [
    { x: 40, y: 40, dx: 1, dy: 1 },
    { x: CARD_WIDTH - 40, y: 40, dx: -1, dy: 1 },
    { x: 40, y: CARD_HEIGHT - 40, dx: 1, dy: -1 },
    { x: CARD_WIDTH - 40, y: CARD_HEIGHT - 40, dx: -1, dy: -1 },
  ];
  for (const c of corners) {
    ctx.beginPath();
    ctx.moveTo(c.x + c.dx * bracketLen, c.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x, c.y + c.dy * bracketLen);
    ctx.stroke();
  }

  // "MASTER OPERATOR" or similar header
  ctx.font = "500 14px sans-serif";
  ctx.fillStyle = "#FFD700";
  ctx.textAlign = "center";
  ctx.letterSpacing = "6px";
  ctx.fillText("MASTER OPERATOR", CARD_WIDTH / 2, 72);
  ctx.letterSpacing = "0px";

  // Gold line under header
  const lineGrad = ctx.createLinearGradient(300, 0, CARD_WIDTH - 300, 0);
  lineGrad.addColorStop(0, "transparent");
  lineGrad.addColorStop(0.5, "#FFD700");
  lineGrad.addColorStop(1, "transparent");
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(300, 90);
  ctx.lineTo(CARD_WIDTH - 300, 90);
  ctx.stroke();

  // Callsign in gold
  ctx.font = "bold 100px monospace";
  ctx.fillStyle = "#FFD700";
  ctx.shadowColor = "rgba(255, 215, 0, 0.3)";
  ctx.shadowBlur = 20;
  ctx.fillText(data.callsign, CARD_WIDTH / 2, 200);
  ctx.shadowBlur = 0;

  // Operator name
  if (data.operatorName) {
    ctx.font = "italic 28px serif";
    ctx.fillStyle = "#FCD34D";
    ctx.fillText(data.operatorName, CARD_WIDTH / 2, 265);
  }

  // Grid + info
  const details: string[] = [];
  if (data.grid) details.push(`Grid: ${data.grid}`);
  if (data.licenseClass) details.push(`Class: ${data.licenseClass}`);
  if (details.length > 0) {
    ctx.font = "400 18px monospace";
    ctx.fillStyle = "#B8860B";
    ctx.fillText(details.join("    "), CARD_WIDTH / 2, 320);
  }

  // Stats in gold-bordered boxes
  drawStatsRow(ctx, data, "#FFD700", "#B8860B");

  // Watermark
  ctx.font = "400 12px sans-serif";
  ctx.fillStyle = COLORS.gray600;
  ctx.textAlign = "right";
  ctx.fillText("ProPulse", CARD_WIDTH - 40, CARD_HEIGHT - 30);
}

// ─── Template: Aurora Field (Legendary+) ───────────────────────────────────

function renderAuroraField(
  ctx: CanvasRenderingContext2D,
  data: CardData,
): void {
  // Dark space background
  ctx.fillStyle = "#050510";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Northern lights gradient bands
  const auroraGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  auroraGrad.addColorStop(0, "rgba(56, 189, 248, 0.08)");
  auroraGrad.addColorStop(0.25, "rgba(52, 211, 153, 0.06)");
  auroraGrad.addColorStop(0.5, "rgba(167, 139, 250, 0.08)");
  auroraGrad.addColorStop(0.75, "rgba(244, 114, 182, 0.05)");
  auroraGrad.addColorStop(1, "rgba(56, 189, 248, 0.06)");
  ctx.fillStyle = auroraGrad;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Horizontal aurora bands (sine wave fills)
  ctx.save();
  for (let band = 0; band < 4; band++) {
    const colors = ["#38BDF8", "#34D399", "#A78BFA", "#F472B6"];
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = colors[band];
    ctx.beginPath();
    const baseY = 100 + band * 120;
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= CARD_WIDTH; x += 4) {
      const y = baseY + Math.sin((x + band * 200) * 0.008) * 40;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(CARD_WIDTH, CARD_HEIGHT);
    ctx.lineTo(0, CARD_HEIGHT);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Subtle star field
  ctx.save();
  ctx.fillStyle = "#ffffff";
  const starSeed = data.callsign.length * 7;
  for (let i = 0; i < 60; i++) {
    const sx = (starSeed * (i + 1) * 13) % CARD_WIDTH;
    const sy = (starSeed * (i + 1) * 37) % CARD_HEIGHT;
    ctx.globalAlpha = 0.1 + (i % 5) * 0.06;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
  ctx.restore();

  // Border with aurora tint
  ctx.strokeStyle = "rgba(255, 215, 0, 0.25)";
  ctx.lineWidth = 2;
  roundRect(ctx, 16, 16, CARD_WIDTH - 32, CARD_HEIGHT - 32, 12);
  ctx.stroke();

  // Callsign with multi-color shadow
  ctx.font = "bold 110px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Multi-glow
  ctx.shadowColor = "#38BDF8";
  ctx.shadowBlur = 30;
  ctx.fillStyle = COLORS.white;
  ctx.fillText(data.callsign, CARD_WIDTH / 2, CARD_HEIGHT * 0.35);
  ctx.shadowColor = "#A78BFA";
  ctx.shadowBlur = 20;
  ctx.fillText(data.callsign, CARD_WIDTH / 2, CARD_HEIGHT * 0.35);
  ctx.shadowBlur = 0;

  // Operator name
  if (data.operatorName) {
    ctx.font = "300 26px sans-serif";
    ctx.fillStyle = "#E0E7FF";
    ctx.fillText(data.operatorName, CARD_WIDTH / 2, CARD_HEIGHT * 0.5);
  }

  // Info line
  const infoLine = [data.grid, data.licenseClass].filter(Boolean).join("  |  ");
  if (infoLine) {
    ctx.font = "500 20px monospace";
    ctx.fillStyle = "#34D399";
    ctx.fillText(infoLine, CARD_WIDTH / 2, CARD_HEIGHT * 0.6);
  }

  drawStatsRow(ctx, data, COLORS.white, COLORS.gray400);

  // Watermark
  ctx.font = "400 12px sans-serif";
  ctx.fillStyle = COLORS.gray600;
  ctx.textAlign = "right";
  ctx.fillText("ProPulse", CARD_WIDTH - 24, CARD_HEIGHT - 18);
}

// ─── Template: Ethereal Rift (Ethereal only) ───────────────────────────────

function renderEtherealRift(
  ctx: CanvasRenderingContext2D,
  data: CardData,
): void {
  // Ultra dark base
  ctx.fillStyle = "#030308";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Central rift — radial gradient with chromatic separation
  const riftX = CARD_WIDTH / 2;
  const riftY = CARD_HEIGHT * 0.4;

  // Blue rift layer
  const rift1 = ctx.createRadialGradient(
    riftX - 20,
    riftY,
    0,
    riftX,
    riftY,
    400,
  );
  rift1.addColorStop(0, "rgba(56, 189, 248, 0.15)");
  rift1.addColorStop(0.4, "rgba(56, 189, 248, 0.05)");
  rift1.addColorStop(1, "transparent");
  ctx.fillStyle = rift1;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Purple rift layer
  const rift2 = ctx.createRadialGradient(
    riftX + 20,
    riftY,
    0,
    riftX,
    riftY,
    350,
  );
  rift2.addColorStop(0, "rgba(167, 139, 250, 0.12)");
  rift2.addColorStop(0.5, "rgba(167, 139, 250, 0.04)");
  rift2.addColorStop(1, "transparent");
  ctx.fillStyle = rift2;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Green rift layer
  const rift3 = ctx.createRadialGradient(
    riftX,
    riftY + 30,
    0,
    riftX,
    riftY,
    300,
  );
  rift3.addColorStop(0, "rgba(52, 211, 153, 0.08)");
  rift3.addColorStop(0.6, "rgba(52, 211, 153, 0.02)");
  rift3.addColorStop(1, "transparent");
  ctx.fillStyle = rift3;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Rift energy lines
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#A78BFA";
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const len = 200 + (i % 3) * 60;
    ctx.beginPath();
    ctx.moveTo(riftX, riftY);
    ctx.lineTo(
      riftX + Math.cos(angle) * len,
      riftY + Math.sin(angle) * len * 0.4,
    );
    ctx.stroke();
  }
  ctx.restore();

  // Chromatic border with color shifting
  const borderColors = ["#38BDF8", "#A78BFA", "#34D399", "#F472B6"];
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = borderColors[i];
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1.5;
    const offset = i * 2;
    roundRect(
      ctx,
      12 + offset,
      12 + offset,
      CARD_WIDTH - 24 - offset * 2,
      CARD_HEIGHT - 24 - offset * 2,
      12,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // "ETHEREAL" header
  ctx.font = "500 12px sans-serif";
  ctx.fillStyle = "#A78BFA";
  ctx.textAlign = "center";
  ctx.letterSpacing = "8px";
  ctx.fillText("ETHEREAL", CARD_WIDTH / 2, 55);
  ctx.letterSpacing = "0px";

  // Callsign with chromatic split
  ctx.font = "bold 110px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Chromatic text layers
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#38BDF8";
  ctx.fillText(data.callsign, CARD_WIDTH / 2 - 2, CARD_HEIGHT * 0.36 - 1);
  ctx.fillStyle = "#F472B6";
  ctx.fillText(data.callsign, CARD_WIDTH / 2 + 2, CARD_HEIGHT * 0.36 + 1);
  ctx.restore();

  // Main callsign text
  ctx.fillStyle = COLORS.white;
  ctx.shadowColor = "#A78BFA";
  ctx.shadowBlur = 25;
  ctx.fillText(data.callsign, CARD_WIDTH / 2, CARD_HEIGHT * 0.36);
  ctx.shadowBlur = 0;

  // Operator name
  if (data.operatorName) {
    ctx.font = "300 24px sans-serif";
    ctx.fillStyle = "#C4B5FD";
    ctx.fillText(data.operatorName, CARD_WIDTH / 2, CARD_HEIGHT * 0.52);
  }

  // Info
  const infoLine = [data.grid, data.licenseClass].filter(Boolean).join("  |  ");
  if (infoLine) {
    ctx.font = "500 18px monospace";
    ctx.fillStyle = "#38BDF8";
    ctx.fillText(infoLine, CARD_WIDTH / 2, CARD_HEIGHT * 0.62);
  }

  drawStatsRow(ctx, data, COLORS.white, COLORS.gray400);

  // Watermark
  ctx.font = "400 12px sans-serif";
  ctx.fillStyle = COLORS.gray600;
  ctx.textAlign = "right";
  ctx.fillText("ProPulse", CARD_WIDTH - 24, CARD_HEIGHT - 18);

  drawScanlines(ctx, CARD_WIDTH, CARD_HEIGHT, 0.015);
}

// ─── Public API ──────────────────────────────────────────────────────────────

const TEMPLATE_RENDERERS: Record<
  CardTemplate,
  (ctx: CanvasRenderingContext2D, data: CardData) => void
> = {
  minimalist: renderMinimalist,
  classic: renderClassic,
  contest: renderContest,
  "signal-wave": renderSignalWave,
  "golden-plate": renderGoldenPlate,
  "aurora-field": renderAuroraField,
  "ethereal-rift": renderEtherealRift,
};

/**
 * Render a profile card to a PNG Blob.
 *
 * Creates an offscreen canvas, draws the selected template, and returns
 * the result as a Blob for download or sharing.
 *
 * @param data    Profile data to render on the card
 * @param template  Visual template to use
 * @param options  Optional rendering options (QR code, etc.)
 * @returns Promise<Blob> containing the PNG image
 */
export async function renderProfileCard(
  data: CardData,
  template: CardTemplate,
  options?: { showQR?: boolean },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas 2D context");
  }

  const renderer = TEMPLATE_RENDERERS[template];
  renderer(ctx, data);

  // Draw QR code in bottom-right corner if requested
  if (options?.showQR && data.callsign && data.callsign !== "N0CALL") {
    const qrUrl = `https://propulse.app/profile/${data.callsign}`;
    await drawQRCode(ctx, qrUrl, CARD_WIDTH - 100, CARD_HEIGHT - 100, 80);
  }

  return canvasToBlob(canvas);
}

/**
 * Render a profile card and return an object URL for preview.
 *
 * Caller is responsible for revoking the URL via URL.revokeObjectURL()
 * when it is no longer needed to avoid memory leaks.
 */
export async function renderProfileCardPreview(
  data: CardData,
  template: CardTemplate,
  options?: { showQR?: boolean },
): Promise<string> {
  const blob = await renderProfileCard(data, template, options);
  return URL.createObjectURL(blob);
}
