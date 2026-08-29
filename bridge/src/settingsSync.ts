/**
 * LAN settings sync — the bridge persists one shared settings blob so every
 * shack device can pull the same configuration (HamTab-style).
 *
 * The blob is the frontend's SettingsBackup JSON (src/lib/utils/settingsBackup.ts);
 * the bridge treats it as opaque. Clients poll GET and compare updatedAt;
 * publishing is an explicit PUT from one device.
 *
 * Storage: $BRIDGE_DATA_DIR/lan-settings.json (default ~/.propulse/).
 */

import http from "http";
import fs from "fs";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import os from "os";
import path from "path";

export const SETTINGS_SYNC_PATH = "/api/bridge/settings";

/** Generous cap — real backups are a few hundred kB at most. */
const MAX_BLOB_BYTES = 1024 * 1024;

const DATA_DIR =
  process.env.BRIDGE_DATA_DIR ?? path.join(os.homedir(), ".propulse");
const SETTINGS_FILE = path.join(DATA_DIR, "lan-settings.json");

interface StoredSettings {
  updatedAt: string;
  backup: unknown;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readStored(): Promise<StoredSettings | null> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as StoredSettings).updatedAt === "string"
    ) {
      return parsed as StoredSettings;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeStored(stored: StoredSettings): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
  // Atomic write: temp file + rename so a crash never leaves a torn blob
  const tmp = `${SETTINGS_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(stored), "utf8");
  await rename(tmp, SETTINGS_FILE);
}

function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BLOB_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Serve the LAN settings blob endpoint. Returns false when the request is
 * for a different path.
 */
export async function handleSettingsSyncRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://bridge.invalid").pathname;
  if (pathname !== SETTINGS_SYNC_PATH) return false;

  if (req.method === "GET") {
    const stored = await readStored();
    sendJson(res, 200, stored ?? { updatedAt: null, backup: null });
    return true;
  }

  if (req.method === "PUT") {
    const body = await readBody(req);
    if (body === null) {
      sendJson(res, 413, { error: "Settings blob too large" });
      return true;
    }
    let backup: unknown;
    try {
      backup = JSON.parse(body.toString("utf8"));
    } catch {
      sendJson(res, 400, { error: "Body must be JSON" });
      return true;
    }
    if (typeof backup !== "object" || backup === null) {
      sendJson(res, 400, { error: "Body must be a settings backup object" });
      return true;
    }
    const stored: StoredSettings = {
      updatedAt: new Date().toISOString(),
      backup,
    };
    await writeStored(stored);
    sendJson(res, 200, { updatedAt: stored.updatedAt });
    return true;
  }

  res.writeHead(405, { Allow: "GET, PUT" });
  res.end();
  return true;
}
