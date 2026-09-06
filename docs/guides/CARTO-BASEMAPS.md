# CARTO raster basemaps

CARTO requires a basemap key appended as `?key=VALUE` to its raster URLs. See the [official key instructions](https://carto.com/basemaps/apikey/).

Set `CARTO_BASEMAPS_API_KEY` in the build environment (Vercel Production/Preview, or the local project's `.env.local`). Vite explicitly exposes this one value as `import.meta.env.VITE_CARTO_BASEMAPS_API_KEY`. It is intentionally visible in the browser bundle and direct tile requests: use only the limited CARTO basemap key issued for this application, never an account or administrative credential. Keep its value out of Git. Rebuild/redeploy, or restart local development, after changing it.

All raster callers share `src/lib/tiles/carto.ts`. The helper uses the fixed CARTO host and the three existing styles: `dark_all`, `dark_only_labels`, and `light_only_labels`. It safely encodes the key while preserving coordinate placeholders and `@2x.png`. Missing configuration preserves the original unkeyed URLs; CARTO may visibly watermark those requests rather than the app hiding the configuration problem. Existing label themes, tile geometry, OSM defaults, layouts and CARTO/OpenStreetMap credits are unchanged.

[CARTO's basemap terms, section 9.c](https://carto.com/legal/basemap-terms/), allow direct requests by application users and prohibit server-side proxying/caching. There is no CARTO tile endpoint, server cache or credential forwarding in this integration. End-user caching must not exceed 30 days. The service worker has no CARTO cache rule, and the existing CARTO provider's application cache TTL is one day. Browser HTTP caching follows the provider's headers; do not introduce longer client retention or bulk tile downloads. Clear retained CARTO data if the app ceases using the service.

URL tests use synthetic environment values and cover reserved-character encoding, absent configuration, all three styles, and caller/attribution preservation. Live key and deployment checks are separate and must avoid printing the key.
