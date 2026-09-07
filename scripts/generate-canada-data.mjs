/**
 * Generate Canadian province/territory boundary data.
 *
 * Source (pinned): Click That Hood Canada GeoJSON, commit
 * fb1c363b3624a256d42f00788fca96d9faf43a45
 * https://github.com/codeforamerica/click_that_hood/blob/fb1c363b3624a256d42f00788fca96d9faf43a45/public/data/canada.geojson
 *
 * License: MIT (Code for America Click That Hood). Underlying OSM-derived
 * geometries are subject to the ODbL.
 *
 * Simplification: Ramer–Douglas–Peucker on each ring (not every-Nth-vertex).
 *
 * Usage:
 *   node scripts/generate-canada-data.mjs
 *   node scripts/generate-canada-data.mjs --check
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.resolve(__dirname, "../src/lib/data/canadaProvinces.generated.ts");

export const CANADA_SOURCE_COMMIT = "fb1c363b3624a256d42f00788fca96d9faf43a45";
export const CANADA_SOURCE_URL =
  `https://raw.githubusercontent.com/codeforamerica/click_that_hood/${CANADA_SOURCE_COMMIT}/public/data/canada.geojson`;
export const RDP_EPSILON_DEG = 0.015;
export const COORD_DECIMALS = 3;
const ANCHOR_GRID = 28;

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

function round(n, decimals = COORD_DECIMALS) {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function perpendicularDistance(point, start, end) {
  const [py, px] = point;
  const [ay, ax] = start;
  const [by, bx] = end;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ramer–Douglas–Peucker. Preserves high-deviation coastline vertices. */
export function simplifyRingRdp(ring, epsilon = RDP_EPSILON_DEG) {
  if (ring.length <= 4) return ring;
  const closed = ring.length > 1
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1];
  const path = closed ? ring.slice(0, -1) : ring;

  function rdp(points) {
    if (points.length <= 2) return points;
    const start = points[0];
    const end = points[points.length - 1];
    let maxDist = -1;
    let maxIndex = 0;
    for (let i = 1; i < points.length - 1; i += 1) {
      const dist = perpendicularDistance(points[i], start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    if (maxDist <= epsilon) return [start, end];
    const left = rdp(points.slice(0, maxIndex + 1));
    const right = rdp(points.slice(maxIndex));
    return [...left.slice(0, -1), ...right];
  }

  const simplified = rdp(path);
  if (simplified.length < 3) return ring;
  const rounded = [];
  for (const [lat, lon] of simplified) {
    const point = [round(lat), round(lon)];
    const prev = rounded[rounded.length - 1];
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) rounded.push(point);
  }
  if (rounded.length < 3) return ring;
  const first = rounded[0];
  const last = rounded[rounded.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) rounded.push([first[0], first[1]]);
  return rounded.length >= 4 ? rounded : ring;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += ring[j][1] * ring[i][0] - ring[i][1] * ring[j][0];
  }
  return Math.abs(area) / 2;
}

function pointInRing(lat, lon, ring) {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];
    const intersects = (yi > lat) !== (yj > lat)
      && lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lat, lon, polygon) {
  if (!pointInRing(lat, lon, polygon.exterior)) return false;
  return !polygon.holes.some((hole) => pointInRing(lat, lon, hole));
}

function minDistanceToRing(lat, lon, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [ay, ax] = ring[i];
    const [by, bx] = ring[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / length2));
    best = Math.min(best, Math.hypot(lon - (ax + t * dx), lat - (ay + t * dy)));
  }
  return best;
}

function wrapLongitude(lon) {
  let wrapped = lon;
  while (wrapped > 180) wrapped -= 360;
  while (wrapped < -180) wrapped += 360;
  return wrapped;
}

/** Interior representative (max-clearance grid). Not mean-of-vertices. */
function representativePoint(polygons) {
  if (polygons.length === 0) return { lat: 0, lon: 0 };
  let bestPoly = polygons[0];
  let bestArea = -1;
  for (const polygon of polygons) {
    const area = ringArea(polygon.exterior);
    if (area > bestArea) {
      bestArea = area;
      bestPoly = polygon;
    }
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of bestPoly.exterior) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  let winner = null;
  const dLat = (maxLat - minLat) / ANCHOR_GRID;
  const dLon = (maxLon - minLon) / ANCHOR_GRID;
  for (let i = 0; i < ANCHOR_GRID; i += 1) {
    for (let j = 0; j < ANCHOR_GRID; j += 1) {
      const lat = minLat + (i + 0.5) * dLat;
      const lon = wrapLongitude(minLon + (j + 0.5) * dLon);
      if (!pointInPolygon(lat, lon, bestPoly)) continue;
      const dist = Math.min(
        minDistanceToRing(lat, lon, bestPoly.exterior),
        ...bestPoly.holes.map((hole) => minDistanceToRing(lat, lon, hole)),
      );
      if (!winner || dist > winner.dist) winner = { lat, lon, dist };
    }
  }
  if (!winner) {
    return {
      lat: round((minLat + maxLat) / 2, 2),
      lon: round(wrapLongitude((minLon + maxLon) / 2), 2),
    };
  }
  const rounded = { lat: round(winner.lat), lon: round(winner.lon) };
  if (pointInPolygon(rounded.lat, rounded.lon, bestPoly)) return rounded;
  return { lat: winner.lat, lon: winner.lon };
}

