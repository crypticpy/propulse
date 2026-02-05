/**
 * useWSJTXAutoLog - Auto-logging hook for WSJT-X QSOs
 *
 * Listens for `wsjtx.qso_logged` messages from the ProPulse Bridge and:
 * 1. Looks up the callsign's DXCC entity
 * 2. Detects new (not previously worked) DXCC entities
 * 3. Dispatches a custom DOM event for the UI toast system
 * 4. Logs the QSO to the console for debugging
 *
 * This hook is intended to be mounted once at the app root level.
 * It does not render any UI itself — notification display is handled
 * by whichever toast/alert component listens for the custom event.
 */

import { useEffect, useRef } from "react";
import { useBridge } from "@/hooks/useBridge";
import { useDXCCStore } from "@/stores/dxccStore";
import type { WSJTXQSOLoggedPayload } from "@/types/bridge";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Detail payload for the custom `wsjtx:qso-logged` DOM event */
export interface WSJTXQSOLoggedEventDetail {
  /** The raw QSO payload from WSJT-X */
  qso: WSJTXQSOLoggedPayload;
  /** Formatted band string (e.g., "20m") or frequency in MHz */
  band: string;
  /** Whether this is a new (never worked) DXCC entity */
  isNewEntity: boolean;
  /** DXCC entity name, if resolved */
  entityName?: string;
}

/**
 * Custom DOM event name dispatched when a WSJT-X QSO is logged.
 * UI components can listen for this to display toast notifications.
 *
 * @example
 * ```ts
 * window.addEventListener("wsjtx:qso-logged", (e) => {
 *   const detail = (e as CustomEvent<WSJTXQSOLoggedEventDetail>).detail;
 *   showToast(`QSO logged: ${detail.qso.callsign} on ${detail.band}`);
 * });
 * ```
 */
export const WSJTX_QSO_LOGGED_EVENT = "wsjtx:qso-logged";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a frequency in Hz to a human-readable band name.
 * Falls back to displaying the frequency in MHz if no band matches.
 */
function formatBand(freqHz: number): string {
  const mhz = freqHz / 1_000_000;
  if (mhz >= 1.8 && mhz <= 2) return "160m";
  if (mhz >= 3.5 && mhz <= 4) return "80m";
  if (mhz >= 5.3 && mhz <= 5.4) return "60m";
  if (mhz >= 7 && mhz <= 7.3) return "40m";
  if (mhz >= 10.1 && mhz <= 10.15) return "30m";
  if (mhz >= 14 && mhz <= 14.35) return "20m";
  if (mhz >= 18.068 && mhz <= 18.168) return "17m";
  if (mhz >= 21 && mhz <= 21.45) return "15m";
  if (mhz >= 24.89 && mhz <= 24.99) return "12m";
  if (mhz >= 28 && mhz <= 29.7) return "10m";
  if (mhz >= 50 && mhz <= 54) return "6m";
  if (mhz >= 144 && mhz <= 148) return "2m";
  return `${mhz.toFixed(3)} MHz`;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook that listens for WSJT-X QSO logged events and dispatches
 * notifications via a custom DOM event.
 *
 * Mount once at the application root:
 * ```tsx
 * function App() {
 *   useWSJTXAutoLog();
 *   return <Layout />;
 * }
 * ```
 */
export function useWSJTXAutoLog(): void {
  const { lastMessage, connected } = useBridge();

  // Track the last processed message ID to avoid duplicate processing
  const lastProcessedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastMessage || !connected) return;
    if (lastMessage.type !== "wsjtx.qso_logged") return;

    // Deduplicate: skip if we already processed this exact message
    const messageId = lastMessage.id ?? null;
    if (messageId && messageId === lastProcessedIdRef.current) return;
    lastProcessedIdRef.current = messageId;

    const qso = lastMessage.payload as WSJTXQSOLoggedPayload;

    // Look up DXCC entity for the logged callsign
    const dxccState = useDXCCStore.getState();
    const lookup = dxccState.lookupCallsign(qso.callsign);
    const entity = lookup?.entity ?? null;
    const isNewEntity = entity ? !dxccState.isWorked(entity.id) : false;

    // Format band for display
    const band = qso.frequency ? formatBand(qso.frequency) : "";

    // Build the notification detail
    const detail: WSJTXQSOLoggedEventDetail = {
      qso,
      band,
      isNewEntity,
      entityName: entity?.name,
    };

    // Log to console for observability
    const bandInfo = band ? ` on ${band}` : "";
    const reportInfo = qso.reportReceived ? ` (${qso.reportReceived})` : "";
    const entityInfo =
      isNewEntity && entity ? ` -- NEW DXCC: ${entity.name}` : "";

    console.info(
      `[WSJT-X] QSO logged: ${qso.callsign}${bandInfo} ${qso.mode}${reportInfo}${entityInfo}`,
    );

    // Dispatch custom DOM event for the toast/notification system
    window.dispatchEvent(
      new CustomEvent<WSJTXQSOLoggedEventDetail>(WSJTX_QSO_LOGGED_EVENT, {
        detail,
      }),
    );
  }, [lastMessage, connected]);
}

export default useWSJTXAutoLog;
