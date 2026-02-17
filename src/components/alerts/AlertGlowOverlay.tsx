/**
 * AlertGlowOverlay — Visual pulse accessibility for space weather alerts
 *
 * Renders a full-viewport inset box-shadow glow when WARNING/CRITICAL alerts
 * are active. Designed for deaf operators who may not hear audio alerts.
 *
 * Safety:
 * - 4-second pulse cycle (0.25 Hz) — well below 3 Hz epilepsy threshold
 * - prefers-reduced-motion: static glow, no animation
 * - pointer-events: none — does not block any UI interaction
 * - Opt-in via settings (visualAlertGlow, default false)
 */

import { useAlertsStore } from "@/stores/alertsStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { AlertType } from "@/types/alerts";

// ─── Glow color map by alert type ───────────────────────────────────────────

type GlowColor = { r: number; g: number; b: number };

const GLOW_COLORS: Partial<Record<AlertType, GlowColor>> = {
  GEOMAGNETIC_STORM: { r: 245, g: 158, b: 11 }, // amber
  DST_STORM: { r: 245, g: 158, b: 11 },
  IMF_SOUTHWARD: { r: 245, g: 158, b: 11 },
  RADIO_BLACKOUT: { r: 239, g: 68, b: 68 }, // red
  SOLAR_FLARE: { r: 239, g: 68, b: 68 },
  PROTON_EVENT: { r: 99, g: 102, b: 241 }, // indigo/blue
  CME_INCOMING: { r: 249, g: 115, b: 22 }, // orange
  AURORA_WARNING: { r: 139, g: 92, b: 246 }, // purple
};

const DEFAULT_GLOW: GlowColor = { r: 245, g: 158, b: 11 }; // amber fallback

// ─── Component ──────────────────────────────────────────────────────────────

export function AlertGlowOverlay() {
  const enabled = useSettingsStore(
    (s) => s.notifications?.visualAlertGlow === true,
  );

  // Select the single highest-priority active alert directly.
  // Returning an existing object reference (or null) keeps the selector stable
  // and avoids the infinite-rerender loop that .filter() caused (new array each call).
  const highestAlert = useAlertsStore((s) => {
    const critical = s.alerts.find(
      (a) => a.status === "ACTIVE" && a.priority === "CRITICAL",
    );
    if (critical) return critical;
    return (
      s.alerts.find((a) => a.status === "ACTIVE" && a.priority === "WARNING") ??
      null
    );
  });

  if (!enabled || !highestAlert) return null;

  const color = GLOW_COLORS[highestAlert.type] ?? DEFAULT_GLOW;
  const isCritical = highestAlert.priority === "CRITICAL";

  // WARNING: subtle inset glow. CRITICAL: stronger glow with pulse animation.
  const spread = isCritical ? 40 : 20;
  const blur = isCritical ? 120 : 80;
  const baseOpacity = isCritical ? 0.12 : 0.08;

  const shadow = `inset 0 0 ${blur}px ${spread}px rgba(${color.r}, ${color.g}, ${color.b}, ${baseOpacity})`;

  return (
    <div
      className={`fixed inset-0 z-[9999] pointer-events-none ${
        isCritical ? "animate-alert-glow-pulse" : ""
      }`}
      style={{
        boxShadow: shadow,
      }}
      role="presentation"
      aria-hidden="true"
    />
  );
}
