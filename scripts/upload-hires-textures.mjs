#!/usr/bin/env node

/**
 * Upload the hi-res monthly Blue Marble globe textures to the public
 * `textures` storage bucket (created by migration 20260829230000).
 *
 * Source images: NASA Blue Marble Next Generation (2004, w/ topography and
 * bathymetry), 5400x2700 JPEG, public domain — the same originals that
 * public/textures/months/earth-day-MM.jpg were downscaled from (G19).
 *
 * Usage:
 *   node scripts/upload-hires-textures.mjs <source-dir>
 *
 * <source-dir> must contain src-01.jpg … src-12.jpg. Existing objects are
 * overwritten (upsert) — the imagery is static 2004 data, so objects are
 * uploaded with a one-year immutable cache lifetime.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const BUCKET = "textures";
const MONTHS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

async function main() {
  const sourceDir = process.argv[2];
  if (!sourceDir) {
    throw new Error("Usage: node scripts/upload-hires-textures.mjs <source-dir>");
  }

  const rawUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!rawUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }

  const client = createClient(rawUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const month of MONTHS) {
    const file = path.join(sourceDir, `src-${month}.jpg`);
    const body = await readFile(file);
    const dest = `months/earth-day-${month}.jpg`;

    const { error } = await client.storage.from(BUCKET).upload(dest, body, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) {
      throw new Error(`Upload failed for ${dest}: ${error.message}`);
    }
    console.log(`uploaded ${BUCKET}/${dest} (${(body.length / 1024 / 1024).toFixed(2)} MB)`);
  }

  console.log("All 12 monthly hi-res textures uploaded.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
