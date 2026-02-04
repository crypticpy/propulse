/**
 * Generate World Countries Boundary Data
 *
 * Reads Natural Earth 110m data from world-atlas (TopoJSON), converts to GeoJSON,
 * enriches with metadata from world-countries, and outputs a TypeScript file
 * matching the CountryData interface.
 *
 * Usage: node scripts/generate-country-data.mjs
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
  "../src/lib/data/worldCountries.generated.ts",
);

// ---------------------------------------------------------------------------
// Load source data
// ---------------------------------------------------------------------------

const topojsonClient = await import("topojson-client");
const topology = require("world-atlas/countries-110m.json");
const worldCountriesData = require("world-countries");

// Convert TopoJSON to GeoJSON FeatureCollection
const geojson = topojsonClient.feature(
  topology,
  topology.objects.countries,
);

// Build lookup: ISO numeric code -> world-countries metadata
const metadataByNumeric = new Map();
for (const entry of worldCountriesData) {
  if (entry.ccn3) {
    metadataByNumeric.set(entry.ccn3, {
      iso: entry.cca2,
      name: entry.name.common,
      area: entry.area,
      latlng: entry.latlng,
    });
  }
}

// ---------------------------------------------------------------------------
// Process features
// ---------------------------------------------------------------------------

/**
 * Round number to given decimal places
 */
function round(n, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Extract all exterior rings from a GeoJSON geometry.
 * Returns an array of rings, each ring is an array of [lat, lon] tuples.
 * GeoJSON uses [lon, lat] so we flip to [lat, lon].
 */
function extractRings(geometry) {
  const rings = [];

  if (geometry.type === "Polygon") {
    // Polygon: coordinates = [exteriorRing, ...holeRings]
    // We only want the exterior ring (index 0)
    const ring = geometry.coordinates[0];
    if (ring && ring.length >= 3) {
      rings.push(ring.map(([lon, lat]) => [round(lat), round(lon)]));
    }
  } else if (geometry.type === "MultiPolygon") {
    // MultiPolygon: coordinates = [polygon1, polygon2, ...]
    // Each polygon = [exteriorRing, ...holeRings]
    for (const polygon of geometry.coordinates) {
      const ring = polygon[0]; // exterior ring only
      if (ring && ring.length >= 3) {
        rings.push(ring.map(([lon, lat]) => [round(lat), round(lon)]));
      }
    }
  }

  return rings;
}

/**
 * Compute centroid of a set of rings (simple average of all points).
 * Returns [lat, lon].
 */
function computeCentroid(rings) {
  let totalLat = 0;
  let totalLon = 0;
  let count = 0;
  for (const ring of rings) {
    for (const [lat, lon] of ring) {
      totalLat += lat;
      totalLon += lon;
      count++;
    }
  }
  return count > 0
    ? [round(totalLat / count, 1), round(totalLon / count, 1)]
    : [0, 0];
}

// Process all features
const countries = [];

for (const feature of geojson.features) {
  const numericId = String(feature.id);
  const meta = metadataByNumeric.get(numericId);

  // Get name from metadata or fall back to TopoJSON properties
  const name = meta?.name || feature.properties?.name || `Unknown (${numericId})`;
  const iso = meta?.iso || numericId;
  const area = meta?.area || 0;

  // Extract border rings
  const borders = extractRings(feature.geometry);
  if (borders.length === 0) continue;

  // Get centroid: prefer world-countries metadata, compute as fallback
  let centroidLat, centroidLon;
  if (meta?.latlng && meta.latlng.length === 2) {
    centroidLat = round(meta.latlng[0], 1);
    centroidLon = round(meta.latlng[1], 1);
  } else {
    const [lat, lon] = computeCentroid(borders);
    centroidLat = lat;
    centroidLon = lon;
  }

  countries.push({
    name,
    iso,
    centroidLat,
    centroidLon,
    area: Math.round(area),
    borders,
  });
}

// Sort alphabetically by name
countries.sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Generate TypeScript output
// ---------------------------------------------------------------------------

function formatRing(ring) {
  // Format a ring as a compact multi-line array
  const coords = ring.map(([lat, lon]) => `[${lat}, ${lon}]`);
  // Group 6 coordinates per line for readability
  const lines = [];
  for (let i = 0; i < coords.length; i += 6) {
    lines.push("        " + coords.slice(i, i + 6).join(", ") + ",");
  }
  return lines.join("\n");
}

function formatCountry(country) {
  const bordersStr = country.borders
    .map((ring) => {
      return `      [\n${formatRing(ring)}\n      ]`;
    })
    .join(",\n");

  return `  {
    name: ${JSON.stringify(country.name)},
    iso: ${JSON.stringify(country.iso)},
    centroidLat: ${country.centroidLat},
    centroidLon: ${country.centroidLon},
    area: ${country.area},
    borders: [
${bordersStr},
    ],
  }`;
}

const timestamp = new Date().toISOString();
const output = `/**
 * World Countries Boundary Data (Generated)
 *
 * Source: Natural Earth 110m via world-atlas
 * Generated: ${timestamp}
 * Countries: ${countries.length}
 *
 * DO NOT EDIT — regenerate with: node scripts/generate-country-data.mjs
 */

export interface CountryData {
  /** Country name */
  name: string;
  /** ISO 3166-1 alpha-2 code */
  iso: string;
  /** Centroid latitude for label placement */
  centroidLat: number;
  /** Centroid longitude for label placement */
  centroidLon: number;
  /** Approximate land area in km² */
  area: number;
  /** Simplified border polygons — array of rings, each ring is [lat, lon][] */
  borders: [number, number][][];
}

export const WORLD_COUNTRIES: CountryData[] = [
${countries.map(formatCountry).join(",\n")},
];
`;

await fs.writeFile(OUTPUT_FILE, output, "utf-8");

console.log(`Generated ${OUTPUT_FILE}`);
console.log(`  Countries: ${countries.length}`);
console.log(`  Total rings: ${countries.reduce((sum, c) => sum + c.borders.length, 0)}`);
console.log(`  Total points: ${countries.reduce((sum, c) => sum + c.borders.reduce((s, r) => s + r.length, 0), 0)}`);
console.log(`  File size: ${(output.length / 1024).toFixed(1)} KB`);
