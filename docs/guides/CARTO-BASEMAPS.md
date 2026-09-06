# CARTO raster basemaps

CARTO requires a key appended as `?key=VALUE` to its existing raster URLs. See the [official key instructions](https://carto.com/basemaps/apikey/).

Set `CARTO_BASEMAPS_API_KEY` in the server environment (Vercel Production/Preview, or the local server's `.env.local`). Never prefix it with `VITE_`, place it in a client URL, or commit its value. Restart local development after changing the server environment.

The public `/api/tiles/carto` endpoint supplies the key server-side. It accepts only `style`, `z`, `x`, and `y`: the styles currently used are `dark_all`, `dark_only_labels`, and `light_only_labels`; zoom is 0–20 and X/Y must be nonnegative integers within that zoom's tile grid. Duplicate or additional parameters are rejected. All requests retain the existing `@2x.png` resolution and fixed CARTO host. This does not change the map's OSM default or any layout/attribution.

The portable route manifest mounts the same handler in Vite and the self-hosted bridge. These servers need their own server environment key; no key is delivered to the browser. Missing configuration returns 503. Upstream redirects, failures, non-PNG content, oversized tiles, and timeouts return generic errors with `Cache-Control: no-store`. The 8-second timeout covers headers and body consumption. Only bounded PNG responses are returned and cached (browser: one hour; shared CDN: one day). Upstream response headers and exception details are never forwarded or logged. A generous 600-request/minute per-client, per-isolate guard limits bursts; it is not a distributed quota system.

All raster callers share `src/lib/tiles/carto.ts`. Existing label themes, resolution, tile geometry and CARTO/OpenStreetMap credits remain intact. The new same-origin URLs also avoid reusing cached, unkeyed CARTO watermark tiles. Provider keys and live deployment validation are handled separately; the unit tests use only synthetic credentials and mocked upstream responses.
