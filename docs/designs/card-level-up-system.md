# Card & Profile Level-Up System Design

## The Vision

Propulse cards already have a strong trading-card DNA -- corner brackets, holographic sheens, type-colored accents, schematic art patterns. But right now, a brand-new operator's card looks identical to a 20-year veteran's. Every card uses the same frame, same border, same animations. There's no _earned_ visual identity.

This design introduces **Operator Rank** -- a unified progression system where your entire Propulse visual identity evolves as you earn achievements, log contacts, participate in contests, and engage with the community. Your cards literally transform. Your profile glows differently. The app _remembers_ who you are and what you've accomplished.

---

## Part 1: 10 Feature Upgrades

### 1. Particle Aurora System

Add a WebGL-powered (or CSS-only fallback) particle layer behind the art zone of L and XL cards. Particles drift slowly upward like embers or aurora borealis wisps, colored in the equipment's accent hue. At higher operator ranks, particle density and color complexity increase -- Ethereal rank gets multi-chromatic aurora particles that shift through the full spectrum.

**Implementation**: Canvas element behind the SVG pattern layer. Use `requestAnimationFrame` with ~30 particles max for performance. Respect `prefers-reduced-motion` by falling back to a static gradient.

**Cards affected**: L (subtle, 10-15 particles), XL (full, 20-30 particles)

### 2. Dynamic Card Borders (Rank-Reactive Frames)

Replace the current static `border-2` with rank-driven animated borders. Each rank tier gets a progressively more elaborate frame treatment:

| Rank       | Border Treatment                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Novice     | Solid 1px, 20% opacity (current-ish)                                                                        |
| Apprentice | Solid 2px, 40% opacity                                                                                      |
| Journeyman | Double-line border (2px gap 2px)                                                                            |
| Expert     | Animated gradient sweep (accent -> white -> accent, 4s loop)                                                |
| Master     | Corner bracket glow + gradient sweep                                                                        |
| Legendary  | Pulsing golden frame with ember particles along edges                                                       |
| Ethereal   | Prismatic chromatic-shift border that cycles through the full color wheel, with glass-refraction inner glow |

**Implementation**: CSS `border-image` with `linear-gradient` for gradient sweeps. Legendary/Ethereal use `@keyframes` for color cycling. Corner brackets get `filter: drop-shadow()` at Master+.

### 3. Signature Card Backgrounds

Let operators choose from unlockable background patterns that replace the default schematic SVG art:

- **Novice**: Default schematic patterns (current)
- **Apprentice unlock**: Topographic contour lines
- **Journeyman unlock**: Circuit board traces
- **Expert unlock**: Constellation star map
- **Master unlock**: RF propagation heatmap
- **Legendary unlock**: Animated aurora borealis
- **Ethereal unlock**: "Living signal" -- a real-time-ish waveform that pulses like a heartbeat

Each background renders at the current equipment type's accent color. Users pick their favorite from unlocked options in settings.

### 4. Card Flip with Detailed Back

Add a 3D card flip animation (CSS `transform: rotateY(180deg)` with `perspective`) to L cards. The back contains:

- Full spec table (all fields, not just top 3 stats)
- Equipment history timeline (from `_addHistoryEntry`)
- Personal notes field (editable inline)
- QR code linking to equipment manual/review
- "Acquired" date stamp

**Trigger**: Double-click, or a subtle flip icon in the corner. XL hero card gets a tab for this instead (already has scroll space).

### 5. Station Signal Flow Mini-Map

On XL hero cards for radios, show a tiny interactive signal flow diagram showing what's connected:

```
[Radio] ──coax──> [Tuner] ──coax──> [Antenna]
                              └── [Amplifier]
```

Uses the existing signal path data from shackStore. Clicking a node in the mini-map opens that equipment's hero card. This gives context -- you're not just looking at a radio, you're seeing its _place_ in the station.

### 6. Comparative Stat Overlays

When viewing an XL hero card, add a "Compare" mode that overlays a second equipment item's stats as ghost bars behind the primary stats. For example, comparing two radios shows their power output, receiver sensitivity, and weight side-by-side with overlapping bar charts.

**UX**: Dropdown or drag-a-card-onto-another gesture. Ghost stats render at 30% opacity in a contrasting color.

### 7. Achievement Trophy Shelf on Profile Card

Replace the current flat grid with a **3D trophy shelf** rendered as layered CSS (not WebGL). Earned achievements sit on glass shelves with subtle reflections. Platinum achievements glow. Unearned ones are shadowed outlines on the shelf -- you can see what's coming. The shelf scrolls horizontally per category row.

At Legendary+ rank, the shelf gets an ambient animated background (subtle star field or aurora).

### 8. Contextual Band Condition Overlay

On antenna and radio cards, overlay a subtle real-time indicator showing whether their supported bands are currently open or closed. A tiny colored dot (green/amber/red) next to each band pill, pulled from the existing band conditions data.

This transforms cards from static spec sheets into _live instruments_ -- you glance at your antenna card and see "20m is open right now."

### 9. Equipment Wear & Story Indicators

Track equipment "story" through usage data and display it visually:

