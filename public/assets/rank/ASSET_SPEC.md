# Rank Visual Assets Specification

Drop your images into the appropriate `{tier}/{type}/{resolution}/` folder.
The app will load them based on the user's current rank tier.

## Rank Tiers (in order)

| Tier       | Unlock    | Color                 | Vibe                           |
| ---------- | --------- | --------------------- | ------------------------------ |
| novice     | 0 RP      | `#9CA3AF` (gray)      | Clean, minimal                 |
| apprentice | 400 RP    | `#38BDF8` (sky blue)  | Cool, emerging                 |
| journeyman | 1,500 RP  | `#34D399` (emerald)   | Earthy, capable                |
| expert     | 4,000 RP  | `#A78BFA` (violet)    | Electric, powerful             |
| master     | 10,000 RP | `#FCD34D` (gold)      | Prestigious, warm gold         |
| legendary  | 25,000 RP | `#FFD700` (pure gold) | Blazing, mythic                |
| ethereal   | 50,000 RP | `#A78BFA` (chromatic) | Aurora, otherworldly, shifting |

## Asset Types & Dimensions

### 1. Profile Background — `profile-background/640x960/`

- **Used in:** Profile page behind the sidebar card (desktop) and top card (mobile)
- **Dimensions:** 640 x 960 px (2x retina for 320px-wide card)
- **Format:** PNG (transparency OK) or WebP
- **Notes:** Dark theme. Content overlays on top, so keep bottom 60% subtle/dark. Upper portion can be more visually striking.

### 2. Profile Card Background — `profile-card-bg/640x400/`

- **Used in:** The profile sidebar card background itself
- **Dimensions:** 640 x 400 px (2x retina)
- **Format:** PNG or WebP
- **Notes:** Very subtle texture/pattern. Card has text overlaid (callsign, name, grid). Keep contrast low so text remains readable. Semi-transparent works great.

### 3. Equipment Card Background (L) — `equipment-card-bg/560x760/`

- **Used in:** Large collectible equipment cards in the Shack grid
- **Dimensions:** 560 x 760 px (2x retina for ~280x380 card)
- **Format:** PNG or WebP
- **Notes:** Playing-card aesthetic. Has a colored top accent bar, symbol art zone in center, stats at bottom. Background should enhance but not compete with the equipment symbol. Works well with subtle circuit/schematic patterns or atmospheric textures.

### 4. Equipment Card Background (M) — `equipment-card-md-bg/400x480/`

- **Used in:** Medium equipment cards (compact grid, mobile)
- **Dimensions:** 400 x 480 px (2x retina for ~200x240 card)
- **Format:** PNG or WebP
- **Notes:** Same aesthetic as L but condensed. Less detail since it's smaller.

### 5. Shack Page Background — `shack-page-bg/2560x1440/`

- **Used in:** Full-page background of the Radio Shack / Equipment page
- **Dimensions:** 2560 x 1440 px (covers most desktop viewports)
- **Format:** WebP (keep file size under 500KB)
- **Notes:** Very dark and atmospheric. Equipment cards sit on top. Think workbench, radio shack, control room. Higher tiers get more dramatic environments. Keep central area dark (< 15% brightness) for card readability.

### 6. Share Card Background — `share-card-bg/1200x630/`

- **Used in:** Canvas-rendered share cards (OG image size)
- **Dimensions:** 1200 x 630 px (exact, no scaling)
- **Format:** PNG
- **Notes:** These are drawn onto a canvas at exact pixel dimensions. Callsign renders large and centered (~120px font). Stats at bottom. Must have enough dark space for white/colored text to read. Think prestige card / gaming rank card / MTG art.

### 7. QR Card Background — `qr-card-bg/512x512/`

- **Used in:** QR code modal background (behind the QR code)
- **Dimensions:** 512 x 512 px
- **Format:** PNG
- **Notes:** QR code renders centered at 256x256. Surrounding area is decorative frame. Keep center open/dark for the QR code itself.

### 8. Avatar Frame — `avatar-frame/256x256/`

- **Used in:** Decorative frame overlay around the profile avatar
- **Dimensions:** 256 x 256 px
- **Format:** PNG with transparency (alpha channel required)
- **Notes:** Frame/border graphic that overlays the circular avatar. Center should be fully transparent (the avatar shows through). Ornate borders for higher tiers. Think gaming rank frames (like League of Legends ranked borders).

## File Naming Convention

```
{descriptive-name}.{png|webp}
```

Examples:

- `ethereal/profile-background/640x960/aurora-nebula.png`
- `master/equipment-card-bg/560x760/gold-circuit.webp`
- `legendary/avatar-frame/256x256/phoenix-frame.png`

Multiple variants per slot are fine — we'll add a selector or randomize.

## Design Guidelines Per Tier

### Novice

- Minimal, clean, dark. Subtle grid lines or faint schematics. No flashiness.

### Apprentice

- Cool blue tints. Faint signal wave patterns. Slight glow.

### Journeyman

- Green/teal accents. More defined patterns. Signal propagation motifs.

### Expert

- Violet/purple energy. Electric arcs. Visible particle trails. First tier that feels "powered up."

### Master

- Gold everywhere. Warm metallic textures. Engraved/embossed patterns. Prestigious and earned.

### Legendary

- Blazing gold + orange. Fire/plasma effects. Extreme detail. Think "final boss" energy. Filigree, ornate borders, dramatic lighting.

### Ethereal

- Chromatic/aurora palette (sky blue, emerald, violet, pink). Color-shifting, otherworldly. Northern lights, dimensional rifts, prismatic light. The most visually striking tier — should make people say "how do I get THAT?"
