# ProPulse design system: one token set

Foundation · 7 September 2026 · [DS-02 #483](https://github.com/crypticpy/propulse/issues/483) · child of the unified design-system epic

The app ran four parallel colour systems — the station library's `--su-*`, the app-wide `--theme-*`/`--color-*-rgb` Tailwind theme, Home's private `--home-*` overrides, and HamClock's `--hc-*` — declaring the same orange four times. This document defines the single set that replaces the first three.

**The station palette is the design system.** Navy canvas, soft off-white text, plasma orange accent, muted cyan for information. The **Propulse (dark)** palette is the default; Light, High Contrast and Midnight are token swaps of the same roles. Theming means changing token values, not component code.

Sources of truth:

- `src/lib/themes/stationTokens.ts` — the palettes and `stationTokens(theme, accent)`.
- `src/lib/themes/index.ts` — `applyThemeToDocument()` writes every `--su-*` (and its `-rgb` channel triplet) onto `document.documentElement`.
- `src/styles/globals.css` — the `:root` fallbacks (dark palette, next to the `--theme-*` fallbacks) so utilities render correctly before JS runs and in tests.
- `tailwind.config.js` — the `su` colour namespace.
- `src/components/station-ui/StationProvider.tsx` — re-injects the same variables inline on its `.station-ui` element, which wins over the root by specificity, so scoped `theme`/`accent` previews still work.

## Tokens

Dark ("Propulse") values. `--su-accent`, `--su-on-accent`, `--su-accent-edge` and `--su-accent-text` are derived from the user's accent choice: the label colour and the edge/text fallbacks are computed by contrast, so a custom brand colour is never assumed to be legible.

| Token              | Dark value | Role                                                                                 |
| ------------------ | ---------- | ------------------------------------------------------------------------------------ |
| `--su-canvas`      | `#141827`  | Page background behind everything.                                                   |
| `--su-panel`       | `#191e2e`  | Card, panel and surface background.                                                  |
| `--su-input`       | `#111624`  | Input, well and inset background.                                                    |
| `--su-text`        | `#cad2dc`  | Primary reading text (11.6:1 on canvas).                                             |
| `--su-muted`       | `#a0abba`  | Secondary text, labels, captions (7.6:1 on canvas).                                  |
| `--su-line`        | `#637088`  | Borders, dividers, control outlines.                                                 |
| `--su-accent`      | `#ff6b35`  | Primary action fill, "now" marker, brand emphasis.                                   |
| `--su-on-accent`   | `#000000`  | Label on an accent fill (computed per accent).                                       |
| `--su-accent-edge` | `#ff6b35`  | Accent border/edge; falls back to info when the accent is too low-contrast on panel. |
| `--su-accent-text` | `#ff6b35`  | Accent as text; falls back to info below 4.5:1 on panel.                             |
| `--su-info`        | `#85c4d0`  | Information, focus, chart series, neutral emphasis.                                  |
| `--su-success`     | `#8bdbb0`  | Good/open/nominal status.                                                            |
| `--su-warning`     | `#f5cf79`  | Caution/degraded status.                                                             |
| `--su-danger`      | `#fda4af`  | Poor/alert/error status.                                                             |

Every colour token also has a `--su-<name>-rgb` channel triplet (for example `--su-text-rgb: 202 210 220`) so Tailwind opacity modifiers work.

The station library adds non-colour variables (`--su-text-scale`, `--su-radius-*`, `--su-control-height`, `--su-font-*`) inside `.station-ui` only. Those stay scoped; only the colour tokens live on the root.

## Tailwind utilities

The `su` colour namespace generates the usual Tailwind colour utilities (`text-`, `bg-`, `border-`, `ring-`, `fill-`, `stroke-`, `divide-`, `from-`/`via-`/`to-`), each defined as `rgb(var(--su-x-rgb) / <alpha-value>)`, so `/40`-style opacity modifiers work:

```
text-su-text        text-su-muted       text-su-accent      text-su-accent-text
text-su-on-accent   text-su-info        text-su-success     text-su-warning
text-su-danger
bg-su-canvas        bg-su-panel         bg-su-input         bg-su-accent
bg-su-info          bg-su-success       bg-su-warning       bg-su-danger
border-su-line      border-su-accent-edge
```

Opacity modifiers are the intended way to soften a token: `border-su-line/40`, `text-su-muted/80`, `bg-su-panel/70`. Do not introduce a new near-black or near-white hex to get a softer shade.

The existing app colours (`plasma-orange`, `deep-space`, `panel`, `nebula-blue`, `signal-green`, `caution-amber`, `alert-red`, …) are untouched by this foundation; #DS-09 moves them onto these tokens.

## Migration recipe

Replace classes as you migrate a file. This is the whole map:

| Legacy                                                                          | Token utility                                                               |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `text-white`                                                                    | `text-su-text`                                                              |
| `text-slate-300`, `text-slate-400`, `text-gray-300/400`, `text-neutral-300/400` | `text-su-muted`                                                             |
| `text-slate-500`, `text-gray-500`                                               | `text-su-muted/80`                                                          |
| `bg-deep-space`, `bg-space-900`                                                 | `bg-su-canvas`                                                              |
| `bg-panel`, `bg-nebula-blue`, `bg-black/40`, `bg-slate-800/900`                 | `bg-su-panel`                                                               |
| `bg-white/5`, inset wells                                                       | `bg-su-input`                                                               |
| `border-white/10`, `border-slate-700`                                           | `border-su-line/40`                                                         |
| `text-cyan-300/400`, `text-cosmic-cyan`                                         | `text-su-info`                                                              |
| `text-caution-amber`, `text-caution-yellow`                                     | `text-su-warning`                                                           |
| `text-alert-red`                                                                | `text-su-danger`                                                            |
| `text-signal-green`                                                             | `text-su-success`                                                           |
| `text-plasma-orange`                                                            | `text-su-accent` (`text-su-accent-text` when it is reading text on a panel) |
| orange button fill + white label                                                | `bg-su-accent text-su-on-accent`                                            |

Steps for a file: swap the classes, delete any local `--*` colour variable it declared, run `npm run check:design-tokens`, then compare the rendered page against production.

## Rules

1. **No pure white text.** `#fff`/`text-white` is not a text colour in this app. Primary text is `--su-text`; the only exception is a HamClock glow effect, which is out of scope here.
2. **Status is never colour alone.** Every status carries a word, and notices carry an icon (see [VISUAL-COMFORT](../station-ui/VISUAL-COMFORT.md)). The tone tokens are emphasis, not meaning.
3. **Contrast floors.** Primary text ≥ 7:1 on canvas, panel and input; secondary and status text ≥ 4.5:1. A new token value has to clear those on all four palettes.
4. **Charts.** `--su-info` for the default series, `--su-accent` for the "now"/selected marker, the tone tokens for status bands. Do not reach for a raw Tailwind palette colour to add a series.
5. **No new colour systems.** A feature does not declare its own `--feature-*` colour variables or a private override stylesheet. If a role is missing, add a token here.
6. **No glow on reading surfaces.** Text shadow, blur and glow stay out of anything you read (a station-design rule, restated so it is not lost in migration).

## Guard

`npm run check:design-tokens` (in `npm run verify`, right after `check:tracked-artifacts`) fails on any colour-bearing utility that names white or a raw grey ramp — `{bg,border,divide,ring,ring-offset,from,via,to,text,fill,stroke,outline,placeholder,decoration,shadow,caret,accent}-white` (with or without an opacity modifier, so `bg-white/5` and `border-white/[0.08]` are caught too) and the same prefixes against `gray|slate|neutral|zinc|stone-*` — plus `#fff` and `#ffffff`, inside the paths listed in the `SCOPE` array of `scripts/check-design-tokens.mjs`. Hex rules apply to CSS and to lines carrying a class attribute, so colour maths in TypeScript stays legal. A deliberate exception carries `// design-tokens: allow` (or `/* design-tokens: allow */`) on the line.

**Each task that migrates an area appends its directory to `SCOPE`** and adds it to the list below, so a migrated area cannot regress.

### Migrated scope

| Area            | Path                                                                                                                                                                                                                                                                                        | Migrated by                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Station library | `src/components/station-ui`                                                                                                                                                                                                                                                                 | DS-02 (foundation)                    |
| Solar Pulse     | `src/pages/SolarPulse.tsx`, `src/components/solar/{WidgetShell,SolarDisclosure,SolarBriefingNotice,SolarOperatingActions,SolarImageCard,SolarMiniChart,SolarSeriesChart,SolarForecastPanel,SolarAnimationPlayer,SolarImageDetail}.tsx`, `src/components/solar/modals/BandConditionsModal.tsx` | DS-03 (colour only, no layout change) |
| Home            | `src/components/home`, `src/pages/Home.tsx`, `src/styles/home.css`                                                                                                                                                                                                                          | DS-06                                  |

Solar Pulse note: chart colours in `SolarMiniChart.tsx`/`SolarSeriesChart.tsx` keep the `--hcr-chart-*` indirection (HW-29) so HamClock wall reports can still recolour them, but the fallback is now a station token — `var(--hcr-chart-observed, var(--su-info))` — instead of a hard-coded hex. `hamclock-wall-report.css` defines every `--hcr-chart-*` under `[data-hamclock-theme]`, so the reports are unaffected, while `/solar` follows the app theme and stays legible on the light canvas. Dialog contents on Solar Pulse (and `BandConditionsModal`) pin `--su-*` to the midnight palette via `fixedDarkSurfaceTokens`, because `AccessibleDialog`'s chrome is a fixed dark panel; remove that when the dialog surface itself is themed. A few legacy/unreached files under `src/components/solar/` (`BandConditions.tsx`, `BandRow.tsx`, `MetricCard.tsx`, `PrimaryMetrics.tsx`, `PropagationIndex.tsx`, `SolarHandoffNotice.tsx`, and most of `modals/` other than `BandConditionsModal.tsx`) were left unmigrated to stay within this PR's file budget; they are not imported by the live Solar Pulse page (`SolarHandoffNotice` is reached from Band Planner / DX Wizard and `PropagationIndex` from the map's `SolarSnapshot`; they move with DS-09).

Not yet migrated: the remaining `src/components/solar` files above (DS-09), Home's `src/components/dashboard` card library — still bridged by a `// design-tokens: allow` override in `src/styles/home.css` until [DS-13 #499](https://github.com/crypticpy/propulse/issues/499) migrates those cards and deletes the bridge, PropSphere and the global Tailwind colours (DS-09), everything else (DS-12 widens the guard to all of `src/`).

## HamClock stays separate

The HamClock wall (`src/components/map/hamclock/**`, `src/styles/hamclock-*.css`) is deliberately standalone wall art with its own Pulse / Classic / Brass themes. It keeps its `--hc-*` variables and is not migrated to `--su-*`. The only change it takes from this epic is moving the Pulse foreground off pure white (#DS-10).
