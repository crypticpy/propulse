/**
 * Canvas-based profile card renderer for sharing.
 *
 * Generates 1200x630px card images (OG image size) using the Canvas 2D API.
 * Three templates: "minimalist" (dark), "classic" (ham radio), "contest" (bold).
 * Returns a Blob suitable for download or Web Share API.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type CardTemplate = "minimalist" | "classic" | "contest";

export interface CardData {
  callsign: string;
  operatorName?: string;
  grid?: string;
  licenseClass?: string;
  country?: string;
  totalQSOs?: number;
  dxccCount?: number;
}

export const CARD_TEMPLATES: {
  id: CardTemplate;
  label: string;
  description: string;
}[] = [
  {
    id: "minimalist",
    label: "Minimalist Dark",
    description: "Clean dark background with plasma-orange callsign",
  },
  {
    id: "classic",
    label: "Classic Ham",
    description: "Traditional ham radio style with amber/gold tones",
  },
  {
    id: "contest",
    label: "Contest Fighter",
    description: "Bold, high-contrast with prominent stats",
  },
];

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

// ─── Public API ──────────────────────────────────────────────────────────────

const TEMPLATE_RENDERERS: Record<
  CardTemplate,
  (ctx: CanvasRenderingContext2D, data: CardData) => void
> = {
  minimalist: renderMinimalist,
  classic: renderClassic,
  contest: renderContest,
};

/**
 * Render a profile card to a PNG Blob.
 *
 * Creates an offscreen canvas, draws the selected template, and returns
 * the result as a Blob for download or sharing.
 *
 * @param data    Profile data to render on the card
 * @param template  Visual template to use
 * @returns Promise<Blob> containing the PNG image
 */
export async function renderProfileCard(
  data: CardData,
  template: CardTemplate,
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
): Promise<string> {
  const blob = await renderProfileCard(data, template);
  return URL.createObjectURL(blob);
}