- **New**: Pristine card, sharp corners, no marks
- **Seasoned** (>100 QSOs logged with this radio active): Subtle patina effect -- corners get slightly rounded texture overlay, a small "battle scar" hash mark appears
- **Veteran** (>1000 QSOs): More patina, a faint golden edge wear effect, "Veteran" badge auto-applied
- **Legendary Gear** (>5000 QSOs): The card develops a unique "aura" -- the equipment has become part of your identity

This is purely cosmetic and emotional -- it makes gear feel _lived-in_, like a well-loved guitar.

### 10. Profile Holo Card Export

Let operators export their profile as a shareable holographic card image (PNG/WebP) with:

- Their callsign in display font
- Avatar with rank-appropriate frame
- Top 3 achievements as mini badges
- QSO count, DXCC count, favorite band
- Rank tier with appropriate visual treatment
- QR code to their public profile

Uses Canvas API (existing pattern from the card renderer). The exported card uses rank-appropriate borders and effects, so an Ethereal operator's exported card looks dramatically different from a Novice's.

---

## Part 2: 12 Polish Items

### 1. Micro-Interaction: Card Tilt on Hover

Add a subtle CSS `perspective` + `rotateX/rotateY` effect that follows the mouse position on L cards. The card tilts 2-3 degrees toward the cursor, creating a physical "trading card in hand" feel. The holographic sheen already exists -- making it respond to tilt angle would be _chef's kiss_.

```css
/* Pseudocode for the effect */
transform: perspective(800px) rotateX(var(--tilt-y)) rotateY(var(--tilt-x));
```

Track mouse position via `onMouseMove`, calculate tilt from center. Cap at +/-3deg. Use `will-change: transform` for GPU acceleration.

### 2. Stat Value Count-Up Animation

When a card first renders or when opening an XL hero card, animate numeric stat values counting up from 0 to their actual value over 400ms. Use `requestAnimationFrame` with easing. "100W" counts up from "0W" to "100W" with a slight overshoot bounce.

Makes the card feel alive and draws attention to the numbers.

### 3. Band Pill Glow Pulse for Active Bands

When band conditions data indicates a band is currently open/active, its pill on equipment cards gets a subtle `animation: pulse 2s ease-in-out infinite` glow in its band color. Closed bands remain static. This is the polish companion to Upgrade #8.

### 4. Card Stack Depth Shadow

When multiple cards are in a grid, add a subtle layered shadow effect so they appear to be stacked in 3D space. Cards closer to the top of the viewport get a slightly larger shadow, creating a parallax depth illusion.

```css
box-shadow:
  0 1px 2px rgba(0, 0, 0, 0.1),
  0 4px 8px rgba(0, 0, 0, 0.1),
  0 8px 16px rgba(0, 0, 0, 0.08);
```

### 5. Type Icon Entrance Animation

When the art zone's equipment symbol first renders, animate it in with a brief SVG stroke-draw effect (`stroke-dasharray` + `stroke-dashoffset` transition). The symbol "draws itself" over 600ms. On XL cards, the larger symbol gets a slower, more dramatic draw.

### 6. Smooth Card Reorder Animation

