/**
 * Log Upload Client Library
 *
 * Client-side functions for uploading QSO logs to various
 * ham radio QSL confirmation services (eQSL, Club Log, LoTW).
 *
 * These functions call our API proxy endpoints to avoid CORS issues.
 */

import type { LogEntry } from "../db/types";
import { generateADIF } from "../utils/adifParser";

/**
 * Result from a log upload operation
 */
export interface UploadResult {
  /** Whether the upload succeeded */
  success: boolean;
  /** Which service was used */
  service: "eqsl" | "clublog" | "qrz" | "lotw";
  /** Number of records successfully uploaded (if available) */
  recordsUploaded?: number;
  /** Human-readable status message */
  message: string;
}

/**
 * Credentials for various QSL services
 */
export interface ServiceCredentials {
  /** eQSL.cc credentials */
  eqsl?: { username: string; password: string };
  /** Club Log credentials (uses API email/password, not website login) */
  clublog?: { email: string; password: string; callsign: string };
  /** QRZ.com API key */
  qrz?: { apiKey: string };
  /** LoTW - manual upload flag (no auto-upload supported) */
  lotw?: { enabled: boolean };
}

/**
 * Type guard to check if an upload result indicates failure
 */
export function isUploadError(result: UploadResult): boolean {
  return !result.success;
}

/**
 * Upload ADIF content to eQSL.cc
 *
 * @param adifContent - Raw ADIF content string to upload
 * @param credentials - eQSL username and password
 * @returns Promise<UploadResult> - Upload result
 */
export async function uploadToEqsl(
  adifContent: string,
  credentials: { username: string; password: string },
): Promise<UploadResult> {
  if (!adifContent || adifContent.trim().length === 0) {
    return {
      success: false,
      service: "eqsl",
      message: "No ADIF content provided",
    };
  }

  if (!credentials.username || !credentials.password) {
    return {
      success: false,
      service: "eqsl",
      message: "eQSL username and password are required",
    };
  }

  try {
    const { authHeaders } = await import("@/lib/api/authFetch");
    const response = await fetch("/api/log/eqsl", {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        adifContent,
        username: credentials.username,
        password: credentials.password,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return {
        success: false,
        service: "eqsl",
        message: data?.error || `HTTP error ${response.status}`,
      };
    }

    const data = await response.json();

    return {
      success: data.success,
      service: "eqsl",
      recordsUploaded: data.recordsUploaded,
      message: data.message,
    };
  } catch (error) {
    return {
      success: false,
      service: "eqsl",
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Upload ADIF content to Club Log
 *
 * @param adifContent - Raw ADIF content string to upload
 * @param credentials - Club Log email, password, and callsign
 * @returns Promise<UploadResult> - Upload result
 */
export async function uploadToClublog(
  adifContent: string,
  credentials: { email: string; password: string; callsign: string },
): Promise<UploadResult> {
  if (!adifContent || adifContent.trim().length === 0) {
    return {
      success: false,
      service: "clublog",
      message: "No ADIF content provided",
    };
  }

  if (!credentials.email || !credentials.password || !credentials.callsign) {
    return {
      success: false,
      service: "clublog",
      message: "Club Log email, password, and callsign are required",
    };
  }

  try {
    const { authHeaders } = await import("@/lib/api/authFetch");
    const response = await fetch("/api/log/clublog", {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        adifContent,
        email: credentials.email,
        password: credentials.password,
        callsign: credentials.callsign,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return {
        success: false,
        service: "clublog",
        message: data?.error || `HTTP error ${response.status}`,
      };
    }

    const data = await response.json();

    return {
      success: data.success,
      service: "clublog",
      recordsUploaded: data.recordsUploaded,
      message: data.message,
    };
  } catch (error) {
    return {
      success: false,
      service: "clublog",
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Upload ADIF content to multiple services in parallel
 *
 * @param adifContent - Raw ADIF content string to upload
 * @param credentials - Credentials for all services
 * @param services - Array of services to upload to
 * @returns Promise<UploadResult[]> - Array of results (one per service)
 */
export async function uploadToMultipleServices(
  adifContent: string,
  credentials: ServiceCredentials,
  services: ("eqsl" | "clublog")[],
): Promise<UploadResult[]> {
  const uploadPromises: Promise<UploadResult>[] = [];

  for (const service of services) {
    switch (service) {
      case "eqsl":
        if (credentials.eqsl) {
          uploadPromises.push(uploadToEqsl(adifContent, credentials.eqsl));
        } else {
          uploadPromises.push(
            Promise.resolve({
              success: false,
              service: "eqsl" as const,
              message: "eQSL credentials not provided",
            }),
          );
        }
        break;

      case "clublog":
        if (credentials.clublog) {
          uploadPromises.push(
            uploadToClublog(adifContent, credentials.clublog),
          );
        } else {
          uploadPromises.push(
            Promise.resolve({
              success: false,
              service: "clublog" as const,
              message: "Club Log credentials not provided",
            }),
          );
        }
        break;
    }
  }

  return Promise.all(uploadPromises);
}

/**
 * Generate ADIF formatted specifically for LoTW upload
 *
 * LoTW requires TQSL signing which cannot be done server-side,
 * so this function generates ADIF that the user can manually
 * import into TQSL for signing and upload.
 *
 * The generated ADIF includes fields that LoTW specifically uses:
 * - CALL, QSO_DATE, TIME_ON, BAND, MODE, FREQ
 * - STATION_CALLSIGN, OPERATOR (for guest logging)
 *
 * @param entries - Log entries to export
 * @returns ADIF string formatted for LoTW/TQSL import
 */
export function generateLotwAdif(entries: LogEntry[]): string {
  // Use the standard ADIF generator - it already includes
  // all fields needed for LoTW. The key difference is that
  // LoTW requires the file to be signed with TQSL before upload.
  const adif = generateADIF(entries);

  // Add a comment indicating this is for LoTW
  const header = [
    "# ADIF Export for LoTW (Logbook of The World)",
    "# Import this file into TQSL to sign and upload to LoTW",
    "#",
  ].join("\n");

  return header + "\n" + adif;
}

/**
 * Generate ADIF from log entries and upload to eQSL
 *
 * Convenience function that generates ADIF from entries and uploads.
 *
 * @param entries - Log entries to upload
 * @param credentials - eQSL credentials
 * @returns Promise<UploadResult>
 */
export async function uploadEntriesToEqsl(
  entries: LogEntry[],
  credentials: { username: string; password: string },
): Promise<UploadResult> {
  if (entries.length === 0) {
    return {
      success: false,
      service: "eqsl",
      message: "No log entries provided",
    };
  }

  const adifContent = generateADIF(entries);
  return uploadToEqsl(adifContent, credentials);
}

/**
 * Generate ADIF from log entries and upload to Club Log
 *
 * Convenience function that generates ADIF from entries and uploads.
 *
 * @param entries - Log entries to upload
 * @param credentials - Club Log credentials
 * @returns Promise<UploadResult>
 */
export async function uploadEntriesToClublog(
  entries: LogEntry[],
  credentials: { email: string; password: string; callsign: string },
): Promise<UploadResult> {
  if (entries.length === 0) {
    return {
      success: false,
      service: "clublog",
      message: "No log entries provided",
    };
  }

  const adifContent = generateADIF(entries);
  return uploadToClublog(adifContent, credentials);
}
