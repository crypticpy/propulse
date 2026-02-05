/**
 * Generate US State Boundary Data
 *
 * Reads US Census Bureau state data from us-atlas (TopoJSON 10m),
 * converts to GeoJSON, and outputs a TypeScript file with state borders.
 *
 * Usage: node scripts/generate-state-data.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.resolve(
  __dirname,
  "../src/lib/data/usStates.generated.ts",
);

// ---------------------------------------------------------------------------
// FIPS code to state name mapping
// ---------------------------------------------------------------------------

const FIPS_TO_STATE = {
  "01": "Alabama",
  "02": "Alaska",
  "04": "Arizona",
  "05": "Arkansas",
  "06": "California",
  "08": "Colorado",
  "09": "Connecticut",
  "10": "Delaware",
  "11": "District of Columbia",
  "12": "Florida",
  "13": "Georgia",
  "15": "Hawaii",
  "16": "Idaho",
  "17": "Illinois",
  "18": "Indiana",
  "19": "Iowa",
  "20": "Kansas",
  "21": "Kentucky",
  "22": "Louisiana",
  "23": "Maine",
  "24": "Maryland",
  "25": "Massachusetts",
  "26": "Michigan",
  "27": "Minnesota",
  "28": "Mississippi",
  "29": "Missouri",
  "30": "Montana",
  "31": "Nebraska",
  "32": "Nevada",
  "33": "New Hampshire",
  "34": "New Jersey",
  "35": "New Mexico",
  "36": "New York",
  "37": "North Carolina",
  "38": "North Dakota",
  "39": "Ohio",
  "40": "Oklahoma",
  "41": "Oregon",
  "42": "Pennsylvania",
  "44": "Rhode Island",
  "45": "South Carolina",
  "46": "South Dakota",
  "47": "Tennessee",
  "48": "Texas",
  "49": "Utah",
  "50": "Vermont",
  "51": "Virginia",
  "53": "Washington",
  "54": "West Virginia",
  "55": "Wisconsin",
  "56": "Wyoming",
  // Territories
  "60": "American Samoa",
  "66": "Guam",
  "69": "Northern Mariana Islands",
  "72": "Puerto Rico",
  "78": "US Virgin Islands",
};

// ---------------------------------------------------------------------------
// Load source data
// ---------------------------------------------------------------------------

const topojsonClient = await import("topojson-client");
const topology = require("us-atlas/states-10m.json");

// Convert TopoJSON to GeoJSON FeatureCollection
const geojson = topojsonClient.feature(topology, topology.objects.states);

// ---------------------------------------------------------------------------
// Process features
// ---------------------------------------------------------------------------

function round(n, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Extract all exterior rings from a GeoJSON geometry.
 * GeoJSON uses [lon, lat] — we flip to [lat, lon] for consistency with country data.
 */
function extractRings(geometry) {
  const rings = [];

  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0];
    if (ring && ring.length >= 3) {
      rings.push(ring.map(([lon, lat]) => [round(lat), round(lon)]));
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      const ring = polygon[0];
      if (ring && ring.length >= 3) {
        rings.push(ring.map(([lon, lat]) => [round(lat), round(lon)]));
      }
    }
  }

  return rings;
}

// Process all features
const states = [];

for (const feature of geojson.features) {
  const fips = String(feature.id).padStart(2, "0");
  const name = FIPS_TO_STATE[fips] || feature.properties?.name || `Unknown (${fips})`;

  const borders = extractRings(feature.geometry);
  if (borders.length === 0) continue;

  states.push({ name, fips, borders });
}

// Sort alphabetically
states.sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Generate TypeScript output
// ---------------------------------------------------------------------------

function formatRing(ring) {
  const coords = ring.map(([lat, lon]) => `[${lat},${lon}]`);
  const lines = [];
  for (let i = 0; i < coords.length; i += 6) {
    lines.push("        " + coords.slice(i, i + 6).join(",") + ",");
  }
  return lines.join("\n");
}

function formatState(state) {
  const bordersStr = state.borders
    .map((ring) => `      [\n${formatRing(ring)}\n      ]`)
    .join(",\n");

  return `  {
    name: ${JSON.stringify(state.name)},
    fips: ${JSON.stringify(state.fips)},
    borders: [
${bordersStr},
    ],
  }`;
}

const timestamp = new Date().toISOString();
const output = `/**
 * US State Boundary Data (Generated)
 *
 * Source: US Census Bureau via us-atlas (10m resolution)
 * Generated: ${timestamp}
 * States: ${states.length}
 *
 * DO NOT EDIT — regenerate with: node scripts/generate-state-data.mjs
 */

export interface StateData {
  /** State name */
  name: string;
  /** FIPS code */
  fips: string;
  /** Simplified border polygons — array of rings, each ring is [lat, lon][] */
  borders: [number, number][][];
}

export const US_STATES: StateData[] = [
${states.map(formatState).join(",\n")},
];
`;

await fs.writeFile(OUTPUT_FILE, output, "utf-8");

console.log(`Generated ${OUTPUT_FILE}`);
console.log(`  States: ${states.length}`);
console.log(`  Total rings: ${states.reduce((sum, s) => sum + s.borders.length, 0)}`);
console.log(`  Total points: ${states.reduce((sum, s) => sum + s.borders.reduce((r, ring) => r + ring.length, 0), 0)}`);
console.log(`  File size: ${(output.length / 1024).toFixed(1)} KB`);
