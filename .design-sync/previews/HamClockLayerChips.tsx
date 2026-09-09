import { HamClockLayerChips } from "propulse";

/**
 * One-tap solar/weather layer chips (MUF, Aurora, DRAP, Wx) for the HamClock
 * header. Zero props; reads/toggles `useMapStore`'s `layers`. The component
 * itself is `hidden lg:flex` (it's a desktop-header control), so it needs a
 * viewport at or above Tailwind's `lg` breakpoint (1024px) to render at all.
 */
export function Default() {
  return (
    <div style={{ background: "var(--hc-bg)", padding: 16 }}>
      <HamClockLayerChips />
    </div>
  );
}
