# Shared color treatments

Color-system epic [#1256](https://github.com/crypticpy/propulse/issues/1256), foundation [#1258](https://github.com/crypticpy/propulse/issues/1258).

`src/lib/themes/treatments.ts` owns treatment names and tint strengths. The existing token resolver supplies appearance-dependent colors; `src/components/station-ui/treatments.css` combines them. Both global and scoped station styles load this color-only stylesheet. No new theme store or component library is introduced.

```tsx
className={stationTreatmentClasses({
  tone: "warning",
  treatment: "subtle",
  interactive: true,
})}
```

The API returns static class names. Keep layout, border width, radius, padding, native roles, refs and event handlers in the existing component. Do not append competing color, opacity, overlay or filter utilities. Extend the central recipe when a new combination is justified.

| Treatment | Fill and ink | Intended use |
| --- | --- | --- |
| Subtle | Opaque tone/panel mix, 10% at rest; station reading ink | Badges, notices, status controls |
| Outline | Opaque panel, reading ink and visible boundary | Secondary/destructive actions |
| Solid | Resolved paired fill and canonical slate/off-white ink | Prominent actions and compact identity labels |

Status roles remain neutral/info/success/warning/danger. Accent carries brand/selection identity; purple is decorative and carries no implied status. Scientific bands/modes/scales remain separate domain palettes.

## Interaction and descendants

Opted-in interactive subtle/outline elements replace their fill with an absolute 20% mix on hover or selected state. States do not stack. Supported selected signals are native `aria-selected`, `aria-pressed`, `aria-checked`, or `data-selected="true"` when the owning widget supplies native semantics separately. Do not add toggle semantics to a transient action result. Keep written labels and a checkmark, underline or other shape cue; hue alone is insufficient.

Use `su-treatment-secondary` for hints inside a treatment. It uses the recipe's ink; hierarchy comes from typography. Plain `su-muted` on a stronger selected fill can fail contrast. Nested recipe roots establish their own fill/ink variables. Independent widgets inside a notice retain their own semantics and appearance.

Solid controls preserve their fitted pair through hover/selected/disabled/pending states; hover uses an underline instead of an overlay. Disabled controls retain readable text and show a dashed boundary/cursor plus native disabled state. Pending buttons retain their spinner and `aria-busy`. Focus/selection rings use station reading ink offset onto the surrounding surface. Forced-colors uses system colors.

## Contrast and supported surfaces

The numerical contract uses actual tokens for every theme, color-blind mode and supported saturation step, plus boundary/custom accents. Opaque10 reading ink clears 7:1 across the sampled matrix; opaque20 clears the 4.5:1 status/control floor. Primary prose requiring 7:1 stays on rest/base surfaces. Transparent tints and overlays are different equations and are not interchangeable with these recipes.

Solid fill fitting uses canonical slate/off-white ink with a 4.6:1 numerical margin. Passing fills remain unchanged. Otherwise the resolver chooses the smaller RGB change along the black/white blend paths that passes. This is not a claim of perceptually minimal adjustment. Raw accent tokens, saved color choices and domain palettes remain unchanged; migrate fill and ink together.

Recipes are supported on station canvas/panel/input and the documented station glass/tint contexts. Essential outer rings require these surrounding surfaces. Arbitrary images, gradients, parent opacity/filters, translucent overrides and nesting on unrelated solid-color containers require separate review. A decorative tint border is not evidence of a 3:1 essential boundary. Numerical tests, browser computed styles and rendered inspection complement one another; none replaces real-operator evidence required before epic cutover.

Existing `Badge`, `Notice`, `Button` and `ActionLink` use these treatments. Quiet actions keep their transparent link treatment. The design-system gallery includes solid labels, hints, keyboard tabs and selectable rows. Legacy UI/domain consumers migrate in subsequent bounded slices; their regression protections remain until equivalent coverage is traced.
