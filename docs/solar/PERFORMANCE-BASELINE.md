# Solar Pulse Performance Baseline and Budgets

**Measured:** 2026-07-15  
**Build:** production Vite build, deterministic Playwright desktop/mobile journeys  
**Budget authority:** `bundle-budgets.json` and `scripts/check-bundles.mjs`

## Outcome

The Solar Pulse route is about 60% smaller than the audited route bundle, the synchronous application entry is about 17% smaller after separating Supabase, and install-time PWA bytes are about 68% lower. A cold collapsed mobile page requests exactly six approved sources and mounts no chart SVG, table, or image.

Audit bundle values were recorded from Vite’s decimal-kB output. The “current exact” column uses binary KiB from the built files, so the comparison converts audit values to KiB before calculating change.

| Measure | Audit baseline | Current exact | Change / enforced budget |
| --- | ---: | ---: | --- |
| Solar Pulse route JS, raw | 127.71 kB (~124.72 KiB) | 50.45 KiB | −59.5%; budget 60 KiB |
| Solar Pulse route JS, gzip | not recorded | 14.36 KiB | budget 18 KiB |
| Animation player JS | part of active route/modal path | 4.92 KiB raw / 2.05 KiB gzip | fetched only when timeline opens |
| Application entry JS, raw | 1,021.79 kB (~997.84 KiB) | 824.54 KiB | −17.4%; budget 850 KiB |
| Application entry JS, gzip | 276.57 kB (~270.09 KiB) | 224.00 KiB | −17.1%; budget 240 KiB |
| Supabase vendor | embedded in entry | 169.64 KiB raw / 44.78 KiB gzip | separate synchronous cacheable chunk; budget 220/65 KiB |
| Main CSS | not separately recorded | 190.19 KiB raw / 28.07 KiB gzip | budget 200/32 KiB |
| PWA install precache | 7,853.11 KiB | 2,478.46 KiB, 15 entries | −68.4%; budget 2,700 KiB / 15 entries |
| SolarPulse source file | 1,854 lines | 603 lines | −67.5%; parsing/science moved to owned modules |

The PWA entry-count budget is intentionally tight: adding another synchronous install dependency requires an explicit review. Lazy route assets are cached after use, and only the shell plus its synchronous imports install up front.

## Mobile cold-state budget

At a 390 × 844 viewport with no prior disclosure state:

| Measure | Audit | Current / gate |
| --- | ---: | ---: |
| Initial solar sources | desktop/direct work leaked into mobile | exactly 6: Kp, flux, magnetometer, X-ray, scales, alerts |
| Main SVG nodes | 58 while panels appeared collapsed | 0 |
| Main tables | not isolated | 0 |
| Main images | hidden imagery work present | 0 |
| Main descendant DOM nodes | not recorded | 201 observed; automated ceiling <250 |
| Horizontal layout | overflow observed during verification | `scrollWidth === clientWidth` at 390 px |
| Duplicate Kp summary | present | exactly one labelled region |
| Visible main buttons | inconsistent | automated 44 × 44 px minimum |

Impacts, forecast, details, and imagery use native buttons/disclosures. Their queries and expensive children do not start or mount until first expansion. Closing a panel preserves query/cache value without leaving animation work running.

## Endpoint payload ceilings

The audit measured oversized raw development payloads such as magnetometer 1,528,297 bytes, protons 242,380 bytes, X-ray 163,485 bytes, and sunspots 127,274 bytes. Development now runs the same adapters as serverless execution. The normalized response ceilings are:

- Magnetometer, X-ray, and proton series: 64,000 bytes each.
- Sunspot, Dst, and observed-flux histories: 32,000 bytes each.
- Compact probabilities/wind summaries: 8,000 bytes each.
- Kp: 48,000 bytes; forecasts: 24,000 bytes.
- D-RAP grid: 500,000 bytes; bounded CME analysis: 160,000 bytes.

Endpoint tests serialize every valid envelope and enforce its source-specific ceiling. Upstream payloads have separate pre-parse limits so a provider cannot cause unbounded memory use before normalization.

## Runtime and cache ownership

- Solar JSON/text is `NetworkOnly` in Workbox; React Query plus the bounded IndexedDB envelope owns freshness and stale-on-error.
- Static product images and immutable frames use a bounded `solar-media-v1` runtime cache (200 entries, seven-day transport ceiling). Widget usability still comes from product metadata and its hard TTL.
- Images are absent until imagery is revealed on mobile. Animation manifests and the 4.92 KiB player chunk are absent until a timeline dialog opens.
- The app-entry warning remains attributable to the broader shared application shell, not Solar Pulse. Its raw/gzip budgets prevent regression while later non-solar shell decomposition can proceed independently.

## Reproduction

```sh
npm run build
npm run check:bundles
npm run test:solar:browser
```

The browser suite fixes provider responses and asserts request count, DOM/SVG/table/image absence, overflow, duplicate summaries, touch targets, on-demand expansion, and the primary desktop recovery journey. Live-provider latency is monitored separately with `npm run check:solar:synthetic` because merge checks must remain deterministic.
