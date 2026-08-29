/**
 * QthScopeCard Component (G18)
 *
 * Circular range-ring scope centered on the operator's QTH: live
 * lightning strikes and fire hotspots plotted by bearing/distance,
 * radar-style sweep, and an opt-in proximity ping for close strikes.
 * Pure presentation over the existing lightning/fires feeds.
 *
 * @module components/dashboard/QthScopeCard
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useUserStore } from "@/stores/userStore";
import { useLightning } from "@/hooks/useLightning";
import { useFires } from "@/hooks/useFires";
import { projectToScope, type ScopeBlip } from "@/lib/utils/scope";
import { playProximityPing } from "@/lib/audio/proximityPing";
import { prefersReducedMotion } from "@/lib/utils/a11y";

const RANGES_KM = [100, 250, 500] as const;
/** Strikes older than this render at minimum brightness */
const STRIKE_FADE_MS = 30 * 60 * 1000;
/** Internal canvas resolution (CSS scales to card width) */
const CANVAS_PX = 480;

interface TimedBlip extends ScopeBlip {
  ageMs: number;
}

function drawScope(
  canvas: HTMLCanvasElement,
  strikes: TimedBlip[],
  fires: ScopeBlip[],
  rangeKm: number,
  sweepDeg: number | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = CANVAS_PX;
  const c = size / 2;
  const radius = c - 18;
  ctx.clearRect(0, 0, size, size);

  // Scope face
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fill();

  // Sweep wedge (drawn under rings and blips)
  if (sweepDeg !== null) {
    const theta = ((sweepDeg - 90) * Math.PI) / 180;
    const grad = ctx.createConicGradient
      ? ctx.createConicGradient(theta, c, c)
      : null;
    if (grad) {
      grad.addColorStop(0, "rgba(74, 222, 128, 0.16)");
      grad.addColorStop(0.12, "rgba(74, 222, 128, 0)");
      grad.addColorStop(1, "rgba(74, 222, 128, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(74, 222, 128, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(theta) * radius, c + Math.sin(theta) * radius);
    ctx.stroke();
  }

  // Range rings + crosshair
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  for (const frac of [1 / 3, 2 / 3, 1]) {
    ctx.beginPath();
    ctx.arc(c, c, radius * frac, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.beginPath();
  ctx.moveTo(c - radius, c);
  ctx.lineTo(c + radius, c);
  ctx.moveTo(c, c - radius);
  ctx.lineTo(c, c + radius);
  ctx.stroke();

  // Cardinal letters + ring distances
  ctx.fillStyle = "rgba(156, 163, 175, 0.9)";
  ctx.font = "600 18px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", c, c - radius - 9);
  ctx.fillText("S", c, c + radius + 9);
  ctx.fillText("E", c + radius + 9, c);
  ctx.fillText("W", c - radius - 9, c);
  ctx.fillStyle = "rgba(156, 163, 175, 0.55)";
  ctx.font = "13px 'JetBrains Mono', monospace";
  ctx.textAlign = "left";
  for (const frac of [1 / 3, 2 / 3, 1]) {
    ctx.fillText(
      `${Math.round(rangeKm * frac)}`,
      c + 5,
      c - radius * frac + 12,
    );
  }

  // Fire hotspots — steady embers
  for (const fire of fires) {
    ctx.fillStyle = "rgba(249, 115, 22, 0.85)";
    ctx.beginPath();
    ctx.arc(c + fire.x * radius, c + fire.y * radius, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lightning strikes — brightness fades with age
  for (const strike of strikes) {
    const freshness = Math.max(0, 1 - strike.ageMs / STRIKE_FADE_MS);
    const alpha = 0.25 + 0.75 * freshness;
    const x = c + strike.x * radius;
    const y = c + strike.y * radius;
    ctx.fillStyle = `rgba(96, 165, 250, ${alpha * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(226, 240, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // QTH marker
  ctx.fillStyle = "rgba(74, 222, 128, 1)";
  ctx.beginPath();
  ctx.arc(c, c, 4, 0, Math.PI * 2);
  ctx.fill();
}

export interface QthScopeCardProps {
  className?: string;
}

export function QthScopeCard({ className = "" }: QthScopeCardProps) {
  const station = useUserStore((s) => s.station);
  const hasLocation = station?.lat != null && station?.lon != null;
  const { strikes } = useLightning(hasLocation);
  const { hotspots } = useFires(hasLocation);

  const [rangeIndex, setRangeIndex] = useState(1);
  const [audioOn, setAudioOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sweepRef = useRef(0);
  const seenStrikesRef = useRef<Set<string> | null>(null);
  const rangeKm = RANGES_KM[rangeIndex];

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const strikeBlips = useMemo(() => {
    if (!hasLocation) return [];
    const blips: TimedBlip[] = [];
    for (const strike of strikes) {
      const blip = projectToScope(
        station.lat,
        station.lon,
        strike.lat,
        strike.lon,
        rangeKm,
      );
      if (blip) blips.push({ ...blip, ageMs: Math.max(0, now - strike.time) });
    }
    return blips;
  }, [strikes, station, hasLocation, rangeKm, now]);

  const fireBlips = useMemo(() => {
    if (!hasLocation) return [];
    const blips: ScopeBlip[] = [];
    for (const fire of hotspots) {
      const blip = projectToScope(
        station.lat,
        station.lon,
        fire.lat,
        fire.lon,
        rangeKm,
      );
      if (blip) blips.push(blip);
    }
    return blips;
  }, [hotspots, station, hasLocation, rangeKm]);

  // Proximity ping: nearest strike that's new since the last data batch.
  // The first batch only seeds the seen-set so mounting is silent.
  useEffect(() => {
    if (!hasLocation) return;
    const seen = seenStrikesRef.current;
    const next = new Set<string>();
    let nearestNew: number | null = null;
    for (const strike of strikes) {
      const key = `${strike.lat},${strike.lon},${strike.time}`;
      next.add(key);
      if (seen !== null && !seen.has(key)) {
        const blip = projectToScope(
          station.lat,
          station.lon,
          strike.lat,
          strike.lon,
          rangeKm,
        );
        if (blip && (nearestNew === null || blip.distanceKm < nearestNew)) {
          nearestNew = blip.distanceKm;
        }
      }
    }
    seenStrikesRef.current = next;
    if (audioOn && nearestNew !== null) {
      playProximityPing(1 - nearestNew / rangeKm);
    }
  }, [strikes, hasLocation, station, rangeKm, audioOn]);

  // Render loop: sweeping when motion is allowed, static redraw otherwise
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasLocation) return;
    if (prefersReducedMotion()) {
      drawScope(canvas, strikeBlips, fireBlips, rangeKm, null);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      sweepRef.current = (sweepRef.current + (t - last) * 0.024) % 360;
      last = t;
      drawScope(canvas, strikeBlips, fireBlips, rangeKm, sweepRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [strikeBlips, fireBlips, rangeKm, hasLocation]);

  const nearestStrike = strikeBlips.reduce<number | null>(
    (min, b) => (min === null || b.distanceKm < min ? b.distanceKm : min),
    null,
  );

  return (
    <Card className={className} role="region" aria-label="QTH scope">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          QTH Scope
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAudioOn((on) => !on)}
            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
              audioOn
                ? "border-signal-green/50 text-signal-green"
                : "border-white/10 text-gray-500 hover:text-gray-300"
            }`}
            title="Ping when a new strike lands inside the scope"
            aria-pressed={audioOn}
          >
            ♪ {audioOn ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => setRangeIndex((i) => (i + 1) % RANGES_KM.length)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-gray-300 font-mono tabular-nums hover:border-white/25 transition-colors"
            title="Cycle scope range"
          >
            {rangeKm} km
          </button>
        </div>
      </div>

      {hasLocation ? (
        <>
          <canvas
            ref={canvasRef}
            width={CANVAS_PX}
            height={CANVAS_PX}
            className="w-full h-auto"
            role="img"
            aria-label={`Range scope, ${rangeKm} kilometers: ${strikeBlips.length} lightning strikes and ${fireBlips.length} fire hotspots in range`}
          />
          <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10">
            <span>
              <span className="text-nebula-blue" aria-hidden="true">
                ⚡
              </span>{" "}
              <span className="text-gray-200 font-mono tabular-nums">
                {strikeBlips.length}
              </span>
              <span className="text-gray-500"> strikes</span>
            </span>
            <span>
              <span className="text-plasma-orange" aria-hidden="true">
                ●
              </span>{" "}
              <span className="text-gray-200 font-mono tabular-nums">
                {fireBlips.length}
              </span>
              <span className="text-gray-500"> fires</span>
            </span>
            <span className="text-gray-500">
              nearest{" "}
              <span className="text-gray-200 font-mono tabular-nums">
                {nearestStrike === null
                  ? "—"
                  : `${Math.round(nearestStrike)} km`}
              </span>
            </span>
          </div>
        </>
      ) : (
        <div className="text-xs text-gray-500 py-6 text-center">
          Set your grid in Profile to activate the scope
        </div>
      )}
    </Card>
  );
}

QthScopeCard.displayName = "QthScopeCard";

export default QthScopeCard;
