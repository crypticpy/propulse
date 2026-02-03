/**
 * MiniMapNavigator Component
 *
 * A small overview mini-map that shows the full world with a viewport indicator,
 * allowing users to quickly navigate to different areas. Uses Canvas 2D for
 * high-performance rendering.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useMapStore, type ViewMode } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";

const MINI_MAP_WIDTH = 140;
const MINI_MAP_HEIGHT = 80;

// Simplified world coastline data
const WORLD_COASTLINES: Array<Array<[number, number]>> = [
  [
    [-125, 48],
    [-124, 42],
    [-120, 34],
    [-117, 32],
    [-110, 23],
    [-105, 20],
  ],
  [
    [-67, 47],
    [-70, 42],
    [-75, 35],
    [-80, 25],
    [-88, 30],
    [-97, 26],
  ],
  [
    [-97, 26],
    [-95, 28],
    [-90, 30],
    [-88, 30],
  ],
  [
    [-105, 20],
    [-100, 18],
    [-90, 16],
    [-83, 10],
    [-80, 8],
  ],
  [
    [-80, 8],
    [-81, 0],
    [-81, -5],
    [-77, -12],
    [-71, -18],
    [-70, -30],
    [-73, -40],
    [-75, -55],
  ],
  [
    [-35, -5],
    [-38, -13],
    [-43, -23],
    [-48, -28],
    [-53, -34],
    [-58, -38],
    [-65, -55],
  ],
  [
    [-10, 36],
    [-9, 43],
    [-5, 48],
    [-6, 58],
    [5, 62],
    [10, 64],
    [25, 70],
  ],
  [
    [-6, 36],
    [0, 38],
    [10, 44],
    [15, 40],
    [25, 35],
    [35, 32],
  ],
  [
    [-17, 15],
    [-15, 10],
    [5, 5],
    [10, 0],
    [12, -5],
    [18, -34],
  ],
  [
    [50, 12],
    [45, 0],
    [40, -12],
    [35, -25],
    [28, -34],
  ],
  [
    [35, 32],
    [40, 38],
    [50, 27],
    [60, 25],
  ],
  [
    [68, 23],
    [72, 20],
    [77, 8],
    [80, 10],
    [88, 22],
  ],
  [
    [95, 20],
    [100, 10],
    [105, 15],
    [110, 5],
    [120, 0],
  ],
  [
    [110, 20],
    [118, 25],
    [122, 32],
    [125, 40],
    [130, 43],
    [140, 45],
  ],
  [
    [130, 32],
    [132, 34],
    [135, 35],
    [140, 36],
    [142, 43],
  ],
  [
    [115, -20],
    [118, -35],
    [138, -35],
    [145, -38],
    [150, -33],
    [153, -28],
    [145, -15],
    [130, -12],
    [115, -20],
  ],
];

export type MiniMapPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface MiniMapNavigatorProps {
  className?: string;
  position?: MiniMapPosition;
  onNavigate?: (lat: number, lon: number) => void;
  defaultVisible?: boolean;
}

const positionClasses: Record<MiniMapPosition, string> = {
  "top-left": "top-3 left-3",
  "top-right": "top-3 right-3",
  "bottom-left": "bottom-3 left-3",
  "bottom-right": "bottom-3 right-3",
};

function latLonToCanvas(
  lat: number,
  lon: number,
  width: number,
  height: number,
) {
  return {
    x: ((lon + 180) / 360) * width,
    y: ((90 - lat) / 180) * height,
  };
}

function canvasToLatLon(x: number, y: number, width: number, height: number) {
  return {
    lon: (x / width) * 360 - 180,
    lat: 90 - (y / height) * 180,
  };
}

function estimateViewportBounds(
  viewMode: ViewMode,
  zoom: number,
  centerLat?: number,
  centerLon?: number,
) {
  if (viewMode === "globe") {
    const baseSpan = 90;
    const latSpan = baseSpan / zoom;
    const lonSpan = (baseSpan * 1.5) / zoom;
    const lat = centerLat ?? 0;
    const lon = centerLon ?? 0;
    return {
      minLat: Math.max(-90, lat - latSpan / 2),
      maxLat: Math.min(90, lat + latSpan / 2),
      minLon: Math.max(-180, lon - lonSpan / 2),
      maxLon: Math.min(180, lon + lonSpan / 2),
    };
  }
  if (viewMode === "flat") {
    const baseLatSpan = 180 / zoom;
    const baseLonSpan = 360 / zoom;
    const lat = centerLat ?? 0;
    const lon = centerLon ?? 0;
    return {
      minLat: Math.max(-90, lat - baseLatSpan / 2),
      maxLat: Math.min(90, lat + baseLatSpan / 2),
      minLon: Math.max(-180, lon - baseLonSpan / 2),
      maxLon: Math.min(180, lon + baseLonSpan / 2),
    };
  }
  return null;
}

function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: {
    viewportBounds?: ReturnType<typeof estimateViewportBounds>;
    qthLat?: number;
    qthLon?: number;
    targetLat?: number;
    targetLon?: number;
    isDragging?: boolean;
  },
) {
  const { viewportBounds, qthLat, qthLon, targetLat, targetLon, isDragging } =
    options;

  ctx.clearRect(0, 0, width, height);

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0d1b2a");
  gradient.addColorStop(0.5, "#1b263b");
  gradient.addColorStop(1, "#0d1b2a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Coastlines
  ctx.strokeStyle = "rgba(100, 150, 180, 0.6)";
  ctx.lineWidth = 0.8;
  for (const coastline of WORLD_COASTLINES) {
    if (coastline.length < 2) continue;
    ctx.beginPath();
    const [firstLon, firstLat] = coastline[0];
    const firstPoint = latLonToCanvas(firstLat, firstLon, width, height);
    ctx.moveTo(firstPoint.x, firstPoint.y);
    for (let i = 1; i < coastline.length; i++) {
      const [lon, lat] = coastline[i];
      const point = latLonToCanvas(lat, lon, width, height);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  // Grid
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();

  // Viewport
  if (viewportBounds) {
    const topLeft = latLonToCanvas(
      viewportBounds.maxLat,
      viewportBounds.minLon,
      width,
      height,
    );
    const bottomRight = latLonToCanvas(
      viewportBounds.minLat,
      viewportBounds.maxLon,
      width,
      height,
    );
    ctx.fillStyle = isDragging
      ? "rgba(255, 107, 53, 0.25)"
      : "rgba(255, 107, 53, 0.15)";
    ctx.fillRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
    );
    ctx.strokeStyle = isDragging
      ? "rgba(255, 107, 53, 0.9)"
      : "rgba(255, 107, 53, 0.7)";
    ctx.lineWidth = isDragging ? 2 : 1.5;
    ctx.strokeRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
    );
  }

  // QTH marker
  if (qthLat !== undefined && qthLon !== undefined) {
    const qthPos = latLonToCanvas(qthLat, qthLon, width, height);
    ctx.fillStyle = "rgba(68, 136, 255, 0.4)";
    ctx.beginPath();
    ctx.arc(qthPos.x, qthPos.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4488FF";
    ctx.beginPath();
    ctx.arc(qthPos.x, qthPos.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Target marker
  if (targetLat !== undefined && targetLon !== undefined) {
    const targetPos = latLonToCanvas(targetLat, targetLon, width, height);
    ctx.fillStyle = "rgba(255, 107, 53, 0.4)";
    ctx.beginPath();
    ctx.arc(targetPos.x, targetPos.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff6b35";
    ctx.beginPath();
    ctx.arc(targetPos.x, targetPos.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function MiniMapNavigator({
  className = "",
  position = "bottom-left",
  onNavigate,
  defaultVisible = true,
}: MiniMapNavigatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(defaultVisible);
  const [isDragging] = useState(false);

  const { viewMode, zoom, target, setTarget } = useMapStore();
  const station = useUserStore((state) => state.station);

  const viewportBounds = useMemo(() => {
    return estimateViewportBounds(viewMode, zoom, station?.lat, station?.lon);
  }, [viewMode, zoom, station?.lat, station?.lon]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isVisible) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawMiniMap(ctx, MINI_MAP_WIDTH, MINI_MAP_HEIGHT, {
      viewportBounds,
      qthLat: station?.lat,
      qthLon: station?.lon,
      targetLat: target?.lat,
      targetLon: target?.lon,
      isDragging,
    });
  }, [
    viewportBounds,
    station?.lat,
    station?.lon,
    target?.lat,
    target?.lon,
    isVisible,
    isDragging,
  ]);

  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || isDragging) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = MINI_MAP_WIDTH / rect.width;
      const scaleY = MINI_MAP_HEIGHT / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const { lat, lon } = canvasToLatLon(
        x,
        y,
        MINI_MAP_WIDTH,
        MINI_MAP_HEIGHT,
      );
      setTarget({ lat, lon, name: `${lat.toFixed(1)}, ${lon.toFixed(1)}` });
      onNavigate?.(lat, lon);
    },
    [isDragging, setTarget, onNavigate],
  );

  if (!isVisible) {
    return (
      <div
        className={`absolute ${positionClasses[position]} z-20 pointer-events-auto ${className}`}
      >
        <button
          onClick={() => setIsVisible(true)}
          className="w-6 h-6 flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/10 hover:border-white/30 rounded-md transition-all"
          title="Show mini-map"
        >
          <svg
            className="w-3.5 h-3.5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`absolute ${positionClasses[position]} z-20 pointer-events-auto ${className}`}
    >
      <div className="relative rounded-lg overflow-hidden bg-black/70 backdrop-blur-md border border-white/10 shadow-lg">
        <div className="flex items-center justify-between px-2 py-1 bg-black/40 border-b border-white/5">
          <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">
            Overview
          </span>
          <button
            onClick={() => setIsVisible(false)}
            className="p-0.5 text-gray-500 hover:text-gray-300"
            title="Hide"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={MINI_MAP_WIDTH}
          height={MINI_MAP_HEIGHT}
          onClick={handleClick}
          className="block cursor-crosshair"
          style={{ width: MINI_MAP_WIDTH, height: MINI_MAP_HEIGHT }}
        />
        <div className="flex items-center justify-between px-2 py-1 bg-black/40 border-t border-white/5">
          <div className="flex items-center gap-2">
            {station && (
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4488FF]" />
                <span className="text-[8px] text-gray-500">QTH</span>
              </div>
            )}
            {target && (
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#ff6b35]" />
                <span className="text-[8px] text-gray-500">Target</span>
              </div>
            )}
          </div>
          <span className="text-[7px] text-gray-600">Click to navigate</span>
        </div>
      </div>
    </div>
  );
}

export default MiniMapNavigator;