function extractPolygons(geometry) {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];
  const result = [];
  for (const polygon of polygons) {
    const mapped = [];
    for (const sourceRing of polygon) {
      if (!sourceRing || sourceRing.length < 3) continue;
      const flipped = sourceRing.map(([lon, lat]) => [lat, lon]);
      const simplified = simplifyRingRdp(flipped);
      if (simplified.length >= 4) mapped.push(simplified);
    }
    if (mapped.length === 0) continue;
    const [exterior, ...holes] = mapped;
    if (ringArea(exterior) < 1e-4) continue;
    result.push({ exterior, holes });
  }
  return result;
}

function formatRing(ring, indent = "          ") {
  const coords = ring.map(([lat, lon]) => `[${lat},${lon}]`);
  const lines = [];
  for (let i = 0; i < coords.length; i += 6) {
    lines.push(indent + coords.slice(i, i + 6).join(",") + ",");
  }
  return lines.join("\n");
}

function formatPolygon(polygon) {
  const holes = polygon.holes
    .map((hole) => `        [\n${formatRing(hole)}\n        ]`)
    .join(",\n");
  return `      {
        exterior: [
${formatRing(polygon.exterior, "          ")}
        ],
        holes: [${polygon.holes.length ? `\n${holes},\n        ` : ""}],
      }`;
}

function formatProvince(province) {
  return `  {
    name: ${JSON.stringify(province.name)},
    iso: ${JSON.stringify(province.iso)},
    centroidLat: ${province.centroidLat},
    centroidLon: ${province.centroidLon},
    polygons: [
${province.polygons.map(formatPolygon).join(",\n")},
    ],
  }`;
}

function renderFile(provinces) {
  const holeCount = provinces.reduce(
    (sum, province) => sum + province.polygons.reduce((inner, polygon) => inner + polygon.holes.length, 0),
    0,
  );
  const ringCount = provinces.reduce(
    (sum, province) => sum + province.polygons.reduce((inner, polygon) => inner + 1 + polygon.holes.length, 0),
    0,
  );
  return `/**
 * Canadian province and territory boundary data (generated).
 *
 * Source: Click That Hood Canada GeoJSON (OSM-derived)
 * Pinned commit: ${CANADA_SOURCE_COMMIT}
 * URL: ${CANADA_SOURCE_URL}
 * License: MIT (Code for America); OSM-derived geometries ODbL
 * Simplifier: Ramer–Douglas–Peucker epsilon ${RDP_EPSILON_DEG}° (no administrative buffer)
 * Anchors: interior max-clearance representative points, not mean-of-vertices
 * Subdivisions: ${provinces.length}; rings: ${ringCount}; holes: ${holeCount}
 *
 * DO NOT EDIT — regenerate with: node scripts/generate-canada-data.mjs
 */

export interface ProvincePolygon {
  exterior: [number, number][];
  holes: [number, number][][];
}

export interface ProvinceData {
  name: string;
  iso: string;
  centroidLat: number;
  centroidLon: number;
  polygons: ProvincePolygon[];
}

export const CANADA_SOURCE_COMMIT = ${JSON.stringify(CANADA_SOURCE_COMMIT)};

export const CANADA_PROVINCES: ProvinceData[] = [
${provinces.map(formatProvince).join(",\n")},
];
`;
}

async function buildProvinces() {
  const response = await fetch(CANADA_SOURCE_URL);
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
    const polygons = extractPolygons(feature.geometry);
    if (polygons.length === 0) continue;
    const center = representativePoint(polygons);
    provinces.push({
      name: canonicalName,
      iso,
      centroidLat: center.lat,
      centroidLon: center.lon,
      polygons,
    });
  }
  provinces.sort((a, b) => a.name.localeCompare(b.name));
  if (provinces.length < 13) {
    throw new Error(`Expected 13 Canadian subdivisions, got ${provinces.length}`);
  }
  return provinces;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const provinces = await buildProvinces();
  const output = renderFile(provinces);
  const check = process.argv.includes("--check");
  if (check) {
    const existing = await fs.readFile(OUTPUT_FILE, "utf-8");
    if (existing !== output) {
      throw new Error("canadaProvinces.generated.ts is stale; run node scripts/generate-canada-data.mjs");
    }
    console.log("Canada geography artifact matches pinned generator output.");
  } else {
    await fs.writeFile(OUTPUT_FILE, output, "utf-8");
    console.log(`Generated ${OUTPUT_FILE}`);
    console.log(`  Provinces: ${provinces.length}`);
    console.log(`  File size: ${(output.length / 1024).toFixed(1)} KB`);
  }
}
