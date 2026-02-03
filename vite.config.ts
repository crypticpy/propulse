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
