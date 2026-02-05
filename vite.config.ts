import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
        target: "https://dxheat.com",
        changeOrigin: true,
        rewrite: (pathStr) => {
          try {
            const url = new URL(`http://local${pathStr}`);
            const limit = url.searchParams.get("limit") || "50";
            return `/dxc/data/get?limit=${limit}`;
          } catch {
            return "/dxc/data/get?limit=50";
          }
        },
      },
      // RBN spots proxy (dev only) - mirrors Vercel `/api/spots/rbn`
      "/api/spots/rbn": {
        target: "https://www.reversebeacon.net",
        changeOrigin: true,
        rewrite: (pathStr) => {
          try {
            const url = new URL(`http://local${pathStr}`);
            const limit = url.searchParams.get("limit") || "50";
            return `/spots.php?s=1&r=${limit}`;
          } catch {
            return "/spots.php?s=1&r=50";
          }
        },
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
