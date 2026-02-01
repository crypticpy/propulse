import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHERWOOD_URL = "http://www.sherweng.com/table.html";
const OUTPUT_FILE = path.resolve(
  __dirname,
  "../src/lib/data/sherwood.generated.ts",
);

function parseFirstNumber(text) {
  const cleaned = String(text)
    .replace(/\u00a0/g, " ")
    .replace(/>/g, " ")
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : undefined;
}

function pickManufacturerModel(cellText) {
  const lines = String(cellText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter(
      (l) =>
        !/^added/i.test(l) &&
        !/^lo noise/i.test(l) &&
        !/^updated/i.test(l) &&
        !/^new/i.test(l) &&
        !/^s\/n/i.test(l) &&
        !/^sn\b/i.test(l),
    );

  if (lines.length === 0) return { manufacturer: "Unknown", model: "Unknown" };
  if (lines.length === 1) {
    // Sometimes manufacturer+model are combined.
    const parts = lines[0].split(/\s{2,}| - |–|—/).map((p) => p.trim());
    if (parts.length >= 2) return { manufacturer: parts[0], model: parts.slice(1).join(" ") };
    return { manufacturer: "Unknown", model: lines[0] };
  }

  // Common pattern: [Manufacturer, Model, ...]
  return { manufacturer: lines[0], model: lines[1] };
}

function parseAddedDate(cellText) {
  const match = String(cellText).match(/Added\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (!match) return undefined;
  return match[1];
}

async function main() {
  const res = await fetch(SHERWOOD_URL, {
    headers: { "User-Agent": "Propulse Sherwood Importer (local tooling)" },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  // Identify the receiver table by its header.
  const tables = $("table");
  let receiverTable = null;
  tables.each((_, el) => {
    const headerText = $(el).find("th").first().text();
    if (headerText && headerText.toLowerCase().includes("device")) {
      receiverTable = el;
      return false;
    }
    return undefined;
  });

  if (!receiverTable) throw new Error("Could not find Sherwood receiver table");

  const rows = $(receiverTable).find("tr").toArray();
  const seen = new Map(); // key -> entry

  for (const row of rows) {
    const cells = $(row).find("td").toArray();
    if (cells.length < 10) continue;

    const deviceText = $(cells[0]).text();
    const { manufacturer, model } = pickManufacturerModel(deviceText);
    if (!manufacturer || !model) continue;

    const key = `${manufacturer}::${model}`.toLowerCase();
    const entry = {
      key,
      manufacturer,
      model,
      addedDate: parseAddedDate(deviceText),
      noiseFloorDbm: parseFirstNumber($(cells[1]).text()),
      sensitivityUv: parseFirstNumber($(cells[5]).text()),
      blockingDb: parseFirstNumber($(cells[4]).text()),
      dynamicRangeWideDb: parseFirstNumber($(cells[10]).text()),
      wideSpacingKhz: parseFirstNumber($(cells[11]).text()),
      dynamicRangeNarrowDb: parseFirstNumber($(cells[12]).text()),
      narrowSpacingKhz: parseFirstNumber($(cells[13]).text()),
    };

    // Skip rows with no usable receiver numbers.
    if (
      entry.dynamicRangeNarrowDb === undefined &&
      entry.dynamicRangeWideDb === undefined &&
      entry.blockingDb === undefined
    ) {
      continue;
    }

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, entry);
      continue;
    }

    // Keep the “best” row for duplicate model names: prefer higher narrow DR,
    // then higher wide DR, then higher blocking.
    const score = (r) =>
      (r.dynamicRangeNarrowDb ?? 0) * 4 +
      (r.dynamicRangeWideDb ?? 0) * 2 +
      (r.blockingDb ?? 0);
    if (score(entry) > score(existing)) {
      seen.set(key, entry);
    }
  }

  const entries = Array.from(seen.values()).sort((a, b) => {
    const m = a.manufacturer.localeCompare(b.manufacturer);
    if (m !== 0) return m;
    return a.model.localeCompare(b.model);
  });

  const output = `import type { SherwoodReceiverEntry } from \"@/types/sherwood\";

/**
 * Generated from ${SHERWOOD_URL}
 * Retrieved: ${new Date().toISOString()}
 *
 * WARNING: Verify redistribution/usage rights before committing generated data.
 */
export const SHERWOOD_RECEIVERS: SherwoodReceiverEntry[] = ${JSON.stringify(
    entries,
    null,
    2,
  )};
`;

  await fs.writeFile(OUTPUT_FILE, output, "utf8");
  console.log(`Wrote ${entries.length} entries to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
