/**
 * Generate Canadian province/territory boundary data.
 *
 * Source: Click That Hood Canada GeoJSON (OpenStreetMap-derived public dataset).
 * Usage: node scripts/generate-canada-data.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.resolve(__dirname, "../src/lib/data/canadaProvinces.generated.ts");
const SOURCE_URL =
  "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/canada.geojson";

const NAME_TO_ISO = {
  Alberta: "AB",
  "British Columbia": "BC",
  Manitoba: "MB",
  "New Brunswick": "NB",
  "Newfoundland and Labrador": "NL",
  "Northwest Territories": "NT",
  "Nova Scotia": "NS",
  Nunavut: "NU",
  Ontario: "ON",
  "Prince Edward Island": "PE",
  Quebec: "QC",
  Saskatchewan: "SK",
  Yukon: "YT",
  "Yukon Territory": "YT",
};

function round(n, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function simplifyRing(ring) {
  const mapped = [];
  for (const [lon, lat] of ring) {
    const point = [round(lat), round(lon)];
    const prev = mapped[mapped.length - 1];
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) mapped.push(point);
  }
  if (mapped.length > 80) {
    const stride = Math.ceil(mapped.length / 80);
    const reduced = mapped.filter((_, index) => index % stride === 0 || index === mapped.length - 1);
    return reduced.length >= 4 ? reduced : mapped;
  }
  return mapped;
}

function extractRings(geometry) {
  const rings = [];
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];
  for (const polygon of polygons) {
    const ring = polygon[0];
    if (ring && ring.length >= 3) {
      const simplified = simplifyRing(ring);
      if (simplified.length >= 3) rings.push(simplified);
    }
  }
  return rings;
}

function centroid(rings) {
  const ring = rings.reduce((best, current) =>
    current.length > best.length ? current : best, rings[0] ?? []);
  if (ring.length === 0) return { lat: 0, lon: 0 };
  let lat = 0;
  let lonX = 0;
  let lonY = 0;
  for (const [y, x] of ring) {
    lat += y;
    const radians = (x * Math.PI) / 180;
    lonX += Math.cos(radians);
    lonY += Math.sin(radians);
  }
  return {
    lat: round(lat / ring.length, 2),
    lon: round(Math.atan2(lonY, lonX) * 180 / Math.PI, 2),
  };
}

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`Failed to download Canada GeoJSON: ${response.status}`);
}
const geojson = await response.json();
const provinces = [];

for (const feature of geojson.features ?? []) {
  const name = feature.properties?.name;
  const iso = NAME_TO_ISO[name];
  if (!iso) continue;
  const canonicalName = name === "Yukon Territory" ? "Yukon" : name;
  const borders = extractRings(feature.geometry);
  if (borders.length === 0) continue;
  const center = centroid(borders);
  provinces.push({ name: canonicalName, iso, centroidLat: center.lat, centroidLon: center.lon, borders });
}

provinces.sort((a, b) => a.name.localeCompare(b.name));
if (provinces.length < 13) {
  throw new Error(`Expected 13 Canadian subdivisions, got ${provinces.length}`);
}

function formatRing(ring) {
  const coords = ring.map(([lat, lon]) => `[${lat},${lon}]`);
  const lines = [];
  for (let i = 0; i < coords.length; i += 6) {
    lines.push("        " + coords.slice(i, i + 6).join(",") + ",");
  }
  return lines.join("\n");
}

function formatProvince(province) {
  const bordersStr = province.borders
    .map((ring) => `      [\n${formatRing(ring)}\n      ]`)
    .join(",\n");
  return `  {
    name: ${JSON.stringify(province.name)},
    iso: ${JSON.stringify(province.iso)},
    centroidLat: ${province.centroidLat},
    centroidLon: ${province.centroidLon},
    borders: [
${bordersStr},
    ],
  }`;
}

const timestamp = new Date().toISOString();
const output = `/**
 * Canadian province and territory boundary data (generated).
 *
 * Source: Click That Hood Canada GeoJSON (OSM-derived, public dataset)
 * https://github.com/codeforamerica/click_that_hood
 * Generated: ${timestamp}
 * Subdivisions: ${provinces.length}
 *
 * DO NOT EDIT — regenerate with: node scripts/generate-canada-data.mjs
 */

export interface ProvinceData {
  name: string;
  iso: string;
  centroidLat: number;
  centroidLon: number;
  borders: [number, number][][];
}

export const CANADA_PROVINCES: ProvinceData[] = [
${provinces.map(formatProvince).join(",\n")},
];
`;

await fs.writeFile(OUTPUT_FILE, output, "utf-8");
console.log(`Generated ${OUTPUT_FILE}`);
console.log(`  Provinces: ${provinces.length}`);
console.log(`  File size: ${(output.length / 1024).toFixed(1)} KB`);
