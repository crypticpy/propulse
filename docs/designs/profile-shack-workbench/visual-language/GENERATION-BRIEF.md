# ProPulse station workbench visual-language exploration

Status: proposed visual direction for review, not implemented UI or a new approved scope. Built-in ImageGen only. Do not modify application or HamClock files.

## Shared image prompt foundation

Use case: ui-mockup. Generate one high-fidelity desktop application screenshot, landscape roughly 1536x1024 or larger, flat straight-on edge-to-edge UI, no laptop frame, no collage, no surrounding mood board. A calm, coherent evolution of the existing ProPulse ham-radio application. This is one screen in a coordinated family.

Actual source anchors: src/styles/design-tokens.css, src/styles/globals.css, src/styles/home.css, tailwind.config.js, and existing current-profile-shack.png / current-path-editor.png in ../evidence. Source files use deep-space #0a0a1a, navy/purple #1a1a2e, plasma-orange #ff6b35, signal-green #00ff88, cyan #44ddff, teal #14b8a6, Inter, Orbitron and JetBrains Mono. Home supplies quieter #141827 / #191e2e panels and muted cyan #85c4d0. These conceptual refinements preserve the brand while improving reading comfort.

Shared treatment: page base #141827, chrome #0a0a1a, raised panels #191e2e, inputs #111624, hairline slate borders, near-white #e2e8f0 primary text and readable #a0abba secondary text. Orange #ff6b35 identifies the brand and primary actions; use very dark text on orange-filled buttons. Restrained muted cyan/teal highlights connection lines and links. Green only with an explicit status label; amber labels incomplete/draft state. Never use green alone to imply electrical safety or energized hardware. No neon glow behind body text. Any atmospheric star detail stays extremely subtle in unused outer margins, never under forms/canvas. No heavy glass blur, giant gradient headings, decorative telemetry or unrequested scores.

Typography: Inter-like humanist sans for readable 16–18px body and form labels; restrained geometric Orbitron-like wordmark and page heading; JetBrains Mono-like text for callsign, frequency, units, route IDs. Avoid tiny grey text and all-monospace body. 8px field/button radii, 12px panel radii, 4/8px spacing rhythm, generous 24–32px section gaps. Clear labels outside inputs, text+icon actions, touch-sized controls, visible focus, progressive disclosure and one clear primary action per working area.

Consistent app chrome: one slim global header with orange sun/signal glyph and PROPULSE wordmark, Home / Solar Pulse / PropSphere / Tools, a small UTC readout and avatar. Local navigation is Profile / My gear / Setups / Experiments, active tab orange. Do not duplicate this navigation in multiple rows. Public visitor pages use public profile tabs instead of the private local navigation. Generic illustrative equipment and fictional profile text; no actual user's personal data, exact street location, serial number, receipts or real measured claims.

Behavior contracts: private editor always distinguishes Editing from Using in ProPulse. Draft changes stay not yet in use. Ordinary Save does not switch operating context. Public profile is a deliberate showcase, not exposed raw inventory. Connections have explicit From/To ports and cable selection, meaningful non-drag buttons. Gear can be custom/homebrew and incomplete. Unknown is not zero. Capability results are labeled Estimated with assumptions; hypothetical values are not measurements. All text and example specifications are conceptual, not verified equipment data.

## Outputs

1. 01-public-shack.png — public profile with a chosen station photo/story and simplified featured setup.
2. 02-private-workbench.png — gear shelf, port-based RF canvas, inspector, explicit editing/use states.
3. 03-connection-form.png — a readable connection editor in workbench context with From/To/cable and preview.
4. 04-add-gear-form.png — useful partial/custom inventory form with progressive technical detail.
5. 05-profile-studio.png — profile composition controls alongside audience-correct preview.

Every image gets an exact sibling .prompt.txt file. Inspect each output before selecting it. At most two generation attempts per requested output. Written behavior takes precedence over illustrative raster details.
