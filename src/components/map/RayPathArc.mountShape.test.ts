/**
 * Hop-point card placement guard (#853).
 *
 * `RayPathArc.tsx` mounts `PathPointInspector` two ways: `inline` inside
 * drei's `<Html fullscreen portal={overlayPortal}>` wrapper, while also
 * passing `portalTarget` (`GlobeView`'s `mapOverlayPortal`, an
 * `absolute inset-0` sibling div). `PathPointInspector`'s own
 * `resolveOverlayFrame(portalTarget)` computes `position: "absolute"` with
 * `left`/`top` derived from `portalTarget.getBoundingClientRect()`
 * (`src/lib/map/anchoredOverlay.ts`), on the assumption that the DOM
 * containing block for that `position: absolute` is `portalTarget` itself.
 * But `inline` skips `PathPointInspector`'s own `createPortal(overlay,
 * portalTarget)` branch, so the card is actually a DOM descendant of drei's
 * `Html` wrapper (translated to the projected globe origin), not of
 * `portalTarget`. The frame math and the real containing block only agree
 * when the drei wrapper's translated origin happens to coincide with
 * `portalTarget`'s origin -- true in the narrower PropSphere layout the bug
 * shipped against, false on the HamClock wall, where the card lands far
 * from the map.
 *
 * A real jsdom render can't express drei's CSS `transform: translate(...)`
 * offset (r3f's `<Canvas>` renders zero children under jsdom -- see the
 * `PathPointInspectorHost` comment in `MapSurface.focusHome.test.tsx`), so
 * this is a source-contract test instead: it asserts the actual prop RayPathArc
 * passes to the `<Html>`-wrapped `PathPointInspector` mount. Fix shape B
 * (agreed on #853) drops `inline` there so `PathPointInspector` takes its
 * own `createPortal` branch, making `portalTarget` the real containing
 * block the frame math already assumes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const SOURCE_PATH = resolve(REPO_ROOT, "src/components/map/RayPathArc.tsx");

function readInspectorMountBlock(): string {
  const source = readFileSync(SOURCE_PATH, "utf8");
  const htmlOpen = source.indexOf("<Html");
  const htmlClose = source.indexOf("</Html>", htmlOpen);
  if (htmlOpen === -1 || htmlClose === -1) {
    throw new Error("RayPathArc.tsx: could not locate the <Html>...</Html> mount block");
  }
  return source.slice(htmlOpen, htmlClose);
}

describe("RayPathArc PathPointInspector mount shape (#853)", () => {
  it("does not pass `inline` to PathPointInspector, so it portals into portalTarget", () => {
    const block = readInspectorMountBlock();
    expect(block).toContain("PathPointInspector");
    // Bare `inline` (boolean shorthand JSX prop) makes PathPointInspector
    // skip its own createPortal(overlay, portalTarget) branch and render as
    // a plain child of drei's translated Html wrapper instead -- the exact
    // containing-block mismatch #853 traces. Matches the shorthand form
    // only (not `inline={false}` or the substring inside another word).
    expect(block).not.toMatch(/(^|\s)inline(\s|$)/m);
  });

  it("still passes portalTarget, so the createPortal branch has a real target", () => {
    const block = readInspectorMountBlock();
    expect(block).toMatch(/portalTarget=\{portalTarget\}/);
  });
});
