/**
 * QRZ.com Logbook Sync Module
 *
 * Upload: Generates ADIF from selected QSOs and uploads to QRZ.com logbook
 *         via the `/api/log/qrz` proxy edge function.
 * Status: Checks QRZ.com logbook API status.
 *
 * QRZ uses an API key for authentication (not username/password).
 * The API key is stored in the credential store's "password" field.
 *
 * QRZ does NOT support inbox/confirmation download -- only upload.
 */

import type { LogEntry } from "@/lib/db/types";
import { getCredential, isUnlocked } from "@/lib/db/credentialStore";
import { exportADIF } from "@/lib/adif/export";
import { getAccessToken } from "@/lib/api/authFetch";

// -- Types ------------------------------------------------------------------

export interface QrzUploadResult {
  /** Whether the upload completed successfully */
  success: boolean;
  /** Number of QSOs included in the upload */
  qsoCount: number;
  /** Number of records the server accepted (if available) */
  recordsUploaded?: number;
  /** Human-readable status message */
  message: string;
}

export interface QrzStatusResult {
  /** Whether the status check succeeded */
  success: boolean;
  /** Whether the QRZ logbook is accessible */
  logbookAccessible: boolean;
  /** Human-readable status message */
  message: string;
}

async function getAuthAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Authentication required. Sign in to use QRZ sync.");
  }
  return token;
}

// -- Upload -----------------------------------------------------------------

/**
 * Upload log entries to QRZ.com logbook via the proxy edge function.
 *
 * Requires the credential store to be unlocked and a "qrz" credential stored.
 * The credential's `password` field stores the QRZ API key.
 *
 * @param entries - Log entries to upload
 * @returns Upload result with success status and counts
 */
export async function uploadToQrz(
  entries: LogEntry[],
): Promise<QrzUploadResult> {
  if (entries.length === 0) {
    return {
      success: false,
      qsoCount: 0,
      message: "No QSOs provided for QRZ upload",
    };
  }

  if (!isUnlocked()) {
    return {
      success: false,
      qsoCount: 0,
      message: "Credential store is locked. Please unlock it first.",
    };
  }

  const cred = await getCredential("qrz");
  if (!cred) {
    return {
      success: false,
      qsoCount: 0,
      message: "No QRZ credentials found. Add your QRZ API key in Settings.",
    };
  }

  // The `password` field stores the API key for QRZ
  const apiKey = cred.password;
  if (!apiKey) {
    return {
      success: false,
      qsoCount: 0,
      message: "QRZ API key is empty. Update your QRZ credentials in Settings.",
    };
  }

  try {
    const adifContent = exportADIF(entries, {
      includeExtended: true,
      includeContest: true,
      includeActivation: true,
    });
    const accessToken = await getAuthAccessToken();

    const response = await fetch("/api/log/qrz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        adif: adifContent,
        apiKey,
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const errorMsg =
        typeof data.error === "string"
          ? data.error
          : `QRZ server returned ${response.status}`;
      return { success: false, qsoCount: entries.length, message: errorMsg };
    }

    const data = (await response.json()) as {
      success?: boolean;
      recordsUploaded?: number;
      message?: string;
      error?: string;
    };

    if (data.error) {
      return {
        success: false,
        qsoCount: entries.length,
        message: data.error,
      };
    }

    return {
      success: data.success ?? true,
      qsoCount: entries.length,
      recordsUploaded: data.recordsUploaded,
      message:
        data.message ??
        `Uploaded ${entries.length} QSO${entries.length !== 1 ? "s" : ""} to QRZ.com`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      qsoCount: entries.length,
      message: `Failed to upload to QRZ.com: ${message}`,
    };
  }
}

// -- Status -----------------------------------------------------------------

/**
 * Check QRZ.com logbook API status.
 *
 * Sends a status check request to verify the API key is valid
 * and the logbook is accessible.
 */
export async function getQrzStatus(): Promise<QrzStatusResult> {
  if (!isUnlocked()) {
    return {
      success: false,
      logbookAccessible: false,
      message: "Credential store is locked. Please unlock it first.",
    };
  }

  const cred = await getCredential("qrz");
  if (!cred) {
    return {
      success: false,
      logbookAccessible: false,
      message: "No QRZ credentials found.",
    };
  }

  const apiKey = cred.password;
  if (!apiKey) {
    return {
      success: false,
      logbookAccessible: false,
      message: "QRZ API key is empty.",
    };
  }

  try {
    const accessToken = await getAuthAccessToken();
    const response = await fetch("/api/log/qrz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        adif: "",
        apiKey,
        action: "STATUS",
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        logbookAccessible: false,
        message: `QRZ server returned ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      message?: string;
      error?: string;
    };

    return {
      success: true,
      logbookAccessible: data.success ?? false,
      message: data.message ?? "QRZ logbook status checked",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      success: false,
      logbookAccessible: false,
      message: `Failed to check QRZ status: ${message}`,
    };
  }
}
