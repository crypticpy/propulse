/**
 * ft8ShareGenerator.ts — Canvas-based image generator for sharing session
 * summaries, decode maps, QSO cards, and contest scores as social images.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for generating a share image */
export interface ShareImageOptions {
  /** Type of image to generate */
  type: "session_summary" | "decode_map" | "qso_card" | "contest_score";
  /** Image dimensions */
  width?: number; // default 1200
  height?: number; // default 630 (OG image ratio)
  /** Background style */
  theme?: "dark" | "light";
}

/** Session summary data for the share image */
export interface SessionSummaryData {
  callsign: string;
  grid: string;
  totalDecodes: number;
  uniqueCountries: number;
  uniqueGrids: number;
  qsosCompleted: number;
  bestDxCallsign: string;
  bestDxKm: number;
  sessionDuration: string; // "4h 32m"
  mode: "FT8" | "FT4";
  date: string;
}

/** QSO card data */
export interface QsoCardData {
  myCallsign: string;
  theirCallsign: string;
  frequency: string;
  mode: "FT8" | "FT4";
  date: string;
  time: string;
  reportSent: string;
  reportReceived: string;
  grid?: string;
  country?: string;
  distanceKm?: number;
}

/** Contest score data */
export interface ContestScoreData {
  callsign: string;
  contestName: string;
  totalQsos: number;
  totalPoints: number;
  multipliers: number;
  finalScore: number;
  bandBreakdown: Record<string, { qsos: number; points: number }>;
}

// ---------------------------------------------------------------------------
// Theme palettes
// ---------------------------------------------------------------------------

interface ThemePalette {
  bg1: string;
  bg2: string;
  accent: string;
  accentDim: string;
  textPrimary: string;
  textSecondary: string;
  cardBg: string;
  barBg: string;
  barFill: string;
}

const DARK_PALETTE: ThemePalette = {
  bg1: "#0a0e1a",
  bg2: "#131b2e",
  accent: "#22d3ee",
  accentDim: "rgba(34,211,238,0.25)",
  textPrimary: "#ffffff",
  textSecondary: "#94a3b8",
  cardBg: "rgba(255,255,255,0.06)",
  barBg: "rgba(255,255,255,0.08)",
  barFill: "#22d3ee",
};

const LIGHT_PALETTE: ThemePalette = {
  bg1: "#f0f4f8",
  bg2: "#e2e8f0",
  accent: "#0891b2",
  accentDim: "rgba(8,145,178,0.15)",
  textPrimary: "#0f172a",
  textSecondary: "#64748b",
  cardBg: "rgba(0,0,0,0.04)",
  barBg: "rgba(0,0,0,0.06)",
  barFill: "#0891b2",
};

function getPalette(theme: "dark" | "light"): ThemePalette {
  return theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function createCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  // Prefer OffscreenCanvas when available (workers, modern browsers)
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get OffscreenCanvas 2D context");
    return { canvas, ctx };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get Canvas 2D context");
  return { canvas, ctx };
}

function drawBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  palette: ThemePalette,
): void {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, palette.bg1);
  grad.addColorStop(1, palette.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawBranding(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  palette: ThemePalette,
): void {
  ctx.font = "bold 24px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.accent;
  ctx.textBaseline = "top";
  ctx.fillText("PROPULSE", 40, 30);
}

function drawFooter(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  palette: ThemePalette,
  leftText: string,
  rightText: string,
): void {
  const y = h - 40;
  ctx.font = "14px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.textSecondary;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillText(leftText, 40, y);
  ctx.textAlign = "right";
  ctx.fillText(rightText, w - 40, y);
  ctx.textAlign = "left"; // reset
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
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

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderSessionSummary(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  palette: ThemePalette,
  data: SessionSummaryData,
): void {
  drawBackground(ctx, w, h, palette);
  drawBranding(ctx, palette);

  // Callsign header
  ctx.font = "bold 48px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.textPrimary;
  ctx.textBaseline = "top";
  ctx.fillText(data.callsign, 40, 80);

  // Grid + mode badge
  ctx.font = "20px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.textSecondary;
  ctx.fillText(
    `${data.grid}  |  ${data.mode}  |  ${data.sessionDuration}`,
    40,
    140,
  );

  // Stats grid — 2 rows x 3 columns
  const stats = [
    { label: "Decodes", value: data.totalDecodes.toLocaleString() },
    { label: "Countries", value: data.uniqueCountries.toLocaleString() },
    { label: "Grids", value: data.uniqueGrids.toLocaleString() },
    { label: "QSOs", value: data.qsosCompleted.toLocaleString() },
    { label: "Best DX", value: `${data.bestDxKm.toLocaleString()} km` },
    { label: "Best DX Call", value: data.bestDxCallsign },
  ];

  const cols = 3;
  const colW = (w - 80) / cols;
  const startY = 200;
  const rowH = 130;

  for (let i = 0; i < stats.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 40 + col * colW;
    const y = startY + row * rowH;

    // Card background
    drawRoundedRect(ctx, x, y, colW - 16, rowH - 16, 12);
    ctx.fillStyle = palette.cardBg;
    ctx.fill();

    // Value
    ctx.font = "bold 36px 'Inter', 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = palette.accent;
    ctx.textBaseline = "top";
    ctx.fillText(stats[i].value, x + 20, y + 20);

    // Label
    ctx.font = "14px 'Inter', 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = palette.textSecondary;
    ctx.fillText(stats[i].label, x + 20, y + 68);
  }

  drawFooter(ctx, w, h, palette, `Session — ${data.date}`, "propulse.app");
}

function renderQsoCard(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  palette: ThemePalette,
  data: QsoCardData,
): void {
  drawBackground(ctx, w, h, palette);
  drawBranding(ctx, palette);

  // Large callsign display
  const centerX = w / 2;

  ctx.textAlign = "center";
  ctx.font = "bold 56px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.textPrimary;
  ctx.textBaseline = "top";
  ctx.fillText(data.theirCallsign, centerX, 100);

  // Worked by
  ctx.font = "18px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.textSecondary;
  ctx.fillText(`worked by ${data.myCallsign}`, centerX, 170);

  // Divider accent line
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - 120, 210);
  ctx.lineTo(centerX + 120, 210);
  ctx.stroke();

  // Details grid
  const details: [string, string][] = [
    ["Frequency", data.frequency],
    ["Mode", data.mode],
    ["Date", data.date],
    ["Time", data.time],
    ["Sent", data.reportSent],
    ["Rcvd", data.reportReceived],
  ];

  if (data.country) details.push(["Country", data.country]);
  if (data.grid) details.push(["Grid", data.grid]);
  if (data.distanceKm != null)
    details.push(["Distance", `${data.distanceKm.toLocaleString()} km`]);

  const detailCols = 3;
  const detailColW = (w - 120) / detailCols;
  const detailStartY = 240;
  const detailRowH = 60;

  for (let i = 0; i < details.length; i++) {
    const col = i % detailCols;
    const row = Math.floor(i / detailCols);
    const x = 60 + col * detailColW;
    const y = detailStartY + row * detailRowH;

    ctx.textAlign = "left";
    ctx.font = "12px 'Inter', 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = palette.textSecondary;
    ctx.textBaseline = "top";
    ctx.fillText(details[i][0].toUpperCase(), x, y);

    ctx.font = "bold 20px 'Inter', 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = palette.textPrimary;
    ctx.fillText(details[i][1], x, y + 20);
  }

  ctx.textAlign = "left";
  drawFooter(
    ctx,
    w,
    h,
    palette,
    `${data.mode} QSO — ${data.date}`,
    "propulse.app",
  );
}

function renderContestScore(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  palette: ThemePalette,
  data: ContestScoreData,
): void {
  drawBackground(ctx, w, h, palette);
  drawBranding(ctx, palette);

  // Contest name + callsign
  ctx.font = "bold 20px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.textSecondary;
  ctx.textBaseline = "top";
  ctx.fillText(data.contestName.toUpperCase(), 40, 75);

  ctx.font = "bold 40px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.textPrimary;
  ctx.fillText(data.callsign, 40, 105);

  // Score big number
  ctx.font = "bold 64px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.accent;
  ctx.textAlign = "right";
  ctx.fillText(data.finalScore.toLocaleString(), w - 40, 85);

  ctx.font = "14px 'Inter', 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = palette.textSecondary;
  ctx.fillText("FINAL SCORE", w - 40, 160);
  ctx.textAlign = "left";

  // Summary row: QSOs | Points | Multipliers
  const summaryY = 195;
  const summaryItems = [
    { label: "QSOs", value: data.totalQsos.toLocaleString() },
    { label: "Points", value: data.totalPoints.toLocaleString() },
    { label: "Multipliers", value: data.multipliers.toLocaleString() },
  ];
  const sumColW = (w - 80) / summaryItems.length;
  for (let i = 0; i < summaryItems.length; i++) {
    const x = 40 + i * sumColW;
    drawRoundedRect(ctx, x, summaryY, sumColW - 12, 70, 8);
    ctx.fillStyle = palette.cardBg;
    ctx.fill();
    ctx.font = "bold 28px 'Inter', 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = palette.textPrimary;
    ctx.textBaseline = "top";
    ctx.fillText(summaryItems[i].value, x + 16, summaryY + 12);
    ctx.font = "12px 'Inter', 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = palette.textSecondary;
    ctx.fillText(summaryItems[i].label.toUpperCase(), x + 16, summaryY + 46);
  }

  // Band breakdown bars
  const bands = Object.entries(data.bandBreakdown);
  if (bands.length > 0) {
    const barAreaY = 300;
    const barAreaH = h - barAreaY - 60;
    const barH = Math.min(28, (barAreaH - 10) / bands.length - 6);
    const maxQsos = Math.max(...bands.map(([, v]) => v.qsos), 1);
    const barMaxW = w - 200;

    for (let i = 0; i < bands.length; i++) {
      const [band, info] = bands[i];
      const y = barAreaY + i * (barH + 6);

      // Label
      ctx.font = "bold 14px 'Inter', 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = palette.textSecondary;
      ctx.textBaseline = "middle";
      ctx.fillText(band, 40, y + barH / 2);

      // Background bar
      const barX = 110;
      drawRoundedRect(ctx, barX, y, barMaxW, barH, 4);
      ctx.fillStyle = palette.barBg;
      ctx.fill();

      // Filled bar
      const fillW = Math.max(4, (info.qsos / maxQsos) * barMaxW);
      drawRoundedRect(ctx, barX, y, fillW, barH, 4);
      ctx.fillStyle = palette.barFill;
      ctx.fill();

      // QSO count
      ctx.font = "12px 'Inter', 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = palette.textPrimary;
      ctx.textAlign = "right";
      ctx.fillText(`${info.qsos} Qs`, w - 40, y + barH / 2);
      ctx.textAlign = "left";
    }
  }

  drawFooter(ctx, w, h, palette, data.contestName, "propulse.app");
}

// ---------------------------------------------------------------------------
// Canvas → output helpers
// ---------------------------------------------------------------------------

async function canvasToDataUrl(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<string> {
  if (canvas instanceof HTMLCanvasElement) {
    return canvas.toDataURL("image/png");
  }
  // OffscreenCanvas
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      }, "image/png");
    });
  }
  return canvas.convertToBlob({ type: "image/png" });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a shareable image using Canvas 2D.
 * Returns a data URL (PNG).
 */
