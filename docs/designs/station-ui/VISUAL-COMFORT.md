# Visual comfort and reading contract

Owner refinement, 5 September 2026 · [Foundation #219](https://github.com/crypticpy/propulse/issues/219) · [Real-operator validation W22 #194](https://github.com/crypticpy/propulse/issues/194)

The owner approved the direction and requested exact ProPulse header reuse plus better reading comfort for people wearing glasses, including people with astigmatism or color-vision differences, across dark and bright rooms. These are design requirements and validation goals. Browser simulation cannot establish an individual's visual comfort or an astigmatism-specific clinical benefit.

## Shared implementation rules

1. **Soft default surfaces and text.** Deep-space body text is `#cad2dc` on navy; midnight uses `#c4cdd7`. Daylight uses dark slate on pale, slightly warm surfaces (`#e9ece7`, `#f3f4ef`, `#edf0ea`) rather than large pure-white panels. The optional high-contrast palette also uses off-white primary text. Primary text is tested at **7:1 or better** on each palette's canvas, panel and input; secondary/status text remains at least **4.5:1**. Controls retain visible boundaries and focus indicators.
2. **Choice remains available.** Keep all four themes, comfortable density and larger text available. Higher contrast and dark mode are options; users choose what works with their own lighting, display and vision. Do not infer a medical condition or automatically lower contrast based on age.
3. **Readable text, including forms.** `StationProvider` accepts `textSize="standard" | "large" | "extra-large"` (nominal 16/18/20 px body at the default app scale). Text remains live text, uses the existing Inter/Orbitron/JetBrains Mono families and respects app/browser scaling. Helper text has a 14 px base in the library. Text-size tokens travel into dialog portals. Use adequate line height and flexible containers; do not truncate essential instructions.
4. **Meaning survives color changes.** Status notices combine words and icons. Choice groups, selected equipment and selected ports add checkmarks; active tabs use an underline. Errors include written feedback. Keep native checked/selected/invalid semantics available to assistive technology. Never make red versus green the only distinction.
5. **Quiet reading surfaces.** Do not add text glow, decorative text shadows or blur to station reading areas. Motion respects the user's reduced-motion preference. Comfortable targets stay at least 44 px at the default scale; compact density is an explicit option and coarse pointers retain comfortable targets.
6. **Shared header, consistent identity.** Review pages render the existing `Header` with its public-view behavior. A review-scoped tagline style improves its small metadata contrast. The header component and HamClock implementation are unchanged. Future global adoption should carry the same tagline readability fix through the owning shell issue/worktree.

These choices use [W3C's older-user guidance](https://www.w3.org/WAI/older-users/developing/), which connects readable text, adjustable presentation and color-independent information with older users' accessibility needs. Contrast floors follow [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Increased-spacing checks follow [WCAG text-spacing guidance](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html), and redundant state cues follow [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

## Verification contract

The maintained browser check covers both review pages and every catalog tab across four themes, including the shared header. It checks 320 px reflow with the largest local text setting, 200% root text scaling, increased letter/word/line/paragraph spacing, centered inspectors, keyboard behavior and zero page errors. It captures Chromium achromatopsia, deuteranopia, protanopia and tritanopia emulations for inspection of the selection cues. These emulations are aids for detecting reliance on color; they are not participant tests or a guarantee of comfort.

Unit tests guard primary/secondary contrast, extreme accent labels, text-size propagation to portals, native field associations and caller-provided invalid states. Browser screenshots and numerical contrast checks complement manual inspection; passing them does not certify every WCAG criterion or every assistive technology.

## Real-operator review before cutover

Extend the existing W22 protocol to include consenting participants' usual corrective lenses and preferred text/theme settings, without collecting medical diagnoses. Observe the actual tasks in a comfortable dim room and a bright room on their normal displays. Let participants choose a theme and size; ask whether text feels comfortable to read and whether they can distinguish every status and selection. Record task errors, missed labels and required adjustments, not assumptions about a diagnosis. Link each actionable finding, resolve it and retest before the final cutover gate.

The owner has approved the overall direction. Final integrated validation and broader agent rollout remain subject to the tracked dependency and review gates.
