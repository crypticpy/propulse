/**
 * PSKReporter API Client
 *
 * Fetches real-time digital mode spots from PSKReporter.info
 * Uses Vercel Edge Function as proxy to handle CORS
 */

import type { LiveSpot, PSKReporterSpot } from "@/types/livespot";
import { gridToLatLon } from "./dxcluster";

/**
 * Parse PSKReporter XML response using DOMParser (browser).
 * Extracts receptionReport elements and returns them as PSKReporterSpot[].
 */
function parsePSKReporterXML(xml: string): PSKReporterSpot[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("PSKReporter returned malformed XML");
  }
  const elements = doc.querySelectorAll("receptionReport");
  if (elements.length === 0) return [];

  const spots: PSKReporterSpot[] = [];
  for (const el of elements) {
    const senderCallsign = el.getAttribute("senderCallsign");
    const receiverCallsign = el.getAttribute("receiverCallsign");
    const frequencyStr = el.getAttribute("frequency");
    if (!senderCallsign || !receiverCallsign || !frequencyStr) continue;

    const frequency = parseInt(frequencyStr, 10);
    if (isNaN(frequency)) continue;

    const flowStartStr = el.getAttribute("flowStartSeconds") || "0";
    const flowStartSeconds = parseInt(flowStartStr, 10);
    const sNRStr = el.getAttribute("sNR");
    const sNR =
      sNRStr !== null && sNRStr !== "" ? parseInt(sNRStr, 10) : undefined;

    spots.push({
      senderCallsign,
      senderLocator: el.getAttribute("senderLocator") || undefined,
      receiverCallsign,
      receiverLocator: el.getAttribute("receiverLocator") || undefined,
      frequency,
      flowStartSeconds: isNaN(flowStartSeconds) ? 0 : flowStartSeconds,
      mode: el.getAttribute("mode") || "FT8",
      sNR: sNR !== undefined && !isNaN(sNR) ? sNR : undefined,
    });
  }
  if (spots.length === 0) {
    throw new Error("PSKReporter XML contained no valid reports");
  }
  return spots;
}

function isPSKReporterSpot(value: unknown): value is PSKReporterSpot {
  if (!value || typeof value !== "object") return false;
  const spot = value as Record<string, unknown>;
  return (
    typeof spot.senderCallsign === "string" &&
    typeof spot.receiverCallsign === "string" &&
    typeof spot.frequency === "number" &&
    Number.isFinite(spot.frequency) &&
    typeof spot.flowStartSeconds === "number" &&
    Number.isFinite(spot.flowStartSeconds) &&
    typeof spot.mode === "string"
  );
}

function parsePSKReporterJSON(data: unknown): PSKReporterSpot[] {
  let reports: unknown;
  if (Array.isArray(data)) {
    reports = data;
  } else if (data && typeof data === "object") {
    const envelope = data as Record<string, unknown>;
    const meta = envelope.meta;
    if (
      meta &&
      typeof meta === "object" &&
      (meta as Record<string, unknown>).status === "unavailable"
    ) {
      throw new Error("PSKReporter feed is unavailable");
    }
    if ("spots" in envelope) reports = envelope.spots;
    else if ("receptionReport" in envelope) {
      reports = envelope.receptionReport;
    } else {
      throw new Error("PSKReporter returned an unexpected JSON payload");
    }
  } else {
    throw new Error("PSKReporter returned an unexpected JSON payload");
  }

  if (!Array.isArray(reports)) {
    throw new Error("PSKReporter spots payload is not an array");
  }
  if (!reports.every(isPSKReporterSpot)) {
    throw new Error("PSKReporter spots payload is malformed");
  }
  return reports;
}

/**
 * Fetch spots from PSKReporter via our Edge Function proxy
 *
 * @param grid - Receiver grid locator to query (4 or 6 char)
 * @param mode - Optional mode filter (e.g., 'FT8', 'FT4')
 * @param limit - Maximum number of spots to return
 * @returns Array of LiveSpot objects
 */
