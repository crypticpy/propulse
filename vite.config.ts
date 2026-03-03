import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import type { Plugin } from "vite";

// ─── HamQTH dev proxy plugin ───────────────────────────────────────────────
// In dev mode, edge functions don't run. This plugin adds a middleware that
// proxies /api/callsign/hamqth requests to the HamQTH XML API with session
// auth, mirroring what the Vercel Edge Function does in production.

function hamqthDevProxy(): Plugin {
  let sessionId: string | null = null;

  function extractXmlValue(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
    const match = xml.match(regex);
    return match ? match[1].trim() : undefined;
  }

  async function authenticate(): Promise<string | null> {
    const username = process.env.HAMQTH_USERNAME;
    const password = process.env.HAMQTH_PASSWORD;
    if (!username || !password) return null;

    try {
      const url = `https://www.hamqth.com/xml.php?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Propulse/1.0 (Dev Proxy)" },
      });
      if (!res.ok) return null;
      const xml = await res.text();
      const sid = extractXmlValue(xml, "session_id");
      if (sid) sessionId = sid;
      return sid ?? null;
    } catch {
      return null;
    }
  }

  return {
    name: "hamqth-dev-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/callsign/hamqth")) return next();

        const url = new URL(req.url, "http://localhost");
        const callsign = url.searchParams.get("callsign");
        if (!callsign) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: "Missing callsign", provider: "hamqth" }),
          );
          return;
        }

        // Authenticate if needed
        if (!sessionId) {
          const sid = await authenticate();
          if (!sid) {
            res.writeHead(501, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error:
                  "HamQTH credentials not configured. Set HAMQTH_USERNAME and HAMQTH_PASSWORD in .env",
                provider: "hamqth",
              }),
            );
            return;
          }
        }

        // Lookup
        try {
          const lookupUrl = `https://www.hamqth.com/xml.php?id=${encodeURIComponent(sessionId!)}&callsign=${encodeURIComponent(callsign)}&prg=PropUlse`;
          const lookupRes = await fetch(lookupUrl, {
            headers: { "User-Agent": "Propulse/1.0 (Dev Proxy)" },
          });

          if (!lookupRes.ok) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: `Lookup failed: ${lookupRes.status}`,
                provider: "hamqth",
              }),
            );
            return;
          }

          const xml = await lookupRes.text();
          const errorMsg = extractXmlValue(xml, "error");

          // Session expired — re-auth once
          if (
            errorMsg &&
            (errorMsg.toLowerCase().includes("session") ||
              errorMsg.toLowerCase().includes("invalid"))
          ) {
            sessionId = null;
            const sid = await authenticate();
            if (!sid) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Re-authentication failed",
                  provider: "hamqth",
                }),
              );
              return;
            }
            // Retry (recursive would be cleaner but middleware doesn't support it)
            const retryUrl = `https://www.hamqth.com/xml.php?id=${encodeURIComponent(sessionId!)}&callsign=${encodeURIComponent(callsign)}&prg=PropUlse`;
            const retryRes = await fetch(retryUrl, {
              headers: { "User-Agent": "Propulse/1.0 (Dev Proxy)" },
            });
            if (!retryRes.ok) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({ error: "Retry failed", provider: "hamqth" }),
              );
              return;
            }
            const retryXml = await retryRes.text();
            return sendParsedResponse(res, retryXml, callsign);
          }

          if (errorMsg) {
            const status = errorMsg.toLowerCase().includes("not found")
              ? 404
              : 500;
            res.writeHead(status, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: errorMsg, provider: "hamqth" }));
            return;
          }

          sendParsedResponse(res, xml, callsign);
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
              provider: "hamqth",
            }),
          );
        }
      });
    },
  };

  function sendParsedResponse(
    res: import("http").ServerResponse,
    xml: string,
    fallbackCallsign: string,
  ) {
    const nick = extractXmlValue(xml, "nick");
    const adrName = extractXmlValue(xml, "adr_name");
    const adrCity = extractXmlValue(xml, "adr_city");
    const country = extractXmlValue(xml, "country");
    const grid = extractXmlValue(xml, "grid");
    const cq = extractXmlValue(xml, "cq");
    const itu = extractXmlValue(xml, "itu");
    const latitude = extractXmlValue(xml, "latitude");
    const longitude = extractXmlValue(xml, "longitude");
    const rawCallsign = extractXmlValue(xml, "callsign");
    const about = extractXmlValue(xml, "about");
    const picture = extractXmlValue(xml, "picture");
    const web = extractXmlValue(xml, "web");

    const name = nick || adrName || undefined;
    const qthParts: string[] = [];
    if (adrCity) qthParts.push(adrCity);
    if (country) qthParts.push(country);
    const qth = qthParts.length > 0 ? qthParts.join(", ") : undefined;

    const lat = latitude ? parseFloat(latitude) : undefined;
    const lon = longitude ? parseFloat(longitude) : undefined;
    const cqzone = cq ? parseInt(cq, 10) : undefined;
    const ituzone = itu ? parseInt(itu, 10) : undefined;

    const result = {
      callsign: rawCallsign || fallbackCallsign,
      name,
      grid,
      qth,
      country,
      cqzone: Number.isFinite(cqzone) ? cqzone : undefined,
      ituzone: Number.isFinite(ituzone) ? ituzone : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lon: Number.isFinite(lon) ? lon : undefined,
      bio: about,
      picture,
      web,
      source: "hamqth",
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  }
}

