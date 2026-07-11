import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "Propulse - Ham Radio Propagation",
        short_name: "Propulse",
        description:
          "Real-time solar weather and propagation visualization for ham radio operators",
        theme_color: "#FF6B00",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Runtime caching configuration
        runtimeCaching: [
          // Cache NOAA API responses (network first, fall back to cache)
          {
            urlPattern: /^https:\/\/services\.swpc\.noaa\.gov\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "solar-data-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Cache local API proxy responses (development)
          {
            urlPattern: /^\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Cache static assets (cache first)
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
            },
          },
          // Cache fonts
          {
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 1 month
              },
            },
          },
          // Cache JS/CSS bundles
          {
            urlPattern: /\.(?:js|css)$/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-resources-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
            },
          },
        ],
        // Pre-cache critical assets
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Clean up old caches
        cleanupOutdatedCaches: true,
        // Skip waiting for old service worker
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: true, // Enable PWA in development for testing
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
      // Aurora OVATION data proxy
      "/api/aurora": {
        target: "https://services.swpc.noaa.gov",
        changeOrigin: true,
        rewrite: () => "/json/ovation_aurora_latest.json",
      },
    },
  },
});
