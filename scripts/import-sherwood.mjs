import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import {
  SHERWOOD_RANGES,
  parseSherwoodCell,
  pickMax,
  pickMin,
  pickMinPositive,
} from "./sherwood-parser.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHERWOOD_URL = "http://www.sherweng.com/table.html";
const OUTPUT_FILE = path.resolve(
  __dirname,
  "../src/lib/data/sherwood.generated.ts",
);
const AUDIT_FILE = path.resolve(
  __dirname,
  "../ml/data/audits/equipment/sherwood-import-audit.json",
);
const SUMMARY_FILE = path.resolve(
  __dirname,
  "../ml/results/equipment/sherwood-import-summary.json",
);

/**
 * Known radio manufacturers for validation
 */
const KNOWN_MANUFACTURERS = new Set([
  "Alinco", "Apache", "Collins", "Elecraft", "Expert", "FlexRadio", "Flex Radio",
  "Heathkit", "Hilberling", "Icom", "JRC", "Kenwood", "MFJ", "Motorola",
  "Palstar", "Racal", "RME", "SDRPlay", "SGC", "SunSDR", "Ten-Tec", "TenTec",
  "Watkins-Johnson", "Yaesu", "Yeasu", "Xiegu", "Anan", "QRP Labs",
]);

/**
 * Check if a string looks like a date (MM/DD/YY or similar)
 */
function looksLikeDate(str) {
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str.trim());
}

function pickManufacturerModel(cellText) {
  const lines = String(cellText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter(
      (l) =>
        // Filter out metadata lines
        !/^added/i.test(l) &&
        !/^lo noise/i.test(l) &&
        !/^updated/i.test(l) &&
        !/^new\s+(synth|roofing|firmware)/i.test(l) &&
        !/^s\/n/i.test(l) &&
        !/^sn\b/i.test(l) &&
        !/^second\s+sample/i.test(l) &&
        !/^sample\s*#?\d/i.test(l) &&
        // Filter out standalone dates
        !looksLikeDate(l),
    );

  if (lines.length === 0) return { manufacturer: "Unknown", model: "Unknown" };

  // Try to identify manufacturer from known list
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if this line starts with a known manufacturer
    for (const mfr of KNOWN_MANUFACTURERS) {
      if (line.toLowerCase().startsWith(mfr.toLowerCase())) {
        // The rest might be the model on the same line
        const afterMfr = line.slice(mfr.length).trim();
        if (afterMfr) {
          return { manufacturer: mfr, model: afterMfr };
        }
        // Model is on the next line
        if (i + 1 < lines.length) {
          return { manufacturer: mfr, model: lines[i + 1] };
        }
        return { manufacturer: mfr, model: "Unknown" };
      }
    }
  }

  // Fallback: first line is manufacturer, second is model
  if (lines.length === 1) {
    // Sometimes manufacturer+model are combined.
    const parts = lines[0].split(/\s{2,}| - |–|—/).map((p) => p.trim());
    if (parts.length >= 2) return { manufacturer: parts[0], model: parts.slice(1).join(" ") };
    return { manufacturer: "Unknown", model: lines[0] };
  }

  // Common pattern: [Manufacturer, Model, ...]
  return { manufacturer: lines[0], model: lines[1] };
}