When cards are reordered (drag-and-drop, filter change, sort), use `layout` animations (Framer Motion's `layoutId` or CSS `view-transition`) so cards smoothly slide to their new positions instead of popping.

### 7. Accent Color Bleed on Hover

On L card hover, add a very subtle radial gradient "bleed" that tints the immediate card surroundings with the accent color at ~3% opacity. This creates a "the card is emitting light" effect that reinforces the color coding.

```css
.card-wrapper:hover::after {
  content: "";
  position: absolute;
  inset: -20px;
  background: radial-gradient(ellipse, var(--accent) 0%, transparent 70%);
  opacity: 0.04;
  z-index: -1;
}
```

### 8. XL Hero Card Entrance Sound (Optional)

For operators who enable it in settings, play a brief, satisfying UI sound when opening an XL hero card -- a soft "whoosh" + subtle chime, different per equipment type. Store as tiny base64-encoded audio. Default OFF, toggled in accessibility settings.

### 9. Typography Polish: Tabular Numbers

Add `font-variant-numeric: tabular-nums` to all stat values so numbers align vertically when comparing cards side-by-side. Currently, proportional spacing can cause values to shift position.

### 10. Corner Bracket Parallax

Make the corner brackets on L and XL cards respond to mouse position with a tiny parallax offset (1-2px) opposite to the tilt direction. This creates a layered feel -- the brackets appear to float above the card surface.

### 11. Frosted Glass Stat Bar

Replace the current `rgba(255,255,255,0.03)` stat bar background on XL cards with a proper frosted glass effect: `backdrop-filter: blur(12px) saturate(1.5)` with a subtle border. The blur picks up colors from the art zone above, creating a living, contextual background.

### 12. Skeleton Loading States with Shimmer

Replace any loading flicker with skeleton cards that match each size variant's layout. The skeleton uses the same dimensions but renders placeholder blocks with a shimmer animation sweeping left-to-right. When data loads, the skeleton cross-fades into the real card.

---

## Part 3: The Operator Rank System

### Philosophy

Ham radio already has a culture of progression -- Technician to General to Extra class licenses, DXCC awards, WAS certificates, contest plaques. Propulse's rank system mirrors this real-world progression digitally.

**Core principles:**

- **100% earned, 0% purchased.** There is no way to buy rank, badges, skins, backgrounds, or visual upgrades. Period. Every visual enhancement is unlocked through time, effort, and achievement. This is non-negotiable and fundamental to the system's integrity.
- **Subscriptions are separate.** Propulse may offer subscriptions for data storage, sync, and convenience features -- but subscriptions NEVER affect rank, progression, or visual identity. A free user at Ethereal rank looks exactly the same as a paying user at Ethereal rank.
- **Visible but not obnoxious.** Rank enhances your identity without screaming at others.
- **Genuinely rare at the top.** Legendary and Ethereal should take years of real operating to reach. When you see one, you know that person has put in the work.

### The Seven Ranks

```
    ETHEREAL .............. RP 50,000+   (The Infinite Signal)
    LEGENDARY ............. RP 25,000+   (Station of Legend)
    MASTER ................ RP 10,000+   (Master Operator)
    EXPERT ................ RP 4,000+    (Expert Operator)
    JOURNEYMAN ............ RP 1,500+    (Seasoned Operator)
    APPRENTICE ............ RP 400+      (Growing Operator)
    NOVICE ................ RP 0+        (Welcome to the Bands)
```

**RP = Rank Points**, earned through measurable activities (see scoring below).

### Rank Point Scoring

| Activity                          | Points | Cap/Notes                         |
| --------------------------------- | ------ | --------------------------------- |
| **Achievement earned (Bronze)**   | 50     | Per unique achievement            |
| **Achievement earned (Silver)**   | 100    | Per unique achievement            |
| **Achievement earned (Gold)**     | 200    | Per unique achievement            |
| **Achievement earned (Platinum)** | 500    | Per unique achievement            |
| **QSO logged**                    | 1      | Uncapped                          |
| **Unique DXCC entity confirmed**  | 25     | Per entity                        |
| **Unique band/mode slot filled**  | 10     | Per unique combo                  |
| **Contest participated**          | 100    | Per contest entry                 |
| **Contest top-10 finish**         | 500    | Per contest                       |
| **Daily login streak (7 days)**   | 25     | Weekly bonus                      |
| **Daily login streak (30 days)**  | 150    | Monthly bonus                     |
| **Daily login streak (365 days)** | 2,000  | Annual bonus (!)                  |
| **Equipment registered**          | 5      | Per piece of equipment            |
| **Signal path completed**         | 15     | Per complete radio->antenna chain |
| **Profile completed (100%)**      | 100    | One-time                          |
| **Shared profile card**           | 10     | Per share, max 5/day              |
| **Community elmer session**       | 50     | Per mentoring session logged      |

### Approximate Progression Timeline

- **Novice -> Apprentice** (~400 RP): Complete profile, add equipment, earn a few bronze achievements. ~1-2 weeks of regular use.
- **Apprentice -> Journeyman** (~1,500 RP): Earn several silver achievements, log 200+ QSOs, confirm 20+ DXCC. ~2-3 months.
- **Journeyman -> Expert** (~4,000 RP): Multiple gold achievements, active contest participation, 1000+ QSOs. ~6-12 months.
- **Expert -> Master** (~10,000 RP): Platinum achievements appearing, extensive DXCC, contest wins. ~1-2 years.
- **Master -> Legendary** (~25,000 RP): Deep achievement completion, years of consistent operation. ~3-5 years.
- **Legendary -> Ethereal** (~50,000 RP): The elite. Full achievement platinum sweep, years of daily dedication, contest champion. ~5+ years. Should feel genuinely rare.

---

### Design Philosophy: The Floor is Already Cool

**Critical principle**: The current card system is already visually impressive -- holographic sheens, corner brackets, type-colored accents, animated art patterns, glow effects. A brand-new user should walk in and think "this looks amazing." We never take features _away_ to create progression. Instead:

- **Novice = current state** (all existing effects) -- this is the hook
- Each rank **layers additions ON TOP** -- new effects, new options, more intensity
- Nothing that exists today gets gated behind progression
- Rank adds _identity_ and _distinction_, not basic quality

This means the progression goes from "already great" to "holy shit."

### Visual Identity Per Rank

#### NOVICE -- "First Light"

**Theme**: Already impressive. The full current card system in all its glory. You're hooked from day one.

| Element                   | Treatment                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------ |
| **Profile frame**         | 2px `white/15` circle around avatar (clean, modern)                                  |
| **Card borders**          | Current: `border-2` at `${accentHex}40`, hover brightens to 66%                      |
| **Corner brackets**       | Current: 4-corner SVG brackets with accent color, 30% -> 60% on hover                |
| **Holographic sheen**     | Current: full `cardSheen` sweep on L cards, shimmer bars on XL                       |
| **Art zone**              | Current: type-specific SVG patterns + radial glow + centered symbol                  |
| **Card background**       | Current: `#0f1420` with gradient overlay                                             |
| **Hover effects**         | Current: `-translate-y-0.5`, type glow shadow, `active:scale-[0.98]`                 |
| **XL hero**               | Current: dual-layer drift, pulsing glow, spring-bounce entrance, gallery strip       |
| **Rank badge**            | Small pill: `bg-gray-800 text-gray-400 border border-gray-700` -- clean, understated |
| **Rank badge on profile** | Visible below callsign on ProfileCard. Text: "Novice"                                |
| **Public shack view**     | Standard equipment grid with current card styling                                    |
| **Signature color**       | `#9CA3AF` (gray-400)                                                                 |

#### APPRENTICE -- "Signal Rising"

**Theme**: The operator is finding their voice. Subtle enhancements build on the already-cool base.

| Element                   | Treatment                                                                        |
| ------------------------- | -------------------------------------------------------------------------------- |
| **Profile frame**         | 2px border gains a faint `drop-shadow(0 0 6px ${rankColor}30)` halo              |
| **Card borders**          | + Faint bracket glow: `drop-shadow(0 0 2px ${accentHex}30)` on corner brackets   |
| **Holographic sheen**     | + Sheen becomes slightly wider and brighter (opacity 8% -> 12%)                  |
| **Card background**       | + Subtle noise texture overlay at 2% opacity (adds depth/grain)                  |
| **Rank badge**            | Pill: `bg-sky-900/30 text-sky-400 border border-sky-500/20` with `~` wave prefix |
| **Rank badge on profile** | Sky-tinted pill below callsign, visible on public profile too                    |
| **Public shack view**     | + Rank badge appears in shack header. Faint sky accent line under page title     |
| **Card flip**             | Unlocked on L cards (double-click for back side with full specs)                 |
| **Background unlock**     | Topographic contour lines option in settings                                     |
| **Signature color**       | `#38BDF8` (sky-400)                                                              |

**What's new vs Novice**: Noise texture, bracket glow, brighter sheen, card flip, rank color identity, first background unlock

#### JOURNEYMAN -- "Steady Signal"

**Theme**: Confidence. The station is established. Animation and depth increase noticeably.

| Element               | Treatment                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Profile frame**     | 2px gradient ring: `accent -> white/30 -> accent` with slow 8s rotation animation                              |
| **Card borders**      | + Animated gradient sweep along border: `transparent -> accent -> transparent`, 6s loop                        |
| **Corner brackets**   | + Glow intensifies: `drop-shadow(0 0 4px ${accentHex}40)`                                                      |
| **Holographic sheen** | + Wider sweep, 18% opacity, sweep speed slightly faster                                                        |
| **Card background**   | + Ultra-subtle diagonal scan lines (every 4px, 1% opacity) over noise texture                                  |
| **Art zone**          | + L cards gain dual-layer pattern drift (previously XL-only)                                                   |
| **Rank badge**        | Pill: `bg-emerald-900/30 text-emerald-400 border border-emerald-500/30` + `≋` triple-wave                      |
| **Profile card**      | + Faint `box-shadow: 0 0 30px ${rankColor}10` glow around profile card                                         |
| **Public shack view** | + Emerald accent line. Equipment count badges gain rank-colored tint. Page header shows rank badge prominently |
| **Mouse tilt**        | Unlocked on L cards (subtle perspective tilt following cursor)                                                 |
| **Background unlock** | Circuit board trace pattern                                                                                    |
| **Signature color**   | `#34D399` (emerald-400)                                                                                        |

**What's new vs Apprentice**: Animated border sweep, rotating profile frame, scan lines, dual-layer art on L cards, mouse tilt, profile glow

#### EXPERT -- "Strong Copy"

**Theme**: Authority. Serious operator energy. Particle effects arrive. The visual language commands respect.

| Element               | Treatment                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Profile frame**     | 3px animated gradient ring with pulsing glow, metallic tint                                                                                   |
| **Card borders**      | + Inner glow added: `box-shadow: inset 0 0 20px ${accentHex}08` (energy containment feel)                                                     |
| **Corner brackets**   | + Thicker strokes (1.5px -> 2px), glow `drop-shadow(0 0 6px ${accentHex}50)`                                                                  |
| **Holographic sheen** | + Full rainbow prismatic: gradient adds subtle spectral colors beyond just accent + white                                                     |
| **Card background**   | + Deep gradient: `#0f1420 -> #0d0f1e` (adds dimensional depth)                                                                                |
| **Art zone**          | + L cards gain animated slow drift (previously XL-only behavior)                                                                              |
| **Particle aurora**   | UNLOCKED: 8-10 subtle CSS particles drifting upward in art zone (L + XL cards)                                                                |
| **Rank badge**        | `bg-violet-900/30 text-violet-400 border border-violet-500/30` + `⚡` lightning bolt                                                          |
| **Profile card**      | + `box-shadow: 0 0 40px ${rankColor}15` glow intensifies                                                                                      |
| **Public shack view** | + Violet accent theming. Equipment cards in public view show particle effects. Visitor sees "Expert Operator" badge in shack header with glow |
| **Stat count-up**     | Unlocked: numeric stats animate from 0 on card render (400ms with easing)                                                                     |
| **Background unlock** | Constellation star map                                                                                                                        |
| **Signature color**   | `#A78BFA` (violet-400)                                                                                                                        |

**What's new vs Journeyman**: PARTICLES, inner card glow, thicker brackets, prismatic sheen, animated L-card art drift, stat animations

#### MASTER -- "Full Quieting"

**Theme**: Mastery. Golden energy enters the palette. Every existing effect is refined and intensified.

| Element               | Treatment                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Profile frame**     | Animated golden ring with inner/outer glow layers, slow rotation. Gold tint blends with rank color                                                                                                  |
| **Card borders**      | + Triple-layer effect: outer glow (`${accentHex}20`), accent border, inner glow. "Energy containment field"                                                                                         |
| **Corner brackets**   | + Golden tint blended in (`mix(accentHex, #FFD700, 30%)`), animated subtle pulse every 4s                                                                                                           |
| **Holographic sheen** | + Full prismatic WITH parallax response (sheen angle follows mouse position -- like a real foil card)                                                                                               |
| **Card background**   | + Micro-gradient with faint metallic sheen texture (brushed metal at 2% opacity)                                                                                                                    |
| **Particle aurora**   | + Increased to 15 particles, now a mix of accent + gold colors, slightly larger                                                                                                                     |
| **Rank badge**        | `bg-amber-900/40 text-amber-300 border border-amber-500/40` + `♛` crown, slight `text-shadow: 0 0 4px` glow                                                                                         |
| **Profile card**      | + `box-shadow: 0 0 50px ${rankColor}20, 0 0 100px ${rankColor}08` double-layer glow. Callsign gets subtle text-shadow                                                                               |
| **Public shack view** | + Golden accent line. Equipment section headers gain golden tint. "Master Operator" badge with crown glow. The page background gains an ultra-subtle warm radial gradient center (1% opacity amber) |
| **Equipment wear**    | UNLOCKED: gear develops visual patina based on QSO count (New -> Seasoned -> Veteran -> Legendary Gear)                                                                                             |
| **XL hero entrance**  | + Enhanced: slight screen flash + particle burst on open                                                                                                                                            |
| **Background unlock** | RF propagation heatmap                                                                                                                                                                              |
| **Signature color**   | `#FCD34D` (amber-300, golden)                                                                                                                                                                       |

**What's new vs Expert**: Gold enters the palette, parallax-responsive holo sheen, triple-layer borders, pulsing brackets, equipment wear system, dramatic hero entrance, metallic textures

#### LEGENDARY -- "DX Commander"

**Theme**: Living legend. Cards become objects of awe. Every element is alive with energy. Visitors to your public shack _feel_ the difference.

| Element               | Treatment                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Profile frame**     | Animated ring of orbiting energy dots (8 dots, different sizes, orbital paths) over a thick golden border with outer glow                                                                                                                                                                                                                                                        |
| **Card borders**      | + **Energy circuit**: A traveling light pulse circuits the card perimeter every 3s, like electricity in a wire. Base border is animated golden gradient                                                                                                                                                                                                                          |
| **Corner brackets**   | REPLACED with **ornate corner filigree** -- decorative Art Deco-inspired SVG corners with internal detail, golden + accent tinted, subtle breathing animation                                                                                                                                                                                                                    |
| **Holographic sheen** | + Full prismatic rainbow sweep + additional "fire" overlay (warm gradient sweep that follows the cold sweep)                                                                                                                                                                                                                                                                     |
| **Card background**   | + Animated dark nebula: very slow-moving procedural noise at 3% opacity creating "living darkness"                                                                                                                                                                                                                                                                               |
| **Art zone**          | + Triple-layer animated patterns + increased particle density + pulsing dual-ring glow                                                                                                                                                                                                                                                                                           |
| **Particle aurora**   | + 25 particles, golden-dominant with accent accents, larger particles, occasional "spark" burst                                                                                                                                                                                                                                                                                  |
| **Rank badge**        | Golden gradient background, `text-shadow: 0 0 8px #FFD700`, `◆` diamond prefix. "LEGENDARY" in `font-orbitron` with `tracking-[0.2em]`                                                                                                                                                                                                                                           |
| **Profile card**      | Full golden trim treatment. Callsign `text-shadow: 0 0 12px #FFD700`. Profile card border becomes animated gold. Orbiting dots on avatar frame                                                                                                                                                                                                                                   |
| **Public shack view** | **DRAMATIC UPGRADE**: Page background gains animated nebula texture (very subtle). Golden accent line with shimmer animation. "DX Commander" title treatment with Orbitron font. Equipment cards show all Legendary effects. Visitors see a badge "Legendary Station" with glow in the page header. Section dividers become decorative golden lines with center diamond ornament |
| **Card sound**        | Optional subtle "resonance" chime on hero card open (default OFF)                                                                                                                                                                                                                                                                                                                |
| **Card signature**    | UNLOCKED: Personalized motto at card footer (max 40 chars), italic `text-[9px]` with golden underline                                                                                                                                                                                                                                                                            |
| **Trophy shelf**      | Achievement grid gains golden shelf rails and ambient warm light backdrop                                                                                                                                                                                                                                                                                                        |
| **Export card**       | Exclusive "Legendary" foil stamp watermark on exported profile cards                                                                                                                                                                                                                                                                                                             |
| **Background unlock** | Animated aurora borealis                                                                                                                                                                                                                                                                                                                                                         |
| **Signature color**   | `#FFD700` (true gold)                                                                                                                                                                                                                                                                                                                                                            |

**Legendary Exclusive: "Card Signature"** -- Small personalized text at the bottom of L cards. Example: _"CQ DX from the mountains of Colorado"_

**What's new vs Master**: Energy circuit borders, filigree corners (replacing brackets), living nebula background, triple-layer art, card signature, sound option, public shack dramatic redesign

#### ETHEREAL -- "The Infinite Signal"

**Theme**: Transcendent. Beyond mortal radio. The visual language breaks conventional rules. Cards feel like they exist in another dimension. Your public shack becomes a destination.

| Element               | Treatment                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Profile frame**     | **Chromatic orbit**: Ring cycles through hue spectrum (0->360) over 12s. Inner ring counter-rotates at different speed. Soft prismatic refraction rays extend outward like a lens flare                                                    |
| **Card borders**      | **Living chromatic edge**: Border continuously shifts through curated aurora palette (deep blue -> teal -> violet -> rose). Secondary inner border in complementary color. Border "breathes" -- width oscillates 2px -> 3px -> 2px over 4s |
| **Corner brackets**   | **Ethereal runes**: Filigree replaced with abstract geometric glyphs referencing ham radio (antenna, wave, ground, key). Luminous, each pulses independently with phase offsets creating "living circuit" feel                             |
| **Holographic sheen** | **True holographic film**: Multiple overlapping gradients at different angles all respond to mouse position, simulating real holographic interference patterns                                                                             |
| **Card background**   | **Deep space void**: Tiny 1px star dots at 5-15% opacity with slow twinkling. Ultra-subtle aurora color wash at 2% that shifts over time                                                                                                   |
| **Art zone**          | **Dimensional rift**: Dark center with chromatic energy at edges (portal effect). Equipment symbol gets glow halo + "echo" copies offset 2px in R/G/B (chromatic aberration)                                                               |
| **Particle aurora**   | **Full aurora borealis**: 30 particles in curtain formation, multi-colored (teal + violet + rose), with connecting "threads" between nearby particles (constellation/net effect at 5% opacity)                                             |
| **Rank badge**        | **Prismatic crystalline**: Animated gradient cycling through iridescent colors. White text with chromatic aberration (`1px 0 red, -1px 0 blue` at low opacity). `✦` star prefix. "ETHEREAL" in Orbitron                                    |
| **Profile card**      | Full chromatic treatment. Background gains star field. Callsign uses animated gradient text-fill. Completeness ring becomes chromatic spinning ring regardless of %. Avatar frame has orbiting chromatic dots with refraction rays         |
| **Profile glow**      | **Ethereal aura**: `0 0 80px currentHue/25, 0 0 160px nextHue/15, 0 0 300px prevHue/05` -- hues shift over time                                                                                                                            |
| **Stat values**       | Numbers gain faint prismatic text-shadow (`1px 0 #ff000020, -1px 0 #0000ff20`) -- chromatic aberration on data                                                                                                                             |
| **Equipment symbols** | SVG paths gain animated `stroke-dasharray` "energy flow" effect -- current visibly flows through the schematic lines                                                                                                                       |
| **Hero entrance**     | Dramatic: screen edges get brief chromatic vignette, card scales from 0.8 with rotation, particles explode outward then settle                                                                                                             |
| **Card flip**         | Flip includes "dimensional shimmer" -- card passes through a prismatic membrane                                                                                                                                                            |
| **Background unlock** | "Living signal" -- procedural sine wave that modulates amplitude and frequency slowly                                                                                                                                                      |
| **Signature color**   | Cycles: `hsl(var(--ethereal-hue), 70%, 70%)` where `--ethereal-hue` animates 0->360 over 20s                                                                                                                                               |

**Public Shack View -- The Ethereal Experience**:

The public shack page for an Ethereal operator becomes a _destination_. Visitors should feel like they've entered a different dimension:

- **Page background**: Deep space star field with ultra-subtle aurora color wash that shifts slowly
- **Page header**: Callsign renders with animated chromatic gradient text. "The Infinite Signal" subtitle in Orbitron. Rank badge is the full prismatic crystalline treatment
- **Equipment cards**: All Ethereal effects active -- chromatic borders, rune corners, dimensional rift art zones, particle curtains
- **Section dividers**: Become glowing chromatic lines that pulse with color shift
- **Achievement section**: Transforms into the "Signal Constellation" view (see below)
- **Ambient effect**: Faint chromatic vignette around page edges (3% opacity max)
- **Visitor notice**: A subtle "Ethereal Station" indicator with prismatic badge, so visitors understand the visual treatment is earned

**Ethereal Exclusives:**

1. **"Signal Constellation"** -- Earned achievements arrange into a constellation pattern on a 2D star map (positioned by category). Connecting lines between related achievements. Each achievement-star's brightness = tier (bronze dim, platinum blazing). Replaces/augments standard grid on profile page

2. **"Echo Trail"** -- Equipment cards render a very faint "ghost" copy at 2px offset with 5ms delay on any movement (hover, tilt, scroll). Creates a dimensional afterimage effect

3. **"Ethereal Callsign"** -- The operator's callsign renders with animated chromatic gradient EVERYWHERE it appears in the app. Other users viewing a shared Ethereal profile see this treatment too -- it's a flex that travels

4. **"Living Symbols"** -- The SVG schematic symbols on cards gain the energy-flow stroke animation. RF waves animate, antenna radiation patterns pulse, feedline signals travel. The equipment feels _alive_

**What's new vs Legendary**: EVERYTHING goes chromatic. Rune corners, dimensional rift art, true holographic film, aurora particle curtains with constellation threads, energy-flow symbols, chromatic aberration on text/data, public shack becomes a destination experience

---

### Visual Progression Summary

```
NOVICE        ▓▓▓▓▓▓▓▓░░░░░░░░  Current state -- already impressive (the hook)
APPRENTICE    ▓▓▓▓▓▓▓▓▓░░░░░░░  + Noise, bracket glow, brighter sheen, card flip
JOURNEYMAN    ▓▓▓▓▓▓▓▓▓▓▓░░░░░  + Animated borders, dual-layer art, mouse tilt, profile glow
EXPERT        ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  + PARTICLES, prismatic sheen, inner glow, stat animations
MASTER        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  + Gold palette, parallax holo, equipment wear, metallic textures
LEGENDARY     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░  + Energy borders, filigree, card signature, living nebula, public shack glow-up
ETHEREAL      ████████████████  + Chromatic everything, dimensional rifts, constellations, public shack destination
```

### Color Palette Per Rank

```
Novice:       #9CA3AF  (gray-400)      -- Clean, modern, ready to grow
Apprentice:   #38BDF8  (sky-400)       -- Cool, fresh, sky signal
Journeyman:   #34D399  (emerald-400)   -- Earthy, established, green light
Expert:       #A78BFA  (violet-400)    -- Distinctive, serious, RF energy
Master:       #FCD34D  (amber-300)     -- Warm gold, approaching legendary
Legendary:    #FFD700  (true gold)     -- The gold standard
Ethereal:     chromatic cycle           -- Beyond a single color
```

### Rank Badge Anatomy

Every card (M, L, XL) and the profile card display the rank badge. Format:

```
[icon] RANK NAME
```

| Rank       | Icon                  | Font          | Special                                 |
| ---------- | --------------------- | ------------- | --------------------------------------- |
| Novice     | -- (none)             | Inter 10px    | Plain text, no pill                     |
| Apprentice | `~` (tilde, wave)     | Inter 10px    | Sky pill                                |
| Journeyman | `≋` (triple wave)     | Inter 10px    | Emerald pill                            |
| Expert     | `⚡` (zap)            | Inter 10px    | Violet pill                             |
| Master     | `♛` (crown)           | Inter 10px    | Amber pill, text glow                   |
| Legendary  | `◆` (diamond)         | Orbitron 10px | Gold gradient pill, text glow           |
| Ethereal   | `✦` (four-point star) | Orbitron 10px | Prismatic animated pill, chromatic text |

### Rank Transition Ceremony

When an operator reaches a new rank, trigger a **rank-up celebration**:

1. **Screen overlay**: A full-screen semi-transparent overlay with the new rank's signature color as a radial burst from center
2. **Badge reveal**: The new rank badge animates in with scale + glow, accompanied by the rank name in large Orbitron text
3. **Particle burst**: An explosion of particles in the new rank color that settle into the profile frame's new border treatment
4. **Sound** (optional): A satisfying ascending chime sequence (different per rank)
5. **Duration**: 3 seconds, dismissable with click/tap/escape
6. **Persistence**: A "NEW RANK" badge appears on the profile nav item for 24 hours

This should feel like opening a legendary loot drop. It's the payoff for months or years of operating.

---

### Rank Data Model

```typescript
interface OperatorRank {
  currentRank: RankTier;
  rankPoints: number;
  rankHistory: RankTransition[];
  unlockedBackgrounds: CardBackground[];
  cardSignature?: string; // Legendary+ only, max 40 chars
  preferences: {
    selectedBackground: CardBackground;
    enableParticles: boolean; // respect performance preference
    enableSound: boolean; // default false
    enableMouseTilt: boolean; // default true when unlocked
  };
}

type RankTier =
  | "novice"
  | "apprentice"
  | "journeyman"
  | "expert"
  | "master"
  | "legendary"
  | "ethereal";

interface RankTransition {
  from: RankTier;
  to: RankTier;
  timestamp: Date;
  pointsAtTransition: number;
}

type CardBackground =
  | "schematic" // default, always available
  | "topographic" // apprentice+
  | "circuit" // journeyman+
  | "constellation" // expert+
  | "propagation" // master+
  | "aurora" // legendary+
  | "living-signal"; // ethereal only
```

### Performance Considerations

- **Particle systems**: Use CSS animations where possible (< Expert). Canvas only for Legendary/Ethereal. Max 30 particles. `will-change: transform` on animated elements.
- **Chromatic effects** (Ethereal): Use CSS `filter` and `mix-blend-mode` rather than multi-layer DOM elements where possible.
- **Reduced motion**: All animated rank features respect `prefers-reduced-motion`. Fallback to static versions of each effect (glow without pulse, gradient without animation, particles as static dots).
- **Mobile**: Disable mouse-tilt (no mouse). Reduce particle count by 50%. Disable card flip (use XL hero instead). Border animations use `@media (min-width: 768px)` gates.
- **Progressive enhancement**: Render the base card first, then layer rank effects via CSS classes. A card should be fully functional and readable even if all rank visuals fail to load.

### Where Rank Shows Up

Rank isn't just a number in a database -- it's woven into every visual surface:

**Profile Card (own view + public `/profile/:callsign`)**:

- Rank badge pill displayed below callsign (all ranks)
- Avatar frame treatment escalates per rank (glow -> gradient ring -> orbiting dots -> chromatic orbit)
- Profile card border/glow driven by rank
- Achievement display enhanced at Legendary+ (trophy shelf / constellation)

**Equipment Cards (all 4 sizes)**:

- Accept `operatorRank` as context (via Zustand, not prop drilling)
- S card: rank-tinted left accent bar
- M card: rank badge in footer, border treatment
- L card: full border/bracket/sheen/particle treatment per rank
- XL hero: all effects at maximum intensity

**Public Shack View (`/shack/:callsign` or shared view)**:

- This is the big one. When someone visits your public shack, they see YOUR rank's visual treatment applied to the entire page
- Page header shows rank badge + rank title (e.g., "DX Commander" for Legendary)
- Equipment cards render with YOUR rank effects (visitors see your particles, your borders, your filigree)
- Page accent color = your rank's signature color
- Section dividers, headers, and UI chrome gain rank-appropriate styling
- At Legendary+: page background gains ambient effects (nebula, star field)
- At Ethereal: the entire page becomes the "destination experience" -- star field, aurora, chromatic accents
- **Critical**: This is the flex. When someone shares their shack link and the visitor lands on an Ethereal shack, the "whoa" factor drives aspiration

**Navigation & Global UI**:

- Small rank indicator in the app header (next to callsign)
- Rank-up notifications appear as toast + celebration overlay
- "NEW RANK" badge on profile nav item for 24 hours after rank-up

### Integration Points

| System                        | Integration                                                                 |
| ----------------------------- | --------------------------------------------------------------------------- |
| **profileStore**              | Add `operatorRank` field, `rankPoints`, `rankHistory`, `rankPreferences`    |
| **shackStore**                | Equipment "story" data (QSO counts per radio) fed into wear system          |
| **achievementEngine**         | Achievement earn events trigger RP addition                                 |
| **settingsStore**             | Rank visual preferences (particles, sound, tilt, background choice)         |
| **socialSync**                | Rank + rankPoints synced to Supabase for public profile/shack rendering     |
| **Export**                    | Rank badge + visual treatment on exported cards                             |
| **EquipmentCard (all sizes)** | Read `operatorRank` from context, apply tier-appropriate CSS classes        |
| **ProfileCard**               | Frame treatment driven by rank                                              |
| **AchievementGrid**           | Enhanced at Legendary+ (trophy shelf / constellation)                       |
| **Public shack page**         | Full rank-driven visual theming (header, cards, dividers, background)       |
| **Router**                    | Public shack route fetches owner's rank from Supabase for visitor rendering |

### Monetization Boundary (Hard Rule)

```
RANK SYSTEM                          SUBSCRIPTION (future)
========================             ========================
100% FREE, always                    Paid convenience tier
Earned through effort only

- Rank points                        - Cloud sync / backup
- Visual upgrades                    - Extended data storage
- Badges & achievements              - Multi-device sync
- Card backgrounds                   - Priority API access
- Profile effects                    - Advanced analytics
- Public shack theming               - Offline data export
- Card signature
- Everything visual

NEVER crosses into rank.             NEVER affects rank/visuals.
A free Ethereal = paid Ethereal.     A subscriber at Novice = Novice.
```

---

### Implementation Priority

**Phase 1 -- Foundation (Rank Engine + Base Visuals)**

1. Rank data model + store + RP calculation engine
2. Rank badge component (all 7 tiers)
3. Dynamic border system (CSS classes per rank)
4. Profile frame progression
5. Rank-up celebration overlay
6. Rank badge on ProfileCard + equipment cards

**Phase 2 -- Card Enhancements**

7. Holographic sheen intensity scaling by rank
8. Card flip (L cards, Apprentice+)
9. Mouse tilt effect (Journeyman+)
10. Particle aurora system (Expert+)
11. Stat count-up animation (Expert+)

**Phase 3 -- Premium Rank Features**

12. Legendary energy borders + filigree corners
13. Ethereal chromatic effects (borders, runes, dimensional rift)
14. Card signature (Legendary+)
15. Equipment wear/story system (Master+)
16. Signal constellation view (Ethereal)

**Phase 4 -- Public Shack & Ecosystem**

17. Public shack rank-driven theming (header, background, accents)
18. Band condition overlay on cards
19. Comparative stat mode
20. Signal flow mini-map on XL
21. Profile holo card export
22. Trophy shelf redesign
23. Rank transition ceremony polish
24. Skeleton loading states

---

_This system transforms Propulse from "a dashboard with equipment cards" into "a living, breathing digital ham shack that grows with you." Every login, every QSO, every achievement earned visibly evolves your world. The Ethereal tier isn't just a status -- it's a visual experience that makes other operators say "how do I get THAT?" And because it's 100% earned, when they ask, the answer is always: "Put in the work."_
