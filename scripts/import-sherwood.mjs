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

function parseNumbers(text) {
  const cleaned = String(text)
    .replace(/\u00a0/g, " ")
    .replace(/>/g, " ")
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const matches = cleaned.match(/-?\d+(\.\d+)?/g) ?? [];
  return matches.map((m) => Number(m)).filter((n) => Number.isFinite(n));
}

function pickMin(samples) {
  const finite = samples.filter((n) => Number.isFinite(n));
  if (finite.length === 0) return undefined;
  return Math.min(...finite);
}

function pickMax(samples) {
  const finite = samples.filter((n) => Number.isFinite(n));
  if (finite.length === 0) return undefined;
  return Math.max(...finite);
}

function pickMinPositive(samples) {
  const finite = samples.filter((n) => Number.isFinite(n) && n > 0);
  if (finite.length === 0) return undefined;
  return Math.min(...finite);
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
  const entries = [];

  for (const [rowIndex, row] of rows.entries()) {
    const cells = $(row).find("td").toArray();
    if (cells.length < 14) continue;

    const deviceText = $(cells[0]).text();
    const { manufacturer, model } = pickManufacturerModel(deviceText);
    if (!manufacturer || !model) continue;

    const noiseFloorDbmSamples = parseNumbers($(cells[1]).text());
    const sensitivityUvSamples = parseNumbers($(cells[5]).text());
    const blockingDbSamples = parseNumbers($(cells[4]).text());
    const dynamicRangeWideDbSamples = parseNumbers($(cells[10]).text());
    const wideSpacingKhzSamples = parseNumbers($(cells[11]).text());
    const dynamicRangeNarrowDbSamples = parseNumbers($(cells[12]).text());
    const narrowSpacingKhzSamples = parseNumbers($(cells[13]).text());

    const entry = {
      key: `${manufacturer}::${model}::${rowIndex}`.toLowerCase(),
      rowIndex,
      manufacturer,
      model,
      addedDate: parseAddedDate(deviceText),
      rawDeviceText: deviceText.trim() || undefined,
      noiseFloorDbm: pickMin(noiseFloorDbmSamples),
      noiseFloorDbmSamples: noiseFloorDbmSamples.length
        ? noiseFloorDbmSamples
        : undefined,
      sensitivityUv: pickMin(sensitivityUvSamples),
      sensitivityUvSamples: sensitivityUvSamples.length
        ? sensitivityUvSamples
        : undefined,
      blockingDb: pickMax(blockingDbSamples),
      blockingDbSamples: blockingDbSamples.length ? blockingDbSamples : undefined,
      dynamicRangeWideDb: pickMax(dynamicRangeWideDbSamples),
      dynamicRangeWideDbSamples: dynamicRangeWideDbSamples.length
        ? dynamicRangeWideDbSamples
        : undefined,
      wideSpacingKhz: pickMinPositive(wideSpacingKhzSamples),
      wideSpacingKhzSamples: wideSpacingKhzSamples.length
        ? wideSpacingKhzSamples
        : undefined,
      dynamicRangeNarrowDb: pickMax(dynamicRangeNarrowDbSamples),
      dynamicRangeNarrowDbSamples: dynamicRangeNarrowDbSamples.length
        ? dynamicRangeNarrowDbSamples
        : undefined,
      narrowSpacingKhz: pickMinPositive(narrowSpacingKhzSamples),
      narrowSpacingKhzSamples: narrowSpacingKhzSamples.length
        ? narrowSpacingKhzSamples
        : undefined,
    };

    if (
      entry.dynamicRangeNarrowDb === undefined &&
      entry.dynamicRangeWideDb === undefined &&
      entry.blockingDb === undefined
    ) {
      continue;
    }

    entries.push(entry);
  }

  entries.sort((a, b) => {
    const m = a.manufacturer.localeCompare(b.manufacturer);
    if (m !== 0) return m;
    return a.model.localeCompare(b.model);
  });

  const output = `import type { SherwoodReceiverEntry } from \"@/types/sherwood\";

/**
 * Generated from ${SHERWOOD_URL}
 * Retrieved: ${new Date().toISOString()}
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