// ─── QRZ dev proxy plugin ─────────────────────────────────────────────────
// In dev mode, edge functions don't run. This plugin adds a middleware that
// proxies /api/callsign/qrz requests to the QRZ XML API, mirroring what
// the Vercel Edge Function does in production.

function qrzDevProxy(): Plugin {
  function extractXmlValue(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
    const match = xml.match(regex);
    return match ? match[1].trim() : undefined;
  }

  function stripHtml(html: string): string {
    // Strip HTML tags
    let text = html.replace(/<[^>]*>/g, " ");
    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
    // Collapse whitespace and trim
    text = text.replace(/\s+/g, " ").trim();
    // Truncate to 500 characters
    if (text.length > 500) {
      text = text.slice(0, 500);
    }
    return text;
  }

  async function authenticate(
    apiKey: string,
  ): Promise<{ sessionKey?: string; error?: string }> {
    const authUrl = `https://xmldata.qrz.com/xml/current/?username=${encodeURIComponent(apiKey)}&password=${encodeURIComponent(apiKey)}&agent=Propulse`;

    try {
      const res = await fetch(authUrl, {
        headers: { "User-Agent": "Propulse/1.0 (Dev Proxy)" },
      });
      if (!res.ok) return { error: `Authentication failed: ${res.status}` };

      const xml = await res.text();
      const errorMsg = extractXmlValue(xml, "Error");
      if (errorMsg) return { error: errorMsg };

      const sessionKey = extractXmlValue(xml, "Key");
      if (!sessionKey) return { error: "No session key returned from QRZ" };

      return { sessionKey };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { error: `Authentication request failed: ${message}` };
    }
  }

  async function fetchBio(
    sessionKey: string,
    callsign: string,
  ): Promise<string | undefined> {
    const bioUrl = `https://xmldata.qrz.com/xml/current/?s=${encodeURIComponent(sessionKey)}&html=${encodeURIComponent(callsign)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(bioUrl, {
        headers: { "User-Agent": "Propulse/1.0 (Dev Proxy)" },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) return undefined;

      const html = await res.text();
      if (!html || html.trim().length === 0) return undefined;

      const text = stripHtml(html);
      return text.length > 0 ? text : undefined;
    } catch {
      // Timeout, network error, or abort — continue without bio
      return undefined;
    }
  }

  return {
    name: "qrz-dev-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/callsign/qrz")) return next();

        const url = new URL(req.url, "http://localhost");
        const callsign = url.searchParams.get("callsign");
        const apiKey = url.searchParams.get("apiKey");

        if (!callsign) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ error: "Missing callsign", provider: "qrz" }),
          );
          return;
        }

        if (!apiKey) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "Missing apiKey parameter. Provide your QRZ XML Logbook Data subscription key.",
              provider: "qrz",
            }),
          );
          return;
        }

        // Authenticate
        const authResult = await authenticate(apiKey);
        if (authResult.error) {
          const isAuthError =
            authResult.error.toLowerCase().includes("password") ||
            authResult.error.toLowerCase().includes("username") ||
            authResult.error.toLowerCase().includes("invalid") ||
            authResult.error.toLowerCase().includes("not found") ||
            authResult.error.toLowerCase().includes("denied");

          res.writeHead(isAuthError ? 401 : 500, {
            "Content-Type": "application/json",
          });
          res.end(
            JSON.stringify({
              error: isAuthError ? "Invalid QRZ API key" : authResult.error,
              provider: "qrz",
            }),
          );
          return;
        }

        const sessionKey = authResult.sessionKey!;

        // Lookup
        try {
          const lookupUrl = `https://xmldata.qrz.com/xml/current/?s=${encodeURIComponent(sessionKey)}&callsign=${encodeURIComponent(callsign)}`;
          const lookupRes = await fetch(lookupUrl, {
            headers: { "User-Agent": "Propulse/1.0 (Dev Proxy)" },
          });

          if (!lookupRes.ok) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: `Lookup failed: ${lookupRes.status}`,
                provider: "qrz",
              }),
            );
            return;
          }

          const xml = await lookupRes.text();
          const errorMsg = extractXmlValue(xml, "Error");

          if (errorMsg) {
            if (
              errorMsg.toLowerCase().includes("not found") ||
              errorMsg.toLowerCase().includes("not exist")
            ) {
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Callsign not found",
                  provider: "qrz",
                }),
              );
              return;
            }
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: errorMsg, provider: "qrz" }));
            return;
          }

          // Extract fields from QRZ XML <Callsign> element
          const rawCallsign = extractXmlValue(xml, "call");
          const fname = extractXmlValue(xml, "fname");
          const lname = extractXmlValue(xml, "name");
          const grid = extractXmlValue(xml, "grid");
          const latitude = extractXmlValue(xml, "lat");
          const longitude = extractXmlValue(xml, "lon");
          const country = extractXmlValue(xml, "country");
          const city = extractXmlValue(xml, "addr2");
          const state = extractXmlValue(xml, "state");
          const licenseClass = extractXmlValue(xml, "class");
          const grantDate = extractXmlValue(xml, "efdate");
          const expiryDate = extractXmlValue(xml, "expdate");
          const imageUrl = extractXmlValue(xml, "image");
          const cq = extractXmlValue(xml, "cqzone");
          const itu = extractXmlValue(xml, "ituzone");
          const bio = extractXmlValue(xml, "bio");

          // Build name from first + last
          const nameParts: string[] = [];
          if (fname) nameParts.push(fname);
          if (lname) nameParts.push(lname);
          const name = nameParts.length > 0 ? nameParts.join(" ") : undefined;

          // Build QTH from city and state
          const qthParts: string[] = [];
          if (city) qthParts.push(city);
          if (state) qthParts.push(state);
          const qth = qthParts.length > 0 ? qthParts.join(", ") : undefined;

          // Parse numeric values
          const lat = latitude ? parseFloat(latitude) : undefined;
          const lon = longitude ? parseFloat(longitude) : undefined;
          const cqzone = cq ? parseInt(cq, 10) : undefined;
          const ituzone = itu ? parseInt(itu, 10) : undefined;

          // Bio length (number of bytes reported by QRZ)
          const bioLength = bio ? parseInt(bio, 10) : 0;

          const data: Record<string, string | number | undefined> = {
            callsign: rawCallsign || callsign,
            name,
            grid,
            qth,
            country,
            licenseClass: licenseClass ? licenseClass.toUpperCase() : undefined,
            grantDate: grantDate || undefined,
            expiryDate: expiryDate || undefined,
            imageUrl: imageUrl || undefined,
            cqzone: Number.isFinite(cqzone) ? cqzone : undefined,
            ituzone: Number.isFinite(ituzone) ? ituzone : undefined,
            lat: Number.isFinite(lat) ? lat : undefined,
            lon: Number.isFinite(lon) ? lon : undefined,
            source: "qrz",
          };

          // If bio length > 0, fetch bio HTML and extract text
          if (Number.isFinite(bioLength) && bioLength > 0) {
            const bioText = await fetchBio(sessionKey, callsign);
            if (bioText) {
              data.bioText = bioText;
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
              provider: "qrz",
            }),
          );
        }
      });
    },
  };
}

