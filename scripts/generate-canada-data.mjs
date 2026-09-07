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
export const COAST_BUFFER_DEG = 0.03;
export const COORD_DECIMALS = 3;

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

function signedAreaLonLat(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const lonI = ring[i][1];
    const latI = ring[i][0];
    const lonJ = ring[j][1];
    const latJ = ring[j][0];
    area += lonJ * latI - lonI * latJ;
  }
  return area / 2;
}

function normalize(dx, dy) {
  const length = Math.hypot(dx, dy);
  if (length < 1e-12) return [0, 0];
  return [dx / length, dy / length];
}

/** Outward vertex offset so harbor cities ~2 km seaward of the source remain inside. */
export function bufferRingOutward(ring, distance = COAST_BUFFER_DEG) {
  if (ring.length < 4 || distance <= 0) return ring;
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const pts = closed ? ring.slice(0, -1) : ring;
  if (pts.length < 3) return ring;
  const ccw = signedAreaLonLat(pts) >= 0;
  const buffered = [];
  for (let i = 0; i < pts.length; i += 1) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    const [e1x, e1y] = normalize(curr[1] - prev[1], curr[0] - prev[0]);
    const [e2x, e2y] = normalize(next[1] - curr[1], next[0] - curr[0]);
    const n1x = ccw ? e1y : -e1y;
    const n1y = ccw ? -e1x : e1x;
    const n2x = ccw ? e2y : -e2y;
    const n2y = ccw ? -e2x : e2x;
    let [nx, ny] = normalize(n1x + n2x, n1y + n2y);
    if (nx === 0 && ny === 0) {
      nx = n1x;
      ny = n1y;
    }
    buffered.push([round(curr[0] + ny * distance), round(curr[1] + nx * distance)]);
  }
  if (buffered.length === 0) return ring;
  buffered.push([buffered[0][0], buffered[0][1]]);
  return buffered;
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
      const buffered = bufferRingOutward(simplified);
      if (buffered.length >= 4) mapped.push(buffered);
    }
    if (mapped.length === 0) continue;
    const [exterior, ...holes] = mapped;
    if (ringArea(exterior) < 1e-4) continue;
    result.push({ exterior, holes });
  }
  return result;
}

function centroid(polygons) {
  const ring = polygons.reduce(
    (best, current) => current.exterior.length > best.length ? current.exterior : best,
    polygons[0]?.exterior ?? [],
  );
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
 * Simplifier: Ramer–Douglas–Peucker epsilon ${RDP_EPSILON_DEG}°, then ${COAST_BUFFER_DEG}° outward coast buffer
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
    const center = centroid(polygons);
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
