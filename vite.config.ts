import { defineConfig } from "vite";
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    hamqthDevProxy(),
    qrzDevProxy(),
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
            urlPattern: /^https:\/\/.*\/api\//,
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
        manualChunks: {
          // Vendor chunks for caching
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-three": ["three", "@react-three/fiber", "@react-three/drei"],
          "vendor-tanstack": ["@tanstack/react-query"],
          "vendor-utils": ["date-fns", "zustand", "zod", "suncalc"],
        },
      },
    },
    // Enable source maps for production debugging (optional)
    sourcemap: false,
    // Chunk size warning limit (kB)
    chunkSizeWarningLimit: 500,
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
});