// ─── Layer dev proxy plugin ────────────────────────────────────────────────
// Handles API endpoints that only run on Vercel in production:
// - DRAP: parses NOAA text format (JSON endpoint is dead)
// - Sporadic E, Ducting, WSPR: computed models (pure math, no external deps)
// - Lightning: fetches from collector service (COLLECTOR_URL env var)
// - Fires: proxies to NASA FIRMS (FIRMS_MAP_KEY env var)

function layerDevProxy(): Plugin {
  return {
    name: "layer-dev-proxy",
    configureServer(server) {
      // ── DRAP: parse NOAA text table into DRAPData JSON ──────────────
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== "/api/solar/drap") return next();

        try {
          const noaaRes = await fetch(
            "https://services.swpc.noaa.gov/text/drap_global_frequencies.txt",
            {
              headers: {
                "User-Agent": "Propulse/1.0 (Dev Proxy)",
                Accept: "text/plain",
              },
            },
          );
          if (!noaaRes.ok) {
            res.writeHead(noaaRes.status, {
              "Content-Type": "application/json",
            });
            res.end(
              JSON.stringify({ error: `NOAA returned ${noaaRes.status}` }),
            );
            return;
          }
          const text = await noaaRes.text();
          const lines = text.split("\n");

          // Extract observation time from header
          let observationTime = new Date().toISOString();
          for (const line of lines) {
            if (line.includes("Product Valid At")) {
              const match = line.match(
                /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*UTC/,
              );
              if (match)
                observationTime = new Date(match[1] + "Z").toISOString();
              break;
            }
          }

          // Parse longitude header row
          let longitudes: number[] = [];
          const latitudes: number[] = [];
          const frequencies: number[][] = [];

          for (const line of lines) {
            const trimmed = line.trim();
            // Skip comments, pure-dash separator lines, and blank lines
            if (
              trimmed.startsWith("#") ||
              /^-+$/.test(trimmed) ||
              trimmed === ""
            )
              continue;

            // Longitude header: first non-comment, non-separator line with many numbers
            if (longitudes.length === 0 && !trimmed.includes("|")) {
              longitudes = trimmed
                .split(/\s+/)
                .map(Number)
                .filter(Number.isFinite);
              continue;
            }

            // Data rows: "lat | val val val ..."
            if (trimmed.includes("|")) {
              const [latStr, valsStr] = trimmed.split("|");
              const lat = parseFloat(latStr.trim());
              if (!Number.isFinite(lat)) continue;
              const vals = valsStr.trim().split(/\s+/).map(Number);
              latitudes.push(lat);
              frequencies.push(vals);
            }
          }

          const result = {
            observation_time: observationTime,
            forecast_time: observationTime,
            frequencies,
            latitudes,
            longitudes,
          };

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "DRAP fetch failed",
            }),
          );
        }
      });

      // ── Sporadic E: computed model ──────────────────────────────────
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/propagation/sporadic-e")) return next();

        const url = new URL(req.url, "http://localhost");
        const now = new Date();
        const month = Math.max(
          1,
          Math.min(
            12,
            parseInt(
              url.searchParams.get("month") || String(now.getUTCMonth() + 1),
            ),
          ),
        );
        const hour = Math.max(
          0,
          Math.min(
            23,
            parseInt(url.searchParams.get("hour") || String(now.getUTCHours())),
          ),
        );
        const resolution = Math.max(
          5,
          Math.min(30, parseInt(url.searchParams.get("resolution") || "10")),
        );

        const regions: {
          lat: number;
          lon: number;
          probability: number;
          estimatedFoEs: number;
        }[] = [];
        for (let lat = -80; lat <= 80; lat += resolution) {
          for (let lon = -180; lon < 180; lon += resolution) {
            const absLat = Math.abs(lat);
            const latFactor =
              absLat < 10
                ? 0.2
                : absLat < 25
                  ? 0.2 + 0.6 * ((absLat - 10) / 15)
                  : absLat < 55
                    ? 0.8 +
                      0.2 *
                        Math.cos((Math.abs(absLat - 40) / 15) * (Math.PI / 2))
                    : absLat < 70
                      ? 0.8 * (1 - (absLat - 55) / 15)
                      : 0.1;
            const peakMonth = lat >= 0 ? 6 : 12;
            const md = Math.abs(month - peakMonth);
            const nmd = md > 6 ? 12 - md : md;
            // Floor of 0.08 ensures some Es activity year-round (real Es
            // can occur in any month, just at much lower rates in winter)
            const seasonFactor = Math.max(
              0.08,
              0.2 + 0.8 * Math.cos((nmd / 6) * Math.PI),
            );
            const lsh = (((hour + lon / 15) % 24) + 24) % 24;
            const dayPeak = Math.max(0, Math.cos(((lsh - 12) / 12) * Math.PI));
            const nightPeak = Math.max(0, 0.3 * Math.cos((lsh / 12) * Math.PI));
            const probability = Math.min(
              1,
              latFactor * seasonFactor * Math.max(dayPeak, nightPeak),
            );
            if (probability >= 0.02) {
              const foEs = 3.0 + 9.0 * probability;
              regions.push({
                lat,
                lon,
                probability: Math.round(probability * 1000) / 1000,
                estimatedFoEs: Math.round(foEs * 100) / 100,
              });
            }
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            month,
            hour,
            resolution,
            timestamp: now.toISOString(),
            count: regions.length,
            regions,
          }),
        );
      });

      // ── Ducting: computed model ─────────────────────────────────────
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/propagation/ducting")) return next();

        const url = new URL(req.url, "http://localhost");
        const now = new Date();
        const month = Math.max(
          1,
          Math.min(
            12,
            parseInt(
              url.searchParams.get("month") || String(now.getUTCMonth() + 1),
            ),
          ),
        );
        const hour = Math.max(
          0,
          Math.min(
            23,
            parseInt(url.searchParams.get("hour") || String(now.getUTCHours())),
          ),
        );
        const resolution = Math.max(
          5,
          Math.min(30, parseInt(url.searchParams.get("resolution") || "10")),
        );

        const regions: {
          lat: number;
          lon: number;
          probability: number;
          type: string;
        }[] = [];
        for (let lat = -70; lat <= 70; lat += resolution) {
          for (let lon = -180; lon < 180; lon += resolution) {
            const absLat = Math.abs(lat);
            // Simplified coastal factor
            const coastal = absLat < 60 ? 0.25 : 0.1;
            const lsh = (((hour + lon / 15) % 24) + 24) % 24;
            const isN = lat >= 0;
            // Surface ducting
            const sPeakMonth = isN ? 9 : 3;
            const sMd = Math.abs(month - sPeakMonth);
            const sNmd = sMd > 6 ? 12 - sMd : sMd;
            const sSeason = 0.3 + 0.7 * Math.cos((sNmd / 6) * Math.PI);
            const sNight = lsh >= 18 || lsh < 6 ? 1.0 : 0.4;
            const sProb = Math.min(
              1,
              coastal * Math.max(0, sSeason) * sNight * 0.8,
            );
            if (sProb >= 0.02)
              regions.push({
                lat,
                lon,
                probability: Math.round(sProb * 1000) / 1000,
                type: "surface",
              });
            // Elevated ducting
            const eLat =
              absLat >= 15 && absLat <= 45
                ? 0.6 +
                  0.4 * Math.cos((Math.abs(absLat - 30) / 15) * (Math.PI / 2))
                : absLat < 15
                  ? 0.4
                  : Math.max(0.1, 0.6 * (1 - (absLat - 45) / 25));
            const ePeakMonth = isN ? 7 : 1;
            const eMd = Math.abs(month - ePeakMonth);
            const eNmd = eMd > 6 ? 12 - eMd : eMd;
            const eSeason = 0.3 + 0.7 * Math.cos((eNmd / 6) * Math.PI);
            const eProb = Math.min(
              1,
              coastal * 0.6 * eLat * Math.max(0, eSeason),
            );
            if (eProb >= 0.02)
              regions.push({
                lat,
                lon,
                probability: Math.round(eProb * 1000) / 1000,
                type: "elevated",
              });
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            month,
            hour,
            resolution,
            timestamp: now.toISOString(),
            count: regions.length,
            regions,
          }),
        );
      });

      // ── WSPR: synthetic spots ───────────────────────────────────────
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/propagation/wspr")) return next();

        const url = new URL(req.url, "http://localhost");
        const band = url.searchParams.get("band") || "20m";
        const now = new Date();

        const WSPR_BANDS: Record<string, number> = {
          "160m": 1.8366,
          "80m": 3.5926,
          "60m": 5.2872,
          "40m": 7.0386,
          "30m": 10.1387,
          "20m": 14.0956,
          "17m": 18.1046,
          "15m": 21.0946,
          "12m": 24.9246,
          "10m": 28.1246,
          "6m": 50.293,
        };
        const STATIONS = [
          { c: "W3HH", g: "FM19", la: 39, lo: -77 },
          { c: "VK2RG", g: "QF56", la: -33.8, lo: 151.2 },
          { c: "G8JNJ", g: "IO91", la: 51.5, lo: -0.1 },
          { c: "PA0O", g: "JO21", la: 51.4, lo: 4.3 },
          { c: "JA1BRK", g: "PM95", la: 35.7, lo: 139.7 },
          { c: "ZL2IFB", g: "RE78", la: -41.3, lo: 174.8 },
          { c: "LU8EKC", g: "GF05", la: -34.6, lo: -58.4 },
          { c: "W6LVP", g: "DM04", la: 34.1, lo: -118.3 },
          { c: "OH2GAX", g: "KP20", la: 60.2, lo: 25 },
          { c: "VE3GHN", g: "FN03", la: 43.7, lo: -79.4 },
        ];

        function rng32(s: number) {
          return () => {
            s |= 0;
            s = (s + 0x6d2b79f5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        }

        function genSpots(b: string) {
          const freq = WSPR_BANDS[b];
          if (!freq) return [];
          const seed =
            now.getUTCFullYear() * 1e6 +
            (now.getUTCMonth() + 1) * 1e4 +
            now.getUTCDate() * 100 +
            now.getUTCHours() * 10 +
            Math.floor(now.getUTCMinutes() / 5);
          const rng = rng32(seed + freq * 1000);
          const ha = ((now.getUTCHours() - 14) / 12) * Math.PI;
          const df =
            freq < 10
              ? 0.5 + 0.5 * (1 - (0.4 + 0.6 * Math.cos(ha)))
              : 0.3 + 0.7 * (0.4 + 0.6 * Math.cos(ha));
          const count = Math.floor(8 + rng() * 40 * df);
          const spots: Record<string, unknown>[] = [];
          for (let i = 0; i < count && i < 100; i++) {
            const tx = STATIONS[Math.floor(rng() * STATIONS.length)];
            let ri = Math.floor(rng() * STATIONS.length);
            if (ri === STATIONS.indexOf(tx)) ri = (ri + 1) % STATIONS.length;
            const rx = STATIONS[ri];
            const dLat = ((rx.la - tx.la) * Math.PI) / 180;
            const dLon = ((rx.lo - tx.lo) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos((tx.la * Math.PI) / 180) *
                Math.cos((rx.la * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
            const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            spots.push({
              callsign: tx.c,
              grid: tx.g,
              frequency: freq,
              snr: Math.round(
                -30 + 35 * Math.max(0, 1 - dist / 20000) + (rng() - 0.5) * 10,
              ),
              drift: Math.round((rng() - 0.5) * 4),
              distance: Math.round(dist),
              timestamp: new Date(
                now.getTime() - Math.floor(rng() * 300000),
              ).toISOString(),
              txLat: tx.la,
              txLon: tx.lo,
              rxCallsign: rx.c,
              rxGrid: rx.g,
              rxLat: rx.la,
              rxLon: rx.lo,
            });
          }
          return spots;
        }

        const spots =
          band === "all"
            ? Object.keys(WSPR_BANDS).flatMap(genSpots).slice(0, 200)
            : genSpots(band);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            band,
            count: spots.length,
            timestamp: now.toISOString(),
            spots,
          }),
        );
      });

      // ── Lightning: fetch from collector service ────────────────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/lightning/strikes")) return next();

        const collectorUrl = process.env.COLLECTOR_URL;
        if (!collectorUrl) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              strikes: [],
              note: "COLLECTOR_URL not set in .env — lightning data unavailable in dev. Set it to your Railway collector URL.",
            }),
          );
          return;
        }

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8_000);

          const cRes = await fetch(`${collectorUrl}/lightning`, {
            headers: {
              Accept: "application/json",
              "User-Agent": "Propulse/1.0 (Dev Proxy)",
            },
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!cRes.ok) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                strikes: [],
                error: `Collector returned ${cRes.status}`,
              }),
            );
            return;
          }

          const data = await cRes.json();
          const strikes = Array.isArray(data?.strikes)
            ? data.strikes.slice(0, 5000)
            : [];

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ strikes }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              strikes: [],
              error: `Collector fetch failed: ${msg}`,
            }),
          );
        }
      });

      // ── Fires: proxy to NASA FIRMS (requires FIRMS_MAP_KEY) ─────────
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/fires/hotspots")) return next();

        const key = process.env.FIRMS_MAP_KEY;
        if (!key) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              hotspots: [],
              note: "FIRMS_MAP_KEY not set in .env — fire data unavailable in dev",
            }),
          );
          return;
        }
        try {
          const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/world/1`;
          const fRes = await fetch(firmsUrl, {
            headers: { "User-Agent": "Propulse/1.0" },
          });
          if (!fRes.ok) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                hotspots: [],
                error: `FIRMS returned ${fRes.status}`,
              }),
            );
            return;
          }
          const csv = await fRes.text();
          const lines = csv.trim().split("\n");
          if (lines.length < 2) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ hotspots: [] }));
            return;
          }
          // Parse header to find column indices (resilient to column order changes)
          const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
          const latIdx = header.indexOf("latitude");
          const lonIdx = header.indexOf("longitude");
          const brightIdx = header.indexOf("bright_ti4");
          const confIdx = header.indexOf("confidence");
          const frpIdx = header.indexOf("frp");
          if (latIdx === -1 || lonIdx === -1) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ hotspots: [] }));
            return;
          }
          const hotspots: {
            lat: number;
            lon: number;
            brightness: number;
            confidence: string;
            frp: number;
          }[] = [];
          for (let i = 1; i < lines.length && hotspots.length < 5000; i++) {
            const cols = lines[i].split(",");
            const lat = parseFloat(cols[latIdx]);
            const lon = parseFloat(cols[lonIdx]);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            hotspots.push({
              lat,
              lon,
              brightness:
                brightIdx !== -1 ? parseFloat(cols[brightIdx]) || 0 : 0,
              confidence: confIdx !== -1 ? cols[confIdx].trim() : "nominal",
              frp: frpIdx !== -1 ? parseFloat(cols[frpIdx]) || 0 : 0,
            });
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ hotspots }));
        } catch {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ hotspots: [] }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load ALL env variables (prefix '') so non-VITE_ keys like FIRMS_MAP_KEY,
  // COLLECTOR_URL, HAMQTH_USERNAME, etc. are available to dev proxy middleware
  // via process.env. Vite only auto-loads VITE_-prefixed vars by default.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return {
    plugins: [
      react(),
      hamqthDevProxy(),
      qrzDevProxy(),
      layerDevProxy(),
      VitePWA({
        registerType: "prompt",
        includeAssets: ["propulse.svg"],
        manifest: {
          name: "Propulse — Ham Radio Propagation Dashboard",
          short_name: "Propulse",
          description:
            "Real-time propagation conditions, band planning, and DX tools",
          theme_color: "#0a0a1a",
          background_color: "#0a0a1a",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "propulse.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,jpg,woff2}"],
          globIgnores: ["**/textures/**"],
          navigateFallback: "/index.html",
          runtimeCaching: [
            {
              // Cache public data APIs only — exclude credential-forwarding endpoints
              urlPattern:
                /^https:\/\/.*\/api\/(?!log\/|callsign\/qrz|callsign\/hamqth|profile\/heartbeat)/,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-cache",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 300,
                },
                networkTimeoutSeconds: 10,
              },
            },
            {
              // NASA GIBS satellite imagery tiles (free tier)
              urlPattern: /^https:\/\/gibs\.earthdata\.nasa\.gov\/.*/,
              handler: "CacheFirst",
              options: {
                cacheName: "tiles-gibs",
                expiration: {
                  maxEntries: 2000,
                  maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
                },
              },
            },
            {
              // OpenStreetMap standard tiles (free tier)
              urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
              handler: "CacheFirst",
              options: {
                cacheName: "tiles-osm",
                expiration: {
                  maxEntries: 3000,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
              },
            },
            {
              // Mapbox/ESRI proxy tiles (Pro tier)
              urlPattern: /\/api\/tiles\/proxy/,
              handler: "CacheFirst",
              options: {
                cacheName: "tiles-pro",
                expiration: {
                  maxEntries: 3000,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Code splitting configuration for optimal bundle sizes
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vendor chunks for caching and smaller chunk sizes.
            if (id.includes("node_modules")) {
              if (
                id.includes("/node_modules/react/") ||
                id.includes("/node_modules/react-dom/") ||
                id.includes("/node_modules/react-router") ||
                id.includes("/node_modules/scheduler/")
              ) {
                return "vendor-react";
              }
              if (id.includes("/node_modules/@react-three/drei/")) {
                return "vendor-drei";
              }
              if (id.includes("/node_modules/@react-three/fiber/")) {
                return "vendor-r3f";
              }
              if (id.includes("/node_modules/three/")) {
                return "vendor-three-core";
              }
              if (id.includes("/node_modules/3d-tiles-renderer/")) {
                return "vendor-tiles";
              }
              if (id.includes("/node_modules/@tanstack/react-query/")) {
                return "vendor-tanstack";
              }
              if (
                id.includes("/node_modules/date-fns/") ||
                id.includes("/node_modules/zustand/") ||
                id.includes("/node_modules/zod/") ||
                id.includes("/node_modules/suncalc/")
              ) {
                return "vendor-utils";
              }
            }

            return undefined;
          },
        },
      },
      // Enable source maps for production debugging (optional)
      sourcemap: false,
      // Chunk size warning limit (kB): WebGL/3D bundles are expected to be larger.
      chunkSizeWarningLimit: 1000,
    },
    // Optimize deps for faster dev startup
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "three",
        "@react-three/fiber",
        "@react-three/drei",
        "@tanstack/react-query",
        "date-fns",
        "zustand",
        "3d-tiles-renderer",
      ],
    },
    server: {
      proxy: {
        // Proxy API requests to NOAA during local development
        // Uses same JSON endpoints as Vercel Edge Functions
        "/api/solar/k-index": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/json/planetary_k_index_1m.json",
        },
        "/api/solar/flux": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/json/f107_cm_flux.json",
        },
        "/api/solar/probabilities": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/json/solar_probabilities.json",
        },
        "/api/solar/sunspots": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/json/solar-cycle/sunspots.json",
        },
        "/api/solar/magnetometer": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/json/rtsw/rtsw_mag_1m.json",
        },
        // New solar data proxies (proton flux, Dst, X-ray, DRAP, CME, SFI forecast)
        "/api/solar/protons": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/json/goes/primary/integral-protons-1-day.json",
        },
        "/api/solar/dst": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/products/kyoto-dst.json",
        },
        "/api/solar/xray": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/json/goes/primary/xrays-6-hour.json",
        },
        // DRAP: handled by layerDevProxy() middleware (parses NOAA text format)
        "/api/solar/cme": {
          target: "https://api.nasa.gov",
          changeOrigin: true,
          rewrite: () => {
            const end = new Date();
            const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
            const fmt = (d: Date) => d.toISOString().slice(0, 10);
            return `/DONKI/CMEAnalysis?startDate=${fmt(start)}&endDate=${fmt(end)}&mostAccurateOnly=true&speed500=true&halfAngle30=true&catalog=ALL&api_key=DEMO_KEY`;
          },
        },
        "/api/solar/flux-forecast": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/text/3-day-solar-geomag-predictions.txt",
        },
        // Aurora OVATION data proxy
        "/api/aurora": {
          target: "https://services.swpc.noaa.gov",
          changeOrigin: true,
          rewrite: () => "/json/ovation_aurora_latest.json",
        },
        // DX Cluster spots proxy (dev only) - mirrors Vercel `/api/spots/dxcluster`
        "/api/spots/dxcluster": {
          target: "https://www.hamqth.com",
          changeOrigin: true,
          rewrite: (pathStr) => {
            try {
              const url = new URL(`http://local${pathStr}`);
              const limit = url.searchParams.get("limit") || "50";
              return `/dxc_csv.php?limit=${limit}`;
            } catch {
              return "/dxc_csv.php?limit=50";
            }
          },
        },
        // RBN spots proxy (dev only) - mirrors Vercel `/api/spots/rbn`
        "/api/spots/rbn": {
          target: "https://www.hamqth.com",
          changeOrigin: true,
          rewrite: () => `/rbn_data.php?data=1&age=900`,
        },
        // PSKReporter spots proxy (dev only) - mirrors Vercel `/api/spots/pskreporter`
        "/api/spots/pskreporter": {
          target: "https://retrieve.pskreporter.info",
          changeOrigin: true,
          rewrite: (pathStr) => {
            try {
              const url = new URL(`http://local${pathStr}`);
              const params = new URLSearchParams();
              params.set("flowStartSeconds", "-900");
              params.set("rronly", "1");
              params.set("noactive", "1");
              const grid = url.searchParams.get("grid");
              if (grid) params.set("receiverLocator", grid.substring(0, 4));
              const mode = url.searchParams.get("mode");
              if (mode) params.set("mode", mode);
              return `/query?${params}`;
            } catch {
              return "/query?flowStartSeconds=-900&rronly=1&noactive=1";
            }
          },
        },
        // Satellite TLE proxy (dev only) - mirrors Vercel `/api/satellites/tle`
        // Uses AMSAT as primary (reliable) with Celestrak as rewrite target backup
        "/api/satellites/tle": {
          target: "https://www.amsat.org",
          changeOrigin: true,
          rewrite: () => "/tle/current/nasabare.txt",
        },
        // SatNOGS transmitter data proxy (dev only) - fetches transmitter info by NORAD ID
        "/api/satellites/satnogs": {
          target: "https://db.satnogs.org",
          changeOrigin: true,
          rewrite: (pathStr) => {
            const url = new URL(pathStr, "http://localhost");
            const norad = url.searchParams.get("norad") || "";
            return `/api/transmitters/?format=json&satellite__norad_cat_id=${norad}`;
          },
        },
        // AMSAT satellite status proxy (dev only) - fetches operational status by name
        "/api/satellites/status": {
          target: "https://amsat.org",
          changeOrigin: true,
          rewrite: (pathStr) => {
            const url = new URL(pathStr, "http://localhost");
            const name = url.searchParams.get("name") || "";
            return `/status/api/v1/sat_info.php?name=${encodeURIComponent(name)}&hours=24`;
          },
        },
        // Callsign lookup proxy (dev only) - mirrors Vercel `/api/callsign/lookup`
        "/api/callsign/lookup": {
          target: "https://callook.info",
          changeOrigin: true,
          rewrite: (pathStr) => {
            try {
              const url = new URL(`http://local${pathStr}`);
              const callsign = url.searchParams.get("callsign");
              if (callsign) return `/${callsign}/json`;
            } catch {
              // ignore
            }
            return "/INVALID/json";
          },
        },
      },
    },
  };
});