export async function generateShareImage(
  options: ShareImageOptions & {
    data: SessionSummaryData | QsoCardData | ContestScoreData;
  },
): Promise<string> {
  const width = options.width ?? 1200;
  const height = options.height ?? 630;
  const theme = options.theme ?? "dark";
  const palette = getPalette(theme);

  const { canvas, ctx } = createCanvas(width, height);

  switch (options.type) {
    case "session_summary":
      renderSessionSummary(
        ctx,
        width,
        height,
        palette,
        options.data as SessionSummaryData,
      );
      break;
    case "qso_card":
      renderQsoCard(ctx, width, height, palette, options.data as QsoCardData);
      break;
    case "contest_score":
      renderContestScore(
        ctx,
        width,
        height,
        palette,
        options.data as ContestScoreData,
      );
      break;
    case "decode_map":
      // Decode map shares the same layout as session summary for now;
      // a full map renderer would layer a world-map SVG underneath.
      renderSessionSummary(
        ctx,
        width,
        height,
        palette,
        options.data as SessionSummaryData,
      );
      break;
  }

  return canvasToDataUrl(canvas);
}

/**
 * Generate and download the share image as a file.
 */
export async function downloadShareImage(
  filename: string,
  options: ShareImageOptions & {
    data: SessionSummaryData | QsoCardData | ContestScoreData;
  },
): Promise<void> {
  const dataUrl = await generateShareImage(options);
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  // Clean up after a tick to ensure the download starts
  setTimeout(() => {
    document.body.removeChild(anchor);
  }, 100);
}

/**
 * Copy share image to clipboard (if supported).
 * Returns true if the copy succeeded, false otherwise.
 */
export async function copyShareImageToClipboard(
  options: ShareImageOptions & {
    data: SessionSummaryData | QsoCardData | ContestScoreData;
  },
): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof ClipboardItem === "undefined"
  ) {
    return false;
  }

  try {
    const width = options.width ?? 1200;
    const height = options.height ?? 630;
    const theme = options.theme ?? "dark";
    const palette = getPalette(theme);

    const { canvas, ctx } = createCanvas(width, height);

    switch (options.type) {
      case "session_summary":
      case "decode_map":
        renderSessionSummary(
          ctx,
          width,
          height,
          palette,
          options.data as SessionSummaryData,
        );
        break;
      case "qso_card":
        renderQsoCard(ctx, width, height, palette, options.data as QsoCardData);
        break;
      case "contest_score":
        renderContestScore(
          ctx,
          width,
          height,
          palette,
          options.data as ContestScoreData,
        );
        break;
    }

    const blob = await canvasToBlob(canvas);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