async function main() {
  const res = await fetch(SHERWOOD_URL, {
    headers: { "User-Agent": "Propulse Sherwood Importer (local tooling)" },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const retrievedAt = new Date().toISOString();
  const sourceSha256 = createHash("sha256").update(html).digest("hex");
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
  const auditRows = [];

  for (const [rowIndex, row] of rows.entries()) {
    const cells = $(row).find("td").toArray();
    if (cells.length < 14) continue;

    const deviceText = $(cells[0]).text();
    const { manufacturer, model } = pickManufacturerModel(deviceText);
    if (!manufacturer || !model) continue;

    const noiseFloor = parseSherwoodCell(
      $,
      cells[1],
      SHERWOOD_RANGES.noiseFloorDbm,
    );
    const sensitivity = parseSherwoodCell(
      $,
      cells[5],
      SHERWOOD_RANGES.sensitivityUv,
    );
    const blocking = parseSherwoodCell(
      $,
      cells[4],
      SHERWOOD_RANGES.blockingDb,
    );
    const dynamicRangeWide = parseSherwoodCell(
      $,
      cells[10],
      SHERWOOD_RANGES.dynamicRangeDb,
    );
    const wideSpacing = parseSherwoodCell(
      $,
      cells[11],
      SHERWOOD_RANGES.spacingKhz,
    );
    const dynamicRangeNarrow = parseSherwoodCell(
      $,
      cells[12],
      SHERWOOD_RANGES.dynamicRangeDb,
    );
    const narrowSpacing = parseSherwoodCell(
      $,
      cells[13],
      SHERWOOD_RANGES.spacingKhz,
    );
    const rejectedValues = [
      ...noiseFloor.rejectedValues.map((value) => ({ field: "noiseFloorDbm", value })),
      ...sensitivity.rejectedValues.map((value) => ({ field: "sensitivityUv", value })),
      ...blocking.rejectedValues.map((value) => ({ field: "blockingDb", value })),
      ...dynamicRangeWide.rejectedValues.map((value) => ({ field: "dynamicRangeWideDb", value })),
      ...wideSpacing.rejectedValues.map((value) => ({ field: "wideSpacingKhz", value })),
      ...dynamicRangeNarrow.rejectedValues.map((value) => ({ field: "dynamicRangeNarrowDb", value })),
      ...narrowSpacing.rejectedValues.map((value) => ({ field: "narrowSpacingKhz", value })),
    ];

    const entry = {
      key: `${manufacturer}::${model}::${rowIndex}`.toLowerCase(),
      rowIndex,
      manufacturer,
      model,
      noiseFloorDbm: pickMin(noiseFloor.values),
      noiseFloorDbmSamples: noiseFloor.values.length
        ? noiseFloor.values
        : undefined,
      sensitivityUv: pickMin(sensitivity.values),
      sensitivityUvSamples: sensitivity.values.length
        ? sensitivity.values
        : undefined,
      blockingDb: pickMax(blocking.values),
      blockingDbSamples: blocking.values.length ? blocking.values : undefined,
      dynamicRangeWideDb: pickMax(dynamicRangeWide.values),
      dynamicRangeWideDbSamples: dynamicRangeWide.values.length
        ? dynamicRangeWide.values
        : undefined,
      wideSpacingKhz: pickMinPositive(wideSpacing.values),
      wideSpacingKhzSamples: wideSpacing.values.length
        ? wideSpacing.values
        : undefined,
      dynamicRangeNarrowDb: pickMax(dynamicRangeNarrow.values),
      dynamicRangeNarrowDbSamples: dynamicRangeNarrow.values.length
        ? dynamicRangeNarrow.values
        : undefined,
      narrowSpacingKhz: pickMinPositive(narrowSpacing.values),
      narrowSpacingKhzSamples: narrowSpacing.values.length
        ? narrowSpacing.values
        : undefined,
    };

    auditRows.push({
      key: entry.key,
      rowIndex,
      manufacturer,
      model,
      rawDeviceText: deviceText.trim() || undefined,
      rawNoiseFloorText: noiseFloor.rawText || undefined,
      parsedNoiseFloorText: noiseFloor.parsedText || undefined,
      acceptedNoiseFloorValues: noiseFloor.values,
      rejectedValues,
    });

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
 * Retrieved: ${retrievedAt}
 * Source SHA-256: ${sourceSha256}
 */
export const SHERWOOD_RECEIVERS: SherwoodReceiverEntry[] = ${JSON.stringify(
    entries,
    null,
    2,
  )};
`;

  await fs.writeFile(OUTPUT_FILE, output, "utf8");
  await fs.mkdir(path.dirname(AUDIT_FILE), { recursive: true });
  await fs.writeFile(
    AUDIT_FILE,
    `${JSON.stringify(
      {
        source: SHERWOOD_URL,
        retrievedAt,
        sourceSha256,
        parserVersion: "sherwood-parser-v1",
        rows: auditRows,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const rejectedValueCount = auditRows.reduce(
    (total, row) => total + row.rejectedValues.length,
    0,
  );
  await fs.mkdir(path.dirname(SUMMARY_FILE), { recursive: true });
  await fs.writeFile(
    SUMMARY_FILE,
    `${JSON.stringify(
      {
        source: SHERWOOD_URL,
        retrievedAt,
        sourceSha256,
        parserVersion: "sherwood-parser-v1",
        tableRowCount: rows.length,
        acceptedEntryCount: entries.length,
        auditedDataRowCount: auditRows.length,
        rejectedValueCount,
        physicalRanges: SHERWOOD_RANGES,
        detailedAudit: "ml/data/audits/equipment/sherwood-import-audit.json (ignored)",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`Wrote ${entries.length} entries to ${OUTPUT_FILE}`);
  console.log(`Wrote import audit to ${AUDIT_FILE}`);
  console.log(`Wrote import summary to ${SUMMARY_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
