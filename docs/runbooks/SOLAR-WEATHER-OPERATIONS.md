# Solar Weather Operations Runbook

## What healthy looks like

- Every structured route returns HTTP 200 JSON with `X-Solar-Schema: 1`, the expected `X-Solar-Source`, a valid versioned envelope, and a `stale-if-error` cache policy.
- Observation age is below the source’s hard usability limit.
- Images return an `image/*` content type through stable product URLs; metadata and animations return bounded JSON.
- A provider interruption changes only dependent widgets to refreshing/stale/unavailable. Last-good values remain visible before hard expiry with their real observation age.
- `npm run check:solar:synthetic` reports all 24 deployed contracts healthy.

Configure the GitHub repository variable `SOLAR_SYNTHETIC_BASE_URL` to the canonical production origin. The scheduled workflow then checks all 16 data envelopes, all six image-metadata products, and both animation manifests. It deliberately avoids downloading every scientific image, keeping monitoring bandwidth and origin cost bounded; deterministic endpoint and browser tests cover image bytes and recovery mechanics.

## First response

1. Identify the failing `sourceId`, error code, observation age, and whether a last-good value exists.
2. Compare the same-origin route with the canonical upstream URL in `docs/solar/PROVIDER-CONTRACTS.md`.
3. Do not clear a user’s valid last-good data merely to make an error disappear.
4. Confirm unrelated products remain healthy; coupled failure is an architecture incident.
5. If the product is beyond its hard TTL, prefer truthful `unavailable` over extending the age limit during an incident.

## Provider outage or rate limit

- Expected codes: `TIMEOUT`, `NETWORK_ERROR`, `RATE_LIMITED`, or `UPSTREAM_REJECTED`.
- Confirm the response is `no-store` and the browser reports `stale-on-error` when a usable entry exists.
- Check whether the provider itself responds, whether the failure is regional, and whether only one product is affected.
- Keep the approved retry/deadline policy. Avoid aggressive manual loops; the edge rate limiter is per isolate and is only a best-effort guard, not distributed protection.
- If outages routinely outlast hard TTLs or provider limits are reached under normal traffic, collect edge/cache evidence before considering the existing collector or a shared paid cache.

## Schema drift or wrong product values

- Expected codes: `SCHEMA_INVALID`, `EMPTY_REQUIRED_DATA`, `WRONG_CONTENT_TYPE`, or `CONTRACT_MISMATCH`.
- Capture only the safe outer shape and provider documentation—never credentials or complete alert/event payloads in logs.
- Verify timestamp field, UTC interpretation, exact energy/wavelength channel, product identity, ordering, and units against the contract record.
- Add a sanitized regression fixture first; then update the adapter and contract intentionally.
- Increment `SOLAR_SCHEMA_VERSION` if an existing cached envelope cannot be consumed safely.
- A wrong-but-plausible value is higher priority than an obvious outage because it can create false operating guidance.

## Image or animation outage

- Verify `/api/solar/image-meta?product=ID`, then the stable `/api/solar/image?product=ID`; neither should return SPA HTML or JSON with HTTP 200 as an image.
- Confirm media type, response size (≤6 MB), ETag/Last-Modified when supplied, and product-specific cache headers.
- The tile/detail must show one recoverable fallback, retain source attribution, and recover at the same URL. Do not append a time-based cache-busting query.
- For animation, verify the manifest is a bounded array, filenames pass the allow-list, frame URLs are same-origin, and frame failures remain retryable. A static tile should remain usable when animation fails.

## Browser cache corruption or quota pressure

Diagnostic helpers are available from application code:

- `inspectApiCache()` lists safe keys, kind, stored/hard-expiry times, and approximate bytes.
- `invalidateSolarCache(sourceId)` removes one solar entry.
- `resetApiCacheConnection()` closes the current database connection so it can reopen/migrate.

Malformed entries are deleted on read. IndexedDB unavailable, blocked, private-browsing, and quota errors fall back to network plus TanStack Query memory without taking down the page. Prefer targeted invalidation; clearing all site storage also removes unrelated user state.

## PWA cache and contract migration

Solar JSON/text routes are `NetworkOnly` at the service-worker transport layer; semantic freshness belongs to the query/IndexedDB layer. Stable image/frame URLs use the bounded `solar-media-v1` runtime cache. Contract-incompatible data cannot be resurrected by Workbox.

For a genuine service-worker cache incident, unregister the worker and delete the affected Workbox cache in browser application storage, then reload. A normal deployment uses content-hashed assets and `cleanupOutdatedCaches`; it should not require user action.

## NASA DONKI key

Set `NASA_API_KEY` in the server environment. The endpoint falls back to `DEMO_KEY` for local/low-volume availability, but production should not silently depend on shared demo capacity. Never expose or log the key; the same-origin route constructs the DONKI request server-side.

## Telemetry and thresholds

Edge logs use the event `solar_provider_fetch`. Browser diagnostics emit capped, PII-free `propulse:solar-telemetry` events and can be inspected with `inspectSolarTelemetry()` or cleared with `clearSolarTelemetry()`.

Investigate immediately when:

- a schema/channel/content-type validation fails;
- a source passes its hard TTL or a critical widget is unavailable;
- provider failures persist across consecutive revalidation attempts or recovery duration grows materially;
- a deadline, upstream byte cap, or normalized response byte cap is breached;
- stale-on-error or cache-miss behavior changes sharply;
- `npm run check:bundles` exceeds the Solar route, app-entry, or exact Workbox precache budget.

Correlate source failures with widget-state events, but do not treat client telemetry as a durable analytics backend. It is a bounded diagnostic surface by design.

## Verification after remediation

Run, in order:

```sh
npm run lint
npm run test:solar
npm run test:solar:browser
npm run build
npm run check:bundles
SOLAR_SYNTHETIC_BASE_URL=https://production.example npm run check:solar:synthetic
```

The merge-blocking suites use fixtures and do not call live providers. Only the explicitly configured synthetic command is allowed to do so.