export async function fetchPSKReporterSpots(
  grid?: string,
  mode?: string,
  limit: number = 50,
): Promise<LiveSpot[]> {
  const params = new URLSearchParams();
  if (grid) {
    params.set("grid", grid);
  }
  if (mode) {
    params.set("mode", mode);
  }
  params.set("limit", limit.toString());

  const response = await fetch(`/api/spots/pskreporter?${params}`);

  if (!response.ok) {
    throw new Error(`PSKReporter request failed with HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new Error("PSKReporter returned an empty response body");
  }

  // Try JSON first (Edge Function / production). A non-JSON response is only
  // accepted when it is well-formed XML from the local development proxy.
  let reports: PSKReporterSpot[];
  try {
    reports = parsePSKReporterJSON(JSON.parse(text));
  } catch (error) {
    if (text.trimStart().startsWith("<")) {
      reports = parsePSKReporterXML(text);
    } else {
      throw error;
    }
  }

  if (reports.length === 0) return [];

  return reports.map((spot: PSKReporterSpot) =>
    transformPSKReporterSpot(spot),
  );
}

/**
 * Transform PSKReporter API response to LiveSpot format
 */
function transformPSKReporterSpot(spot: PSKReporterSpot): LiveSpot {
  const dxPos = spot.senderLocator ? gridToLatLon(spot.senderLocator) : null;
  const spotterPos = spot.receiverLocator
    ? gridToLatLon(spot.receiverLocator)
    : null;

  // Determine band from frequency (in Hz from PSKReporter)
  const freqKHz = spot.frequency / 1000;
  const band = getBandFromFrequency(freqKHz);

  return {
    id: `psk_${spot.senderCallsign}_${spot.receiverCallsign}_${spot.flowStartSeconds}`,
    spotter: spot.receiverCallsign,
    spotterGrid: spot.receiverLocator,
    dx: spot.senderCallsign,
    dxGrid: spot.senderLocator,
    frequency: Math.round(freqKHz),
    mode: spot.mode,
    band,
    time: new Date(spot.flowStartSeconds * 1000),
    dxLat: dxPos?.lat,
    dxLon: dxPos?.lon,
    spotterLat: spotterPos?.lat,
    spotterLon: spotterPos?.lon,
    comment: spot.sNR ? `SNR ${spot.sNR} dB` : "",
    source: "PSKReporter",
    snr: spot.sNR,
    receiverCallsign: spot.receiverCallsign,
    receiverGrid: spot.receiverLocator,
  };
}

/**
 * Get band name from frequency in kHz
 */
function getBandFromFrequency(freqKHz: number): string {
  if (freqKHz >= 1800 && freqKHz <= 2000) {
    return "160m";
  }
  if (freqKHz >= 3500 && freqKHz <= 4000) {
    return "80m";
  }
  if (freqKHz >= 5330 && freqKHz <= 5405) {
    return "60m";
  }
  if (freqKHz >= 7000 && freqKHz <= 7300) {
    return "40m";
  }
  if (freqKHz >= 10100 && freqKHz <= 10150) {
    return "30m";
  }
  if (freqKHz >= 14000 && freqKHz <= 14350) {
    return "20m";
  }
  if (freqKHz >= 18068 && freqKHz <= 18168) {
    return "17m";
  }
  if (freqKHz >= 21000 && freqKHz <= 21450) {
    return "15m";
  }
  if (freqKHz >= 24890 && freqKHz <= 24990) {
    return "12m";
  }
  if (freqKHz >= 28000 && freqKHz <= 29700) {
    return "10m";
  }
  if (freqKHz >= 50000 && freqKHz <= 54000) {
    return "6m";
  }
  if (freqKHz >= 144000 && freqKHz <= 148000) {
    return "2m";
  }
  return "Unknown";
}
